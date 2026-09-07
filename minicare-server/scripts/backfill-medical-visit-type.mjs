/**
 * 回填 record_timeline.medical_visit_type（020 物化冗余列）
 *
 * 背景：020 迁移给 record_timeline 增加 medical_visit_type（仅 source_type='medical' 行填充），
 * feed 子类型过滤依赖该列。迁移前已物化的历史行该列为 NULL，需按源表 medical_record.visit_type
 * 幂等回填；源行已删除的孤儿 timeline 行无法 join，保持 NULL（前端 subtype='unknown' 语义），
 * 本脚本给出孤儿清单告警。
 *
 * 幂等：只对「medical_visit_type 与源表 visit_type 不一致」的行做 UPDATE，可重复执行。
 *
 * 用法：
 *   node scripts/backfill-medical-visit-type.mjs                                  # 默认库（.env.local 的 DB_NAME）
 *   node scripts/backfill-medical-visit-type.mjs --db=minicare-cloud-6gqledlle0132cbe  # 指定库（生产）
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

// 前置检查：record_timeline 须已含 medical_visit_type 列（020 迁移）
const [cols] = await pool.query(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'record_timeline' AND COLUMN_NAME = 'medical_visit_type'`,
)
if (cols.length === 0) {
  console.error(`[FATAL] ${dbName}.record_timeline 缺少 medical_visit_type 列，请先执行 020_medical_typed_records 迁移`)
  await pool.end()
  process.exit(1)
}

// 1) 主回填：UPDATE ... JOIN 源表，仅改不一致行（幂等）。
//    注意：mysql2 默认 CLIENT_FOUND_ROWS，affectedRows 统计「匹配行」而非「修改行」，
//    故 WHERE 限定 m.visit_type IS NOT NULL（NULL 源行属 unknown 语义，不参与回填），
//    保证每个匹配行必然产生修改，日志口径 = 实际修复行数。
const [upd] = await pool.execute(
  `UPDATE record_timeline rt
   JOIN medical_record m ON rt.source_id = m.id
   SET rt.medical_visit_type = m.visit_type
   WHERE rt.source_type = 'medical'
     AND m.visit_type IS NOT NULL
     AND (rt.medical_visit_type IS NULL OR rt.medical_visit_type <> m.visit_type)`,
)
console.log(`[回填] medical_visit_type 修复 ${upd.affectedRows} 行`)

// 2) 反向孤儿：源表存在但 timeline 无行（feed 走物化表读不到；提示性质，非本脚本修复范围）
const [srcMissing] = await pool.query(
  `SELECT COUNT(*) AS n FROM medical_record m
   LEFT JOIN record_timeline rt ON rt.source_id = m.id AND rt.source_type = 'medical'
   WHERE rt.timeline_id IS NULL`,
)
const missingN = Number(srcMissing[0]?.n ?? 0)
console.log(`[孤儿-反向] medical_record 无 timeline 行 ${missingN} 条（如需出现于 feed 列表请走 upsertFromSource 重物化）`)

// 3) 未分型行分类：join 不上源表（m.id IS NULL）= 孤儿；join 上但 visit_type 为空 = 老数据未分型
//    （两类均保持 NULL，前端以 unknown 呈现）
const [untypedRows] = await pool.query(
  `SELECT rt.timeline_id, rt.source_id, m.id AS src_id, m.visit_type AS src_visit_type
   FROM record_timeline rt
   LEFT JOIN medical_record m ON rt.source_id = m.id
   WHERE rt.source_type = 'medical' AND rt.medical_visit_type IS NULL
   LIMIT 20`,
)
const orphanTrue = untypedRows.filter((r) => r.src_id === null)
const legacyUntyped = untypedRows.filter((r) => r.src_id !== null)
console.log(`[未分型] medical timeline 共 ${untypedRows.length} 条保持 NULL：孤儿 ${orphanTrue.length}（join 不上源表）、老数据未分型 ${legacyUntyped.length}（源 visit_type 为空）`)
for (const r of untypedRows.slice(0, 8)) {
  const kind = r.src_id === null ? '孤儿' : '老数据未分型'
  console.log(`  [${kind}] timeline_id=${r.timeline_id} source_id=${r.source_id}`)
}

// 4) 终态核对：仅统计「源表有 visit_type 但物化列不一致」的行，应归 0（源 visit_type 为空的行属 unknown 语义，天然一致）
const [left] = await pool.query(
  `SELECT COUNT(*) AS n
   FROM record_timeline rt
   JOIN medical_record m ON rt.source_id = m.id
   WHERE rt.source_type = 'medical' AND m.visit_type IS NOT NULL
     AND (rt.medical_visit_type IS NULL OR rt.medical_visit_type <> m.visit_type)`,
)
console.log(`[终态] 与源表不一致残留 ${Number(left[0]?.n ?? 0)} 行（应 0）`)

await pool.end()
