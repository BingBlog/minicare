/**
 * 运行报告导出（TECH-022 B4）：Markdown / JSON / HTML 三种格式，纯前端生成下载。
 *
 * 与页面同一份数据（run detail + 该轮 delta），不额外请求后端；
 * HTML 为单文件内联样式（可直接存档 / 分享，风格对齐平台中性工具色）。
 */
import {
  deriveVerdict, gateState, fmtDuration, fmtTime, JUDGE_KEY_LABEL, RUN_STATUS_LABEL, verdictShort,
  type EvalDelta, type EvalJudgeDetail, type EvalRunDetail,
} from './agentEval'

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export type ExportFormat = 'md' | 'json' | 'html'

export function exportRun(run: EvalRunDetail, delta: EvalDelta | null, format: ExportFormat) {
  const base = `eval-run-${run.run_id}`
  if (format === 'json') {
    download(`${base}.json`, JSON.stringify({ ...run, delta }, null, 2), 'application/json')
    return
  }
  if (format === 'md') {
    download(`${base}.md`, buildMd(run, delta), 'text/markdown;charset=utf-8')
    return
  }
  download(`${base}.html`, buildHtml(run, delta), 'text/html;charset=utf-8')
}

/* ── 共用片段 ─────────────────────────────────────────────────────── */

function gateRows(run: EvalRunDetail): [string, string, string, string][] {
  const gate = run.summary?.gate || {}
  return Object.values(gate).map((g) => {
    const st = gateState(g)
    const mark = st === 'pass' ? '✓ 达标' : st === 'fail' ? '✗ 未达标' : '⊘ 未测'
    return [g.label, st === 'na' ? '未测' : g.text, g.target, mark]
  })
}

function caseTableRows(run: EvalRunDetail): [string, string, string, string, string][] {
  return run.cases.map((c) => [
    c.case_id,
    c.priority || '—',
    c.pass ? '✓' : '✗',
    fmtDuration(c.ms),
    c.pass ? '' : `${c.stage || ''}｜${(c.detail || '').slice(0, 80)}`,
  ])
}

function judgeLines(judge: Record<string, EvalJudgeDetail> | null): string[] {
  if (!judge) return []
  const out: string[] = []
  for (const [k, v] of Object.entries(judge)) {
    const label = JUDGE_KEY_LABEL[k] || k
    const mark = v.pass === false ? '✗' : v.pass === true ? '✓' : '—'
    let extra = ''
    if (k === 'completeness' && v.covered != null && v.total != null) {
      extra = `覆盖 ${v.covered}/${v.total}${v.missed?.length ? `，缺失：${v.missed.join('；')}` : ''}`
    } else if (k === 'faithfulness' && v.hardHallucination != null) {
      extra = v.hardHallucination ? '硬幻觉' : '无硬幻觉'
    } else if (k === 'guardrail') {
      extra = `就医引导 ${v.seekCare ? '✓' : '✗'}；危险建议 ${v.dangerousAdvice ? '有' : '无'}`
    } else if (k === 'style' && Array.isArray(v.reasons)) {
      extra = v.reasons.join('；')
    }
    const reason = v.reason ? String(v.reason) : ''
    out.push(`  - ${label} ${mark}${extra ? `（${extra}）` : ''}${reason ? `：${reason}` : ''}`)
  }
  return out
}

/* ── Markdown ────────────────────────────────────────────────────── */

function buildMd(run: EvalRunDetail, delta: EvalDelta | null): string {
  const v = deriveVerdict(run)
  const L: string[] = []
  L.push(`# Agent 测评报告 · ${run.run_id}`)
  L.push('')
  L.push(`- 结论：**${v.title}**${v.reasons.length ? ` —— ${v.reasons.join('；')}` : ''}${v.naLabels.length ? `（未测：${v.naLabels.join('、')}）` : ''}`)
  L.push(`- 状态：${RUN_STATUS_LABEL[run.status] || run.status} ｜ 范围：${run.scope_label}${run.task_id ? `（${run.task_id}）` : ''} ｜ judge：${run.judge ? '开' : '关'} ｜ 轮次：${run.runs_n}`)
  L.push(`- 时间：${fmtTime(run.started_at || run.created_at)} ｜ 耗时：${fmtDuration(run.duration_ms)} ｜ 通过：${run.summary ? `${run.summary.passed}/${run.summary.total}` : '—'}`)
  L.push(`- 环境：被测 ${run.env_snapshot.agent_model || '—'} · judge ${run.env_snapshot.judge_model || '未启用'} · db ${run.env_snapshot.db || '—'} · agent ${run.env_snapshot.git || '—'}`)
  const cs = run.env_snapshot.cases
  const setText = cs?.count ? `${cs.count} 条 · ${String(cs.hash || '').slice(0, 8)}` : (run.env_snapshot.cases_hash || '—')
  L.push(`- 用例集：${setText}`)
  L.push('')
  if (delta) {
    L.push(`## 较上轮（${delta.prev_run_id} · ${fmtTime(delta.prev_created_at)}）`)
    L.push('')
    L.push(`- 通过率变化：${(delta.rate_delta * 100).toFixed(1)}pt（${(delta.rate_prev * 100).toFixed(0)}% → ${(delta.rate_cur * 100).toFixed(0)}%）`)
    if (delta.fixed.length) L.push(`- 已修复：${delta.fixed.join('、')}`)
    if (delta.new_fail.length) L.push(`- 新增失败：${delta.new_fail.join('、')}`)
    if (delta.still_fail.length) L.push(`- 仍失败：${delta.still_fail.join('、')}`)
    L.push('')
  }
  L.push('## 闸门指标')
  L.push('')
  L.push('| 维度 | 实际 | 目标 | 结论 |')
  L.push('|---|---|---|---|')
  for (const r of gateRows(run)) L.push(`| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`)
  L.push('')
  L.push('## 用例结果')
  L.push('')
  L.push('| 用例 | 优先级 | 结果 | 耗时 | 失败原因 |')
  L.push('|---|---|---|---|---|')
  for (const r of caseTableRows(run)) {
    L.push(`| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4].replace(/\|/g, '/')} |`)
  }
  L.push('')
  const failed = run.cases.filter((c) => !c.pass)
  if (failed.length) {
    L.push('## 失败用例详情')
    for (const c of failed) {
      L.push('')
      L.push(`### ${c.case_id}（${c.priority || '—'}）`)
      L.push('')
      const def = run.case_defs?.[c.case_id]
      if (def?.message) L.push(`- 问题：${def.message}`)
      L.push(`- 失败阶段：${c.stage || '—'}`)
      if (c.detail) L.push(`- 失败原因：${c.detail}`)
      if (c.tool_calls.length) L.push(`- 工具轨迹：${c.tool_calls.map((t) => t.name).join(' → ')}`)
      const jl = judgeLines(c.judge)
      if (jl.length) {
        L.push('- judge：')
        L.push(...jl)
      }
      if (c.answer) {
        L.push('')
        L.push('<details><summary>回答全文</summary>')
        L.push('')
        L.push('```text')
        L.push(c.answer)
        L.push('```')
        L.push('</details>')
      }
    }
  }
  L.push('')
  L.push(`> 由「敏宝管理平台 · Agent 测评」导出于 ${new Date().toISOString()}｜run ${run.run_id}`)
  return L.join('\n')
}

/* ── Standalone HTML ─────────────────────────────────────────────── */

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildHtml(run: EvalRunDetail, delta: EvalDelta | null): string {
  const v = deriveVerdict(run)
  const tone = v.kind === 'pass' ? '#3f6e15' : v.kind === 'fail' || v.kind === 'failed' ? '#a82e2e' : '#8a540b'
  const toneBg = v.kind === 'pass' ? '#edf5e1' : v.kind === 'fail' || v.kind === 'failed' ? '#fbeaea' : '#fbf0da'
  const gate = gateRows(run)
  const cs = run.env_snapshot.cases
  const setText = cs?.count ? `${cs.count} 条 · ${String(cs.hash || '').slice(0, 8)}` : (run.env_snapshot.cases_hash || '—')

  const gateCards = gate.map(([label, val, target, mark]) => {
    const bad = mark.startsWith('✗')
    const na = mark.startsWith('⊘')
    return `<div class="card"><div class="k">${esc(label)}</div><div class="v" style="color:${na ? '#98928c' : bad ? '#a82e2e' : '#3f6e15'}">${esc(mark)}</div><div class="u">${esc(val)} · 目标 ${esc(target)}</div></div>`
  }).join('')

  const rows = run.cases.map((c) => {
    const def = run.case_defs?.[c.case_id]
    const judge = judgeLines(c.judge).map((l) => `<div class="jl">${esc(l.trim())}</div>`).join('')
    return `<tr>
      <td class="mono">${esc(c.case_id)}</td><td>${esc(c.priority || '—')}</td>
      <td style="color:${c.pass ? '#3f6e15' : '#a82e2e'};font-weight:600">${c.pass ? '✓' : '✗'}</td>
      <td class="num">${fmtDuration(c.ms)}</td>
      <td>${c.pass ? '' : `<div class="fail">${esc(c.stage || '')}｜${esc(c.detail || '')}</div>`}
        ${def?.message ? `<div class="q">问：${esc(def.message)}</div>` : ''}
        ${judge}
        ${c.answer ? `<details><summary>回答全文（${c.answer.length} 字）</summary><pre>${esc(c.answer)}</pre></details>` : ''}
      </td></tr>`
  }).join('')

  const deltaHtml = delta ? `<div class="delta">较上轮（${esc(delta.prev_run_id)} · ${fmtTime(delta.prev_created_at)}）：通过率
    ${(delta.rate_prev * 100).toFixed(0)}% → ${(delta.rate_cur * 100).toFixed(0)}%（${delta.rate_delta >= 0 ? '+' : ''}${(delta.rate_delta * 100).toFixed(1)}pt）
    ${delta.fixed.length ? `｜ 已修复 ${delta.fixed.map(esc).join('、')}` : ''}
    ${delta.new_fail.length ? `｜ 新增失败 ${delta.new_fail.map(esc).join('、')}` : ''}
    ${delta.still_fail.length ? `｜ 仍失败 ${delta.still_fail.map(esc).join('、')}` : ''}</div>` : ''

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>Agent 测评报告 · ${esc(run.run_id)}</title>
<style>
body{margin:0;background:#f4f3f0;color:#2f2c2a;font:13px/1.65 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif}
.wrap{max-width:1080px;margin:24px auto;padding:0 16px}
h1{font-size:20px;margin:0 0 4px}
.sub{color:#6b6560;margin-bottom:16px}
.verdict{padding:12px 14px;border-radius:10px;background:${toneBg};border:1px solid ${tone};color:${tone};font-weight:600;margin-bottom:14px}
.meta{background:#fff;border:1px solid #e5e3dd;border-radius:10px;padding:10px 14px;margin-bottom:14px;color:#6b6560;font-size:12.5px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:14px}
.card{background:#fff;border:1px solid #e5e3dd;border-radius:10px;padding:8px 10px}
.card .k{font-size:12px;color:#98928c}.card .v{font-size:15px;font-weight:700;margin:2px 0}.card .u{font-size:11.5px;color:#98928c}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e3dd;border-radius:10px;overflow:hidden;font-size:12.5px}
th,td{padding:7px 10px;border-bottom:1px solid #efede8;text-align:left;vertical-align:top}
th{background:#faf9f7;color:#6b6560;font-weight:600}
.mono{font-family:ui-monospace,Menlo,monospace}.num{text-align:right}
.fail{color:#a82e2e;margin-bottom:3px}.q{color:#6b6560}.jl{color:#6b6560}
pre{white-space:pre-wrap;background:#faf9f7;border:1px solid #efede8;border-radius:8px;padding:8px;font-size:12px}
.delta{background:#eaf2fa;border:1px solid #b7d2ea;border-radius:10px;padding:8px 12px;margin-bottom:14px;color:#2f6fb0;font-size:12.5px}
footer{color:#98928c;font-size:12px;margin:18px 0}
</style></head><body><div class="wrap">
<h1>Agent 测评报告 · ${esc(run.run_id)}</h1>
<div class="sub">${RUN_STATUS_LABEL[run.status] || run.status} ｜ ${esc(run.scope_label)}${run.task_id ? `（${esc(run.task_id)}）` : ''} ｜ judge ${run.judge ? '开' : '关'} ｜ ${fmtTime(run.started_at || run.created_at)} ｜ 耗时 ${fmtDuration(run.duration_ms)} ｜ 通过 ${run.summary ? `${run.summary.passed}/${run.summary.total}` : '—'}</div>
<div class="verdict">${esc(v.title)}${v.reasons.length ? ` —— ${v.reasons.map(esc).join('；')}` : ''}${v.naLabels.length ? `（未测：${v.naLabels.map(esc).join('、')}）` : ''}</div>
<div class="meta">被测模型 ${esc(run.env_snapshot.agent_model || '—')} · judge 模型 ${esc(run.env_snapshot.judge_model || '未启用')} · 数据库 ${esc(run.env_snapshot.db || '—')} · agent ${esc(run.env_snapshot.git || '—')} · 用例集 ${esc(setText)}</div>
${deltaHtml}
<div class="kpis">${gateCards}</div>
<table><thead><tr><th>用例</th><th>优先级</th><th>结果</th><th>耗时</th><th>详情</th></tr></thead><tbody>${rows}</tbody></table>
<footer>由「敏宝管理平台 · Agent 测评」导出于 ${new Date().toISOString()} ｜ ${verdictShort(v)}</footer>
</div></body></html>`
}
