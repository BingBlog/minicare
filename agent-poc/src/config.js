/**
 * 环境配置读取 + 启动校验
 *
 * 策略：缺关键 key 时服务照常启动（/health 可用，ready=false），/chat 返回明确错误，
 * 避免容器因启动崩溃进入 Back-off restart 循环（M8 tech §6 可观测性约定）。
 *
 * 环境变量：
 *   DEEPSEEK_API_KEY    必填。DeepSeek API Key
 *   AGENT_INTERNAL_TOKEN 可选。内部调用令牌（与 minicare-server 共享，生产必配）
 *   TCB_ENV_ID          默认 minicare-cloud-6gqledlle0132cbe
 *   TCB_SECRET_ID/KEY/SESSION_TOKEN  FlexDB 会话持久化（可选，缺省内存会话）
 *   MODEL_DEFAULT       默认 deepseek-v4-flash
 *   MODEL_VISION        默认 deepseek-v4-flash-vision-exp
 *   PORT                默认 3000
 *   OAK_DEBUG           =1 时开启 Claude SDK 调试日志
 *   DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD  知识库只读连接（可选，缺省检索降级）
 *   TOKENHUB_API_KEY    运行时 query 向量化（可选，缺省仅 FULLTEXT 检索）
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { NODE_ENV } from './lib/env.js'

export const DEFAULT_ENV_ID = 'minicare-cloud-6gqledlle0132cbe'

/** 从 DeepSeek API Key（生产环境只认环境变量，不做文件兜底） */
export function getDeepSeekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY
  if (NODE_ENV !== 'production') {
    try {
      const env = readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8')
      const m = env.match(/^DEEPSEEK_API_KEY=(.+)$/m)
      if (m) return m[1].trim()
    } catch {
      // 忽略
    }
  }
  throw new Error('DEEPSEEK_API_KEY 未设置（检查环境变量或 .env.local）')
}

/**
 * 从 env 读取 TCB 凭证（FlexDB / Storage 用）
 * 优先级：环境变量（生产）> 本地 tcb CLI 登录态（开发，生产环境不兜底）
 */
export function getTcbCredentials() {
  if (process.env.TCB_SECRET_ID && process.env.TCB_SECRET_KEY) {
    return {
      secretId: process.env.TCB_SECRET_ID,
      secretKey: process.env.TCB_SECRET_KEY,
      ...(process.env.TCB_SESSION_TOKEN ? { sessionToken: process.env.TCB_SESSION_TOKEN } : {}),
    }
  }
  if (NODE_ENV === 'production') return null
  try {
    const auth = JSON.parse(
      readFileSync(path.join(homedir(), '.config/.cloudbase/auth.json'), 'utf8'),
    )
    const cred = auth.credential
    return {
      secretId: cred.tmpSecretId,
      secretKey: cred.tmpSecretKey,
      sessionToken: cred.tmpToken,
    }
  } catch {
    return null
  }
}

export function loadConfig() {
  const db = process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD
    ? {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        name: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      }
    : null
  return {
    nodeEnv: NODE_ENV,
    envId: process.env.TCB_ENV_ID || DEFAULT_ENV_ID,
    port: Number(process.env.PORT || 3000),
    deepSeekKey: safe(() => getDeepSeekKey(), null),
    internalToken: process.env.AGENT_INTERNAL_TOKEN || null,
    tcbCredentials: getTcbCredentials(),
    modelDefault: process.env.MODEL_DEFAULT || 'deepseek-v4-flash',
    modelVision: process.env.MODEL_VISION || 'deepseek-v4-flash-vision-exp',
    oakDebug: process.env.OAK_DEBUG === '1',
    // 2026-09-04 直连 SDK 改造：内置 wire 反代开关
    thinkingMode: process.env.THINKING_MODE || 'disabled', // disabled=代理注入关思考 | passthrough=不注入
    wireLog: process.env.WIRE_LOG === 'on', // on=落盘完整 prompt（.wire-logs/，生产勿开）
    db,
    tokenHubKey: process.env.TOKENHUB_API_KEY || null,
  }
}

function safe(fn, fallback) {
  try {
    return fn()
  } catch {
    return fallback
  }
}
