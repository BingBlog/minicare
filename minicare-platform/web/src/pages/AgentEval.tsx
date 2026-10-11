/**
 * 页面：测评报告（PRD-010 + TECH-022 + 2026-10-11 用户评审调整）—— **纯查看** · 用例钻取。
 *
 * 职责边界（用户评审：「测评的发起和执行同测评报告拆开」）：
 *   · 本页只**查看**报告（结论 / 五指标 / 成本 / 用例表 / 导出 / 重判）；
 *   · **发起与执行**（范围选择、开始运行、进度、中止）都在「测评任务」页；
 *   · 查看的运行若仍在跑 → 仅提示"执行进度见测评任务"，并自动轮询、完成后自动出报告。
 *
 * 视图约定：
 *   · `?page=agenteval`             → 跟随最新一轮运行；
 *   · `?page=agenteval&doc=<run>`   → 查看指定轮（记录页/任务页跳进来），`doc` 参数承接 run_id。
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardBody, CardHead, Empty, ErrorBox, KpiCard, KV, Loading, Notice, Pill, Table } from '../components/ui'
import { Modal } from '../components/Modal'
import { useApp } from '../lib/app-context'
import { CaseEvidence } from '../components/eval/CaseEvidence'
import { CostPanel, OverviewSection, copyText } from '../components/eval/ReportPanel'
import { exportRun } from '../lib/evalExport'
import {
  agentEvalApi, ATTRIBUTION_HINT, ATTRIBUTION_LABEL, attributionLabel, deriveVerdict,
  fmtDuration, fmtSampleScore, fmtTime, gateState, groupLabel, identityText, priorityLabel,
  RUN_STATUS_LABEL, sampleScoreWarn, SAMPLE_THRESHOLD,
  STAGE_LABEL, statusPillKind, type AttributionClass, type EvalCaseResult, type EvalDelta,
  type EvalProgress, type EvalReport, type EvalRunDetail, type EvalRunMeta,
} from '../lib/agentEval'

export function AgentEvalPage() {
  const { doc, go, toast, nonce } = useApp()
  const [overview, setOverview] = useState<{ latest: EvalRunMeta | null; recent: EvalRunMeta[] } | null>(null)
  const [detail, setDetail] = useState<EvalRunDetail | null>(null)
  const [progress, setProgress] = useState<EvalProgress | null>(null)
  const [delta, setDelta] = useState<EvalDelta | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 用例表交互
  const [caseFilter, setCaseFilter] = useState<'all' | 'fail' | 'p0'>('all')
  const [grpFilter, setGrpFilter] = useState('')
  const [attrFilter, setAttrFilter] = useState<AttributionClass | ''>('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  /** 指标名映射（样本分 hover 拆解用；TECH-026 §5.2） */
  const [indicatorNames, setIndicatorNames] = useState<Record<string, string>>({})

  useEffect(() => {
    agentEvalApi.listIndicators()
      .then((r) => {
        const m: Record<string, string> = {}
        for (const i of r.items) m[i.indicator_id] = i.name
        setIndicatorNames(m)
      })
      .catch(() => { /* 名称映射失败时 hover 回退显示指标 id */ })
  }, [])

  const viewingRunId = doc || overview?.latest?.run_id || null
  const run = detail
  /** 所查看的这一轮在跑（决定是否轮询 / 显示进度卡） */
  const viewedRunning = progress?.status === 'running' || run?.status === 'running'
  /** 任意一轮在跑（后台执行中；重判按钮据此禁用） */
  const anyRunning = viewedRunning || overview?.latest?.status === 'running'
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

  /* ── 失败重跑（US-19 飞轮）── */
  const [retryConfirm, setRetryConfirm] = useState(false)
  const [retryBusy, setRetryBusy] = useState(false)
  const doRetry = async () => {
    if (!run) return
    setRetryConfirm(false)
    setRetryBusy(true)
    try {
      const r = await agentEvalApi.retryRun(run.run_id)
      toast(`已发起重跑：${r.run_id}（${r.case_count} 条失败用例）——执行进度见「测评任务」页`)
      go('agentevaltasks')
    } catch (e) {
      toast(`重跑失败：${(e as Error).message}`, 7000)
    } finally {
      setRetryBusy(false)
    }
  }

  /** 重判（TECH-026 B4）：对存量结果重新判分，不重跑执行 */
  const rescore = async () => {
    if (!viewingRunId) return
    try {
      await agentEvalApi.score(viewingRunId)
      toast('已发起重判（deepeval 引擎）…')
      setProgress({
        run_id: viewingRunId, status: 'running', live: true, done: 0, total: 0,
        current: null, current_desc: null, elapsed_ms: 0, recent: [],
        phase: 'scoring', scoring_done: 0, scoring_total: 0,
      })
    } catch (e) {
      toast(`重判失败：${(e as Error).message}`, 7000)
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
    if (attrFilter) {
      const byCase = run?.report?.attribution.by_case || {}
      cs = cs.filter((c) => !c.pass && (c.attribution || byCase[c.case_id]) === attrFilter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      cs = cs.filter((c) =>
        c.case_id.toLowerCase().includes(q)
        || (c.desc || '').toLowerCase().includes(q)
        || (c.detail || '').toLowerCase().includes(q))
    }
    return cs
  }, [run?.cases, caseFilter, grpFilter, attrFilter, search])

  const jumpToCase = useCallback((id: string) => {
    setCaseFilter('all')
    setGrpFilter('')
    setAttrFilter('')
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

  /** 归因改判保存（TECH-026 US-14）：整体替换 report + 更新该用例行 → 结论即时重算 */
  const onAttributionSaved = useCallback((resp: { case: EvalCaseResult; report: EvalReport }) => {
    setDetail((prev) => (prev ? {
      ...prev,
      report: resp.report,
      cases: prev.cases.map((c) => (c.case_id === resp.case.case_id
        ? {
            ...c,
            attribution: resp.case.attribution,
            attribution_source: resp.case.attribution_source,
            attribution_note: resp.case.attribution_note,
          }
        : c)),
    } : prev))
    toast('已保存，结论已按新归因重算')
  }, [toast])

  if (loading && !overview) return <Loading />
  if (loadError && !overview) return <ErrorBox error={new Error(loadError)} />

  return (
    <>
      {/* 运行中（只读提示 · 发起与执行在「测评任务」页） */}
      {viewedRunning && (
        <Card>
          <CardHead
            title={`运行中 · ${viewingRunId || '…'}`}
            meta={
              progress
                ? (progress.phase === 'scoring'
                  ? `判分 ${progress.scoring_done ?? 0}/${progress.scoring_total || '?'}`
                  : `${progress.done ?? 0}/${progress.total || '?'}`) + ` · 已用 ${fmtDuration(progress.elapsed_ms)}`
                : ''
            }
          />
          <CardBody>
            <div className="hint" style={{ lineHeight: 1.9 }}>
              该轮正在{progress?.phase === 'scoring' ? '判分' : '执行'}中——
              <b>发起与执行（进度 / 中止）都在「测评任务」页</b>；完成后本页会自动刷新出报告。
            </div>
            <div className="toolbar" style={{ margin: '10px 0 0' }}>
              <button className="btn" onClick={() => go('agentevaltasks')}>前往测评任务</button>
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
                  {run.env_snapshot.retry_of && (
                    <button
                      className="btn btn-mini"
                      style={{ marginLeft: 8 }}
                      title="本轮的失败用例集派生自该轮——点击打开源运行报告"
                      onClick={() => go('agenteval', { doc: run.env_snapshot.retry_of! })}
                    >
                      重跑自 {run.env_snapshot.retry_of} ▸
                    </button>
                  )}
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
                  {run.status === 'completed' && (
                    <button
                      className="btn"
                      style={{ marginLeft: 8 }}
                      disabled={anyRunning}
                      title="对存量结果重新判分（不重跑执行）；改过判分配置或判分失败后可用"
                      onClick={rescore}
                    >
                      重判
                    </button>
                  )}
                </>
              }
            />
            <CardBody>
              {run.summary ? (
                <>
                  <VerdictBanner
                    run={run}
                    onJump={jumpToCase}
                    onRetry={run.status === 'completed' ? () => setRetryConfirm(true) : null}
                    retryDisabled={anyRunning || retryBusy}
                  />
                  {run.report ? (
                    <OverviewSection
                      report={run.report}
                      rateDelta={delta?.rate_delta ?? null}
                      attrFilter={attrFilter}
                      onFilterAttribution={setAttrFilter}
                    />
                  ) : null}
                  <div className="section-label">闸门检查项</div>
                  <div className="kpis">
                    {!run.report && (
                      <KpiCard
                        k="通过率"
                        v={`${run.summary.passed}/${run.summary.total}`}
                        u={run.summary.total ? `${Math.round((run.summary.passed / run.summary.total) * 100)}%` : ''}
                      />
                    )}
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
                        ['判分引擎', scoringEngineText(run)],
                        ['数据库', run.env_snapshot.db || '—'],
                        ['用例集', caseSetText(run)],
                        // 运行身份（全局）：用户信息不在用例层设置——此处集中展示一次（18:26 用户评审）
                        ['运行身份（全局）', identityText(run.env_snapshot.eval_ctx)],
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

          {run.report && (
            <Card>
              <CardBody>
                <CostPanel run={run} report={run.report} onJumpCase={jumpToCase} />
              </CardBody>
            </Card>
          )}

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
                    {attrFilter && (
                      <button className="btn btn-primary" onClick={() => setAttrFilter('')}>
                        归因：{ATTRIBUTION_LABEL[attrFilter]} ✕
                      </button>
                    )}
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
                <Table cols={[92, 80, 100, 50, 58, 66, 118, 0, 50]}>
                  <thead>
                    <tr>
                      <th>用例</th>
                      <th>优先级</th>
                      <th>组</th>
                      <th>结果</th>
                      <th className="num" title="两级聚合（US-16）：维度三态 → 指标加权 → 样本分（各指标均值）；hover 看拆解">样本分</th>
                      <th className="num">耗时</th>
                      <th>归因</th>
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
                          <td className="num">
                            <SampleCell c={c} names={indicatorNames} />
                          </td>
                          <td className="num">{fmtDuration(c.ms)}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <AttributionCell
                              c={c}
                              derived={run.report?.attribution.by_case?.[c.case_id] ?? null}
                              onJump={jumpToCase}
                            />
                          </td>
                          <td className="mono hint">{c.tool_calls.map((t) => t.name).join(' + ') || '—'}</td>
                          <td className="hint">{expanded === c.case_id ? '▾' : '▸'}</td>
                        </tr>
                        {expanded === c.case_id && (
                          <tr>
                            <td colSpan={9} style={{ background: 'var(--neutral-bg)' }}>
                              <CaseEvidence
                                c={c}
                                def={run.case_defs ? (run.case_defs[c.case_id] ?? null) : null}
                                runId={run.run_id}
                                onAttributionSaved={onAttributionSaved}
                                derivedAttribution={run.report?.attribution.by_case?.[c.case_id] ?? null}
                                onCaseAction={toast}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {shownCases.length === 0 && (
                      <tr>
                        <td colSpan={9} className="hint">没有匹配的用例</td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {/* 重跑失败（US-19）：确认后以失败用例集发起新运行，跳到任务页看执行 */}
      {retryConfirm && run && (() => {
        const failedCs = run.cases.filter((x) => !x.pass)
        const idsPreview = failedCs.slice(0, 12).map((x) => x.case_id).join('、')
        return (
          <Modal
            title={`重跑失败 ${failedCs.length} 条`}
            subtitle="以本轮失败用例集发起新运行；裁判判分与轮次沿用本轮"
            onClose={() => setRetryConfirm(false)}
            width={580}
          >
            <div className="hint" style={{ lineHeight: 2 }}>
              范围：{idsPreview}{failedCs.length > 12 ? ` …（共 ${failedCs.length} 条）` : ''}<br />
              口径：裁判判分 {run.judge ? '开' : '关'} · {run.runs_n} 轮次{run.task_id ? ` · 归属任务 ${run.task_id}` : ''}<br />
              来源轮：<span className="mono">{run.run_id}</span>——发起后到「测评任务」页查看执行进度与中止。
            </div>
            <div className="toolbar" style={{ margin: '12px 0 0' }}>
              <button className="btn btn-primary" disabled={retryBusy} onClick={doRetry}>
                {retryBusy ? '发起中…' : '发起重跑'}
              </button>
              <button className="btn" onClick={() => setRetryConfirm(false)}>取消</button>
            </div>
          </Modal>
        )
      })()}

      {!run && !viewedRunning && (
        <Card>
          <Empty title="还没有运行记录">
            测评的发起与执行在「测评任务」页——建一个任务并点「发起运行」，完成后报告会出现在这里。
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-primary" onClick={() => go('agentevaltasks')}>前往测评任务</button>
            </div>
          </Empty>
        </Card>
      )}
    </>
  )
}

/* ── 闸门结论 Banner（TECH-022 A1 → TECH-026 US-09：决策四态优先，旧轮回退三态）── */

function VerdictBanner({ run, onJump, onRetry, retryDisabled }: {
  run: EvalRunDetail
  onJump: (id: string) => void
  /** 重跑失败（US-19）：非空时在失败清单尾部渲染入口 */
  onRetry?: (() => void) | null
  retryDisabled?: boolean
}) {
  const decision = run.report?.decision
  if (decision) {
    return (
      <DecisionHero run={run} decision={decision} onJump={onJump} onRetry={onRetry} retryDisabled={retryDisabled} />
    )
  }
  return <LegacyVerdictBanner run={run} onJump={onJump} onRetry={onRetry} retryDisabled={retryDisabled} />
}

/** 决策 hero：服务端单点计算（四态 + 原因 + 行动清单 + 复制结论） */
function DecisionHero({ run, decision, onJump, onRetry, retryDisabled }: {
  run: EvalRunDetail
  decision: EvalReport['decision']
  onJump: (id: string) => void
  onRetry?: (() => void) | null
  retryDisabled?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const failed = run.cases.filter((c) => !c.pass)
  const tone = decision.kind === 'pass' ? 'ok'
    : decision.kind === 'fail' || decision.kind === 'failed' ? 'danger'
      : 'warn'
  const icon = decision.kind === 'pass' ? '✓'
    : decision.kind === 'fail' || decision.kind === 'failed' ? '✗'
      : decision.kind === 'no_valid' ? '⚠'
        : '◐'
  const passLine = decision.kind === 'pass' && run.summary
    ? ` · ${run.summary.passed}/${run.summary.total} 用例通过${run.summary.p0 != null ? `，关键用例 ${run.summary.p0Pass}/${run.summary.p0}` : ''}`
    : ''
  const doCopy = async () => {
    const text = [
      decision.title,
      ...decision.reasons.map((r) => `- ${r}`),
      ...(decision.actions.length > 0 ? ['行动：', ...decision.actions.map((a) => `- ${a}`)] : []),
    ].join('\n')
    if (await copyText(text)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }
  return (
    <div className={`verdict ${tone}`}>
      <div className="vtitle">
        <span className="vicon">{icon}</span>
        {decision.title}{passLine}
      </div>
      {decision.reasons.map((r, i) => <div key={i} className="vreason">{r}</div>)}
      {decision.actions.length > 0 && (
        <ul className="vacts">{decision.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
      )}
      {decision.note && <div className="vsub">{decision.note}</div>}
      {failed.length > 0 && decision.kind !== 'cancelled' && decision.kind !== 'failed' && (
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
          {onRetry && (
            <button
              className="btn btn-mini"
              style={{ marginLeft: 8 }}
              disabled={retryDisabled}
              title="以本轮的失败用例集发起新运行（裁判判分 / 轮次沿用本轮）"
              onClick={onRetry}
            >
              重跑失败 {failed.length} 条 ▸
            </button>
          )}
        </div>
      )}
      <div className="vtools">
        <button className="vcopy" onClick={doCopy}>{copied ? '已复制 ✓' : '复制结论'}</button>
      </div>
    </div>
  )
}

/** 旧轮（无 report）回退：沿用 TECH-022 三态横幅 */
function LegacyVerdictBanner({ run, onJump, onRetry, retryDisabled }: {
  run: EvalRunDetail
  onJump: (id: string) => void
  onRetry?: (() => void) | null
  retryDisabled?: boolean
}) {
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
          {onRetry && (
            <button
              className="btn btn-mini"
              style={{ marginLeft: 8 }}
              disabled={retryDisabled}
              title="以本轮的失败用例集发起新运行（裁判判分 / 轮次沿用本轮）"
              onClick={onRetry}
            >
              重跑失败 {failed.length} 条 ▸
            </button>
          )}
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

/* ── 用例表 · 归因单元格（TECH-026：存值优先；旧轮显示实时推导值）───── */

function AttributionCell({ c, derived, onJump }: {
  c: EvalCaseResult
  derived: AttributionClass | null
  onJump: (id: string) => void
}) {
  if (c.pass) return <span className="hint">—</span>
  const eff = c.attribution || derived || null
  const title = c.attribution
    ? ATTRIBUTION_HINT[c.attribution]
    : derived
      ? `旧轮实时推导：${ATTRIBUTION_HINT[derived]}（点击展开可人工改判）`
      : '未归类——点击展开用例可人工改判'
  return (
    <button className={`attr-chip ${eff || 'none'}`} title={title} onClick={() => onJump(c.case_id)}>
      {eff ? attributionLabel(eff) : '待归类'}
      {c.attribution_source === 'manual' ? ' ✓' : (!c.attribution && eff ? ' · 推导' : '')}
    </button>
  )
}

/* ── 用例表 · 样本分单元格（TECH-026 §5.2 / PRD-012 US-16）────────── */

/**
 * 样本分展示：1 位小数；hover 拆解各指标分；低于阈值 0.2 内标黄「临界」。
 * 旧轮无样本分（判分引擎未切换或未判分）→ 「—」。
 */
function SampleCell({ c, names }: { c: EvalCaseResult; names: Record<string, string> }) {
  const v = c.sample_score
  if (v == null) {
    return <span className="hint" title="本用例无样本分（旧轮口径 / 未启用判分引擎 / 无可用维度）">—</span>
  }
  const warn = sampleScoreWarn(v)
  const breakdown = Object.entries(c.indicator_scores || {})
    .map(([k, s]) => `${names[k] || k}：${Number(s).toFixed(2)}`)
  const title = [
    `样本分 ${v.toFixed(2)}（阈值 ${SAMPLE_THRESHOLD.toFixed(2)}${warn ? ' · 临界：距阈值 0.2 内' : ''}）`,
    ...(breakdown.length ? ['', '指标拆解：', ...breakdown] : []),
  ].join('\n')
  return (
    <span title={title} style={warn ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>
      {fmtSampleScore(v)}
    </span>
  )
}

/* ── 小工具 ─────────────────────────────────────────────────────── */

/** 判分引擎展示（TECH-026 B4）：优先取本次判分元数据，其次环境快照 */
function scoringEngineText(run: EvalRunDetail): string {
  const meta = run.report?.meta?.scoring_meta || run.scoring_meta
  if (!run.judge) return '未启用'
  if (meta?.deepeval) {
    const parts = [`deepeval ${meta.deepeval}`]
    if (meta.model) parts.push(meta.model)
    if (meta.elapsed_ms) parts.push(fmtDuration(meta.elapsed_ms))
    return parts.join(' · ')
  }
  if (run.env_snapshot.judge_engine === 'deepeval') return 'deepeval（待判分）'
  return run.env_snapshot.judge_model || '—'
}

function caseSetText(run: EvalRunDetail): string {
  const cs = run.env_snapshot.cases
  if (cs?.count) return `${cs.count} 条 · ${String(cs.hash || '').slice(0, 8)}`
  if (run.env_snapshot.cases_hash) return String(run.env_snapshot.cases_hash).slice(0, 12)
  return '—'
}
