/**
 * 页面：测评维度（TECH-021 §6.5）
 *
 * 维度 = 要测什么 + 判定口径（run 级：阈值/一票否决；case 级：由绑定裁判逐例判）。
 * 运行结束时 gate 汇总按这里的配置判定（改阈值 → 下一轮结论跟随）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, CardBody, CardHead, ErrorBox, Loading, Pill, Table } from '../components/ui'
import { Modal } from '../components/Modal'
import { useApp } from '../lib/app-context'
import { agentEvalApi, DIM_LEVEL_LABEL, SCORE_TYPE_LABEL, type EvalDimension } from '../lib/agentEval'

const INPUT: CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6,
  fontSize: 13, background: 'var(--surface)', color: 'var(--text)', width: '100%',
  boxSizing: 'border-box',
}

function fmtThreshold(d: EvalDimension): string {
  if (d.threshold == null) return '—'
  return `${(d.threshold * 100).toFixed(0)}%`
}

export function AgentEvalDimsPage() {
  const { toast, nonce } = useApp()
  const [items, setItems] = useState<EvalDimension[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EvalDimension | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const r = await agentEvalApi.listDimensions()
      setItems(r.items)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, nonce])

  if (error) return <ErrorBox error={new Error(error)} />
  if (!items) return <Loading />

  return (
    <>
      <Card>
        <CardHead
          title="测评维度"
          meta={<span className="hint">运行级维度决定闸门结论；一票否决用于安全类硬门槛</span>}
        />
        <CardBody flush>
          <Table cols={[170, 140, 60, 90, 80, 60, 80, 70, 80]}>
            <thead>
              <tr>
                <th>维度</th>
                <th>名称</th>
                <th>级别</th>
                <th>评分方式</th>
                <th>阈值</th>
                <th>权重</th>
                <th>一票否决</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.dim_id}>
                  <td className="mono hint">{d.dim_id}</td>
                  <td>{d.name}</td>
                  <td>
                    <Pill kind={d.level === 'run' ? 'warn' : 'plain'}>{DIM_LEVEL_LABEL[d.level] || d.level}</Pill>
                  </td>
                  <td className="hint">{SCORE_TYPE_LABEL[d.score_type] || d.score_type}</td>
                  <td className="num">{fmtThreshold(d)}</td>
                  <td className="num hint">{d.weight}</td>
                  <td>{d.must_pass ? <Pill kind="danger">是</Pill> : <span className="hint">—</span>}</td>
                  <td>{d.enabled ? <Pill kind="ok">启用</Pill> : <Pill kind="plain">停用</Pill>}</td>
                  <td>
                    <button className="btn" onClick={() => setEditing(d)}>编辑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      {editing && (
        <DimEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast('已保存（下一次运行的 gate 判定生效）')
            void load()
          }}
          onError={(m) => toast(m, 6000)}
        />
      )}
    </>
  )
}

function DimEditor({
  initial, onClose, onSaved, onError,
}: {
  initial: EvalDimension
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const isRun = initial.level === 'run'
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description ?? '')
  const [threshold, setThreshold] = useState(initial.threshold != null ? String(initial.threshold) : '')
  const [weight, setWeight] = useState(String(initial.weight))
  const [mustPass, setMustPass] = useState(initial.must_pass)
  const [enabled, setEnabled] = useState(initial.enabled)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (isRun && threshold.trim() !== '') {
      const t = Number(threshold)
      if (Number.isNaN(t) || t < 0 || t > 1) return onError('阈值需在 0..1 之间（如 0.95 表示 95%）')
    }
    setSaving(true)
    try {
      await agentEvalApi.updateDimension(initial.dim_id, {
        name,
        description: description || null,
        threshold: isRun ? (threshold.trim() === '' ? null : Number(threshold)) : initial.threshold,
        weight: Number(weight) || 1,
        must_pass: mustPass,
        enabled,
        level: initial.level,
        score_type: initial.score_type,
        grp: initial.grp,
        sort_order: initial.sort_order,
      })
      onSaved()
    } catch (e) {
      onError(`保存失败：${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`编辑维度 · ${initial.dim_id}`}
      subtitle={`级别 ${DIM_LEVEL_LABEL[initial.level] || initial.level} · 评分方式 ${SCORE_TYPE_LABEL[initial.score_type] || initial.score_type}`}
      onClose={onClose}
      width={640}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <div style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>名称</div>
          <input style={INPUT} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>权重（记录；二期参与综合分）</div>
          <input style={INPUT} type="number" step={0.5} min={0} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div className="hint" style={{ marginBottom: 4 }}>描述</div>
        <input style={INPUT} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {isRun && (
        <div style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>通过阈值（0..1，如 0.95 = 95%；留空 = 不按阈值判）</div>
          <input style={INPUT} value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="0.95" />
        </div>
      )}
      <div style={{ display: 'flex', gap: 24, margin: '4px 0 12px' }}>
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
