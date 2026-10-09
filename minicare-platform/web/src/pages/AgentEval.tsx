/**
 * 页面：Agent 测评（PRD-010 + TECH-022）—— 总览 · 发起 · 用例钻取。
 *
 * 视图约定：
 *   · `?page=agenteval`             → 跟随最新一轮运行；
 *   · `?page=agenteval&doc=<run>`   → 查看指定轮（历史页跳进来），`doc` 参数承接 run_id；
 *   · `?page=agentevalhistory`      → 历史列表。
 *
 * TECH-022 落地：
 *   · A1 结论 Banner（达标/未达标/未完整覆盖三态 + 失败用例速览，点击定位）
 *   · A2 指标卡三态（pass/fail/na），「硬幻觉率」显示真实幻觉率
 *   · A4 用例表补组筛选 + 搜索；A7 任意轮可看「较上轮」delta（升级为卡片）
 *   · A9 运行中单焦点视图（不再堆叠加空的详情卡）；B3 钻取证据链；B4 报告导出；B7 ETA 动态估算
 *   · 运行中靠 2s 轮询 `/progress` 刷新；结束后自动拉最终详情与 delta。
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardBody, CardHead, Empty, ErrorBox, KpiCard, KV, Loading, Notice, Pill, Table } from '../components/ui'
import { useApp } from '../lib/app-context'
import { CaseEvidence } from '../components/eval/CaseEvidence'
import { exportRun } from '../lib/evalExport'
import {
  agentEvalApi, deriveVerdict, EVAL_GROUPS, fmtDuration, fmtTime, gateState, groupLabel,
  priorityLabel, RUN_STATUS_LABEL, STAGE_LABEL, statusPillKind, type EvalDelta, type EvalEstimate,
  type EvalProgress, type EvalRunDetail, type EvalRunMeta,
} from '../lib/agentEval'

export function AgentEvalPage() {
  const { doc, go, toast, nonce } = useApp()
  const [overview, setOverview] = useState<{ latest: EvalRunMeta | null; recent: EvalRunMeta[] } | null>(null)
  const [health, setHealth] = useState<{ ok: boolean; issues: string[] } | null>(null)
  const [detail, setDetail] = useState<EvalRunDetail | null>(null)
  const [progress, setProgress] = useState<EvalProgress | null>(null)
  const [delta, setDelta] = useState<EvalDelta | null>(null)
  const [estimate, setEstimate] = useState<EvalEstimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 发起参数
  const [scopeKind, setScopeKind] = useState<'all' | 'group' | 'ids'>('all')
  const [group, setGroup] = useState('l1')
  const [idsText, setIdsText] = useState('')
  const [judge, setJudge] = useState(true)
  const [runsN, setRunsN] = useState(1)
  const [starting, setStarting] = useState(false)

  // 用例表交互
  const [caseFilter, setCaseFilter] = useState<'all' | 'fail' | 'p0'>('all')
  const [grpFilter, setGrpFilter] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const viewingRunId = doc || overview?.latest?.run_id || null
  const run = detail
  /** 所查看的这一轮在跑（决定是否轮询 / 显示进度卡） */
  const viewedRunning = progress?.status === 'running' || run?.status === 'running'
  /** 任意一轮在跑（决定发起按钮禁用）；含「后台在跑但正在看旧轮」的场景 */
  const anyRunning = viewedRunning || overview?.latest?.status === 'running'
  const bgRunning = !viewedRunning && overview?.latest?.status === 'running'
  const showingStale = Boolean(doc && overview?.latest?.run_id && doc !== overview.latest.run_id)

  /* ── 数据加载 ── */
  const reload = useCallback(async () => {
    try {
      setLoadError(null)
      const ov = await agentEvalApi.overview()
      setOverview(ov)
      const target = doc || ov.latest?.run_id
      setDetail(target ? await agentEvalApi.runDetail(target) : null)
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [doc])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload, nonce])

  useEffect(() => {
    void agentEvalApi.health().then(setHealth).catch(() => setHealth(null))
  }, [nonce, anyRunning])

  /* ── 运行中轮询（2s），结束自动收尾（只轮询“正在看的这一轮”）── */
  useEffect(() => {
    if (!viewedRunning) return
    let stop = false
    let timer: number | undefined
    const rid = viewingRunId
    const tick = async () => {
      try {
        if (rid) {
          const p = await agentEvalApi.progress(rid)
          setProgress(p)
          if (p.status !== 'running') {
            const [d, ov] = await Promise.all([agentEvalApi.runDetail(rid), agentEvalApi.overview()])
            setDetail(d)
            setOverview(ov)
            setProgress(null)
            toast(`运行结束：${RUN_STATUS_LABEL[p.status] || p.status}（${rid}）`)
            return
          }
        }
        setOverview(await agentEvalApi.overview())
      } catch {
        /* 轮询失败（服务重启窗口等）静默重试 */
      }
      if (!stop) timer = window.setTimeout(tick, 2000)
    }
    timer = window.setTimeout(tick, 800)
    return () => {
      stop = true
      if (timer) window.clearTimeout(timer)
    }
  }, [viewedRunning, viewingRunId, toast])

  /* ── 较上轮 delta（任意轮可查；运行中不查）── */
  useEffect(() => {
    if (!viewingRunId || !run || !run.summary || run.status === 'running') {
      setDelta(null)
      return
    }
    let live = true
    agentEvalApi.runDelta(viewingRunId)
      .then((r) => { if (live) setDelta(r.delta) })
      .catch(() => { if (live) setDelta(null) })
    return () => { live = false }
  }, [viewingRunId, run?.status, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── ETA 估算（随发起参数变化，去抖 350ms）── */
  useEffect(() => {
    const scope = scopeKind === 'all' ? 'all'
      : scopeKind === 'group' ? `group:${group}`
        : (idsText.trim() ? `ids:${idsText.trim()}` : null)
    if (!scope) {
      setEstimate(null)
      return
    }
    let live = true
    const t = window.setTimeout(() => {
      agentEvalApi.estimate(scope, judge, runsN)
        .then((e) => { if (live) setEstimate(e) })
        .catch(() => { if (live) setEstimate(null) })
    }, 350)
    return () => { live = false; window.clearTimeout(t) }
  }, [scopeKind, group, idsText, judge, runsN, nonce])

  /* ── 发起 / 中止 ── */
  const start = async () => {
    const scope = scopeKind === 'all' ? 'all'
      : scopeKind === 'group' ? `group:${group}`
        : `ids:${idsText.trim()}`
    if (scopeKind === 'ids' && !idsText.trim()) {
      toast('请先填写用例号，如 L1-01,R1-03')
      return
    }
    setStarting(true)
    try {
      const r = await agentEvalApi.start(scope, judge, runsN)
      toast(`已发起运行 ${r.run_id}（${r.scope_label}）`)
      setProgress({
        run_id: r.run_id, status: 'running', live: true, done: 0, total: 0,
        current: null, current_desc: null, elapsed_ms: 0, recent: [],
      })
      go('agenteval', { doc: r.run_id })
    } catch (e) {
      toast(`发起失败：${(e as Error).message}`, 7000)
    } finally {
      setStarting(false)
    }
  }

  const cancelRun = async () => {
    if (!viewingRunId) return
    if (!confirmCancel) {
      setConfirmCancel(true)
      window.setTimeout(() => setConfirmCancel(false), 4000)
      return
    }
    setConfirmCancel(false)
    try {
      await agentEvalApi.cancel(viewingRunId)
      toast('已请求中止，等待进程退出…')
    } catch (e) {
      toast(`中止失败：${(e as Error).message}`, 6000)
    }
  }

  /* ── 用例表过滤 / 定位 ── */
  const groupsPresent = useMemo(() => {
    const s = new Set<string>()
    for (const c of run?.cases ?? []) if (c.grp) s.add(c.grp)
    return [...s].sort()
  }, [run?.cases])

  const shownCases = useMemo(() => {
    let cs = run?.cases ?? []
    if (caseFilter === 'fail') cs = cs.filter((c) => !c.pass)
    else if (caseFilter === 'p0') cs = cs.filter((c) => c.priority === 'P0')
    if (grpFilter) cs = cs.filter((c) => (c.grp || '').startsWith(grpFilter))
    const q = search.trim().toLowerCase()
    if (q) {
      cs = cs.filter((c) =>
        c.case_id.toLowerCase().includes(q)
        || (c.desc || '').toLowerCase().includes(q)
        || (c.detail || '').toLowerCase().includes(q))
    }
    return cs
  }, [run?.cases, caseFilter, grpFilter, search])

  const jumpToCase = useCallback((id: string) => {
    setCaseFilter('all')
    setGrpFilter('')
    setSearch('')
    setExpanded(id)
    window.setTimeout(() => {
      const el = document.getElementById(`eval-case-${id}`)
      if (!el) return
      // 只做纵向滚动：scrollIntoView 在「页面比视口宽」（本平台 min-width 1430）时会
      // 连带横向对齐元素右缘，产生一次横向抖动（TECH-022 实测）。
      const y = el.getBoundingClientRect().top + window.scrollY - 160
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
      el.classList.add('flash')
      window.setTimeout(() => el.classList.remove('flash'), 1600)
    }, 80)
  }, [])

  const doExport = (fmt: 'md' | 'json' | 'html') => {
    if (!run) return
    exportRun(run, delta, fmt)
    toast(`已导出报告（${fmt.toUpperCase()}）`)
  }

  if (loading && !overview) return <Loading />
  if (loadError && !overview) return <ErrorBox error={new Error(loadError)} />

  const estText = estimate
    ? `预计约 ${fmtDuration(estimate.est_ms)}（${estimate.case_count} 条${estimate.runs_n > 1 ? ` × ${estimate.runs_n} 轮` : ''} · ${estimate.basis === 'history' ? `参考 ${estimate.sample_runs} 轮历史` : '经验估算'}）`
    : ''

  return (
    <>
      {/* ① 发起 */}
      <Card>
        <CardHead
          title="发起运行"
          meta={
            health ? (
              health.ok ? <Pill kind="ok">环境就绪</Pill> : <Pill kind="danger">环境未就绪</Pill>
            ) : ''
          }
        />
        <CardBody>
          <div className="toolbar" style={{ margin: 0, flexWrap: 'wrap', rowGap: 8 }}>
            <span className="hint">范围</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input type="radio" checked={scopeKind === 'all'} onChange={() => setScopeKind('all')} />
              全部
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input type="radio" checked={scopeKind === 'group'} onChange={() => setScopeKind('group')} />
              分组
              <select value={group} disabled={scopeKind !== 'group'} onChange={(e) => setGroup(e.target.value)}>
                {EVAL_GROUPS.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input type="radio" checked={scopeKind === 'ids'} onChange={() => setScopeKind('ids')} />
              指定用例
              <input
                style={{ width: 150 }}
                placeholder="如 L1-01,R1-03"
                value={idsText}
                disabled={scopeKind !== 'ids'}
                onChange={(e) => setIdsText(e.target.value)}
              />
            </label>
            <span className="sep" />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="由 LLM 裁判判分（忠实/完整/护栏/风格）；关闭可省约一半时间">
              <input type="checkbox" checked={judge} onChange={(e) => setJudge(e.target.checked)} />
              裁判判分
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="同一用例重复次数（取最差），用于消抖">
              <span className="hint">轮次</span>
              <select value={runsN} onChange={(e) => setRunsN(Number(e.target.value))}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
            <span className="sep" />
            <button className="btn btn-primary" onClick={start} disabled={starting || anyRunning || (health != null && !health.ok)}>
              {starting ? '发起中…' : anyRunning ? '已有运行进行中' : '开始运行'}
            </button>
            {estText && <span className="hint">{estText}</span>}
          </div>
          {health && !health.ok && <Notice>{health.issues.join('；')}</Notice>}
          {bgRunning && (
            <Notice tone="accent">
              后台有一轮运行进行中（{overview?.latest?.run_id}）——完成后可发起新一轮；正在查看的是历史轮。
            </Notice>
          )}
        </CardBody>
      </Card>

      {/* ② 运行中（单焦点视图；TECH-022 A9） */}
      {viewedRunning && (
        <Card>
          <CardHead
            title={`运行中 · ${viewingRunId || '…'}`}
            meta={progress ? `${progress.done ?? 0}/${progress.total || '?'} · 已用 ${fmtDuration(progress.elapsed_ms)}` : ''}
          />
          <CardBody>
            <div style={{ height: 10, borderRadius: 5, background: 'var(--line)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progress && progress.total ? Math.min(100, Math.round(((progress.done ?? 0) / progress.total) * 100)) : 3}%`,
                  background: 'var(--accent)',
                  transition: 'width .3s ease',
                }}
              />
            </div>
            <div style={{ margin: '8px 0', fontSize: 13 }}>
              当前执行：<b>{progress?.current || '准备中…'}</b>
              {progress?.current_desc ? <span className="hint"> · {progress.current_desc}</span> : null}
              {progress?.passed != null && progress?.done != null && progress.done > 0
                ? ` ｜ 已通过 ${progress.passed}/${progress.done}` : ''}
              {progress && progress.done != null && progress.done > 0 && progress.total
                ? ` ｜ 剩余约 ${fmtDuration(Math.round(((progress.elapsed_ms ?? 0) / progress.done) * Math.max(0, progress.total - progress.done)))}`
                : ''}
            </div>
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
              <button className={confirmCancel ? 'btn btn-danger' : 'btn'} onClick={cancelRun}>
                {confirmCancel ? '确认中止？' : '中止运行'}
              </button>
              <span className="hint">中止后已完成用例的结果会保留；可离开本页，运行在后台继续</span>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ③ 结论（非运行中的轮） */}
      {run && !viewedRunning && (
        <>
          <Card>
            <CardHead
              title={`运行 ${run.run_id}`}
              meta={
                <>
                  <Pill kind={statusPillKind(run.status)}>{RUN_STATUS_LABEL[run.status] || run.status}</Pill>
                  {run.task_id ? ` · ${run.task_id}` : ''}
                  {` · ${run.scope_label} · ${fmtTime(run.created_at)} · 耗时 ${fmtDuration(run.duration_ms)}`}
                  <details className="menu" style={{ marginLeft: 8 }}>
                    <summary className="btn">导出 ▾</summary>
                    <div className="menu-pop">
                      <button onClick={() => doExport('md')}>Markdown（.md）</button>
                      <button onClick={() => doExport('json')}>JSON（全量数据）</button>
                      <button onClick={() => doExport('html')}>HTML（单文件报告）</button>
                    </div>
                  </details>
                  {showingStale && (
                    <button className="btn" style={{ marginLeft: 8 }} onClick={() => go('agenteval', { doc: null })}>
                      回到最新
                    </button>
                  )}
                </>
              }
            />
            <CardBody>
              {run.summary ? (
                <>
                  <VerdictBanner run={run} onJump={jumpToCase} />
                  <div className="kpis">
                    <KpiCard
                      k="通过率"
                      v={`${run.summary.passed}/${run.summary.total}`}
                      u={run.summary.total ? `${Math.round((run.summary.passed / run.summary.total) * 100)}%` : ''}
                    />
                    {run.summary.p0 != null && (
                      <KpiCard k="P0（关键）" v={`${run.summary.p0Pass}/${run.summary.p0}`} />
                    )}
                    {Object.entries(run.summary.gate || {}).map(([key, g]) => {
                      const st = gateState(g)
                      return (
                        <KpiCard
                          key={key}
                          k={g.label}
                          v={
                            st === 'na'
                              ? <span className="hint">未测</span>
                              : (
                                <span style={{ color: st === 'pass' ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>
                                  {st === 'pass' ? '✓ ' : '✗ '}{g.text}
                                </span>
                              )
                          }
                          u={`目标 ${g.target}`}
                        />
                      )
                    })}
                  </div>
                  {run.summary.note ? <div className="hint" style={{ marginTop: 6 }}>{run.summary.note}</div> : null}
                  <DeltaCard delta={delta} onJump={jumpToCase} />
                  {run.error ? <Notice>运行异常：{run.error}</Notice> : null}
                  <div style={{ marginTop: 10 }}>
                    <KV
                      rows={[
                        ['被测模型', run.env_snapshot.agent_model || '—'],
                        ['裁判模型', run.env_snapshot.judge_model || '未启用'],
                        ['数据库', run.env_snapshot.db || '—'],
                        ['用例集', caseSetText(run)],
                        ['发起参数', `${run.scope_label} ｜ 裁判判分 ${run.judge ? '开' : '关'} ｜ 轮次 ${run.runs_n}`],
                        ['agent 版本', run.env_snapshot.git || '—'],
                      ]}
                    />
                  </div>
                </>
              ) : (
                <Empty title="运行未产出汇总">{run.error || '运行已中断且没有可展示的结果'}</Empty>
              )}
            </CardBody>
          </Card>

          {run.summary && (
            <Card>
              <CardHead
                title="用例结果"
                meta={
                  <div className="toolbar" style={{ margin: 0 }}>
                    <button className={`btn ${caseFilter === 'all' ? 'btn-primary' : ''}`} onClick={() => setCaseFilter('all')}>
                      全部 {run.cases.length}
                    </button>
                    <button className={`btn ${caseFilter === 'fail' ? 'btn-primary' : ''}`} onClick={() => setCaseFilter('fail')}>
                      失败 {run.cases.filter((c) => !c.pass).length}
                    </button>
                    <button className={`btn ${caseFilter === 'p0' ? 'btn-primary' : ''}`} onClick={() => setCaseFilter('p0')}>
                      P0（关键）
                    </button>
                    <select
                      className="mini-input"
                      value={grpFilter}
                      onChange={(e) => setGrpFilter(e.target.value)}
                      title="按组筛选"
                    >
                      <option value="">全部组</option>
                      {groupsPresent.map((g) => (
                        <option key={g} value={g}>{groupLabel(g)}</option>
                      ))}
                    </select>
                    <input
                      className="mini-input"
                      style={{ width: 160 }}
                      placeholder="搜索用例 / 原因…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                }
              />
              <CardBody flush>
                <Table cols={[96, 92, 118, 60, 70, 240, 50]}>
                  <thead>
                    <tr>
                      <th>用例</th>
                      <th>优先级</th>
                      <th>组</th>
                      <th>结果</th>
                      <th className="num">耗时</th>
                      <th>工具</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {shownCases.map((c) => (
                      <Fragment key={c.case_id}>
                        <tr
                          id={`eval-case-${c.case_id}`}
                          onClick={() => setExpanded(expanded === c.case_id ? null : c.case_id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="mono">{c.case_id}</td>
                          <td>{priorityLabel(c.priority)}</td>
                          <td className="hint">{groupLabel(c.grp)}</td>
                          <td style={{ color: c.pass ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>
                            {c.pass ? '✓' : '✗'}
                          </td>
                          <td className="num">{fmtDuration(c.ms)}</td>
                          <td className="mono hint">{c.tool_calls.map((t) => t.name).join(' + ') || '—'}</td>
                          <td className="hint">{expanded === c.case_id ? '▾' : '▸'}</td>
                        </tr>
                        {expanded === c.case_id && (
                          <tr>
                            <td colSpan={7} style={{ background: 'var(--neutral-bg)' }}>
                              <CaseEvidence
                                c={c}
                                def={run.case_defs ? (run.case_defs[c.case_id] ?? null) : null}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {shownCases.length === 0 && (
                      <tr>
                        <td colSpan={7} className="hint">没有匹配的用例</td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {!run && !viewedRunning && (
        <Card>
          <Empty title="还没有运行记录">选好范围后点「开始运行」发起第一轮测评。</Empty>
        </Card>
      )}
    </>
  )
}

/* ── 闸门结论 Banner（TECH-022 A1）────────────────────────────────── */

function VerdictBanner({ run, onJump }: { run: EvalRunDetail; onJump: (id: string) => void }) {
  const v = deriveVerdict(run)
  if (v.kind === 'none' || v.kind === 'running') return null
  const tone = v.kind === 'pass' ? 'ok'
    : v.kind === 'fail' || v.kind === 'failed' ? 'danger'
      : 'warn'
  const icon = v.kind === 'pass' ? '✓' : v.kind === 'fail' || v.kind === 'failed' ? '✗' : '◐'
  const failed = run.cases.filter((c) => !c.pass)
  const passLine = v.kind === 'pass' && run.summary
    ? ` · ${run.summary.passed}/${run.summary.total} 用例通过${run.summary.p0 != null ? `，关键用例 ${run.summary.p0Pass}/${run.summary.p0}` : ''}`
    : ''
  return (
    <div className={`verdict ${tone}`}>
      <div className="vtitle">
        <span className="vicon">{icon}</span>
        {v.title}{passLine}
      </div>
      {v.reasons.map((r, i) => <div key={i} className="vreason">{r}</div>)}
      {v.kind === 'partial' && (
        <div className="vsub">
          {run.judge ? '本轮无数据的维度' : '裁判判分未启用，以下维度本轮未测'}：{v.naLabels.join('、')}
          ；其余已测项全部达标。<b>未测 ≠ 未通过</b>，补跑含裁判判分的一轮可获得完整结论。
        </div>
      )}
      {v.kind === 'fail' && v.naLabels.length > 0 && (
        <div className="vsub">另有未测维度：{v.naLabels.join('、')}{run.judge ? '' : '（裁判判分未启用）'}</div>
      )}
      {v.kind === 'cancelled' && run.summary?.note && <div className="vsub">{run.summary.note}</div>}
      {v.kind === 'failed' && run.error && <div className="vsub">{run.error}</div>}
      {failed.length > 0 && v.kind !== 'cancelled' && (
        <div className="vchips">
          <span className="hint">失败用例（点击定位）：</span>
          {failed.map((c) => (
            <button
              key={c.case_id}
              className="vchip bad"
              title={`${priorityLabel(c.priority)}｜${STAGE_LABEL[c.stage || ''] || c.stage || ''}：${c.detail || ''}`}
              onClick={() => onJump(c.case_id)}
            >
              {c.case_id}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── 较上轮 delta 卡（TECH-022 A7/B2）────────────────────────────── */

function DeltaCard({ delta, onJump }: { delta: EvalDelta | null; onJump: (id: string) => void }) {
  if (!delta) return null
  const up = delta.rate_delta >= 0
  return (
    <div className="deltacard">
      <div className={`dnum ${up ? 'up' : 'down'}`}>
        {up ? '+' : ''}{(delta.rate_delta * 100).toFixed(1)}<span className="dunit">pt</span>
      </div>
      <div className="dbody">
        <div className="dhint">
          较上轮 {fmtTime(delta.prev_created_at)}（{delta.prev_run_id}）：通过率 {(delta.rate_prev * 100).toFixed(0)}%
          {' → '}{(delta.rate_cur * 100).toFixed(0)}%
        </div>
        <div className="dchips">
          {delta.fixed.length > 0 && (
            <>
              <span className="badge ok">修复 {delta.fixed.length}</span>
              {delta.fixed.map((id) => <button key={id} className="vchip ok" onClick={() => onJump(id)}>{id}</button>)}
            </>
          )}
          {delta.new_fail.length > 0 && (
            <>
              <span className="badge danger">新增失败 {delta.new_fail.length}</span>
              {delta.new_fail.map((id) => <button key={id} className="vchip bad" onClick={() => onJump(id)}>{id}</button>)}
            </>
          )}
          {delta.still_fail.length > 0 && (
            <>
              <span className="badge plain">仍失败 {delta.still_fail.length}</span>
              {delta.still_fail.map((id) => <button key={id} className="vchip plain" onClick={() => onJump(id)}>{id}</button>)}
            </>
          )}
          {delta.fixed.length + delta.new_fail.length + delta.still_fail.length === 0 && (
            <span className="hint">两轮逐例结果一致</span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── 小工具 ─────────────────────────────────────────────────────── */

function caseSetText(run: EvalRunDetail): string {
  const cs = run.env_snapshot.cases
  if (cs?.count) return `${cs.count} 条 · ${String(cs.hash || '').slice(0, 8)}`
  if (run.env_snapshot.cases_hash) return String(run.env_snapshot.cases_hash).slice(0, 12)
  return '—'
}
