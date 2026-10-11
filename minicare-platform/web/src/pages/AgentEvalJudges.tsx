/**
 * 页面：测评裁判（裁判中心化 C6 —— 合并原「测评裁判」+「指标与维度」）
 *
 * 实体层级（C6 翻转）：**裁判（= 一个业务场景）→ 维度（裁判内部判定项）→ 指标（跨裁判聚合层）**。
 *   · 维度归属裁判（`eval_dimension.judge_id`），判定要点（criteria）是引擎的核心输入；
 *   · 指标不直接判分：样本分 = 各指标分算术平均，由维度按权重聚合而来。
 *
 * 交互：**裁判列表页**（新建/试跑/进入编辑）→ 编辑进入**维度与指标设置**详情页
 * （基本信息 / 维度与指标 / 判分提示词与变量·高级）。
 * 「试跑」：按维度选择对历史回答重判（判分引擎 deepeval，不跑被测 agent、不写台账）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, CardBody, CardHead, ErrorBox, Loading, Pill, Table } from '../components/ui'
import { Modal } from '../components/Modal'
import { JudgeCard } from '../components/eval/JudgeDetails'
import { DimEditor, NewDimModal, dimBody } from '../components/eval/DimEditor'
import { IndicatorsPanel, ScoringFormula } from '../components/eval/IndicatorsPanel'
import { useApp } from '../lib/app-context'
import {
  agentEvalApi, dimKeyOfDim, dimsOfJudge, JUDGE_LEGACY_ALIASES, JUDGE_OUT_VARS,
  JUDGE_PRESET_VARS, JUDGE_SYS_VARS, JUDGE_VAR_LIMIT, scanPromptVars,
  type EvalCase, type EvalDimension, type EvalIndicator, type EvalJudge, type EvalRejudgeResult, type EvalTask,
} from '../lib/agentEval'

const INPUT: CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6,
  fontSize: 13, background: 'var(--surface)', color: 'var(--text)', width: '100%',
  boxSizing: 'border-box',
}

/** 裁判全量更新载荷（后端 upsert 为全量语义，必须回填未改字段） */
function judgeBody(j: EvalJudge, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dim_id: j.dim_id, name: j.name, description: j.description ?? null, type: j.type,
    model: j.model, temperature: j.temperature, prompt: j.prompt, code_ref: j.code_ref,
    metric_type: j.metric_type || 'ternary', params: j.params ?? null, enabled: j.enabled, ...over,
  }
}

/**
 * 裁判的关联对象 = **测评任务**（用户评审：裁判在任务中通过下拉选择关联，不与应用例直接挂钩）：
 * 任务所选裁判 = 本裁判（judge_id；旧数据回退 judge 布尔），且未限定维度或所限维度与本裁判有交集。
 */
function assocTasksOf(tasks: EvalTask[], judgeDims: EvalDimension[], judgeId: string): EvalTask[] {
  const ids = new Set(judgeDims.map((d) => d.dim_id))
  return tasks.filter((t) => {
    const on = t.judge_id ? t.judge_id === judgeId : t.judge
    if (!on) return false
    return !t.dims?.length || t.dims.some((id) => ids.has(id))
  })
}

export function AgentEvalJudgesPage() {
  const { go, toast, nonce } = useApp()
  const [judges, setJudges] = useState<EvalJudge[] | null>(null)
  const [dims, setDims] = useState<EvalDimension[]>([])
  const [indicators, setIndicators] = useState<EvalIndicator[]>([])
  const [tasks, setTasks] = useState<EvalTask[]>([])
  const [error, setError] = useState<string | null>(null)
  /** 当前编辑的裁判（null = 列表视图） */
  const [detailId, setDetailId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [trying, setTrying] = useState<EvalJudge | null>(null)
  const [showIndicators, setShowIndicators] = useState(false)
  const [showRunDims, setShowRunDims] = useState(false)
  const [editingRunDim, setEditingRunDim] = useState<EvalDimension | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const [j, d, i, t] = await Promise.all([
        agentEvalApi.listJudges(),
        agentEvalApi.listDimensions(),
        agentEvalApi.listIndicators(),
        agentEvalApi.listTasks(),
      ])
      setJudges(j.items)
      setDims(d.items)
      setIndicators(i.items)
      setTasks(t.items)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, nonce])

  if (error) return <ErrorBox error={new Error(error)} />
  if (!judges) return <Loading />

  const detailJudge = detailId ? judges.find((j) => j.judge_id === detailId) || null : null
  const runDims = dims.filter((d) => d.level !== 'case')

  /* ── 详情视图 ── */
  if (detailJudge) {
    return (
      <>
        <JudgeDetail
          key={detailJudge.judge_id}
          judge={detailJudge}
          dims={dims}
          indicators={indicators}
          tasks={tasks}
          onBack={() => { setTrying(null); setDetailId(null) }}
          onTry={() => setTrying(detailJudge)}
          reload={load}
          toast={toast}
          onError={(m) => toast(m, 6000)}
        />
        {trying && (
          <TryJudgeModal
            judge={trying}
            dims={dimsOfJudge(dims, trying)}
            onClose={() => setTrying(null)}
            onJumpRun={(runId) => { setTrying(null); go('agenteval', { doc: runId }) }}
          />
        )}
      </>
    )
  }

  /* ── 列表视图 ── */
  return (
    <>
      <Card>
        <CardHead
          title="测评裁判"
          meta={
            <div className="toolbar" style={{ margin: 0 }}>
              <span className="hint">一个裁判 = 一个业务场景；维度是裁判内部的判定项</span>
              <button className="btn" onClick={() => setShowRunDims(true)}>运行级维度（闸门）</button>
              <button className="btn" onClick={() => setShowIndicators(true)}>指标与聚合口径</button>
              <button className="btn btn-primary" onClick={() => setCreating(true)}>+ 新建裁判</button>
            </div>
          }
        />
        <CardBody flush>
          <Table cols={[160, 0, 216, 96, 150, 60, 120]}>
            <thead>
              <tr>
                <th>裁判</th>
                <th>业务场景</th>
                <th>判分维度</th>
                <th>关联任务</th>
                <th>模型</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {judges.map((j) => {
                const myDims = dimsOfJudge(dims, j)
                const assoc = assocTasksOf(tasks, myDims, j.judge_id)
                return (
                  <tr key={j.judge_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{j.name}</div>
                      <div className="mono hint" style={{ fontSize: 11 }}>{j.judge_id}</div>
                    </td>
                    <td className="hint wrap">{j.description || <span style={{ color: 'var(--warn)' }}>未填场景说明</span>}</td>
                    <td className="wrap">
                      {myDims.length === 0 ? (
                        <span style={{ color: 'var(--warn)' }}>未挂维度——点「编辑」添加</span>
                      ) : (
                        myDims.map((d) => (
                          <span key={d.dim_id} className="pill plain" style={{ marginRight: 4, marginBottom: 2 }} title={`键 ${dimKeyOfDim(d)}`}>
                            {d.name}{!d.enabled && '（停用）'}{d.reverse && ' ↺'}
                          </span>
                        ))
                      )}
                    </td>
                    <td className="hint" title={assoc.length ? assoc.map((x) => x.name).join('、') : '判分开关开启的任务才引用裁判'}>
                      {assoc.length ? `${assoc.length} 个` : <span style={{ color: 'var(--warn)' }}>无</span>}
                    </td>
                    <td className="mono hint">{j.model || '—'}<span className="hint"> · T{j.temperature}</span></td>
                    <td>{j.enabled ? <Pill kind="ok">启用</Pill> : <Pill kind="plain">停用</Pill>}</td>
                    <td>
                      <button className="btn btn-mini" style={{ marginRight: 4 }} onClick={() => setTrying(j)}>试跑</button>
                      <button className="btn btn-mini" onClick={() => { setTrying(null); setDetailId(j.judge_id) }}>编辑</button>
                    </td>
                  </tr>
                )
              })}
              {judges.length === 0 && (
                <tr><td colSpan={7} className="hint">还没有裁判——点「+ 新建裁判」创建第一个业务场景。</td></tr>
              )}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      {/* 指标与聚合口径（US-15/16：聚合层管理与公式卡） */}
      {showIndicators && (
        <Modal
          title="指标与聚合口径"
          subtitle="指标是跨裁判的聚合层：维度挂到指标下参与样本分聚合"
          onClose={() => setShowIndicators(false)}
          width={900}
        >
          <IndicatorsPanel
            indicators={indicators}
            dims={dims}
            onChanged={(m) => { toast(m); void load() }}
            onError={(m) => toast(m, 6000)}
          />
          <div style={{ marginTop: 14 }}>
            <ScoringFormula indicators={indicators} dims={dims} />
          </div>
        </Modal>
      )}

      {/* 运行级维度（闸门）：不归属裁判，单独维护 */}
      {showRunDims && (
        <Modal
          title="运行级维度（闸门判定）"
          subtitle="运行结束时按这里的阈值给出整体结论；不参与样本分聚合、不归属裁判"
          onClose={() => setShowRunDims(false)}
          width={920}
        >
          <Table cols={[170, 130, 80, 90, 90, 70, 60, 70]}>
            <thead>
              <tr>
                <th>维度</th>
                <th>名称</th>
                <th>评分方式</th>
                <th>阈值</th>
                <th>权重</th>
                <th>一票否决</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {runDims.map((d) => (
                <tr key={d.dim_id}>
                  <td className="mono hint">{d.dim_id}</td>
                  <td>{d.name}</td>
                  <td className="hint">{d.score_type}</td>
                  <td className="num">{d.threshold == null ? '—' : `${(d.threshold * 100).toFixed(0)}%`}</td>
                  <td className="num hint">{d.weight}</td>
                  <td>{d.must_pass ? <Pill kind="danger">是</Pill> : <span className="hint">—</span>}</td>
                  <td>{d.enabled ? <Pill kind="ok">启用</Pill> : <Pill kind="plain">停用</Pill>}</td>
                  <td><button className="btn btn-mini" onClick={() => setEditingRunDim(d)}>编辑</button></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal>
      )}

      {editingRunDim && (
        <DimEditor
          initial={editingRunDim}
          indicators={indicators}
          onClose={() => setEditingRunDim(null)}
          onSaved={(msg) => { setEditingRunDim(null); toast(msg); void load() }}
          onError={(m) => toast(m, 6000)}
        />
      )}

      {creating && (
        <NewJudgeModal
          onClose={() => setCreating(false)}
          onSaved={(id) => { setCreating(false); setDetailId(id); toast('裁判已创建——接着添加判分维度') }}
          onError={(m) => toast(m, 6000)}
        />
      )}

      {trying && (
        <TryJudgeModal
          judge={trying}
          dims={dimsOfJudge(dims, trying)}
          onClose={() => setTrying(null)}
          onJumpRun={(runId) => { setTrying(null); go('agenteval', { doc: runId }) }}
        />
      )}
    </>
  )
}

/* ── 新建裁判 ────────────────────────────────────────────────────── */

function NewJudgeModal({
  onClose, onSaved, onError,
}: {
  onClose: () => void
  onSaved: (judgeId: string) => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return onError('裁判名称不能为空')
    setSaving(true)
    try {
      const id = `jdg-${Date.now().toString(36)}`
      await agentEvalApi.createJudge({
        judge_id: id, dim_id: '', name: name.trim(),
        description: description.trim() || null, type: 'llm',
        model: 'deepseek-v4-pro', temperature: 0, prompt: null, code_ref: null,
        metric_type: 'ternary', params: {}, enabled: true,
      })
      onSaved(id)
    } catch (e) {
      onError(`创建失败：${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="新建裁判"
      subtitle="一个裁判负责一个业务场景的测试（如「医疗安全审查」）；创建后进入维度与指标设置"
      onClose={onClose}
      width={560}
    >
      <div style={{ marginBottom: 10 }}>
        <div className="hint" style={{ marginBottom: 4 }}>裁判名称（= 业务场景名，≤20 字）</div>
        <input style={INPUT} value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="如：医疗安全审查" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="hint" style={{ marginBottom: 4 }}>场景说明（≤60 字：这个裁判负责判什么）</div>
        <input style={INPUT} value={description} maxLength={60} onChange={(e) => setDescription(e.target.value)} placeholder="如：高危症状是否有就医引导、有无危险建议" />
      </div>
      <div className="toolbar" style={{ margin: 0 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '创建中…' : '创建并进入设置'}
        </button>
        <button className="btn" onClick={onClose}>取消</button>
      </div>
    </Modal>
  )
}

/* ── 裁判详情（维度与指标设置）────────────────────────────────────── */

function JudgeDetail({
  judge, dims, indicators, tasks, onBack, onTry, reload, toast, onError,
}: {
  judge: EvalJudge
  dims: EvalDimension[]
  indicators: EvalIndicator[]
  tasks: EvalTask[]
  onBack: () => void
  onTry: () => void
  reload: () => Promise<void>
  toast: (msg: string, ms?: number) => void
  onError: (msg: string) => void
}) {
  const myDims = useMemo(() => dimsOfJudge(dims, judge), [dims, judge])
  const [editingDim, setEditingDim] = useState<EvalDimension | null>(null)
  const [addingDim, setAddingDim] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)

  /* 基本信息 */
  const [name, setName] = useState(judge.name)
  const [description, setDescription] = useState(judge.description ?? '')
  const [model, setModel] = useState(judge.model ?? 'deepseek-v4-pro')
  const [temperature, setTemperature] = useState(judge.temperature ?? 0)
  const [enabled, setEnabled] = useState(judge.enabled)
  const [saving, setSaving] = useState(false)
  const dirty = name !== judge.name || (description || '') !== (judge.description ?? '')
    || model !== (judge.model ?? '') || temperature !== (judge.temperature ?? 0) || enabled !== judge.enabled

  /* 提示词与变量（高级） */
  const [prompt, setPrompt] = useState(judge.prompt ?? '')
  const [customVars, setCustomVars] = useState<{ name: string; description: string }[]>(() => {
    const v = judge.params?.variables
    if (!Array.isArray(v)) return []
    return v.filter((x): x is { name: string; description: string } =>
      Boolean(x) && typeof x === 'object' && typeof (x as { name?: unknown }).name === 'string')
  })
  const [addingVar, setAddingVar] = useState(false)
  const [newVarName, setNewVarName] = useState('')
  const [newVarDesc, setNewVarDesc] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  const refs = useMemo(() => scanPromptVars(prompt), [prompt])
  const defined = useMemo(() => new Set<string>([
    ...JUDGE_SYS_VARS.map(([n]) => n),
    ...JUDGE_OUT_VARS.map(([n]) => n),
    ...JUDGE_PRESET_VARS.map(([n]) => n),
    ...customVars.map((v) => v.name),
    ...Object.keys(JUDGE_LEGACY_ALIASES),
  ]), [customVars])
  const undefinedRefs = refs.filter((r) => !defined.has(r))
  const totalVars = JUDGE_PRESET_VARS.length + customVars.length

  /** 关联测评任务（用户评审：裁判在任务中关联）——判分开启且维度范围与该裁判有交集的任务 */
  const assocTasks = useMemo(() => assocTasksOf(tasks, myDims, judge.judge_id), [tasks, myDims, judge.judge_id])

  const saveBasic = async () => {
    if (!name.trim()) return onError('裁判名称不能为空')
    setSaving(true)
    try {
      await agentEvalApi.updateJudge(judge.judge_id, judgeBody(judge, {
        name: name.trim(), description: description.trim() || null,
        model: model.trim() || 'deepseek-v4-pro', temperature: Number(temperature) || 0, enabled,
      }))
      toast('裁判已保存')
      await reload()
    } catch (e) {
      onError(`保存失败：${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const savePrompt = async () => {
    setSavingPrompt(true)
    try {
      const params: Record<string, unknown> = { ...(judge.params || {}) }
      if (customVars.length) params.variables = customVars
      else delete params.variables
      await agentEvalApi.updateJudge(judge.judge_id, judgeBody(judge, { prompt, params }))
      toast('提示词与变量已保存（下一轮运行 / 试跑生效）')
      await reload()
    } catch (e) {
      onError(`保存失败：${(e as Error).message}`)
    } finally {
      setSavingPrompt(false)
    }
  }

  const moveDim = async (dim: EvalDimension, dir: -1 | 1) => {
    const sibs = myDims
    const idx = sibs.findIndex((d) => d.dim_id === dim.dim_id)
    const neighbor = sibs[idx + dir]
    if (!neighbor) return
    try {
      await Promise.all([
        agentEvalApi.updateDimension(dim.dim_id, dimBody(dim, { sort_order: neighbor.sort_order })),
        agentEvalApi.updateDimension(neighbor.dim_id, dimBody(neighbor, { sort_order: dim.sort_order })),
      ])
      await reload()
    } catch (e) {
      onError(`排序失败：${(e as Error).message}`)
    }
  }

  const insertVar = (n: string) => {
    const token = `{{${n}}}`
    const el = taRef.current
    if (!el) {
      setPrompt((p) => p + token)
      return
    }
    const s = el.selectionStart ?? prompt.length
    const e = el.selectionEnd ?? s
    setPrompt(prompt.slice(0, s) + token + prompt.slice(e))
    requestAnimationFrame(() => {
      el.focus()
      const pos = s + token.length
      el.setSelectionRange(pos, pos)
    })
  }

  const indicatorName = (id: string | null | undefined) =>
    (id && indicators.find((i) => i.indicator_id === id)?.name) || (id ? id : '未分组')

  return (
    <>
      {/* 顶部：返回 + 标题 + 试跑 */}
      <div className="toolbar" style={{ margin: '0 0 12px' }}>
        <button className="btn" onClick={onBack}>← 返回裁判列表</button>
        <b style={{ fontSize: 15 }}>{judge.name}</b>
        <span className="mono hint">{judge.judge_id}</span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={onTry}>试跑</button>
      </div>

      {/* 基本信息 */}
      <Card>
        <CardHead title="基本信息" meta={<span className="hint">裁判 = 业务场景；名称与说明面向"测什么"</span>} />
        <CardBody>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0 14px' }}>
            <div style={{ marginBottom: 10 }}>
              <div className="hint" style={{ marginBottom: 4 }}>裁判名称（≤20 字）</div>
              <input style={INPUT} value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div className="hint" style={{ marginBottom: 4 }}>场景说明（≤60 字）</div>
              <input style={INPUT} value={description} maxLength={60} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 14px' }}>
            <div style={{ marginBottom: 10 }}>
              <div className="hint" style={{ marginBottom: 4 }}>裁判模型</div>
              <input style={INPUT} value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div className="hint" style={{ marginBottom: 4 }}>温度</div>
              <input
                style={INPUT} type="number" min={0} max={1} step={0.1}
                value={temperature} onChange={(e) => setTemperature(Number(e.target.value))}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div className="hint" style={{ marginBottom: 4 }}>状态</div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: '32px' }}>
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                启用
              </label>
            </div>
          </div>
          <div className="toolbar" style={{ margin: 0 }}>
            <button className="btn btn-primary" onClick={saveBasic} disabled={saving || !dirty}>
              {saving ? '保存中…' : '保存'}
            </button>
            {dirty && <span className="hint">有未保存的修改</span>}
          </div>
        </CardBody>
      </Card>

      {/* 维度与指标 */}
      <Card>
        <CardHead
          title="维度与指标"
          meta={<span className="hint">维度是裁判内部的判定项；挂到指标下参与样本分聚合（样本分 = 各指标分均值）</span>}
        />
        <CardBody>
          <div className="toolbar" style={{ margin: '0 0 8px' }}>
            <span className="hint">
              样例分按维度三态（通过 1.0 / 中性 0.5 / 失败 0.0）加权平均计算；改动只影响之后的运行
            </span>
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setAddingDim(true)}>+ 添加维度</button>
          </div>
          {myDims.length === 0 ? (
            <div className="hint" style={{ padding: '10px 0' }}>
              该裁判还没有判分维度——点「+ 添加维度」定义第一个判定项（如「就医引导是否正确」）。
            </div>
          ) : (
            myDims.map((d, i) => (
              <div className="ind-dim-row" key={d.dim_id}>
                <span className="mono hint" style={{ width: 18 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {d.name}
                    {d.reverse && <Pill kind="warn">反向</Pill>}
                    {!d.enabled && <Pill kind="plain">停用</Pill>}
                  </div>
                  <div className="hint" style={{ fontSize: 11.5, marginTop: 2 }}>
                    键 <span className="mono">{dimKeyOfDim(d)}</span> · 指标 {indicatorName(d.indicator_id)}
                    {d.criteria
                      ? <span> · 判定要点 {String(d.criteria).slice(0, 32)}…</span>
                      : <span style={{ color: 'var(--warn)' }}> · 判定要点为空（引擎将回退内置模板，仅四默认维度有）</span>}
                  </div>
                </div>
                <span className="hint" style={{ width: 64, textAlign: 'right' }}>权重 {d.weight}</span>
                <button className="btn btn-mini" title="上移" onClick={() => moveDim(d, -1)} disabled={i === 0}>↑</button>
                <button className="btn btn-mini" title="下移" onClick={() => moveDim(d, 1)} disabled={i === myDims.length - 1}>↓</button>
                <button className="btn btn-mini" onClick={() => setEditingDim(d)}>编辑</button>
              </div>
            ))
          )}
          {/* 关联对象 = 测评任务（用户评审：裁判在任务中关联，不与应用例直接挂钩） */}
          <div className="hint" style={{ marginTop: 10, lineHeight: 1.9 }}>
            {assocTasks.length === 0 ? (
              <>
                关联测评任务：<span style={{ color: 'var(--warn)' }}>尚未被任何任务引用</span>
                ——到「测评任务」创建/编辑任务并开启判分后，该裁判及其维度才参与判分。
              </>
            ) : (
              <>
                关联测评任务：该裁判在 <b>{assocTasks.length}</b> 个任务中生效
                {assocTasks.map((t) => (
                  <span
                    key={t.task_id}
                    className="pill plain"
                    style={{ margin: '0 6px' }}
                    title={`${t.task_id}${t.enabled ? '' : ' · 已停用'}${t.dims?.length ? ` · 指定维度 ${t.dims.length} 个` : ' · 全部维度'}`}
                  >
                    {t.name} · {t.dims?.length ? `指定 ${t.dims.length} 个维度` : '全部维度'}{!t.enabled && '（停用）'}
                  </span>
                ))}
                ——改动判定要点 / 权重会影响这些任务后续运行的判分（历史轮按快照解读）。
              </>
            )}
          </div>
        </CardBody>
      </Card>

      {/* 判分提示词与变量（高级） */}
      <Card>
        <CardHead
          title="判分提示词与变量"
          meta={
            <div className="toolbar" style={{ margin: 0 }}>
              <span className="hint">高级：平台判分以各维度「判定要点」为准；此处用于 CLI 链路与模板参考</span>
              <button className="btn btn-mini" onClick={() => setPromptOpen((v) => !v)}>
                {promptOpen ? '收起 ▴' : '展开 ▾'}
              </button>
            </div>
          }
        />
        {promptOpen && (
          <CardBody>
            <div className="var-panel">
              <div className="var-row">
                <span className="var-label">系统变量</span>
                <div className="var-chips">
                  {JUDGE_SYS_VARS.map(([n, d]) => (
                    <span key={n} className="var-chip ro" title={d}>{n}<em>{d}</em></span>
                  ))}
                  <span className="hint" style={{ fontSize: 11 }}>只读 · 运行时自动注入</span>
                </div>
              </div>
              <div className="var-row">
                <span className="var-label">输出变量</span>
                <div className="var-chips">
                  {JUDGE_OUT_VARS.map(([n, d]) => (
                    <span key={n} className="var-chip ro" title={d}>{n}<em>{d}</em></span>
                  ))}
                  <span className="hint" style={{ fontSize: 11 }}>裁判须产出该结构（三态判定协议）</span>
                </div>
              </div>
              <div className="var-row">
                <span className="var-label">自定义变量</span>
                <div className="var-chips">
                  {JUDGE_PRESET_VARS.map(([n, d]) => (
                    <button
                      key={n}
                      className={`var-chip${refs.includes(n) ? ' used' : ''}`}
                      title={`${d}（点击插入 {{${n}}}）`}
                      onClick={() => insertVar(n)}
                    >
                      {n}<em>{d}</em>
                    </button>
                  ))}
                  {customVars.map((v) => (
                    <span key={v.name} className={`var-chip${refs.includes(v.name) ? ' used' : ''}`}>
                      <button className="var-ins" title="点击插入" onClick={() => insertVar(v.name)}>{v.name}</button>
                      <em>{v.description || '自定义'}{!refs.includes(v.name) && '（未引用）'}</em>
                      <button
                        className="var-del" title="删除变量"
                        onClick={() => setCustomVars((xs) => xs.filter((x) => x.name !== v.name))}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {addingVar ? (
                    <span className="var-chip add">
                      <input
                        className="mini-input" style={{ width: 110, height: 24 }}
                        placeholder="变量名" value={newVarName} onChange={(e) => setNewVarName(e.target.value)}
                      />
                      <input
                        className="mini-input" style={{ width: 140, height: 24 }}
                        placeholder="说明（可选）" value={newVarDesc} onChange={(e) => setNewVarDesc(e.target.value)}
                      />
                      <button
                        className="btn btn-mini"
                        onClick={() => {
                          const n = newVarName.trim()
                          if (!/^[A-Za-z_][\w-]*$/.test(n)) return onError('变量名须为字母/下划线开头')
                          if (defined.has(n)) return onError(`变量名已存在：${n}`)
                          if (totalVars >= JUDGE_VAR_LIMIT) return onError(`变量总数已达上限（${JUDGE_VAR_LIMIT}）`)
                          setCustomVars((xs) => [...xs, { name: n, description: newVarDesc.trim() }])
                          setNewVarName(''); setNewVarDesc(''); setAddingVar(false)
                        }}
                      >
                        确定
                      </button>
                      <button className="btn btn-mini" onClick={() => { setAddingVar(false); setNewVarName(''); setNewVarDesc('') }}>取消</button>
                    </span>
                  ) : (
                    <button
                      className="btn btn-mini" onClick={() => setAddingVar(true)}
                      disabled={totalVars >= JUDGE_VAR_LIMIT}
                    >
                      + 添加自定义变量 ({totalVars}/{JUDGE_VAR_LIMIT})
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="hint" style={{ margin: '10px 0 4px' }}>判分标准（系统提示词；点击上方变量插入引用）</div>
            <textarea
              ref={taRef}
              style={{ ...INPUT, minHeight: 200, fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.6 }}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="var-scan">
              <span className="hint">引用检查：</span>
              {refs.length === 0 ? (
                <span className="hint">未引用任何变量</span>
              ) : (
                refs.map((r) => (
                  <span key={r} className={`var-ref ${defined.has(r) ? 'ok' : 'bad'}`}>{r}</span>
                ))
              )}
              {undefinedRefs.length > 0 && (
                <span className="var-warn">⚠ 未定义变量：{undefinedRefs.join('、')}——可保存，但运行时不会注入取值</span>
              )}
            </div>
            <div className="toolbar" style={{ margin: '12px 0 0' }}>
              <button className="btn btn-primary" onClick={savePrompt} disabled={savingPrompt}>
                {savingPrompt ? '保存中…' : '保存提示词'}
              </button>
            </div>
          </CardBody>
        )}
      </Card>

      {editingDim && (
        <DimEditor
          initial={editingDim}
          indicators={indicators}
          ownerLabel={judge.name}
          onClose={() => setEditingDim(null)}
          onSaved={(msg) => { setEditingDim(null); toast(msg); void reload() }}
          onError={onError}
        />
      )}

      {addingDim && (
        <NewDimModal
          judgeId={judge.judge_id}
          judgeName={judge.name}
          indicators={indicators}
          dims={dims}
          nextSort={() => (myDims.length ? Math.max(...myDims.map((s) => s.sort_order)) : 0) + 10}
          onClose={() => setAddingDim(false)}
          onSaved={(msg) => { setAddingDim(false); toast(msg); void reload() }}
          onError={onError}
        />
      )}
    </>
  )
}

/* ── 试跑（按维度对历史回答重判）────────────────────────────────── */

function TryJudgeModal({
  judge, dims, onClose, onJumpRun,
}: {
  judge: EvalJudge
  dims: EvalDimension[]
  onClose: () => void
  onJumpRun: (runId: string) => void
}) {
  const caseDims = useMemo(() => dims.filter((d) => d.level === 'case'), [dims])
  const [dimId, setDimId] = useState(() => {
    const first = caseDims.find((d) => d.enabled) || caseDims[0]
    return first?.dim_id || ''
  })
  const dim = caseDims.find((d) => d.dim_id === dimId) || null
  const dimKey = dim ? dimKeyOfDim(dim) : ''

  const [cases, setCases] = useState<EvalCase[] | null>(null)
  const [caseId, setCaseId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<EvalRejudgeResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!dimKey) {
      setCases([])
      return
    }
    let live = true
    setCases(null)
    setResult(null)
    agentEvalApi.listCases()
      .then((r) => {
        if (!live) return
        const candidates = r.items.filter((c) => c.judge && Boolean((c.judge as Record<string, unknown>)[dimKey]))
        setCases(candidates)
        setCaseId(candidates[0]?.case_id || '')
      })
      .catch((e) => live && setErr((e as Error).message))
    return () => { live = false }
  }, [dimKey])

  useEffect(() => {
    if (!busy) return
    const t = window.setInterval(() => setElapsed(Date.now() - startedAt), 500)
    return () => window.clearInterval(t)
  }, [busy, startedAt])

  const run = async () => {
    if (!caseId || !dim) return
    setBusy(true)
    setErr(null)
    setResult(null)
    setStartedAt(Date.now())
    setElapsed(0)
    try {
      const r = await agentEvalApi.tryJudge(judge.judge_id, caseId, undefined, dim.dim_id)
      setResult(r)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const currentCase = useMemo(() => cases?.find((c) => c.case_id === caseId), [cases, caseId])

  return (
    <Modal
      title={`裁判试跑 · ${judge.name}`}
      subtitle="由判分引擎（deepeval）按维度的判定要点对历史回答重新判分（不重跑智能体、不写台账）"
      onClose={onClose}
      width={860}
    >
      {caseDims.length === 0 ? (
        <div className="hint">
          该裁判还没有判分维度——先到编辑页「维度与指标」添加维度，并给用例配置对应判分要点后即可试跑。
        </div>
      ) : (
        <>
          <div className="toolbar" style={{ margin: 0, flexWrap: 'wrap', rowGap: 8 }}>
            <span className="hint">维度</span>
            <select
              style={{ ...INPUT, width: 220 }}
              value={dimId}
              onChange={(e) => setDimId(e.target.value)}
              disabled={busy}
            >
              {caseDims.map((d) => (
                <option key={d.dim_id} value={d.dim_id}>
                  {d.name}（{dimKeyOfDim(d)}）{!d.enabled ? ' · 停用' : ''}
                </option>
              ))}
            </select>
            <span className="hint">用例</span>
            <select
              style={{ ...INPUT, width: 340 }}
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              disabled={busy || !cases || cases.length === 0}
            >
              {(cases || []).map((c) => (
                <option key={c.case_id} value={c.case_id}>
                  {c.case_id} · {c.desc || c.message.slice(0, 24)}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={run} disabled={busy || !caseId}>
              {busy ? `判分中… ${Math.round(elapsed / 1000)}s` : '开始试跑'}
            </button>
          </div>
          {cases && cases.length === 0 && dim && (
            <div className="hint" style={{ marginTop: 8 }}>
              没有用例配置「{dim.name}（{dimKey}）」判分——到「测评用例」页给相关用例补上该判分要点。
            </div>
          )}
          {currentCase && (
            <div className="hint" style={{ marginTop: 8 }}>
              问答对：{currentCase.message}
            </div>
          )}

          {err && <div className="ce-err" style={{ marginTop: 10 }}>{err}</div>}

          {result && (
            <div style={{ marginTop: 14 }}>
              <div className="hint" style={{ marginBottom: 6 }}>
                来源回答：运行 <span className="mono">{result.source_run_id}</span>
                <button className="btn btn-mini" style={{ marginLeft: 8 }} onClick={() => onJumpRun(result.source_run_id)}>
                  查看来源运行
                </button>
                {result.engine && (
                  <span style={{ marginLeft: 10 }}>
                    引擎 {result.engine}
                    {result.elapsed_ms ? ` · ${Math.round(result.elapsed_ms / 1000)}s` : ''}
                  </span>
                )}
              </div>
              <div className="try-grid">
                <div>
                  <div className="ce-label hint">历史判分（该轮当时的判定要点）</div>
                  {result.prev ? (
                    <JudgeCard k={result.dim_key} v={result.prev} />
                  ) : (
                    <div className="hint">该轮未对该用例判分（可能 judge 关闭 / 维度当时未配置）</div>
                  )}
                </div>
                <div>
                  <div className="ce-label hint">本次判分（当前判定要点）</div>
                  {result.judge ? (
                    <JudgeCard k={result.dim_key} v={result.judge} />
                  ) : (
                    <div className="hint">未产出判分结果</div>
                  )}
                </div>
              </div>
              {result.prev && result.judge
                && (result.prev.verdict ?? (result.prev.pass ? 'pass' : 'fail'))
                  !== (result.judge.verdict ?? (result.judge.pass ? 'pass' : 'fail')) && (
                <div className="hint" style={{ marginTop: 8 }}>
                  ⚠ 判分结论发生变化——提示判定要点或回答表现有差异
                </div>
              )}
            </div>
          )}

          {!result && !busy && !err && (
            <div className="hint" style={{ marginTop: 10 }}>
              说明：取该用例最近一轮（或指定轮）的已有回答，交给当前维度配置重判；
              改完判定要点后不用整轮重跑即可验证判分行为。
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
