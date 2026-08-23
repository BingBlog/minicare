/**
 * createAgent 工厂（agent.js，TECH-006 2.2.1）
 *
 * 组装 model / systemPrompt / tools。
 * ⚠️ systemPrompt 在 createAgent 时静态固定（OAK 不支持 per-session prompt），
 * 且 OAK resume 不可用（见 lib/history.js），因此**每次请求重建 agent**：
 * 历史通过 history 参数注入 systemPrompt，会话上下文由 lib/history.js 自管。
 */
import { createAgent } from '@cloudbase/open-agent-kernel'
import { buildModelSpec } from './lib/deepseek.js'
import { buildSystemPrompt } from './prompts/system.js'
import { KNOWLEDGE_TOOL_DEF, executeSearchKnowledge } from './lib/tools/search-knowledge.js'

/**
 * @param {import('./config.js').Config} config  loadConfig() 返回值
 * @param {Array<{role:'user'|'assistant', content:string}>} [history] 历史对话（最近 20 条）
 */
export function buildAgent(config, history = []) {
  if (!config.deepSeekKey) {
    throw new Error('DEEPSEEK_API_KEY 未配置，无法创建 agent')
  }
  if (config.oakDebug) {
    process.env.DEBUG_CLAUDE_AGENT_SDK = '1'
    console.log('[agent] OAK_DEBUG=1: enabling Claude SDK debug logging')
  }
  return createAgent({
    envId: config.envId,
    ...(config.tcbCredentials ? { credentials: config.tcbCredentials } : {}),
    model: buildModelSpec(config.deepSeekKey, config.modelDefault),
    systemPrompt: buildSystemPrompt(null, history),
    tools: [
      {
        name: KNOWLEDGE_TOOL_DEF.name,
        description: KNOWLEDGE_TOOL_DEF.description,
        parameters: KNOWLEDGE_TOOL_DEF.parameters,
        execute: executeSearchKnowledge,
      },
    ],
    cwd: process.cwd(),
  })
}
