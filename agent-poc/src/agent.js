/**
 * Agent 运行时入口（agent.js，2026-09-04 直连 SDK 改造）
 *
 * ⚠️ 2026-09-04：OAK（@cloudbase/open-agent-kernel）已移除，改直连
 *    @anthropic-ai/claude-agent-sdk。改造依据与实测数据见
 *    docs/tech/OAK-alternatives-research.md §4A。
 *
 * 本文件现在只做薄封装：真正的循环在 lib/runtime.js（runAgentTurn），
 * chat.js 与 eval/lib/agent-runner.mjs 共同消费其归一化事件流。
 *
 * 多轮上下文：沿用「历史注入 systemPrompt」方案（每请求读最近 20 条历史，
 * lib/history.js）。SDK resume 已验证可用，留作后续优化
 * （会话文件生命周期 + 生产临时 FS 丢失兜底，见调研文档 §4 路线）。
 */
export { runAgentTurn, SDK_CONFIG_DIR, MAX_SAME_TOOL_CALLS, MAX_TOTAL_TOOL_CALLS } from './lib/runtime.js'
