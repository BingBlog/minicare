#!/usr/bin/env node
/**
 * deepeval 本地报告渲染（report-html.mjs）
 *
 * deepeval 本身无常驻服务（`deepeval view` 是上传 Confident AI 云端），
 * 本地看结果就用这个脚本：读 .deepeval/.latest_run_full.json → 生成 HTML 报告。
 *
 * 用法：
 *   node scripts/eval/report-html.mjs [--json=path] [--out=path]
 *   默认读 .deepeval/.latest_run_full.json，输出 evals/report.html
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AGENT_ROOT = path.resolve(__dirname, '../..')

const args = process.argv.slice(2)
const opt = { json: null, out: null }
for (const a of args) {
  if (a.startsWith('--json=')) opt.json = a.slice(7)
  else if (a.startsWith('--out=')) opt.out = a.slice(6)
}
const jsonPath = opt.json || path.join(AGENT_ROOT, '.deepeval', '.latest_run_full.json')
const outPath = opt.out || path.join(AGENT_ROOT, 'evals', 'report.html')

if (!fs.existsSync(jsonPath)) {
  console.error(`❌ 找不到报告文件：${jsonPath}\n   先运行：deepeval test run evals/test_agent_eval.py`)
  process.exit(1)
}

const run = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const cases = run.testCases || []
const total = run.testPassed + run.testFailed
const passRate = total ? Math.round((run.testPassed / total) * 100) : 0
const ts = new Date().toLocaleString('zh-CN', { hour12: false })

// 提取 judge 模型：所有指标里的 evaluationModel 去重
const judgeModels = [...new Set(
  cases.flatMap((c) => (c.metricsData || []).map((m) => m.evaluationModel).filter(Boolean)),
)]
const judgedCount = cases.reduce((n, c) => n + (c.metricsData || []).filter((m) => m.evaluationModel).length, 0)

const PASS = '#22c55e'
const FAIL = '#ef4444'
const BORDER = '#2a2f3a'
const BG = '#16181d'
const CARD = '#1e2128'

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function scoreChip(m) {
  const color = m.success ? PASS : FAIL
  return `<span style="display:inline-flex;align-items:center;gap:6px;background:${CARD};border:1px solid ${BORDER};border-radius:8px;padding:4px 10px;font-size:13px;">
    <span style="color:${color};font-weight:700;">${m.score?.toFixed(2) ?? 'N/A'}</span>
    <span style="color:#9aa4b2;">/ threshold ${m.threshold ?? 'N/A'}</span>
    <span style="color:${color};font-weight:600;">${m.success ? 'PASS' : 'FAIL'}</span>
  </span>`
}

// metric name → 测评维度 映射（对应 evals/README.md 的 D2-D5）
const DIMENSION_MAP = [
  { match: 'Tool Correctness', dim: 'D2', label: '工具调用正确性' },
  { match: 'Faithfulness', dim: 'D3a', label: '忠实度 · 无幻觉' },
  { match: 'data_honesty', dim: 'D3b', label: '数据诚实 · 不编造' },
  { match: 'style_adherence', dim: 'D4', label: '角色风格遵守' },
  { match: 'medical_safety', dim: 'D5', label: '安全护栏 · 一票否决' },
]
function dimensionOf(metricName) {
  return DIMENSION_MAP.find((d) => String(metricName).includes(d.match)) || { dim: '', label: '' }
}

function metricBlock(m) {
  const d = dimensionOf(m.name)
  const dimTag = d.dim
    ? `<span style="display:inline-block;background:#0C447C;color:#B5D4F4;border:1px solid #185FA5;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:500;margin-right:8px;">${d.dim} ${d.label}</span>`
    : ''
  const judgeLine = m.evaluationModel
    ? `<span style="color:#8b94a3;font-size:12px;">judge: <span style="color:#c7cdd8;font-weight:500;">${esc(m.evaluationModel)}</span></span>`
    : `<span style="color:#8b94a3;font-size:12px;">判分: <span style="color:#c7cdd8;font-weight:500;">确定性比对 tools_called vs expected_tools</span></span>`
  return `<div style="background:${CARD};border:1px solid ${BORDER};border-radius:10px;padding:14px 16px;margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
      <div style="font-weight:700;color:#e6e9ef;">${dimTag}${esc(m.name)}</div>
      ${scoreChip(m)}
    </div>
    ${m.reason ? `<div style="color:#c7cdd8;font-size:13px;line-height:1.6;">${esc(m.reason)}</div>` : ''}
    <div style="margin-top:8px;">${judgeLine}</div>
    ${m.verboseLogs ? `<details style="margin-top:8px;"><summary style="color:#8b94a3;font-size:12px;cursor:pointer;">verbose logs</summary><pre style="background:#12141a;border:1px solid ${BORDER};border-radius:8px;padding:10px;font-size:11px;color:#9aa4b2;white-space:pre-wrap;margin:6px 0 0;">${esc(m.verboseLogs)}</pre></details>` : ''}
  </div>`
}

function caseCard(c, i) {
  const color = c.success ? PASS : FAIL
  const metrics = (c.metricsData || []).map(metricBlock).join('\n')
  return `<div style="background:${CARD};border:1px solid ${BORDER};border-left:4px solid ${color};border-radius:12px;padding:18px 20px;margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
      <div style="font-weight:700;font-size:15px;color:#e6e9ef;">#${i + 1} ${esc(c.name)}</div>
      <span style="color:${color};font-weight:700;font-size:13px;">${c.success ? '✓ PASS' : '✗ FAIL'}</span>
    </div>
    <div style="font-size:13px;color:#c7cdd8;line-height:1.7;">
      <div style="margin-bottom:8px;"><span style="color:#8b94a3;font-weight:600;">input　</span>${esc(c.input) || '<i style="color:#5a6270">(无)</i>'}</div>
      <div style="margin-bottom:12px;"><span style="color:#8b94a3;font-weight:600;">output　</span>${esc(c.actualOutput) || '<i style="color:#5a6270">(无)</i>'}</div>
      ${(c.retrievalContext || []).length ? `<details style="margin-bottom:12px;"><summary style="color:#8b94a3;font-size:12px;cursor:pointer;">retrieval context (${c.retrievalContext.length})</summary><pre style="background:#12141a;border:1px solid ${BORDER};border-radius:8px;padding:10px;font-size:12px;color:#9aa4b2;white-space:pre-wrap;margin:6px 0 0;">${esc(c.retrievalContext.join('\n\n'))}</pre></details>` : ''}
    </div>
    ${metrics}
  </div>`
}

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>agent-poc 测评报告 · deepeval</title>
</head>
<body style="margin:0;background:${BG};color:#e6e9ef;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
<div style="max-width:880px;margin:0 auto;padding:32px 20px 60px;">
  <div style="background:${CARD};border:1px solid ${BORDER};border-radius:16px;padding:24px 28px;margin-bottom:24px;">
    <div style="font-size:20px;font-weight:800;letter-spacing:0.5px;">敏宝助手 · agent 测评报告</div>
    <div style="color:#8b94a3;font-size:13px;margin-top:6px;">${esc(run.testFile || '')} · 生成于 ${ts}</div>
    ${judgeModels.length ? `<div style="color:#8b94a3;font-size:12px;margin-top:6px;">judge 模型: <span style="color:#c7cdd8;font-weight:500;">${esc(judgeModels.join(' / '))}</span>（${judgedCount} 个指标由 LLM judge 判分，其余为确定性比对）</div>` : ''}
    <div style="display:flex;gap:24px;margin-top:18px;flex-wrap:wrap;">
      <div><div style="font-size:28px;font-weight:800;color:${passRate === 100 ? PASS : '#fbbf24'};">${passRate}%</div><div style="color:#8b94a3;font-size:12px;">通过率</div></div>
      <div><div style="font-size:28px;font-weight:800;color:${PASS};">${run.testPassed ?? 0}</div><div style="color:#8b94a3;font-size:12px;">通过</div></div>
      <div><div style="font-size:28px;font-weight:800;color:${FAIL};">${run.testFailed ?? 0}</div><div style="color:#8b94a3;font-size:12px;">失败</div></div>
      <div><div style="font-size:28px;font-weight:800;">${run.runDuration?.toFixed(1) ?? '-'}s</div><div style="color:#8b94a3;font-size:12px;">耗时</div></div>
    </div>
  </div>
  ${cases.map(caseCard).join('\n') || '<div style="color:#8b94a3;">无测试用例数据</div>'}
</div>
</body>
</html>`

fs.writeFileSync(outPath, html, 'utf8')
console.log(`✅ 报告已生成：${outPath}（${(fs.statSync(outPath).size / 1024).toFixed(1)} KB，${total} 用例，通过率 ${passRate}%）`)
