import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardBody, CardHead, Empty, ErrorBox, KpiCard, KV, Loading, Notice, Pill, Table } from '../components/ui'
import { useApp } from '../lib/app-context'
import {
  ATTR_ACTION, ATTR_LABEL, attributionHint, CHUNK_STATE_LABEL, fmtDuration, fmtTime, pct, qualityApi,
  RUN_STATUS_LABEL, statusPillKind, TIER_LABEL, verdictPill, VERDICT_LABEL,
  type QualityCaseResult, type QualityProgress, type QualityRunDetail, type QualityRunMeta,
} from '../lib/quality'

/**
 * 页面：执行记录（PRD-011 US-05 / US-06 / US-07）—— 运行台账列表 + 运行详情（逐题钻取）。
 *
 * 路由：`?page=qualityruns` 列表；`?page=qualityruns&doc=<run_id>` 详情（对齐 Agent 测评台惯例）。
 * 详情读取的是**台账快照**（与当时一致）；运行中的运行 2s 轮询进度。
 */
export function QualityRunsPage() {
  const { doc } = useApp()
  return doc ? <RunDetailView runId={doc} /> : <RunListView />
}

/* ── 列表（US-07）────────────────────────────────────────────────── */

function RunListView() {
  const { go, nonce } = useApp()
  const [items, setItems] = useState<QualityRunMeta[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    qualityApi.listRuns(200)
      .then((r) => alive && setItems(r.items))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [nonce])

  if (loading && !items) return <Loading />
  if (error && !items) return <ErrorBox error={new Error(error)} />
  if (!items) return null

  return (
    <Card>
      <CardHead
        title="执行记录"
        meta={`共 ${items.length} 次运行（时间倒序；含失败与中止，已完成部分均保留）`}
      />
      <CardBody flush>
        {items.length ? (
          <Table cols={[100, 110, 56, 84, 64, 64, 74, 84, 64, 70]}>
            <thead>
              <tr>
                <th>时间</th>
                <th>范围</th>
                <th className="num">题数</th>
                <th className="num">Recall@10</th>
                <th className="num">MRR</th>
                <th className="num">有害</th>
                <th className="num">高危</th>
                <th>结论</th>
                <th className="num">耗时</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const m = r.metrics
                const v = verdictPill(r)
                return (
                  <tr key={r.run_id} onClick={() => go('qualityruns', { doc: r.run_id })} style={{ cursor: 'pointer' }}>
                    <td className="mono">{fmtTime(r.created_at)}</td>
                    <td>{r.scope_label}</td>
                    <td className="num">{m?.n ?? '—'}</td>
                    <td className="num">{pct(m?.recall10)}</td>
                    <td className="num">{m?.mrr ?? '—'}</td>
                    <td className="num">{m ? pct(m.harmful_rate) : '—'}</td>
                    <td className="num">{m?.emergency_recall == null ? '—' : pct(m.emergency_recall, 0)}</td>
                    <td>
                      <Pill kind={v.kind}>{v.text}</Pill>
                    </td>
                    <td className="num">{fmtDuration(r.duration_ms)}</td>
                    <td>
                      <Pill kind={statusPillKind(r.status)}>{RUN_STATUS_LABEL[r.status] || r.status}</Pill>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        ) : (
          <CardBody>
            <Empty title="还没有运行记录">到「检索质检」发起第一轮质检。</Empty>
          </CardBody>
        )}
      </CardBody>
    </Card>
  )
}

/* ── 详情（US-05 / US-06）────────────────────────────────────────── */

function RunDetailView({ runId }: { runId: string }) {
  const { go, toast } = useApp()
  const [run, setRun] = useState<QualityRunDetail | null>(null)
  const [progress, setProgress] = useState<QualityProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [caseFilter, setCaseFilter] = useState<'all' | 'miss' | 'harmful'>('all')
  const [attrFilter, setAttrFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const reload = useCallback(async () => {
    try {
      setError(null)
      setRun(await qualityApi.runDetail(runId))
    } catch (e) {
      const msg = (e as Error).message
      // 陈旧深链接自愈：`doc` 位置上的值不是有效 run_id（如历史遗留的文档 id 被带进来）
      // 时后端返回「运行不存在：…」—— 留在原地只是一个死胡同错误页，退回列表并说明原因。
      // 其余错误（网络 / 500…）维持错误页，不算自愈场景。
      if (msg.includes('运行不存在')) {
        toast(`运行不存在：${runId} —— 已回到执行记录列表`)
        go('qualityruns', { doc: null })
        return
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [runId, go, toast])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload])

  const isRunning = run?.status === 'running'

  useEffect(() => {
    if (!isRunning) return
    let stop = false
    let timer: number | undefined
    const tick = async () => {
      try {
        const p = await qualityApi.progress(runId)
        setProgress(p)
        if (p.status !== 'running') {
          setProgress(null)
          toast(`质检结束：${RUN_STATUS_LABEL[p.status] || p.status}`)
          await reload()
          return
        }
      } catch {
        /* 静默重试 */
      }
      if (!stop) timer = window.setTimeout(tick, 2000)
    }
    timer = window.setTimeout(tick, 600)
    return () => {
      stop = true
      if (timer) window.clearTimeout(timer)
    }
  }, [isRunning, runId, toast, reload])

  const cases = useMemo(() => run?.cases || [], [run])
  const missCount = cases.filter((c) => c.verdict === 'miss').length
  const harmfulCount = cases.filter((c) => (c.harmful || []).length > 0).length
  const buckets = useMemo(() => {
    if (run?.metrics?.buckets && Object.keys(run.metrics.buckets).length) return run.metrics.buckets
    const out: Record<string, number> = {}
    for (const c of cases) {
      if (c.verdict === 'miss') {
        const k = c.attribution || 'unknown'
        out[k] = (out[k] || 0) + 1
      }
    }
    return out
  }, [run, cases])

  const shown = useMemo(() => {
    return cases.filter((c) => {
      if (caseFilter === 'miss' && c.verdict !== 'miss') return false
      if (caseFilter === 'harmful' && !(c.harmful || []).length) return false
      if (attrFilter !== 'all' && c.attribution !== attrFilter) return false
      return true
    })
  }, [cases, caseFilter, attrFilter])

  if (loading && !run) return <Loading />
  if (error && !run) return <ErrorBox error={new Error(error)} />
  if (!run) return null

  const th = run.thresholds
  const m = run.metrics
  const v = verdictPill(run)

  async function cancelRun() {
    if (!confirmCancel) {
      setConfirmCancel(true)
      window.setTimeout(() => setConfirmCancel(false), 4000)
      return
    }
    setConfirmCancel(false)
    try {
      await qualityApi.cancel(runId)
      toast('已请求中止，等待当前题结束…')
    } catch (e) {
      toast(`中止失败：${(e as Error).message}`, 6000)
    }
  }

  return (
    <>
      <Card>
        <CardHead
          title={`运行 ${run.run_id}`}
          meta={
            <>
              <button type="button" className="btn" style={{ marginRight: 10 }} onClick={() => go('qualityruns', { doc: null })}>
                ← 执行记录
              </button>
              <Pill kind={statusPillKind(run.status)}>{RUN_STATUS_LABEL[run.status] || run.status}</Pill>
              {' '}{run.scope_label} · {fmtTime(run.created_at)} · 耗时 {fmtDuration(run.duration_ms)}
            </>
          }
        />
        <CardBody>
          {isRunning && (
            <>
              <div style={{ height: 10, borderRadius: 5, background: 'var(--line)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progress?.total ? Math.min(100, Math.round(((progress.done || 0) / progress.total) * 100)) : 3}%`,
                    background: 'var(--accent)', transition: 'width .3s ease',
                  }}
                />
              </div>
              <div style={{ margin: '8px 0', fontSize: 13 }}>
                {progress?.done ?? '?'}/{progress?.total || '?'} · 当前：<b>{progress?.current || '准备中…'}</b>
                {' '}· 已用 {fmtDuration(progress?.elapsed_ms)}
              </div>
              <div className="toolbar" style={{ margin: '6px 0 0' }}>
                <button className={confirmCancel ? 'btn btn-danger' : 'btn'} onClick={cancelRun}>
                  {confirmCancel ? '确认中止？' : '中止运行'}
                </button>
              </div>
            </>
          )}
          {!isRunning && m ? (
            <>
              <div style={{ marginBottom: 8 }}>
                结论：<Pill kind={v.kind}>{v.text}</Pill>
                {' '}
                <span className="hint">
                  覆盖 {m.answerable}/{m.n} 题
                  {m.out_of_scope ? `（另负样本 ${m.out_of_scope}）` : ''}
                  {run.status === 'cancelled' ? ' · 已中止，按已完成部分计算' : ''}
                </span>
              </div>
              <div className="kpis">
                <KpiCard
                  k="Recall@5"
                  v={<span style={{ color: m.recall5 != null && th && m.recall5 >= th.recall5_min ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>{pct(m.recall5)}</span>}
                  u={`门槛 ≥${th ? pct(th.recall5_min, 0) : '—'}`}
                />
                <KpiCard
                  k="Recall@10"
                  v={<span style={{ color: m.recall10 != null && th && m.recall10 >= th.recall10_min ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>{pct(m.recall10)}</span>}
                  u={`门槛 ≥${th ? pct(th.recall10_min, 0) : '—'}`}
                />
                <KpiCard k="MRR" v={m.mrr ?? '—'} u="观察值" />
                <KpiCard
                  k="有害召回"
                  v={<span style={{ color: th && m.harmful_rate <= th.harmful_max ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>{pct(m.harmful_rate)}</span>}
                  u={`门槛 ≤${th ? pct(th.harmful_max, 0) : '—'}`}
                />
                <KpiCard
                  k="高危必召回"
                  v={m.emergency_recall == null ? <span className="hint">本次无高危题</span> : <span style={{ color: th && m.emergency_recall >= th.emergency_min ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>{pct(m.emergency_recall, 0)}</span>}
                  u={th && th.emergency_gate ? `要求 ${pct(th.emergency_min, 0)}` : '仅展示'}
                />
              </div>
              {Object.keys(buckets).length > 0 && (
                <div className="hint" style={{ marginTop: 8 }}>
                  失败分类：
                  {Object.entries(buckets).map(([k, n]) => (
                    <button
                      key={k}
                      type="button"
                      className={`tag ${attrFilter === k ? 'tag-active' : ''}`}
                      style={{ marginRight: 6, cursor: 'pointer' }}
                      onClick={() => setAttrFilter(attrFilter === k ? 'all' : k)}
                      title="点击只看这一类"
                    >
                      {ATTR_LABEL[k] || k} {n}
                    </button>
                  ))}
                  {attrFilter !== 'all' && (
                    <button type="button" className="btn" style={{ marginLeft: 6 }} onClick={() => setAttrFilter('all')}>
                      清除归因筛选
                    </button>
                  )}
                </div>
              )}
              {run.delta && (
                <div className="hint" style={{ marginTop: 8 }}>
                  较上次（{fmtTime(run.delta.prev_created_at)} · {run.delta.prev_run_id}）：
                  {!run.delta.metric_version_same && <b style={{ color: 'var(--danger)' }}>口径不一致，分数仅部分可比；</b>}
                  {Object.entries(run.delta.metrics).map(([k, dv]) => (
                    <span key={k} style={{ marginRight: 8 }}>
                      {k === 'recall5' ? 'Recall@5' : k === 'recall10' ? 'Recall@10' : k === 'mrr' ? 'MRR' : k === 'harmful_rate' ? '有害' : k === 'emergency_recall' ? '高危' : k}
                      {' '}{dv >= 0 ? '+' : ''}{dv}{k === 'mrr' ? '' : 'pt'}
                    </span>
                  ))}
                  {run.delta.new_miss.length > 0 && (
                    <span>· 新增未命中 {run.delta.new_miss.length}（{run.delta.new_miss.join('、')}）</span>
                  )}
                  {run.delta.fixed.length > 0 && <span> · 已修复 {run.delta.fixed.length}（{run.delta.fixed.join('、')}）</span>}
                  {run.delta.still_miss.length > 0 && <span> · 持续未命中 {run.delta.still_miss.length}</span>}
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <KV
                  rows={[
                    ['embedding 模型', run.env_snapshot.embedding || '—'],
                    ['检索参数', `返回前 ${run.env_snapshot.top_k ?? '—'} 条 · 诊断深度 ${run.env_snapshot.diag_depth ?? '—'} · RRF 融合 k=${run.env_snapshot.rrf_k ?? '—'}`],
                    ['语料规模', run.env_snapshot.kb_rows != null ? `${run.env_snapshot.kb_rows} 条` : '—'],
                    ['用例集', run.env_snapshot.case_set ? `${run.env_snapshot.case_set.count} 题 · #${run.env_snapshot.case_set.hash}` : '—'],
                    ['口径 / 版本', `${run.env_snapshot.metric_version || '—'} · 用例集版本 ${run.env_snapshot.gold_version || '—'} · 提交 ${run.env_snapshot.git || '—'}`],
                  ]}
                />
              </div>
            </>
          ) : null}
          {!isRunning && !m && (
            <Empty title="这次运行没有产出指标">{run.error || '运行被前置检查拦下或未执行'}</Empty>
          )}
          {run.error && m ? <Notice tone="warn">{run.error}</Notice> : null}
        </CardBody>
      </Card>

      {cases.length > 0 && (
        <Card>
          <CardHead
            title="逐题结果"
            meta={
              <div className="toolbar" style={{ margin: 0 }}>
                <button className={`btn ${caseFilter === 'all' ? 'btn-primary' : ''}`} onClick={() => setCaseFilter('all')}>
                  全部 {cases.length}
                </button>
                <button className={`btn ${caseFilter === 'miss' ? 'btn-primary' : ''}`} onClick={() => setCaseFilter('miss')}>
                  未命中 {missCount}
                </button>
                <button className={`btn ${caseFilter === 'harmful' ? 'btn-primary' : ''}`} onClick={() => setCaseFilter('harmful')}>
                  有害 {harmfulCount}
                </button>
              </div>
            }
          />
          <CardBody flush>
            {/* 结果列 156：容下「✗ 未命中 · 排序问题」Pill（≈119px）；74 时必被截。
                首命中位次列 84：容下 5 字表头（≈55px）；74 时表头贴边被截 */}
            <Table cols={[70, 0, 156, 84, 76, 60, 30]}>
              <thead>
                <tr>
                  <th>题号</th>
                  <th>问题</th>
                  <th>结果</th>
                  <th className="num">首命中位次</th>
                  <th className="num">首位得分</th>
                  <th className="num">耗时</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <Fragment key={c.case_id}>
                    <tr onClick={() => setExpanded(expanded === c.case_id ? null : c.case_id)} style={{ cursor: 'pointer' }}>
                      <td className="mono">{c.case_id}</td>
                      <td className="wrap">{c.question}</td>
                      <td>
                        {c.verdict === 'hit' ? <Pill kind="ok">✓ {VERDICT_LABEL.hit}</Pill>
                          : c.verdict === 'miss'
                            ? <Pill kind="danger">✗ {VERDICT_LABEL.miss}{c.attribution ? ` · ${ATTR_LABEL[c.attribution] || c.attribution}` : ''}</Pill>
                            : <Pill kind="plain">{VERDICT_LABEL.out_of_scope}</Pill>}
                      </td>
                      <td className="num">{c.first_hit_rank ?? '—'}</td>
                      <td className="num">{c.top1_score ?? '—'}</td>
                      <td className="num">{c.ms != null ? `${(c.ms / 1000).toFixed(1)}s` : '—'}</td>
                      <td className="hint">{expanded === c.case_id ? '▾' : '▸'}</td>
                    </tr>
                    {expanded === c.case_id && (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--neutral-bg)' }}>
                          <CaseDrill runId={runId} c={c} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={7} className="hint">没有匹配的题目</td>
                  </tr>
                )}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      )}
    </>
  )
}

/* ── 逐题钻取（US-06）────────────────────────────────────────────── */

function CaseDrill({ runId, c }: { runId: string; c: QualityCaseResult }) {
  const { toast } = useApp()
  const [recorded, setRecorded] = useState(false)

  async function toGap() {
    try {
      await qualityApi.caseToGap(runId, c.case_id)
      setRecorded(true)
      toast(`已记入知识缺口：${c.case_id}`)
    } catch (e) {
      toast(`记入失败：${(e as Error).message}`, 6000)
    }
  }

  return (
    <div style={{ padding: '9px 6px', fontSize: 13, lineHeight: 1.9 }}>
      {(['gold', 'acceptable', 'negative'] as const).map((tier) => {
        const rows = c.expected?.[tier] || []
        if (!rows.length) return null
        return (
          <div key={tier}>
            <b>{{ gold: '期望 gold（必命中）', acceptable: '期望 acceptable（命中不算错）', negative: '期望 negative（进 top5 记有害）' }[tier]}</b>
            {rows.map((t) => (
              <div key={t.kb_id} style={{ marginLeft: 12 }} className="hint">
                <span className="mono">{t.kb_id}</span> {t.title ? `· ${t.title}` : ''}
                {t.state !== 'enabled' && <span style={{ marginLeft: 6 }}>［{CHUNK_STATE_LABEL[t.state] || t.state}］</span>}
              </div>
            ))}
          </div>
        )
      })}
      {c.topk?.length ? (
        <div>
          <b>实得前 {c.topk.length} 条</b>
          {c.topk.map((t) => (
            <div key={t.rank} style={{ marginLeft: 12 }}>
              <span className="mono">{t.rank}.</span>{' '}
              <span className="mono">{t.kb_id}</span> {t.title ? `· ${t.title}` : ''}{' '}
              <span className="hint">（分 {t.score}）</span>{' '}
              {t.tier !== 'unlabeled' && (
                <Pill kind={t.tier === 'gold' ? 'accent' : t.tier === 'acceptable' ? 'ok' : 'danger'}>
                  {TIER_LABEL[t.tier] || t.tier}
                </Pill>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {c.harmful?.length ? (
        <div>
          <b>有害命中（negative 层进 top-5）</b>：
          {c.harmful.map((h) => (
            <span key={h.kb_id} className="tag" style={{ marginRight: 6 }}>#{h.rank} {h.kb_id}</span>
          ))}
        </div>
      ) : null}
      {c.verdict === 'miss' && (
        <div>
          <b>归因</b>：
          <Pill kind="warn">{ATTR_LABEL[c.attribution || ''] || c.attribution || '未知'}</Pill>{' '}
          {attributionHint(c)}
          {c.attribution && ATTR_ACTION[c.attribution] ? <div className="hint">建议：{ATTR_ACTION[c.attribution]}</div> : null}
          <div className="toolbar" style={{ margin: '6px 0 0' }}>
            <button type="button" className="btn" onClick={toGap} disabled={recorded}>
              {recorded ? '已记入知识缺口' : '记入知识缺口'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
