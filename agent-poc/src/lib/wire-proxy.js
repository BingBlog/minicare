/**
 * 进程内 wire 反代（lib/wire-proxy.js，2026-09-04 改造）
 *
 * 背景（POC 实测，见 docs/tech/OAK-alternatives-research.md §4A）：
 *   - Claude CLI 不向第三方模型端点透传 SDK thinking 选项，thinking:{type:'disabled'}
 *     在 SDK 层不生效；直接 curl DeepSeek anthropic 端点带该参数则生效（省 60-80% 延迟）。
 *   - 唯一可靠路径 = HTTP 反代改写 body 注入 thinking。本模块把它做成 agent-poc
 *     进程内服务（无独立进程），localhost 转发，生产 CloudRun 容器内同样可用。
 *   - 兼职 wire 级观测：WIRE_LOG=on 时把每个 /messages 请求的完整 body（prompt 原文）
 *     落盘，供延迟/成本/缓存命中率分析（TECH-007 P1）。
 *
 * 环境变量：
 *   THINKING_MODE  disabled（默认，注入关闭思考）| passthrough（不注入）
 *   WIRE_LOG       on 时落盘请求 body 到 .wire-logs/（默认 off；生产勿开）
 *
 * 转发目标：ANTHROPIC_ENDPOINT（lib/deepseek.js，https://api.deepseek.com/anthropic）。
 * SDK 侧 ANTHROPIC_BASE_URL 指向 http://127.0.0.1:<ephemeral>/anthropic，
 * CLI 追加的路径（/v1/messages 等）原样拼到上游。
 *
 * ⚠️ 2026-09-04 晚 延迟尖刺修复（单轮 25-30s 定位实录）：
 *   - 根因链：系统 DNS 间歇性 ENOTFOUND（裸 fetch 每请求实时解析，抖动窗口内
 *     15 连败）→ 502 → CLI 指数退避重试（0.5/1/2/4s…）→ 单轮被放大 20s+。
 *   - 改造：
 *     1) 裸 fetch → node:https + cachedLookup：TTL 5min DNS 缓存 +
 *        last-known-good 兜底（解析失败时用最近一次成功 IP，SNI/TLS 不受影响）+
 *        启动预热 + 定期刷新（防缓存过期恰好撞上抖动窗口）；
 *     2) 连接级失败（请求未达上游，DNS/TLS/connect）自动重试 2 次（300ms*n 退避），
 *        body 为 Buffer 可安全重放；响应已建立后的中途断流不重试（SSE 已部分转发）；
 *     3) 错误日志统一带 e.code（ENOTFOUND/ECONNRESET/...），便于区分 DNS/连接问题。
 */
import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import fs from 'node:fs'
import path from 'node:path'
import { ANTHROPIC_ENDPOINT } from './deepseek.js'

const UPSTREAM = new URL(ANTHROPIC_ENDPOINT).origin // https://api.deepseek.com
const UPSTREAM_HOSTNAME = new URL(ANTHROPIC_ENDPOINT).hostname
let reqCounter = 0

// ── DNS 缓存 + last-known-good 兜底 ─────────────────────────────────────────

const DNS_TTL_MS = 5 * 60 * 1000
const dnsCache = new Map() // hostname -> { addresses: [{address, family}], ts }

/**
 * net.connect/tls.connect 兼容的自定义 lookup（支持 options.all / options.family）。
 * TTL 内直接回缓存；过期先实时解析，解析失败时回退最近一次成功结果（last-known-good）。
 */
export function cachedLookup(hostname, options, callback) {
  const useAll = !!(options && options.all)
  const wantFamily = options?.family || 0
  const cached = dnsCache.get(hostname)
  const pickCached = () => {
    let addrs = cached.addresses
    if (wantFamily === 4) addrs = addrs.filter((a) => a.family === 4)
    if (wantFamily === 6) addrs = addrs.filter((a) => a.family === 6)
    if (addrs.length === 0) return null
    return useAll ? addrs : addrs[0]
  }

  if (cached && Date.now() - cached.ts < DNS_TTL_MS) {
    const hit = pickCached()
    if (hit) {
      if (useAll) callback(null, hit)
      else callback(null, hit.address, hit.family)
      return
    }
  }

  dns.lookup(hostname, { family: wantFamily, all: true }, (err, addresses) => {
    if (!err && addresses && addresses.length) {
      dnsCache.set(hostname, { addresses, ts: Date.now() })
      if (useAll) callback(null, addresses)
      else callback(null, addresses[0].address, addresses[0].family)
      return
    }
    const fallback = cached ? pickCached() : null
    if (fallback) {
      console.warn(
        `[wire-proxy] DNS ${hostname} 解析失败(${err?.code || err})，回退 last-known-good`,
      )
      if (useAll) callback(null, fallback)
      else callback(null, fallback.address, fallback.family)
      return
    }
    callback(err, addresses)
  })
}

/** 启动预热 + 定期刷新（间隔 TTL/2，防缓存过期恰好撞上 DNS 抖动窗口） */
function startDnsPrewarm(hostname) {
  const refresh = () => {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (!err && addresses && addresses.length) {
        dnsCache.set(hostname, { addresses, ts: Date.now() })
      }
    })
  }
  refresh()
  setInterval(refresh, DNS_TTL_MS / 2).unref?.()
}

// ── 上游请求（node:https + 连接级重试）─────────────────────────────────────

/**
 * 上游 HTTPS 请求；收到响应头即 resolve（IncomingMessage）。
 * 请求建立失败（DNS/TLS/connect，未达上游）→ reject → 可安全重试。
 * servername 缺省 = hostname，SNI/证书校验不受自定义 lookup 影响。
 */
function upstreamRequest(urlObj, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method,
        headers,
        lookup: cachedLookup,
      },
      resolve,
    )
    req.setTimeout(120_000, () => req.destroy(new Error('upstream socket timeout 120s')))
    req.on('error', reject)
    if (body && body.length) req.write(body)
    req.end()
  })
}

/**
 * 连接级重试（2026-09-04）：仅当请求建立失败（未收到任何上游字节）时重试，
 * body 为 Buffer 可安全重放；响应已建立后的中途断流不重试（SSE 已部分转发）。
 */
async function upstreamWithRetry(
  urlObj,
  method,
  headers,
  body,
  { retries = 2, baseBackoffMs = 300 } = {},
) {
  let lastErr
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await upstreamRequest(urlObj, method, headers, body)
    } catch (e) {
      lastErr = e
      console.warn(
        `[wire-proxy] upstream attempt ${attempt}/${retries + 1} failed: ${e?.message || e}${e?.code ? ` (${e.code})` : ''}`,
      )
      if (attempt <= retries) await new Promise((r) => setTimeout(r, baseBackoffMs * attempt))
    }
  }
  throw lastErr
}

let wireLogDir = null
function getWireLogDir() {
  if (!wireLogDir) {
    wireLogDir = path.resolve(process.cwd(), '.wire-logs')
    fs.mkdirSync(wireLogDir, { recursive: true })
  }
  return wireLogDir
}

/**
 * 请求目标归一化（2026-09-04 延迟尖刺真根因修复）：
 * CLI 在复用的 keep-alive 连接上发第二个 /messages 请求时，请求行是绝对形式
 * （如 "http://127.0.0.1:PORT/anthropic/v1/messages?beta=true"），新连接上是相对形式。
 * 绝对形式直接与上游域名拼接会产生 api.deepseek.comhttp 之类的假主机名 → ENOTFOUND
 * → CLI 指数退避 → 单轮 25-30s。按 RFC 7230 §5.3.2 服务端应接受绝对形式，
 * 这里统一归一化为 origin-form 再转发。
 */
function normalizeTarget(raw) {
  let t = raw || '/'
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
    try {
      const u = new URL(t)
      t = u.pathname + u.search
    } catch {
      /* 解析失败保持原值，交给后续错误处理 */
    }
  }
  return t
}

/**
 * 启动内置反代。
 * @returns {Promise<{baseUrl: string, port: number, close: () => void}>}
 *   baseUrl 形如 http://127.0.0.1:53124/anthropic（赋给 ANTHROPIC_BASE_URL）
 */
export function startWireProxy({ thinkingMode = 'disabled', wireLog = false } = {}) {
  const injectThinking = thinkingMode === 'disabled'
  const server = http.createServer(async (req, res) => {
    const reqNo = ++reqCounter
    const t0 = Date.now()
    console.log(
      `[wire-proxy] req#${reqNo} t=${new Date().toISOString()} ${req.method} url=${JSON.stringify(req.url)} http=${req.httpVersion} socket=${req.socket.remotePort}`,
    )
    try {
      const chunks = []
      for await (const c of req) chunks.push(c)
      let body = Buffer.concat(chunks)

      const headers = { ...req.headers }
      delete headers.host
      delete headers['content-length']

      const target = normalizeTarget(req.url)
      const isMessages = req.method === 'POST' && target.includes('/messages')
      if (isMessages && injectThinking) {
        try {
          const j = JSON.parse(body.toString('utf8'))
          j.thinking = { type: 'disabled' }
          body = Buffer.from(JSON.stringify(j))
        } catch {
          /* 非 JSON body 原样转发 */
        }
      }
      if (body.length) headers['content-length'] = String(body.length)

      if (isMessages && wireLog) {
        try {
          const line =
            JSON.stringify({
              ts: new Date().toISOString(),
              url: target,
              body: JSON.parse(body.toString('utf8')),
            }) + '\n'
          fs.appendFileSync(path.join(getWireLogDir(), `wire-${Date.now()}.jsonl`), line)
        } catch {
          /* 观测落盘失败不影响链路 */
        }
      }

      const upstreamUrl = new URL(UPSTREAM + target)
      const upstream = await upstreamWithRetry(upstreamUrl, req.method, headers, body)
      if (res.destroyed) {
        // 等待上游期间客户端已断连
        upstream.destroy()
        return
      }

      const resHeaders = {}
      for (const [k, v] of Object.entries(upstream.headers)) {
        if (!['transfer-encoding', 'content-length'].includes(k.toLowerCase())) resHeaders[k] = v
      }
      res.writeHead(upstream.statusCode, resHeaders)

      // 客户端断连 → 停止上游（省流）；上游中途断流 → 只收尾，不注入伪事件（避免污染 SSE 流）
      res.on('close', () => upstream.destroy())
      upstream.on('error', (e) => {
        console.warn(
          `[wire-proxy] upstream stream error: ${e?.message || e}${e?.code ? ` (${e.code})` : ''}`,
        )
        if (!res.writableEnded) res.end()
      })
      upstream.pipe(res)
      res.on('finish', () =>
        console.log(`[wire-proxy] req#${reqNo} done status=${upstream.statusCode} ms=${Date.now() - t0}`),
      )
    } catch (e) {
      console.warn(`[wire-proxy] upstream error: ${e?.message || e}${e?.code ? ` (${e.code})` : ''}`)
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: String(e?.message || e) }))
    }
  })

  startDnsPrewarm(UPSTREAM_HOSTNAME)

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      resolve({
        port,
        baseUrl: `http://127.0.0.1:${port}${new URL(ANTHROPIC_ENDPOINT).pathname}`,
        close: () => server.close(),
      })
    })
  })
}
