/**
 * 重刷 record_timeline 中医疗行的展示摘要（summary_title + summary_tags_json）
 *
 * 背景（两件事一次回填）：
 * 1) 【主要】诊断标签长文本整段进列表 pill，超出容器被硬裁（2026-10-12 实证：
 *    「发热、急性上呼吸道感染、细菌感染、急性上呼吸道」22 字 pill 裁切）。
 *    服务端已收敛为「前 2 项 + 等N项（保留结尾）/ 30 字宽松上限」（buildDiagnosisTag）；
 * 2) 【对齐】早期物化的医疗行 title 仍是「医疗」、tags 含类型前缀（如「疫苗接种」），
 *    与现行语义（title=类型名，tags=[机构, 诊断]）不一致；本脚本把历史行统一到现行格式。
 *
 * 幂等：只对「当前值 ≠ 按现行规则计算的期望值」的行做 UPDATE，可重复执行。
 *
 * 用法：
 *   node scripts/backfill-medical-summary-format.mjs                                      # 默认库（.env.local 的 DB_NAME）
 *   node scripts/backfill-medical-summary-format.mjs --db=minicare-cloud-6gqledlle0132cbe  # 指定库（生产）
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

/** 与 timeline.service.visitTypeLabel 保持一致 */
const VISIT_TYPE_LABELS = {
  checkup: '儿保检查',
  sick: '就诊记录',
  vaccine: '疫苗接种',
  other: '其他检查',
  allergy: '过敏原检测',
  blood: '血液检查',
}

/**
 * 与 timeline.service.buildDiagnosisTag 保持一致：
 * - 顿号/逗号分隔且 > 2 项 →「前 2 项 + 等N项」；超 16 字保留「等N项」结尾、中间省略
 * - 单句/双句 > 30 字 → 截断 29 字 + …
 */
function buildDiagnosisTag(diagnosis) {
  const raw = String(diagnosis ?? '').trim()
  if (!raw) return ''
  const items = raw
    .split(/[、,，;；]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (items.length > 2) {
    const head = items.slice(0, 2).join('、')
    const suffix = `等${items.length}项`
    const label = head + suffix
    if (label.length <= 16) return label
    const avail = Math.max(16 - suffix.length - 1, 4)
    return `${head.slice(0, avail)}…${suffix}`
  }
  return raw.length > 30 ? `${raw.slice(0, 29)}…` : raw
}

/** 与 timeline.service.loadMedicalPayload 的 tags 组装保持一致 */
function expectedTags(row) {
  const diagnosisTag = buildDiagnosisTag(row.diagnosis)
  if (row.visit_type === 'vaccine') {
    return [row.vaccine_name ?? row.hospital ?? '', diagnosisTag].filter(Boolean)
  }
  return [row.hospital ?? '', diagnosisTag].filter(Boolean)
}

/** JSON 列现值兼容解析（mysql2 可能返回字符串或已解析值） */
function parseCur(v) {
  if (v == null) return null
  if (typeof v === 'string') {
    try {
      return JSON.parse(v)
    } catch {
      return null
    }
  }
  return v
}

// 主回填：仅改不一致行（幂等）
const [rows] = await pool.query(
  `SELECT rt.timeline_id, rt.summary_title AS cur_title, rt.summary_tags_json AS cur,
          m.visit_type, m.hospital, m.diagnosis, m.vaccine_name
   FROM record_timeline rt
   JOIN medical_record m ON rt.source_id = m.id
   WHERE rt.source_type = 'medical'
   ORDER BY rt.timeline_id`,
)

let updated = 0
const samples = []
for (const row of rows) {
  // title：visit_type 有效时对齐为类型名；NULL（迁移前老数据）保持现值
  const expectedTitle = row.visit_type
    ? (VISIT_TYPE_LABELS[row.visit_type] ?? row.visit_type)
    : null
  const tags = expectedTags(row)
  const expTagsJson = tags.length ? JSON.stringify(tags) : null

  const curParsed = parseCur(row.cur)
  const curTagsJson = curParsed == null ? null : JSON.stringify(curParsed)
  const titleChanged = expectedTitle != null && expectedTitle !== row.cur_title
  const tagsChanged = curTagsJson !== expTagsJson
  if (!titleChanged && !tagsChanged) continue

  await pool.execute(
    `UPDATE record_timeline
     SET summary_title = COALESCE(?, summary_title), summary_tags_json = ?
     WHERE timeline_id = ?`,
    [expectedTitle, expTagsJson, row.timeline_id],
  )
  updated += 1
  if (samples.length < 8) {
    samples.push({
      timelineId: row.timeline_id,
      title: titleChanged ? `${row.cur_title} → ${expectedTitle}` : row.cur_title,
      before: curTagsJson,
      after: expTagsJson,
    })
  }
}

console.log(`[回填] 医疗物化摘要修复 ${updated} 行（共扫描 ${rows.length} 行）`)
for (const s of samples) {
  console.log(`  · #${s.timelineId}  title: ${s.title}`)
  if (s.before !== s.after) {
    console.log(`      tags 旧: ${s.before}`)
    console.log(`      tags 新: ${s.after}`)
  }
}

// 孤儿检查：source 行已删的 medical 物化行无法 join，保持原样并告警
const [orphans] = await pool.query(
  `SELECT COUNT(*) AS n FROM record_timeline rt
   LEFT JOIN medical_record m ON rt.source_id = m.id
   WHERE rt.source_type = 'medical' AND m.id IS NULL`,
)
if (orphans[0].n > 0) {
  console.warn(`[告警] ${orphans[0].n} 行 medical 物化记录找不到源行（孤儿），已跳过，请人工核对`)
}

await pool.end()
