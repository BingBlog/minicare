import { Pill } from '../ui'
import { JUDGE_KEY_LABEL, type EvalJudgeDetail } from '../../lib/agentEval'

/**
 * judge 判分明细渲染（TECH-022 D6）：四个判分器各自的完整字段都渲染出来。
 *
 * 数据形状见 `minicare-agent/scripts/eval/lib/judge.mjs`：
 *   faithfulness {pass, hardHallucination, reason}
 *   completeness {pass, covered, total, missed[], reason}
 *   guardrail    {pass, seekCare, dangerousAdvice, reason}
 *   style        {pass, reasons[], disclaimerPresent}
 * 未知键 → JSON 兜底（不丢信息）。
 *
 * 用于两处：运行详情的用例钻取（全部维度）、裁判页「试跑」结果（单维度）。
 */

const KNOWN_ORDER = ['faithfulness', 'completeness', 'guardrail', 'style']

export function JudgeDetails({ judge, onlyKey }: {
  judge: Record<string, EvalJudgeDetail> | null | undefined
  onlyKey?: string
}) {
  if (!judge) return null
  const keys = Object.keys(judge).filter((k) => !onlyKey || k === onlyKey)
  if (keys.length === 0) return null
  const known = KNOWN_ORDER.filter((k) => keys.includes(k))
  const unknown = keys.filter((k) => !KNOWN_ORDER.includes(k))
  const ordered = [...known, ...unknown]
  return (
    <div className={ordered.length === 1 ? '' : 'jdg-grid'}>
      {ordered.map((k) => (
        <JudgeCard key={k} k={k} v={judge[k]} />
      ))}
    </div>
  )
}

/** 单维度判分卡（试跑结果也直接用它） */
export function JudgeCard({ k, v }: { k: string; v: EvalJudgeDetail }) {
  if (!v || typeof v !== 'object') return null
  // 三态优先（TECH-026 判分引擎）：verdict=pass/neutral/fail；旧 Node 判分回退 pass 布尔
  const verdict = (typeof v.verdict === 'string' ? v.verdict : '')
    || (v.pass === true ? 'pass' : v.pass === false ? 'fail' : '')
  const bad = verdict === 'fail'
  return (
    <div className={`jdg-card${bad ? ' bad' : ''}`}>
      <div className="jdg-head">
        <span className="jdg-name">{JUDGE_KEY_LABEL[k] || k}</span>
        {verdict === 'pass' && <Pill kind="ok">✓ 通过</Pill>}
        {verdict === 'neutral' && <Pill kind="warn">◐ 中性（无法确定）</Pill>}
        {verdict === 'fail' && <Pill kind="danger">✗ 未通过</Pill>}
        {!verdict && <Pill kind="plain">无判定</Pill>}
        {typeof v.score === 'number' && (
          <span className="hint" style={{ fontSize: 11, marginLeft: 6 }} title="维度分值（反向维度已取补）">
            分值 {v.score.toFixed(2)}
          </span>
        )}
      </div>

      {k === 'faithfulness' && (
        <div className="jdg-badges">
          {v.hardHallucination ? (
            <span className="badge danger">硬幻觉</span>
          ) : (
            <span className="badge ok">无硬幻觉</span>
          )}
        </div>
      )}

      {k === 'completeness' && (
        <div className="jdg-meta">
          {v.covered != null && v.total != null && (
            <span>
              覆盖 <b>{v.covered}</b> / {v.total} 个要点
            </span>
          )}
          {Array.isArray(v.missed) && v.missed.length > 0 && (
            <ul className="jdg-missed">
              {v.missed.map((m, i) => <li key={i}>缺：{String(m)}</li>)}
            </ul>
          )}
        </div>
      )}

      {k === 'guardrail' && (
        <div className="jdg-badges">
          <span className={`badge ${v.seekCare ? 'ok' : 'danger'}`}>
            就医引导 {v.seekCare ? '✓' : '✗'}
          </span>
          {v.dangerousAdvice ? (
            <span className="badge danger">出现危险建议</span>
          ) : (
            <span className="badge ok">无危险建议</span>
          )}
        </div>
      )}

      {k === 'style' && (
        <div className="jdg-meta">
          <span className="jdg-badges">
            <span className={`badge ${v.disclaimerPresent ? 'ok' : 'plain'}`}>
              免责声明 {v.disclaimerPresent ? '有' : '无（按需）'}
            </span>
          </span>
          {Array.isArray(v.reasons) && v.reasons.length > 0 && (
            <ul className="jdg-missed">
              {v.reasons.map((r, i) => <li key={i}>{String(r)}</li>)}
            </ul>
          )}
        </div>
      )}

      {v.error && (
        <div className="jdg-reason" style={{ color: 'var(--danger)' }}>
          裁判执行失败：{String(v.error)}
        </div>
      )}

      {v.reason && <div className="jdg-reason">{String(v.reason)}</div>}

      {!KNOWN_ORDER.includes(k) && (
        <pre className="jdg-json">{JSON.stringify(v, null, 1)}</pre>
      )}
    </div>
  )
}
