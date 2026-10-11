/**
 * 报告 2.0 区块（TECH-026 §7 / PRD-012 US-10~13）：评测概览与性能效率成本。
 *
 * 全部消费 `EvalReport`（服务端实时聚合，含旧轮实时推导）；旧轮无 report 时上层不渲染本组件。
 * - `OverviewSection`：五指标（原始/去污染/功能有效/环境阻断 + 总量）+ 归因分布（可点击筛选用例表）
 * - `CostPanel`：耗时五分位 + Token 四分类 + 高资源消耗 Top +「复制本次数据」
 */
import { useState } from 'react'
import { Table } from '../ui'
import {
  ATTRIBUTION_HINT, ATTRIBUTION_LABEL, ATTRIBUTION_ORDER,
  fmtDuration, fmtMetric, fmtTime, fmtTokens,
  type AttributionClass, type EvalReport, type EvalRunMeta,
} from '../../lib/agentEval'

/** 复制文本到剪贴板（clipboard API + execCommand 兜底；与 CaseEvidence 同款模式） */
export async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = t
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

/* ── ② 评测概览：五指标 + 归因分布（US-10 / US-11）────────────────── */

export function OverviewSection({
  report,
  rateDelta,
  attrFilter,
  onFilterAttribution,
}: {
  report: EvalReport
  /** 与上轮同 scope 的通过率差（小数，如 0.022 = +2.2pt；来自既有 delta） */
  rateDelta?: number | null
  attrFilter: AttributionClass | ''
  onFilterAttribution: (a: AttributionClass | '') => void
}) {
  const m = report.metrics
  const att = report.attribution
  const maxCount = Math.max(1, ...ATTRIBUTION_ORDER.map((k) => att.counts[k] || 0))
  const foot = ['自动分类']
  if (att.reviewed > 0) foot.push(`含人工复核 ${att.reviewed} 条${att.overridden > 0 ? `（推翻 ${att.overridden} 条）` : ''}`)
  if (att.derived > 0) foot.push(`旧轮实时推导 ${att.derived} 条`)

  return (
    <div className="report-overview">
      <div className="section-label">评测概览</div>
      <div className="kpis">
        <div className="kpi">
          <div className="k">评测样本总量</div>
          <div className="v">{m.total}</div>
          <div className="u">本次执行的样本数</div>
        </div>
        <div className="kpi">
          <div className="k">原始通过率</div>
          <div className="v">
            {fmtMetric(m.raw)}
            {rateDelta != null && (
              <span className={`delta-badge ${rateDelta >= 0 ? 'up' : 'down'}`}>
                {rateDelta >= 0 ? '+' : ''}{(rateDelta * 100).toFixed(1)}pt
              </span>
            )}
          </div>
          <div className="u">未剔除环境干扰</div>
        </div>
        <div className="kpi">
          <div className="k">去污染通过率</div>
          <div className="v">{fmtMetric(m.decontaminated)}</div>
          <div className="u">剔除干扰后全维度通过 · 真实可靠性</div>
        </div>
        <div className="kpi">
          <div className="k">功能有效通过率</div>
          <div className="v">{fmtMetric(m.functional)}</div>
          <div className="u">剔除干扰后核心判定完成率</div>
        </div>
        <div className="kpi">
          <div className="k">环境阻断率</div>
          <div className="v">{fmtMetric(m.env_blocked)}</div>
          <div className="u">环境+数据问题占比 · 噪声度量</div>
        </div>
      </div>

      <div className="section-label" style={{ marginTop: 12 }}>归因分布（占总样本 {att.den}）</div>
      {att.total_failed === 0 ? (
        <div className="hint">无失败样本</div>
      ) : (
        <div className="attr-bars">
          {ATTRIBUTION_ORDER.map((k) => {
            const n = att.counts[k] || 0
            if (n === 0) return null
            const active = attrFilter === k
            return (
              <div
                key={k}
                className={`attr-row${active ? ' active' : ''}`}
                title={`${ATTRIBUTION_LABEL[k]}：${ATTRIBUTION_HINT[k]}（点击筛选用例表）`}
                onClick={() => onFilterAttribution(active ? '' : k)}
              >
                <span className="attr-name">{ATTRIBUTION_LABEL[k]}</span>
                <div className="attr-track">
                  <div className={`attr-bar ${k}`} style={{ width: `${(n / maxCount) * 100}%` }} />
                </div>
                <span className="attr-num">{n} · {att.den ? ((n / att.den) * 100).toFixed(1) : '0.0'}%</span>
              </div>
            )
          })}
        </div>
      )}
      <div className="attr-foot">
        {foot.join(' · ')}
        {attrFilter ? ' · 已按归因筛选用例表（再次点击分类取消）' : ''}
      </div>
    </div>
  )
}

/* ── ③ 性能效率与成本（US-12 / US-13）────────────────────────────── */

export function CostPanel({
  run,
  report,
  onJumpCase,
}: {
  run: EvalRunMeta
  report: EvalReport
  onJumpCase?: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const d = report.cost.durations
  const t = report.cost.tokens

  const doCopy = async () => {
    if (await copyText(buildCopyText(run, report))) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <div>
      <div className="cost-head">
        <span className="section-label" style={{ margin: 0 }}>性能效率与成本</span>
        <button className="btn btn-mini" onClick={doCopy}>{copied ? '已复制 ✓' : '复制本次数据'}</button>
      </div>

      <div className="kpis" style={{ marginTop: 8 }}>
        <div className="kpi"><div className="k">平均耗时</div><div className="v">{fmtDuration(d.avg)}</div></div>
        <div className="kpi"><div className="k">P50 耗时</div><div className="v">{fmtDuration(d.p50)}</div></div>
        <div className="kpi"><div className="k">P90 耗时</div><div className="v">{fmtDuration(d.p90)}</div></div>
        <div className="kpi"><div className="k">P95 耗时</div><div className="v">{fmtDuration(d.p95)}</div></div>
        <div className="kpi"><div className="k">Max 耗时</div><div className="v">{fmtDuration(d.max)}</div></div>
      </div>
      <div className="hint" style={{ margin: '4px 0 10px' }}>
        耗时统计样本 {d.n} 条{d.n === 0 ? '（无数据）' : ''}
      </div>

      {t.n === 0 ? (
        <div className="hint">Token 明细：—（该轮未采集 Token 明细，旧版本运行或执行失败）</div>
      ) : (
        <div className="kpis">
          <div className="kpi">
            <div className="k">Prompt Tokens</div>
            <div className="v">{fmtTokens(t.input)}</div>
            <div className="u">输入（不含缓存命中）</div>
          </div>
          <div className="kpi">
            <div className="k">Completion Tokens</div>
            <div className="v">{fmtTokens(t.output)}</div>
            <div className="u">模型生成输出</div>
          </div>
          <div className="kpi">
            <div className="k">Cached Tokens</div>
            <div className="v">{fmtTokens((t.cacheRead ?? 0) + (t.cacheCreation ?? 0))}</div>
            <div className="u" title={`命中缓存 ${t.cacheRead ?? 0} · 缓存创建 ${t.cacheCreation ?? 0}`}>命中缓存 · 不重复计费</div>
          </div>
          <div className="kpi">
            <div className="k">Total Tokens</div>
            <div className="v">{fmtTokens(t.total)}</div>
            <div className="u">四类总和 · {t.n}/{report.meta.total} 条有数据</div>
          </div>
        </div>
      )}

      {report.cost.top.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 12 }}>
            高资源消耗 Top {report.cost.top.length}{t.n === 0 ? '（按耗时）' : '（按 Total Tokens）'}
          </div>
          <Table cols={[110, 0, 90, 100]}>
            <thead>
              <tr>
                <th>用例</th>
                <th>描述</th>
                <th className="num">耗时</th>
                <th className="num">Token 消耗</th>
              </tr>
            </thead>
            <tbody>
              {report.cost.top.map((r) => (
                <tr
                  key={r.case_id}
                  style={onJumpCase ? { cursor: 'pointer' } : undefined}
                  onClick={onJumpCase ? () => onJumpCase(r.case_id) : undefined}
                >
                  <td className="mono">{r.case_id}</td>
                  <td className="hint">{(r.desc || '').slice(0, 48) || '—'}</td>
                  <td className="num">{fmtDuration(r.ms)}</td>
                  <td className="num">{fmtTokens(r.tokens)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  )
}

/* ── 复制数据（US-13：跨轮对比用文本，带上下文头）───────────────────── */

function buildCopyText(run: EvalRunMeta, report: EvalReport): string {
  const m = report.metrics
  const d = report.cost.durations
  const t = report.cost.tokens
  const lines = [
    `## 运行 ${run.run_id} · ${run.scope_label} · ${fmtTime(run.created_at)}`,
    `- 样本总量 ${m.total} ｜ 原始通过率 ${fmtMetric(m.raw)} ｜ 去污染通过率 ${fmtMetric(m.decontaminated)} ｜ 功能有效通过率 ${fmtMetric(m.functional)} ｜ 环境阻断率 ${fmtMetric(m.env_blocked)}`,
    `- 耗时：平均 ${fmtDuration(d.avg)} ｜ P50 ${fmtDuration(d.p50)} ｜ P90 ${fmtDuration(d.p90)} ｜ P95 ${fmtDuration(d.p95)} ｜ Max ${fmtDuration(d.max)}`,
    `- Token：Prompt ${fmtTokens(t.input)} ｜ Completion ${fmtTokens(t.output)} ｜ Cached ${fmtTokens((t.cacheRead ?? 0) + (t.cacheCreation ?? 0))} ｜ Total ${fmtTokens(t.total)}`,
  ]
  if (report.cost.top.length > 0) {
    lines.push('- 高资源消耗 Top：')
    lines.push('  | 用例 | 耗时 | Tokens |')
    lines.push('  | --- | --- | --- |')
    for (const r of report.cost.top.slice(0, 10)) {
      lines.push(`  | ${r.case_id} | ${fmtDuration(r.ms)} | ${fmtTokens(r.tokens)} |`)
    }
  }
  return lines.join('\n')
}
