const fs = require('fs')
const path = require('path')
const cloudbase = require('@cloudbase/node-sdk')

const { VOICE_NLU_CONFIG, SUPPLEMENT_ITEMS } = require('../dist/app-config/app-config.data')

function buildSystemPrompt() {
  const parts = []
  parts.push('你是敏宝日记（minicare）的语音录入语义解析器。你的唯一任务是将用户的一句话解析为结构化的宝宝记录数据。')
  parts.push('')
  parts.push('## 支持的记录类型及字段')
  parts.push('')
  for (const rt of VOICE_NLU_CONFIG.recordTypes) {
    const fieldDescs = rt.fields.map((f) => {
      let desc = f.name
      if (f.enum) desc += `（${f.enum.join('/')}）`
      if (f.name === 'formula_ml') desc += '（奶量，单位ml，整数）'
      if (f.name === 'duration_min') desc += '（时长，分钟）'
      if (f.name === 'temperature') desc += '（体温值，如38.5）'
      if (f.name === 'complementary_food') desc += '（食物名称）'
      if (f.name === 'supplement_key') desc += '（营养素代码，从别名映射表获取）'
      if (f.name === 'supplement_name') desc += '（营养素标准名称，从别名映射表获取）'
      if (f.name === 'dose') desc += '（剂量，如"400IU"、"1袋"，可选）'
      return desc
    })
    const fieldStr = fieldDescs.length > 0 ? `：${fieldDescs.join('、')}` : ''
    parts.push(`${VOICE_NLU_CONFIG.recordTypes.indexOf(rt) + 1}. ${rt.type}（${rt.label}）${fieldStr}`)
  }
  parts.push('')
  parts.push('## 关键同义词映射规则（必须严格遵守）')
  parts.push('')
  parts.push('### 记录类型判定')
  for (const rt of VOICE_NLU_CONFIG.recordTypes) {
    if (rt.triggers.length > 0) {
      parts.push(`- ${rt.triggers.map((t) => `"${t}"`).join('、')} → ${rt.type}（${rt.label}）`)
    }
  }
  parts.push('')
  for (const rt of VOICE_NLU_CONFIG.recordTypes) {
    if (rt.synonymMap) {
      if (rt.type === 'diaper') {
        parts.push('### 尿布类型判定')
        for (const [val, aliases] of Object.entries(rt.synonymMap)) {
          parts.push(`- ${aliases.map((a) => `"${a}"`).join('、')} → diaper_type: "${val}"`)
        }
      } else if (rt.type === 'symptom') {
        parts.push('### 情绪/精神判定')
        for (const [field, mapping] of Object.entries(rt.synonymMap)) {
          const entries = Object.entries(mapping).map(([val, aliases]) => `"${aliases.join('/')}"→${val}`)
          parts.push(`- ${field}: ${entries.join(', ')}`)
        }
      }
    }
  }
  parts.push('')
  parts.push('### 营养素别名映射（必须严格遵守）')
  for (const item of SUPPLEMENT_ITEMS) {
    if (item.aliases && item.aliases.length > 0) {
      parts.push(`- ${item.aliases.map((a) => `"${a}"`).join('/')} → supplement_name: "${item.label}", supplement_key: "${item.key}"`)
    }
  }
  parts.push('')
  parts.push('### 睡眠类型区分规则')
  parts.push('- 用户说"刚睡了"/"睡了"/"入睡了"/"睡觉了"/"睡着了"/"哄睡了"（无时长） → sleep_start')
  parts.push('- 用户说"刚醒了"/"醒了"/"起来了"/"睡醒了" → sleep_end')
  parts.push('- 用户说了具体时长（如"睡了两个小时"/"午睡了40分钟"） → sleep（补录模式）')
  parts.push('')
  parts.push('## 解析规则')
  parts.push('')
  parts.push(`1. 只支持以上${VOICE_NLU_CONFIG.recordTypes.length}种记录类型，无法匹配时 recordType 为 null`)
  parts.push('2. 尽可能从用户语句中提取字段值，提取不到的字段不输出')
  parts.push('3. 时间默认为当前时间，不需要从语句中解析')
  parts.push('4. 一次只解析一条记录')
  parts.push('5. confidence: 关键字段齐全为 "high"，缺少关键字段为 "low"')
  parts.push('6. 数字提取：中文数字要转换为阿拉伯数字（"两个小时"→120分钟，"半小时"→30分钟）')
  parts.push('7. 体温提取："38度5"→38.5，"38.5度"→38.5')
  parts.push('')
  parts.push('## 输出格式')
  parts.push('')
  parts.push('严格输出一行 JSON，不要输出任何其他内容（不要 markdown 代码块、不要解释文字）：')
  parts.push('{"recordType":"类型或null","fields":{...},"confidence":"high或low","transcript":"原文"}')
  parts.push('')
  parts.push('## 示例')
  parts.push('')
  for (const rt of VOICE_NLU_CONFIG.recordTypes) {
    for (const ex of rt.examples) {
      parts.push(`输入：${ex.input}`)
      parts.push(`输出：${JSON.stringify({ recordType: ex.output.recordType, fields: ex.output.fields, confidence: ex.output.confidence, transcript: ex.input })}`)
      parts.push('')
    }
  }
  return parts.join('\n').trimEnd()
}

const SYSTEM_PROMPT = buildSystemPrompt()

const TEST_CASES = [
  // ── formula ──
  { input: '宝宝喝奶170ml', expected: { recordType: 'formula', fields: { formula_ml: 170 }, confidence: 'high' }, category: '基础' },
  { input: '喝了120毫升奶', expected: { recordType: 'formula', fields: { formula_ml: 120 }, confidence: 'high' }, category: '基础' },
  { input: '喂奶150', expected: { recordType: 'formula', fields: { formula_ml: 150 }, confidence: 'high' }, category: '基础' },
  { input: '奶量210毫升', expected: { recordType: 'formula', fields: { formula_ml: 210 }, confidence: 'high' }, category: '口语' },
  { input: '喝奶', expected: { recordType: 'formula', fields: {}, confidence: 'low' }, category: '缺字段' },

  // ── breast ──
  { input: '左边喂了15分钟', expected: { recordType: 'breast', fields: { breast_side: 'left', duration_min: 15 }, confidence: 'high' }, category: '基础' },
  { input: '母乳喂了20分钟', expected: { recordType: 'breast', fields: { duration_min: 20 }, confidence: 'high' }, category: '基础' },
  { input: '亲喂了半小时', expected: { recordType: 'breast', fields: { duration_min: 30 }, confidence: 'high' }, category: '口语' },

  // ── food ──
  { input: '吃了半碗米糊', expected: { recordType: 'food', fields: { complementary_food: '米糊' }, confidence: 'high' }, category: '基础' },
  { input: '吃了点苹果泥', expected: { recordType: 'food', fields: { complementary_food: '苹果泥' }, confidence: 'high' }, category: '基础' },
  { input: '吃了一根香蕉', expected: { recordType: 'food', fields: { complementary_food: '香蕉' }, confidence: 'high' }, category: '口语' },
  { input: '宝宝吃了点东西', expected: { recordType: 'food', fields: {}, confidence: 'low' }, category: '缺字段' },

  // ── diaper ──
  { input: '拉了', expected: { recordType: 'diaper', fields: { diaper_type: 'dirty' }, confidence: 'high' }, category: '基础' },
  { input: '尿了', expected: { recordType: 'diaper', fields: { diaper_type: 'wet' }, confidence: 'high' }, category: '基础' },
  { input: '又尿又拉', expected: { recordType: 'diaper', fields: { diaper_type: 'mixed' }, confidence: 'high' }, category: '基础' },
  { input: '拉粑粑了', expected: { recordType: 'diaper', fields: { diaper_type: 'dirty' }, confidence: 'high' }, category: '口语' },
  { input: '尿布是干的', expected: { recordType: 'diaper', fields: { diaper_type: 'dry' }, confidence: 'high' }, category: '口语' },

  // ── sleep（补录） ──
  { input: '宝宝睡了两个小时', expected: { recordType: 'sleep', fields: { duration_min: 120 }, confidence: 'high' }, category: '基础' },
  { input: '睡了一个半小时', expected: { recordType: 'sleep', fields: { duration_min: 90 }, confidence: 'high' }, category: '基础' },
  { input: '午睡了40分钟', expected: { recordType: 'sleep', fields: { duration_min: 40 }, confidence: 'high' }, category: '口语' },

  // ── sleep_start（开始睡觉）── 新增
  { input: '刚睡了', expected: { recordType: 'sleep_start', fields: {}, confidence: 'high' }, category: '新增' },
  { input: '刚睡着了', expected: { recordType: 'sleep_start', fields: {}, confidence: 'high' }, category: '新增' },
  { input: '入睡了', expected: { recordType: 'sleep_start', fields: {}, confidence: 'high' }, category: '新增' },
  { input: '睡觉了', expected: { recordType: 'sleep_start', fields: {}, confidence: 'high' }, category: '新增' },
  { input: '哄睡了', expected: { recordType: 'sleep_start', fields: {}, confidence: 'high' }, category: '新增' },

  // ── sleep_end（醒来）── 新增
  { input: '刚醒了', expected: { recordType: 'sleep_end', fields: {}, confidence: 'high' }, category: '新增' },
  { input: '醒了', expected: { recordType: 'sleep_end', fields: {}, confidence: 'high' }, category: '新增' },
  { input: '起来了', expected: { recordType: 'sleep_end', fields: {}, confidence: 'high' }, category: '新增' },
  { input: '睡醒了', expected: { recordType: 'sleep_end', fields: {}, confidence: 'high' }, category: '新增' },

  // ── temperature ──
  { input: '体温38度5', expected: { recordType: 'temperature', fields: { temperature: 38.5 }, confidence: 'high' }, category: '基础' },
  { input: '发烧了39度', expected: { recordType: 'temperature', fields: { temperature: 39 }, confidence: 'high' }, category: '基础' },
  { input: '38.5度', expected: { recordType: 'temperature', fields: { temperature: 38.5 }, confidence: 'high' }, category: '口语' },

  // ── symptom ──
  { input: '宝宝今天很开心', expected: { recordType: 'symptom', fields: { mood: 'happy' }, confidence: 'high' }, category: '基础' },
  { input: '宝宝一直哭闹', expected: { recordType: 'symptom', fields: { mood: 'crying' }, confidence: 'high' }, category: '基础' },
  { input: '宝宝没精神', expected: { recordType: 'symptom', fields: { spirit: 'low' }, confidence: 'high' }, category: '基础' },
  { input: '宝宝蔫蔫的', expected: { recordType: 'symptom', fields: { spirit: 'low' }, confidence: 'high' }, category: '口语' },

  // ── supplement（营养素/补充剂）── 新增
  { input: '补充了D3', expected: { recordType: 'supplement', fields: { supplement_key: 'vitD3', supplement_name: '维生素D3' }, confidence: 'high' }, category: '新增' },
  { input: '吃了妈咪爱', expected: { recordType: 'supplement', fields: { supplement_key: 'probiotic', supplement_name: '益生菌' }, confidence: 'high' }, category: '新增' },
  { input: '喝了铁', expected: { recordType: 'supplement', fields: { supplement_key: 'iron', supplement_name: '铁剂' }, confidence: 'high' }, category: '新增' },
  { input: '补充了AD', expected: { recordType: 'supplement', fields: { supplement_key: 'vitAD', supplement_name: '维生素AD' }, confidence: 'high' }, category: '新增' },
  { input: '吃了藻油', expected: { recordType: 'supplement', fields: { supplement_key: 'dha', supplement_name: 'DHA' }, confidence: 'high' }, category: '新增' },
  { input: '补充了钙', expected: { recordType: 'supplement', fields: { supplement_key: 'calcium', supplement_name: '钙剂' }, confidence: 'high' }, category: '新增' },
  { input: '吃了伊可新', expected: { recordType: 'supplement', fields: { supplement_key: 'vitAD', supplement_name: '维生素AD' }, confidence: 'high' }, category: '新增-别名' },
  { input: '补锌', expected: { recordType: 'supplement', fields: { supplement_key: 'zinc', supplement_name: '锌剂' }, confidence: 'high' }, category: '新增-别名' },
  { input: '吃了维C', expected: { recordType: 'supplement', fields: { supplement_key: 'vitC', supplement_name: '维生素C' }, confidence: 'high' }, category: '新增-别名' },
  { input: '喝了乳糖酶', expected: { recordType: 'supplement', fields: { supplement_key: 'lactase', supplement_name: '乳糖酶' }, confidence: 'high' }, category: '新增-别名' },
  { input: '补充了D3 400单位', expected: { recordType: 'supplement', fields: { supplement_key: 'vitD3', supplement_name: '维生素D3', dose: '400单位' }, confidence: 'high' }, category: '新增-带剂量' },

  // ── null（无效输入）──
  { input: '今天天气真好', expected: { recordType: null, fields: {}, confidence: 'low' }, category: '无效' },
  { input: '你好', expected: { recordType: null, fields: {}, confidence: 'low' }, category: '无效' },
]

function parseResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0])
  } catch { return null }
}

function evaluateResult(actual, expected) {
  if (!actual) return { pass: false, reason: 'JSON解析失败' }
  if (expected.recordType === null) {
    if (actual.recordType !== null) return { pass: false, reason: `期望null，得到${actual.recordType}` }
    return { pass: true, reason: 'OK' }
  }
  if (actual.recordType !== expected.recordType) return { pass: false, reason: `recordType: 期望${expected.recordType}，得到${actual.recordType}` }
  for (const [key, expectedVal] of Object.entries(expected.fields)) {
    const actualVal = actual.fields?.[key]
    if (actualVal === undefined || actualVal === null) return { pass: false, reason: `字段${key}缺失` }
    if (actualVal !== expectedVal) return { pass: false, reason: `${key}: 期望${expectedVal}，得到${actualVal}` }
  }
  if (expected.confidence && actual.confidence !== expected.confidence) return { pass: 'partial', reason: `confidence: 期望${expected.confidence}，得到${actual.confidence}` }
  return { pass: true, reason: 'OK' }
}

async function callWithRetry(model, input, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await model.generateText({ model: 'hunyuan-turbos-latest', messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: input }], temperature: 0.1 })
    } catch (err) {
      const msg = err.message || ''
      if ((msg.includes('429') || msg.includes('rate')) && attempt < maxRetries) {
        const delay = 2000 * Math.pow(2, attempt)
        console.log(`   ⏳ 429限流，${delay}ms 后重试 (${attempt + 1}/${maxRetries})...`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
}

async function runTest() {
  const envId = process.env.TCB_AI_ENV_ID || process.env.TCB_ENV_ID
  const secretId = process.env.TCB_AI_SECRET_ID || process.env.TCB_SECRET_ID
  const secretKey = process.env.TCB_AI_SECRET_KEY || process.env.TCB_SECRET_KEY
  if (!envId || !secretId || !secretKey) { console.error('缺少环境变量'); process.exit(1) }

  console.log(`使用 AI 环境: ${envId}`)
  const app = cloudbase.init({ env: envId, secretId, secretKey })
  const ai = app.ai()
  const model = ai.createModel('hunyuan-exp')

  let total = 0, passed = 0, partial = 0, failed = 0
  const failures = [], byType = {}, allRecords = []
  const startTime = new Date()

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i]
    total++
    const typeKey = tc.expected.recordType || 'null'
    const caseStart = Date.now()

    try {
      const result = await callWithRetry(model, tc.input)
      const elapsed = Date.now() - caseStart
      const rawText = result.text
      const parsed = parseResponse(rawText)
      const evalResult = evaluateResult(parsed, tc.expected)

      if (!byType[typeKey]) byType[typeKey] = { total: 0, passed: 0, failed: 0 }
      byType[typeKey].total++

      const statusIcon = evalResult.pass === true ? '✅' : evalResult.pass === 'partial' ? '⚠️' : '❌'
      if (evalResult.pass === true) { passed++; byType[typeKey].passed++ }
      else if (evalResult.pass === 'partial') { partial++; byType[typeKey].passed++ }
      else { failed++; byType[typeKey].failed++; failures.push({ input: tc.input, expected: tc.expected, actual: parsed, reason: evalResult.reason, category: tc.category }) }

      allRecords.push({ index: i + 1, input: tc.input, category: tc.category, expected: tc.expected, rawResponse: rawText, parsed, pass: evalResult.pass === true ? 'PASS' : evalResult.pass === 'partial' ? 'PARTIAL' : 'FAIL', reason: evalResult.reason, elapsedMs: elapsed })
      console.log(`${statusIcon} [${typeKey}] (${i + 1}/${TEST_CASES.length}) "${tc.input}" → ${evalResult.reason} (${elapsed}ms)`)
      if (evalResult.pass !== true && parsed) console.log(`   实际输出: ${JSON.stringify(parsed)}`)
    } catch (err) {
      const elapsed = Date.now() - caseStart
      failed++
      if (!byType[typeKey]) byType[typeKey] = { total: 0, passed: 0, failed: 0 }
      byType[typeKey].total++; byType[typeKey].failed++
      failures.push({ input: tc.input, expected: tc.expected, actual: null, reason: err.message, category: tc.category })
      allRecords.push({ index: i + 1, input: tc.input, category: tc.category, expected: tc.expected, rawResponse: null, parsed: null, pass: 'ERROR', reason: err.message, elapsedMs: elapsed })
      console.log(`❌ [${typeKey}] (${i + 1}/${TEST_CASES.length}) "${tc.input}" → 调用失败: ${err.message}`)
    }
    await new Promise((r) => setTimeout(r, 800))
  }

  const endTime = new Date()
  const fullRate = (passed / total * 100).toFixed(1)
  const passRate = ((passed + partial) / total * 100).toFixed(1)

  console.log('\n' + '='.repeat(60))
  console.log('📊 测试结果汇总')
  console.log('='.repeat(60))
  console.log(`总用例: ${total}  ✅ 通过: ${passed}  ⚠️ 部分通过: ${partial}  ❌ 失败: ${failed}`)
  console.log(`准确率: ${passRate}%（完全匹配: ${fullRate}%）`)
  console.log(`耗时: ${Math.round((endTime - startTime) / 1000)}s`)

  console.log('\n📈 按类型统计:')
  for (const [type, stats] of Object.entries(byType)) {
    console.log(`  ${type.padEnd(14)} ${stats.passed}/${stats.total} (${(stats.passed / stats.total * 100).toFixed(0)}%)`)
  }

  if (failures.length > 0) {
    console.log('\n❌ 失败详情:')
    for (const f of failures) {
      console.log(`  [${f.category}] "${f.input}"`)
      console.log(`  期望: ${JSON.stringify(f.expected)}`)
      console.log(`  实际: ${JSON.stringify(f.actual)}`)
      console.log(`  原因: ${f.reason}\n`)
    }
  }

  const reportDir = path.join(__dirname, '..', 'test-reports')
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })
  const timestamp = startTime.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const reportPath = path.join(reportDir, `nlu-test-${timestamp}.json`)
  fs.writeFileSync(reportPath, JSON.stringify({ summary: { model: 'hunyuan-turbos-latest', provider: 'hunyuan-exp', envId, testTime: startTime.toISOString(), durationSec: Math.round((endTime - startTime) / 1000), total, passed, partial, failed, accuracyFull: `${fullRate}%`, accuracyWithPartial: `${passRate}%`, byType: Object.fromEntries(Object.entries(byType).map(([t, s]) => [t, { ...s, rate: `${(s.passed / s.total * 100).toFixed(0)}%` }])) }, records: allRecords, failures }, null, 2), 'utf-8')
  console.log(`\n📝 测试报告已保存: ${reportPath}`)
}

runTest().catch(console.error)
