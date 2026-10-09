/**
 * 画像模块（lib/profile.js）回归验证 —— F3
 *
 * 运行：cd minicare-agent && NODE_OPTIONS= node scripts/verify-profile.mjs
 * 覆盖：画像字段完整性、prompt 注入（F2 日期块 + F3 画像块）、5 分钟缓存命中、
 *      与 analyze_baby_data 的生长分位一致性（单一真相源）、配方空档兜底。
 * 失败即退出码 1，可直接接进 CI。依赖 dev 库（.env.local）。
 */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
const { loadConfig } = await import('../src/config.js')
const { initDb } = await import('../src/lib/db.js')
const { getBabyProfile, renderProfileBlock, cstToday } = await import('../src/lib/profile.js')
const { percentileOf, getHeadStandards, getStandards } = await import('../src/lib/growth.js')
const { readFileSync } = await import('node:fs')
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

// ── 6. 本轮补齐的信号（组 A 出生体重 / C 餐次 / E 头围·增速·维D / G 医疗 / I 日记新鲜度）──
console.log('\n=== 补齐信号 ===')
check('画像含出生体重（组 A：采集了就必须用上）', !p.basic.birthWeightG || block.includes('出生体重'))
check('画像含头围（组 E：queryGrowth 已取 head_mm）', !p.growth?.latest?.headCm || /头围 \d/.test(block), String(p.growth?.latest?.headCm))
check(
  '头围分位为 P 档或 null（绝不编造）',
  p.growth?.latest?.headP == null || /^(低于P3|高于P97|P\d+-P\d+)$/.test(p.growth.latest.headP),
  String(p.growth?.latest?.headP),
)
if (p.growth?.latest?.headCm) {
  const expectHead = percentileOf(
    p.growth.latest.months,
    p.basic.gender === 'female' ? 'female' : 'male',
    'head',
    p.growth.latest.headCm,
  ).p
  check('头围分位与 growth.percentileOf 同源（单一真相源）', p.growth.latest.headP === expectHead, `${p.growth.latest.headP} vs ${expectHead}`)
}
check('画像新鲜度含日记（消除"画像 7 源 / 感知 8 源"的不一致）', block.includes('日记'))
check('餐次节奏（组 C mealRhythm，口径=近 7 天日均进食次数）', !p.mealRhythm || (p.mealRhythm.avgMealsPerDay > 0 && block.includes('进食')), JSON.stringify(p.mealRhythm))
check('营养补充依从性（组 E：维 D 覆盖率）', !p.supplements || (p.supplements.vitDDays >= 0 && block.includes('营养补充：')), JSON.stringify(p.supplements))
check('医疗组：有记录时给分型计数（组 G）', !p.medical?.total || /医疗：.*(疫苗|儿保|就诊)/.test(block), JSON.stringify(p.medical?.byType))
check('医疗降级标记与 hasTypedMedical 探测一致（020 未上生产时只给计数）', !p.medical || p.medical.degradedPartial === !p.medical.typed)
check('生长增速只给实测值，不给"是否达标"结论', !p.growth?.velocity || /日均增重|月均增长/.test(block))

// ── 7. 跨仓单一真相源：头围参考值必须与 minicare-mp 逐值一致 ────────────
console.log('\n=== 跨仓参考值一致性（growth-standards.ts）===')
try {
  const tsSrc = readFileSync(new URL('../../minicare-mp/src/lib/growth-standards.ts', import.meta.url), 'utf8')
  const gi = tsSrc.indexOf('GIRL_GROWTH_STANDARDS')
  const boySeg = tsSrc.slice(0, gi)
  const girlSeg = tsSrc.slice(gi)
  const nums = (seg, key) => [...seg.matchAll(new RegExp(`${key}:\\s*([\\d.]+)`, 'g'))].map((m) => Number(m[1]))
  const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9)
  const myBoy = getHeadStandards('male').map((r) => r[3])
  const myGirl = getHeadStandards('female').map((r) => r[3])
  const tsBoy = nums(boySeg, 'headP50')
  const tsGirl = nums(girlSeg, 'headP50')
  check('男童头围 P50 与小程序逐值一致', same(myBoy, tsBoy), `agent=${myBoy.length} 项 / mp=${tsBoy.length} 项`)
  check('女童头围 P50 与小程序逐值一致', same(myGirl, tsGirl), `agent=${myGirl.length} 项 / mp=${tsGirl.length} 项`)
  check(
    '男童体重 P50 与小程序逐值一致（既有能力未在改动中被破坏）',
    same(getStandards('male').map((r) => r[3]), nums(boySeg, 'weightP50')),
  )
} catch (e) {
  check('跨仓参考值一致性检查', false, e.message)
}

// ── 8. 分位档序列必须与 growth.js::bucket 的取值集合一致 ────────────────
// 2026-09-22 修的真实 bug：趋势判定曾用单点标签 ['P3','P15',…] 做 indexOf，
// 而 bucket 只返回区间档 → 两边都 -1 → d=0 → 趋势**永远输出「平稳」**，
// 与感知层 growth_falling flag 在同一段 prompt 里自相矛盾。
console.log('\n=== 分位档序列一致性（P_BANDS × growth.bucket）===')
{
  const { P_BANDS } = await import('../src/lib/profile.js')
  const expected = ['低于P3', 'P3-P15', 'P15-P50', 'P50-P85', 'P85-P97', '高于P97']
  check(
    'P_BANDS 与 growth.js::bucket 档位集合逐项一致',
    JSON.stringify(P_BANDS) === JSON.stringify(expected),
    P_BANDS.join(' / '),
  )
  const l = p.growth?.latest
  const pv = p.growth?.previous
  check(
    '实测分位档均可被 P_BANDS 识别（否则趋势会被静默丢弃）',
    (!l?.weightP || P_BANDS.includes(l.weightP)) && (!pv?.weightP || P_BANDS.includes(pv.weightP)),
    `${pv?.weightP || '-'} → ${l?.weightP || '-'}`,
  )
  if (l?.weightP && pv?.weightP) {
    const ri = P_BANDS.indexOf(l.weightP)
    const rp = P_BANDS.indexOf(pv.weightP)
    const want = ri > rp ? '趋势上升' : ri < rp ? '趋势下降' : '趋势平稳'
    check('趋势方向与档位差一致', block.includes(want), `${pv.weightP} → ${l.weightP} 应为「${want}」`)
  }
  if (p.growth?.latest) {
    // 端到端防回归：伪造「档位下降」的画像，必须渲染出「趋势下降」，不得退回「平稳」
    const fake = {
      ...p,
      growth: {
        ...p.growth,
        previous: { ...(p.growth.previous || {}), weightP: '高于P97' },
        latest: { ...p.growth.latest, weightP: 'P50-P85' },
      },
    }
    check('伪造档位下降 → 渲染「趋势下降」（防退回恒"平稳"）', /，趋势下降/.test(renderProfileBlock(fake)))
    // 认不出的档位必须不表态，而不是冒充「平稳」
    const weird = { ...p, growth: { ...p.growth, previous: { ...(p.growth.previous || {}), weightP: '???' } } }
    const weirdBlock = renderProfileBlock(weird)
    check('档位认不出时不冒充「趋势平稳」', !/，趋势平稳/.test(weirdBlock))
  }
}

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL')
const { closeDb } = await import('../src/lib/db.js')
await closeDb()
process.exit(fail ? 1 : 0)
