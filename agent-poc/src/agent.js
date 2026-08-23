/**
 * createAgent 工厂（agent.js，TECH-006 2.2.1）
 *
 * 组装 model / systemPrompt / tools。
 * ⚠️ systemPrompt 在 createAgent 时静态固定（OAK 不支持 per-session prompt），
 * 且 OAK resume 不可用（见 lib/history.js），因此**每次请求重建 agent**：
 * 历史通过 history 参数注入 systemPrompt，会话上下文由 lib/history.js 自管。
 *
 * P2：tools 扩展为 4 个（search_knowledge / query_baby_data / analyze_baby_data / generate_diary），
 * execute 以闭包注入请求级 ctx（{ familyId, babyId }，模型不可见）。
 */
import { createAgent } from '@cloudbase/open-agent-kernel'
import { buildModelSpec } from './lib/deepseek.js'
import { buildSystemPrompt } from './prompts/system.js'
import { TOOLS } from './lib/tools/index.js'

/**
 * @param {import('./config.js').Config} config  loadConfig() 返回值
 * @param {Array<{role:'user'|'assistant', content:string}>} [history] 历史对话（最近 20 条）
 * @param {{userId?:string, familyId?:string, babyId?:string}} [ctx] 请求级上下文（工具注入用）
 */
export function buildAgent(config, history = [], ctx = {}) {
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
    systemPrompt: buildSystemPrompt(ctx, history),
    tools: TOOLS.map((t) => ({
      name: t.def.name,
      description: t.def.description,
      parameters: t.def.parameters,
      execute: (input) => t.execute(input, ctx),
    })),
    cwd: process.cwd(),
  })
}
