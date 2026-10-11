/**
 * 指标（聚合层）管理与判分说明（PRD-012 US-15/16；TECH-026 §3.3 / §5.2）。
 *
 * 指标 = 跨裁判维度的聚合层：样本分 = 各指标分的算术平均；指标不直接判分，
 * 每个指标由若干「裁判内部维度」按权重聚合而来。管理入口挂在裁判列表页。
 */
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, CardBody, CardHead, Pill, Table } from '../ui'
import { Modal } from '../Modal'
import { agentEvalApi, SAMPLE_THRESHOLD, type EvalDimension, type EvalIndicator } from '../../lib/agentEval'

const INPUT: CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6,
  fontSize: 13, background: 'var(--surface)', color: 'var(--text)', width: '100%',
  boxSizing: 'border-box',
}

export function IndicatorsPanel({
  indicators, dims, onChanged, onError,
}: {
  indicators: EvalIndicator[]
  dims: EvalDimension[]
  onChanged: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [editing, setEditing] = useState<EvalIndicator | 'new' | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const dimCount = (id: string) => dims.filter((d) => d.indicator_id === id).length

  const del = async (id: string) => {
    try {
      await agentEvalApi.deleteIndicator(id)
      setConfirmDel(null)
      onChanged('指标已删除（其下维度变为「未分组」，不计入样本分）')
    } catch (e) {
      onError(`删除失败：${(e as Error).message}`)
    }
  }

  return (
    <>
      <div className="toolbar" style={{ margin: '0 0 8px' }}>
        <span className="hint">指标是跨裁判的聚合层：样本分 = 各指标分的算术平均；不直接判分，由维度按权重聚合而来</span>
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setEditing('new')}>+ 新建指标</button>
      </div>
      <Table cols={[130, 150, 0, 90, 120]}>
        <thead>
          <tr>
            <th>指标</th>
            <th>名称</th>
            <th>说明</th>
            <th className="num">维度数</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {indicators.map((ind) => (
            <tr key={ind.indicator_id}>
              <td className="mono hint">{ind.indicator_id}</td>
              <td>
                {ind.name}
                {!ind.enabled && <Pill kind="plain">停用</Pill>}
              </td>
              <td className="hint wrap">{ind.description || '—'}</td>
              <td className="num">{dimCount(ind.indicator_id)}</td>
              <td>
                <button className="btn btn-mini" style={{ marginRight: 4 }} onClick={() => setEditing(ind)}>编辑</button>
                {confirmDel === ind.indicator_id ? (
                  <>
                    <button className="btn btn-mini" style={{ color: 'var(--danger)', marginRight: 4 }} onClick={() => del(ind.indicator_id)}>
                      确认删除
                    </button>
                    <button className="btn btn-mini" onClick={() => setConfirmDel(null)}>取消</button>
                  </>
                ) : (
                  <button className="btn btn-mini" onClick={() => setConfirmDel(ind.indicator_id)}>删除</button>
                )}
              </td>
            </tr>
          ))}
          {indicators.length === 0 && (
            <tr><td colSpan={5} className="hint">还没有指标——新建一个后把维度挂上来。</td></tr>
          )}
        </tbody>
      </Table>

      {editing && (
        <IndicatorEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged('指标已保存') }}
          onError={onError}
        />
      )}
    </>
  )
}

function IndicatorEditor({
  initial, onClose, onSaved, onError,
}: {
  initial: EvalIndicator | null
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return onError('指标名称不能为空')
    setSaving(true)
    try {
      if (initial) {
        await agentEvalApi.updateIndicator(initial.indicator_id, {
          name: name.trim(), description: description.trim() || null,
          enabled, sort_order: initial.sort_order,
        })
      } else {
        await agentEvalApi.createIndicator({
          indicator_id: `ind-${Date.now().toString(36)}`, name: name.trim(),
          description: description.trim() || null, enabled: true, sort_order: 100,
        })
      }
      onSaved()
    } catch (e) {
      onError(`保存失败：${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={initial ? `编辑指标 · ${initial.indicator_id}` : '新建指标'}
      subtitle="指标是聚合层（业务口径）；维度挂到指标下即参与样本分聚合"
      onClose={onClose}
      width={560}
    >
      <div style={{ marginBottom: 10 }}>
        <div className="hint" style={{ marginBottom: 4 }}>指标名称（≤20 字）</div>
        <input style={INPUT} value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="如：响应效率" />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div className="hint" style={{ marginBottom: 4 }}>说明（≤50 字）</div>
        <input style={INPUT} value={description} maxLength={50} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 24, margin: '4px 0 12px' }}>
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

/* ── 判分说明（US-16：自动生成公式卡）───────────────────────────── */

export function ScoringFormula({
  indicators, dims,
}: {
  indicators: EvalIndicator[]
  dims: EvalDimension[]
}) {
  const [showExample, setShowExample] = useState(false)
  const enabled = indicators.filter((i) => i.enabled)
  const caseDims = dims.filter((d) => d.level === 'case')
  const bound = caseDims.filter((d) => d.judge_id)
  const unassignedN = caseDims.filter((d) => !d.indicator_id).length

  return (
    <Card>
      <CardHead
        title="判分说明（自动生成 · 只读）"
        meta={<span className="hint">评分公式对所有用例统一执行；改权重与阈值后下一轮运行生效</span>}
      />
      <CardBody>
        <div className="formula-box">
          <div className="formula-line">
            <b>维度值</b>：通过 <span className="mono">1.0</span> ／ 中性 <span className="mono">0.5</span> ／
            失败 <span className="mono">0.0</span>（反向维度取 1 − 分值；维度"未测"不计入加权）
          </div>
          <div className="formula-line">
            <b>指标分</b> = Σ(权重 × 维度分) ÷ Σ(权重)——无可用维度的指标不计入样本分
          </div>
          <div className="formula-line">
            <b>样本分</b> = 各可用指标分的算术平均（保留 1 位）；
            <b>样本分 ≥ {SAMPLE_THRESHOLD.toFixed(2)}</b> → 用例 PASS（压线算通过）
          </div>
          <div className="formula-line hint" style={{ marginTop: 6 }}>
            「中性」= 裁判判定"无法确定"，与"未测"（维度本轮未执行 / 不适用，不计入）语义不同。
          </div>
        </div>

        <div className="toolbar" style={{ margin: '10px 0 0' }}>
          <span className="hint">
            当前配置：{enabled.length} 个启用指标 · {bound.length} 个裁判维度参与判分
            {unassignedN > 0 && <span style={{ color: 'var(--warn)' }}> · {unassignedN} 个维度未挂指标</span>}
          </span>
          <button className="btn btn-mini" style={{ marginLeft: 'auto' }} onClick={() => setShowExample((v) => !v)}>
            {showExample ? '收起示例演算 ▴' : '查看示例演算 ▾'}
          </button>
        </div>

        {showExample && (
          <div className="formula-box" style={{ marginTop: 8 }}>
            <div className="formula-line hint">示例演算（一个样本横跨两个指标）</div>
            <div className="formula-line">
              指标①「回答质量」：维度 A（权重 1，通过 → 1.0）+ 维度 B（权重 0.5，中性 → 0.5）<br />
              指标①分 = <span className="mono">(1×1.0 + 0.5×0.5) ÷ 1.5 = 0.83</span>
            </div>
            <div className="formula-line">
              指标②「结果符合预期」：维度 C（权重 1，失败 → 0.0）→ 指标②分 = <span className="mono">0.00</span>
            </div>
            <div className="formula-line">
              样本分 = <span className="mono">(0.83 + 0.00) ÷ 2 = 0.42</span>
              <span className="mono"> 0.42 &lt; {SAMPLE_THRESHOLD.toFixed(2)}</span> → <b style={{ color: 'var(--danger)' }}>FAIL</b>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
