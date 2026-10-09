/**
 * dev 旺仔细节核查 #2（一次性）：睡眠 trend / 辅食名 / 补充剂 / 生长百分位 / 今日喂养
 */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
import mysql from 'mysql2/promise'

const babyId = '8535bda2-7cdf-45c3-ba37-34a580822e5f'
const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 21002),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: 'minicare_dev', dateStrings: true, timezone: '+08:00',
})

// 1. 近 7 天睡眠按天
{
  const [r] = await conn.query(`SELECT DATE(start_time) AS d, SUM(duration_min) AS total, COUNT(*) AS cnt FROM sleep_record WHERE baby_id=? AND status='ended' AND start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY DATE(start_time) ORDER BY d`, [babyId])
  console.log('睡眠近7天按天:', JSON.stringify(r))
}
// 2. 辅食名列表（近 7 天 + join item）
{
  const [r] = await conn.query(`SELECT i.food_name, COUNT(*) AS n FROM feeding_food_record f LEFT JOIN feeding_food_item i ON i.record_id=f.id WHERE f.baby_id=? AND f.record_time >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY i.food_name ORDER BY n DESC`, [babyId])
  console.log('辅食近30天:', JSON.stringify(r))
}
// 3. 补充剂内容
{
  const [r] = await conn.query(`SELECT supplement_items, COUNT(*) AS n FROM feeding_supplement_record WHERE baby_id=? AND record_time >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY supplement_items`, [babyId])
  console.log('补充剂:', JSON.stringify(r).slice(0, 500))
}
// 4. 今日喂养
{
  const [[f]] = await conn.query(`SELECT COUNT(*) AS n, SUM(formula_ml) AS ml FROM feeding_formula_record WHERE baby_id=? AND DATE(record_time)=CURDATE()`, [babyId])
  console.log(`今日配方奶: ${f.n}次 / ${f.ml}ml`)
}
// 5. 尿布类型分布
{
  const [r] = await conn.query(`SELECT diaper_type, COUNT(*) AS n FROM diaper_record WHERE baby_id=? AND record_time >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY diaper_type`, [babyId])
  console.log('尿布类型近7天:', JSON.stringify(r))
}
// 6. 母乳近 90 天明细
{
  const [r] = await conn.query(`SELECT record_time, duration_min FROM feeding_breast_record WHERE baby_id=? AND record_time >= DATE_SUB(NOW(), INTERVAL 90 DAY) ORDER BY record_time`, [babyId])
  console.log('母乳近90天:', JSON.stringify(r))
}
await conn.end()

// 7. 生长百分位：调 analyze_baby_data 工具真实输出
const { initDb, closeDb } = await import('../src/lib/db.js')
const { loadConfig } = await import('../src/config.js')
const config = loadConfig()
initDb(config)
const { getToolExecutor } = await import('../src/lib/tools/index.js')
const analyze = getToolExecutor('analyze_baby_data')
const out = await analyze({ scope: 'growth' }, { userId: 'eval', familyId: '5143aa2e-5d18-4a04-af9f-d783e24a528d', babyId })
console.log('\nanalyze(growth) 输出:', out.slice(0, 1200))
await closeDb()
