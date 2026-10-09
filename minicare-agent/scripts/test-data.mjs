/**
 * P2 数据工具自测（scripts/test-data.mjs）
 *
 * 用法：node scripts/test-data.mjs [babyId]（默认取 dev 库第一个宝宝）
 */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
import { initDb, closeDb } from '../src/lib/db.js'
import { loadConfig } from '../src/config.js'
import { queryMetric, METRICS } from '../src/lib/query.js'
import { percentileOf } from '../src/lib/growth.js'
import { executeQueryBabyData } from '../src/lib/tools/query-baby-data.js'
import { executeAnalyzeBabyData } from '../src/lib/tools/analyze-baby-data.js'
import { executeGenerateDiary } from '../src/lib/tools/generate-diary.js'

const BABY = process.argv[2] || '8535bda2-7cdf-45c3-ba37-34a580822e5f'
const ctx = { userId: '00000000-0000-0000-0000-000000000001', familyId: '6bfa926a-62f5-4e91-99de-b53a161e008e', babyId: BABY }

const config = loadConfig()
initDb(config)

// 宝宝档案（性别/生日）用于 growth 解读
const { getDb } = await import('../src/lib/db.js')
const [[profile]] = await getDb().query('SELECT gender, birth_date FROM baby_profile WHERE id=?', [BABY])
console.log('宝宝档案:', profile ? `${profile.gender} ${profile.birth_date}` : '未知')

console.log(`\n=== queryMetric 各维度（30 天）===\n`)
for (const metric of METRICS) {
  const r = await queryMetric(BABY, metric, 30, 'count')
  console.log(`[${metric}] ${r.hasData ? '有数据 ' + r.count + ' 条' : '无数据'} ${r.note}`)
}

console.log(`\n=== query_baby_data 工具（feeding sum / sleep trend / growth list）===\n`)
console.log((await executeQueryBabyData({ metric: 'feeding', days: 30, aggregate: 'sum' }, ctx)).slice(0, 400))
console.log()
console.log((await executeQueryBabyData({ metric: 'sleep', days: 30, aggregate: 'trend' }, ctx)).slice(0, 600))
console.log()
console.log((await executeQueryBabyData({ metric: 'growth', days: 90, aggregate: 'list' }, ctx)).slice(0, 400))

console.log(`\n=== analyze_baby_data 工具 ===\n`)
console.log('-- trend (sleep) --')
console.log((await executeAnalyzeBabyData({ scope: 'trend', metric: 'sleep', days: 30 }, ctx)).slice(0, 500))
console.log('\n-- summary --')
console.log((await executeAnalyzeBabyData({ scope: 'summary', days: 7 }, ctx)).slice(0, 800))
console.log('\n-- growth --')
console.log((await executeAnalyzeBabyData({ scope: 'growth', days: 90 }, ctx)).slice(0, 600))

console.log(`\n=== generate_diary 工具 ===\n`)
console.log((await executeGenerateDiary({}, ctx)).slice(0, 500))

console.log(`\n=== growth.js 单测 ===\n`)
console.log('男 6 月龄 8kg →', JSON.stringify(percentileOf(6, 'male', 'weight', 8)))
console.log('女 12 月龄 9.5kg →', JSON.stringify(percentileOf(12, 'female', 'weight', 9.5)))
console.log('男 3 月龄 62cm →', JSON.stringify(percentileOf(3, 'male', 'height', 62)))

await closeDb()
