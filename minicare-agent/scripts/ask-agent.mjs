/**
 * 单轮对话实跑（scripts/ask-agent.mjs）
 *
 * 用途：不走小程序、不走 HTTP，直接驱动生产同一套链路（runAgentTurn + systemPrompt 注入），
 * 问一句看助手实际怎么答 —— 用来验证"注入的画像/现状是否真的改变了回答"。
 *
 * 用法：
 *   cd minicare-agent && NODE_OPTIONS= node scripts/ask-agent.mjs "旺仔现在转奶到哪一步了？"
 *   node scripts/ask-agent.mjs --context "排敏排到哪了？"   # 先打印本轮注入的 systemPrompt 片段
 *   node scripts/ask-agent.mjs --baby=旺仔 "…"            # 指定宝宝（默认旺仔）
 *   node scripts/ask-agent.mjs --no-perception "…"        # 关掉现状注入，对照回答差异
 *   node scripts/ask-agent.mjs --multi "第一问" "第二问"    # 同会话多轮（验证上下文）
 *
 * 只读：不写业务库；仅当 --trace 时才旁路写 FlexDB trace（默认关）。
 */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
process.env.PERCEPTION_INJECT = process.argv.includes('--no-perception') ? 'off' : 'on'

const { loadConfig } = await import('../src/config.js')
const { initDb, closeDb, getDb } = await import('../src/lib/db.js')
const { getBabyProfile } = await import('../src/lib/profile.js')
const { getPerception, renderPerceptionBlock } = await import('../src/lib/perception.js')
const { runTurn } = await import('./eval/lib/agent-runner.mjs')

const args = process.argv.slice(2)
const showContext = args.includes('--context')
const trace = args.includes('--trace')
const multi = args.includes('--multi')
const babyName = (args.find((a) => a.startsWith('--baby=')) || '--baby=旺仔').slice('--baby='.length)
const questions = args.filter((a) => !a.startsWith('--'))
if (!questions.length) {
  console.error('用法：node scripts/ask-agent.mjs [--context] [--no-perception] [--baby=旺仔] "你的问题"')
  process.exit(1)
}

const config = loadConfig()
initDb(config)
const db = getDb()
if (!db) {
  console.error('DB 未配置（检查 .env.local 的 DB_* ）')
  process.exit(1)
}
if (!config.deepSeekKey) {
  console.error('缺少 DEEPSEEK_API_KEY（.env.local）')
  process.exit(1)
}

const [[baby]] = await db.query(
  'SELECT id, name, family_id FROM baby_profile WHERE name LIKE ? AND deleted_at IS NULL LIMIT 1',
  [`%${babyName}%`],
)
if (!baby) {
  console.error('未找到宝宝：' + babyName)
  process.exit(1)
}
const ctx = { userId: 'ask-agent', familyId: baby.family_id, babyId: baby.id }

console.log(`宝宝：${baby.name}（${baby.id}）`)
console.log(`现状注入：${process.env.PERCEPTION_INJECT === 'off' ? '关闭（--no-perception）' : '开启'}`)

if (showContext) {
  const { renderProfileBlock } = await import('../src/lib/profile.js')
  const p = await getBabyProfile(baby.id)
  const q = await getPerception(baby.id, { profile: p })
  console.log('\n' + '─'.repeat(74))
  console.log('本轮注入 systemPrompt 的两段（原样）')
  console.log('─'.repeat(74))
  console.log(renderProfileBlock(p) || '（无画像）')
  console.log('')
  console.log(renderPerceptionBlock(q) || '（无现状：--no-perception 或构建失败）')
  console.log('─'.repeat(74))
}

const history = []
const list = multi ? questions : [questions.join(' ')]
for (const [i, msg] of list.entries()) {
  console.log('\n' + '='.repeat(74))
  console.log(`第 ${i + 1} 轮  家长：${msg}`)
  console.log('='.repeat(74))
  const t0 = Date.now()
  const res = await runTurn({ config, message: msg, history, ctx, trace })
  if (res.toolCalls.length) {
    console.log('\n[工具] ' + res.toolCalls.map((t) => `${t.name}(${JSON.stringify(t.input).slice(0, 90)})`).join('  →  '))
  }
  console.log(`\n助手：\n${res.answer}`)
  console.log(`\n[耗时 ${res.ms}ms｜事件 ${res.eventCount}${res.error ? '｜错误 ' + res.error : ''}${res.forceFinished ? '｜被看门狗强制收尾' : ''}]`)
  history.push({ role: 'user', content: msg }, { role: 'assistant', content: res.answer })
}

await closeDb()
process.exit(0)
