/**
 * 注入 prompt 全文导出（生产实测）
 *
 * 运行：
 *   cd agent-poc
 *   NODE_OPTIONS= node scripts/dump-prompt.mjs --prod                       # 默认生产库「记录最多的旺仔」
 *   NODE_OPTIONS= node scripts/dump-prompt.mjs <baby_id> --prod --out x.md  # 指定宝宝 + 落盘
 *
 * 定位：把**真实进模型的那一整段 systemPrompt** 逐字导出，用于核对「助手到底拿到了哪些前提」。
 * 与 `perception-preview.mjs` 的分工：那个摊开**每个数字**（对账用），这个摊开**最终文本**（注入用）。
 *
 * 与线上完全同源：调用的是 `src/prompts/system.js::buildSystemPrompt()` 本体 +
 * `src/lib/profile.js` / `src/lib/perception.js`，不复制任何渲染逻辑。
 * history 传空数组 —— 等价于新会话第一轮（历史对话只在多轮时才追加）。
 *
 * 只读：不写库、不改业务代码。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLocalEnv } from '../src/lib/env.js'

const ARGS = process.argv.slice(2)
const PROD = ARGS.includes('--prod')
const outIdx = ARGS.indexOf('--out')
const OUT = outIdx >= 0 ? ARGS[outIdx + 1] : null
const positional = ARGS.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1))
// 生产库有 3 条同名「旺仔」，名字 LIKE 会取错人 —— --prod 不给 id 时用已核实的本人 id
const PROD_WANGZAI = 'a54c8980-2aac-473c-a26f-a150fce7ec70'
const TARGET = positional[0] || (PROD ? PROD_WANGZAI : '旺仔')
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

if (PROD) {
  const KB_ENV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../minicare-platform/api/.env')
  for (const line of readFileSync(KB_ENV, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].trim()
  }
  process.env.DB_NAME = 'minicare-cloud-6gqledlle0132cbe'
}

loadLocalEnv()
const { loadConfig } = await import('../src/config.js')
const { initDb, closeDb } = await import('../src/lib/db.js')
const { getBabyProfile, renderProfileBlock, cstToday } = await import('../src/lib/profile.js')
const { getPerception, renderPerceptionBlock, resetFlagGate } = await import('../src/lib/perception.js')
const { buildSystemPrompt } = await import('../src/prompts/system.js')
const mysql = (await import('mysql2/promise')).default

const cfg = loadConfig()
initDb(cfg)
const db = mysql.createPool({
  host: cfg.db.host,
  port: cfg.db.port,
  database: cfg.db.name,
  user: cfg.db.user,
  password: cfg.db.password,
  timezone: '+08:00',
  dateStrings: true,
})
await db.query("SET time_zone = '+08:00'")

let baby
if (UUID_RE.test(TARGET)) {
  ;[[baby]] = await db.query('SELECT * FROM baby_profile WHERE id = ?', [TARGET])
} else {
  const [cands] = await db.query(
    'SELECT * FROM baby_profile WHERE name LIKE ? AND deleted_at IS NULL',
    [`%${TARGET}%`],
  )
  if (cands.length > 1) {
    console.error(`名字「${TARGET}」匹配到 ${cands.length} 条，请改用 baby_id：`)
    for (const c of cands) console.error(`  ${c.id}  ${c.name}  ${c.birth_date}`)
    process.exit(1)
  }
  baby = cands[0]
}
if (!baby) {
  console.error('未找到宝宝：' + TARGET)
  process.exit(1)
}

const today = cstToday()
const profile = await getBabyProfile(baby.id)
if (!profile) {
  console.error('画像构建失败（DB 不可用？）')
  process.exit(1)
}
const perception = await getPerception(baby.id, { profile })
if (!perception) {
  console.error('现状感知构建失败')
  process.exit(1)
}

// ctx 形状与 minicare-server::buildCtx 一致：base64{ userId, familyId, babyId }
const ctx = {
  userId: baby.created_by ?? null,
  familyId: baby.family_id ?? null,
  babyId: baby.id,
}

// ── 组装 ────────────────────────────────────────────────────────────────
// 实际注入：system.js 内部对 perception 传了 {} → 启用频控（第一轮）
resetFlagGate(baby.id)
const FULL = buildSystemPrompt(ctx, [], profile, perception)
const PERC_ACTUAL = renderPerceptionBlock(perception, {}).block
// 全量信号版：不带频控，把每个 flag 都摊出来看
const PERC_ALL = renderPerceptionBlock(perception)
resetFlagGate(baby.id)
const T1 = renderPerceptionBlock(perception, { enabled: true })
const T2 = renderPerceptionBlock(perception, { enabled: true })
resetFlagGate(baby.id)

// 静态模板：ctx/profile/perception 全空 → 只剩「角色 + 日期 + 规则 + few-shot」
const TEMPLATE = buildSystemPrompt(null, [], null, null)
const dateLine = (TEMPLATE.match(/^【当前日期】.*$/m) || [''])[0]
const STATIC_LEN = TEMPLATE.length - dateLine.length - 1

const PROFILE_BLOCK = renderProfileBlock(profile)
const S = {
  full: FULL.length,
  template: STATIC_LEN,
  ctx: `【当前上下文】familyId=${ctx.familyId} babyId=${ctx.babyId}（宝宝档案可在数据接入后查询）`.length,
  date: dateLine.length,
  profile: PROFILE_BLOCK.length,
  perceptionActual: PERC_ACTUAL.length,
  perceptionAll: PERC_ALL.length,
  fewshot: (TEMPLATE.match(/【回答风格示范[\s\S]*$/m) || [''])[0].length,
}
const pct = (n) => `${((n / S.full) * 100).toFixed(1)}%`
const STRENGTH_TAG = { strong: '强', medium: '中', weak: '弱', intercept: '拦截' }

const lines = []
const P = (s = '') => lines.push(s)

P(`# 旺仔（生产环境）注入 agent 的 systemPrompt 全文`)
P()
P(`> 生成时间：${new Date().toISOString().replace('T', ' ').slice(0, 19)}（UTC）｜北京时间今天 ${today}`)
P(`> 数据源：\`${cfg.db.name}\` @ ${cfg.db.host}（**生产库**）`)
P(`> 宝宝：${profile.basic.name}｜出生 ${profile.basic.birthDate}｜${profile.basic.ageText}｜baby_id \`${baby.id}\``)
P(`> 生成方式：直接调用线上同一份 \`buildSystemPrompt()\` + \`getBabyProfile()\` + \`getPerception()\`，逐字导出，未做任何改写`)
P(`> history 传空数组 = 新会话第一轮（多轮对话会额外追加【历史对话】段）`)
P()
P(`## 一、体积构成（每轮固定成本）`)
P()
P(`| 组成 | 字符数 | 占全文 | 说明 |`)
P(`|---|---:|---:|---|`)
P(`| 静态模板（角色 + 规则 1–36 + few-shot 3 例） | ${S.template} | ${pct(S.template)} | 与宝宝无关，恒定 |`)
P(`| ├ few-shot 示范（含其中） | ${S.fewshot} | ${pct(S.fewshot)} | 3 个格式样例 |`)
P(`| 【当前日期】 | ${S.date} | ${pct(S.date)} | 北京时间基准 |`)
P(`| 【当前上下文】 | ${S.ctx} | ${pct(S.ctx)} | familyId / babyId（模型不应复述） |`)
P(`| 【宝宝画像】（信号 ①–⑤ 组） | ${S.profile} | ${pct(S.profile)} | profile.js |`)
P(`| 【宝宝现状】（信号组 A–J + 判定链） | ${S.perceptionActual} | ${pct(S.perceptionActual)} | perception.js，**含频控** |`)
P(`| **合计（实际进模型）** | **${S.full}** | 100% | ≈ ${Math.round(S.full / 2.6)} token（粗估） |`)
P()
P(`对照：现状段**不做频控**时 ${S.perceptionAll} 字符（多 ${S.perceptionAll - S.perceptionActual}；差额＝被频控压掉的非强项 flag）。`)
P()
P(`## 二、完整 systemPrompt 全文（逐字，实际注入）`)
P()
P('````text')
P(FULL)
P('````')
P()
P(`## 三、附录 A：现状段「全量信号」版（关闭频控，看全部 flag）`)
P()
P(`线上默认启用频控（单轮最多 1 条非强项 / 同 flag 7 天去重 / 强项豁免），所以第二节里非强项 flag 只会出现 1 条。`)
P(`下面是把频控关掉后的同一段，用于看清**当前一共有哪些信号**：`)
P()
P('````text')
P(PERC_ALL)
P('````')
P()
P(`## 四、附录 B：频控前后对照（同一时刻连续两轮）`)
P()
P(`| 轮次 | 实际给出的 flag |`)
P(`|---|---|`)
P(`| 第 1 轮 | ${T1.flags.map((f) => `${f.label}[${STRENGTH_TAG[f.strength] || f.strength}]`).join('；') || '无'} |`)
P(`| 第 2 轮（紧接着） | ${T2.flags.map((f) => `${f.label}[${STRENGTH_TAG[f.strength] || f.strength}]`).join('；') || '无'} |`)
P()
P(`强项（\`strong\`）每轮都给；非强项每轮 1 条、7 天内不重复 —— 所以第 2 轮的非强项换了人，强项不变。`)
P()
P(`## 五、附录 C：系统识别到的全部 flag（含未进本轮注入的）`)
P()
P(`| 强度 | 判定 | 说明 | key |`)
P(`|---|---|---|---|`)
if (!perception.flags.length) P(`| — | 无异常 | — | — |`)
for (const f of perception.flags) {
  P(`| ${STRENGTH_TAG[f.strength] || f.strength} | ${f.label} | ${f.detail} | \`${f.key}\` |`)
}
P()
P(`## 六、附录 D：判定路径（PRD §4.4 五级链）`)
P()
P(`- 命中路径：\`${perception.route.route}\``)
P(`- 护栏命中：${perception.route.guardHits.length ? perception.route.guardHits.map((g) => `${g.key}（${g.detail}）`).join('；') : '无'}`)
P(`- 缺失组：${perception.route.missing.join('、') || '无'}`)
P(`- 降级组：${perception.route.degraded.join('、') || '无'}`)
P(`- 分型是否已知：${perception.route.mechanismKnown ? '已知' : '未采集（需 migration 022）'}`)
P()
P(`---`)
P()
P(`*本文件由 \`agent-poc/scripts/dump-prompt.mjs\` 生成，只读连库，未修改任何数据。*`)

const md = lines.join('\n')
if (OUT) {
  writeFileSync(OUT, md, 'utf8')
  console.log(`已写入：${OUT}`)
}
console.log(md)

await closeDb()
process.exit(0)
