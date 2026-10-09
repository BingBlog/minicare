/**
 * 页面：测评任务（TECH-021 §6.3）
 *
 * 任务 = 命名配置（用例选择 × 维度子集 × judge 开关 × 轮次）；[发起运行] 一键执行，
 * 运行记录挂 task_id（历史页/详情页可回看"某任务第 N 轮"）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, CardBody, CardHead, Empty, ErrorBox, Loading, Pill, Table } from '../components/ui'
import { Modal } from '../components/Modal'
import { useApp } from '../lib/app-context'
import {
  agentEvalApi, EVAL_GROUPS, fmtDuration, fmtTime, groupLabel, priorityLabel, tagLabel,
  RUN_STATUS_LABEL, statusPillKind,
  type EvalDimension, type EvalTask, type EvalTaskScope,
} from '../lib/agentEval'

const INPUT: CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6,
  fontSize: 13, background: 'var(--surface)', color: 'var(--text)', width: '100%',
  boxSizing: 'border-box',
}

function scopeSummary(s: EvalTaskScope | undefined): string {
  if (!s || s.all) return '全部'
  const parts: string[] = []
  if (s.groups?.length) parts.push(`组 ${s.groups.map((g) => groupLabel(g)).join('+')}`)
  if (s.tags?.length) parts.push(`标签 ${s.tags.map((t) => tagLabel(t)).join('+')}`)
  if (s.priorities?.length) parts.push(`优先级 ${s.priorities.map((p) => priorityLabel(p)).join('+')}`)
  if (s.ids?.length) parts.push(`指定 ${s.ids.length} 条`)
  return parts.join(' · ') || '全部'
}

export function AgentEvalTasksPage() {
  const { toast, go, nonce } = useApp()
  const [items, setItems] = useState<EvalTask[] | null>(null)
  const [dims, setDims] = useState<EvalDimension[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EvalTask | 'new' | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const [t, d] = await Promise.all([agentEvalApi.listTasks(), agentEvalApi.listDimensions()])
      setItems(t.items)
      setDims(d.items)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, nonce])

  const run = async (t: EvalTask) => {
    setRunningId(t.task_id)
    try {
      const r = await agentEvalApi.runTask(t.task_id)
      toast(`任务「${t.name}」已发起：${r.run_id}（${r.case_count} 条用例）`)
      go('agenteval', { doc: r.run_id })
    } catch (e) {
      toast(`发起失败：${(e as Error).message}`, 7000)
    } finally {
      setRunningId(null)
    }
  }

  const remove = async (t: EvalTask) => {
    if (confirmDel !== t.task_id) {
      setConfirmDel(t.task_id)
      window.setTimeout(() => setConfirmDel((v) => (v === t.task_id ? null : v)), 4000)
      return
    }
    setConfirmDel(null)
    try {
      await agentEvalApi.deleteTask(t.task_id)
      toast(`已删除任务「${t.name}」`)
      void load()
    } catch (e) {
      toast(`删除失败：${(e as Error).message}`, 6000)
    }
  }

  if (error) return <ErrorBox error={new Error(error)} />
  if (!items) return <Loading />

  return (
    <>
      <Card>
        <CardHead
          title="测评任务"
          meta={
            <button className="btn btn-primary" onClick={() => setEditing('new')}>＋ 新建任务</button>
          }
        />
        <CardBody flush>
          {/* 任务列 196：容下 task_id 小字行（实测需 ≈188px）；操作列 228：容下三按钮
              （发起运行/编辑/确认删？ ≈200px，含确认删二次态） */}
          {items.length === 0 ? (
            <Empty title="还没有任务">
              任务把「用例选择 × 维度子集 × 裁判开关 × 轮次」存成可复刻的配置；建一个「R1 回归」开始吧。
            </Empty>
          ) : (
            <Table cols={[196, 0, 104, 84, 56, 190, 228]}>
              <thead>
                <tr>
                  <th>任务</th>
                  <th>用例选择</th>
                  <th>维度</th>
                  <th>裁判判分</th>
                  <th>轮次</th>
                  <th>最近运行</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.task_id}>
                    <td>
                      <div>{t.name}</div>
                      <div className="hint mono">{t.task_id}{t.run_count ? ` · 共 ${t.run_count} 轮` : ''}</div>
                    </td>
                    <td className="wrap">{scopeSummary(t.scope)}</td>
                    <td className="hint">{t.dims?.length ? `${t.dims.length} 个` : '全部'}</td>
                    <td className="hint">{t.judge ? '开' : '关'}</td>
                    <td className="hint">{t.runs_n}</td>
                    <td className="hint">
                      {t.last_run ? (
                        <>
                          {fmtTime(t.last_run.created_at)} ·{' '}
                          <Pill kind={statusPillKind(t.last_run.status)}>
                            {RUN_STATUS_LABEL[t.last_run.status] || t.last_run.status}
                          </Pill>
                          {t.last_run.summary ? ` ${t.last_run.summary.passed}/${t.last_run.summary.total}` : ''}
                        </>
                      ) : '—'}
                    </td>
                    <td>
                      <button
                        className="btn btn-primary"
                        style={{ marginRight: 4 }}
                        disabled={runningId !== null}
                        onClick={() => run(t)}
                      >
                        {runningId === t.task_id ? '发起中…' : '发起运行'}
                      </button>
                      <button className="btn" style={{ marginRight: 4 }} onClick={() => setEditing(t)}>编辑</button>
                      <button className={confirmDel === t.task_id ? 'btn btn-danger' : 'btn'} onClick={() => remove(t)}>
                        {confirmDel === t.task_id ? '确认删？' : '删除'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {editing !== null && (
        <TaskEditor
          initial={editing === 'new' ? null : editing}
          dims={dims}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast('已保存')
            void load()
          }}
          onError={(m) => toast(m, 6000)}
        />
      )}
    </>
  )
}

/* ── 编辑弹框 ── */

function TaskEditor({
  initial, dims, onClose, onSaved, onError,
}: {
  initial: EvalTask | null
  dims: EvalDimension[]
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const isNew = initial === null
  const [taskId, setTaskId] = useState(initial?.task_id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [all, setAll] = useState(initial?.scope?.all ?? true)
  const [groups, setGroups] = useState<string[]>(initial?.scope?.groups ?? [])
  const [tags, setTags] = useState((initial?.scope?.tags ?? []).join(','))
  const [priorities, setPriorities] = useState<string[]>(initial?.scope?.priorities ?? [])
  const [ids, setIds] = useState((initial?.scope?.ids ?? []).join(','))
  const [dimIds, setDimIds] = useState<string[]>(initial?.dims ?? [])
  const [judge, setJudge] = useState(initial?.judge ?? true)
  const [runsN, setRunsN] = useState(initial?.runs_n ?? 1)
  const [note, setNote] = useState(initial?.note ?? '')
  const [saving, setSaving] = useState(false)

  const toggleIn = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const save = async () => {
    if (isNew && !/^task-[a-z0-9-]+$/.test(taskId.trim())) return onError('task_id 需形如 task-xxx（小写字母/数字/连字符）')
    if (!name.trim()) return onError('请填写任务名称')
    const scope: EvalTaskScope = all
      ? { all: true }
      : {
          groups: groups.length ? groups : undefined,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean).length
            ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
          priorities: priorities.length ? priorities : undefined,
          ids: ids.split(',').map((t) => t.trim()).filter(Boolean).length
            ? ids.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        }
    if (!all && !scope.groups && !scope.tags && !scope.priorities && !scope.ids) {
      return onError('非全量任务至少选一个筛选条件（组 / 标签 / 优先级 / 指定用例）')
    }
    const payload = {
      name, scope, dims: dimIds.length ? dimIds : null,
      judge, runs_n: runsN, note: note || null, enabled: true,
    }
    setSaving(true)
    try {
      if (isNew) {
        await agentEvalApi.createTask({ task_id: taskId.trim(), ...payload })
      } else {
        await agentEvalApi.updateTask(initial.task_id, payload)
      }
      onSaved()
    } catch (e) {
      onError(`保存失败：${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const row = (label: string, node: React.ReactNode, hint?: string) => (
    <div style={{ marginBottom: 10 }}>
      <div className="hint" style={{ marginBottom: 4 }}>
        {label}
        {hint ? `（${hint}）` : ''}
      </div>
      {node}
    </div>
  )

  return (
    <Modal title={isNew ? '新建任务' : `编辑任务 · ${initial?.name}`} onClose={onClose} width={820}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        {isNew &&
          row('task_id', (
            <input style={INPUT} value={taskId} onChange={(e) => setTaskId(e.target.value)} placeholder="task-r1-regression" />
          ))}
        {row('名称', (
          <input style={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="R1 回归" />
        ))}
      </div>
      {row('用例选择', (
        <div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 14 }}>
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            全部用例
          </label>
          {!all && (
            <div style={{ marginTop: 6, display: 'grid', gap: 8 }}>
              <div>
                <span className="hint">组：</span>
                {EVAL_GROUPS.map(([id, label]) => (
                  <label key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 10 }}>
                    <input type="checkbox" checked={groups.includes(id)} onChange={() => toggleIn(groups, setGroups, id)} />
                    {label}
                  </label>
                ))}
              </div>
              <div>
                <span className="hint">优先级：</span>
                {['P0', 'P1', 'P2'].map((p) => (
                  <label key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 10 }}>
                    <input type="checkbox" checked={priorities.includes(p)} onChange={() => toggleIn(priorities, setPriorities, p)} />
                    {priorityLabel(p)}
                  </label>
                ))}
                <span className="hint" style={{ marginLeft: 10 }}>标签：</span>
                <input
                  style={{ ...INPUT, width: 190, display: 'inline-block' }}
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="capability,safety,realdata"
                />
                <span className="hint" style={{ marginLeft: 8 }}>（capability=能力 · safety=安全 · realdata=真实数据）</span>
              </div>
              <div>
                <span className="hint">指定用例（逗号分隔，可留空）：</span>
                <input style={INPUT} value={ids} onChange={(e) => setIds(e.target.value)} placeholder="R1-01,R1-05" />
              </div>
            </div>
          )}
        </div>
      ))}
      {row('维度子集', (
        <div>
          {dims.map((d) => (
            <label key={d.dim_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 12 }}>
              <input type="checkbox" checked={dimIds.includes(d.dim_id)} onChange={() => toggleIn(dimIds, setDimIds, d.dim_id)} />
              {d.name}
            </label>
          ))}
        </div>
      ), '不勾选 = 使用全部启用维度')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '0 16px' }}>
        {row('裁判判分', (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={judge} onChange={(e) => setJudge(e.target.checked)} />
            {' '}启用 LLM 判分
          </label>
        ))}
        {row('轮次', (
          <select style={INPUT} value={runsN} onChange={(e) => setRunsN(Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        ))}
        {row('备注', (
          <input style={INPUT} value={note} onChange={(e) => setNote(e.target.value)} />
        ))}
      </div>
      <div className="toolbar" style={{ margin: 0 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
        <button className="btn" onClick={onClose}>取消</button>
        {initial?.last_run ? (
          <span className="hint">最近运行：{fmtTime(initial.last_run.created_at)} · {fmtDuration(initial.last_run.duration_ms)}</span>
        ) : null}
      </div>
    </Modal>
  )
}
