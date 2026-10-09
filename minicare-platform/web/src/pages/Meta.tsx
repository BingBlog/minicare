import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { MetaCandidate, MetaGet } from '../lib/types'
import {
  DOC_STATUS,
  EVIDENCE_LABEL,
  LICENSE_COMMON,
  META_CAND_FROM_LABEL,
  META_FIELDS,
  META_ORIGIN_LABEL,
  REGION_LABEL,
  REGION_OPTIONS,
} from '../lib/labels'
import { Card, CardBody, CardHead, ErrorBox, Loading, Notice, Table } from '../components/ui'
import { MetaExtractDoc } from './MetaExtract'

/** 候选值显示文案：枚举字段（地区 / 证据级别）显示中文标签，其余字段原样显示 */
function candLabel(k: string, value: string): string {
  if (k === 'region') return REGION_LABEL[value] ?? value
  if (k === 'evidence_level') return EVIDENCE_LABEL[value] ?? value
  return value
}

/**
 * 页签：元信息解析与确认（2026-10-09 由「信息确认」+「元信息解析」合并，用户指定）
 *
 * 本页是**文档级子页面，只服务当前文档** —— 原「单文档 / 全库」切换与跨文档的
 * 「元信息总览 / 抽取覆盖率」视图已按用户要求整体删除（2026-10-09）。
 *
 * 一页两件事，上面确认、下面解析：
 *   · 上半区「信息确认」（人工）：台账 7 字段表单 —— 机器识别（映射表 / 预填 / LLM 抽取 /
 *     台账 / 常用）的结果以**候选值**形式列在字段旁，点一下即填入；必填项（年份 / 地区 /
 *     证据级别）**机器未识别到的标红「未识别到 · 需人工补充」**，保存不拦（可选操作），
 *     缺失只卡发布前检查。
 *   · 下半区「元信息解析」（机器）：LLM 按语料级共享 schema 抽取的详情（证据 / 置信度 /
 *     是否规则降级）+ schema 管理；跑完抽取会回调刷新上半区候选（`onAfterRun`）。
 *
 * 旧页签 id `metaextract` 由 `app-context` 翻译到本页（见 `nav.ts` 的 `META_EXTRACT_TAB_*`）。
 */
export function MetaPage() {
  const { doc } = useApp()
  /** 抽取完成后 +1：只刷新上半区表单的候选值（不走工作台 nonce，避免整页重挂） */
  const [bump, setBump] = useState(0)

  // 工作台在未选文档时已提前拦截，这里只是类型收窄
  if (!doc) return null

  return (
    <>
      <MetaConfirmForm doc={doc} bump={bump} />
      <MetaExtractDoc doc={doc} onAfterRun={() => setBump((x) => x + 1)} />
    </>
  )
}

/**
 * 上半区：信息确认表单（原独立页签「信息确认」，US-04）。
 *
 * **根据字段性质与文档的实际情况给出可选项**：
 *   · 枚举字段（地区 / 证据级别）→ 下拉选择（取值域与台账 / 抽取同源，非规范旧值兜底显示）；
 *   · 其余字段 → 输入框 + 候选值 chips（映射表 / 预填 / LLM 抽取 / 台账 / 常用），点一下即填入，
 *     也可以直接手动输入 —— 候选来自后端 `meta_get` 的 `candidates`（按可信度排序去重）。
 *
 * **必填（年份 / 地区 / 证据级别）机器未识别到**（既无值、也无候选）时标红
 * 「未识别到 · 需人工补充」；保存不拦，缺失由发布前检查拦截（用户 2026-10-09 指定）。
 */
function MetaConfirmForm({ doc, bump }: { doc: string; bump: number }) {
  const { go, toast, nonce } = useApp()
  const { data, error, loading } = useAsync<MetaGet>(
    () => api.metaGet(doc),
    [doc, nonce, bump],
  )
  const [form, setForm] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!data) return
    const next: Record<string, string> = {}
    for (const [k] of META_FIELDS) {
      const fromRow = data.row && data.row[k] != null ? data.row[k] : data.suggestion[k]
      next[k] = fromRow == null ? '' : String(fromRow)
    }
    setForm(next)
  }, [data])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  const src = data.field_source || {}

  /** 必填缺失的字段键 → 中文标签（通知里不出现裸 key） */
  const missingText = (data.missing_required || [])
    .map((k) => META_FIELDS.find(([f]) => f === k)?.[1] ?? k)
    .join('、')

  /** 该字段当前可给的选项：后端汇集的候选 + 前端本地常用值（许可证），去掉与当前值重复的 */
  function candidatesFor(k: string): MetaCandidate[] {
    const base: MetaCandidate[] = [...(data?.candidates?.[k] ?? [])]
    if (k === 'license') {
      for (const value of LICENSE_COMMON) base.push({ value, from: 'common' })
    }
    const cur = form[k] ?? ''
    const seen = new Set<string>()
    return base.filter((c) => {
      if (!c.value || c.value === cur || seen.has(c.value)) return false
      seen.add(c.value)
      return true
    })
  }

  async function submit() {
    try {
      const r = await api.metaPut(doc, { ...form })
      // 「醒目标注」：保存不拦必填缺失，但保存后把还缺什么再说一遍（发布前检查仍会拦）
      const missAfter = META_FIELDS.filter(([k, , required]) => required && !(form[k] ?? '').trim())
      toast(
        missAfter.length
          ? `已保存，但必填仍缺：${missAfter.map(([, label]) => label).join('、')} —— 补齐前不可发布`
          : `已保存台账字段 · 状态 ${DOC_STATUS[r.derived_status] || r.derived_status}`,
        missAfter.length ? 8000 : 4200,
      )
      go('meta', { refresh: true })
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 8000)
    }
  }

  return (
    <Card>
      <CardHead
        title={`${data.doc_id} · 信息确认`}
        meta={<>派生状态 {DOC_STATUS[data.derived_status] || data.derived_status}</>}
      />
      <CardBody>
        <div className="hint">
          机器识别（映射表 / 预填 / LLM 抽取 / 台账 / 常用）的结果作为<b>候选项</b>列在字段旁，点一下即填入；
          枚举字段（地区 / 证据级别）用下拉选择，其余也可直接手动输入。
          <br />
          <b>必填项（年份 / 地区 / 证据级别）机器未识别到的，需要人工补充</b> —— 表格中标红标出；
          保存不拦，缺失只卡发布前检查。
          <br />
          元数据要<b>冗余进每个切片</b>做检索过滤；改字段<b>不会触发重新解析</b>，只会让「切块」及下游重跑。
          <br />
          这是<b>可选操作</b> —— 不核对也能跑完六步（早期的人工「暂停点」机制已移除）。
          {data.ready ? '' : <><br />⚠ 该文档尚未登记进台账，保存时会自动补登记。</>}
        </div>
        {data.missing_required?.length ? (
          <Notice>必填缺失：{missingText} —— 机器未识别到的项需人工补充；补齐前不可发布</Notice>
        ) : null}
      </CardBody>

      <CardBody flush>
        {/* 字段列 130：容下「证据级别 + [必填] pill」（~90px），110 时差几像素被 ellipsis 截 */}
        <Table cols={[130, 200, 110, 0, 240]}>
          <thead>
            <tr>
              <th>字段</th>
              <th>当前值</th>
              <th>来源</th>
              <th>判定依据</th>
              <th>修改 / 可选项</th>
            </tr>
          </thead>
          <tbody>
            {META_FIELDS.map(([k, label, required]) => {
              const v = form[k] ?? ''
              const s = src[k] || {}
              const miss = required && (v === '' || v == null)
              const cands = candidatesFor(k)
              return (
                <tr key={k}>
                  <td>
                    {label}
                    {required ? <span className="pill danger">必填</span> : null}
                  </td>
                  {/* 当前值列：文档标题等长值换行显示完整（曾单行被截成「…」） */}
                  <td className="wrap">
                    {v !== '' ? (
                      candLabel(k, v)
                    ) : miss ? (
                      cands.length ? (
                        <span className="pill danger">缺失</span>
                      ) : (
                        <span
                          className="pill danger"
                          title="所有识别来源都给不出值，只能人工填写；保存不拦，发布前检查会拦"
                        >
                          未识别到 · 需人工补充
                        </span>
                      )
                    ) : cands.length ? (
                      '—'
                    ) : (
                      <span className="pill plain" title="机器未识别到，可留空">
                        未识别到
                      </span>
                    )}
                  </td>
                  <td className="hint">{s.origin ? META_ORIGIN_LABEL[s.origin] ?? s.origin : '—'}</td>
                  <td className="hint wrap">{(s.evidence || '').slice(0, 60)}</td>
                  <td>
                    {k === 'region' ? (
                      <select
                        className="inp"
                        style={{ width: '100%' }}
                        value={v}
                        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                      >
                        {v === '' ? <option value="">— 未选 —</option> : null}
                        {v !== '' && !(v in REGION_LABEL) ? (
                          <option value={v}>{v}（非规范）</option>
                        ) : null}
                        {REGION_OPTIONS.map(([val, lab]) => (
                          <option key={val} value={val}>
                            {lab}
                          </option>
                        ))}
                      </select>
                    ) : k === 'evidence_level' ? (
                      <select
                        className="inp"
                        style={{ width: '100%' }}
                        value={v}
                        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                      >
                        <option value="">— 未判定 —</option>
                        {v !== '' && !(v in EVIDENCE_LABEL) ? (
                          <option value={v}>{v}（非规范）</option>
                        ) : null}
                        {Object.entries(EVIDENCE_LABEL).map(([val, lab]) => (
                          <option key={val} value={val}>
                            {lab}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="inp"
                        style={{ width: '100%' }}
                        inputMode={k === 'year' ? 'numeric' : undefined}
                        value={v}
                        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                      />
                    )}
                    {cands.length ? (
                      <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {cands.map((c) => (
                          <button
                            key={`${c.from}:${c.value}`}
                            type="button"
                            className="pill plain cand"
                            title={`来源：${META_CAND_FROM_LABEL[c.from] ?? c.from}`}
                            onClick={() => setForm({ ...form, [k]: c.value })}
                          >
                            {candLabel(k, c.value)} · {META_CAND_FROM_LABEL[c.from] ?? c.from}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </CardBody>

      <CardBody>
        <div className="toolbar" style={{ margin: 0 }}>
          <button type="button" className="btn btn-primary" onClick={() => submit()}>
            保存
          </button>
        </div>
      </CardBody>
    </Card>
  )
}
