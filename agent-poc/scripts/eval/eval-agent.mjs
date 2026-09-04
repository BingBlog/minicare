/**
 * Agent 评测主 harness（eval/eval-agent.mjs）
 *
 * 用法：
 *   node scripts/eval/eval-agent.mjs [--all] [--group=l1] [--id=L1-01] [--no-judge] [--json=report.json]
 *
 *   --all        跑全部用例（默认只跑 P0）
 *   --group      只跑指定组（l0/l1/l2/l3/l4/l5/l6）
 *   --id         只跑单个用例
 *   --no-judge   跳过 LLM-as-judge（只做确定性断言）
 *   --json=路径   导出完整报告 JSON
 *   --runs=N     每个用例重复次数（默认 1，用于消抖）
 *
 * 前置：.env.local 含 DEEPSEEK_API_KEY（及 DB/TOKENHUB 配置供工具真实执行）
 */
import { loadLocalEnv } from '../../src/lib/env.js'

loadLocalEnv()
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { initDb, closeDb } from '../../src/lib/db.js'
import { loadConfig } from '../../src/config.js'
import { runTurn } from './lib/agent-runner.mjs'
import { runExpect } from './lib/assert.mjs'
import {
  judgeFaithfulness,
  judgeCompleteness,
  judgeGuardrail,
  judgeStyle,
} from './lib/judge.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CASES_DIR = path.join(__dirname, 'cases')

// ---------- 参数解析 ----------
function parseArgs() {
  const args = process.argv.slice(2)
  const opt = { all: false, group: null, id: null, noJudge: false, noTrace: false, json: null, runs: 1 }
  for (const a of args) {
    if (a === '--all') opt.all = true
    else if (a === '--no-judge') opt.noJudge = true
    else if (a === '--no-trace') opt.noTrace = true
    else if (a.startsWith('--group=')) opt.group = a.slice(8)
    else if (a.startsWith('--id=')) opt.id = a.slice(5)
    else if (a.startsWith('--json=')) opt.json = a.slice(7)
    else if (a.startsWith('--runs=')) opt.runs = parseInt(a.slice(7), 10) || 1
  }
  return opt
}

// ---------- 用例加载 ----------
function loadCases() {
  const files = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith('.json'))
  const cases = []
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), 'utf8'))
    const list = Array.isArray(data) ? data : data.cases
    for (const c of list) cases.push({ file: f, ...c })
  }
  return cases
}

// ---------- 工具结果汇总（供 judge 溯源） ----------
function collectToolOutputs(result) {
  return result.toolCalls
    .map((c) => `[工具 ${c.name} input=${JSON.stringify(c.input)}]\n${c.output}`)
    .join('\n\n')
}

// ---------- 单用例执行 ----------
async function runCase(config, c, opt) {
  const runs = opt.runs || 1
    const outcomes = []
    for (let i = 0; i < runs; i++) {
      const result = await runTurn({
        config,
        message: c.message,
        history: c.history || [],
        ctx: c.ctx || {},
        images: c.images,
        trace: !opt.noTrace,
      })
    const { pass, reasons } = runExpect(result, c.expect || {})

    // 确定性断言不通过则不进入 judge（省钱且聚焦失败根因）
    let judge = { skipped: true }
    if (pass && !opt.noJudge && c.judge) {
      judge = await runJudge(result, c.judge)
    }
    outcomes.push({ result, deterministic: { pass, reasons }, judge })
  }
  return outcomes
}

async function runJudge(result, j) {
  const out = {}
  if (j.faithfulness) {
    out.faithfulness = await judgeFaithfulness({ answer: result.answer, toolOutputs: collectToolOutputs(result) })
  }
  if (j.completeness) {
    out.completeness = await judgeCompleteness({ answer: result.answer, goldenPoints: j.completeness.goldenPoints })
  }
  if (j.guardrail) {
    out.guardrail = await judgeGuardrail({ answer: result.answer })
  }
  if (j.style) {
    out.style = await judgeStyle({ answer: result.answer, needsDisclaimer: j.style.needsDisclaimer })
  }
  return out
}

// ---------- 判定汇总 ----------
function caseVerdict(outcomes, expectJudge) {
  // 确定性断言全部 pass 才算过（多次运行取最差）
  const detOk = outcomes.every((o) => o.deterministic.pass)
  if (!detOk) return { pass: false, stage: 'deterministic', detail: outcomes[0].deterministic.reasons.join('；') }
  // judge 只要配置了就要求 pass
  const judged = outcomes.filter((o) => !o.judge.skipped)
  const judgeFailures = []
  for (const o of judged) {
    for (const [k, v] of Object.entries(o.judge)) {
      if (v && v.pass === false) judgeFailures.push(`${k}: ${v.reason || 'fail'}`)
    }
  }
  if (judgeFailures.length > 0) return { pass: false, stage: 'judge', detail: judgeFailures.join('；') }
  return { pass: true, stage: 'ok', detail: '' }
}

// ---------- 报告 ----------
function renderReport(rows) {
  console.log('\n' + '='.repeat(76))
  console.log('Agent 评测报告')
  console.log('='.repeat(76))
  const header = ['用例', '优先级', '组', '结果', '耗时', '工具', '失败原因']
  const lines = rows.map((r) => {
    const tools = r.toolCalls.length ? r.toolCalls.map((t) => t.name).join('+') : '—'
    const ms = r.ms
    return [r.id, r.priority || '—', r.group, r.pass ? '✅' : '❌', `${ms}ms`, tools, r.pass ? '' : r.detail.slice(0, 60)].join(' | ')
  })
  console.log(header.join(' | '))
  console.log('-'.repeat(76))
  for (const l of lines) console.log(l)
  const total = rows.length
  const passed = rows.filter((r) => r.pass).length
  const p0 = rows.filter((r) => r.priority === 'P0')
  const p0Pass = p0.filter((r) => r.pass).length
  console.log('-'.repeat(76))
  console.log(`通过 ${passed}/${total}（P0: ${p0Pass}/${p0.length}）`)
  return { total, passed, p0: p0.length, p0Pass }
}

// ---------- 主流程 ----------
/** 供 gate.mjs 复用的套件执行 */
export async function runSuite(optOverride = {}) {
  const opt = { ...parseArgs(), ...optOverride }
  const config = loadConfig()
  const cases = loadCases()

  // 过滤
  let selected = cases
  if (opt.id) {
    // 支持逗号分隔多个用例：--id=R1-03,R1-06（风格类复测用）
    const ids = opt.id.split(',').map((s) => s.trim()).filter(Boolean)
    selected = selected.filter((c) => ids.includes(c.id))
  }
  else if (opt.group) selected = selected.filter((c) => (c.group || c.file.replace('.json', '')).startsWith(opt.group))
  else if (!opt.all) selected = selected.filter((c) => c.priority !== 'P2')

  if (selected.length === 0) {
    throw new Error('没有匹配的用例。检查 --group/--id 参数。')
  }

  console.log(`加载用例: ${cases.length}，选中: ${selected.length}（group=${opt.group || '默认P0'}）`)
  console.log(`DB: ${config.db ? '已配置' : '未配置(检索降级)'} | embedding: ${config.tokenHubKey ? '已配置' : '未配置(仅FULLTEXT)'} | trace: ${opt.noTrace ? '关闭' : `开启(写入 FlexDB agent_traces)`} | judge: ${opt.noJudge ? '跳过' : 'deepseek-v4-pro'}\n`)

  if (config.db) initDb(config)

  const rows = []
  for (const c of selected) {
    process.stdout.write(`运行 ${c.id} ${c.desc}… `)
    try {
      const outcomes = await runCase(config, c, opt)
      const verdict = caseVerdict(outcomes, c.judge)
      const last = outcomes[outcomes.length - 1]
      rows.push({
        id: c.id,
        group: c.group || c.file.replace('.json', ''),
        desc: c.desc,
        priority: c.priority || 'P0',
        pass: verdict.pass,
        detail: verdict.detail,
        stage: verdict.stage,
        ms: last.result.ms,
        toolCalls: last.result.toolCalls,
        answer: last.result.answer,
        traceId: last.result.traceId,
        forceFinished: last.result.forceFinished,
        error: last.result.error,
        judge: last.judge.skipped ? null : last.judge,
      })
      console.log(verdict.pass ? '✅' : '❌ ' + verdict.detail.slice(0, 80))
    } catch (e) {
      rows.push({
        id: c.id,
        group: c.group || c.file.replace('.json', ''),
        desc: c.desc,
        priority: c.priority || 'P0',
        pass: false,
        detail: '运行异常: ' + (e?.message || String(e)).slice(0, 100),
        stage: 'error',
        ms: 0,
        toolCalls: [],
        answer: '',
        forceFinished: false,
        error: String(e),
      })
      console.log('❌ 异常')
    }
  }

  if (config.db) await closeDb()

  const summary = renderReport(rows)
  console.log('\n' + '='.repeat(76))

  if (opt.json) {
    fs.writeFileSync(opt.json, JSON.stringify({ summary, cases: rows }, null, 2))
    console.log(`报告已导出: ${opt.json}`)
  }

  return { summary, rows }
}

// CLI 直接执行
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opt = parseArgs()
  const { summary } = await runSuite(opt)
  process.exit(summary.p0Pass === summary.p0 && summary.p0 > 0 ? 0 : 1)
}
