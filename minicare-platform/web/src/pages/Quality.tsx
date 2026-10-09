import { useCallback, useEffect, useState } from 'react'
import { Card, CardBody, CardHead, Empty, ErrorBox, KpiCard, KV, Loading, Notice, Pill } from '../components/ui'
import { useApp } from '../lib/app-context'
import {
  ATTR_LABEL, fmtDuration, fmtTime, moduleLabel, pct, qualityApi, RUN_STATUS_LABEL, statusPillKind, verdictPill,
  type QualityOverview, type QualityProgress,
} from '../lib/quality'

/**
 * 页面：检索质检台（PRD-011）—— 质检台总览 · 发起 · 最新结论。
 *
 * 三块视图（自上而下）：
 *   ① 发起区：范围单选（全部 / 按模块 / 仅高危 / 仅负样本）；前置条件不满足时给缺口清单
 *   ② 运行中进度：2s 轮询（可离开本页、可中止；中止保留已完成部分）
 *   ③ 最新运行结论：五项指标 + 较上次 delta + 失败分类 + 环境快照
 * 入口线索：用例集（导入/体检）、执行记录（台账/钻取）、检索测试（即席单题排查）。
 */
export function QualityPage() {
  const { go, toast, nonce } = useApp()
  const [ov, setOv] = useState<QualityOverview | null>(null)
  const [progress, setProgress] = useState<QualityProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 发起参数
  const [scopeKind, setScopeKind] = useState<'all' | 'modules' | 'emergency' | 'out_of_scope'>('all')
  const [modules, setModules] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const reload = useCallback(async () => {
    try {
      setLoadError(null)
      setOv(await qualityApi.overview())
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload, nonce])

  const runningId = ov?.running?.run_id
    || (ov?.latest?.status === 'running' ? ov.latest.run_id : null)
  const isRunning = Boolean(runningId)

  /* ── 运行中轮询（2s），结束自动收尾 ── */
  useEffect(() => {
    if (!runningId) return
    let stop = false
    let timer: number | undefined
    const tick = async () => {
      try {
        const p = await qualityApi.progress(runningId)
        setProgress(p)
        if (p.status !== 'running') {
          setProgress(null)
          toast(`质检结束：${RUN_STATUS_LABEL[p.status] || p.status}（${runningId}）`)
          await reload()
          return
        }
      } catch {
        /* 服务重启窗口等：静默重试 */
      }
      if (!stop) timer = window.setTimeout(tick, 2000)
    }
    timer = window.setTimeout(tick, 600)
    return () => {
      stop = true
      if (timer) window.clearTimeout(timer)
    }
  }, [runningId, toast, reload])

  if (loading && !ov) return <Loading />
  if (loadError && !ov) return <ErrorBox error={new Error(loadError)} />
  if (!ov) return null

  const th = ov.thresholds
  const latest = ov.latest
  const latestVerdict = latest ? verdictPill(latest) : null

  /* ── 范围与可发起性 ── */
  const moduleKeys = Object.keys(ov.cases.by_module).filter((m) => m !== 'N').sort()
  const scopeStr = scopeKind === 'modules'
    ? (modules.length ? `modules:${modules.join(',')}` : '')
    : scopeKind
  const scopeCount = scopeKind === 'all' ? ov.cases.enabled
    : scopeKind === 'emergency' ? (ov.cases.by_risk.emergency || 0)
      : scopeKind === 'out_of_scope' ? ov.cases.out_of_scope
        : modules.reduce((n, m) => n + (ov.cases.by_module[m] || 0), 0)

  const issues: string[] = []
  if (!ov.health.tokenhub) {
    issues.push('未配置 TOKENHUB_API_KEY（minicare-platform/api/.env）——质检要求与线上一致的混合检索（FULLTEXT + 向量），补上密钥后才能发起')
  }
  if (ov.health.db_ok === false) issues.push(`数据库不可达：${ov.health.db_error || '未知原因'}`)
  if (ov.cases.mapping.blocked > 0) {
    issues.push(`${ov.cases.mapping.blocked} 道题的 gold 全部失效或未映射——到「用例集」看映射体检并重新导入映射`)
  }
  if (isRunning) issues.push(`已有质检运行进行中（${runningId}）——等待完成或先中止`)

  async function start() {
    if (!scopeStr) {
      toast('请先勾选至少一个模块')
      return
    }
    setStarting(true)
    try {
      const r = await qualityApi.start(scopeStr)
      toast(`已发起质检 ${r.run_id}（${r.scope_label}）`)
      setProgress({
        run_id: r.run_id, status: 'running', live: true, done: 0, total: r.case_count,
        current: null, elapsed_ms: 0, recent: [],
      })
      await reload()
    } catch (e) {
      toast(`发起失败：${(e as Error).message}`, 8000)
    } finally {
      setStarting(false)
    }
  }

  async function cancelRun() {
    if (!runningId) return
    if (!confirmCancel) {
      setConfirmCancel(true)
      window.setTimeout(() => setConfirmCancel(false), 4000)
      return
    }
    setConfirmCancel(false)
    try {
      await qualityApi.cancel(runningId)
      toast('已请求中止，等待当前题结束…')
    } catch (e) {
      toast(`中止失败：${(e as Error).message}`, 6000)
    }
  }

  const shownProgressDone = progress?.done ?? ov.running?.done ?? 0
  const shownProgressTotal = progress?.total || ov.running?.total || scopeCount || 0
  const shownCurrent = progress?.current ?? ov.running?.current ?? null

  return (
    <>
      {/* ⓪ 空态引导：还没导入测试集 */}
      {ov.cases.total === 0 && (
        <Card>
          <CardHead title="检索质检" />
          <CardBody>
            <Empty title="还没有测试集">
              检索质检要先有题目。到「用例集」导入种子 50 题与映射表（两步式：先解析体检、确认后写入）。
              <div className="toolbar" style={{ justifyContent: 'center', marginTop: 10 }}>
                <button type="button" className="btn btn-primary" onClick={() => go('qualitycases')}>
                  去导入测试集
                </button>
              </div>
            </Empty>
          </CardBody>
        </Card>
      )}

      {/* ① 发起区 */}
      {ov.cases.total > 0 && (
        <Card>
          <CardHead title="发起质检" />
          <CardBody>
            <div className="toolbar" style={{ margin: 0, flexWrap: 'wrap', rowGap: 8 }}>
              <span className="hint">范围</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input type="radio" checked={scopeKind === 'all'} onChange={() => setScopeKind('all')} />
                全部（{ov.cases.enabled} 题）
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input type="radio" checked={scopeKind === 'modules'} onChange={() => setScopeKind('modules')} />
                按模块
              </label>
              {scopeKind === 'modules' && (
                <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                  {moduleKeys.map((m) => (
                    <label key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <input
                        type="checkbox"
                        checked={modules.includes(m)}
                        onChange={(e) => setModules((cur) => (e.target.checked ? [...cur, m] : cur.filter((x) => x !== m)))}
                      />
                      {moduleLabel(ov.cases, m)}（{ov.cases.by_module[m]}）
                    </label>
                  ))}
                </span>
              )}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input type="radio" checked={scopeKind === 'emergency'} onChange={() => setScopeKind('emergency')} />
                仅高危（{ov.cases.by_risk.emergency || 0}）
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input type="radio" checked={scopeKind === 'out_of_scope'} onChange={() => setScopeKind('out_of_scope')} />
                仅负样本（{ov.cases.out_of_scope}）
              </label>
              <span className="sep" />
              <button
                className="btn btn-primary"
                onClick={start}
                disabled={starting || isRunning || issues.length > 0 || scopeCount === 0}
              >
                {starting ? '发起中…' : isRunning ? '已有运行进行中' : `开始质检（${scopeCount} 题）`}
              </button>
              <span className="hint">后台执行（约 1–3 分钟），可离开本页；指标按前 5 / 前 10 两档产出</span>
            </div>
            {issues.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {issues.map((s, i) => (
                  <Notice key={i}>{s}</Notice>
                ))}
              </div>
            )}
          </CardBody>
          <CardBody>
            <div className="toolbar" style={{ margin: 0 }}>
              <button type="button" className="btn" onClick={() => go('qualitycases')}>用例集</button>
              <button type="button" className="btn" onClick={() => go('qualityruns')}>执行记录</button>
              <button type="button" className="btn" onClick={() => go('retrievaltest')}>单题排查（检索测试）</button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ② 运行中进度 */}
      {isRunning && (
        <Card>
          <CardHead
            title={`质检进行中 · ${runningId}`}
            meta={`${shownProgressDone}/${shownProgressTotal || '?'} · 已用 ${fmtDuration(progress?.elapsed_ms)}`}
          />
          <CardBody>
            <div style={{ height: 10, borderRadius: 5, background: 'var(--line)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${shownProgressTotal ? Math.min(100, Math.round((shownProgressDone / shownProgressTotal) * 100)) : 3}%`,
                  background: 'var(--accent)',
                  transition: 'width .3s ease',
                }}
              />
            </div>
            <div style={{ margin: '8px 0', fontSize: 13 }}>
              当前题目：<b>{shownCurrent || '准备中…'}</b>
            </div>
            {progress && progress.recent.length > 0 && (
              <div className="hint" style={{ lineHeight: 2 }}>
                实时结果：
                {progress.recent.map((r) => (
                  <span
                    key={r.case_id}
                    className={`pill ${r.verdict === 'hit' ? 'ok' : r.verdict === 'miss' ? 'danger' : 'plain'}`}
                    style={{ marginRight: 6 }}
                    title={r.attribution ? ATTR_LABEL[r.attribution] || r.attribution : ''}
                  >
                    {r.verdict === 'hit' ? '✓' : r.verdict === 'miss' ? '✗' : '·'} {r.case_id}
                  </span>
                ))}
              </div>
            )}
            <div className="toolbar" style={{ margin: '10px 0 0' }}>
              <button className={confirmCancel ? 'btn btn-danger' : 'btn'} onClick={cancelRun}>
                {confirmCancel ? '确认中止？' : '中止运行'}
              </button>
              <span className="hint">中止后已完成题目的结果会保留；可离开本页，运行在后端继续</span>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ③ 最新运行结论 */}
      {latest ? (
        <Card>
          <CardHead
            title={`最新运行 · ${latest.run_id}`}
            meta={
              <>
                <Pill kind={statusPillKind(latest.status)}>{RUN_STATUS_LABEL[latest.status] || latest.status}</Pill>
                {' '}
                {latest.scope_label} · {fmtTime(latest.created_at)} · 耗时 {fmtDuration(latest.duration_ms)}
              </>
            }
          />
          <CardBody>
            {latest.metrics ? (
              <>
                <div style={{ marginBottom: 8 }}>
                  结论：{latestVerdict ? <Pill kind={latestVerdict.kind}>{latestVerdict.text}</Pill> : null}
                  {' '}
                  <span className="hint">
                    覆盖 {latest.metrics.answerable}/{latest.metrics.n} 题
                    {latest.metrics.out_of_scope ? `（另负样本 ${latest.metrics.out_of_scope}）` : ''}
                    {latest.status === 'cancelled' ? ' · 已中止，按已完成部分计算' : ''}
                  </span>
                </div>
                <div className="kpis">
                  <KpiCard
                    k="Recall@5"
                    v={<span style={{ color: latest.metrics.recall5 != null && latest.metrics.recall5 >= th.recall5_min ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>{pct(latest.metrics.recall5)}</span>}
                    u={`门槛 ≥${pct(th.recall5_min, 0)}`}
                  />
                  <KpiCard
                    k="Recall@10"
                    v={<span style={{ color: latest.metrics.recall10 != null && latest.metrics.recall10 >= th.recall10_min ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>{pct(latest.metrics.recall10)}</span>}
                    u={`门槛 ≥${pct(th.recall10_min, 0)}`}
                  />
                  <KpiCard k="MRR" v={latest.metrics.mrr ?? '—'} u="观察值" />
                  <KpiCard
                    k="有害召回"
                    v={<span style={{ color: latest.metrics.harmful_rate <= th.harmful_max ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>{pct(latest.metrics.harmful_rate)}</span>}
                    u={`门槛 ≤${pct(th.harmful_max, 0)}`}
                  />
                  <KpiCard
                    k="高危必召回"
                    v={latest.metrics.emergency_recall == null ? <span className="hint">本次无高危题</span> : <span style={{ color: latest.metrics.emergency_recall >= th.emergency_min ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>{pct(latest.metrics.emergency_recall, 0)}</span>}
                    u={th.emergency_gate ? `要求 ${pct(th.emergency_min, 0)}` : '仅展示（未纳入判定）'}
                  />
                </div>
                {Object.keys(latest.metrics.buckets || {}).length > 0 && (
                  <div className="hint" style={{ marginTop: 8 }}>
                    失败分类：
                    {Object.entries(latest.metrics.buckets).map(([k, n]) => (
                      <span key={k} className="tag" style={{ marginRight: 6 }}>
                        {ATTR_LABEL[k] || k} {n}
                      </span>
                    ))}
                  </div>
                )}
                {ov.delta && ov.latest?.run_id === latest.run_id && (
                  <div className="hint" style={{ marginTop: 8 }}>
                    较上次（{fmtTime(ov.delta.prev_created_at)} · {ov.delta.prev_run_id}）：
                    {!ov.delta.metric_version_same && <b style={{ color: 'var(--danger)' }}>口径不一致，分数仅部分可比；</b>}
                    {Object.entries(ov.delta.metrics).map(([k, v]) => (
                      <span key={k} style={{ marginRight: 8 }}>
                        {k === 'recall5' ? 'Recall@5' : k === 'recall10' ? 'Recall@10' : k === 'mrr' ? 'MRR' : k === 'harmful_rate' ? '有害' : k === 'emergency_recall' ? '高危' : k}
                        {' '}{v >= 0 ? '+' : ''}{v}{k === 'mrr' ? '' : 'pt'}
                      </span>
                    ))}
                    {ov.delta.new_miss.length > 0 ? `· 新增未命中 ${ov.delta.new_miss.length}（${ov.delta.new_miss.join('、')}）` : ''}
                    {ov.delta.fixed.length > 0 ? ` · 已修复 ${ov.delta.fixed.length}` : ''}
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <KV
                    rows={[
                      ['embedding 模型', latest.env_snapshot.embedding || '—'],
                      ['检索参数', `返回前 ${latest.env_snapshot.top_k ?? '—'} 条 · 诊断深度 ${latest.env_snapshot.diag_depth ?? '—'} · RRF 融合 k=${latest.env_snapshot.rrf_k ?? '—'}`],
                      ['语料规模', latest.env_snapshot.kb_rows != null ? `${latest.env_snapshot.kb_rows} 条` : '—'],
                      ['用例集', latest.env_snapshot.case_set ? `${latest.env_snapshot.case_set.count} 题 · #${latest.env_snapshot.case_set.hash}` : '—'],
                      ['口径 / 版本', `${latest.env_snapshot.metric_version || '—'} · 用例集版本 ${latest.env_snapshot.gold_version || '—'} · 提交 ${latest.env_snapshot.git || '—'}`],
                    ]}
                  />
                </div>
                {latest.error ? <Notice tone="warn">{latest.error}</Notice> : null}
                <div className="toolbar" style={{ margin: '10px 0 0' }}>
                  <button type="button" className="btn btn-primary" onClick={() => go('qualityruns', { doc: latest.run_id })}>
                    查看逐题详情
                  </button>
                  <button type="button" className="btn" onClick={() => go('gaps')}>知识缺口</button>
                </div>
              </>
            ) : (
              <Empty title="这次运行没有产出指标">{latest.error || '运行被前置检查拦下或未执行'}</Empty>
            )}
          </CardBody>
        </Card>
      ) : (
        ov.cases.total > 0 && (
          <Card>
            <CardBody>
              <Empty title="还没有质检运行">选好范围后点「开始质检」，跑第一轮。</Empty>
            </CardBody>
          </Card>
        )
      )}
    </>
  )
}
