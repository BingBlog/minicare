/**
 * 模拟线上「整包部署在 /staging/」：`base: './'` 下资源相对当前路径。
 *
 * 构建时强制 VITE_API_BASE_URL 为空（与 npm run dev 一致），请求走同源 /api；
 * 本脚本再将 /api 代理到本地后端（默认 127.0.0.1:3001）。
 *
 * 用法：npm run preview:staging
 * 页面：http://127.0.0.1:4173/staging/
 *
 * 环境变量：
 *   PREVIEW_STAGING_PORT — 预览端口，默认 4173
 *   PREVIEW_API_PROXY    — 后端地址，默认 http://127.0.0.1:3001
 */
import { cpSync, mkdirSync, rmSync, createReadStream, statSync, readFileSync, existsSync } from 'fs'
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const previewRoot = path.join(root, '.preview')
const stagingDir = path.join(previewRoot, 'staging')
const dist = path.join(root, 'dist')

const PORT = Number(process.env.PREVIEW_STAGING_PORT || 4173)
const API_PROXY = (process.env.PREVIEW_API_PROXY || 'http://127.0.0.1:3001').replace(/\/$/, '')

function runStagingBuildForLocalPreview() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const r = spawnSync(npm, ['run', 'build:staging'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      // 覆盖 .env.staging 中的线上 CloudRun，使打包结果与 dev 一样走同源 /api
      VITE_API_BASE_URL: '',
    },
  })
  if (r.error) {
    console.error(r.error)
    process.exit(1)
  }
  if (r.status !== 0) process.exit(r.status ?? 1)
}

runStagingBuildForLocalPreview()

if (!existsSync(dist)) {
  console.error('dist 不存在，构建失败')
  process.exit(1)
}

rmSync(previewRoot, { recursive: true, force: true })
mkdirSync(stagingDir, { recursive: true })
cpSync(dist, stagingDir, { recursive: true })

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel))
  if (!p.startsWith(base)) return null
  return p
}

function proxyApiToBackend(req, res) {
  const t = new URL(API_PROXY)
  const port = t.port ? Number(t.port) : 80
  const incoming = new URL(req.url || '/', 'http://127.0.0.1')
  const pathWithQuery = incoming.pathname + incoming.search

  const headers = { ...req.headers }
  headers.host = `${t.hostname}:${port}`
  delete headers.connection

  const opts = {
    hostname: t.hostname,
    port,
    path: pathWithQuery,
    method: req.method,
    headers,
  }

  const proxyReq = http.request(opts, (proxyRes) => {
    const outHeaders = { ...proxyRes.headers }
    res.writeHead(proxyRes.statusCode || 502, outHeaders)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(
      `Bad Gateway: ${err.message}\n请确认本地后端已启动（默认 ${API_PROXY}，与 vite dev 的 /api 代理一致）。\n`
    )
  })

  req.pipe(proxyReq)
}

const server = http.createServer((req, res) => {
  const host = req.headers.host || `127.0.0.1:${PORT}`
  const url = new URL(req.url || '/', `http://${host}`)

  if (url.pathname.startsWith('/api')) {
    proxyApiToBackend(req, res)
    return
  }

  if (url.pathname === '/staging') {
    res.writeHead(302, { Location: '/staging/' })
    res.end()
    return
  }

  if (!url.pathname.startsWith('/staging/') && url.pathname !== '/staging') {
    res.writeHead(302, { Location: '/staging/' })
    res.end()
    return
  }

  let rel = url.pathname.replace(/^\/staging\/?/, '')
  if (!rel) rel = 'index.html'

  let filePath = safeJoin(stagingDir, rel)
  if (!filePath) {
    res.writeHead(403).end()
    return
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    const indexHtml = path.join(stagingDir, 'index.html')
    if (existsSync(indexHtml) && !rel.includes('.')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(readFileSync(indexHtml))
      return
    }
    res.writeHead(404).end('Not Found')
    return
  }

  const ext = path.extname(filePath)
  const type = MIME[ext] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type })
  createReadStream(filePath).pipe(res)
})

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，请关闭其它 preview 或设置 PREVIEW_STAGING_PORT`)
  } else {
    console.error(err)
  }
  process.exit(1)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('')
  console.log(`  Staging 预览（/staging/ 静态资源 + /api → ${API_PROXY}）`)
  console.log(`  http://127.0.0.1:${PORT}/staging/`)
  console.log('')
})
