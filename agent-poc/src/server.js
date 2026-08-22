/**
 * OAK Agent HTTP 服务（CloudRun 部署入口）
 *
 * 接口：
 *   GET  /health         健康检查
 *   POST /chat           对话（SSE 流式返回）
 *      body: { userId, conversationId?, message, history? }
 *      SSE 事件：text 增量 / tool_call / tool_result / done / error
 *
 * 环境变量：
 *   DEEPSEEK_API_KEY   必填。DeepSeek API Key
 *   TCB_SECRET_ID      FlexDB 会话持久化（可选，缺省用内存会话）
 *   TCB_SECRET_KEY     同上
 *   TCB_SESSION_TOKEN  同上（可选）
 *   PORT               默认 3000
 */
import express from 'express'
import { randomUUID } from 'node:crypto'
import { createAgent } from '@cloudbase/open-agent-kernel'
import { getDeepSeekKey, buildDeepSeekModelSpec } from './lib/cloudbase-auth.js'
import { KNOWLEDGE_TOOL_DEF, executeSearchKnowledge } from './lib/knowledge-base.js'

const PORT = Number(process.env.PORT || 3000)
const app = express()
app.use(express.json({ limit: '1mb' }))

// ── 凭证：DeepSeek + CloudBase（可选）──────────────
// 容错：缺 key 时服务照常启动（/health 可用），/chat 返回明确错误，
// 避免容器因启动崩溃进入 Back-off restart 循环。
let deepSeekKey = null
let agent = null
try {
  deepSeekKey = getDeepSeekKey()
} catch (e) {
  console.error(`[server] ${e.message} —— /chat 将不可用，请配置 DEEPSEEK_API_KEY`)
}
const credentials =
  process.env.TCB_SECRET_ID && process.env.TCB_SECRET_KEY
    ? {
        secretId: process.env.TCB_SECRET_ID,
        secretKey: process.env.TCB_SECRET_KEY,
        ...(process.env.TCB_SESSION_TOKEN ? { sessionToken: process.env.TCB_SESSION_TOKEN } : {}),
      }
    : undefined
console.log(
  `[server] DeepSeek key ${deepSeekKey ? 'OK' : 'MISSING'}, ` +
    `FlexDB ${credentials ? 'enabled' : 'in-memory (no TCB credentials)'}`,
)

// ── Agent（进程级单例；缺 key 时不创建）────────
if (deepSeekKey) {
  // 调试：OAK_DEBUG=1 时透传 SDK debug 环境变量（打印 CLI spawn/exit 细节）
  if (process.env.OAK_DEBUG === '1') {
    process.env.DEBUG_CLAUDE_AGENT_SDK = '1'
    console.log('[server] OAK_DEBUG=1: enabling Claude SDK debug logging')
  }
  agent = createAgent({
    envId: process.env.TCB_ENV_ID || 'minicare-cloud-6gqledlle0132cbe',
    ...(credentials ? { credentials } : {}),
  model: buildDeepSeekModelSpec(deepSeekKey),
  systemPrompt:
    '你是"敏宝护理助手"，一名严谨温和的宝宝护理顾问。回答家长问题的流程：' +
    '1) 第一步必须调用 search_knowledge 工具检索知识库，这是同步调用，工具会立即返回结果；' +
    '2) 工具返回结果后，你必须把结果当作已经到手的资料，立即基于结果内容写出完整回答，' +
    '   绝不能回复"正在检索/请稍候/等待结果"之类的延迟话术——结果已经在你手里；' +
    '3) 如果工具返回"未找到"，明确说"知识库未收录，建议咨询医生"；' +
    '4) 涉及医疗判断时附一句"本回答仅供参考，不能替代专业医疗建议"；' +
    '5) 用简体中文，语气亲切但专业。' +
    '【关键规则】调用 search_knowledge 后，下一轮输出必须直接给出完整答案正文，不得再提及"检索中"。',
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
  console.log(`[server] agent ready, id=${agent.id}`)
}

/** SSE 事件发送 */
function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'oak-agent-demo',
    agent: agent ? agent.id : null,
    model: 'deepseek-v4-flash',
    ready: Boolean(agent),
  })
})

/**
 * GET /diag — 容器环境诊断（定位 Claude CLI 启动问题）
 * 直接检查：CLI 二进制存在性/权限、动态库依赖、可写目录
 */
app.get('/diag', async (_req, res) => {
  const { execFileSync, execSync } = await import('node:child_process')
  const fs = await import('node:fs')
  const path = await import('node:path')
  const out = { env: {}, cli: {}, dirs: {} }

  // 关键环境变量
  for (const k of ['CLAUDE_CONFIG_DIR', 'HOME', 'PATH', 'OAK_DEBUG', 'DEEPSEEK_API_KEY', 'PORT']) {
    out.env[k] = process.env[k] ? (k === 'DEEPSEEK_API_KEY' ? '***set***' : process.env[k]) : null
  }

  // 找 Claude CLI 二进制
  try {
    const cliPath = path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk-linux-x64', 'claude')
    out.cli.expectedPath = cliPath
    out.cli.exists = fs.existsSync(cliPath)
    if (out.cli.exists) {
      const st = fs.statSync(cliPath)
      out.cli.mode = (st.mode & 0o777).toString(8)
      out.cli.sizeMB = Math.round(st.size / 1024 / 1024)
      // 动态库依赖（ldd）
      try {
        out.cli.ldd = execSync(`ldd "${cliPath}" 2>&1 || true`, { encoding: 'utf8' }).split('\n').slice(0, 15)
      } catch (e) {
        out.cli.ldd = ['ldd failed: ' + e.message]
      }
      // 试跑 --version
      try {
        out.cli.version = execFileSync(cliPath, ['--version'], {
          encoding: 'utf8',
          timeout: 15000,
          env: { ...process.env, CLAUDE_CONFIG_DIR: '/tmp/oak-claude' },
        }).slice(0, 100)
      } catch (e) {
        out.cli.versionError = (e?.message || String(e)).slice(0, 300)
        out.cli.stderr = (e?.stderr || '').slice(0, 300)
      }
    }
  } catch (e) {
    out.cli.error = (e?.message || String(e)).slice(0, 300)
  }

  // 可写目录
  for (const d of ['/tmp', '/tmp/oak-claude', process.cwd(), '/app']) {
    try {
      fs.accessSync(d, fs.constants.W_OK)
      out.dirs[d] = 'writable'
    } catch {
      out.dirs[d] = 'NOT writable'
    }
  }

  res.json(out)
})

/**
 * POST /chat — 对话（SSE）
 * body: { userId: string, conversationId?: string(UUID), message: string }
 */
app.post('/chat', async (req, res) => {
  if (!agent) {
    res.status(503).json({ error: 'Agent not ready: DEEPSEEK_API_KEY not configured' })
    return
  }
  const { userId, conversationId, message } = req.body || {}
  if (!userId || !message) {
    res.status(400).json({ error: 'userId and message are required' })
    return
  }
  if (conversationId && !/^[0-9a-f-]{36}$/.test(conversationId)) {
    res.status(400).json({ error: 'conversationId must be a UUID' })
    return
  }

  // SSE 头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  sse(res, 'meta', { userId, conversationId: conversationId || null })

  const t0 = Date.now()
  let eventCount = 0
  let lastEventType = 'none'

  try {
    const session = await agent.startSession({
      userId,
      ...(conversationId ? { conversationId } : {}),
    })
    sse(res, 'session', { started: true, t: Date.now() - t0 })

    for await (const event of session.send(message)) {
      eventCount++
      // client/<toolName> 请求 → 宿主执行 → 回传
      if (event.jsonrpc && typeof event.method === 'string' && event.method.startsWith('client/')) {
        lastEventType = 'client/' + event.method.slice(7)
        const toolCallId = event._meta?.toolCallId
        sse(res, 'tool_call', { name: event.method.slice(7), input: event.params })
        const output = await executeSearchKnowledge(event.params ?? {})
        sse(res, 'tool_result', { name: event.method.slice(7), output })
        const resumeStream = session.respondToolUse({ toolUseId: toolCallId, output })
        for await (const ev2 of resumeStream) {
          const u2 = ev2.params?.update
          if (u2?.sessionUpdate === 'agent_message_chunk') {
            sse(res, 'text', { delta: u2.content.text })
          }
        }
        continue
      }
      const u = event.params?.update
      if (u?.sessionUpdate === 'agent_message_chunk') {
        lastEventType = 'text'
        sse(res, 'text', { delta: u.content.text })
      }
    }
    console.log(`[chat] userId=${userId} events=${eventCount} last=${lastEventType} ms=${Date.now() - t0}`)
    sse(res, 'done', { events: eventCount, ms: Date.now() - t0, lastEventType })
  } catch (e) {
    console.error(`[chat] ERROR userId=${userId} ms=${Date.now() - t0}`, e?.stack || e)
    sse(res, 'error', { message: (e?.message || String(e)).slice(0, 500), stack: (e?.stack || '').slice(0, 500) })
  } finally {
    res.end()
  }
})

app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`)
})
