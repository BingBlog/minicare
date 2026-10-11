#!/usr/bin/env node
/**
 * 生产库宝宝 → dev 库目标宝宝「镜像同步」（可重复执行）
 *
 * 场景：本地 dev 环境 agent 测试数据不足，把线上最全的宝宝数据全量镜像到 dev。
 * 策略：备份 dev 现有数据 →（事务内）清空 dev 目标宝宝数据 → 跨库灌入 prod 数据 → 验证。
 * 改写：baby_id / family_id / 用户列（recorded_by、created_by、author_id 等）统一
 *       替换为 dev 测试身份；业务主键 UUID 原样保留（排除自增列），
 *       保证子表引用 / record_timeline.source_id 完整。
 *
 * 用法（cd minicare-agent）：
 *   NODE_OPTIONS= node scripts/sync-baby-to-dev.mjs              # 正式执行
 *   NODE_OPTIONS= node scripts/sync-baby-to-dev.mjs --dry-run    # 预演（事务执行完回滚）
 *   NODE_OPTIONS= node scripts/sync-baby-to-dev.mjs --verify-only # 仅验证
 *
 * 安全约束：所有写操作只发生在 DEV_DB；PROD_DB 仅 SELECT。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── 连接凭据（平台 .env 为唯一真相源）────────────────────────
const KB_ENV = path.resolve(__dirname, '../../minicare-platform/api/.env')
const kb = {}
for (const line of readFileSync(KB_ENV, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) kb[m[1]] = m[2].trim()
}

// ── 同步配置 ────────────────────────────────────────────────
const PROD_DB = 'minicare-cloud-6gqledlle0132cbe' // 只读
const DEV_DB = 'minicare_dev'                     // 唯一写入目标
const SRC_BABY = 'a54c8980-2aac-473c-a26f-a150fce7ec70' // 线上旺仔（普查记录最全）

const DST = {
  babyId: '8535bda2-7cdf-45c3-ba37-34a580822e5f',
  familyId: '5143aa2e-5d18-4a04-af9f-d783e24a528d',
  userId: 'b42b4c6f-5a57-413d-815a-af16e790f4a1', // 测试账号 13146989718（与 eval.ctx 一致）
}

// 无 baby_id 列、经父表关联的子表
const CHILD_TABLES = [
  { table: 'feeding_food_item', parent: 'feeding_food_record' },
  { table: 'feeding_formula_mix', parent: 'feeding_formula_record' },
]

// 迁移数据内部的外键列（值可能因 UUID 重分配而改写）
const REF_COLS = new Map([
  ['record_timeline', ['source_id']],
  ['feeding_formula_mix', ['record_id']],
  ['feeding_food_item', ['record_id']],
  ['food_observation_log', ['health_record_id', 'observation_id']],
  ['medication_record', ['medication_id']],
  ['health_record', ['observation_id']],
])

// dev 侧保留不动的表（设置类数据，非记录；线上无此数据）
const KEEP_TABLES = new Set(['schedule_template_item'])

// 用户列改写：值统一为 dev 测试身份
const REWRITE_COLS = {
  baby_id: DST.babyId,
  family_id: DST.familyId,
  recorded_by: DST.userId,
  created_by: DST.userId,
  author_id: DST.userId,
  updated_by: DST.userId,
}

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const VERIFY_ONLY = args.includes('--verify-only')
const SKIP_BACKUP = args.includes('--skip-backup')

const BACKUP_DIR = path.resolve(__dirname, 'backup')

// ── 工具函数 ────────────────────────────────────────────────
const c = { red: s => `\x1b[31m${s}\x1b[0m`, green: s => `\x1b[32m${s}\x1b[0m`, yellow: s => `\x1b[33m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m`, bold: s => `\x1b[1m${s}\x1b[0m` }
const quoteId = id => `\`${id}\``
const q = v => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

async function getCols(conn, db, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME, EXTRA FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
    [db, table],
  )
  return rows.map(r => ({ name: r.COLUMN_NAME, autoInc: r.EXTRA === 'auto_increment' }))
}

function ts() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

// 生成 CASE 映射表达式：命中 oldId 的行改写为 newId，其余保持原值
function buildCase(colExpr, map) {
  const branches = [...map].map(([o, n]) => `WHEN ${q(o)} THEN ${q(n)}`).join(' ')
  return `CASE ${colExpr} ${branches} ELSE ${colExpr} END`
}

// ── 主流程 ──────────────────────────────────────────────────
const base = {
  host: kb.DB_HOST,
  port: Number(kb.DB_PORT || 3306),
  user: kb.DB_USER,
  password: kb.DB_PASSWORD,
  database: DEV_DB, // 默认库：多表 DELETE（DELETE i FROM ... JOIN）需要默认库上下文，否则 CynosDB 报 "No database selected"
  timezone: '+08:00',
  dateStrings: true,
  multipleStatements: false,
}

const conn = await mysql.createConnection(base)
await conn.query(`SET time_zone = '+08:00'`)

console.log(c.bold(`\n╔═══ 生产库宝宝 → dev 镜像同步 ${DRY_RUN ? '（DRY-RUN 预演）' : VERIFY_ONLY ? '（仅验证）' : ''} ═══╗`))
console.log(`  源：${PROD_DB} / ${SRC_BABY}`)
console.log(`  目标：${DEV_DB} / ${DST.babyId}`)
console.log(`  改写身份：family=${DST.familyId} user=${DST.userId}\n`)

// ── 动态获取表清单 ──
const prodBabyTables = (await conn.query(
  `SELECT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND COLUMN_NAME='baby_id' ORDER BY TABLE_NAME`, [PROD_DB]))[0].map(r => r.TABLE_NAME)
const devBabyTables = (await conn.query(
  `SELECT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND COLUMN_NAME='baby_id' ORDER BY TABLE_NAME`, [DEV_DB]))[0].map(r => r.TABLE_NAME)

const migrateTables = prodBabyTables.filter(t => !KEEP_TABLES.has(t) && devBabyTables.includes(t)) // 灌入清单
const cleanTables = devBabyTables.filter(t => !KEEP_TABLES.has(t)) // 清空清单（含 dev 独有表如 saved_reports）

// 安全断言
if (DEV_DB !== 'minicare_dev') throw new Error('安全断言失败：写入目标必须是 minicare_dev')
console.log(`  清空 dev 表：${cleanTables.length} 张 ｜ 灌入：${migrateTables.length} 张 + ${CHILD_TABLES.length} 张子表 ｜ 保留：${[...KEEP_TABLES].join(', ')}\n`)

// ── 仅验证模式 ──
// timeline.source_type → 对应业务表（source_id 引用，无 FK 保护，需手动核对）
const SOURCE_MAP = {
  feeding: ['feeding_formula_record', 'feeding_food_record', 'feeding_breast_record', 'feeding_supplement_record'],
  sleep: ['sleep_record'], diaper: ['diaper_record'], health: ['health_record'],
  growth: ['growth_record'], medication: ['medication_record'], medical: ['medical_record'],
  symptom: ['symptom_record'], activity: ['activity_record'],
}

async function orphanCount(db, babyId, type, tables) {
  const union = tables.map(tb => `SELECT id FROM ${quoteId(db)}.${quoteId(tb)} WHERE baby_id=?`).join(' UNION ALL ')
  const [[r]] = await conn.query(
    `SELECT COUNT(*) n FROM ${quoteId(db)}.record_timeline t
     WHERE t.baby_id=? AND t.source_type=? AND NOT EXISTS (SELECT 1 FROM (${union}) u WHERE u.id=t.source_id)`,
    [babyId, type, ...tables.map(() => babyId)],
  )
  return r.n
}

async function verify() {
  console.log(c.bold('═══ 验证：逐表行数对比（prod 旺仔 ⟷ dev 目标）═══'))
  let allOk = true
  for (const t of migrateTables) {
    const [[p]] = await conn.query(`SELECT COUNT(*) n FROM ${quoteId(PROD_DB)}.${quoteId(t)} WHERE baby_id=?`, [SRC_BABY])
    const [[d]] = await conn.query(`SELECT COUNT(*) n FROM ${quoteId(DEV_DB)}.${quoteId(t)} WHERE baby_id=?`, [DST.babyId])
    const ok = p.n === d.n
    if (!ok) allOk = false
    console.log(`  ${ok ? c.green('✔') : c.red('✘')} ${t.padEnd(30)} prod=${String(p.n).padEnd(6)} dev=${String(d.n).padEnd(6)}`)
  }
  for (const { table, parent } of CHILD_TABLES) {
    const [[p]] = await conn.query(`SELECT COUNT(*) n FROM ${quoteId(PROD_DB)}.${quoteId(table)} i JOIN ${quoteId(PROD_DB)}.${quoteId(parent)} f ON f.id=i.record_id WHERE f.baby_id=?`, [SRC_BABY])
    const [[d]] = await conn.query(`SELECT COUNT(*) n FROM ${quoteId(DEV_DB)}.${quoteId(table)} i JOIN ${quoteId(DEV_DB)}.${quoteId(parent)} f ON f.id=i.record_id WHERE f.baby_id=?`, [DST.babyId])
    const ok = p.n === d.n
    if (!ok) allOk = false
    console.log(`  ${ok ? c.green('✔') : c.red('✘')} ${table.padEnd(30)} prod=${String(p.n).padEnd(6)} dev=${String(d.n).padEnd(6)} ${c.dim('(子表)')}`)
  }

  // 引用完整性：timeline.source_id 孤儿数（prod 与 dev 应一致）
  let orphanTotal = 0
  for (const [type, tables] of Object.entries(SOURCE_MAP)) {
    const p = await orphanCount(PROD_DB, SRC_BABY, type, tables)
    const d = await orphanCount(DEV_DB, DST.babyId, type, tables)
    if (p !== d) { allOk = false; console.log(`  ${c.red('✘')} timeline.${type} 孤儿数不一致 prod=${p} dev=${d}`) }
    orphanTotal += d
  }
  console.log(`  ${allOk ? c.green('✔') : c.red('✘')} timeline.source_id 引用完整性（孤儿总数 dev=${orphanTotal}，与 prod 一致）`)

  const [[tRange]] = await conn.query(`SELECT MIN(event_time) mn, MAX(event_time) mx FROM ${quoteId(DEV_DB)}.record_timeline WHERE baby_id=?`, [DST.babyId])
  console.log(`\n  dev timeline 时间范围: ${tRange.mn} ~ ${tRange.mx}`)
  console.log(allOk ? c.green('\n  全部一致 ✓\n') : c.red('\n  存在不一致 ✘\n'))
  return allOk
}

if (VERIFY_ONLY) {
  await verify()
  await conn.end()
  process.exit(0)
}

// ── Phase 1: 备份 dev 现有数据 ──────────────────────────────
if (!SKIP_BACKUP) {
  console.log(c.bold('Phase 1/3  备份 dev 现有数据'))
  const backup = { meta: { createdAt: new Date().toISOString(), devDb: DEV_DB, babyId: DST.babyId, note: 'sync-baby-to-dev.mjs 执行前备份' }, tables: {}, children: {} }
  let total = 0
  for (const t of cleanTables) {
    const [rows] = await conn.query(`SELECT * FROM ${quoteId(DEV_DB)}.${quoteId(t)} WHERE baby_id=?`, [DST.babyId])
    if (rows.length) { backup.tables[t] = rows; total += rows.length }
  }
  for (const { table, parent } of CHILD_TABLES) {
    const [rows] = await conn.query(`SELECT i.* FROM ${quoteId(DEV_DB)}.${quoteId(table)} i JOIN ${quoteId(DEV_DB)}.${quoteId(parent)} f ON f.id=i.record_id WHERE f.baby_id=?`, [DST.babyId])
    if (rows.length) { backup.children[table] = rows; total += rows.length }
  }
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
  const file = path.join(BACKUP_DIR, `dev-baby-${DST.babyId.slice(0, 8)}-${ts()}.json`)
  writeFileSync(file, JSON.stringify(backup, null, 1))
  console.log(`  ${c.green('✔')} 已备份 ${total} 行 → ${path.relative(process.cwd(), file)}  (${(JSON.stringify(backup).length / 1024).toFixed(0)} KB)\n`)
} else {
  console.log(c.yellow('Phase 1/3  已跳过备份（--skip-backup）\n'))
}

// ── Phase 2: 清空 + 灌入（事务）──────────────────────────────
console.log(c.bold(`Phase 2/3  ${DRY_RUN ? '清空+灌入（预演，将回滚）' : '清空+灌入'}  …`))
await conn.beginTransaction()
try {
  // 2a. 清空：先子表（经父表定位），再主干表
  for (const { table, parent } of CHILD_TABLES) {
    const [r] = await conn.query(`DELETE i FROM ${quoteId(DEV_DB)}.${quoteId(table)} i JOIN ${quoteId(DEV_DB)}.${quoteId(parent)} f ON f.id=i.record_id WHERE f.baby_id=?`, [DST.babyId])
    console.log(`  ${c.dim('清')} ${table.padEnd(30)} ${r.affectedRows} 行`)
  }
  for (const t of cleanTables) {
    const [r] = await conn.query(`DELETE FROM ${quoteId(DEV_DB)}.${quoteId(t)} WHERE baby_id=?`, [DST.babyId])
    console.log(`  ${c.dim('清')} ${t.padEnd(30)} ${r.affectedRows} 行`)
  }

  // 2b. 冲突扫描：dev 库已存在同 UUID 行（历史 seed 副本，挂在其他宝宝名下）
  //     → 为冲突行重新分配 UUID，并同步改写迁移数据内部的引用列
  const tableRemap = new Map() // table -> Map(old->new)
  const globalRemap = new Map() // 跨表全局 old->new（供引用列改写）
  for (const t of migrateTables) {
    const idCol = (await getCols(conn, DEV_DB, t)).find(x => x.name === 'id' && !x.autoInc)
    if (!idCol) continue // 无 UUID 主键（如 record_timeline 的 timeline_id 自增）→ 不可能冲突
    const [rows] = await conn.query(
      `SELECT p.id FROM ${quoteId(PROD_DB)}.${quoteId(t)} p
       WHERE p.baby_id=? AND EXISTS (SELECT 1 FROM ${quoteId(DEV_DB)}.${quoteId(t)} d WHERE d.id=p.id)`,
      [SRC_BABY],
    )
    if (rows.length) {
      const m = new Map(rows.map(r => [r.id, randomUUID()]))
      tableRemap.set(t, m)
      for (const [o, n] of m) globalRemap.set(o, n)
    }
  }
  for (const { table, parent } of CHILD_TABLES) {
    const [rows] = await conn.query(
      `SELECT i.id FROM ${quoteId(PROD_DB)}.${quoteId(table)} i
       JOIN ${quoteId(PROD_DB)}.${quoteId(parent)} f ON f.id=i.record_id
       WHERE f.baby_id=? AND EXISTS (SELECT 1 FROM ${quoteId(DEV_DB)}.${quoteId(table)} d WHERE d.id=i.id)`,
      [SRC_BABY],
    )
    if (rows.length) {
      const m = new Map(rows.map(r => [r.id, randomUUID()]))
      tableRemap.set(table, m)
      for (const [o, n] of m) globalRemap.set(o, n)
    }
  }
  if (globalRemap.size) {
    console.log(c.yellow(`  ⚠ ${globalRemap.size} 行 UUID 与 dev 现有数据冲突（历史副本）→ 重新分配并改写引用：`))
    for (const [t, m] of tableRemap) console.log(`      ${t}: ${m.size} 行`)
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
    const remapFile = path.join(BACKUP_DIR, `remap-${ts()}.json`)
    writeFileSync(remapFile, JSON.stringify(Object.fromEntries([...tableRemap].map(([t, m]) => [t, Object.fromEntries(m)])), null, 1))
    console.log(c.dim(`      映射明细 → ${path.relative(process.cwd(), remapFile)}`))
  }

  // 2c. 灌入：跨库 INSERT ... SELECT
  for (const t of migrateTables) {
    const prodCols = await getCols(conn, PROD_DB, t)
    const devCols = await getCols(conn, DEV_DB, t)
    const devSet = new Set(devCols.map(x => x.name))
    const cols = prodCols.filter(x => !x.autoInc && devSet.has(x.name)) // 交集，排除自增
    const colList = cols.map(x => quoteId(x.name)).join(', ')
    const refCols = REF_COLS.get(t) || []
    const exprList = cols.map(x => {
      if (x.name in REWRITE_COLS) return q(REWRITE_COLS[x.name])
      if (x.name === 'id' && tableRemap.has(t)) return buildCase(quoteId('id'), tableRemap.get(t))
      if (refCols.includes(x.name) && globalRemap.size) return buildCase(quoteId(x.name), globalRemap)
      return quoteId(x.name)
    }).join(', ')
    const [r] = await conn.query(
      `INSERT INTO ${quoteId(DEV_DB)}.${quoteId(t)} (${colList})
       SELECT ${exprList} FROM ${quoteId(PROD_DB)}.${quoteId(t)} WHERE baby_id=?`,
      [SRC_BABY],
    )
    console.log(`  ${c.green('灌')} ${t.padEnd(30)} ${r.affectedRows} 行`)
  }
  for (const { table, parent } of CHILD_TABLES) {
    const prodCols = await getCols(conn, PROD_DB, table)
    const devCols = await getCols(conn, DEV_DB, table)
    const devSet = new Set(devCols.map(x => x.name))
    const cols = prodCols.filter(x => !x.autoInc && devSet.has(x.name))
    const colList = cols.map(x => quoteId(x.name)).join(', ')
    const exprList = cols.map(x => {
      const src = `i.${quoteId(x.name)}`
      if (x.name === 'id' && tableRemap.has(table)) return buildCase(src, tableRemap.get(table))
      if ((x.name === 'record_id' || REF_COLS.get(table)?.includes(x.name)) && globalRemap.size) return buildCase(src, globalRemap)
      return src
    }).join(', ')
    const [r] = await conn.query(
      `INSERT INTO ${quoteId(DEV_DB)}.${quoteId(table)} (${colList})
       SELECT ${exprList} FROM ${quoteId(PROD_DB)}.${quoteId(table)} i
       JOIN ${quoteId(PROD_DB)}.${quoteId(parent)} f ON f.id=i.record_id
       WHERE f.baby_id=?`,
      [SRC_BABY],
    )
    console.log(`  ${c.green('灌')} ${table.padEnd(30)} ${r.affectedRows} 行 ${c.dim('(子表)')}`)
  }

  if (DRY_RUN) {
    await conn.rollback()
    console.log(c.yellow('\n  DRY-RUN：已回滚，未写入任何变更\n'))
  } else {
    await conn.commit()
    console.log(c.green('\n  ✔ 事务已提交\n'))
  }
} catch (e) {
  await conn.rollback()
  console.error(c.red(`\n  ✘ 出错已回滚：${e.message}\n`))
  await conn.end()
  process.exit(1)
}

// ── Phase 3: 验证 ───────────────────────────────────────────
if (DRY_RUN) {
  console.log(c.dim('Phase 3/3  预演模式跳过验证\n'))
} else {
  console.log(c.bold('Phase 3/3  验证'))
  const ok = await verify()
  await conn.end()
  process.exit(ok ? 0 : 1)
}
await conn.end()
