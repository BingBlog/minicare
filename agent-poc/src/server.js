/**
 * minicare-agent 服务入口（server.js，CloudRun 部署入口）
 *
 * 路由：
 *   GET  /health    探活（无需 token）
 *   GET  /diag      容器诊断（无需 token）
 *   POST /chat      对话（SSE，需要 x-agent-token；ctx 可选）
 *   （日记 REST 路由 P2 追加）
 *
 * ⚠️ 2026-09-04 直连 SDK 改造：agent 循环在 lib/runtime.js，按请求构建（历史注入
 * systemPrompt，见 agent.js）；wire-proxy 进程内常驻（thinking 注入 / prompt 抓取）。
 * /health 的 ready 由 config.deepSeekKey 决定。
 *
 * 环境变量见 config.js；部署时环境变量由 CloudRun 控制台管理，
 * 不得在 serverConfig.EnvParams 传入（会整体替换已有配置）。
 */
import { loadLocalEnv, NODE_ENV } from './lib/env.js' // development 读 .env.local；production 只认环境变量（CloudRun EnvParams）
loadLocalEnv()
import express from 'express'
import { loadConfig } from './config.js'
import { initDb } from './lib/db.js'
import { internalToken } from './middleware/internal-token.js'
import { chatRoute } from './routes/chat.js'
import { healthRoute } from './routes/health.js'
import { diagRoute } from './routes/diag.js'
import { initAgentRuntime } from './lib/runtime.js'
import { preheatVectors } from './lib/tools/search-knowledge.js'

const config = loadConfig()

// 2026-09-04 直连 SDK 改造：运行时环境（进程内 wire 反代 + CLAUDE_CONFIG_DIR）
// 统一由 runtime.initAgentRuntime 幂等初始化（eval harness 复用同一入口）
if (config.deepSeekKey) {
  await initAgentRuntime(config)
}

// 知识库只读连接池（P1；缺配置时 pool=null，检索降级为"未找到"）
initDb(config)
// 向量缓存预热（后台异步，不阻塞启动）：避免首个知识库问题支付 ~6s 全表 BLOB 冷加载
if (config.db && config.tokenHubKey) {
  preheatVectors()
}
const app = express()
app.use(express.json({ limit: '1mb' }))

// 内部鉴权（缺 AGENT_INTERNAL_TOKEN 时跳过并告警）
app.use(internalToken(config))

if (config.deepSeekKey) {
  console.log('[server] DeepSeek key OK, agent 按请求构建')
} else {
  console.error('[server] DEEPSEEK_API_KEY 未配置 —— /chat 将不可用')
}
console.log(`[server] NODE_ENV=${NODE_ENV}`)
console.log(
  `[server] FlexDB ${config.tcbCredentials ? 'enabled' : 'in-memory (no TCB credentials)'}, ` +
    `KB-DB ${config.db ? 'enabled' : 'DISABLED (no DB config)'}, ` +
    `embedding ${config.tokenHubKey ? 'enabled' : 'DISABLED (no TOKENHUB_API_KEY)'}, ` +
    `token ${config.internalToken ? 'enabled' : 'DISABLED (dev mode)'}`,
)

app.get('/health', healthRoute(config))
app.get('/diag', diagRoute(config))
app.post('/chat', chatRoute(config))

app.listen(config.port, () => {
  console.log(`[server] listening on :${config.port}`)
})
