/**
 * 就医记录·单据解析库（lib/parse-medical.js，PRD-017 / TECH-035）
 *
 * 职责：fileIds[] → 逐图独立解析（并发 3）→ results[]
 *   fileId → storage.js 拉临时 URL → fetch → base64 → messages 请求 → JSON 解析 → 程序兜底归一
 *
 * 与对话链路完全隔离：不 import runtime.js 的 query/SDK；仅读
 * process.env.ANTHROPIC_BASE_URL（由 initAgentRuntime 写入 = 进程内 wire-proxy，
 * 自带 DNS 缓存 / 连接重试 / thinking:disabled 注入；wire-proxy 启动失败时
 * runtime 已自动回退直连官方端点，本模块零感知）。
 *
 * 实测锚点（2026-10-12，5 张旺仔实样图）：单图 1.7~5.1s，并发 3 总 7.3s；
 * 直调格式 = x-api-key + anthropic-version（无需 SDK/CLI）。
 */
import { getTempDownloadUrl } from './storage.js'
import { ANTHROPIC_ENDPOINT, MODEL_VISION } from './deepseek.js'

export const CONCURRENCY = 3
export const PER_IMAGE_TIMEOUT_MS = 30_000
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 单图 10MB 上限（M06 同款）
const MAX_TOKENS = 4096
const MAX_ATTEMPTS = 2 // 失败（网络/非2xx/JSON 不合法）重试 1 次

export const DOC_TYPES = ['outpatient_record', 'prescription', 'lab_report', 'imaging_report', 'other']

/** 单据解析 prompt（TECH-035 §2.3：不猜原则 7 条 + 输出 schema） */
const PARSE_PROMPT = `这是一张医疗单据的拍照或截图（可能为：门诊病历/诊断证明、处方笺、检验报告、影像检查报告）。
请识别单据类型并解析为 JSON。

规则：
1. 图面上没有的信息一律输出 null，禁止推测补全（不补全地址、不编造诊断、不猜想数值）；
2. 模糊/遮挡/无法确认的文字：该字段输出 null 并加入 lowConfidenceFields；
3. 数值、单位、参考范围原样抄录（不做换算、不四舍五入）；
4. 相对时间表述（如"三天后复查"）不换算为日期，原文保留在 advice；
5. 检验项目异常标记：优先采用图面标记（↑/↓/H/L）；图面无标记时按图面参考范围做数值比较输出 high/low；
6. diagnosis 仅收录图中明确写出的诊断结论；科室、门诊类别不属于诊断；
7. 手机截图（带状态栏/按钮）请忽略界面元素，只解析报告主体。

输出结构（按实际单据类型填充；无关字段省略）：
{ "docType": "outpatient_record|prescription|lab_report|imaging_report|other",
  "hospital": null, "visitDate": null, "visitTime": null, "doctor": null, "department": null,
  "chiefComplaint": null, "presentIllness": null, "pastHistory": null, "physicalExam": null,
  "diagnosis": null, "advice": null,
  "medications": [ {"name":"","spec":"","quantity":"","dose":"","frequency":"","days":"","route":""} ],
  "sampleType": null, "reportedAt": null,
  "items": [ {"name":"","abbr":"","value":"","unit":"","refRange":"","flag":"high|low|normal|null"} ],
  "examName": null, "findings": null, "conclusion": null,
  "lowConfidenceFields": [] }
只输出 JSON，不要任何解释。`

/** 从模型输出中剥离 markdown 围栏，取首个 { 到末个 } */
export function stripJsonFence(text) {
  if (typeof text !== 'string') return ''
  const s = text.indexOf('{')
  const e = text.lastIndexOf('}')
  return s >= 0 && e > s ? text.slice(s, e + 1) : text
}

/** diagnosis 归一为数组：字符串按分隔符拆（模型偶发输出字符串而非数组） */
function normalizeDiagnosis(v) {
  if (v == null) return null
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
  if (typeof v === 'string') {
    return v.split(/[、;；\n]+|，|,\s*/).map((x) => x.trim()).filter(Boolean)
  }
  return null
}

/** 科室词特征：以 门诊/科/科别 结尾且长度 ≤6（实测案例："感染门诊" 混入 diagnosis） */
function looksLikeDepartment(s) {
  return typeof s === 'string' && s.length <= 6 && /(门诊|科室|科别|科)$/.test(s)
}

/**
 * 程序侧兜底归一（TECH-035 §2.4，不依赖模型自觉）：
 * docType 白名单 / 结构形状 / 科室混入诊断 / 空产出 / 药品缺用量
 */
export function normalizeParsed(parsed) {
  const data = {}
  const low = new Set()

  const rawLow = parsed?.lowConfidenceFields
  if (Array.isArray(rawLow)) rawLow.forEach((f) => typeof f === 'string' && low.add(f))

  for (const [k, v] of Object.entries(parsed || {})) {
    if (k === 'docType' || k === 'lowConfidenceFields' || k === 'confidence') continue
    data[k] = v === undefined ? null : v
  }

  // docType 白名单（非法 → other）
  let docType = typeof parsed?.docType === 'string' ? parsed.docType : 'other'
  if (!DOC_TYPES.includes(docType)) docType = 'other'
  data.docType = docType

  // diagnosis：数组化 + 科室词移出
  data.diagnosis = normalizeDiagnosis(data.diagnosis)
  if (Array.isArray(data.diagnosis)) {
    const kept = []
    for (const item of data.diagnosis) {
      if (looksLikeDepartment(item)) {
        if (!data.department) data.department = item
        low.add('diagnosis')
      } else {
        kept.push(item)
      }
    }
    data.diagnosis = kept.length ? kept : null
  }

  // medications / items：非数组 → null；药品缺剂量 → 低置信
  if (data.medications != null && !Array.isArray(data.medications)) data.medications = null
  if (Array.isArray(data.medications)) {
    const valid = data.medications.filter((m) => m && typeof m === 'object' && (m.name || m.spec))
    data.medications = valid.length ? valid : null
    if (data.medications?.some((m) => !m.dose && !m.frequency)) low.add('medications')
  }
  if (data.items != null && !Array.isArray(data.items)) data.items = null

  // 空产出判定（除元字段外全部空）
  const businessKeys = Object.keys(data).filter((k) => k !== 'docType')
  const isEmpty = businessKeys.every((k) => {
    const v = data[k]
    if (v == null) return true
    if (Array.isArray(v)) return v.length === 0
    if (typeof v === 'string') return v.trim() === ''
    return false
  })
  if (isEmpty) {
    data._empty = true
    return { docType, confidence: 'low', lowConfidenceFields: [...low], data }
  }
  if (data._empty) delete data._empty

  const confidence = low.size > 0 ? 'low' : (parsed?.confidence === 'low' ? 'low' : 'high')
  return { docType, confidence, lowConfidenceFields: [...low], data }
}

/** 单图拉取：fileID → base64（10MB 上限） */
async function fetchImageBase64(config, fileId) {
  const item = await getTempDownloadUrl(config.envId, config.tcbCredentials, fileId)
  if (!item?.tempFileURL) throw new Error('temp url unavailable')
  const resp = await fetch(item.tempFileURL)
  if (!resp.ok) throw new Error(`image fetch HTTP ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error('image too large')
  return buf.toString('base64')
}

/** 单次模型调用（attempt）→ 归一结果；超时/网络/非2xx/JSON 异常统一抛错
 *  （export 供测试脚本 scripts/test-parse-medical.mjs 的 fixtures 模式复用） */
export async function callVisionOnce(config, baseUrl, b64) {
  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.deepSeekKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL_VISION,
      max_tokens: MAX_TOKENS,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: PARSE_PROMPT },
        ],
      }],
    }),
    signal: AbortSignal.timeout(PER_IMAGE_TIMEOUT_MS),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    const err = new Error(`vision HTTP ${resp.status}`)
    err.code = resp.status === 429 || resp.status >= 500 ? 'vision_retryable' : 'vision_error'
    err.httpStatus = resp.status
    err.body = text.slice(0, 200)
    throw err
  }
  const json = await resp.json()
  const text = json?.content?.[0]?.text ?? ''
  const stripped = stripJsonFence(text)
  if (!stripped) {
    const err = new Error('empty model output')
    err.code = 'json_parse_failed'
    throw err
  }
  let parsed
  try {
    parsed = JSON.parse(stripped)
  } catch {
    const err = new Error('model output is not valid JSON')
    err.code = 'json_parse_failed'
    throw err
  }
  return normalizeParsed(parsed)
}

/** 单图解析（含重试 1 次）；不抛出——失败转为 {ok:false,error} */
export async function parseOneImage(config, fileId, baseUrl) {
  let b64
  try {
    b64 = await fetchImageBase64(config, fileId)
  } catch (e) {
    return { fileId, ok: false, error: { code: 'fetch_failed', message: '该图片无法读取' } }
  }

  let lastErr = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const r = await callVisionOnce(config, baseUrl, b64)
      return { fileId, ok: true, ...r }
    } catch (e) {
      lastErr = e
      // 不可重试的鉴权/请求错误（非 429/5xx）直接终止
      if (e?.code === 'vision_error') break
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 300 * attempt))
    }
  }

  const name = lastErr?.name || ''
  const code = name === 'TimeoutError' || name === 'AbortError'
    ? 'vision_timeout'
    : (lastErr?.code === 'json_parse_failed' ? 'json_parse_failed'
      : (lastErr?.code === 'vision_error' ? 'vision_error' : 'vision_error'))
  const messages = {
    vision_timeout: '识别超时',
    json_parse_failed: '识别结果异常',
    vision_error: '识别服务暂时不可用',
  }
  console.error(`[parse-medical] ${fileId.slice(-36)} 失败(${code}): ${lastErr?.message || lastErr}`)
  return { fileId, ok: false, error: { code, message: messages[code] || '识别失败' } }
}

/**
 * 主入口：并发 3 逐图解析（结果保持输入顺序，失败隔离不中断）
 * @param {string[]} fileIds 1~6 张
 * @param {{ config: object }} opts
 */
export async function parseMedicalImages(fileIds, { config }) {
  const baseUrl = process.env.ANTHROPIC_BASE_URL || ANTHROPIC_ENDPOINT
  const results = new Array(fileIds.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, fileIds.length) }, async () => {
    for (;;) {
      const i = cursor++
      if (i >= fileIds.length) return
      results[i] = await parseOneImage(config, fileIds[i], baseUrl)
    }
  })
  await Promise.all(workers)
  return results
}
