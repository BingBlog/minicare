/**
 * 统一环境加载器（minicare-agent）
 *
 * 运行环境区分（NODE_ENV）：
 *   - development（默认，本地开发）：加载 minicare-agent/.env.local
 *     （override:false，已存在的环境变量优先，便于临时覆盖单个 key）
 *   - production（CloudRun 容器 / 本地模拟生产）：不加载任何本地 env 文件，
 *     环境变量唯一来源是 CloudRun 控制台 EnvParams（或调用方显式注入），
 *     避免构建产物中残留的 .env.local 污染生产配置
 *
 * 路径基于本文件位置解析（minicare-agent/.env.local），与进程 cwd 无关，
 * 从任意目录运行脚本均可正确加载。
 */
import { config as dotenv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AGENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const NODE_ENV = process.env.NODE_ENV === 'production' ? 'production' : 'development'

let loaded = false

/** 按运行环境加载 env 文件；production 跳过本地文件。幂等，可重复调用。 */
export function loadLocalEnv() {
  if (loaded || NODE_ENV === 'production') return
  loaded = true
  // ⚠️ dotenv override:false —— shell 环境已有的变量不会被 .env.local 覆盖。
  // 若启动终端残留 DB_* 导出（如曾导出线上配置），进程会连错库；检测到冲突即告警。
  // 实际生效的库名见 server.js 启动日志「KB-DB enabled (<库名>)」。
  const dbConflicts = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].filter(
    (k) => process.env[k],
  )
  if (dbConflicts.length) {
    console.warn(
      `[env] ⚠️ 检测到 shell 环境已存在 ${dbConflicts.join(' / ')} —— 它们优先于 .env.local（override:false），数据库可能连错库！` +
        '若非有意覆盖，请在新终端重启，或先 unset 这些变量。',
    )
  }
  dotenv({ path: path.join(AGENT_ROOT, '.env.local'), override: false })
}
