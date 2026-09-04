/**
 * ⚠️ 2026-09-04 OAK 已移除：本诊断脚本基于 OAK session 协议，已失效。替代：scripts/poc-direct-sdk.mjs / poc-wire-proxy.mjs。
 * OAK 直连延迟诊断 v2：完整走 send → tool_call → 工具执行 → respondToolUse resume 流
 * 记录全时间线，重点：resume 流 TTFT、thinking chunk（agent_thought_chunk）、usage
 * 用法：node scripts/diag-latency.mjs "问题"
 */
import { loadLocalEnv } from '../src/lib/env.js'
loadLocalEnv()

const T0 = Date.now()
const ts = () => `+${((Date.now() - T0) / 1000).toFixed(2)}s`
const mark = (label) => console.log(`${ts()} ${label}`)

const { buildAgent } = await import('../src/agent.js')
const { loadConfig } = await import('../src/config.js')
const { getToolExecutor } = await import('../src/lib/tools/index.js')
const config = loadConfig()

mark('[boot] imports done')
const agent = buildAgent(config, [], {
  userId: 'diag-user',
  familyId: config.testFamilyId || undefined,
  babyId: config.testBabyId || undefined,
})
const session = await agent.startSession({ userId: 'diag-user', conversationId: crypto.randomUUID() })
mark('[boot] session started')

const question = process.argv[2] || '旺仔今天喝了多少奶'
mark(`[send] "${question}"`)

let thinkingChunks = 0, thinkingChars = 0, textChunks = 0, textChars = 0
let usageUpdates = []

const drain = async (iter, label) => {
  const tStart = Date.now()
  let firstChunkAt = null
  const out = { done: false }
  while (true) {
    const { value: event, done } = await iter.next()
    if (done) { out.done = true; break }
    const u = event.params?.update
    if (u?.sessionUpdate === 'agent_message_chunk') {
      if (!firstChunkAt) { firstChunkAt = Date.now(); mark(`  [${label}] first text chunk (+${firstChunkAt - tStart}ms)`) }
      textChunks++; textChars += u.content?.text?.length || 0
    } else if (u?.sessionUpdate === 'agent_thought_chunk') {
      if (!firstChunkAt) { firstChunkAt = Date.now(); mark(`  [${label}] first THINKING chunk (+${firstChunkAt - tStart}ms)`) }
      thinkingChunks++; thinkingChars += u.content?.text?.length || 0
      if (thinkingChunks === 1) console.log(`  [${label}] thinking preview: ${(u.content?.text || '').slice(0, 120)}`)
    } else if (u?.sessionUpdate === 'usage_update' && typeof u.used === 'number') {
      usageUpdates.push({ at: ts(), used: u.used })
    } else if (event.method?.startsWith('client/')) {
      return { toolCall: { name: event.method.slice(7), id: event._meta?.toolCallId, params: event.params }, iter }
    }
  }
  return out
}

// ── turn-1：主流 ──
const iterator = session.send(question)[Symbol.asyncIterator]()
const t1 = await drain(iterator, 'turn1')
if (!t1.toolCall) { mark('[done] 无工具调用，主流结束'); finish() ; process.exit(0) }
mark(`[tool] ${t1.toolCall.name} params=${JSON.stringify(t1.toolCall.params).slice(0, 100)}`)

const tExec0 = Date.now()
const exec = getToolExecutor(t1.toolCall.name)
const output = exec ? await exec(t1.toolCall.params ?? {}, { userId: 'diag-user', familyId: config.testFamilyId, babyId: config.testBabyId }) : JSON.stringify({ ok: false, error: 'unknown tool' })
mark(`[tool] executed in ${Date.now() - tExec0}ms outputLen=${output.length}`)

// ── turn-2：resume 流 ──
const resumeStream = session.respondToolUse({ toolUseId: t1.toolCall.id, output })
const t2 = await drain(resumeStream[Symbol.asyncIterator](), 'turn2')
mark(`[done] resume done=${t2.done}`)

function finish() {}
console.log('\n========== 汇总 ==========')
console.log(`thinking: chunks=${thinkingChunks} chars=${thinkingChars}`)
console.log(`text: chunks=${textChunks} chars=${textChars}`)
console.log(`usage_updates: ${JSON.stringify(usageUpdates)}`)
console.log(`总耗时: ${ts()}`)
process.exit(0)
