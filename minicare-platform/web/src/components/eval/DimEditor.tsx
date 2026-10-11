/**
 * 维度编辑器（PRD-012 US-15 / TECH-026 C6 裁判中心化）。
 *
 * 维度 = 裁判内部的判定项（case 级）或闸门聚合项（run 级）：
 *   · case 级：名称 / 判定要点（criteria，直接落库 `eval_dimension.criteria`，引擎优先读取）/
 *     权重 / 反向 / 归属指标 / 组 / 启用；归属裁判由创建上下文（裁判编辑页）写入；
 *   · run 级：阈值 / 一票否决 / 启用（闸门判定，不参与样本分聚合）。
 *
 * 导出 `dimBody()`：维度全量更新载荷（后端 upsert 为全量语义，必须回填未改字段）。
 */
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '../Modal'
import {
  agentEvalApi, dimKeyOfDim, DIM_LEVEL_LABEL, EVAL_GROUPS, SCORE_TYPE_LABEL,
  type EvalDimension, type EvalIndicator,
} from '../../lib/agentEval'

const INPUT: CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6,
  fontSize: 13, background: 'var(--surface)', color: 'var(--text)', width: '100%',
  boxSizing: 'border-box',
}

/** 维度全量更新载荷（缺省回填现有值；显式覆盖走 over） */
export function dimBody(d: EvalDimension, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: d.name, level: d.level, grp: d.grp, description: d.description,
    score_type: d.score_type, threshold: d.threshold, weight: d.weight,
    must_pass: d.must_pass, indicator_id: d.indicator_id ?? null,
    reverse: d.reverse ?? false, metric_key: d.metric_key ?? null,
    judge_id: d.judge_id ?? null, criteria: d.criteria ?? null,
    enabled: d.enabled, sort_order: d.sort_order, ...over,
  }
}

export function DimEditor({
  initial, indicators, ownerLabel, onClose, onSaved, onError,
}: {
  initial: EvalDimension
  indicators: EvalIndicator[]
  /** 归属裁判展示名（case 级；缺省不展示） */
  ownerLabel?: string | null
  onClose: () => void
  onSaved: (msg: string) => void
  onError: (msg: string) => void
}) {
  const isRun = initial.level === 'run'
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description ?? '')
  const [criteria, setCriteria] = useState(initial.criteria ?? '')
  const [threshold, setThreshold] = useState(initial.threshold != null ? String(initial.threshold) : '')
  const [weight, setWeight] = useState(String(initial.weight))
  const [mustPass, setMustPass] = useState(initial.must_pass)
  const [enabled, setEnabled] = useState(initial.enabled)
  const [reverse, setReverse] = useState(initial.reverse ?? false)
  const [indicatorId, setIndicatorId] = useState(initial.indicator_id ?? '')
  const [grp, setGrp] = useState(initial.grp ?? 'l2')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (isRun && threshold.trim() !== '') {
      const t = Number(threshold)
      if (Number.isNaN(t) || t < 0 || t > 1) return onError('阈值需在 0..1 之间（如 0.95 表示 95%）')
    }
    if (Number(weight) < 0) return onError('权重不能为负数')
    setSaving(true)
    try {
      await agentEvalApi.updateDimension(initial.dim_id, dimBody(initial, {
        name: name.trim() || initial.name,
        description: description.trim() || null,
        weight: Number(weight) || 1,
        must_pass: mustPass,
        enabled,
        reverse: isRun ? false : reverse,
        indicator_id: isRun ? initial.indicator_id ?? null : (indicatorId || null),
        grp: isRun ? initial.grp : (grp || null),
        threshold: isRun ? (threshold.trim() === '' ? null : Number(threshold)) : initial.threshold,
        criteria: isRun ? initial.criteria ?? null : (criteria.trim() || null),
      }))
      onSaved('维度已保存（下一轮判分 / 运行生效）')
    } catch (e) {
      onError(`保存失败：${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`编辑维度 · ${initial.dim_id}`}
      subtitle={[
        `级别 ${DIM_LEVEL_LABEL[initial.level] || initial.level}`,
        `评分方式 ${SCORE_TYPE_LABEL[initial.score_type] || initial.score_type}`,
        !isRun && ownerLabel ? `归属裁判 ${ownerLabel}` : '',
        `键 ${dimKeyOfDim(initial)}`,
      ].filter(Boolean).join(' · ')}
      onClose={onClose}
      width={680}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <div style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>名称</div>
          <input style={INPUT} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>权重（参与指标分加权平均）</div>
          <input style={INPUT} type="number" step={0.5} min={0} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div className="hint" style={{ marginBottom: 4 }}>描述</div>
        <input style={INPUT} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {!isRun && (
        <>
          <div style={{ marginBottom: 10 }}>
            <div className="hint" style={{ marginBottom: 4 }}>
              判定要点（判分引擎 criteria；留空回退内置模板——仅四个默认维度有内置模板）
            </div>
            <textarea
              style={{ ...INPUT, minHeight: 110, lineHeight: 1.6 }}
              value={criteria}
              placeholder="给裁判的判定标准（三态判定要求与输出规范由引擎自动附加）"
              onChange={(e) => setCriteria(e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div style={{ marginBottom: 10 }}>
              <div className="hint" style={{ marginBottom: 4 }}>归属指标</div>
              <select style={INPUT} value={indicatorId} onChange={(e) => setIndicatorId(e.target.value)}>
                <option value="">未分组（不计入样本分）</option>
                {indicators.map((i) => (
                  <option key={i.indicator_id} value={i.indicator_id}>{i.name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div className="hint" style={{ marginBottom: 4 }}>组（用例分组口径）</div>
              <select style={INPUT} value={grp} onChange={(e) => setGrp(e.target.value)}>
                {EVAL_GROUPS.map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      {isRun && (
        <div style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>通过阈值（0..1，如 0.95 = 95%；留空 = 不按阈值判）</div>
          <input style={INPUT} value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="0.95" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, margin: '4px 0 12px' }}>
        {!isRun && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title="反向维度：分值取 1−score（如「违规数」越低越好）">
            <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />
            反向维度
          </label>
        )}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title="安全类硬门槛：不达标视为整体未通过">
          <input type="checkbox" checked={mustPass} onChange={(e) => setMustPass(e.target.checked)} />
          一票否决
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          启用
        </label>
      </div>
      <div className="toolbar" style={{ margin: 0 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
        <button className="btn" onClick={onClose}>取消</button>
      </div>
    </Modal>
  )
}

/* ── 新建维度（挂到指定裁判下；裁判中心化：不再自动建裁判）────────── */

export function NewDimModal({
  judgeId, judgeName, indicators, defaultIndicatorId, dims, nextSort, onClose, onSaved, onError,
}: {
  judgeId: string
  judgeName: string
  indicators: EvalIndicator[]
  defaultIndicatorId?: string | null
  dims: EvalDimension[]
  nextSort: () => number
  onClose: () => void
  onSaved: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [criteria, setCriteria] = useState('')
  const [grp, setGrp] = useState('l2')
  const [weight, setWeight] = useState('1')
  const [reverse, setReverse] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [indicatorId, setIndicatorId] = useState(defaultIndicatorId || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const k = key.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]*$/.test(k)) return onError('维度键须为小写字母/数字/连字符（如 tone-check）')
    if (!name.trim()) return onError('名称不能为空')
    const dimId = `dim-${k}`
    if (dims.some((d) => d.dim_id === dimId || dimKeyOfDim(d) === k)) {
      return onError(`维度键「${k}」已被占用（dim_id 或 metric_key 冲突）`)
    }
    setSaving(true)
    try {
      await agentEvalApi.createDimension({
        dim_id: dimId, judge_id: judgeId, name: name.trim(), level: 'case', grp,
        description: description.trim() || null, score_type: 'boolean', threshold: null,
        weight: Number(weight) || 1, must_pass: false, indicator_id: indicatorId || null,
        reverse, metric_key: k, criteria: criteria.trim() || null,
        enabled, sort_order: nextSort(),
      })
      onSaved(`维度「${name.trim()}」已创建并挂在裁判「${judgeName}」下`)
    } catch (e) {
      onError(`创建失败：${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`添加判分维度 · ${judgeName}`}
      subtitle="维度是裁判内部的判定项：挂到指标下即参与样本分聚合；判定要点为判分引擎的核心输入"
      onClose={onClose}
      width={680}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <div style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>维度键（英文，用例判分配置引用；如 tone-check）</div>
          <input style={INPUT} value={key} onChange={(e) => setKey(e.target.value)} placeholder="tone-check" />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>名称</div>
          <input style={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="不口播数据来源" />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div className="hint" style={{ marginBottom: 4 }}>描述</div>
        <input style={INPUT} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div className="hint" style={{ marginBottom: 4 }}>判定要点（判分引擎 criteria；可稍后在维度编辑器完善）</div>
        <textarea
          style={{ ...INPUT, minHeight: 90, lineHeight: 1.6 }}
          value={criteria}
          placeholder="给裁判的判定标准（三态判定要求与输出规范由引擎自动附加）"
          onChange={(e) => setCriteria(e.target.value)}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0 16px' }}>
        <div style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>归属指标</div>
          <select style={INPUT} value={indicatorId} onChange={(e) => setIndicatorId(e.target.value)}>
            <option value="">未分组</option>
            {indicators.map((i) => <option key={i.indicator_id} value={i.indicator_id}>{i.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>组</div>
          <select style={INPUT} value={grp} onChange={(e) => setGrp(e.target.value)}>
            {EVAL_GROUPS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>权重</div>
          <input style={INPUT} type="number" step={0.5} min={0} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>开关</div>
          <div style={{ display: 'flex', gap: 12, lineHeight: '32px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />反向
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />启用
            </label>
          </div>
        </div>
      </div>
      <div className="hint" style={{ marginBottom: 10 }}>
        新建后需到「测评用例」给相关用例的判分配置补上 <span className="mono">{key.trim() || '键'}</span> 要点，判分才会在该用例生效。
      </div>
      <div className="toolbar" style={{ margin: 0 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '创建中…' : '创建维度'}
        </button>
        <button className="btn" onClick={onClose}>取消</button>
      </div>
    </Modal>
  )
}
