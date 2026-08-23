/**
 * minicare-agent 服务入口（server.js，CloudRun 部署入口）
 *
 * 路由：
 *   GET  /health    探活（无需 token）
 *   GET  /diag      容器诊断（无需 token）
 *   POST /chat      对话（SSE，需要 x-agent-token；ctx 可选）
 *   （日记 REST 路由 P2 追加）
 *
 * ⚠️ agent 按请求构建（每次请求读历史重建，OAK resume 不可用），
 * 不持有进程级单例；/health 的 ready 由 config.deepSeekKey 决定。
 *
 * 环境变量见 config.js；部署时环境变量由 CloudRun 控制台管理，
 * 不得在 serverConfig.EnvParams 传入（会整体替换已有配置）。
 */
import 'dotenv/config' // 加载 .env（本地开发）；不覆盖已存在的环境变量，生产 EnvParams 优先
import express from 'express'
import { loadConfig } from './config.js'
import { initDb } from './lib/db.js'
import { internalToken } from './middleware/internal-token.js'
import { chatRoute } from './routes/chat.js'
import { healthRoute } from './routes/health.js'
import { diagRoute } from './routes/diag.js'

// 本地开发读 .env.local（CloudRun 容器不依赖此文件）
import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env.local', override: false })

const config = loadConfig()
// 知识库只读连接池（P1；缺配置时 pool=null，检索降级为"未找到"）
initDb(config)
const app = express()
app.use(express.json({ limit: '1mb' }))

// 内部鉴权（缺 AGENT_INTERNAL_TOKEN 时跳过并告警）
app.use(internalToken(config))

if (config.deepSeekKey) {
  console.log('[server] DeepSeek key OK, agent 按请求构建')
} else {
  console.error('[server] DEEPSEEK_API_KEY 未配置 —— /chat 将不可用')
}
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
