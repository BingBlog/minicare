#!/usr/bin/env node
/**
 * POC：直连 claude-agent-sdk（绕过 OAK）三项关键假设验证（2026-09-04）
 *
 * a. thinking:{type:'disabled'} 是否真实生效（CLI 是否透传给 DeepSeek）
 *    → 对比"不传 thinking（DeepSeek 默认开思考）" vs "显式 disabled"
 * b. resume 是否可用（省每请求重建 agent）
 *    → 两轮对话，第二轮 resume，验证上下文连续性 + 耗时
 * c. 自定义 string systemPrompt + tools:[] 后 prefill 降幅
 *    → 对比 preset claude_code + 全量内置工具（OAK 现状）vs 精简配置
 *
 * 用法：cd agent-poc && node scripts/poc-direct-sdk.mjs
 * 依赖 .env.local 的 DEEPSEEK_API_KEY；不走 OAK，直接 query()。
 */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()

const { query } = await import('@anthropic-ai/claude-agent-sdk')
const os = await import('node:os')
const fs = await import('node:fs')
const path = await import('node:path')

const MODEL = 'deepseek-v4-flash'
const KEY = process.env.DEEPSEEK_API_KEY
if (!KEY) {
  console.error('缺少 DEEPSEEK_API_KEY')
  process.exit(1)
}

// 独立 CLAUDE_CONFIG_DIR，不污染 ~/.claude
const CFG_DIR = path.join(os.tmpdir(), 'dsh-poc', 'claude-config')
fs.mkdirSync(CFG_DIR, { recursive: true })
process.env.CLAUDE_CONFIG_DIR = CFG_DIR
process.env.ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic'
process.env.ANTHROPIC_AUTH_TOKEN = KEY
process.env.ANTHROPIC_API_KEY = ''
process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
process.env.API_TIMEOUT_MS = '120000'

const CUSTOM_PROMPT =
  '你是敏宝助手，一个牛奶蛋白过敏宝宝的喂养照护助手。用简体中文回答，简洁、温暖、专业。涉及医疗建议时提醒咨询医生。'

/** 跑一轮 query，收集耗时/usage/内容块。返回汇总对象 */
async function runTurn({ label, prompt, resume, thinking, systemPrompt, tools }) {
  const t0 = Date.now()
  let ttft = null
  let sessionId = null
  let usage = null
  const blocks = []
  let resultText = null
  let isError = false

  try {
    const q = query({
      prompt,
      options: {
        model: MODEL,
        maxTurns: 3,
        permissionMode: 'bypassPermissions',
        ...(resume ? { resume } : {}),
        ...(thinking !== undefined ? { thinking } : {}),
        ...(systemPrompt !== undefined ? { systemPrompt } : {}),
        ...(tools !== undefined ? { tools } : {}),
      },
    })
    for await (const msg of q) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        sessionId = msg.session_id
      } else if (msg.type === 'assistant') {
        if (ttft === null) ttft = Date.now() - t0
        const m = msg.message || {}
        if (m.usage) usage = m.usage
        for (const b of m.content || []) {
          blocks.push(
            b.type +
              (b.type === 'thinking'
                ? `(${(b.thinking || '').length}字)`
                : b.type === 'text'
                  ? `(${(b.text || '').length}字)`
                  : b.type === 'tool_use'
                    ? `(${b.name})`
                    : ''),
          )
        }
      } else if (msg.type === 'result') {
        resultText = (msg.result || '').slice(0, 80)
        isError = !!msg.is_error
      }
    }
  } catch (e) {
    return { label, error: e.message?.slice(0, 200) || String(e) }
  }

  return {
    label,
    sessionId,
    totalMs: Date.now() - t0,
    ttftMs: ttft,
    blocks: blocks.join('+') || '(空)',
    input: usage?.input_tokens,
    cacheRead: usage?.cache_read_input_tokens ?? 0,
    output: usage?.output_tokens,
    thinkingTokens: usage?.output_tokens_details?.thinking_tokens,
    resultText,
    isError,
  }
}

function print(r) {
  if (r.error) {
    console.log(`  ✗ [${r.label}] ERROR: ${r.error}`)
    return
  }
  console.log(
    `  [${r.label}] ${r.totalMs}ms (TTFT ${r.ttftMs}ms) | blocks: ${r.blocks} | in=${r.input} cacheR=${r.cacheRead} out=${r.output} think=${r.thinkingTokens} | sid=${r.sessionId ? r.sessionId.slice(0, 8) : null}`,
  )
  if (r.resultText) console.log(`     ↳ "${r.resultText}"`)
  if (r.isError) console.log('     ⚠ result is_error=true')
}

// ───────────────────────── 假设 a：thinking 开关 ─────────────────────────
console.log('\n══ 假设 a：thinking 开关是否生效（无工具，推理型问题）')
const REASONING_Q =
  '一个宝宝 7 天体重从 8.00kg 增长到 8.35kg，平均每天增长多少克？请给出计算过程，再回答。'
const aBase = await runTurn({
  label: 'a1-默认(不传thinking)',
  prompt: REASONING_Q,
  systemPrompt: CUSTOM_PROMPT,
  tools: [],
})
print(aBase)
const aOff = await runTurn({
  label: 'a2-thinking:disabled',
  prompt: REASONING_Q,
  thinking: { type: 'disabled' },
  systemPrompt: CUSTOM_PROMPT,
  tools: [],
})
print(aOff)
if (!aBase.error && !aOff.error) {
  const hasThinking = (s) => (s.blocks || '').includes('thinking')
  console.log(
    `\n  判定：默认轮 thinking 块=${hasThinking(aBase) ? '有' : '无'}(${aBase.thinkingTokens} tok)，disabled 轮=${hasThinking(aOff) ? '有' : '无'}(${aOff.thinkingTokens} tok)；耗时 ${aBase.totalMs}ms → ${aOff.totalMs}ms（省 ${Math.round((1 - aOff.totalMs / aBase.totalMs) * 100)}%）`,
  )
}

// ───────────────────────── 假设 b：resume 连续性 ─────────────────────────
console.log('\n══ 假设 b：resume 跨请求会话连续性')
const b1 = await runTurn({
  label: 'b1-首轮(记住暗号)',
  prompt: '请记住这个暗号：芒果奶昔。只回复"OK"两个字，不要说别的。',
  thinking: { type: 'disabled' },
  systemPrompt: CUSTOM_PROMPT,
  tools: [],
})
print(b1)
let b2 = null
if (b1.sessionId) {
  const fullSid = b1.sessionId // 注意：print 里截断过，这里用原始值
  b2 = await runTurn({
    label: 'b2-resume(考暗号)',
    prompt: '我刚才让你记住的暗号是什么？只回答暗号内容。',
    resume: fullSid,
    thinking: { type: 'disabled' },
    systemPrompt: CUSTOM_PROMPT,
    tools: [],
  })
  print(b2)
  if (!b2.error) {
    const ok = (b2.resultText || '').includes('芒果奶昔')
    console.log(
      `\n  判定：resume 连续性=${ok ? '✅ 通过（上下文保留）' : '❌ 失败'}；第二轮 in=${b2.input}（cacheR=${b2.cacheRead}），耗时 ${b2.totalMs}ms`,
    )
  }
} else {
  console.log('  ✗ 首轮未拿到 session_id，无法测 resume')
}

// ───────────────────── 假设 c：prefill 降幅 ─────────────────────
console.log('\n══ 假设 c：prefill 对比（相同用户问题）')
const PRE_Q = '宝宝今天喝了 600ml 奶，对一个 7 月龄宝宝够吗？简要回答。'
const c1 = await runTurn({
  label: 'c1-OAK现状(preset+全量工具)',
  prompt: PRE_Q,
  thinking: { type: 'disabled' },
  systemPrompt: { type: 'preset', preset: 'claude_code' },
  tools: { type: 'preset', preset: 'claude_code' },
})
print(c1)
const c2 = await runTurn({
  label: 'c2-精简(自定义prompt+无工具)',
  prompt: PRE_Q,
  thinking: { type: 'disabled' },
  systemPrompt: CUSTOM_PROMPT,
  tools: [],
})
print(c2)
if (!c1.error && !c2.error) {
  const drop = Math.round((1 - c2.input / c1.input) * 100)
  console.log(`\n  判定：prefill input ${c1.input} → ${c2.input} tokens（降 ${drop}%）`)
}

console.log('\n══ POC 完成')
