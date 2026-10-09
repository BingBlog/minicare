/**
 * 工具改进验证（临时脚本，SELECT-only）
 * 验证：辅食名 join、补充剂 JSON 解析、medical 维度、按日期查询、生长百分位按测量日
 */
import { initDb, closeDb } from '../src/lib/db.js'
import { queryMetric, queryMetricOnDate } from '../src/lib/query.js'
import { executeAnalyzeBabyData } from '../src/lib/tools/analyze-baby-data.js'
import { executeGenerateDiary } from '../src/lib/tools/generate-diary.js'

const WZ = 'a54c8980-2aac-473c-a26f-a150fce7ec70'
const ctx = { userId: '308572f1-65ed-435e-a8e4-791a916b0f41', familyId: '6bb0e45b-d808-49cf-84c2-9ef7e40abe84', babyId: WZ }

initDb({ db: {
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 21002), name: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
} })

// 1. feeding list：应含 food_name 与 supplement_items
const f = await queryMetric(WZ, 'feeding', 7, 'list')
const foodRows = f.rows.filter((r) => r.type === '辅食')
const supRows = f.rows.filter((r) => r.type === '营养素')
console.log('[1] feeding list ok=', f.ok, 'rows=', f.rows.length)
console.log('    food 样例:', JSON.stringify(foodRows.slice(0, 3)))
console.log('    supplement 样例:', JSON.stringify(supRows.slice(0, 2)))

// 2. medical 维度
const m = await queryMetric(WZ, 'medical', 90, 'list')
console.log('[2] medical:', JSON.stringify({ ok: m.ok, count: m.count, rows: m.rows.map((r) => ({ visit_date: r.visit_date, visit_type: r.visit_type, diagnosis: r.diagnosis, hospital: r.hospital })) }))

// 3. 按日期查询（2026-08-28 应有记录；2026-08-01 无记录？）
const d1 = await queryMetricOnDate(WZ, 'feeding', '2026-08-28')
const d2 = await queryMetricOnDate(WZ, 'sleep', '2026-08-25')
const d3 = await queryMetricOnDate(WZ, 'diaper', '2026-08-26')
console.log('[3] onDate feeding 08-28:', JSON.stringify({ ok: d1.ok, count: d1.count, rows: d1.rows.slice(0, 2) }))
console.log('    onDate sleep 08-25:', JSON.stringify({ ok: d2.ok, count: d2.count, first: d2.rows[0] }))
console.log('    onDate diaper 08-26:', JSON.stringify({ ok: d3.ok, count: d3.count }))

// 4. 生长百分位（应显示 measuredAt=2026-06-09 与对应月龄的百分位）
const g = JSON.parse(await executeAnalyzeBabyData({ scope: 'growth', days: 90 }, ctx))
console.log('[4] growth:', JSON.stringify(g))

// 5. 日记（指定 2026-08-29，应聚合当天记录而非 NOW 窗口）
const diary = JSON.parse(await executeGenerateDiary({ date: '2026-08-29' }, ctx))
console.log('[5] diary:', JSON.stringify({ date: diary.date, baby: diary.baby, dims: diary.records.map((r) => `${r.metric}:${r.count}`), photos: diary.photos.length }))

await closeDb()
