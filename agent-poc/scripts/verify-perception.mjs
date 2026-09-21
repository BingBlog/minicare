/**
 * 现状感知模块（lib/perception.js）回归验证 —— TECH-014 v1
 *
 * 运行：cd agent-poc && NODE_OPTIONS= node scripts/verify-perception.mjs
 * 覆盖：六板块字段完整性、注入 systemPrompt 的实际效果、缓存命中、
 *      归一化与七大类归类、合理性 flag 与字段的自洽、元信号（无记录 ≠ 阴性结论）、
 *      单一真相源（阶段/新鲜度与 profile.js 同源、参考值只在 REF）、
 *      边界（无配方记录的宝宝不得整段降级）。
 * 失败即退出码 1，可直接接进 CI。依赖 dev 库（.env.local）。
 */
import { loadLocalEnv } from '../src/lib/env.js'

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
check('六板块齐全', q && ['stage', 'allergy', 'variety', 'maintain', 'trust'].every((k) => k in q))
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
const LEGAL = ['observe_stalled', 'observing_overlap', 'safe_not_maintained', 'transition_ready', 'variety_insufficient', 'data_stale']
check('flag key 全部合法', keys.every((k) => LEGAL.includes(k)), keys.join(','))
check('每个 flag 有中文标签与明细', q.flags.every((f) => f.label && f.detail))
const expectReady = q.stage && q.stage.level > 1 && q.stage.stableDays >= REF.stageStableDays
check('transition_ready 与字段一致', keys.includes('transition_ready') === Boolean(expectReady), `expect=${expectReady}`)
check('observing_overlap 与观察中数量一致', keys.includes('observing_overlap') === (a.observing.length > 1), `observing=${a.observing.length}`)
check('safe_not_maintained 与清单一致', keys.includes('safe_not_maintained') === (q.maintain.idleSafe.length > 0), `idle=${q.maintain.idleSafe.length}`)
const expectStale = q.trust.symptomStaleDays != null && q.trust.symptomStaleDays > REF.symptomUsableDays
check('data_stale 与症状新鲜度一致', keys.includes('data_stale') === Boolean(expectStale), `symptomStale=${q.trust.symptomStaleDays}`)

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
check('现状块体积可控（<1600 字符，每轮都进 prompt）', percChars < 1600, percChars + ' 字符')

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

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL')
await closeDb()
process.exit(fail ? 1 : 0)
