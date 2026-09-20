/**
 * 画像模块（lib/profile.js）回归验证 —— F3
 *
 * 运行：cd agent-poc && NODE_OPTIONS= node scripts/verify-profile.mjs
 * 覆盖：画像字段完整性、prompt 注入（F2 日期块 + F3 画像块）、5 分钟缓存命中、
 *      与 analyze_baby_data 的生长分位一致性（单一真相源）、配方空档兜底。
 * 失败即退出码 1，可直接接进 CI。依赖 dev 库（.env.local）。
 */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
const { loadConfig } = await import('../src/config.js')
const { initDb } = await import('../src/lib/db.js')
const { getBabyProfile, renderProfileBlock, cstToday } = await import('../src/lib/profile.js')
const { buildSystemPrompt } = await import('../src/prompts/system.js')
const { executeAnalyzeBabyData } = await import('../src/lib/tools/analyze-baby-data.js')
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
const [[baby]] = await db.query(
  "SELECT id, name FROM baby_profile WHERE name LIKE '%旺仔%' AND deleted_at IS NULL LIMIT 1",
)
await db.end()

let pass = 0
let fail = 0
const check = (name, cond, extra) => {
  if (cond) pass += 1
  else fail += 1
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? ' :: ' + extra : ''))
}

check('renderProfileBlock(null) 返回空串', renderProfileBlock(null) === '')

const p = await getBabyProfile(baby.id)
console.log('\n=== 画像对象 ===')
console.log(JSON.stringify(p, null, 1).slice(0, 1700))

const block = renderProfileBlock(p)
console.log('\n=== 画像注入块 ===\n' + block)

check('画像含宝宝名', block.includes(baby.name))
check('画像含配方段', block.includes('配方：'))
check('画像含喂养段', block.includes('喂养：'))
check('画像含数据新鲜度', block.includes('数据新鲜度：'))
check('画像含使用要求', block.includes('画像使用要求'))
const okTypes = ['aa', 'eh_no_lactose', 'eh_lactose', 'ph', 'std']
check('配方阶梯位合法', okTypes.includes(p.formula && p.formula.dominant), p.formula && p.formula.dominantLabel)
check('生长分位为 P 档', /P\d+/.test((p.growth && p.growth.latest && p.growth.latest.weightP) || ''), (p.growth && p.growth.latest && (p.growth.latest.weightP + ' / ' + p.growth.latest.heightP)) || 'null')

const t1 = Date.now()
await getBabyProfile(baby.id)
const dt = Date.now() - t1
check('二次取画像命中缓存 (<20ms)', dt < 20, dt + 'ms')

const today = cstToday()
const prompt = buildSystemPrompt({ familyId: 'F', babyId: baby.id }, [], p)
check('prompt 含【当前日期】', prompt.includes('【当前日期】'))
check('prompt 日期含今天', prompt.includes(today))
check('prompt 含日期规则 13b', prompt.includes('13b)') && prompt.includes('取【昨天】'))
check('prompt 含画像内容', prompt.includes(baby.name) && prompt.includes('配方：'))
const promptNoProfile = buildSystemPrompt({ familyId: 'F', babyId: baby.id }, [], null)
check('无画像时不出现画像段', !promptNoProfile.includes('画像使用要求') && promptNoProfile.includes('【当前日期】'))

const res = JSON.parse(await executeAnalyzeBabyData({ scope: 'growth', days: 30 }, { babyId: baby.id }))
check('analyze_baby_data(growth) 正常返回', res.ok === true, 'hasData=' + res.hasData + ' months=' + res.months + ' w=' + (res.weight && res.weight.p))
check('analyze 月龄非 NaN', Number.isFinite(res.months), 'months=' + res.months)
check(
  '两处生长分位结论一致（单一真相源）',
  res.weight && res.weight.p === (p.growth && p.growth.latest && p.growth.latest.weightP),
  'analyze=' + (res.weight && res.weight.p) + ' profile=' + (p.growth && p.growth.latest && p.growth.latest.weightP),
)
check('配方段存在（近 7 天无记录时退回最近有记录日）', block.includes('配方：') && Boolean(p.formula && p.formula.dominant), (p.formula && p.formula.dominantLabel) || 'null')
check('配方空档已标注截至日期', p.formula && p.formula.staleDays <= 3 || block.includes('未更新'))

// 喂养方式（回归点）：必须按「最近一次母乳距今」判定，不能用 30 天累计条数。
// 否则"停母乳 16 天但窗口内仍有 5 条旧记录"会被判成混合喂养，助手继续谈母乳。
const fd = p.feeding
if (fd) {
  const expectMode =
    fd.sinceBreastDays === null || fd.sinceBreastDays >= 14
      ? 'formula_only'
      : fd.formulaRecords14 > 0
        ? 'mixed'
        : 'breast_only'
  check('喂养方式判定与「最近一次母乳间隔」一致', fd.mode === expectMode, `mode=${fd.mode} sinceBreast=${fd.sinceBreastDays} 期望=${expectMode}`)
  if (fd.mode === 'formula_only' && fd.breastCount30 > 0) {
    check('已停母乳时旧记录被标注为历史数据', /历史数据/.test(block), 'breastCount30=' + fd.breastCount30)
  }
}
check('画像约束含不回退母乳', /已停止母乳/.test(block) && /不要.*母乳喂养/.test(block))

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL')
const { closeDb } = await import('../src/lib/db.js')
await closeDb()
process.exit(fail ? 1 : 0)
