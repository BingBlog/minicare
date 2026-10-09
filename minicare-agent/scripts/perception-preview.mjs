/**
 * 现状感知 v1 干跑预览（TECH-014）
 *
 * 运行：cd minicare-agent && NODE_OPTIONS= node scripts/perception-preview.mjs [宝宝名|baby_id] [--prod]
 * 默认宝宝名「旺仔」、默认 dev 库；`--prod` 指向生产库（minicare-platform/api/.env 的 DB_* + 固定库名）。
 * 传 baby_id（UUID）时走主键查询 —— 生产库存在同名「旺仔」，按名字 LIKE 会取错人。
 *
 * 定位：**人眼核对工具**。算法全在 `src/lib/perception.js`（注入对话用的是同一份），
 * 本脚本只负责把算出来的每个数字摊开打印，方便逐个对账——
 * 不复制任何算法，避免"脚本对了、线上不对"。
 *
 * 只读：不写库、不改业务代码；全部数据来自已有表单，零新增录入。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLocalEnv } from '../src/lib/env.js'

/** 目标库：默认 dev（.env.local）；--prod 指向生产库（minicare-platform/api/.env + 固定库名） */
const ARGS = process.argv.slice(2)
const PROD = ARGS.includes('--prod')
const TARGET = ARGS.find((a) => !a.startsWith('--')) || '旺仔'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

if (PROD) {
  // 必须在 loadLocalEnv() 之前写入：env.js 用 override:false，已存在的变量优先
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
const { getBabyProfile, cstToday, FRESHNESS_LABEL: FRESH_LABEL } = await import('../src/lib/profile.js')
const { getPerception, renderPerceptionBlock, resetFlagGate, REF, normalizeFoods } = await import('../src/lib/perception.js')
const mysql = (await import('mysql2/promise')).default

const { LADDER_LABEL } = await import('../src/lib/profile.js')
const OBS_STATUS_LABEL = {
  observing: '观察中',
  safe: '已耐受',
  suspected: '疑似',
  allergic: '已确认过敏',
  paused: '已暂停',
}
// 数据源中文名统一从 profile.js 复用，避免多份清单漂移

const cfg = loadConfig()
initDb(cfg)
// 本脚本自建一个池只用于"按宝宝名找 id"；其余查询走 lib/perception.js 的池
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

// 定位宝宝：传 UUID 走主键（生产库存在同名宝宝，禁止按名字猜）；传名字走 LIKE 仅限 dev
let baby
if (UUID_RE.test(TARGET)) {
  ;[[baby]] = await db.query(
    'SELECT id, name, birth_date FROM baby_profile WHERE id = ?',
    [TARGET],
  )
} else {
  const [cands] = await db.query(
    'SELECT id, name, birth_date FROM baby_profile WHERE name LIKE ? AND deleted_at IS NULL',
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

const hr = (t) => console.log('\n' + '─'.repeat(74) + '\n' + t + '\n' + '─'.repeat(74))
const row = (k, v) => console.log('  ' + String(k).padEnd(24) + ' ' + v)

const today = cstToday()
const p = await getBabyProfile(baby.id)
if (!p) {
  console.error('画像构建失败（DB 不可用？）')
  process.exit(1)
}
const q = await getPerception(baby.id, { profile: p })
if (!q) {
  console.error('现状感知构建失败')
  process.exit(1)
}

console.log(`宝宝：${p.basic.name}（${p.basic.birthDate} 出生，${p.basic.ageText}）  今天：${today}`)
console.log(`数据源：${cfg.db.name} @ ${cfg.db.host}`)

// ── ① 奶粉阶段与进度（源：profile.formula，本模块只做派生）──────────────
hr('① 奶粉阶段与进度（源：feeding_formula_mix｜结论复用 profile.js，不重算）')
if (!q.stage) {
  row('状态', '无足够配方记录，无法判定阶段')
} else {
  const s = q.stage
  row('近 30 天构成', s.mix.map(([t, r]) => `${LADDER_LABEL[t] || t} ${Math.round(r * 100)}%`).join(' + '))
  row('当前阶', `${s.label}（阶梯位 ${s.level}/4）`)
  row('下一阶', s.nextLabel ? `${s.nextLabel}（${s.nextLevel}/4）` : '已在终点')
  row('距终点', `${s.gapToEnd} 阶`)
  row('阶内进度', `下一阶占 ${Math.round(s.nextPct * 100)}%（0% = 尚未开始混入）`)
  row('本阶稳定', `${s.stableDays} 天${s.stableAtLeast ? '（至少）' : ''}｜参考 ${q.ref.stageStableDays} 天，下限 ${q.ref.stageMinDays} 天`)
  row('构成状态', `${s.status}（stable 纯阶 / transitioning 正在变 / stalled 停滞）`)
  row('乳糖类型', s.lactose || '未知')
  if (s.aaStoppedDays != null) row('已停氨基酸', `${s.aaStoppedDays} 天`)
  if (s.staleDays > 3) row('数据提示', `配方记录截至 ${s.lastRecordAt}，已 ${s.staleDays} 天未更新`)
  row('判定', s.verdict)
}

// ── ② 排敏进度 ──────────────────────────────────────────────────────
const a = q.allergy
hr('② 辅食 / 排敏进度（源：food_observation｜本模块新增）')
row('建档总数', `${a.total} 条`)
row('状态分布', Object.entries(a.byStatus).map(([k, v]) => `${k} ${v}`).join(' / '))
row('已耐受', `${a.safeCount} 条 → 归一化后 ${a.safeKinds} 种`)
if (a.dupGroups.length) row('  重复建档', a.dupGroups.map((g) => `${g.normalized} ← ${g.raw.join(' / ')}`).join('；'))
row('进行中', a.observing.length
  ? a.observing.map((o) => `${o.name} 第 ${o.day}/${o.days} 天（${o.idle} 天未推进）`).join('；')
  : '无')
row('疑似', a.suspected.map((o) => `${o.name}(${o.severity})`).join('、') || '无')
row('确认过敏', a.allergic.map((o) => `${o.name}(${o.severity})`).join('、') || '无')
row('已暂停', a.paused.join('、') || '无')
row('窗口重叠', a.overlaps.length ? a.overlaps.map(([x, y]) => `${x} × ${y}`).join('；') : '无（串行）')
row('逐日打卡（第二源）', `${a.logTotal} 条${a.lastLogAt ? `，最近 ${a.lastLogAt}` : ''}`)

// ── ③ 日常摄入多样性 ────────────────────────────────────────────────
const v = q.variety
hr('③ 日常摄入多样性（源：feeding_food_item｜本模块新增）')
row('有记录天数', `${v.recordedDays} 天（近 ${q.ref.windowVarietyDays} 天）`)
row('每日种类均值', `${v.avgKinds.toFixed(1)} 种（参考下限 ${q.ref.dailyKinds} 种，按归一化后计）`)
row('达标天数', `${v.hitDays} / ${v.recordedDays} 天 ≥ ${q.ref.dailyKinds} 种`)
row('逐日', v.days.map((d) => `${d.date.slice(5)} ${d.kindsNormalized}种[${d.categories.join('·')}]`).join('  |  ') || '无')
row('覆盖类别', `${v.categories.length} 类：${v.categories.join('、')}（参考每日 ≥ ${q.ref.dailyCategories} 类）`)

// ── ④ 维持暴露 ──────────────────────────────────────────────────────
const m = q.maintain
hr('④ 已耐受维持暴露（源：food_observation × feeding_food_item 交叉｜本模块新增）')
row(`近 ${q.ref.windowEatenDays} 天真吃过`, `${m.eaten30.length} 种：${m.eaten30.join('、') || '无'}`)
row('近 14 天真吃过', `${m.eaten14.length} 种：${m.eaten14.join('、') || '无'}`)
row('已耐受但近 14 天未吃', m.idleSafe.length ? `${m.idleSafe.length} 种：${m.idleSafe.join('、')}` : '无')
row('参考', `已耐受食物每周维持 ${q.ref.maintainPerWeek}-${q.ref.maintainPerWeekMax} 次暴露`)

// ── ⑤ 症状与反应 / 大便 / 覆盖度（组 F + 组 I）────────────────────────
const sy = q.symptoms
const so = q.stool
hr('⑤ 症状与反应（源：symptom_record × health_record.allergy_symptoms × diaper_record）')
row('反应记录（过敏事件）', `${sy.eventTotal} 次${sy.lastEventAt ? `，最近 ${sy.lastEventAt}` : ''}${sy.unlinkedEvents ? `（${sy.unlinkedEvents} 次未关联食材）` : ''}`)
for (const e of sy.events.slice(0, 6)) {
  row(`  ${e.date}`, `${e.food || '（未关联食材）'} · ${e.symptoms.join('/') || '-'} · ${e.severity || '-'}${e.obsStatus ? ` · 建档=${e.obsStatus}` : ''}`)
}
row('表现记录（症状谱）', `${sy.symptomTotal} 条${sy.lastSymptomAt ? `，最近 ${sy.lastSymptomAt}（${sy.symptomStaleDays} 天前）` : ''}`)
row('近 14 天有反应天数', `${sy.activeDays14} 天`)
row('大便性状', so.total
  ? `${so.total} 条：${Object.entries(so.byType).map(([k, n]) => `${k} ${n}`).join(' / ')}；填写率 ${(so.fillRate * 100).toFixed(0)}%（覆盖${so.coverageOk ? '达标' : '不足'}）${so.lastAbnormalAt ? `，最近异常 ${so.lastAbnormalAt}` : ''}`
  : `近 ${so.windowDays} 天无尿布记录`)
row('高致敏引入', q.highRisk.map((g) => `${g.group}${g.introduced ? `✓(${g.foods.join('/')})` : '✗'}`).join(' | '))

// ── ⑥ 数据可信度 ────────────────────────────────────────────────────
hr('⑥ 数据可信度（源：profile.freshness + coverage｜元信号）')
for (const [k, label] of Object.entries(FRESH_LABEL)) {
  const info = q.trust.sources?.[k]
  row(label, info?.lastAt ? `最近 ${info.lastAt}（${info.staleDays} 天前）` : '从无记录')
}
row('症状结论可用性', q.trust.symptomUsable
  ? '可用'
  : `不可用：${q.trust.symptomStaleDays} 天无记录，只能写"信息缺失"，不能写"无症状"`)
for (const [k, c] of Object.entries(q.coverage || {})) {
  row(`覆盖率 · ${k}`, `${c.filled}/${c.total} = ${(c.rate * 100).toFixed(0)}%${c.rate < q.ref.coverageMin ? '（不足 50%，不得下阴性结论）' : ''}`)
}

// ── ⑦ 判定路径（PRD §4.4 五级链）─────────────────────────────────────
hr('⑦ 判定路径（PRD §4.4：护栏 > 数据不足 > 分型 > 活跃计划 > 空档）')
row('命中路径', q.route.route)
row('护栏命中', q.route.guardHits.length ? q.route.guardHits.map((g) => `${g.key}：${g.detail}`).join('；') : '无')
row('缺失组', q.route.missing.join('、') || '无')
row('降级组', q.route.degraded.join('、') || '无')
row('分型是否已知', q.route.mechanismKnown ? '已知' : '未采集（需 migration 022）')

// ── ⑧ 合理性判定 ────────────────────────────────────────────────────
hr('⑧ 合理性判断（8 个 PRD flag + 实现新增；建议仍只在对话里产生）')
if (!q.flags.length) console.log('  无异常')
const STRENGTH_TAG = { strong: '强', medium: '中', weak: '弱', intercept: '拦截' }
for (const f of q.flags) console.log(`  ⚑ [${STRENGTH_TAG[f.strength] || f.strength}] ${String(f.label).padEnd(16)} ${f.detail}   [${f.key}]`)

// ── ⑨ 实际注入对话的文本（逐字核对）──────────────────────────────────
hr('⑨ 实际注入 systemPrompt 的文本（与对话完全同源）')
console.log(renderPerceptionBlock(q))
console.log()
row('注入块体积', `${renderPerceptionBlock(q).length} 字符（每轮都进 prompt）`)

// 频控对照（PRD §4.5）：强项每轮都给，非强项单轮 1 条、7 天内不重复
resetFlagGate(q.babyId)
const t1 = renderPerceptionBlock(q, { enabled: true })
row('频控第 1 轮', t1.flags.map((f) => `${f.label}[${f.strength}]`).join('；') || '无')
const t2 = renderPerceptionBlock(q, { enabled: true })
row('频控第 2 轮（紧接着）', t2.flags.map((f) => `${f.label}[${f.strength}]`).join('；') || '无')
resetFlagGate(q.babyId)

console.log('─'.repeat(74))
console.log(`干跑完成：${a.total} 条排敏建档 / ${v.recordedDays} 天辅食记录 / ${q.stage?.mix?.length || 0} 种奶型 —— 全部来自已有表单，零新增录入。`)
console.log(`参考值出处：REF（lib/perception.js）｜归一化示例："纯米粉+南瓜泥" → ${normalizeFoods('纯米粉+南瓜泥').join('、')}`)
console.log('─'.repeat(74))

await closeDb() // 释放只读池
process.exit(0) // 连接池偶发残留句柄，显式退出避免脚本挂住
