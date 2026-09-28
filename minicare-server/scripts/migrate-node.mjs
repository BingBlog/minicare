/**
 * 数据库迁移执行器（Node 版，scripts/migrate-node.mjs）
 *
 * 等价实现 migrate.sh（本机无 mysql CLI，用项目已有的 mysql2）。
 * 幂等：schema_migrations 表记录已执行版本；失败不写版本，可安全重试。
 *
 * 用法（在 minicare-server 目录下）：
 *   node scripts/migrate-node.mjs --status            # 查看当前库迁移状态
 *   node scripts/migrate-node.mjs --dry-run           # 预览待执行（默认库）
 *   node scripts/migrate-node.mjs --dry-run --all-envs # 预览三个库
 *   node scripts/migrate-node.mjs --db=minicare_staging --dry-run
 *   node scripts/migrate-node.mjs --all-envs          # 执行三个库（dev/staging/正式）
 */
import mysql from 'mysql2/promise'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.resolve(__dirname, '..')
const MIGRATIONS_DIR = path.join(SERVER_DIR, 'migrations')
const ALL_DBS = ['minicare_dev', 'minicare_staging', 'minicare-cloud-6gqledlle0132cbe']

// ---------- 参数 ----------
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const STATUS = args.includes('--status')
const ALL_ENVS = args.includes('--all-envs')
const dbArg = args.find((a) => a.startsWith('--db='))
const DB_OVERRIDE = dbArg ? dbArg.slice(5) : null

// ---------- 加载 .env.local ----------
function loadEnv() {
  const env = {}
  const file = path.join(SERVER_DIR, '.env.local')
  if (!fs.existsSync(file)) return env
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const env = loadEnv()
const DB_HOST = env.DB_HOST || '127.0.0.1'
const DB_PORT = Number(env.DB_PORT || 3306)
const DB_USER = env.DB_USER || 'root'
const DB_PASS = env.DB_PASS || ''

function pickDbs() {
  if (ALL_ENVS) return ALL_DBS
  if (DB_OVERRIDE) return [DB_OVERRIDE]
  return [env.DB_NAME || 'minicare_dev']
}

// ---------- 执行 ----------
async function runMigrations(dbName) {
  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: dbName,
    multipleStatements: true,
    connectTimeout: 15_000,
  })
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
      \`version\` VARCHAR(50) NOT NULL,
      \`applied_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`version\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

    const [rows] = await conn.query('SELECT version FROM schema_migrations ORDER BY version')
    const applied = new Set(rows.map((r) => r.version))

    if (STATUS) {
      console.log(`\n── ${dbName} 已执行迁移 ──`)
      if (applied.size === 0) console.log('  （无迁移记录）')
      for (const v of [...applied].sort()) console.log(`  ✓ ${v}`)
      return
    }

    console.log(`\n── ${dbName} ──`)
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    let pending = 0
    for (const file of files) {
      const version = file.replace(/\.sql$/, '')
      if (applied.has(version)) {
        console.log(`  ✓ ${version}  (已执行，跳过)`)
        continue
      }
      pending++
      if (DRY_RUN) {
        console.log(`  → ${version}  [待执行]`)
        continue
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      console.log(`  → 执行 ${version} ...`)
      try {
        await conn.query(sql)
        await conn.query('INSERT IGNORE INTO schema_migrations (version) VALUES (?)', [version])
        console.log(`  ✓ ${version} 执行成功`)
      } catch (e) {
        console.error(`  ✗ ${version} 执行失败: ${e.message}`)
        throw e
      }
    }
    if (pending === 0) console.log('  ✓ 已是最新状态，无待执行迁移')
  } finally {
    await conn.end()
  }
}

const dbs = pickDbs()
if (DRY_RUN) console.log('[Dry Run] 仅预览，不实际执行')
console.log(`Host: ${DB_HOST}:${DB_PORT}  目标库: ${dbs.join(', ')}`)

for (const db of dbs) {
  await runMigrations(db)
}
if (!STATUS) console.log('\n✓ 全部数据库迁移完成')
