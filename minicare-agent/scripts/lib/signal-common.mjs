/**
 * signal-dump / perception-diff 共享引导（TECH-029 §4）
 *
 * 复刻 perception-preview.mjs:19-33 的加载链与 --prod 机制（保持一致，勿各写一套）：
 *   --prod 前置注入（平台 .env 凭据 + 固定生产库名）→ loadLocalEnv() → 动态 import → initDb → 定位宝宝
 *
 * 关键顺序约束：SIGNALS_CONFIG（--config 草稿）必须在任何动态 import 之前写入 process.env，
 * 因为 config-loader 在模块加载时读取（TECH-029 §4.4）。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLocalEnv } from '../../src/lib/env.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseArgs(argv) {
  const args = argv.slice(2)
  const val = (name) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`))
    return hit ? hit.slice(name.length + 3) : null
  }
  return {
    baby: val('baby') || args.find((a) => !a.startsWith('--')) || '旺仔',
    prod: args.includes('--prod'),
    configFile: val('config'),
    key: val('key'),
    emit: args.includes('--emit'),
    pretty: args.includes('--pretty'),
  }
}

/** --prod：必须在 loadLocalEnv() 之前写入（env.js 用 override:false，已存在的变量优先） */
function injectProdEnv() {
  const KB_ENV = path.resolve(ROOT, '../minicare-platform/api/.env')
  for (const line of readFileSync(KB_ENV, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].trim()
  }
  process.env.DB_NAME = 'minicare-cloud-6gqledlle0132cbe'
}

/** 完整引导：返回 { baby, p, q, datasource, renderPerceptionBlock }；失败直接 throw（调用方捕获后输出 {ok:false}） */
export async function bootstrap(opts) {
  if (opts.prod) injectProdEnv()
  if (opts.configFile) process.env.SIGNALS_CONFIG = opts.configFile
  loadLocalEnv()

  const { loadConfig } = await import('../../src/config.js')
  const { initDb, getDb } = await import('../../src/lib/db.js')
  const { getBabyProfile } = await import('../../src/lib/profile.js')
  const { getPerception, renderPerceptionBlock, resetFlagGate } = await import('../../src/lib/perception.js')
  const { getSignalConfig } = await import('../../src/config-loader.js')

  initDb(loadConfig())
  const db = getDb()
  if (!db) throw new Error('DB 未配置（检查 .env.local 的 DB_*）')

  // 定位宝宝：传 UUID 走主键（生产库存在同名宝宝，禁止按名字猜）；传名字走 LIKE 仅限 dev
  let baby
  if (UUID_RE.test(opts.baby)) {
    ;[[baby]] = await db.query('SELECT id, name, birth_date FROM baby_profile WHERE id = ?', [opts.baby])
  } else {
    if (opts.prod) throw new Error('生产数据源必须用 --baby=<UUID>（禁止按名字）')
    const [cands] = await db.query(
      'SELECT id, name, birth_date FROM baby_profile WHERE name LIKE ? AND deleted_at IS NULL',
      [`%${opts.baby}%`],
    )
    if (cands.length > 1) throw new Error(`名字「${opts.baby}」匹配 ${cands.length} 条，请改用 UUID`)
    baby = cands[0]
  }
  if (!baby) throw new Error('未找到宝宝：' + opts.baby)

  const p = await getBabyProfile(baby.id)
  if (!p) throw new Error('画像构建失败（DB 不可用？）')
  const q = await getPerception(baby.id, { profile: p })
  if (!q) throw new Error('现状感知构建失败')
  resetFlagGate(baby.id)

  return { baby, p, q, datasource: opts.prod ? 'prod' : 'dev', renderPerceptionBlock, signalConfig: getSignalConfig() }
}
