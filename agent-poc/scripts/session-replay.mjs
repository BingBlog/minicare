/**
 * 线上会话还原（TECH-007 排查工具）
 *
 * 从 FlexDB `agent_traces` 按 sessionId 分组，按最后活跃倒序列出会话，
 * 并打印最新会话的逐轮完整链路（用户问题 / 回答正文 / span 工具入参与输出 / generation token）。
 * 用于线上问题复现与定位（例：2026-09-19 日记日期错位、排敏进度问答）。
 *
 * 用法：cd agent-poc && node scripts/session-replay.mjs
 * 说明：TCB 凭证复用 .env.local（@cloudbase/node-sdk）；生产/demo 数据同库，
 *      userId 为真实用户 UUID，uid 已脱敏不必额外处理，输出请勿外发。
 */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
import cloudbase from '@cloudbase/node-sdk'
import { getTcbCredentials } from '../src/config.js'

const credentials = getTcbCredentials()
const app = cloudbase.init({
  env: process.env.TCB_ENV_ID || 'minicare-cloud-6gqledlle0132cbe',
  secretId: credentials.secretId,
  secretKey: credentials.secretKey,
  ...(credentials.sessionToken ? { sessionToken: credentials.sessionToken } : {}),
})
const col = app.database().collection('agent_traces')
const { data } = await col.orderBy('startedAt', 'desc').limit(200).get()

const bySession = new Map()
for (const d of data || []) {
  const sid = d.sessionId || 'unknown'
  if (!bySession.has(sid)) bySession.set(sid, [])
  bySession.get(sid).push(d)
}
const sessions = [...bySession.entries()]
  .map(([sid, arr]) => ({ sid, arr, last: arr[0].startedAt, first: arr[arr.length - 1].startedAt }))
  .sort((a, b) => b.last - a.last)

console.log('总 trace:', (data || []).length, ' 会话数:', sessions.length)
console.log('\n=== 会话列表（按最后活跃倒序）===')
for (const s of sessions.slice(0, 8)) {
  console.log(
    `  ${s.sid}  traces=${s.arr.length}  window=${new Date(s.first).toISOString()} → ${new Date(s.last).toISOString()}  baby=${s.arr[0].metadata?.babyId?.slice(0, 8)}`,
  )
}

const target = sessions[0]
console.log('\n' + '='.repeat(78))
console.log(`=== 最新会话完整链路: ${target.sid} (${target.arr.length} 轮) ===`)
console.log('='.repeat(78))
for (const d of [...target.arr].reverse()) {
  console.log('\n' + '─'.repeat(78))
  console.log(`[${new Date(d.startedAt).toISOString()}] traceId=${d.traceId} status=${d.status} totalMs=${d.metadata?.totalMs}`)
  console.log(`babyId=${d.metadata?.babyId}  userId=${d.userId}  historyCount=${d.metadata?.historyCount}`)
  console.log(`toolCalls=${JSON.stringify(d.metadata?.toolCalls)}`)
  console.log(`USER> ${d.input?.message}`)
  console.log(`BOT > ${(d.output || '').replace(/\n/g, '\n      ')}`)
  for (const o of d.observations || []) {
    if (o.type === 'span') {
      console.log(`  ▸ span ${o.name} [${(o.endTime || 0) - (o.startTime || 0)}ms] level=${o.level}`)
      console.log(`      in : ${JSON.stringify(o.input)}`)
      console.log(`      out: ${JSON.stringify(o.output)?.slice(0, 1500)}`)
    } else if (o.type === 'generation') {
      const u = o.usage || {}
      console.log(`  ▸ gen ${o.name} [${(o.endTime || 0) - (o.startTime || 0)}ms] in=${u.input_tokens} out=${u.output_tokens} cache=${u.cache_read_input_tokens || 0}`)
    }
  }
}
