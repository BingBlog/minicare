/**
 * 部署 minicare-agent（scripts/deploy-agent.mjs，P1 知识库上线）
 *
 * 流程：读现有 EnvParams（保留全部）→ 合并 DB_* + TOKENHUB_API_KEY（生产库配置）
 *     → cloudrun.deploy 上传源码构建新版本 → 输出部署结果。
 *
 * 用法：node scripts/deploy-agent.mjs
 * ⚠️ 生产部署操作，执行前确认；EnvParams 为全量替换语义，本脚本确保保留现有键。
 */
import 'dotenv/config'
import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env.local', override: false })
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AGENT_POC_DIR = path.resolve(__dirname, '..')
const SERVER_ENV = path.resolve(__dirname, '../../minicare-server/.env.local')
const KB_ENV = path.resolve(__dirname, '../../minicare-kb/.env')
const PROD_DB_NAME = 'minicare-cloud-6gqledlle0132cbe'

function readEnv(file) {
  const kv = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) kv[m[1]] = m[2]
  }
  return kv
}

const { default: cloudbase } = await import('@cloudbase/manager-node')
const tcb = readEnv(SERVER_ENV)
const kb = readEnv(KB_ENV)

const app = cloudbase.init({
  env: tcb.TCB_ENV_ID,
  secretId: tcb.TCB_SECRET_ID,
  secretKey: tcb.TCB_SECRET_KEY,
})

// 1) 现有 EnvParams
const detail = await app.cloudrun.detail({ serverName: 'minicare-agent' })
const existing = JSON.parse(detail.ServerConfig?.EnvParams || '{}')
console.log('现有 EnvParams 键:', Object.keys(existing).join(', '))

// 2) 合并新增键（不覆盖现有）
const add = {
  DB_HOST: kb.DB_HOST,
  DB_PORT: kb.DB_PORT || '3306',
  DB_NAME: PROD_DB_NAME,
  DB_USER: kb.DB_USER,
  DB_PASSWORD: kb.DB_PASSWORD,
  TOKENHUB_API_KEY: kb.TOKENHUB_API_KEY,
}
for (const [k, v] of Object.entries(add)) {
  if (!(k in existing) && v) existing[k] = v
}
console.log('合并后 EnvParams 键:', Object.keys(existing).join(', '))

// 3) 部署（diff 更新，仅 EnvParams + Port，不触碰 Cpu/Mem/MinNum 等既有配置）
console.log('\n[deploy] 开始部署 minicare-agent（云端构建约 2-5 分钟）…')
const res = await app.cloudrun.deploy({
  serverName: 'minicare-agent',
  targetPath: AGENT_POC_DIR,
  serverConfig: {
    EnvParams: existing,
    Port: 3000,
  },
})
console.log('部署提交完成:', JSON.stringify(res).slice(0, 300))
