/**
 * 归因编辑块（TECH-026 §3.2 / PRD-012 US-14）：展示自动归因 + 人工改判 / 恢复自动。
 *
 * 嵌于证据链顶部（仅失败样本渲染）；保存后由父级用响应里的全量 `report` 替换本地状态
 * → 决策 hero / 五指标 / 归因分布即时重算（改判不是记备注，而是改变结论）。
 */
import { useState } from 'react'
import {
  agentEvalApi, ATTRIBUTION_HINT, ATTRIBUTION_LABEL, ATTRIBUTION_ORDER, attributionLabel,
  type AttributionClass, type EvalCaseResult, type EvalReport,
} from '../../lib/agentEval'

export function AttributionEditor({
  c,
  runId,
  onSaved,
  disabled,
  derived,
}: {
  c: EvalCaseResult
  runId: string
  onSaved: (resp: { case: EvalCaseResult; report: EvalReport }) => void
  /** 运行中/查看历史轮等场景禁止编辑（可选） */
  disabled?: boolean
  /** 旧轮实时推导值（报告 by_case 透传；仅展示与预填，保存后转为存值） */
  derived?: AttributionClass | null
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<AttributionClass | null>(c.attribution ?? derived ?? null)
  const [note, setNote] = useState(c.attribution_note || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async (reset: boolean) => {
    setSaving(true)
    setErr(null)
    try {
      const resp = await agentEvalApi.updateAttribution(
        runId, c.case_id,
        reset ? { attribution: null } : { attribution: value, note },
      )
      onSaved(resp)
      setOpen(false)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const eff = c.attribution || derived || null
  const sourceText = c.attribution_source === 'manual'
    ? '人工复核'
    : c.attribution
      ? '自动分类'
      : derived
        ? '旧轮实时推导（保存后覆盖为人工记录）'
        : '未归类（可直接选择并保存）'

  return (
    <div className="ae-block">
      <div className="ae-row">
        <span className="ev-label">归因</span>
        <span className={`attr-chip ${eff || 'none'}`}>
          {eff ? attributionLabel(eff) : '待归类'}
          {c.attribution_source === 'manual' ? ' · 已复核' : (!c.attribution && eff ? ' · 推导' : '')}
        </span>
        <span className="hint">
          {sourceText}
          {c.attribution_note ? `（${c.attribution_note}）` : ''}
        </span>
        {!disabled ? (
          <button
            className="btn btn-mini"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              setValue(c.attribution ?? value)
              setNote(c.attribution_note || note)
              setOpen(!open)
            }}
          >
            {open ? '收起' : '改判'}
          </button>
        ) : (
          <span className="hint" style={{ marginLeft: 'auto' }}>运行中不可改判</span>
        )}
      </div>
      {open && (
        <div className="ae-editor">
          <div className="attr-opts">
            {ATTRIBUTION_ORDER.map((k) => (
              <button
                key={k}
                className={`attr-opt${value === k ? ' sel' : ''}`}
                title={ATTRIBUTION_HINT[k]}
                onClick={() => setValue(k)}
              >
                {ATTRIBUTION_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="ae-hint">
            {value ? ATTRIBUTION_HINT[value] : '选择归因分类；保存后全域结论（五指标 / 归因分布 / 决策）将实时重算'}
          </div>
          <input
            className="mini-input"
            style={{ width: '100%', marginTop: 6 }}
            placeholder="备注（可选）：为什么改判…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {err && <div className="ae-err">保存失败：{err}</div>}
          <div className="toolbar" style={{ margin: '8px 0 0' }}>
            <button className="btn btn-primary btn-mini" disabled={saving || !value} onClick={() => save(false)}>
              {saving ? '保存中…' : '保存改判'}
            </button>
            <button className="btn btn-mini" disabled={saving} onClick={() => save(true)}>
              恢复自动结果
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
