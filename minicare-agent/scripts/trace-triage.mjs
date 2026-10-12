#!/usr/bin/env node
/**
 * FlexDB 线上 trace 只读查询脚本（scripts/trace-triage.mjs，PRD-015 / TECH-032 §2）
 *
 * 供平台「线上沉淀」页读取候选 trace（**只读**，不写任何数据、不触碰 Langfuse）。
 *
 * 用法（在 minicare-agent 目录下）：
 *   node scripts/trace-triage.mjs --mode list   [--days 7] [--limit 500] [--offset 0]
 *   node scripts/trace-triage.mjs --mode detail --trace <traceId> [--max-chars 1500] [--neighbors 6]
 *
 * 输出协议（TECH-032 §2.3）：所有输出以**单行** `@@TRIAGE@@ {json}` 结尾（stdout 可能有
 * dotenv 提示等噪声行，消费方按前缀行解析，勿整体 JSON.parse）：
 *   { ok:true,  mode, data:{…} }
 *   { ok:false, error:"trace_not_found" | "missing_tcb_credentials" | "flexdb_unreachable" | "bad_args",
 *     detail?:string }
 *
 * 依赖 .env.local（或环境变量）：TCB_ENV_ID / TCB_SECRET_ID / TCB_SECRET_KEY
 * （与 langfuse-import.mjs 完全同款凭据口径）。
 */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
import { getTcbCredentials } from '../src/config.js'

const PREFIX = '@@TRIAGE@@ '
const args = process.argv.slice(2)
const argOf = (name) => {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null
}

const MODE = (argOf('--mode') || '').trim()
const DAYS = clampInt(Number(argOf('--days') || 7), 1, 90)
const LIMIT = clampInt(Number(argOf('--limit') || 500), 1, 500)
const OFFSET = clampInt(Number(argOf('--offset') || 0), 0, 100000)
const TRACE_ID = (argOf('--trace') || '').trim()
const MAX_CHARS = clampInt(Number(argOf('--max-chars') || 1500), 200, 20000)
const NEIGHBORS = clampInt(Number(argOf('--neighbors') || 6), 0, 20)

function clampInt(v, lo, hi) {
  if (!Number.isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, Math.trunc(v)))
}

const emit = (payload) => {
  console.log(PREFIX + JSON.stringify(payload))
}

const fail = (error, detail) => {
  emit({ ok: false, error, ...(detail ? { detail: String(detail).slice(0, 300) } : {}) })
  process.exit(1)
}

function briefText(v, max) {
  if (v === null || v === undefined) return null
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (s === undefined) return null
  return s.length > max ? s.slice(0, max) + '…' : s
}

function toBrief(obs, max) {
  const start = obs.startTime || null
  const end = obs.endTime || null
  return {
    type: obs.type,
    name: obs.name || '',
    level: obs.level || 'DEFAULT',
    statusMessage: obs.statusMessage || null,
    startTime: start,
    endTime: end,
    ms: start && end ? end - start : null,
    inputBrief: briefText(obs.input, max),
    outputBrief: briefText(obs.output, max),
  }
}

async function main() {
  if (MODE !== 'list' && MODE !== 'detail') {
    fail('bad_args', '需要 --mode list 或 --mode detail')
  }
  if (MODE === 'detail' && !TRACE_ID) {
    fail('bad_args', 'detail 模式需要 --trace <traceId>')
  }

  const credentials = getTcbCredentials()
  if (!credentials) {
    fail('missing_tcb_credentials', '设置 TCB_SECRET_ID/KEY 或重新 tcb login')
  }

  const cloudbase = (await import('@cloudbase/node-sdk')).default
  const app = cloudbase.init({
    env: process.env.TCB_ENV_ID || 'minicare-cloud-6gqledlle0132cbe',
    secretId: credentials.secretId,
    secretKey: credentials.secretKey,
    ...(credentials.sessionToken ? { sessionToken: credentials.sessionToken } : {}),
  })
  const col = app.database().collection('agent_traces')

  if (MODE === 'list') {
    const since = Date.now() - DAYS * 86400000
    const { data } = await col.orderBy('startedAt', 'desc').limit(LIMIT).get()
    const items = (data || [])
      .filter((d) => (d.startedAt || 0) >= since)
      .slice(OFFSET)
      .map((d) => {
        const obs = d.observations || []
        return {
          traceId: d.traceId,
          startedAt: d.startedAt,
          status: d.status || 'unknown',
          sessionId: d.sessionId || null,
          message: (d.input || {}).message || '',
          outputBrief: briefText(d.output, 160),
          eventCount: (d.metadata || {}).eventCount || 0,
          toolCallCount: obs.filter((o) => o && o.type === 'span').length,
          forceFinished: !!(d.metadata || {}).forceFinished,
          imported: !!d.importedAt,
        }
      })
    emit({ ok: true, mode: 'list', data: { items, window: { days: DAYS, limit: LIMIT, offset: OFFSET } } })
    return
  }

  // detail
  const { data } = await col.where({ traceId: TRACE_ID }).limit(1).get()
  const doc = (data || [])[0]
  if (!doc) {
    fail('trace_not_found', `FlexDB 中不存在该 trace（窗口内）：${TRACE_ID}`)
  }
  const trace = {
    traceId: doc.traceId,
    sessionId: doc.sessionId || null,
    userId: doc.userId || null,
    name: doc.name || 'agent-chat',
    input: doc.input || {},
    output: doc.output || null,
    metadata: doc.metadata || {},
    tags: doc.tags || [],
    status: doc.status || 'unknown',
    startedAt: doc.startedAt,
    endedAt: doc.endedAt || null,
    imported: !!doc.importedAt,
  }
  const observationsBrief = (doc.observations || []).map((o) => toBrief(o || {}, MAX_CHARS))

  // 同会话上下文（±NEIGHBORS/2 条，按时间排序；供"这是追问链里的哪一问"判断）
  let sessionContext = []
  if (trace.sessionId && NEIGHBORS > 0) {
    const { data: sibs } = await col.where({ sessionId: trace.sessionId }).orderBy('startedAt', 'asc').limit(100).get()
    const seq = (sibs || [])
      .slice()
      .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
      .map((d) => ({ traceId: d.traceId, startedAt: d.startedAt, messageBrief: briefText((d.input || {}).message, 60) }))
    const idx = seq.findIndex((d) => d.traceId === TRACE_ID)
    if (idx >= 0) {
      const half = Math.floor(NEIGHBORS / 2)
      sessionContext = seq.filter((_, i) => i !== idx && Math.abs(i - idx) <= half)
    }
  }

  emit({ ok: true, mode: 'detail', data: { trace, observationsBrief, sessionContext } })
}

main().catch((e) => {
  fail('flexdb_unreachable', e?.message || e)
})
