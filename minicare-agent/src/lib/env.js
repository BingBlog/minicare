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
  dotenv({ path: path.join(AGENT_ROOT, '.env.local'), override: false })
}
