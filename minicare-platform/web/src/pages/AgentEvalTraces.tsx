import { useCallback, useEffect, useState } from 'react'
import {
  agentEvalApi,
  EVAL_GROUPS,
  fmtTsMs,
  IGNORE_REASON_LABEL,
  priorityLabel,
  traceStatusLabel,
} from '../lib/agentEval'
import type {
  EvalTraceDetail,
  EvalTraceDupCheck,
  EvalTraceListItem,
  EvalTraceListResponse,
  TraceTriage,
} from '../lib/agentEval'
import { useApp } from '../lib/app-context'
import { Card, CardBody, CardHead, Empty, ErrorBox, Kpis, Loading, Notice, Pill, Table } from '../components/ui'

/**
 * 页面：线上沉淀（PRD-015 / TECH-032）——把线上真实问题清洗、标注为测评用例。
 *
 * 四步：捞（候选队列）→ 读（详情审阅）→ 炼（标注沉淀 / 忽略）→ 管（台账与查重）。
 * 数据源 = FlexDB（只读，经后端脚本通道）；Langfuse 仅作对照深链接（旁路口径）。
 * 刷新策略：手动刷新 + 筛选变更即查（列表页无长驻运行态，不做自动轮询）。
 */

type StateFilter = 'untreated' | 'converted' | 'ignored' | 'all'
const PAGE_LIMIT = 20

const STATE_TABS: [StateFilter, string][] = [
  ['untreated', '未处理'],
  ['all', '全部'],
  ['converted', '已沉淀'],
  ['ignored', '已忽略'],
]

const triagePill = (state: string) =>
  state === 'converted' ? (
    <Pill kind="ok">已沉淀</Pill>
  ) : state === 'ignored' ? (
    <Pill kind="warn">已忽略</Pill>
  ) : (
    <Pill kind="plain">未处理</Pill>
  )

export function AgentEvalTracesPage() {
  const { toast, nonce } = useApp()
  const [days, setDays] = useState(7)
  const [stateFilter, setStateFilter] = useState<StateFilter>('untreated')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<EvalTraceListItem[]>([])
  const [counts, setCounts] = useState<EvalTraceListResponse['counts'] | null>(null)
  const [filtered, setFiltered] = useState(0)
  const [err, setErr] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const [moreBusy, setMoreBusy] = useState(false)
  /** 当前抽屉：记录 traceId 与其发生时间（用于"继续处理下一条"的定位；条目被处置移出列表后仍有效） */
  const [open, setOpen] = useState<{ id: string; startedAt: number | null } | null>(null)

  const paramsOf = useCallback(
    (offset: number) => {
      const p = new URLSearchParams({
        days: String(days),
        state: stateFilter,
        limit: String(PAGE_LIMIT),
        offset: String(offset),
      })
      if (q.trim()) p.set('q', q.trim())
      return `?${p.toString()}`
    },
    [days, stateFilter, q],
  )

  const load = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await agentEvalApi.listTraces(paramsOf(0))
      setItems(r.items)
      setCounts(r.counts)
      setFiltered(r.filtered)
    } catch (e) {
      setErr(e as Error)
      setItems([])
      setCounts(null)
    } finally {
      setBusy(false)
    }
  }, [paramsOf])

  const loadMore = async () => {
    setMoreBusy(true)
    try {
      const r = await agentEvalApi.listTraces(paramsOf(items.length))
      setItems((prev) => [...prev, ...r.items])
      setCounts(r.counts)
      setFiltered(r.filtered)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setMoreBusy(false)
    }
  }

  useEffect(() => {
    load()
  }, [load, nonce])

  const openTrace = (it: EvalTraceListItem) => setOpen({ id: it.traceId, startedAt: it.startedAt })
  const switchTrace = (id: string) => {
    const hit = items.find((x) => x.traceId === id)
    setOpen((prev) => ({ id, startedAt: hit ? hit.startedAt : prev?.startedAt ?? null }))
  }

  /** 下一条未处理：按时间倒序取"比当前更早的第一条"（当前条目被处置移出列表后依然定位准确） */
  const nextUntreated: EvalTraceListItem | null = (() => {
    const pool = items.filter((x) => x.state === 'untreated' && x.traceId !== open?.id)
    if (!pool.length) return null
    if (open?.startedAt != null) return pool.find((x) => x.startedAt < open.startedAt!) || null
    return pool[0]
  })()

  return (
    <>
      <Card>
        <CardHead title="线上沉淀" meta={counts ? `近 ${days} 天共 ${counts.total} 条` : undefined} />
        <CardBody>
          {counts && (
            <Kpis
              items={[
                ['未处理', counts.untreated],
                ['已沉淀', counts.converted],
                ['已忽略', counts.ignored],
              ]}
            />
          )}
          <div className="trace-filters">
            <div className="seg">
              {STATE_TABS.map(([id, label]) => (
                <button
                  key={id}
                  className={`seg-btn${stateFilter === id ? ' on' : ''}`}
                  onClick={() => setStateFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={3}>近 3 天</option>
              <option value={7}>近 7 天</option>
              <option value={30}>近 30 天</option>
            </select>
            <input
              type="text"
              placeholder="搜索问题文本"
              value={qInput}
              style={{ width: 200 }}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setQ(qInput)
              }}
            />
            <button className="btn" onClick={() => setQ(qInput)}>查询</button>
            <button className="btn" onClick={() => { setQInput(''); setQ('') }}>清除</button>
            <button className="btn" onClick={load} disabled={busy}>{busy ? '刷新中…' : '刷新'}</button>
          </div>

          {err && <ErrorBox error={err} />}
          {!err && busy && items.length === 0 && <Loading />}
          {!err && !busy && items.length === 0 && (
            <Empty title="没有符合条件的线上问题">
              当前窗口（近 {days} 天 · {STATE_TABS.find(([id]) => id === stateFilter)?.[1]}）下没有记录；
              线上 agent 产生新对话后，或调整筛选条件再试。
            </Empty>
          )}

          {items.length > 0 && (
            <>
              <Table cols={[104, 0, 90, 150]}>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>问题</th>
                    <th>状态</th>
                    <th>处置</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.traceId} style={{ cursor: 'pointer' }} onClick={() => openTrace(it)}>
                      <td className="mono">{fmtTsMs(it.startedAt)}</td>
                      <td className="wrap" title={it.message}>{it.message || '—'}</td>
                      <td>{triagePill(it.state)}</td>
                      <td className="hint">
                        {it.state === 'converted' && it.case_id ? (
                          <span className="mono">{it.case_id}</span>
                        ) : it.state === 'ignored' ? (
                          IGNORE_REASON_LABEL[it.reason || ''] || it.reason || '—'
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {filtered > items.length && (
                <div className="trace-more">
                  <button className="btn" onClick={loadMore} disabled={moreBusy}>
                    {moreBusy ? '加载中…' : `加载更多（还有 ${filtered - items.length} 条）`}
                  </button>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {open && (
        <TraceDrawer
          traceId={open.id}
          onClose={() => setOpen(null)}
          onChanged={load}
          onSwitch={switchTrace}
          nextItem={nextUntreated}
        />
      )}
    </>
  )
}

/* ── 详情抽屉（三视图：审阅 / 标注 / 忽略）──────────────────────────────── */

function TraceDrawer({
  traceId,
  onClose,
  onChanged,
  onSwitch,
  nextItem,
}: {
  traceId: string
  onClose: () => void
  onChanged: () => void
  onSwitch: (id: string) => void
  nextItem: EvalTraceListItem | null
}) {
  const { toast } = useApp()
  const [detail, setDetail] = useState<EvalTraceDetail | null>(null)
  const [err, setErr] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'view' | 'convert' | 'ignore'>('view')

  useEffect(() => {
    let alive = true
    setDetail(null)
    setErr(null)
    setMode('view')
    setBusy(true)
    agentEvalApi
      .getTrace(traceId)
      .then((d) => {
        if (alive) setDetail(d)
      })
      .catch((e) => {
        if (alive) setErr(e as Error)
      })
      .finally(() => {
        if (alive) setBusy(false)
      })
    return () => {
      alive = false
    }
  }, [traceId])

  const applyTriage = (t: TraceTriage) => {
    setDetail((d) => (d ? { ...d, triage: t } : d))
    onChanged()
  }

  const reopen = async () => {
    setBusy(true)
    try {
      const r = await agentEvalApi.reopenTrace(traceId)
      applyTriage(r.triage)
      toast('已恢复为未处理')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="trace-drawer-mask" onClick={onClose} />
      <div className="trace-drawer">
        <div className="trace-drawer-head">
          <div>
            <div className="trace-drawer-title">线上问题审阅</div>
            <div className="hint mono">
              {traceId.slice(0, 8)}…
              {detail ? <> · {fmtTsMs(detail.trace.startedAt)} · {traceStatusLabel(detail.trace.status)}</> : null}
            </div>
          </div>
          <button className="btn" onClick={onClose}>关闭</button>
        </div>

        {busy && !detail && <Loading />}
        {err && <ErrorBox error={err} />}

        {detail && mode === 'view' && (
          <TraceView
            detail={detail}
            busy={busy}
            onConvert={() => setMode('convert')}
            onIgnore={() => setMode('ignore')}
            onReopen={reopen}
            onSwitch={onSwitch}
          />
        )}

        {detail && mode === 'convert' && (
          <ConvertForm
            detail={detail}
            onCancel={() => setMode('view')}
            onConverted={(t) => applyTriage(t)}
            nextItem={nextItem}
            onNext={onSwitch}
          />
        )}

        {detail && mode === 'ignore' && (
          <IgnoreForm
            traceId={traceId}
            onCancel={() => setMode('view')}
            onIgnored={(t) => {
              applyTriage(t)
              setMode('view')
              toast('已忽略')
            }}
          />
        )}
      </div>
    </>
  )
}

/* ── 视图一：审阅 ───────────────────────────────────────────────────────── */

function TraceView({
  detail,
  onConvert,
  onIgnore,
  onReopen,
  onSwitch,
  busy,
}: {
  detail: EvalTraceDetail
  onConvert: () => void
  onIgnore: () => void
  onReopen: () => void
  onSwitch: (id: string) => void
  busy: boolean
}) {
  const t = detail.trace
  const tri = detail.triage
  const meta = t.metadata || {}
  const toolCount = detail.observationsBrief.filter((o) => o.type === 'span').length

  return (
    <div className="trace-body">
      <div className="trace-status-line">
        {triagePill(tri.state)}
        {tri.state === 'converted' && tri.case_id && (
          <span className="hint">已生成用例 <span className="mono">{tri.case_id}</span>（在「测评用例」中精编与使用）</span>
        )}
        {tri.state === 'ignored' && (
          <span className="hint">
            忽略原因：{IGNORE_REASON_LABEL[tri.reason || ''] || tri.reason}
            {tri.note ? ` · ${tri.note}` : ''}
          </span>
        )}
        {tri.state !== 'untreated' && (
          <button className="btn btn-mini" onClick={onReopen} disabled={busy}>恢复为未处理</button>
        )}
      </div>

      <div className="trace-meta hint">
        {meta.model ? <>模型 {meta.model} · </> : null}
        {meta.totalMs != null ? <>耗时 {(meta.totalMs / 1000).toFixed(1)}s · </> : null}
        {meta.eventCount != null ? <>{meta.eventCount} 事件 · </> : null}
        {meta.forceFinished ? <>被强制收尾 · </> : null}
        {t.input?.images ? <>{t.input.images} 张图片 · </> : null}
        {t.imported ? (
          <a href={detail.langfuseUrl} target="_blank" rel="noreferrer">在 Langfuse 打开 ↗</a>
        ) : (
          <span>尚未同步到 Langfuse（可在「观测」页同步后对照）</span>
        )}
      </div>

      <div className="trace-block">
        <div className="trace-block-h">问题</div>
        <div className="trace-text">{t.input?.message || '—'}</div>
      </div>

      <div className="trace-block">
        <div className="trace-block-h">回答</div>
        <div className="trace-text trace-scroll">{t.output || '（无回答，对话被中断）'}</div>
      </div>

      <div className="trace-block">
        <div className="trace-block-h">
          工具轨迹（{toolCount} 次调用 / {detail.observationsBrief.length} 项记录）
        </div>
        {detail.observationsBrief.length === 0 ? (
          <div className="hint">（无工具调用与轮次记录）</div>
        ) : (
          detail.observationsBrief.map((o, i) => (
            <details key={i} className="trace-obs">
              <summary>
                <span className={o.level === 'DEFAULT' ? '' : 'trace-warn'}>
                  {o.type === 'span' ? '工具' : '轮次'} · {o.name || '未命名'}
                </span>
                <span className="hint">
                  {o.ms != null ? ` ${o.ms}ms` : ''}
                  {o.level !== 'DEFAULT' ? ` · ${o.level}` : ''}
                </span>
              </summary>
              {o.inputBrief && (
                <>
                  <div className="trace-block-h">入参</div>
                  <pre className="trace-pre">{o.inputBrief}</pre>
                </>
              )}
              {o.outputBrief && (
                <>
                  <div className="trace-block-h">输出</div>
                  <pre className="trace-pre">{o.outputBrief}</pre>
                </>
              )}
              {o.statusMessage && <div className="hint">{o.statusMessage}</div>}
            </details>
          ))
        )}
      </div>

      {detail.sessionContext.length > 0 && (
        <div className="trace-block">
          <div className="trace-block-h">同会话上下文</div>
          {detail.sessionContext.map((s) => (
            <div key={s.traceId} className="trace-sibling" onClick={() => onSwitch(s.traceId)} title="点击查看这条">
              <span className="mono">{fmtTsMs(s.startedAt)}</span> {s.messageBrief || '—'}
            </div>
          ))}
        </div>
      )}

      {tri.state === 'untreated' && (
        <div className="trace-actions">
          <button className="btn btn-primary" onClick={onConvert}>沉淀为用例</button>
          <button className="btn" onClick={onIgnore}>忽略</button>
        </div>
      )}
    </div>
  )
}

/* ── 视图二：标注表单（沉淀为用例）──────────────────────────────────────── */

function ConvertForm({
  detail,
  onCancel,
  onConverted,
  nextItem,
  onNext,
}: {
  detail: EvalTraceDetail
  onCancel: () => void
  /** 生成成功后回调（父级刷新台账；本组件保持在"成功态"提供两个去向） */
  onConverted: (t: TraceTriage) => void
  nextItem: EvalTraceListItem | null
  onNext: (id: string) => void
}) {
  const { toast, go } = useApp()
  const original = detail.trace.input?.message || ''
  const [title, setTitle] = useState(original.slice(0, 30))
  const [message, setMessage] = useState(original)
  const [editing, setEditing] = useState(false)
  const [grp, setGrp] = useState('')
  const [priority, setPriority] = useState('P1')
  const [points, setPoints] = useState('')
  const [joinRegression, setJoinRegression] = useState(false)
  const [dup, setDup] = useState<EvalTraceDupCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  // 进入即查重（纯提示，不阻塞保存）
  useEffect(() => {
    let alive = true
    agentEvalApi
      .traceDupCheck(original)
      .then((d) => {
        if (alive && (d.exact.length || d.contains.length)) setDup(d)
      })
      .catch(() => {
        /* 查重失败静默降级 */
      })
    return () => {
      alive = false
    }
  }, [original])

  const save = async () => {
    if (!title.trim()) return toast('请填写标题')
    if (!grp) return toast('请选择分组')
    if (!points.trim()) return toast('请填写期望行为要点（至少一条）')
    setBusy(true)
    try {
      const r = await agentEvalApi.convertTrace(detail.trace.traceId, {
        title: title.trim(),
        grp,
        priority,
        expectedPoints: points,
        ...(editing && message.trim() !== original ? { messageOverride: message.trim() } : {}),
        joinRegression,
      })
      setDone(r.case_id)
      toast(`已生成用例 ${r.case_id}`)
      onConverted(r.triage)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="trace-body">
        <Notice tone="ok">
          已生成用例 <b className="mono">{done}</b>：已自动打「真实数据」标签{joinRegression ? '并加入回归集' : ''}；
          可在「测评用例」中继续精编断言与判分要点。
        </Notice>
        <div className="trace-actions">
          <button className="btn btn-primary" onClick={() => go('agentevalcases')}>去测评用例查看</button>
          {nextItem ? (
            <button className="btn" onClick={() => onNext(nextItem.traceId)}>继续处理下一条 →</button>
          ) : (
            <button className="btn" disabled>已是最后一条未处理</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="trace-body">
      {dup && (
        <Notice tone="warn">
          可能重复：与既有用例{' '}
          {[...dup.exact, ...dup.contains].slice(0, 3).map((c) => (
            <span key={c} className="mono">{c} </span>
          ))}
          的问题文本高度相似{dup.samples[0] ? `（如「${dup.samples[0].message}」）` : ''}——保存将新建一条，亦可先取消改用既有用例。
        </Notice>
      )}

      <div className="trace-form">
        <label>标题 *</label>
        <input type="text" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />

        <label className="trace-label-row">
          问题（默认原样；含敏感措辞时可编辑清洗）
          {!editing && (
            <button className="btn btn-mini" onClick={() => setEditing(true)}>编辑清洗</button>
          )}
        </label>
        {editing ? (
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        ) : (
          <div className="trace-text">{message || '—'}</div>
        )}

        <div className="trace-form-row">
          <div>
            <label>分组 *</label>
            <select value={grp} onChange={(e) => setGrp(e.target.value)}>
              <option value="">请选择</option>
              {EVAL_GROUPS.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>优先级</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {['P0', 'P1', 'P2'].map((p) => (
                <option key={p} value={p}>{priorityLabel(p)}</option>
              ))}
            </select>
          </div>
        </div>

        <label>期望行为要点 *（写给裁判的判定依据，一行一条）</label>
        <textarea
          rows={6}
          value={points}
          placeholder={'例：\n先安抚并给出居家观察要点\n列出需立即就医的红旗信号\n不给出药物剂量建议'}
          onChange={(e) => setPoints(e.target.value)}
        />

        <label className="trace-checkbox">
          <input type="checkbox" checked={joinRegression} onChange={(e) => setJoinRegression(e.target.checked)} />
          同时加入回归集（自动打「回归集」标签）
        </label>
        <div className="hint">保存后自动打「真实数据」标签；来源链将记录这条线上对话（可在 Langfuse 对照）。</div>
      </div>

      <div className="trace-actions">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? '生成中…' : '保存并生成用例'}
        </button>
        <button className="btn" onClick={onCancel} disabled={busy}>取消</button>
      </div>
    </div>
  )
}

/* ── 视图三：忽略 ───────────────────────────────────────────────────────── */

function IgnoreForm({
  traceId,
  onCancel,
  onIgnored,
}: {
  traceId: string
  onCancel: () => void
  onIgnored: (t: TraceTriage) => void
}) {
  const { toast } = useApp()
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!reason) return toast('请选择忽略原因')
    if (reason === 'other' && !note.trim()) return toast('选择「其他」时请填写备注')
    setBusy(true)
    try {
      const r = await agentEvalApi.ignoreTrace(traceId, { reason, note: note.trim() || undefined })
      onIgnored(r.triage)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="trace-body">
      <div className="trace-form">
        <label>忽略原因 *</label>
        {Object.entries(IGNORE_REASON_LABEL).map(([key, label]) => (
          <label key={key} className="trace-checkbox">
            <input
              type="radio"
              name="ignore-reason"
              checked={reason === key}
              onChange={() => setReason(key)}
            />
            {label}
          </label>
        ))}
        <label>备注{reason === 'other' ? ' *' : ''}</label>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="可选说明（如「与 L0-03 完全相同」）"
        />
      </div>
      <div className="trace-actions">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? '提交中…' : '确认忽略'}
        </button>
        <button className="btn" onClick={onCancel} disabled={busy}>取消</button>
      </div>
    </div>
  )
}
