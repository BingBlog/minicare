/**
 * 重刷 record_timeline 中时长类（母乳/睡眠/活动）summary_value 的展示格式
 *
 * 背景：timeline.service.ts 旧逻辑把 duration_min 以裸分钟数字写入 summary_value
 * （如 "120"），导致记录列表页（feed 读物化表）时长显示为数字而非 "2h"。
 * 2026-09-07 起服务端写入已改为格式化文本；本脚本用于一次性纠正历史物化行。
 *
 * 幂等：只对「当前 summary_value 与按源表 duration_min 计算的展示文本不一致」的行做 UPDATE，
 * 可重复执行。
 *
 * 用法：
 *   node scripts/backfill-duration-summary.mjs                                  # 默认库（.env.local 的 DB_NAME）
 *   node scripts/backfill-duration-summary.mjs --db=minicare-cloud-6gqledlle0132cbe  # 指定库
 */
import mysql from 'mysql2/promise'
import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const dbArg = process.argv.slice(2).find((a) => a.startsWith('--db='))
const dbName = dbArg ? dbArg.slice(5) : env.DB_NAME

const pool = await mysql.createPool({
  host: env.DB_HOST,
  port: Number(env.DB_PORT || 3306),
  database: dbName,
  user: env.DB_USER,
  password: env.DB_PASS,
  timezone: '+08:00',
  dateStrings: true,
})

/** 与 timeline.service.formatDurationLabel / 前端 fmtDuration 一致的展示文本 */
function fmtLabel(durationMin) {
  if (durationMin == null) return null
  const min = Number(durationMin)
  if (!Number.isFinite(min) || min <= 0) return null
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/** 三类时长源：join 条件 + 时长列来源表 */
const SOURCES = [
  {
    name: 'sleep(睡眠)',
    where: "rt.source_type = 'sleep'",
    join: 'JOIN sleep_record sr ON rt.source_id = sr.id',
    durationCol: 'sr.duration_min',
  },
  {
    name: 'activity(活动)',
    where: "rt.source_type = 'activity'",
    join: 'JOIN activity_record ar ON rt.source_id = ar.id',
    durationCol: 'ar.duration_min',
  },
  {
    name: 'breast(母乳)',
    where: "rt.source_type = 'feeding' AND JSON_UNQUOTE(JSON_EXTRACT(rt.detail_json, '$.feed_type')) = 'breast'",
    join: 'JOIN feeding_breast_record fbr ON rt.source_id = fbr.id',
    durationCol: 'fbr.duration_min',
  },
]

let totalUpdated = 0
const samples = []

for (const src of SOURCES) {
  const [rows] = await pool.query(
    `SELECT rt.timeline_id, rt.summary_value AS cur_value, ${src.durationCol} AS duration_min
     FROM record_timeline rt
     ${src.join}
     WHERE ${src.where}`,
  )

  let updated = 0
  for (const row of rows) {
    const expected = fmtLabel(row.duration_min)
    const cur = row.cur_value == null ? null : String(row.cur_value)
    if (expected !== cur) {
      await pool.execute('UPDATE record_timeline SET summary_value = ? WHERE timeline_id = ?', [
        expected,
        row.timeline_id,
      ])
      updated += 1
      if (samples.length < 8) samples.push({ type: src.name, timeline_id: row.timeline_id, duration_min: row.duration_min, from: cur, to: expected })
    }
  }

  console.log(`[${src.name}] 共 ${rows.length} 行，更新 ${updated} 行`)
  totalUpdated += updated
}

console.log(`\n合计更新 ${totalUpdated} 行`)
for (const s of samples) {
  console.log(`  ${s.type} timeline_id=${s.timeline_id} duration=${s.duration_min}  "${s.from}" → "${s.to}"`)
}

await pool.end()
