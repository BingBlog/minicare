import { useMemo, useState } from 'react'
import { JudgeDetails } from './JudgeDetails'
import { RichText } from './RichText'
import { expectToLines, judgeSummary } from './expectView'
import { STAGE_LABEL, type EvalCaseDef, type EvalCaseResult } from '../../lib/agentEval'

/**
 * 用例钻取 · 证据链（TECH-022 B3）。
 *
 * 固定顺序、单页可归因：
 *   失败原因 → 问题（message + ctx）→ 期望 vs 实际 → 工具轨迹（含入参）→ 回答全文 → 判分明细 → trace。
 * 数据双源：结果行（eval_case_result）+ 运行快照用例定义（case_defs，运行当时的 message/expect）。
 */

async function copyText(t: string): Promise<boolean> {
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

export function CaseEvidence({ c, def }: { c: EvalCaseResult; def?: EvalCaseDef | null }) {
  const [answerOpen, setAnswerOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const reasons = useMemo(
    () => (!c.pass && c.detail ? c.detail.split('；').map((s) => s.trim()).filter(Boolean) : []),
    [c.pass, c.detail],
  )
  const expectLines = useMemo(() => expectToLines(def?.expect), [def])
  const jSummary = useMemo(() => judgeSummary(def?.judge), [def])

  const toolCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of c.tool_calls) m.set(t.name, (m.get(t.name) || 0) + 1)
    return [...m.entries()]
  }, [c.tool_calls])

  const ctxEntries = useMemo(() => Object.entries(def?.ctx || {}), [def])

  const doCopy = async () => {
    if (await copyText(c.answer || '')) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <div className="ev">
      {/* ① 失败原因 */}
      {!c.pass && (
        <div className="ev-fail">
          <span className="ev-fail-tag">未通过 · {STAGE_LABEL[c.stage || ''] || c.stage || '—'}</span>
          {reasons.length > 0 ? (
            <ul className="ev-fail-list">
              {reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          ) : (
            <span className="hint">{c.detail || '无失败详情'}</span>
          )}
        </div>
      )}

      {/* ② 问题（原文） */}
      <div className="ev-sec">
        <div className="ev-label">问题</div>
        {def?.message ? (
          <div className="ev-question">{def.message}</div>
        ) : (
          <div className="hint">
            {def === null
              ? '该轮未快照用例定义（早于物化时代的运行），问题原文不可见'
              : '—'}
          </div>
        )}
        {ctxEntries.length > 0 && (
          <div className="ev-ctx">
            {ctxEntries.map(([k, v]) => (
              <span key={k} className="tag" title={String(v)}>
                {k}: {String(v).slice(0, 18)}{String(v).length > 18 ? '…' : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ③ 期望 vs 实际 */}
      <div className="ev-sec">
        <div className="ev-label">期望 vs 实际</div>
        <div className="ev-vs">
          <div className="ev-vs-col">
            <div className="ev-vs-head">期望（断言）</div>
            {expectLines.length > 0 ? (
              <ul className="ev-list">
                {expectLines.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            ) : (
              <div className="hint">{def ? '无确定性断言' : '（未快照）'}</div>
            )}
            {jSummary && <div className="ev-judge-cfg">判分要点：{jSummary}</div>}
          </div>
          <div className="ev-vs-col">
            <div className="ev-vs-head">实际</div>
            <ul className="ev-list">
              {toolCounts.length > 0 ? (
                toolCounts.map(([name, n]) => <li key={name}>调用 {name}{n > 1 ? ` ×${n}` : ''}</li>)
              ) : (
                <li className="hint">未调用任何工具</li>
              )}
              {c.force_finished && <li className="bad-line">被看门狗强制收尾（forceFinished）</li>}
            </ul>
          </div>
        </div>
      </div>

      {/* ④ 工具轨迹 */}
      {c.tool_calls.length > 0 && (
        <div className="ev-sec">
          <div className="ev-label">工具轨迹（{c.tool_calls.length} 次调用）</div>
          <div className="ev-tools">
            {c.tool_calls.map((t, i) => (
              <div key={`${t.name}-${i}`} className="ev-tool">
                <div className="ev-tool-head">
                  <span className="mono">{t.name}</span>
                  {t.ms != null && <span className="hint">{t.ms}ms</span>}
                </div>
                {t.input != null && (
                  <pre className="ev-pre">{JSON.stringify(t.input, null, 1)}</pre>
                )}
                {t.output != null && String(t.output).trim() !== '' && (
                  <details className="ev-out">
                    <summary className="hint">返回结果（{String(t.output).length} 字）</summary>
                    <pre className="ev-pre">{String(t.output).slice(0, 1500)}{String(t.output).length > 1500 ? '\n…（已截断显示）' : ''}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ⑤ 回答全文 */}
      <div className="ev-sec">
        <div className="ev-label">
          回答全文（{c.answer.length} 字）
          <span className="ev-tools-inline">
            <button className="btn btn-mini" onClick={doCopy}>{copied ? '已复制 ✓' : '复制'}</button>
          </span>
        </div>
        {c.answer ? (
          <div className={`ev-answer${answerOpen ? ' open' : ''}`}>
            <RichText text={c.answer} />
            {c.answer.length > 260 && (
              <button className="btn btn-mini ev-more" onClick={() => setAnswerOpen((v) => !v)}>
                {answerOpen ? '收起' : '展开全文'}
              </button>
            )}
          </div>
        ) : (
          <div className="hint">（无回答）</div>
        )}
      </div>

      {/* ⑥ 判分明细 */}
      {c.judge && Object.keys(c.judge).length > 0 && (
        <div className="ev-sec">
          <div className="ev-label">判分明细</div>
          <JudgeDetails judge={c.judge} />
        </div>
      )}

      {/* ⑦ trace */}
      <div className="ev-trace hint">
        {c.trace_id ? (
          <>
            trace：<span className="mono">{c.trace_id.slice(0, 8)}…</span>{' '}
            <a href={`http://localhost:3100/trace/${c.trace_id}`} target="_blank" rel="noreferrer">
              在 Langfuse 打开 ↗
            </a>
          </>
        ) : (
          'trace：无'
        )}
      </div>
    </div>
  )
}
