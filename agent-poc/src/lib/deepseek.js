/**
 * DeepSeek ModelSpec 构造（lib/deepseek.js，M6 tech §4）
 *
 * ⚠️ 2026-08-23 P0 实测结论：**当前 SDK（claude-agent-sdk 0.3.x）已无模型名白名单校验**，
 * 直接传真实模型名即可路由：
 *   - deepseek-v4-flash / deepseek-v4-pro（文本）
 *   - deepseek-v4-flash-vision-exp（视觉，attachments 传图实测通过）
 * POC 时期的 MODEL_ROUTE 白名单映射表（claude-sonnet-4-20250514 等）已废弃。
 *
 * 注意：旧映射表相关占位文案（M6 tech §4 / TECH-006 2.5）需同步更新。
 */
export const ANTHROPIC_ENDPOINT = 'https://api.deepseek.com/anthropic'

export const MODEL_DEFAULT = 'deepseek-v4-flash'
export const MODEL_PRO = 'deepseek-v4-pro'
export const MODEL_VISION = 'deepseek-v4-flash-vision-exp'

/** 构造 OAK ModelSpec：Claude Agent SDK 通过 env ANTHROPIC_BASE_URL/TOKEN 注入子进程 */
export function buildModelSpec(apiKey, id) {
  return {
    id: id || MODEL_DEFAULT,
    apiBaseUrl: ANTHROPIC_ENDPOINT,
    apiKey,
  }
}
