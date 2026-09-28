#!/usr/bin/env node
/**
 * 注入 prompt 结构自检（TECH-006 / PRD-006 §4）
 *
 * 用 `dump-prompt.mjs` 导出的全文做静态检查，把「评审结论」固化成可重跑的断言，
 * 防止改了注入块之后结构问题悄悄回归。检查的都是**机械可判定**的类：
 *
 *   L1 区块标记      —— 动态数据段有没有【】头（没有 = 模型分不清"数据"与"规则"）
 *   L2 事实重复/矛盾 —— 同一事实被两个渲染器各写一遍，且取值/措辞不一致
 *   L3 规则编号      —— 是否单调、是否有重复、交叉引用「规则 N」是否真的存在
 *   L4 优先级声称    —— 有几处自称"最高优先级"（都最高 = 都不最高）
 *   L5 内部语言泄漏  —— 注入块里出现的英文/单位/百分号，正是规则禁止输出给家长的
 *   L6 窗口自相矛盾  —— 「近 N 天……M 天」而 M > N 这类当众自打脸的表述
 *   L7 缓存友好度    —— 静态指令区之前插了多少易变字符（前缀缓存前缀长度）
 *   L8 体积构成      —— 各段字符数与动态块预算
 *
 * 用法：
 *   node scripts/lint-prompt.mjs                        # 自动取 docs/agent/tech 下最新的 PROMPT-*.md
 *   node scripts/lint-prompt.mjs <dump.md>              # 指定 dump 文件
 *   node scripts/lint-prompt.mjs - < dump.md           # 从 stdin 读
 *   node scripts/lint-prompt.mjs <file> --json          # 机器可读输出
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '../..')

// ---------- 读取 dump ----------
function pickLatestDump() {
  const dir = join(REPO, 'docs/agent/tech')
  const files = readdirSync(dir)
    .filter((f) => /^PROMPT-\d{8}.*\.md$/.test(f))
    .sort()
  if (!files.length) throw new Error('docs/agent/tech 下没有 PROMPT-*.md，请先跑 dump-prompt.mjs')
  return join(dir, files[files.length - 1])
}

function extractPrompt(text) {
  // dump 里正文包在 ````text ... ```` 围栏里；取第一个围栏块
  const m = text.match(/^````text\n([\s\S]*?)\n````/m)
  if (!m) throw new Error('未找到 ````text 围栏块，文件格式不符')
  return m[1]
}

const argFile = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null
const asJson = process.argv.includes('--json')
let raw
if (process.argv[2] === '-') {
  raw = readFileSync(0, 'utf8')
} else {
  const f = argFile ? resolve(argFile) : pickLatestDump()
  raw = readFileSync(f, 'utf8')
}
const prompt = extractPrompt(raw)
const promptFile = argFile || pickLatestDump()

// ---------- 区块切分 ----------
// dump 的 prompt 顺序：角色 → 上下文 → 日期 → <画像裸文本> → 【画像使用要求】
//                    → 【宝宝现状…】→ 【现状使用要求】→ 规则区 → few-shot → history
const IDX = (s) => {
  const i = prompt.indexOf(s)
  return i < 0 ? Number.POSITIVE_INFINITY : i
}
// 日期行是单行（…（北京时间）。\n），画像块紧接其后 —— 不能用「下一个【】标记」当界，
// 因为画像块自身没有头标记（这正是 L1 要报的问题）。
const iDateEnd = prompt.indexOf('（北京时间）。')
const iProfileStart = iDateEnd < 0 ? Infinity : prompt.indexOf('\n', iDateEnd) + 1

const MARKS = [
  ['identity', IDX('你是「敏宝助手」'), IDX('【当前上下文】')],
  ['ctx', IDX('【当前上下文】'), IDX('【当前日期】')],
  ['date', IDX('【当前日期】'), iProfileStart],
  ['profile', iProfileStart, IDX('【画像使用要求】')],
  ['profileUsage', IDX('【画像使用要求】'), IDX('【宝宝现状（服务端算好的结论')],
  ['perception', IDX('【宝宝现状（服务端算好的结论'), IDX('【现状使用要求】')],
  ['perceptionUsage', IDX('【现状使用要求】'), IDX('回答家长问题的流程：')],
  ['rules', IDX('回答家长问题的流程：'), IDX('【回答风格示范（few-shot')],
  ['fewshot', IDX('【回答风格示范（few-shot'), (prompt.indexOf('【历史对话') < 0 ? prompt.length : prompt.indexOf('【历史对话'))],
  ['history', (prompt.indexOf('【历史对话') < 0 ? prompt.length : prompt.indexOf('【历史对话')), prompt.length],
]
const slices = {}
for (const [name, a, b] of MARKS) {
  slices[name] = Number.isFinite(a) && Number.isFinite(b) && b > a ? [a, b] : [0, 0]
}
const seg = (name) => {
  const [a, b] = slices[name]
  return b > a ? prompt.slice(a, b) : ''
}
const profileText = seg('profile')
const perceptionText = seg('perception')
if (!profileText || !perceptionText) throw new Error('区块切分失败：画像段或现状段为空，检查 dump 格式')

const findings = []
const add = (level, code, title, detail, evidence) => findings.push({ level, code, title, detail, evidence })

// ---------- L1 区块标记 ----------
const hasProfileHeader = /^【宝宝画像/.test(profileText.trim())
if (!hasProfileHeader) {
  add('P1', 'L1', '画像段没有区块头',
    '画像数据以「旺仔，8 个月 27 天，男。…」裸行开头，唯一标记是末尾的【画像使用要求】。模型无法从文本本身判断这段是"服务端结论"还是"家长说的话/历史内容"，也不知道它何时结束。',
    profileText.split('\n')[0])
}
const dynamicHeaders = (profileText + perceptionText).match(/^【/gm) || []
if (dynamicHeaders.length < 2) {
  add('P2', 'L1', '动态数据区缺少明确的起止边界',
    `整段动态注入只有 ${dynamicHeaders.length} 个【】标记，且都出现在数据之后（使用要求）。建议用 `+'`<宝宝数据 BEGIN>…<宝宝数据 END>`'+` 之类的显式围栏，同时作为防注入的边界声明。`, '')
}

// ---------- L2 事实重复 / 矛盾 ----------
const dupDefs = [
  {
    name: '数据新鲜度 / 数据可信度',
    pick: (t) => [...t.matchAll(/数据(?:新鲜度|可信度)：([^\n。]+)/g)].map((m) => m[0].trim()),
    why: 'profile.js 渲染「数据新鲜度」、perception.js 用同一个 freshness 对象再渲染「数据可信度」；措辞不同（昨天 vs 1天前）、陈旧标注只在其中一边出现。',
  },
  {
    name: '大便性状填写率',
    pick: (t) => [...t.matchAll(/性状填写率\s*(\d+)%/g)].map((m) => m[1]),
    why: '「大便」行给一次、「覆盖率」行又给一次。',
  },
  {
    name: '近 14 天辅食记录天数',
    pick: (t) => [
      ...[...t.matchAll(/近\s*14\s*天有辅食记录\s*(\d+)\s*天/g)].map((m) => m[1]),
      ...[...t.matchAll(/辅食记录\s*(\d+)\/14\s*天/g)].map((m) => m[1]),
    ],
    why: '「日常种类」行给一次、「覆盖率」行用 分数 形式再给一次。',
  },
  {
    name: '近 30 天辅食食材种数',
    pick: (t) => [
      ...[...t.matchAll(/近\s*30\s*天辅食涉及\s*(\d+)\s*种/g)].map((m) => m[1]),
      ...[...t.matchAll(/近\s*30\s*天实际吃过\s*(\d+)\s*种/g)].map((m) => m[1]),
    ],
    why: '「喂养」行与「维持暴露」行各给一次（后者还要 30 天口径）。',
  },
  {
    name: '症状最近记录天数',
    pick: (t) => [...t.matchAll(/症状\s*(\d+)\s*天/g)].map((m) => m[1]),
    why: '画像新鲜度 + 现状数据可信度各一次；「症状结论不可用」行与 flag「关键数据陈旧」里还会再出现（视频控是否放行）。',
  },
]
const dupReport = []
const both = profileText + '\n' + perceptionText
for (const d of dupDefs) {
  const vals = d.pick(both)
  if (vals.length >= 2) {
    const uniq = [...new Set(vals)]
    dupReport.push({ name: d.name, count: vals.length, values: vals, consistent: uniq.length === 1 })
    add(uniq.length === 1 ? 'P2' : 'P1', 'L2', `事实重复：${d.name}`,
      `在注入块中共出现 ${vals.length} 次（取值 ${vals.join(' / ')}）${uniq.length === 1 ? '，取值一致但纯属冗余' : '，**取值/措辞不一致**'}。${d.why}`,
      '')
  }
}

// ---------- L3 规则编号 ----------
// 规则 id = 主号 + 可选子号（5 / 5a 是两个不同条目），不能只比主号
const ruleLines = [...prompt.matchAll(/^(\d+)([a-z]?)\)\s/gm)].map((m) => ({ id: m[1] + m[2], n: +m[1], suffix: m[2], raw: m[0].trim() }))
const ids = ruleLines.map((r) => r.id)
const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i)
if (dupIds.length) add('P2', 'L3', '规则编号重复', `重复编号：${[...new Set(dupIds)].join('、')}`, '')
// 单调性：主号必须不降；同一主号下的子号必须递增（13a 排在 13b 之后即乱序）
const orderBad = []
let lastBase = 0
const seenSuffix = {}
for (const r of ruleLines) {
  if (r.n < lastBase) orderBad.push(`${r.raw} 出现在主号 ${lastBase} 之后`)
  if (r.n === lastBase && r.suffix) {
    const prev = seenSuffix[r.n]
    if (prev && r.suffix <= prev) orderBad.push(`${r.n}${r.suffix} 排在 ${r.n}${prev} 之后`)
    seenSuffix[r.n] = r.suffix
  } else {
    lastBase = r.n
    if (r.suffix) seenSuffix[r.n] = r.suffix
  }
}
const baseNums = [...new Set(ruleLines.map((r) => r.n))]
if (orderBad.length) {
  add('P2', 'L3', '规则子编号乱序', `顺序不单调：${orderBad.join('；')}。模型按 13b → 13a 的顺序读到，容易把「日期规则」当成 13 的补充而不是独立条目。`, orderBad[0])
}
// 交叉引用：文中「规则 N」必须真的存在
const refs = [...new Set([...prompt.matchAll(/规则\s*(\d+)/g)].map((m) => +m[1]))]
const missingRefs = refs.filter((n) => !baseNums.includes(n))
if (missingRefs.length) add('P1', 'L3', '交叉引用悬空', `文中引用了不存在的规则号：${missingRefs.join('、')}`, '')
const numberOfRules = ruleLines.length

// ---------- L4 优先级声称 ----------
const prioClaims = [...prompt.matchAll(/【([^】]*最高优先级[^】]*)】/g)].map((m) => m[1])
if (prioClaims.length > 1) {
  add('P2', 'L4', `${prioClaims.length} 个区块同时自称"最高优先级"`,
    `命中：${prioClaims.join('、')}。当所有规则都最高，模型失去取舍依据；应改为一条显式的优先级声明（如「冲突时按 护栏 > 语言硬规则 > 风格规则 取舍」）。`, '')
}

// ---------- L5 内部语言泄漏 ----------
const dataBlob = profileText + '\n' + perceptionText
const leakPatterns = [
  { re: /P\d{2}\s*[-–]\s*P\d{2}|高于P\d+|低于P\d+/g, why: '分位档（规则 21/33 禁止把统计术语说给家长，但没给"家长语言"的译法）' },
  { re: /\d+(\.\d+)?%/g, why: '百分号（覆盖率/填写率/配比 —— 规则 21 禁"运维术语"）' },
  { re: /\d+\/\d+\s*天/g, why: '分数式天数（覆盖率），非家长语言' },
  { re: /\b[A-Za-z]{3,}\b/g, why: '英文单词（规则 21/33 明令禁止；2 字母缩写如「维生素 AD」是产品名，不计）' },
]
const leaks = []
for (const lp of leakPatterns) {
  const hits = [...new Set((dataBlob.match(lp.re) || []).map((s) => s.trim()))]
  if (hits.length) leaks.push({ why: lp.why, n: hits.length, sample: hits.slice(0, 8).join('、') })
  if (hits.length) leaks.length && add('P2', 'L5', '注入块使用"禁止输出给家长"的语言',
    `命中 ${hits.length} 处（${hits.slice(0, 8).join('、')}）—— ${lp.why}`, '')
}

// ---------- L6 窗口自相矛盾 ----------
// 间隙里必须排除分号/顿号，否则「近 30 天…；近 7 天有记录 8 天」会被贪婪地
// 匹配成「近 30 天…有记录 8 天」（8 > 30 不成立 → 漏报）。
const contradiction = []
for (const m of prompt.matchAll(/近\s*(\d+)\s*天[^。\n；]{0,20}?有记录\s*(\d+)\s*天/g)) {
  if (+m[2] > +m[1]) contradiction.push(m[0].trim())
}
if (contradiction.length) {
  add('P0', 'L6', '窗口口径自相矛盾', `当众自打脸：${contradiction.join('；')}。成因：SQL 统一写 `+'`>= DATE_SUB(CURDATE(), INTERVAL N DAY)`'+` 实际覆盖 N+1 天（含今天）；平时看不出来，一旦窗口名和天数并排渲染就露馅。`, contradiction[0])
}

// ---------- L7 缓存友好度 ----------
const firstVolatile = Math.min(...['ctx', 'date', 'profile', 'perception'].map((k) => slices[k][0]).filter((n) => n > 0))
const staticPrefix = prompt.slice(0, firstVolatile)
const staticChars = seg('rules').length + seg('fewshot').length
add(staticPrefix.length < 600 ? 'P1' : 'P2', 'L7', '易变内容切在静态指令之前，前缀缓存失效',
  `易变段（上下文/日期/画像/现状）从第 ${firstVolatile} 字符处就插入，可缓存前缀只有 ${staticPrefix.length} 字符（占全文 ${(staticPrefix.length / prompt.length * 100).toFixed(1)}%）。` +
  `静态模板 ${numberOfRules} 条规则 + few-shot（${staticChars} 字符）全部排在易变段之后，每轮都要重新计算。` +
  '把静态指令区提到最前、易变数据区下移到 few-shot 之后（紧贴【历史对话】），可让静态前缀稳定命中缓存，同时让数据离用户提问更近。',
  staticPrefix.trim().slice(0, 60) + '…')

// ---------- L8 体积构成 ----------
const names = [
  ['identity', '角色行'],
  ['ctx', '【当前上下文】'],
  ['date', '【当前日期】'],
  ['profile', '（画像数据，无区块头）'],
  ['profileUsage', '【画像使用要求】'],
  ['perception', '【宝宝现状…】'],
  ['perceptionUsage', '【现状使用要求】'],
  ['rules', '规则区（编号条目 + 图片 + 语言）'],
  ['fewshot', 'few-shot'],
  ['history', '【历史对话】'],
]
const sizes = names.map(([k, label]) => [label, seg(k).length])
const total = prompt.length
const dynChars = seg('ctx').length + seg('date').length + seg('profile').length + seg('perception').length + seg('profileUsage').length + seg('perceptionUsage').length
add('P3', 'L8', '体积构成',
  `全文 ${total} 字符（≈${Math.round(total / 2.6)} token）。静态模板 ${staticChars} 字符占 ${(staticChars / total * 100).toFixed(1)}%；动态数据与约束 ${dynChars} 字符占 ${(dynChars / total * 100).toFixed(1)}%。`, '')

// ---------- 输出 ----------
if (asJson) {
  console.log(JSON.stringify({ promptFile, total, sizes, dupReport, findings }, null, 2))
  process.exit(0)
}

const badge = { P0: 'P0 阻断', P1: 'P1 高', P2: 'P2 中', P3: 'P3 低' }
console.log(`\n注入 prompt 结构自检 —— ${promptFile}`)
console.log(`全文 ${total} 字符｜规则 ${numberOfRules} 条｜动态块 ${sizes[3][1] + sizes[5][1]} 字符\n`)
console.log('体积构成：')
for (const [name, n] of sizes) {
  if (n === 0) continue
  console.log(`  ${String(n).padStart(5)}  ${(n / total * 100).toFixed(1).padStart(5)}%  ${name}`)
}
console.log('')
if (dupReport.length) {
  console.log('事实重复：')
  for (const d of dupReport) console.log(`  ${d.count} 次  ${d.name}  [${d.values.join(' / ')}]${d.consistent ? '' : '  ← 取值不一致'}`)
  console.log('')
}
const order = { P0: 0, P1: 1, P2: 2, P3: 3 }
findings.sort((a, b) => order[a.level] - order[b.level])
for (const f of findings) {
  console.log(`[${badge[f.level]}] ${f.code} ${f.title}`)
  console.log(`      ${f.detail}`)
  if (f.evidence) console.log(`      证据：${String(f.evidence).slice(0, 100)}`)
  console.log('')
}
const hard = findings.filter((f) => f.level === 'P0' || f.level === 'P1').length
console.log(`合计 ${findings.length} 项（P0/P1 ${hard} 项）\n`)
process.exit(0)
