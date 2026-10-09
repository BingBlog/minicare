/**
 * 线上 agent 端到端验收（scripts/verify-online.mjs）
 *
 * 用途：发版后一行命令确认线上新版本真的生效 —— 不走小程序、不走 minicare-server，
 * 直接对生产 CloudRun 服务发一轮真实提问，回放 SSE 事件流。
 *
 * 两个容易踩的点（都已在本脚本内处理）：
 *  1) x-agent-token 必须从**线上服务的 EnvParams** 现取，不能用本地 .env.local。
 *     2026-09-20 实测：本地 minicare-server/.env.local 是 18 位、线上是 48 位，
 *     拿本地值调线上会一直 401 —— 那是令牌不一致，不是发版失败。
 *  2) babyId / familyId 必须用**生产库**的值。生产旺仔 = a54c8980-…，
 *     dev 库同名旺仔 = 8535bda2-…，混用会查不到数据（脚本默认值即生产值，
 *     换宝宝时用 --baby-id / --family-id 显式传入）。
 *     本脚本**不连本地库**，就是为了避免 dev/prod 串味。
 *
 * 用法：
 *   cd minicare-agent && node scripts/verify-online.mjs "旺仔现在转奶到哪一步了？"
 *   node scripts/verify-online.mjs --domain                  # 只看版本与域名
 *   node scripts/verify-online.mjs --baby-id=<uuid> --family-id=<uuid> "…"
 *
 * 只读：不写业务库；不修改线上配置。
 */
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()

/** 生产库旺仔（CloudBase 只读 SQL 查得；勿与 dev 的 8535bda2-… 混用） */
const PROD_BABY_ID = 'a54c8980-2aac-473c-a26f-a150fce7ec70'
const PROD_FAMILY_ID = '6bb0e45b-d808-49cf-84c2-9ef7e40abe84'
const PROD_USER_ID = '00000000-0000-4000-8000-000000000001'

const args = process.argv.slice(2)
const domainOnly = args.includes('--domain')
const argOf = (k, dflt) => (args.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${dflt}`).slice(k.length + 3)
const babyId = argOf('baby-id', PROD_BABY_ID)
const familyId = argOf('family-id', PROD_FAMILY_ID)
const question = args.filter((a) => !a.startsWith('--')).join(' ')

const { default: cloudbase } = await import('@cloudbase/manager-node')
const app = cloudbase.init({
  envId: process.env.TCB_ENV_ID,
  secretId: process.env.TCB_SECRET_ID,
  secretKey: process.env.TCB_SECRET_KEY,
})

// ── 1. 线上版本 / 域名 / 令牌 ─────────────────────────────────────────
const detail = await app.cloudrun.detail({ serverName: 'minicare-agent' })
const online = detail.OnlineVersionInfos?.[0] || {}
const envParams = JSON.parse(detail.ServerConfig?.EnvParams || '{}')
const token = envParams.AGENT_INTERNAL_TOKEN
const domain = (JSON.stringify(detail).match(/https?:\/\/[a-zA-Z0-9.-]+\.sh\.run\.tcloudbase\.com/) || [])[0]

console.log(`线上版本：${online.VersionName || '未知'}（流量 ${online.FlowRatio ?? '?'}%）`)
console.log(`线上域名：${domain || '未找到'}`)
if (!token) console.log('⚠️ 线上未配置 AGENT_INTERNAL_TOKEN —— 鉴权会被跳过，生产不应如此')
else {
  // 本地调用方（minicare-server）的那份：部署 minicare-server 时会把它写进线上，
  // 一旦与 agent 侧不一致，线上聊天会全线 401。这里提前暴露差异。
  const serverEnvPath = new URL('../../minicare-server/.env.local', import.meta.url)
  let local = ''
  try {
    const line = readFileSync(serverEnvPath, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('AGENT_INTERNAL_TOKEN='))
    local = line ? line.slice('AGENT_INTERNAL_TOKEN='.length).replace(/["'\s]/g, '') : ''
  } catch {
    /* 文件不存在则不比较 */
  }
  const verdict = !local ? '无（未配置）' : local === token ? '一致' : `⚠️ 不一致（${local.length} 位）`
  console.log(`鉴权令牌：线上现取 ${token.length} 位｜minicare-server/.env.local ${verdict}`)
  if (local && local !== token) {
    console.log('   ↳ 若用本地这份重新部署 minicare-server，线上聊天会 401，务必先同步')
  }
}

if (domainOnly) process.exit(0)
if (!domain) {
  console.error('未取到线上域名，无法验收')
  process.exit(1)
}
if (!question) {
  console.error('用法：node scripts/verify-online.mjs [--baby-id=…] [--family-id=…] "你的问题"')
  process.exit(1)
}

// ── 2. 健康检查 ───────────────────────────────────────────────────────
const health = await (await fetch(`${domain}/health`)).json()
console.log(
  `健康检查：ready=${health.ready} db=${health.db} embedding=${health.embedding} env=${health.env} tokenAuth=${health.tokenAuth}`,
)
if (!health.ready) {
  console.error('服务未就绪，中止验收')
  process.exit(1)
}

// ── 3. 发一轮提问并回放 SSE ───────────────────────────────────────────
const ctx = { userId: PROD_USER_ID, familyId, babyId }
const cid = crypto.randomUUID()
console.log(`\n家长提问：${question}`)
console.log(`上下文：babyId=${babyId} familyId=${familyId}`)
console.log('─'.repeat(74))
const t0 = Date.now()
const res = await fetch(`${domain}/chat`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-agent-token': token,
    'x-agent-ctx': Buffer.from(JSON.stringify(ctx)).toString('base64'),
  },
  body: JSON.stringify({ userId: ctx.userId, conversationId: cid, message: question }),
})
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  process.exit(1)
}

const raw = await res.text()
let answer = ''
const toolCalls = []
const events = []
for (const block of raw.split('\n\n')) {
  if (!block.trim()) continue
  const evM = block.match(/^event: (.+)$/m)
  const dM = block.match(/^data: (.+)$/m)
  if (!evM || !dM) continue
  let data
  try {
    data = JSON.parse(dM[1])
  } catch {
    continue
  }
  events.push(evM[1])
  if (evM[1] === 'text' && data.delta) answer += data.delta
  if (evM[1] === 'tool_call') toolCalls.push(`${data.name}(${JSON.stringify(data.input).slice(0, 70)})`)
  if (evM[1] === 'error') console.error(`[错误] ${data.message}`)
}

console.log(`\n助手回答：\n${answer}`)
console.log(`\n${'─'.repeat(74)}`)
console.log(`工具调用 ${toolCalls.length} 次：${toolCalls.join('  →  ') || '（无）'}`)
console.log(`事件序列：${[...new Set(events)].join(', ')}`)
console.log(`端到端耗时：${Date.now() - t0}ms`)
process.exit(0)
