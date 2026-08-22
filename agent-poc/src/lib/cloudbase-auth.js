/**
 * 凭证工具：DeepSeek API + CloudBase FlexDB（会话持久化）
 *
 * 模型调用：DeepSeek 官方 Anthropic 兼容端点（https://api.deepseek.com/anthropic）
 *   - model id 用 Claude CLI 白名单内 id（claude-sonnet-4-20250514）绕过 unrecognized_model
 *   - apiBaseUrl 传 https://api.deepseek.com/anthropic，SDK 追加 /v1/messages → 完整请求
 *   - 实际路由到 DeepSeek 模型：deepseek-v4-flash / deepseek-v4-pro
 *
 * FlexDB 会话：读 ~/.config/.cloudbase/auth.json（tcb login 扫码凭证，POC 用）
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export const ENV_ID = 'minicare-cloud-6gqledlle0132cbe'

/** 从 .env.local 读取 DeepSeek API Key */
export function getDeepSeekKey() {
  const key = process.env.DEEPSEEK_API_KEY
  if (key) return key
  try {
    const env = readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8')
    const m = env.match(/^DEEPSEEK_API_KEY=(.+)$/m)
    if (m) return m[1].trim()
  } catch {
    // 忽略
  }
  throw new Error('DEEPSEEK_API_KEY 未设置（检查 .env.local）')
}

/** DeepSeek ModelSpec（Claude CLI 可识别 + DeepSeek 实际路由） */
export function buildDeepSeekModelSpec(apiKey) {
  return {
    id: 'claude-sonnet-4-20250514', // Claude CLI 白名单内模型名（绕过 unrecognized_model）
    apiBaseUrl: 'https://api.deepseek.com/anthropic',
    apiKey,
  }
}

/** 从 CLI 登录态读取 CloudBase 临时凭证（仅用于 FlexDB 会话持久化） */
export function getCloudBaseCredentials() {
  const auth = JSON.parse(
    readFileSync(path.join(homedir(), '.config/.cloudbase/auth.json'), 'utf8'),
  )
  const cred = auth.credential
  return {
    secretId: cred.tmpSecretId,
    secretKey: cred.tmpSecretKey,
    sessionToken: cred.tmpToken,
  }
}
