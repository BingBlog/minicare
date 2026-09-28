/**
 * 生产库宝宝记录普查（只读）
 *
 * 运行：cd agent-poc && NODE_OPTIONS= node scripts/baby-census.mjs
 *
 * 用途：找出"记录信息最多"的宝宝 —— 按各业务表条数加权排序，
 * 供后续画像/现状感知复算选目标（避免按名字 LIKE 查，生产库同名宝宝不止一个）。
 *
 * 连接：与 deploy-agent.mjs 同源 —— minicare-kb/.env 的 DB_* + 库名固定生产库。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KB_ENV = path.resolve(__dirname, '../../minicare-kb/.env')
const PROD_DB_NAME = 'minicare-cloud-6gqledlle0132cbe'

const kb = {}
for (const line of readFileSync(KB_ENV, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) kb[m[1]] = m[2].trim()
}

const db = mysql.createPool({
  host: kb.DB_HOST,
  port: Number(kb.DB_PORT || 3306),
  database: PROD_DB_NAME,
  user: kb.DB_USER,
  password: kb.DB_PASSWORD,
  timezone: '+08:00',
  dateStrings: true,
  connectionLimit: 2,
})
await db.query("SET time_zone = '+08:00'")

// 记录量来源表（baby_id 维度）——按"家长实际录入"的代表性排列
const TABLES = [
  ['feeding_breast_record', '母乳'],
  ['feeding_formula_record', '配方奶'],
  ['feeding_food_record', '辅食'],
  ['feeding_supplement_record', '营养补充'],
  ['sleep_record', '睡眠'],
  ['diaper_record', '尿布'],
  ['growth_record', '生长'],
  ['health_record', '健康'],
  ['symptom_record', '表现'],
  ['activity_record', '活动'],
  ['medical_record', '就医'],
  ['medication_record', '服药'],
  ['food_observation', '排敏建档'],
  ['baby_diary', '日记'],
]

// 探测每张表是否有 deleted_at（软删需过滤）
const [delCols] = await db.query(
  `SELECT TABLE_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'deleted_at'`,
)
const hasSoftDel = new Set(delCols.map((r) => r.TABLE_NAME))

// 逐表统计：先按 baby 聚合
const perBaby = new Map()
for (const [table, label] of TABLES) {
  let rows
  try {
    const where = hasSoftDel.has(table) ? 'WHERE deleted_at IS NULL' : ''
    ;[rows] = await db.query(
      `SELECT baby_id, COUNT(*) AS n FROM ${table} ${where} GROUP BY baby_id`,
    )
  } catch (e) {
    console.log(`  (跳过 ${table}：${e.code || e.message})`)
    continue
  }
  for (const r of rows) {
    if (!r.baby_id) continue
    if (!perBaby.has(r.baby_id)) perBaby.set(r.baby_id, { total: 0, detail: {} })
    const b = perBaby.get(r.baby_id)
    b.total += Number(r.n)
    b.detail[label] = Number(r.n)
  }
}

// 宝宝资料
const [babies] = await db.query(
  `SELECT id, name, gender, birth_date, created_at, deleted_at FROM baby_profile`,
)

console.log('\n' + '═'.repeat(96))
console.log(`生产库：${PROD_DB_NAME}   baby_profile 共 ${babies.length} 条（含软删）`)
console.log('═'.repeat(96))

const rows = babies
  .map((b) => ({
    ...b,
    rec: perBaby.get(b.id) || { total: 0, detail: {} },
  }))
  .sort((a, b) => b.rec.total - a.rec.total)

for (const b of rows) {
  const mark = b.deleted_at ? ' [已软删]' : ''
  console.log(`\n${b.name}${mark}  ${b.id}`)
  console.log(`  出生 ${b.birth_date}  性别 ${b.gender}  建号 ${String(b.created_at).slice(0, 19)}  → 记录 ${b.rec.total} 条`)
  const d = Object.entries(b.rec.detail).sort((x, y) => y[1] - x[1])
  if (d.length) console.log('  ' + d.map(([k, v]) => `${k} ${v}`).join(' ｜ '))
}

console.log('\n' + '─'.repeat(96))
const top = rows.filter((r) => !r.deleted_at)[0]
console.log(`记录最多的有效宝宝：${top.name}  ${top.id}  （${top.rec.total} 条）`)
console.log('─'.repeat(96) + '\n')

await db.end()
process.exit(0)
