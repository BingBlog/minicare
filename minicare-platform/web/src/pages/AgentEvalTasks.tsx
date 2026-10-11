/**
 * 页面：测评任务（TECH-021 §6.3 + 2026-10-11 两轮用户评审）
 *
 * **本页 = 测评域的运营中枢**（发起 / 执行 / 记录三合一；「测评记录」页已并入）；
 * 布局为**主从联动**（2026-10-11 二次评审：呈现「任务 ↔ 记录」关联，而非罗列两个列表）：
 *   · 顶部「运行控制台」（条件出现）：阶段进度（执行中/判分中）＋实时结果＋中止＋查看报告；
 *   · **左列**：任务列表（含「全部记录」「手工发起」两个视角伪条目）——点选任务即筛选记录；
 *     每张任务卡内联配置摘要（Case 范围/维度/判分/轮次）与操作（发起运行/编辑/删除）；
 *   · **右列**：选中对象的运行记录——表头标明当前视角（任务名 + 轮数），非全部视角时隐藏
 *     「任务」列并提供「查看全部 →」回退；点击行打开该轮测评报告。
 * 创建任务时必须显式选择 Case 范围；刷新页面也能恢复控制台（检测后台运行中的轮次）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, CardBody, CardHead, Empty, ErrorBox, Loading, Pill, Table } from '../components/ui'
import { Modal } from '../components/Modal'
import { useApp } from '../lib/app-context'
import {
  agentEvalApi, deriveVerdict, EVAL_GROUPS, fmtDuration, fmtTime, groupLabel, identityText,
  priorityLabel, RUN_STATUS_LABEL, statusPillKind, tagLabel,
  VERDICT_PILL_KIND, VERDICT_PILL_TEXT, verdictShort,
  type EvalDimension, type EvalJudge, type EvalProgress, type EvalRunMeta, type EvalRuntimeCtx,
  type EvalTask, type EvalTaskScope,
} from '../lib/agentEval'

const INPUT: CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6,
  fontSize: 13, background: 'var(--surface)', color: 'var(--text)', width: '100%',
  boxSizing: 'border-box',
}

/** 记录表默认展示条数（超出给「展开其余」按钮，避免页尾过长） */
const RECORD_LIMIT = 20

function scopeSummary(s: EvalTaskScope | undefined): string {
  if (!s || s.all) return '全部'
  const parts: string[] = []
  if (s.groups?.length) parts.push(`组 ${s.groups.map((g) => groupLabel(g)).join('+')}`)
  if (s.tags?.length) parts.push(`标签 ${s.tags.map((t) => tagLabel(t)).join('+')}`)
  if (s.priorities?.length) parts.push(`优先级 ${s.priorities.map((p) => priorityLabel(p)).join('+')}`)
  if (s.ids?.length) parts.push(`指定 ${s.ids.length} 条`)
  return parts.join(' · ') || '全部'
}

/** 历轮趋势（US-19）：通过率 sparkline（最近 ≤10 轮；左旧 → 右新，悬停看单轮值） */
function PassTrend({ runs }: { runs: { r: EvalRunMeta }[] }) {
  const pts = runs
    .filter(({ r }) => r.summary && r.summary.total > 0)
    .slice(0, 10)
    .reverse()
  if (pts.length < 2) {
    return (
      <div className="hint">
        通过率趋势：再跑 {2 - pts.length} 轮后显示（取最近 10 轮；每轮通过数与总数为准）
      </div>
    )
  }
  const W = 280
  const H = 36
  const xs = (i: number) => 6 + (i * (W - 12)) / (pts.length - 1)
  const ys = (rate: number) => H - 7 - rate * (H - 14)
  const rateOf = ({ r }: { r: EvalRunMeta }) => (r.summary!.passed / r.summary!.total)
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(rateOf(p)).toFixed(1)}`).join(' ')
  const last = rateOf(pts[pts.length - 1])
  const first = rateOf(pts[0])
  const diff = Math.round((last - first) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="通过率趋势">
        <title>通过率趋势（最近 {pts.length} 轮）</title>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
        {pts.map((p, i) => (
          <circle key={p.r.run_id} cx={xs(i)} cy={ys(rateOf(p))} r="3.2" fill="var(--accent)">
            <title>{`${fmtTime(p.r.created_at)} · 通过 ${p.r.summary!.passed}/${p.r.summary!.total}（${Math.round(rateOf(p) * 100)}%）`}</title>
          </circle>
        ))}
      </svg>
      <span className="hint">
        最近 {pts.length} 轮通过率：<b style={{ color: 'var(--text)' }}>{Math.round(last * 100)}%</b>
        {pts.length > 1 && (diff > 0 ? `（较首轮 +${diff}pp）` : diff < 0 ? `（较首轮 ${diff}pp）` : '（与首轮持平）')}
      </span>
    </div>
  )
}

/** 主从联动选中对象：全部记录 / 某任务 / 手工发起（无任务归属） */
type Sel = { kind: 'all' } | { kind: 'task'; id: string } | { kind: 'adhoc' }

export function AgentEvalTasksPage() {
  const { toast, go, nonce } = useApp()
  const [items, setItems] = useState<EvalTask[] | null>(null)
  const [dims, setDims] = useState<EvalDimension[]>([])
  const [runs, setRuns] = useState<EvalRunMeta[] | null>(null)
  const [judges, setJudges] = useState<EvalJudge[]>([])
  /** 全局运行身份（用户信息；任务创建时展示一次，来源 = 平台全局配置） */
  const [globalCtx, setGlobalCtx] = useState<EvalRuntimeCtx | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EvalTask | 'new' | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  /* ── 主从联动：左列选中对象（任务 ↔ 其记录）＋ 记录展开 ── */
  const [sel, setSel] = useState<Sel>({ kind: 'all' })
  const [showAllRuns, setShowAllRuns] = useState(false)

  /* ── 运行控制台（发起 + 执行 + 中止）── */
  const [consoleRun, setConsoleRun] = useState<{ id: string; label: string } | null>(null)
  const [progress, setProgress] = useState<EvalProgress | null>(null)
  const [finished, setFinished] = useState(false)
  const [confirmAbort, setConfirmAbort] = useState(false)

  const load = useCallback(async () => {
    try {
      setError(null)
      const [t, d, r, j, c] = await Promise.all([
        agentEvalApi.listTasks(),
        agentEvalApi.listDimensions(),
        agentEvalApi.listRuns(100),
        agentEvalApi.listJudges(),
        agentEvalApi.getCtx(),
      ])
      setItems(t.items)
      setDims(d.items)
      setRuns(r.items)
      setJudges(j.items)
      setGlobalCtx(c)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, nonce])

  /** 刷新页面/切页回来：若后台有运行中的轮次，恢复控制台（继续看进度） */
  useEffect(() => {
    let live = true
    agentEvalApi.overview()
      .then((ov) => {
        if (!live) return
        if (ov.latest?.status === 'running') {
          setConsoleRun((cur) => cur ?? { id: ov.latest!.run_id, label: ov.latest!.scope_label || '' })
        }
      })
      .catch(() => { /* 概览不可用时静默 */ })
    return () => { live = false }
  }, [nonce])

  /** 控制台轮询（2s）；结束自动收尾并刷新任务列表 */
  useEffect(() => {
    if (!consoleRun || finished) return
    let stop = false
    let timer: number | undefined
    const tick = async () => {
      try {
        const p = await agentEvalApi.progress(consoleRun.id)
        setProgress(p)
        if (p.status !== 'running') {
          setFinished(true)
          toast(`运行结束：${RUN_STATUS_LABEL[p.status] || p.status}（${consoleRun.id}）`)
          void load()
          return
        }
      } catch {
        /* 轮询失败（服务重启窗口等）静默重试 */
      }
      if (!stop) timer = window.setTimeout(tick, 2000)
    }
    timer = window.setTimeout(tick, 500)
    return () => {
      stop = true
      if (timer) window.clearTimeout(timer)
    }
  }, [consoleRun, finished, load, toast])

  const busy = Boolean(consoleRun && !finished)

  const run = async (t: EvalTask) => {
    if (busy) return
    setRunningId(t.task_id)
    try {
      const r = await agentEvalApi.runTask(t.task_id)
      toast(`任务「${t.name}」已发起：${r.run_id}（${r.case_count} 条用例）`)
      setProgress(null)
      setFinished(false)
      setConfirmAbort(false)
      setConsoleRun({ id: r.run_id, label: `任务「${t.name}」` })
      setSel({ kind: 'task', id: t.task_id })  // 联动：右侧记录切到该任务（新记录完成后可见）
      void load()
    } catch (e) {
      toast(`发起失败：${(e as Error).message}`, 7000)
    } finally {
      setRunningId(null)
    }
  }

  const abort = async () => {
    if (!consoleRun) return
    if (!confirmAbort) {
      setConfirmAbort(true)
      window.setTimeout(() => setConfirmAbort(false), 4000)
      return
    }
    setConfirmAbort(false)
    try {
      await agentEvalApi.cancel(consoleRun.id)
      toast('已请求中止，等待进程退出…')
    } catch (e) {
      toast(`中止失败：${(e as Error).message}`, 6000)
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
      if (sel.kind === 'task' && sel.id === t.task_id) setSel({ kind: 'all' })
      void load()
    } catch (e) {
      toast(`删除失败：${(e as Error).message}`, 6000)
    }
  }

  /* ── 主从联动派生（选中对象 / 记录过滤 / 展开 / 任务名）── */
  const taskName = useCallback((id: string | null) => {
    if (!id) return '—'
    return (items ?? []).find((t) => t.task_id === id)?.name || id
  }, [items])

  const verdicts = useMemo(
    () => (runs ? runs.map((r) => deriveVerdict(r)) : []),
    [runs],
  )

  const adhocCount = useMemo(() => (runs ?? []).filter((r) => !r.task_id).length, [runs])

  const selectedTask = useMemo(
    () => (sel.kind === 'task' ? (items ?? []).find((t) => t.task_id === sel.id) ?? null : null),
    [sel, items],
  )

  /** 选中的任务被删 / 不存在 → 回落「全部记录」（渲染前守卫） */
  useEffect(() => {
    if (sel.kind === 'task' && items && !items.some((t) => t.task_id === sel.id)) {
      setSel({ kind: 'all' })
    }
  }, [sel, items])

  /** 切换选中对象 → 记录列表重置为「默认 20 条」展开态 */
  useEffect(() => {
    setShowAllRuns(false)
  }, [sel])

  const filteredRuns = useMemo(() => {
    const tagged = (runs ?? []).map((r, i) => ({ r, v: verdicts[i] }))
    if (sel.kind === 'all') return tagged
    if (sel.kind === 'adhoc') return tagged.filter(({ r }) => !r.task_id)
    return tagged.filter(({ r }) => r.task_id === sel.id)
  }, [runs, verdicts, sel])

  const shownRuns = showAllRuns ? filteredRuns : filteredRuns.slice(0, RECORD_LIMIT)
  /** 记录表「任务」列仅在全部视图显示（看单个任务时该列冗余） */
  const showTaskCol = sel.kind === 'all'
  /** 任务 × 裁判的关联展示名（C11：裁判在任务中以下拉选择关联；'' → 不启用判分） */
  const judgeNameOf = useCallback((t: EvalTask) => {
    if (!t.judge_id) return '不启用'
    return judges.find((j) => j.judge_id === t.judge_id)?.name || t.judge_id
  }, [judges])

  if (error) return <ErrorBox error={new Error(error)} />
  if (!items) return <Loading />

  return (
    <>
      {/* 运行控制台：发起后（或检测到后台运行中）在此看进度 / 中止 / 跳报告 */}
      {consoleRun && (
        <Card>
          <CardHead
            title={`运行控制台 · ${consoleRun.id}`}
            meta={
              progress
                ? (progress.phase === 'scoring'
                  ? `判分 ${progress.scoring_done ?? 0}/${progress.scoring_total || '?'}`
                  : `${progress.done ?? 0}/${progress.total || '?'}`) + ` · 已用 ${fmtDuration(progress.elapsed_ms)}`
                : '正在读取进度…'
            }
          />
          <CardBody>
            {finished ? (
              <div className="toolbar" style={{ margin: 0 }}>
                <Pill kind={statusPillKind(progress?.status || 'completed')}>
                  {RUN_STATUS_LABEL[progress?.status || 'completed'] || progress?.status || '已完成'}
                </Pill>
                <span className="hint">{consoleRun.label && `${consoleRun.label} · `}{consoleRun.id}</span>
                <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => go('agenteval', { doc: consoleRun.id })}>
                  查看报告
                </button>
                <button className="btn" onClick={() => { setConsoleRun(null); setProgress(null); setFinished(false) }}>
                  关闭
                </button>
              </div>
            ) : (
              <>
                <div style={{ height: 10, borderRadius: 5, background: 'var(--line)', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: progress?.phase === 'scoring'
                        ? `${progress?.scoring_total ? Math.min(100, Math.round(((progress.scoring_done ?? 0) / progress.scoring_total) * 100)) : 3}%`
                        : `${progress?.total ? Math.min(100, Math.round(((progress.done ?? 0) / progress.total) * 100)) : 3}%`,
                      background: 'var(--accent)',
                      transition: 'width .3s ease',
                    }}
                  />
                </div>
                {progress?.phase === 'scoring' ? (
                  <div style={{ margin: '8px 0', fontSize: 13 }}>
                    <b>判分中</b>（deepeval 引擎）：<b>{progress.scoring_done ?? 0}/{progress.scoring_total || '?'}</b>
                    <span className="hint"> · 对存量结果逐例判分，不重跑执行</span>
                  </div>
                ) : (
                  <div style={{ margin: '8px 0', fontSize: 13 }}>
                    当前执行：<b>{progress?.current || '准备中…'}</b>
                    {progress?.current_desc ? <span className="hint"> · {progress.current_desc}</span> : null}
                    {progress?.passed != null && progress?.done != null && progress.done > 0
                      ? ` ｜ 已通过 ${progress.passed}/${progress.done}` : ''}
                  </div>
                )}
                {progress && progress.recent.length > 0 && (
                  <div className="hint" style={{ lineHeight: 2 }}>
                    实时结果：
                    {progress.recent.map((r) => (
                      <span key={r.id} className={`pill ${r.pass ? 'ok' : 'danger'}`} style={{ marginRight: 6 }}>
                        {r.pass ? '✓' : '✗'} {r.id}
                      </span>
                    ))}
                  </div>
                )}
                <div className="toolbar" style={{ margin: '10px 0 0' }}>
                  <button className={confirmAbort ? 'btn btn-danger' : 'btn'} onClick={abort}>
                    {confirmAbort ? '确认中止？' : '中止运行'}
                  </button>
                  <span className="hint">中止后已完成用例的结果会保留；可离开本页，运行在后台继续</span>
                  <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => go('agenteval', { doc: consoleRun.id })}>
                    查看报告
                  </button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      )}

      {/* 主从联动（2026-10-11 评审：呈现「任务 ↔ 记录」关联而非罗列两个列表）：
          左 = 任务列表（选中即筛）＋「全部记录 / 手工发起」视角；右 = 选中对象的运行记录 */}
      <div className="task-layout">
        {/* 左列：测评任务 */}
        <div className="task-col">
          <div className="toolbar" style={{ margin: 0 }}>
            <b style={{ fontSize: 13 }}>测评任务</b>
            <button className="btn btn-mini" style={{ marginLeft: 'auto' }} onClick={() => setEditing('new')}>
              ＋ 新建任务
            </button>
          </div>

          {/* 伪条目：全部记录（跨任务台账，含手工发起） */}
          <div
            className={`task-item${sel.kind === 'all' ? ' active' : ''}`}
            onClick={() => setSel({ kind: 'all' })}
          >
            <div className="nm">全部记录</div>
            <div className="ds">跨任务台账 · 共 {runs?.length ?? '…'} 轮</div>
          </div>

          {items.length === 0 && (
            <div className="hint" style={{ padding: '2px 2px' }}>
              还没有任务——任务把「测评 Case 范围 × 维度子集 × 裁判开关 × 轮次」存成可复刻的配置。
            </div>
          )}

          {items.map((t) => {
            const active = sel.kind === 'task' && sel.id === t.task_id
            return (
              <div
                key={t.task_id}
                className={`task-item${active ? ' active' : ''}`}
                onClick={() => setSel({ kind: 'task', id: t.task_id })}
                title="点击查看该任务的运行记录"
              >
                <div className="nm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {t.name}
                  {t.last_run && (
                    <Pill kind={statusPillKind(t.last_run.status)}>
                      {RUN_STATUS_LABEL[t.last_run.status] || t.last_run.status}
                    </Pill>
                  )}
                </div>
                <div className="ds mono" style={{ fontSize: 11 }}>{t.task_id}</div>
                <div className="ds">
                  {scopeSummary(t.scope)} · 维度{t.dims?.length ? `${t.dims.length}个` : '全部'} · 判分 {judgeNameOf(t)} · {t.runs_n} 轮/次
                </div>
                <div className="ds">
                  {t.run_count ? `${t.run_count} 次运行 · 最近 ${t.last_run ? fmtTime(t.last_run.created_at) : '—'}` : '还没有运行过'}
                </div>
                <div className="task-item-actions">
                  <button
                    className="btn btn-primary"
                    disabled={runningId !== null || busy}
                    title={busy ? '已有运行进行中' : '发起一轮运行'}
                    onClick={(e) => { e.stopPropagation(); void run(t) }}
                  >
                    {runningId === t.task_id ? '发起中…' : busy ? '运行中…' : '发起运行'}
                  </button>
                  <button className="btn" onClick={(e) => { e.stopPropagation(); setEditing(t) }}>编辑</button>
                  <button
                    className={confirmDel === t.task_id ? 'btn btn-danger' : 'btn'}
                    onClick={(e) => { e.stopPropagation(); void remove(t) }}
                  >
                    {confirmDel === t.task_id ? '确认删？' : '删除'}
                  </button>
                </div>
              </div>
            )
          })}

          {adhocCount > 0 && (
            <div
              className={`task-item${sel.kind === 'adhoc' ? ' active' : ''}`}
              onClick={() => setSel({ kind: 'adhoc' })}
              title="没有任务归属的历史运行（手工发起）"
            >
              <div className="nm">手工发起</div>
              <div className="ds">无任务归属 · 共 {adhocCount} 轮</div>
            </div>
          )}
        </div>

        {/* 右列：选中对象的运行记录 */}
        <div>
          <Card>
            <CardHead
              title="运行记录"
              meta={
                <div className="toolbar" style={{ margin: 0 }}>
                  <span className="hint">
                    {sel.kind === 'all'
                      ? `全部任务 · 共 ${filteredRuns.length} 轮（含手工发起）`
                      : sel.kind === 'adhoc'
                        ? `「手工发起」· 共 ${filteredRuns.length} 轮`
                        : `任务「${selectedTask?.name ?? sel.id}」· 共 ${filteredRuns.length} 轮`}
                    {' · '}时间倒序，点击行打开报告
                  </span>
                  {sel.kind !== 'all' && (
                    <button className="btn btn-mini" onClick={() => setSel({ kind: 'all' })}>查看全部 →</button>
                  )}
                </div>
              }
            />
            {sel.kind === 'task' && filteredRuns.length > 0 && (
              <div style={{ padding: '10px 16px 2px' }}>
                <PassTrend runs={filteredRuns} />
              </div>
            )}
            <CardBody flush>
              {runs === null ? (
                <div className="hint" style={{ padding: '14px 16px' }}>加载中…</div>
              ) : filteredRuns.length === 0 ? (
                <Empty
                  title={
                    sel.kind === 'task' ? '该任务还没有运行记录'
                      : runs.length === 0 ? '还没有运行记录' : '没有匹配的记录'
                  }
                >
                  {sel.kind === 'task'
                    ? '点左侧该任务卡的「发起运行」开始第一轮，完成后记录会出现在这里。'
                    : runs.length === 0
                      ? '点左侧任一任务卡的「发起运行」开始第一轮测评。'
                      : '换个视角看看。'}
                </Empty>
              ) : (
                <>
                  <Table cols={showTaskCol ? [110, 130, 130, 76, 76, 84, 92, 80, 70, 60] : [110, 150, 76, 76, 84, 92, 80, 70, 60]}>
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>范围</th>
                        {showTaskCol && <th>任务</th>}
                        <th>裁判判分</th>
                        <th>通过率</th>
                        <th>P0（关键）</th>
                        <th>结论</th>
                        <th>状态</th>
                        <th className="num">耗时</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {shownRuns.map(({ r, v }) => (
                        <tr
                          key={r.run_id}
                          onClick={() => go('agenteval', { doc: r.run_id })}
                          style={{ cursor: 'pointer' }}
                          title={`打开报告 ${r.run_id}`}
                        >
                          <td className="mono">{fmtTime(r.created_at)}</td>
                          <td className="wrap">
                            {r.scope_label}
                            {r.env_snapshot?.retry_of && (
                              <span
                                className="tag"
                                style={{ marginLeft: 4 }}
                                title={`重跑自 ${r.env_snapshot.retry_of} 的失败用例集`}
                              >
                                重跑
                              </span>
                            )}
                          </td>
                          {showTaskCol && (
                            <td className="hint" title={r.task_id || ''}>{r.task_id ? taskName(r.task_id) : '手工'}</td>
                          )}
                          <td className="hint">{r.judge ? '开' : '关'}</td>
                          <td>{r.summary ? `${r.summary.passed}/${r.summary.total}` : '—'}</td>
                          <td className="hint">{r.summary?.p0 != null ? `${r.summary.p0Pass}/${r.summary.p0}` : '—'}</td>
                          <td>
                            <span title={verdictShort(v)}>
                              <Pill kind={VERDICT_PILL_KIND[v.kind]}>{VERDICT_PILL_TEXT[v.kind]}</Pill>
                            </span>
                          </td>
                          <td>
                            <Pill kind={statusPillKind(r.status)}>{RUN_STATUS_LABEL[r.status] || r.status}</Pill>
                          </td>
                          <td className="num">{fmtDuration(r.duration_ms)}</td>
                          <td className="hint">打开 ▸</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {!showAllRuns && filteredRuns.length > RECORD_LIMIT && (
                    <div className="toolbar" style={{ margin: 0, padding: '10px 16px' }}>
                      <button className="btn" onClick={() => setShowAllRuns(true)}>
                        展开其余 {filteredRuns.length - RECORD_LIMIT} 条 ▾
                      </button>
                      <span className="hint">默认展示最近 {RECORD_LIMIT} 条</span>
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {editing !== null && (
        <TaskEditor
          initial={editing === 'new' ? null : editing}
          dims={dims}
          judges={judges}
          identity={globalCtx}
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
  initial, dims, judges, identity, onClose, onSaved, onError,
}: {
  initial: EvalTask | null
  dims: EvalDimension[]
  /** 可关联的裁判清单（C11：任务编辑器下拉选择） */
  judges: EvalJudge[]
  /** 全局运行身份（用户信息，18:26 用户评审：创建任务时集中可见；来源=平台全局配置） */
  identity: EvalRuntimeCtx | null
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const isNew = initial === null
  const [taskId, setTaskId] = useState(initial?.task_id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  /** 测评 Case 范围（必选）：all=全部用例 / filter=按条件筛选；新建无默认，强制显式选择 */
  const [scopeKind, setScopeKind] = useState<'all' | 'filter' | ''>(
    initial ? (initial.scope?.all ? 'all' : 'filter') : '',
  )
  const [groups, setGroups] = useState<string[]>(initial?.scope?.groups ?? [])
  const [tags, setTags] = useState((initial?.scope?.tags ?? []).join(','))
  const [priorities, setPriorities] = useState<string[]>(initial?.scope?.priorities ?? [])
  const [ids, setIds] = useState((initial?.scope?.ids ?? []).join(','))
  const [dimIds, setDimIds] = useState<string[]>(initial?.dims ?? [])
  /** 关联裁判（C11 用户评审：下拉选择；'' = 不启用判分）；新建默认选首个启用裁判 */
  const [judgeId, setJudgeId] = useState<string>(
    initial ? (initial.judge_id ?? '') : (judges.find((j) => j.enabled)?.judge_id ?? judges[0]?.judge_id ?? ''),
  )
  const [runsN, setRunsN] = useState(initial?.runs_n ?? 1)
  const [note, setNote] = useState(initial?.note ?? '')
  const [saving, setSaving] = useState(false)

  const toggleIn = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const save = async () => {
    if (isNew && !/^task-[a-z0-9-]+$/.test(taskId.trim())) return onError('task_id 需形如 task-xxx（小写字母/数字/连字符）')
    if (!name.trim()) return onError('请填写任务名称')
    if (!scopeKind) return onError('请选择测评 Case 范围（全部用例 / 按条件筛选）')
    const scope: EvalTaskScope = scopeKind === 'all'
      ? { all: true }
      : {
          groups: groups.length ? groups : undefined,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean).length
            ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
          priorities: priorities.length ? priorities : undefined,
          ids: ids.split(',').map((t) => t.trim()).filter(Boolean).length
            ? ids.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        }
    if (scopeKind === 'filter' && !scope.groups && !scope.tags && !scope.priorities && !scope.ids) {
      return onError('按条件筛选时至少选一个条件（组 / 标签 / 优先级 / 指定用例）')
    }
    const payload = {
      name, scope, dims: dimIds.length ? dimIds : null,
      judge_id: judgeId || null, runs_n: runsN, note: note || null, enabled: true,
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
      {row('测评 Case 范围（必选）', (
        <div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 14 }}>
            <input type="radio" checked={scopeKind === 'all'} onChange={() => setScopeKind('all')} />
            全部用例
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input type="radio" checked={scopeKind === 'filter'} onChange={() => setScopeKind('filter')} />
            按条件筛选
          </label>
          {scopeKind === '' && (
            <span className="hint" style={{ marginLeft: 10, color: 'var(--warn)' }}>请选择范围——任务发起时必须知道测哪些 Case</span>
          )}
          {scopeKind === 'filter' && (
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
                  placeholder="capability,safety,realdata,regression"
                />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 10 }} title="回归集 = tagged regression 的用例集合（US-18 飞轮）">
                  <input
                    type="checkbox"
                    checked={tags.split(',').map((t) => t.trim()).includes('regression')}
                    onChange={(e) => {
                      const list = tags.split(',').map((t) => t.trim())
                        .filter(Boolean).filter((t) => t !== 'regression')
                      if (e.target.checked) list.push('regression')
                      setTags(list.join(','))
                    }}
                  />
                  回归集（regression）
                </label>
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
      {row('关联裁判（判分）', (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select style={{ ...INPUT, width: 300 }} value={judgeId} onChange={(e) => setJudgeId(e.target.value)}>
            <option value="">不启用判分（只跑确定性断言）</option>
            {judges.map((j) => (
              <option key={j.judge_id} value={j.judge_id}>
                {j.name}{j.enabled ? '' : '（已停用）'}
              </option>
            ))}
          </select>
          {judges.length === 0 ? (
            <span className="hint" style={{ color: 'var(--warn)' }}>还没有裁判——到「测评裁判」页创建</span>
          ) : (
            <span className="hint">
              {judges.find((j) => j.judge_id === judgeId)?.description || '该任务不启用主观判分'}
            </span>
          )}
        </div>
      ), '下拉选择此任务关联的裁判；维度与判定要点在「测评裁判」页维护')}
      {/* 运行身份（全局）：创建任务时集中可见——用户信息由平台全局配置统一提供，不在用例里设置 */}
      {row('运行身份（全局）', (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 12 }}>{identityText(identity?.ctx)}</span>
          <span className="hint">用户信息（userId / familyId / babyId）由平台全局配置统一提供、运行时自动注入，无需在每个用例里设置；调整请到「全局配置」页</span>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0 16px' }}>
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
