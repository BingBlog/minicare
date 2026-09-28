#!/usr/bin/env node
/**
 * POC：服务内置代理注入 thinking:{type:'disabled'}（2026-09-04）
 *
 * 背景：POC-direct-sdk 证实 CLI 不向 DeepSeek 透传 SDK 的 thinking 选项。
 * 本脚本验证：在 agent-poc 进程内起一个 http 代理（ANTHROPIC_BASE_URL 指向它），
 * 转发请求到 api.deepseek.com 时改写 body 注入 thinking，CLI 链路上是否生效。
 *
 * 对照组：代理直通不改写（应看到 thinking 块）
 * 实验组：代理注入 thinking:{type:'disabled'}（应无 thinking 块、延迟下降）
 *
 * 用法：cd agent-poc && node scripts/poc-wire-proxy.mjs
 */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()

const http = await import('node:http')
const os = await import('node:os')
const fs = await import('node:fs')
const path = await import('node:path')

const MODEL = 'deepseek-v4-flash'
const KEY = process.env.DEEPSEEK_API_KEY
const UPSTREAM = 'https://api.deepseek.com'
if (!KEY) {
  console.error('缺少 DEEPSEEK_API_KEY')
  process.exit(1)
}

const CFG_DIR = path.join(os.tmpdir(), 'dsh-poc', 'claude-config')
fs.mkdirSync(CFG_DIR, { recursive: true })
process.env.CLAUDE_CONFIG_DIR = CFG_DIR
process.env.ANTHROPIC_AUTH_TOKEN = KEY
process.env.ANTHROPIC_API_KEY = ''
process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
process.env.API_TIMEOUT_MS = '120000'

/** 内置反代：可选注入 thinking，其余原样转发（SSE 流式透传） */
function startProxy({ injectThinking }) {
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = []
      for await (const c of req) chunks.push(c)
      let body = Buffer.concat(chunks)

      const headers = { ...req.headers }
      delete headers.host
      delete headers['content-length']

      if (injectThinking && req.method === 'POST' && req.url.includes('/messages')) {
        try {
          const j = JSON.parse(body.toString('utf8'))
          j.thinking = { type: 'disabled' }
          body = Buffer.from(JSON.stringify(j))
        } catch {
          /* 非 JSON body 原样转发 */
        }
      }
      if (body.length) headers['content-length'] = String(body.length)

      const upstream = await fetch(UPSTREAM + req.url, {
        method: req.method,
        headers,
        body: body.length ? body : undefined,
      })
      const resHeaders = {}
      upstream.headers.forEach((v, k) => {
        if (!['transfer-encoding', 'content-length'].includes(k.toLowerCase())) resHeaders[k] = v
      })
      res.writeHead(upstream.status, resHeaders)
      if (upstream.body) {
        const reader = upstream.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
      }
      res.end()
    } catch (e) {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: String(e?.message || e) }))
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

const { query } = await import('@anthropic-ai/claude-agent-sdk')

async function runTurn({ label, baseUrl }) {
  process.env.ANTHROPIC_BASE_URL = baseUrl
  const t0 = Date.now()
  let ttft = null
  const blocks = []
  let usage = null
  let resultText = null
  try {
    const q = query({
      prompt:
        '一个宝宝 7 天体重从 8.00kg 增长到 8.35kg，平均每天增长多少克？请给出计算过程，再回答。',
      options: {
        model: MODEL,
        maxTurns: 3,
        permissionMode: 'bypassPermissions',
        systemPrompt:
          '你是敏宝助手，用简体中文简洁回答。',
        tools: [],
      },
    })
    for await (const msg of q) {
      if (msg.type === 'assistant') {
        if (ttft === null) ttft = Date.now() - t0
        for (const b of msg.message?.content || []) {
          blocks.push(b.type === 'thinking' ? `thinking(${(b.thinking || '').length}字)` : b.type)
        }
        if (msg.message?.usage) usage = msg.message.usage
      } else if (msg.type === 'result') {
        resultText = (msg.result || '').slice(0, 60)
      }
    }
  } catch (e) {
    return { label, error: String(e?.message || e).slice(0, 200) }
  }
  return { label, totalMs: Date.now() - t0, ttftMs: ttft, blocks: blocks.join('+'), usage, resultText }
}

// ── 对照组：代理直通（不注入）→ CLI 自身行为，应有 thinking ──
console.log('══ 对照组：内置代理直通（不注入 thinking）')
const p1 = await startProxy({ injectThinking: false })
const r1 = await runTurn({ label: '直通', baseUrl: `http://127.0.0.1:${p1.port}/anthropic` })
p1.server.close()
if (r1.error) console.log('  ✗', r1.error)
else console.log(`  [${r1.label}] ${r1.totalMs}ms (TTFT ${r1.ttftMs}ms) | blocks: ${r1.blocks}`)

// ── 实验组：代理注入 thinking:{type:'disabled'} ──
console.log('══ 实验组：内置代理注入 thinking:{type:"disabled"}')
const p2 = await startProxy({ injectThinking: true })
const r2 = await runTurn({ label: '注入', baseUrl: `http://127.0.0.1:${p2.port}/anthropic` })
p2.server.close()
if (r2.error) console.log('  ✗', r2.error)
else console.log(`  [${r2.label}] ${r2.totalMs}ms (TTFT ${r2.ttftMs}ms) | blocks: ${r2.blocks}`)

// ── 判定 ──
if (!r1.error && !r2.error) {
  const has = (r) => r.blocks.includes('thinking')
  console.log(
    `\n  判定：直通轮 thinking=${has(r1) ? '有' : '无'}；注入轮 thinking=${has(r2) ? '有' : '无'}` +
      `\n  耗时 ${r1.totalMs}ms → ${r2.totalMs}ms（TTFT ${r1.ttftMs} → ${r2.ttftMs}）` +
      `\n  ${!has(r2) ? '✅ 内置代理注入生效——CLI 链路成功关闭思考' : '❌ 注入未生效'}`,
  )
}
