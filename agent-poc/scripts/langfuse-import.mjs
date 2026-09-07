#!/usr/bin/env node
/**
 * FlexDB → 本地 Langfuse 导入脚本（scripts/langfuse-import.mjs，TECH-007）
 *
 * 读取 FlexDB `agent_traces`（默认 importedAt 为空的），转换为 Langfuse
 * legacy ingestion batch（POST /api/public/ingestion，Basic Auth pk:sk），
 * 每条 trace 一个 POST（trace-create + span/generation-create），
 * 成功后回填 importedAt 防止重复导入。
 *
 * 用法（在 agent-poc 目录下）：
 *   node scripts/langfuse-import.mjs                # 导入所有未导入的
 *   node scripts/langfuse-import.mjs --limit 20     # 最多导入 20 条
 *   node scripts/langfuse-import.mjs --from 2026-08-30 --to 2026-08-31
 *   node scripts/langfuse-import.mjs --trace <traceId>
 *   node scripts/langfuse-import.mjs --dry-run      # 只打印，不导入不回填
 *
 * 依赖 .env.local（或环境变量）：
 *   LANGFUSE_HOST / LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY  本地 Langfuse
 *   TCB_SECRET_ID / TCB_SECRET_KEY [/ TCB_SESSION_TOKEN]       FlexDB 读取
 *
 * 说明：legacy ingestion 端点在自托管 v3 稳定（自托管升级 v4 移除时，
 * 只需改本脚本的协议转换部分，见 docs/tech/TECH-007 §4）。
 */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
import { getTcbCredentials } from '../src/config.js'

const args = process.argv.slice(2)
const argOf = (name) => {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null
}
const hasFlag = (name) => args.includes(name)
const DRY_RUN = hasFlag('--dry-run')
const LIMIT = Number(argOf('--limit') || 50)
const FROM = argOf('--from') ? Date.parse(argOf('--from')) : null
const TO = argOf('--to') ? Date.parse(argOf('--to')) : null
const TRACE_ID = argOf('--trace')

const LANGFUSE_HOST = (process.env.LANGFUSE_HOST || 'http://localhost:3100').replace(/\/$/, '')
const PK = process.env.LANGFUSE_PUBLIC_KEY
const SK = process.env.LANGFUSE_SECRET_KEY
const ENV_ID = process.env.TCB_ENV_ID || 'minicare-cloud-6gqledlle0132cbe'

if (!PK || !SK) {
  console.error('缺少 LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY（检查 .env.local 或环境变量）')
  process.exit(1)
}

/** 相对 ms 时间轴 → ISO 绝对时间（trace.startedAt 为基准） */
const iso = (baseMs, offsetMs) => new Date(baseMs + (offsetMs || 0)).toISOString()

/** 单条 trace → ingestion batch 事件数组 */
function toIngestionBatch(doc) {
  const base = doc.startedAt || Date.now()
  const events = []
  events.push({
    id: `${doc.traceId}-trace`,
    type: 'trace-create',
    timestamp: new Date(base).toISOString(),
    body: {
      id: doc.traceId,
      timestamp: new Date(base).toISOString(),
      name: doc.name || 'agent-chat',
      userId: doc.userId || null,
      sessionId: doc.sessionId || null,
      input: doc.input ?? null,
      output: doc.output ?? null,
      metadata: {
        ...(doc.metadata || {}),
        status: doc.status,
        flexdb_startedAt: doc.startedAt,
      },
      tags: doc.tags || [],
    },
  })
  for (const obs of doc.observations || []) {
    const isGen = obs.type === 'generation'
    const body = {
      id: obs.id,
      traceId: doc.traceId,
      parentObservationId: null,
      name: obs.name,
      startTime: iso(base, obs.startTime - base),
      endTime: iso(base, (obs.endTime || obs.startTime) - base),
      input: obs.input ?? undefined,
      output: obs.output ?? undefined,
      level: obs.level || 'DEFAULT',
      statusMessage: obs.statusMessage || undefined,
    }
    if (isGen) {
      // model + usage 明细（transcript-enrich 后含 input/output/cache 分解）
      body.model = obs.model || null
      const u = obs.usage
      if (u?.total_tokens) {
        body.usage = {
          total: u.total_tokens,
          unit: 'TOKENS',
          ...(u.input_tokens != null ? { input: u.input_tokens } : {}),
          ...(u.output_tokens != null ? { output: u.output_tokens } : {}),
        }
      }
      // cache token 不落 usage（Langfuse v3 不收），进 metadata 供展开查看
      const cacheRead = u?.cache_read_input_tokens
      const cacheCreation = u?.cache_creation_input_tokens
      if (obs.metadata || cacheRead != null || cacheCreation != null) {
        body.metadata = {
          ...(obs.metadata || {}),
          ...(cacheRead != null || cacheCreation != null
            ? { cliUsage: { cacheRead: cacheRead ?? 0, cacheCreation: cacheCreation ?? 0 } }
            : {}),
        }
      }
    } else if (obs.metadata) {
      body.metadata = obs.metadata
    }
    events.push({
      id: obs.id,
      type: isGen ? 'generation-create' : 'span-create',
      timestamp: iso(base, obs.startTime - base),
      body,
    })
  }
  return events
}

/** 删除 Langfuse 远端 trace（cliEnriched 重建前清理旧 telemetry generation；幂等） */
async function deleteTrace(traceId) {
  const res = await fetch(`${LANGFUSE_HOST}/api/public/traces/${traceId}`, {
    method: 'DELETE',
    headers: { Authorization: `Basic ${Buffer.from(`${PK}:${SK}`).toString('base64')}` },
  })
  if (res.ok || res.status === 404) return
  console.warn(`  ! DELETE trace ${traceId} 返回 ${res.status}（忽略，继续 upsert）`)
}

async function importTrace(doc) {
  // transcript 增强过的 trace：先删远端旧版本（旧 telemetry generation 无法原地
  // 替换 id），再整体重建 cli generations + spans，保证瀑布干净
  if (doc.metadata?.cliEnriched) {
    await deleteTrace(doc.traceId)
  }
  const batch = toIngestionBatch(doc)
  const res = await fetch(`${LANGFUSE_HOST}/api/public/ingestion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${PK}:${SK}`).toString('base64')}`,
    },
    body: JSON.stringify({ batch, metadata: { source: 'agent-poc-flexdb-import' } }),
  })
  if (!res.ok && res.status !== 207) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const result = await res.json()
  const errors = result.errors || []
  if (errors.length) {
    throw new Error(`部分事件失败: ${errors.map((e) => `${e.id}:${e.message || e.status}`).join('; ').slice(0, 300)}`)
  }
  return batch.length
}

async function main() {
  const credentials = getTcbCredentials()
  if (!credentials) {
    console.error('缺少 TCB 凭证（FlexDB 不可读）。请设置 TCB_SECRET_ID/KEY 或重新 tcb login。')
    process.exit(1)
  }

  const cloudbase = (await import('@cloudbase/node-sdk')).default
  const app = cloudbase.init({
    env: ENV_ID,
    secretId: credentials.secretId,
    secretKey: credentials.secretKey,
    ...(credentials.sessionToken ? { sessionToken: credentials.sessionToken } : {}),
  })
  const col = app.database().collection('agent_traces')

  // 按 startedAt 倒序拉取候选，再在本地过滤（importedAt 为空 / 时间范围 / 指定 trace）
  const { data } = await col.orderBy('startedAt', 'desc').limit(500).get()
  let candidates = (data || []).filter((d) => !d.importedAt)
  if (TRACE_ID) candidates = candidates.filter((d) => d.traceId === TRACE_ID)
  if (FROM) candidates = candidates.filter((d) => (d.startedAt || 0) >= FROM)
  if (TO) candidates = candidates.filter((d) => (d.startedAt || 0) <= TO)
  candidates = candidates.slice(0, LIMIT)

  console.log(`待导入 ${candidates.length} 条（host=${LANGFUSE_HOST}${DRY_RUN ? '，dry-run' : ''}）`)
  if (!candidates.length) {
    console.log('没有需要导入的 trace。')
    return
  }

  let ok = 0
  let fail = 0
  for (const doc of candidates) {
    const label = `${doc.traceId.slice(0, 8)}  ${doc.status?.padEnd(9)}  ${new Date(doc.startedAt).toLocaleString()}  "${String(doc.input?.message || '').slice(0, 30)}"`
    try {
      const n = await importTrace(doc)
      if (!DRY_RUN) {
        await col.doc(doc._id).update({ importedAt: Date.now() })
      }
      ok++
      console.log(`  ✓ ${label}  (${n} events)`)
    } catch (e) {
      fail++
      console.error(`  ✗ ${label}  → ${e.message}`)
    }
  }
  console.log(`\n完成：成功 ${ok}，失败 ${fail}${DRY_RUN ? '（dry-run 未回填 importedAt）' : ''}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
