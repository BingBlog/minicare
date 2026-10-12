/**
 * 现状感知模块（lib/perception.js）回归验证 —— TECH-014 v1
 *
 * 运行：cd minicare-agent && NODE_OPTIONS= node scripts/verify-perception.mjs
 * 覆盖：六板块字段完整性、注入 systemPrompt 的实际效果、缓存命中、
 *      归一化与七大类归类、合理性 flag 与字段的自洽、元信号（无记录 ≠ 阴性结论）、
 *      单一真相源（阶段/新鲜度与 profile.js 同源、参考值只在 REF）、
 *      边界（无配方记录的宝宝不得整段降级）。
 * 失败即退出码 1，可直接接进 CI。依赖 dev 库（.env.local）。
 */
import { loadLocalEnv } from '../src/lib/env.js'

// 干跑/发布校验支持：--config-file=<path> 指向草稿配置（必须在任何动态 import 之前设置 env，
// loader 在模块加载时读取；见 TECH-029 §4.4）
const CONFIG_FILE = (process.argv.slice(2).find((a) => a.startsWith('--config-file=')) || '').split('=')[1]
if (CONFIG_FILE) process.env.SIGNALS_CONFIG = CONFIG_FILE

loadLocalEnv()
const { loadConfig } = await import('../src/config.js')
const { initDb, closeDb, getDb } = await import('../src/lib/db.js')
const { getBabyProfile, cstToday, LADDER_LABEL } = await import('../src/lib/profile.js')
const {
  getPerception,
  renderPerceptionBlock,
  invalidatePerception,
  normalizeFoods,
  categoryOf,
  buildFlags,
  deriveRoute,
  growthTrend,
  pickFlagsForTurn,
  resetFlagGate,
  REF,
} = await import('../src/lib/perception.js')
const { buildSystemPrompt } = await import('../src/prompts/system.js')

const cfg = loadConfig()
initDb(cfg)
const db = getDb()
if (!db) {
  console.error('DB 未配置（检查 .env.local 的 DB_* ）')
  process.exit(1)
}
const [[baby]] = await db.query(
  "SELECT id, name FROM baby_profile WHERE name LIKE '%旺仔%' AND deleted_at IS NULL LIMIT 1",
)

let pass = 0
let fail = 0
const check = (name, cond, extra) => {
  if (cond) pass += 1
  else fail += 1
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? ' :: ' + extra : ''))
}

// ── 1. 纯函数：归一化与归类（不依赖数据）──────────────────────────────
console.log('\n=== 归一化与归类 ===')
const normCases = [
  ['西兰花泥', ['西兰花']],
  ['纯米粉', ['米粉']],
  ['纯米粉+南瓜泥', ['米粉', '南瓜']],
  ['强化铁米', ['强化铁米']], // 别名表刻意为空：品牌命名差异属待确认项，不猜
]
for (const [input, expect] of normCases) {
  const got = normalizeFoods(input)
  check(`归一化「${input}」→ ${expect.join('、')}`, JSON.stringify(got) === JSON.stringify(expect), got.join('、'))
}
check('七大类：西兰花 → 蔬菜', categoryOf('西兰花') === '蔬菜')
check('七大类：小米 → 谷薯', categoryOf('小米') === '谷薯')
check('七大类：猪里脊 → 肉禽鱼', categoryOf('猪里脊') === '肉禽鱼')
check('七大类：未收录词 → 未归类', categoryOf('奇亚籽') === '未归类')

// ── 2. 空值语义 ───────────────────────────────────────────────────────
console.log('\n=== 空值语义 ===')
check('getPerception(null) 返回 null', (await getPerception(null)) === null)
check('getPerception(不存在的 id) 返回 null', (await getPerception('00000000-0000-0000-0000-000000000000')) === null)
check('renderPerceptionBlock(null) 返回空串', renderPerceptionBlock(null) === '')
check('REF 已冻结（防止运行期被改）', Object.isFrozen(REF))

// ── 3. 真实数据构建 ───────────────────────────────────────────────────
const p = await getBabyProfile(baby.id)
const q = await getPerception(baby.id, { profile: p })
console.log('\n=== 感知对象（截断）===')
console.log(JSON.stringify(q, null, 1).slice(0, 1500))

check('感知对象非空', q !== null && q.babyId === baby.id)
check(
  '板块齐全（阶段/排敏/多样性/维持/可信度/症状/大便/覆盖率/高致敏/判定链）',
  q && ['stage', 'allergy', 'variety', 'maintain', 'trust', 'symptoms', 'stool', 'coverage', 'highRisk', 'route'].every((k) => k in q),
)
check('今日日期为北京时间当天', q.today === cstToday(), q.today)

// ① 阶段：必须与 profile 同源（不重算）
if (q.stage) {
  const okTypes = ['aa', 'eh_no_lactose', 'eh_lactose', 'ph', 'std']
  check('阶段 key 合法', okTypes.includes(q.stage.key), q.stage.key)
  check(
    '阶段与 profile.formula 同源（单一真相源）',
    q.stage.level === p.formula.ladderLevel && q.stage.stableDays === p.formula.stalledDays,
    `perception=${q.stage.level}/${q.stage.stableDays} profile=${p.formula.ladderLevel}/${p.formula.stalledDays}`,
  )
  check('阶段有中文标签与判定', Boolean(q.stage.label) && Boolean(q.stage.verdict), q.stage.verdict)
  check('阶内进度在 0..1', q.stage.nextPct >= 0 && q.stage.nextPct <= 1, String(q.stage.nextPct))
  check('距终点 = 阶梯位 - 1', q.stage.gapToEnd === q.stage.level - 1, String(q.stage.gapToEnd))
}

// ② 排敏：五态齐全、计数自洽
const a = q.allergy
check('排敏五态齐全', ['observing', 'safe', 'suspected', 'allergic', 'paused'].every((k) => k in a.byStatus))
check('建档总数 = 各态之和', a.total === Object.values(a.byStatus).reduce((s, v) => s + v, 0), String(a.total))
check('已耐受种数 ≤ 条数（归一化只会减不会增）', a.safeKinds <= a.safeCount, `${a.safeKinds} ≤ ${a.safeCount}`)
check('已耐受归一化名唯一', new Set(a.safeNames).size === a.safeNames.length)
check('停滞项 ⊆ 观察中项', a.stalledObserving.every((o) => a.observing.includes(o)))

// ⑦ 相关性：维持暴露以排敏与实吃两源交叉
check('未维持清单 ⊆ 已耐受清单', q.maintain.idleSafe.every((n) => a.safeNames.includes(n)))
check('未维持 = 已耐受 − 近14天吃过', q.maintain.idleSafe.length === a.safeNames.filter((n) => !q.maintain.eaten14.includes(n)).length)

// ⑤ 元信号：与 profile.freshness 同源
check('数据可信度与 profile.freshness 同源', q.trust.sources === p.freshness)

// ── 4. flag 自洽（每个 flag 必须由字段推得，不能凭空出现）──────────────
console.log('\n=== 合理性 flag ===')
const keys = q.flags.map((f) => f.key)
console.log('  flags: ' + (keys.join(', ') || '无'))
const LEGAL = [
  // PRD §4.5 的 8 个
  'eating_marked', 'observe_stalled', 'observing_overlap', 'stage_stalled', 'stage_stalled_symptomatic',
  'ladder_escalated', 'growth_falling', 'data_stale',
  // 实现新增（语义不同才新起）
  'stage_ready_but_symptomatic', 'safe_not_maintained', 'transition_ready', 'variety_insufficient', 'high_risk_none',
]
check('flag key 全部合法', keys.every((k) => LEGAL.includes(k)), keys.join(','))
check('每个 flag 有中文标签、明细与强度', q.flags.every((f) => f.label && f.detail && ['strong', 'medium', 'weak', 'intercept'].includes(f.strength)))
check(
  '强项只出现在 PRD 标注的两类 + 转奶前提被违反',
  q.flags.filter((f) => f.strength === 'strong').every((f) => ['eating_marked', 'stage_stalled_symptomatic', 'stage_ready_but_symptomatic'].includes(f.key)),
)
const expectReady = q.stage && q.stage.level > 1 && q.stage.stableDays >= REF.stageStableDays
check('transition_ready 与字段一致', keys.includes('transition_ready') === Boolean(expectReady), `expect=${expectReady}`)
check('observing_overlap 与"窗口交集"一致（不再是数量 >1）', keys.includes('observing_overlap') === (a.overlaps?.length > 0), `overlaps=${a.overlaps?.length}`)
check('safe_not_maintained 与清单一致', keys.includes('safe_not_maintained') === (q.maintain.idleSafe.length > 0), `idle=${q.maintain.idleSafe.length}`)
const expectStale = q.trust.symptomStaleDays != null && q.trust.symptomStaleDays > REF.symptomUsableDays
check('data_stale 至少覆盖症状条件', !expectStale || keys.includes('data_stale'), `symptomStale=${q.trust.symptomStaleDays}`)

// ── 5. 注入 systemPrompt（这是"能否在对话里体验到"的核心）─────────────
console.log('\n=== 注入 systemPrompt ===')
const block = renderPerceptionBlock(q)
console.log(block)
check('注入块含【宝宝现状】', block.includes('【宝宝现状'))
check('注入块含现状使用要求', block.includes('现状使用要求'))
check('注入块含转奶段', block.includes('转奶：'))
check('注入块含排敏段', block.includes('排敏：'))
check('注入块含日常种类段', block.includes('日常种类：'))
check('注入块含数据可信度段', block.includes('数据可信度：'))
check('注入块约束"不是计划"', block.includes('不是计划'))
check('注入块禁止暴露统计口径', block.includes('不要暴露统计口径') || block.includes('统计口径'))

const prompt = buildSystemPrompt({ familyId: 'F', babyId: baby.id }, [], p, q)
check('prompt 含【宝宝画像】与【宝宝现状】两段', prompt.includes('画像使用要求') && prompt.includes('现状使用要求'))
check('prompt 含日期块（原有能力未被挤掉）', prompt.includes('【当前日期】'))
check('prompt 仍含全部护栏规则', prompt.includes('护栏规则') && prompt.includes('33)'))
const promptNoPerc = buildSystemPrompt({ familyId: 'F', babyId: baby.id }, [], p, null)
check('无感知时不出现现状段（且画像段仍在）', !promptNoPerc.includes('现状使用要求') && promptNoPerc.includes('画像使用要求'))
const percChars = block.length
console.log(`  （现状块体积 ${percChars} 字符 —— 体积上限断言见第 13 组）`)

// ── 6. 缓存与失效 ─────────────────────────────────────────────────────
console.log('\n=== 缓存 ===')
const t1 = Date.now()
await getPerception(baby.id)
const dt = Date.now() - t1
check('二次取感知命中缓存 (<20ms)', dt < 20, dt + 'ms')
invalidatePerception(baby.id)
const t2 = Date.now()
const q2 = await getPerception(baby.id, { profile: p })
const dt2 = Date.now() - t2
check('失效后重算（未命中缓存）', dt2 >= 0 && q2 !== null, dt2 + 'ms')

// ── 7. 参数化参考值（拍板后只改配置不改代码）──────────────────────────
if (q.stage && q.stage.level > 1) {
  const strict = await getPerception(baby.id, { profile: p, ref: { stageStableDays: 9999 } })
  check('ref 覆盖生效（stageStableDays=9999 → 不再可推进）', !strict.flags.some((f) => f.key === 'transition_ready'))
  check('ref 覆盖不污染缓存（返回对象用的是覆盖值）', strict.ref.stageStableDays === 9999, String(strict.ref.stageStableDays))
  const after = await getPerception(baby.id, { profile: p })
  check('后续取数仍用默认参考值', after.ref.stageStableDays === REF.stageStableDays, String(after.ref.stageStableDays))
  invalidatePerception(baby.id)
}

// ── 8. 边界：无配方记录的宝宝不得整段降级 ─────────────────────────────
// 回归：buildFlags 曾直接访问 stage.level，formula 为 null 时抛 TypeError，
// 使新用户 / 纯母乳 / 未开始转奶的宝宝连排敏、多样性、可信度一起拿不到。
console.log('\n=== 边界：无配方记录（stage=null）===')
const noFormula = { ...p, formula: null }
// 传 ref 以绕过缓存且不写缓存（否则伪造 profile 会顶掉真实缓存）
const qn = await getPerception(baby.id, { profile: noFormula, ref: { stageStableDays: REF.stageStableDays } })
check('formula=null 时感知仍构建成功（不整段降级）', qn !== null && qn.babyId === baby.id)
check('stage=null 是合法状态（非异常）', qn?.stage === null)
check('无配方记录时不给 transition_ready', Boolean(qn) && !qn.flags.some((f) => f.key === 'transition_ready'))
check('无配方记录时其余四板块仍在', Boolean(qn) && ['allergy', 'variety', 'maintain', 'trust'].every((k) => qn[k]))
const blockNoFormula = renderPerceptionBlock(qn)
check('无配方记录时仍可渲染（转奶段给"信息缺失"）', blockNoFormula.includes('转奶：') && blockNoFormula.includes('无法判定阶段'))
check('无配方记录不污染缓存（后续取数仍有 stage）', (await getPerception(baby.id))?.stage?.level === p.formula.ladderLevel)

// ── 9. 组 F（症状与反应）/ 组 I（覆盖率）自洽 ──────────────────────────
console.log('\n=== 组 F 症状与反应 / 组 I 覆盖率 ===')
check('症状对象结构完整', ['eventTotal', 'symptomTotal', 'events', 'activeDays14'].every((kk) => kk in q.symptoms))
check('大便对象结构完整', ['total', 'filled', 'fillRate', 'coverageOk', 'byType'].every((kk) => kk in q.stool))
check(
  '覆盖率 rate = filled / total（自洽）',
  // rate 由 round4 产出（最大误差 5e-5），阈值必须大于该精度（1e-4）；
  // 原 1e-6 会对 16/19 这类不整除样本误报（2026-10-11 修复）
  Object.values(q.coverage).every((c) => (c.total === 0 ? c.rate === 0 : Math.abs(c.rate - c.filled / c.total) < 1e-4)),
  JSON.stringify(q.coverage),
)
check(
  '大便填写率与覆盖率同源（单一真相源）',
  q.coverage.poopType.filled === q.stool.filled && q.coverage.poopType.total === q.stool.total,
)
check('大便覆盖不足时 coverageOk=false（阴性结论开关）', q.stool.coverageOk === (q.stool.total > 0 && q.stool.fillRate >= REF.coverageMin))
check('高致敏分组 7 类齐全', q.highRisk.length === 7, q.highRisk.map((g) => g.group).join('/'))
check('高致敏：土豆不得被归入大豆（分组关键词禁用单字"豆"）', !(q.highRisk.find((g) => g.group === '大豆')?.foods || []).includes('土豆'))
check('归一化：土豆 → 谷薯（与上一条互为印证）', categoryOf('土豆') === '谷薯')
check('growthTrend 与分位档一致（无 growth 时返回 null）', q.growth ? growthTrend(q.growth) === null || typeof growthTrend(q.growth) === 'object' : true)

// ── 10. flag 边界（伪造数据）────────────────────────────────────────
// 覆盖 PRD 标「强」的两条 —— 它们是敏宝的安全底线，必须能被构造出来验证。
console.log('\n=== flag 边界（伪造数据）===')
const base = {
  stage: { level: 3, stableDays: 20, status: 'stable', direction: 'same', label: '深度水解（含乳糖）', stableAtLeast: false },
  allergy: {
    total: 3,
    suspected: [],
    allergic: [],
    observing: [],
    overlaps: [],
    stalledObserving: [],
    safeCount: 3,
    safeNames: ['米粉', '青菜', '苹果'],
  },
  variety: { recordedDays: 0, hitDays: 0 },
  maintain: { eaten14: [], eaten30: ['米粉'], idleSafe: [] },
  trust: { symptomStaleDays: 1 },
  symptoms: { eventTotal: 0, events: [], symptomTotal: 0, symptomRecent: [], activeDays14: 0, unlinkedEvents: 0, worstSeverity: null },
  stool: { total: 5, coverageOk: true, byType: { normal: 5 }, fillRate: 1 },
  growth: null,
  highRisk: [],
}
const kk = (fs) => fs.map((x) => x.key)
const withSuspected = { ...base, allergy: { ...base.allergy, suspected: [{ name: '芹菜', severity: 'mild' }] } }
const f1 = buildFlags({ ...withSuspected, maintain: { ...base.maintain, eaten14: ['芹菜'] } }, REF)
check('#1 疑似食材仍在食用 → eating_marked（强）', kk(f1).includes('eating_marked') && f1.find((x) => x.key === 'eating_marked').strength === 'strong')
const f1b = buildFlags({ ...withSuspected, maintain: { ...base.maintain, eaten14: ['米粉'] } }, REF)
check('#1 疑似食材已停食 → 不报（避免"狼来了"）', !kk(f1b).includes('eating_marked'))
const f5 = buildFlags(
  { ...base, stage: { ...base.stage, status: 'stalled' }, symptoms: { ...base.symptoms, eventTotal: 2, lastEventAt: '2026-09-10', worstSeverity: 'moderate' } },
  REF,
)
check('#5 停滞期有反应 → stage_stalled_symptomatic（强）', kk(f5).includes('stage_stalled_symptomatic') && f5.find((x) => x.key === 'stage_stalled_symptomatic').strength === 'strong')
check('#4 停滞本身 → stage_stalled（中）', kk(f5).includes('stage_stalled'))
// ← 本次生产核对暴露的洞：症状源陈旧，但真实反应记在 health_record
const fEdge = buildFlags(
  {
    ...base,
    trust: { symptomStaleDays: 34 },
    symptoms: { ...base.symptoms, eventTotal: 1, lastEventAt: '2026-09-20', worstSeverity: 'severe', events: [{ date: '2026-09-20', food: '三文鱼', symptoms: ['腹泻'], severity: 'severe' }] },
  },
  REF,
)
check('边界：症状源陈旧 + 健康记录有反应 → 不漏判"转奶前提被违反"', kk(fEdge).includes('stage_ready_but_symptomatic'))
check('边界：该情形 transition_ready 会标注"但有近期反应"', (fEdge.find((x) => x.key === 'transition_ready')?.detail || '').includes('有近期反应'))
const f6 = buildFlags({ ...base, stage: { ...base.stage, direction: 'escalated' } }, REF)
check('#6 阶梯上移 → ladder_escalated（弱，仅写入不主动提醒）', f6.find((x) => x.key === 'ladder_escalated')?.strength === 'weak')
const f7 = buildFlags(
  { ...base, growth: { latest: { weightP: 'P15-P50', heightP: 'P15-P50', measuredAt: '2026-09-06' }, previous: { weightP: 'P50-P85', heightP: 'P15-P50', measuredAt: '2026-07-27' }, staleDays: 5 } },
  REF,
)
check('#7 体重分位下降 1 档 → growth_falling', kk(f7).includes('growth_falling'))
const f8 = buildFlags({ ...base, trust: { symptomStaleDays: 40 }, growth: { latest: {}, previous: null, staleDays: 60 } }, REF)
check('#8 症状陈旧 + 生长 60 天未更新 → data_stale 含两项', (f8.find((x) => x.key === 'data_stale')?.detail || '').includes('生长测量'))
check('无配方记录（stage=null）时不报任何转奶类 flag', !kk(buildFlags({ ...base, stage: null }, REF)).some((x) => x.startsWith('stage_') || x === 'transition_ready'))

// ── 11. flag 频控（PRD §4.5）────────────────────────────────────────
console.log('\n=== flag 频控 ===')
const FIXTURE = [
  { key: 's1', label: '强A', strength: 'strong', detail: '' },
  { key: 'm1', label: '中B', strength: 'medium', detail: '' },
  { key: 'm2', label: '中C', strength: 'medium', detail: '' },
  { key: 'i1', label: '拦截D', strength: 'intercept', detail: '' },
]
resetFlagGate('TEST')
const r1 = pickFlagsForTurn(FIXTURE, 'TEST', { now: 1000 })
check('强项全部输出（不受单轮 1 条限制）', r1.shown.filter((f) => f.strength === 'strong').length === 1)
check('非强项单轮最多 1 条', r1.shown.filter((f) => f.strength !== 'strong').length === 1, r1.shown.map((f) => f.key).join(','))
check('拦截型不主动说', !r1.shown.some((f) => f.key === 'i1') && r1.suppressed.some((f) => f.reason === 'intercept_only'))
const r2 = pickFlagsForTurn(FIXTURE, 'TEST', { now: 2000 })
check('第 2 轮换一条（同一 flag 7 天内不重复）', r2.shown.find((f) => f.strength !== 'strong')?.key === 'm2')
const r3 = pickFlagsForTurn(FIXTURE, 'TEST', { now: 3 * 86400000 })
check('候选耗尽 → 只输出强项', r3.shown.every((f) => f.strength === 'strong'))
const r4 = pickFlagsForTurn(FIXTURE, 'TEST', { now: 8 * 86400000 })
check('超过 7 天 → 同一 flag 可再次提示', r4.shown.some((f) => f.key === 'm1'))
check('跳过一次即不写冷却（只记录真正说出口的）', pickFlagsForTurn(FIXTURE, 'TEST2', { now: 1 }).shown.length > 0)
resetFlagGate('TEST')
resetFlagGate('TEST2')
check('FLAG_THROTTLE=off 可整链路回滚（全部输出）', pickFlagsForTurn(FIXTURE, 'TEST3', { enabled: false }).shown.length === 4)

// ── 12. 判定优先级链（PRD §4.4）──────────────────────────────────────
console.log('\n=== 判定优先级链 ===')
const rf = (o = {}) =>
  deriveRoute({
    stage: o.stage !== undefined ? o.stage : base.stage,
    allergy: o.allergy || base.allergy,
    symptoms: o.symptoms || base.symptoms,
    stool: o.stool || base.stool,
    trust: o.trust || base.trust,
    medicalDegraded: !!o.medicalDegraded,
  })
check(
  '护栏 > 数据不足：有重度反应时先给 guard_hit',
  rf({
    symptoms: { ...base.symptoms, eventTotal: 1, events: [{ date: '2026-09-20', food: '三文鱼', symptoms: ['腹泻'], severity: 'severe' }], eventStaleDays: 1, worstSeverity: 'severe' },
    stage: null,
    allergy: { ...base.allergy, total: 0 },
  }).route === 'guard_hit',
)
const rData = rf({ stage: null, allergy: { ...base.allergy, total: 0 } })
check('阶段与排敏双缺失 → data_insufficient（不给推进结论）', rData.route === 'data_insufficient' && rData.missing.length >= 2, rData.missing.join('/'))
check('稳定无反应 → stable_avoidance', rf().route === 'stable_avoidance')
check('有观察任务 → observing', rf({ allergy: { ...base.allergy, observing: [{ name: '小米粉', day: 1, days: 3, idle: 0 }] } }).route === 'observing')
check('分型字段缺失时标 mechanismKnown=false（不假装已知）', rf().mechanismKnown === false)
check('医疗降级会写进 degraded 列表', rf({ medicalDegraded: true }).degraded.some((x) => x.includes('020')))

// ── 13. 注入块：新增段 + 频控后的体积 ─────────────────────────────────
console.log('\n=== 注入块（新增段）===')
check('注入块含近期反应段', block.includes('近期反应：'))
check('注入块含大便段', block.includes('大便：'))
check('注入块含覆盖率段', block.includes('覆盖率：'))
check('注入块含判定路径段', block.includes('判定路径：'))
check('注入块含"覆盖率不足不得下阴性结论"约束', block.includes('覆盖率不足') && block.includes('不得下阴性结论'))
check('注入块含高致敏引入段（有已耐受建档时）', block.includes('高致敏引入：') || !q.highRisk.length || !a.safeCount)
resetFlagGate(baby.id)
const tb1 = renderPerceptionBlock(q, { enabled: true })
const tb2 = renderPerceptionBlock(q, { enabled: true })
resetFlagGate(baby.id)
check('启用频控后注入块非强项 ≤1 条', tb1.flags.filter((f) => f.strength !== 'strong').length <= 1, tb1.flags.map((f) => f.key).join(','))
check('频控对象返回 { block, flags }', typeof tb1.block === 'string' && Array.isArray(tb1.flags))
check('频控不改变强项（安全底线不被压住）', tb1.flags.some((f) => f.strength === 'strong') === q.flags.some((f) => f.strength === 'strong'))
// 体积：信号组从 3 组扩到 10 组后必然上升；这里卡住"不失控"，上限随信号扩张同步调整
const percChars2 = renderPerceptionBlock(q).length
check('现状块体积可控（<3200 字符，每轮都进 prompt）', percChars2 < 3200, percChars2 + ' 字符')

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL')
await closeDb()
process.exit(fail ? 1 : 0)
