#!/usr/bin/env node
/**
 * CLI transcript JSONL → FlexDB trace 增强（scripts/transcript-enrich.mjs，TECH-007 P0）
 *
 * agent 底层是闭源 Claude CLI（claude-agent-sdk），宿主无法感知其内部执行逻辑；
 * 但 CLI 会把完整会话 transcript 以 JSONL 落盘（~/.minicare-agent/claude-config/
 * projects/<cwd>/<cli-session-id>.jsonl，一行一事件，append-only）。本脚本解析
 * transcript，把「每轮 LLM 调用的精确细节」（真实 model、精确 usage 含
 * cache_read/cache_creation、text/tool_use blocks、stop_reason）回填到 FlexDB
 * `agent_traces` 对应 trace：
 *
 *   1. 扫描 transcript 目录，解析每个文件 → { sessionId, startedAt, firstUserText, turns[] }
 *   2. 拉取 FlexDB trace（默认最近 7 天，可 --trace / --limit / --from / --to）
 *   3. 匹配：时间窗（startedAt 差 ≤120s）+ 首问归一化相等
 *   4. 增强：observations 中的 generation（telemetry 模糊记录：usage 累计挂末轮、
 *      model 固定默认值、无 cache 分解）整体替换为 transcript 推导的精确 turns
 *      （id 确定性派生 `${traceId}-cli-${i}`，Langfuse 重建时稳定）；
 *      span（工具执行 input/output/ms）保留不动
 *   5. 置 importedAt=null → 下次 langfuse-import 会先 DELETE 远端 trace 再重建
 *      （import 脚本识别 metadata.cliEnriched 后执行删除重建）
 *
 * 用法（在 minicare-agent 目录下）：
 *   node scripts/transcript-enrich.mjs                 # 全量增量增强
 *   node scripts/transcript-enrich.mjs --trace <id>    # 指定 trace（找匹配 transcript）
 *   node scripts/transcript-enrich.mjs --limit 10
 *   node scripts/transcript-enrich.mjs --dry-run       # 只打印匹配结果，不写 FlexDB
 *
 * 解析容错（格式随 CLI 升级可能变）：
 *   - 行 JSON 解析失败跳过；只认 type=assistant（message.role==='assistant'）行
 *   - 同 message.id 多行 = 同一 LLM 调用的多个 block，按 message.id 合并去重
 *   - attachment / atis-latch / queue-operation 等非 assistant 行跳过
 *   - tool_result 行（user 消息）不是 LLM 调用，跳过（工具细节 telemetry span 已有）
 *
 * 匹配幂等：trace.metadata.cliEnriched 记录 transcriptFile + enrichedAt；
 *   文件 mtime 未变化且已增强过 → 跳过（不重复写）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
import cloudbase from '@cloudbase/node-sdk'
import { getTcbCredentials } from '../src/config.js'

const args = process.argv.slice(2)
const argOf = (name) => {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null
}
const hasFlag = (name) => args.includes(name)
const DRY_RUN = hasFlag('--dry-run')
const LIMIT = Number(argOf('--limit') || 50)
const TRACE_ID = argOf('--trace')
const FROM = argOf('--from') ? Date.parse(argOf('--from')) : null
const TO = argOf('--to') ? Date.parse(argOf('--to')) : null

const ENV_ID = process.env.TCB_ENV_ID || 'minicare-cloud-6gqledlle0132cbe'
const MATCH_WINDOW_MS = 120_000 // 匹配时间窗
const THINKING_KEEP = 3000 // 单轮 thinking 截断字数（Langfuse metadata 展示用）
const TOOL_INPUT_KEEP = 600 // 单次 tool_use 入参摘要截断
const TEXT_KEEP = 65_000 // 单轮输出文本截断（Langfuse 单字段上限保护）

const TRANSCRIPT_DIR = path.join(
  os.homedir(),
  '.minicare-agent',
  'claude-config',
  'projects',
)

/** 归一化首问（去首尾空白即可；user text 与 trace.input.message 同源） */
const normText = (s) => String(s || '').trim().replace(/\s+/g, ' ')

/**
 * 解析单个 transcript JSONL → 结构化摘要。
 * @returns {null | { file, mtimeMs, sessionId, startedAt, firstUserText, turns }}
 *   turns: [{ idx, messageId, model, ts, usage, stopReason, text, thinking, toolUses }]
 */
function parseTranscript(file) {
  let lines
  try {
    lines = readFileSync(file, 'utf8').split('\n')
  } catch {
    return null
  }
  const st = statSync(file)
  const mtimeMs = st.mtimeMs
  const sessionId = path.basename(file, '.jsonl')

  const turns = [] // 已合并的 LLM 调用
  let startedAt = null
  let firstUserText = null
  let lastClosed = null // 上一条 assistant 的 ts（turn 时间轴用）

  for (const raw of lines) {
    if (!raw.trim()) continue
    let o
    try {
      o = JSON.parse(raw)
    } catch {
      continue // 半行写入/损坏，跳过
    }
    if (!o || typeof o !== 'object') continue

    if (startedAt == null && o.timestamp) startedAt = Date.parse(o.timestamp)
    if (o.type === 'user' && Array.isArray(o.message?.content)) {
      if (firstUserText == null) {
        const text = o.message.content
          .filter((b) => b?.type === 'text')
          .map((b) => b.text)
          .join('')
        if (text.trim()) firstUserText = text
      }
      continue
    }
    if (o.type !== 'assistant') continue
    const m = o.message || {}
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue

    const ts = Date.parse(m.timestamp || o.timestamp)
    let turn = turns.find((t) => t.messageId === m.id)
    if (!turn) {
      turn = {
        idx: turns.length,
        messageId: m.id,
        model: m.model || null,
        ts,
        usage: m.usage
          ? {
              input_tokens: m.usage.input_tokens ?? null,
              output_tokens: m.usage.output_tokens ?? null,
              cache_read_input_tokens: m.usage.cache_read_input_tokens ?? null,
              cache_creation_input_tokens: m.usage.cache_creation_input_tokens ?? null,
            }
          : null,
        stopReason: m.stop_reason || null,
        text: '',
        thinking: '',
        toolUses: [], // [{ id, name, input }]
      }
      turns.push(turn)
    }
    // 同 message.id 多行：追加 blocks（thinking/text/tool_use）
    for (const b of m.content) {
      if (b?.type === 'text' && b.text) turn.text += b.text
      else if (b?.type === 'thinking' && b.thinking) {
        // 重复行同块可能重复 append；用去重近似（CLI 按块整行落盘，同块只出现一次）
        if (!turn.thinking.includes(b.thinking.slice(0, 80))) turn.thinking += b.thinking
      } else if (b?.type === 'tool_use') {
        if (!turn.toolUses.some((t) => t.id === b.id)) {
          turn.toolUses.push({ id: b.id, name: b.name, input: b.input ?? null })
        }
      }
    }
    lastClosed = ts
  }

  if (!turns.length || !startedAt) return null
  // 归一化 turns 时间轴：turn-1 start = startedAt，turn-i+1 start = turn-i 完成时刻
  let prevEnd = startedAt
  for (const t of turns) {
    if (!t.ts || Number.isNaN(t.ts)) t.ts = prevEnd
    t.startMs = prevEnd
    t.endMs = t.ts >= t.startMs ? t.ts : t.startMs
    prevEnd = t.endMs
  }
  return {
    file,
    mtimeMs,
    sessionId,
    startedAt,
    firstUserText: normText(firstUserText),
    turns,
  }
}

/** 扫描 transcript 目录所有 .jsonl（跳过正在写入的空/半文件） */
function scanTranscripts() {
  const out = []
  let root
  try {
    root = readdirSync(TRANSCRIPT_DIR, { withFileTypes: true })
  } catch {
    return out
  }
  for (const dir of root) {
    if (!dir.isDirectory()) continue
    let files
    try {
      files = readdirSync(path.join(TRANSCRIPT_DIR, dir.name))
    } catch {
      continue
    }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue
      const fp = path.join(TRANSCRIPT_DIR, dir.name, f)
      const parsed = parseTranscript(fp)
      if (parsed) out.push(parsed)
    }
  }
  return out.sort((a, b) => a.startedAt - b.startedAt)
}

/** transcript 推导的精确 LLM 调用 observations（替换 telemetry generation） */
function cliGenerations(traceId, transcript, startedAtBase) {
  const startedAt = transcript.startedAt
  return transcript.turns.map((t, i) => {
    const u = t.usage || {}
    const total =
      (u.input_tokens || 0) +
      (u.output_tokens || 0) +
      (u.cache_read_input_tokens || 0) +
      (u.cache_creation_input_tokens || 0)
    const text = t.text.slice(0, TEXT_KEEP)
    const thinking = t.thinking.slice(0, THINKING_KEEP)
    const toolUses = t.toolUses.map((tu) => ({
      name: tu.name?.replace(/^mcp__minicare__/, ''),
      input: JSON.stringify(tu.input).slice(0, TOOL_INPUT_KEEP),
    }))
    // observation.startTime 与 trace 时间轴同刻度（相对 base，与 import 端 iso() 对齐）
    const startTime = startedAtBase + (t.startMs - startedAt)
    const endTime = startedAtBase + (t.endMs - startedAt)
    return {
      id: `${traceId}-cli-${i}`,
      type: 'generation',
      name: `llm-turn-${i + 1}`,
      model: t.model,
      startTime,
      endTime: endTime > startTime ? endTime : startTime + 1,
      output: text || null,
      usage: total > 0 ? { total_tokens: total, ...(u.input_tokens != null ? { input_tokens: u.input_tokens } : {}), ...(u.output_tokens != null ? { output_tokens: u.output_tokens } : {}), ...(u.cache_read_input_tokens != null ? { cache_read_input_tokens: u.cache_read_input_tokens } : {}), ...(u.cache_creation_input_tokens != null ? { cache_creation_input_tokens: u.cache_creation_input_tokens } : {}) } : null,
      level: 'DEFAULT',
      statusMessage: null,
      metadata: {
        cli: {
          messageId: t.messageId,
          stopReason: t.stopReason,
          thinking: thinking || null,
          toolUses: toolUses.length ? toolUses : null,
          thinkingTruncated: t.thinking.length > THINKING_KEEP,
          textTruncated: t.text.length > TEXT_KEEP,
        },
      },
    }
  })
}

async function main() {
  const credentials = getTcbCredentials()
  if (!credentials) {
    console.error('缺少 TCB 凭证。请设置 TCB_SECRET_ID/KEY 或重新 tcb login。')
    process.exit(1)
  }
  const transcripts = scanTranscripts()
  if (!transcripts.length) {
    console.log(`transcript 目录为空：${TRANSCRIPT_DIR}`)
    return
  }
  console.log(`扫描到 ${transcripts.length} 个 transcript 文件（${TRANSCRIPT_DIR}）`)

  const app = cloudbase.init({
    env: ENV_ID,
    secretId: credentials.secretId,
    secretKey: credentials.secretKey,
    ...(credentials.sessionToken ? { sessionToken: credentials.sessionToken } : {}),
  })
  const col = app.database().collection('agent_traces')

  // 拉候选 trace：最近 1000 条，本地过滤（时间范围/指定 trace）
  const { data } = await col.orderBy('startedAt', 'desc').limit(1000).get()
  let traces = (data || []).filter((d) => d.status === 'completed')
  if (TRACE_ID) traces = traces.filter((d) => d.traceId === TRACE_ID)
  if (FROM) traces = traces.filter((d) => (d.startedAt || 0) >= FROM)
  if (TO) traces = traces.filter((d) => (d.startedAt || 0) <= TO)
  traces = traces.slice(0, LIMIT)
  console.log(`候选 trace ${traces.length} 条${DRY_RUN ? '（dry-run）' : ''}`)
  if (!traces.length) return

  // transcript 已被 trace 关联的集合（防重复匹配到多条 trace）
  const claimedFiles = new Set()

  let enriched = 0
  let matchedNoChange = 0
  for (const doc of traces) {
    const tText = normText(doc.input?.message || '')
    const tStart = doc.startedAt || 0
    if (!tText || !tStart) continue
    const label = `${doc.traceId.slice(0, 8)}  ${new Date(doc.startedAt).toLocaleString()}  "${String(doc.input?.message || '').slice(0, 30)}"`

    // 找匹配 transcript：时间窗内 + 首问相等，取时间差最小
    let best = null
    let bestGap = Infinity
    for (const tr of transcripts) {
      if (claimedFiles.has(tr.file)) continue
      const gap = Math.abs(tr.startedAt - tStart)
      if (gap > MATCH_WINDOW_MS) continue
      if (tr.firstUserText !== tText) continue
      if (gap < bestGap) {
        bestGap = gap
        best = tr
      }
    }
    if (!best) continue

    // 幂等：该 file 已增强且 mtime 未变
    const prev = doc.metadata?.cliEnriched
    if (prev?.transcriptFile === best.file && prev?.enrichedAt >= best.mtimeMs) {
      matchedNoChange++
      claimedFiles.add(best.file)
      continue
    }

    // 组装新 observations：cli generations + 原 spans（去 telemetry generation）
    const spans = (doc.observations || []).filter((o) => o.type === 'span')
    const gens = cliGenerations(doc.traceId, best, tStart)
    const observations = [...gens, ...spans]
    const metadata = {
      ...(doc.metadata || {}),
      cliEnriched: {
        transcriptFile: best.file,
        cliSessionId: best.sessionId,
        turns: best.turns.length,
        gens: gens.length,
        spans: spans.length,
        matchedBy: 'time-window+first-message',
        enrichedAt: Date.now(),
      },
    }

    if (DRY_RUN) {
      console.log(`  ~ ${label} ← ${best.file}（${best.turns.length} turns）`)
      enriched++
      claimedFiles.add(best.file)
      continue
    }
    // update：observations/metadata 整体替换 + importedAt 置空触发 Langfuse 重建
    await col.doc(doc._id).update({
      observations,
      metadata,
      importedAt: null,
    })
    enriched++
    claimedFiles.add(best.file)
    console.log(`  ✓ ${label} ← ${best.file.split('/').pop()}（turns=${best.turns.length}, spans=${spans.length}, 已置 importedAt=null 待重建）`)
  }
  console.log(`\n完成：增强 ${enriched}，幂等跳过 ${matchedNoChange}${DRY_RUN ? '（dry-run 未写 FlexDB）' : ''}。之后运行 node scripts/langfuse-import.mjs 重建 Langfuse trace。`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
