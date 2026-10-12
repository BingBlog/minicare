import { Fragment, useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { Card, CardBody, CardHead, Empty, ErrorBox, KV, Loading, Notice, Pill, Table } from '../components/ui'
import type { ObsStatus, ObsSyncRun, ObsSyncSnapshot } from '../lib/types'

/**
 * 页面：观测总览（TECH-030）—— 平台 = 观测服务控制面。
 *
 * 三卡：
 *   ① 服务状态：Langfuse 栈状态机（未安装 / 未启动 / 启动中 / 运行中 / 异常）+
 *      启动 / 停止 / 打开 Langfuse；容器明细折叠在下方；
 *   ② 数据同步：FlexDB → 本地 Langfuse（范围可选、可试跑预览、实时进度 + 日志）；
 *   ③ 同步历史：台账倒序，行可展开日志尾。
 *
 * 刷新策略（沿用平台 1s 轮询惯例的降频版）：
 *   · 全量状态 4s 轮询（后端自带节流，不会打爆 docker CLI）；
 *   · 同步运行中另起 1.2s 轮询拉实时行，结束自动回落并刷新历史。
 */

const STACK_STATUS: Record<string, { label: string; kind: string }> = {
  disabled: { label: '已关闭', kind: 'plain' },
  unknown: { label: '未知', kind: 'plain' },
  docker_missing: { label: '缺少 Docker 运行时', kind: 'danger' },
  daemon_down: { label: 'Docker 未运行', kind: 'warn' },
  starting: { label: '启动中…', kind: 'warn' },
  stopping: { label: '停止中…', kind: 'warn' },
  running: { label: '运行中', kind: 'ok' },
  degraded: { label: '异常', kind: 'danger' },
  stopped: { label: '已停止', kind: 'plain' },
  error: { label: '异常', kind: 'danger' },
}

const SYNC_STATUS: Record<string, string> = {
  idle: '—',
  running: '进行中',
  ok: '完成',
  partial: '部分失败',
  failed: '失败',
  error: '异常',
  cancelled: '已取消',
}

const SYNC_STATUS_KIND: Record<string, string> = {
  running: 'warn',
  ok: 'ok',
  partial: 'warn',
  failed: 'danger',
  error: 'danger',
  cancelled: 'plain',
}

const fmtTs = (s: string | null | undefined) => (s ? s.slice(0, 19).replace('T', ' ') : '—')

const fmtDur = (ms: number | null | undefined) => {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}s`
  return `${Math.floor(sec / 60)}m${String(Math.round(sec % 60)).padStart(2, '0')}s`
}

type ScopeMode = 'all' | 'range' | 'trace'

export function ObservabilityPage() {
  const { nonce } = useApp()
  const [st, setSt] = useState<ObsStatus | null>(null)
  const [stErr, setStErr] = useState<Error | null>(null)
  const [sync, setSync] = useState<ObsSyncSnapshot | null>(null)
  const [runs, setRuns] = useState<ObsSyncRun[]>([])
  const [busy, setBusy] = useState<'start' | 'stop' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [form, setForm] = useState<{ mode: ScopeMode; limit: number; from: string; to: string; traceId: string }>({
    mode: 'all',
    limit: 50,
    from: '',
    to: '',
    traceId: '',
  })

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.obsStatus()
      setSt(s)
      setStErr(null)
      // 同步运行中时不被 4s 的全量轮询覆盖（实时行由 1.2s 轮询维护）
      setSync((prev) => (prev && prev.running ? prev : s.sync))
    } catch (e) {
      setStErr(e as Error)
    }
  }, [])

  const loadRuns = useCallback(async () => {
    try {
      const r = await api.obsSyncRuns(50)
      setRuns(r.items)
    } catch {
      /* 历史拉取失败不打断页面 */
    }
  }, [])

  useEffect(() => {
    loadStatus()
    loadRuns()
    const t = window.setInterval(loadStatus, 4000)
    return () => window.clearInterval(t)
  }, [loadStatus, loadRuns, nonce])

  const syncRunning = sync?.running === true
  useEffect(() => {
    if (!syncRunning) return
    const t = window.setInterval(async () => {
      try {
        const s = await api.obsSyncStatus()
        setSync(s)
        if (!s.running) {
          loadStatus()
          loadRuns()
        }
      } catch {
        /* 轮询失败静默，下轮再试 */
      }
    }, 1200)
    return () => window.clearInterval(t)
  }, [syncRunning, loadStatus, loadRuns])

  const doStack = async (act: 'start' | 'stop') => {
    setBusy(act)
    setNotice(null)
    try {
      const snap = act === 'start' ? await api.obsStackStart() : await api.obsStackStop()
      setSt((prev) => (prev ? { ...prev, stack: snap } : prev))
      setNotice({
        tone: 'ok',
        text: act === 'start' ? '已触发启动，状态将自动刷新（冷启动可能需数十秒）' : '已触发停止（数据保留，下次启动直接复用）',
      })
    } catch (e) {
      setNotice({ tone: 'warn', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const doSync = async (dryRun: boolean) => {
    setSubmitting(true)
    setNotice(null)
    try {
      const snap = await api.obsSyncStart({
        mode: form.mode,
        limit: form.limit,
        from: form.mode === 'range' ? form.from : undefined,
        to: form.mode === 'range' ? form.to : undefined,
        trace_id: form.mode === 'trace' ? form.traceId.trim() : undefined,
        dry_run: dryRun,
      })
      setSync(snap)
      setNotice({ tone: 'ok', text: dryRun ? '试跑预览已开始（不导入、不回填）' : '同步已开始' })
    } catch (e) {
      setNotice({ tone: 'warn', text: (e as Error).message })
    } finally {
      setSubmitting(false)
    }
  }

  const doCancel = async () => {
    try {
      const snap = await api.obsSyncCancel()
      setSync(snap)
    } catch (e) {
      setNotice({ tone: 'warn', text: (e as Error).message })
    }
  }

  if (!st && stErr) return <ErrorBox error={stErr} />
  if (!st) return <Loading />

  const stack = st.stack
  const stInfo = STACK_STATUS[stack.state] ?? { label: stack.state, kind: 'plain' }
  const keysOk = st.config.pk_configured && st.config.sk_configured
  const liveHint = !keysOk
    ? '尚未配置 Langfuse API Key：到 Langfuse「项目设置 → API Keys」创建后填入「全局配置 → 观测」'
    : stack.state !== 'running'
      ? '观测服务未运行：先「启动观测服务」（或等待自动拉起完成）'
      : null
  const liveDisabled = !!liveHint || syncRunning || submitting

  // 进度条：候选数已知 → 按 processed/total；否则运行中显示不确定态
  const total = sync?.candidates ?? null
  const processed = sync?.processed ?? 0
  const pct = total && total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : null
  const elapsedMs =
    sync?.running && sync.started_at ? Date.now() - Date.parse(sync.started_at) : null

  return (
    <>
      <Card>
        <CardHead title="Langfuse 观测服务" meta={stack.detail || undefined} />
        <CardBody>
          <KV
            rows={[
              ['状态', <Pill key="s" kind={stInfo.kind}>{stInfo.label}</Pill>],
              [
                '服务地址',
                <a key="u" className="mono" href={st.config.public_url} target="_blank" rel="noreferrer">
                  {st.config.public_url} ↗
                </a>,
              ],
              [
                'API 密钥',
                keysOk ? (
                  <Pill key="k" kind="ok">已配置</Pill>
                ) : (
                  <Pill key="k" kind="warn">未配置</Pill>
                ),
              ],
              [
                '数据源（FlexDB）',
                st.flexdb.configured ? (
                  <Pill key="f" kind="ok">已配置</Pill>
                ) : (
                  <Pill key="f" kind="warn">未配置</Pill>
                ),
              ],
            ]}
          />

          {!st.enabled && <Notice tone="warn">观测域已在「全局配置」中关闭（观测域开关）。开启后平台才会编排观测服务。</Notice>}
          {stack.error && <pre className="obs-log">{stack.error}</pre>}

          <div className="obs-actions">
            <button
              className="btn btn-primary"
              disabled={busy !== null || stack.busy || !st.enabled}
              onClick={() => doStack('start')}
            >
              {busy === 'start' || stack.op === 'start' ? '启动中…' : '启动观测服务'}
            </button>
            <button className="btn" disabled={busy !== null || stack.busy} onClick={() => doStack('stop')}>
              {busy === 'stop' || stack.op === 'stop' ? '停止中…' : '停止'}
            </button>
            <button className="btn" onClick={() => loadStatus()}>刷新状态</button>
            <a className="btn" href={st.config.public_url} target="_blank" rel="noreferrer">
              打开 Langfuse ↗
            </a>
            {stack.health?.version && <span className="hint">版本 {stack.health.version}</span>}
          </div>

          {stack.containers.length > 0 && (
            <details className="obs-details">
              <summary>容器明细（{stack.containers.length}）</summary>
              <Table cols={[140, 90, 0]}>
                <thead>
                  <tr>
                    <th>服务</th>
                    <th>状态</th>
                    <th>运行信息</th>
                  </tr>
                </thead>
                <tbody>
                  {stack.containers.map((c) => (
                    <tr key={c.name || c.service}>
                      <td className="mono">{c.service}</td>
                      <td>{c.state}</td>
                      <td className="wrap">{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </details>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHead title="数据同步" meta="FlexDB → 本地 Langfuse" />
        <CardBody>
          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
          {!keysOk && (
            <Notice tone="warn">
              尚未配置 Langfuse API Key —— 到 Langfuse「项目设置 → API Keys」创建 pk / sk 后，填入「全局配置 → 观测」的
              Langfuse Public Key / Secret Key。密钥补齐前仍可「试跑预览」（只读取 FlexDB，不写 Langfuse）。
            </Notice>
          )}

          <div className="obs-form">
            <label>
              <input
                type="radio"
                name="obs-scope"
                checked={form.mode === 'all'}
                onChange={() => setForm((f) => ({ ...f, mode: 'all' }))}
              />
              全部未导入
            </label>
            <label>
              <input
                type="radio"
                name="obs-scope"
                checked={form.mode === 'range'}
                onChange={() => setForm((f) => ({ ...f, mode: 'range' }))}
              />
              时间范围
            </label>
            {form.mode === 'range' && (
              <>
                <input
                  type="date"
                  value={form.from}
                  onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
                />
                <span className="hint">至</span>
                <input
                  type="date"
                  value={form.to}
                  onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
                />
              </>
            )}
            <label>
              <input
                type="radio"
                name="obs-scope"
                checked={form.mode === 'trace'}
                onChange={() => setForm((f) => ({ ...f, mode: 'trace' }))}
              />
              单条 trace
            </label>
            {form.mode === 'trace' && (
              <input
                type="text"
                placeholder="trace ID"
                style={{ width: 260 }}
                value={form.traceId}
                onChange={(e) => setForm((f) => ({ ...f, traceId: e.target.value }))}
              />
            )}
            <label>
              条数上限
              <input
                type="number"
                min={1}
                max={500}
                value={form.limit}
                onChange={(e) => setForm((f) => ({ ...f, limit: Number(e.target.value) || 50 }))}
              />
            </label>
          </div>

          <div className="obs-actions">
            <button className="btn" disabled={submitting || syncRunning || !st.flexdb.configured} onClick={() => doSync(true)}>
              试跑预览
            </button>
            <button className="btn btn-primary" disabled={liveDisabled} title={liveHint ?? undefined} onClick={() => doSync(false)}>
              {syncRunning && sync?.kind === 'import' ? '同步中…' : '开始同步'}
            </button>
            {syncRunning && (
              <button className="btn btn-warn" onClick={doCancel}>
                取消
              </button>
            )}
            {liveHint && <span className="hint">{liveHint}</span>}
          </div>

          {sync && sync.status !== 'idle' && (
            <div className="obs-progress">
              <div className={`obs-bar ${sync.running && pct === null ? 'is-running' : ''}`}>
                <i style={pct !== null ? { width: `${pct}%` } : undefined} />
              </div>
              <div className="obs-progress-line">
                <Pill kind={SYNC_STATUS_KIND[sync.status] ?? 'plain'}>
                  {sync.status === 'running' ? (sync.kind === 'preview' ? '试跑中…' : '同步中…') : SYNC_STATUS[sync.status] ?? sync.status}
                </Pill>
                <span className="hint">
                  候选 {sync.candidates ?? '—'} · 已处理 {sync.processed} · 成功 {sync.ok} · 失败 {sync.fail}
                  {elapsedMs != null ? ` · 用时 ${fmtDur(elapsedMs)}` : ''}
                </span>
              </div>
              {sync.error && <div className="hint obs-err">{sync.error}</div>}
              {sync.lines.length > 0 && <pre className="obs-log">{sync.lines.join('\n')}</pre>}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHead title="同步历史" meta={`最近 ${runs.length} 条`} />
        <CardBody flush>
          {runs.length === 0 ? (
            <Empty title="暂无同步记录">点击上方「试跑预览」或「开始同步」后，这里会留档每次同步的范围与结果。</Empty>
          ) : (
            <Table cols={[150, 70, 0, 80, 70, 60, 70]}>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>方式</th>
                  <th>范围</th>
                  <th>结果</th>
                  <th className="num">成功</th>
                  <th className="num">失败</th>
                  <th className="num">耗时</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      className="obs-run-row"
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      title="点击展开日志"
                    >
                      <td className="mono">{fmtTs(r.started_at)}</td>
                      <td>{r.kind === 'preview' ? '试跑' : '导入'}</td>
                      <td className="wrap">{r.scope}</td>
                      <td>
                        <Pill kind={SYNC_STATUS_KIND[r.status] ?? 'plain'}>{SYNC_STATUS[r.status] ?? r.status}</Pill>
                      </td>
                      <td className="num">{r.ok}</td>
                      <td className="num">{r.fail}</td>
                      <td className="num">{fmtDur(r.duration_ms)}</td>
                    </tr>
                    {expanded === r.id && (
                      <tr>
                        <td colSpan={7}>
                          <pre className="obs-log">{r.log_tail || '（无日志）'}</pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  )
}
