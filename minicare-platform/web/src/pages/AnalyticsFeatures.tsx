import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { EChart } from '../components/EChart'
import { Card, CardBody, CardHead, Empty, Loading, Notice, Pill, Table } from '../components/ui'
import { useApp } from '../lib/app-context'
import {
  DASH,
  VIEW_HINT,
  VIEW_LABEL,
  WINDOWS,
  WINDOW_LABEL,
  analyticsApi,
  fmtInt,
  fmtPct,
  fmtRatio,
  fmtTs,
  type FeatureTrendData,
  type FeatureView,
  type FeaturesData,
  type WindowKey,
} from '../lib/analytics'
import { featureBarOption, trendLineOption } from '../lib/analyticsChart'

/**
 * 页面：功能分析（PRD-016 US-04 · TECH-033 §3.3）。
 *
 * 「高频使用功能」不是一个数，而是**三个互补的视角**（页头可切换，表格里一次全给）：
 *   · 条数   —— 用了多少次（体量）
 *   · 渗透率 —— 多少人在用（覆盖面）；分母 = 同期活跃人数
 *   · 人均   —— 每人用多少次（依赖度）
 *
 * 只有三个一起看才不会误判：比如"用药记录"条数不高但渗透率不低，说明是低频刚需而非没人用。
 *
 * 三条如实展示（**宁可显示"不知道"，也不显示 0**）：
 *   ① 无用户维度的功能（音箱渠道只有家庭号）→ 渗透率/人均列给 `—` 并标注"不计入人数口径"；
 *   ② 当前数据源没有对应表的功能 → 单独列在「本数据源无法统计」，不画 0 条；
 *   ③ 接入盲区（语音录入 / 助手对话）→ 常驻列表，说明"没有数据承载"而不是"零使用"。
 */
export function AnalyticsFeaturesPage() {
  const { nonce } = useApp()

  const [windowKey, setWindowKey] = useState<WindowKey>(() => {
    const w = new URLSearchParams(window.location.search).get('window')
    return (WINDOWS as readonly string[]).includes(w ?? '') ? (w as WindowKey) : '30d'
  })
  const [view, setView] = useState<FeatureView>(() => {
    const v = new URLSearchParams(window.location.search).get('view')
    return v === 'penetration' || v === 'per_user' ? v : 'count'
  })

  const [data, setData] = useState<FeaturesData | null>(null)
  const [meta, setMeta] = useState<{ db_name: string; computed_at: string | null; cached: boolean; warning: string | null } | null>(null)
  const [err, setErr] = useState<{ message: string; hint: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [trend, setTrend] = useState<FeatureTrendData | null>(null)
  const [trendLoading, setTrendLoading] = useState(false)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    q.set('window', windowKey)
    q.set('view', view)
    window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`)
  }, [windowKey, view])

  const load = useCallback(
    async (force: boolean) => {
      setLoading(true)
      const r = await analyticsApi.features(windowKey, view, force)
      setData(r.data)
      setMeta({
        db_name: r.meta.db_name,
        computed_at: r.meta.computed_at,
        cached: r.meta.cached,
        warning: r.meta.db_name_warning,
      })
      setErr(r.error ? { message: r.error.message, hint: r.error.hint } : null)
      setLoading(false)
    },
    [windowKey, view],
  )

  useEffect(() => {
    load(false)
  }, [load])

  useEffect(() => {
    if (nonce === 0) return
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce])

  // 行展开：拉单功能趋势
  useEffect(() => {
    if (!openKey) {
      setTrend(null)
      return
    }
    let alive = true
    setTrendLoading(true)
    analyticsApi.featureTrend(openKey, windowKey).then((r) => {
      if (!alive) return
      setTrend(r.data)
      setTrendLoading(false)
    })
    return () => {
      alive = false
    }
  }, [openKey, windowKey])

  const barOpt = useMemo(() => (data ? featureBarOption(data.items, view) : null), [data, view])
  const trendOpt = useMemo(
    () => (trend && trend.series.length > 0 ? trendLineOption(trend.series, trend.label) : null),
    [trend],
  )

  if (loading && !data && !err) return <Loading />

  const maxRecords = data ? Math.max(1, ...data.items.map((i) => i.records)) : 1

  return (
    <>
      <Card>
        <CardHead
          title="功能使用"
          meta={
            <span className="an-actions">
              {WINDOWS.map((w) => (
                <button key={w} className={`btn btn-sm ${w === windowKey ? 'btn-primary' : ''}`} onClick={() => setWindowKey(w)}>
                  {WINDOW_LABEL[w]}
                </button>
              ))}
              <span className="an-sep" />
              {(Object.keys(VIEW_LABEL) as FeatureView[]).map((v) => (
                <button key={v} className={`btn btn-sm ${v === view ? 'btn-primary' : ''}`} onClick={() => setView(v)}>
                  {VIEW_LABEL[v]}
                </button>
              ))}
              <button className="btn btn-sm" disabled={loading} onClick={() => load(true)}>
                {loading ? '刷新中…' : '刷新'}
              </button>
            </span>
          }
        />
        <CardBody>
          {err && (
            <Notice tone="warn">
              <b>数据源不可用</b>：{err.message}
              {err.hint ? <div className="hint">{err.hint}</div> : null}
            </Notice>
          )}
          {!err && meta?.warning && <Notice tone="warn">{meta.warning}</Notice>}

          {data ? (
            <div className="an-kpis an-kpis-4">
              <div className="an-card">
                <div className="k">当前视角</div>
                <div className="v">{VIEW_LABEL[view]}</div>
                <div className="n">{VIEW_HINT[view]}</div>
              </div>
              <div className="an-card">
                <div className="k">期间活跃人数</div>
                <div className="v">{fmtInt(data.active_users)}</div>
                <div className="n">渗透率的分母</div>
              </div>
              <div className="an-card">
                <div className="k">记录总条数</div>
                <div className="v">{fmtInt(data.total_records)}</div>
                <div className="n">已排除名单生效</div>
              </div>
              <div className="an-card">
                <div className="k">功能条目</div>
                <div className="v">{fmtInt(data.items.length)}</div>
                <div className="n">
                  {data.unavailable.length > 0 ? `另有 ${data.unavailable.length} 项本数据源无法统计` : '全部可统计'}
                </div>
              </div>
            </div>
          ) : (
            <div className="an-kpis an-kpis-4">
              {['当前视角', '期间活跃人数', '记录总条数', '功能条目'].map((k) => (
                <div className="an-card" key={k}>
                  <div className="k">{k}</div>
                  <div className="v">{DASH}</div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHead title={`功能排行 · 按${VIEW_LABEL[view]}`} meta={WINDOW_LABEL[windowKey]} />
        <CardBody>
          {barOpt ? (
            <EChart option={barOpt} height={Math.max(220, (data?.items.length ?? 8) * 26)} />
          ) : (
            <Empty title="暂无数据">{err ? '数据源不可用' : DASH}</Empty>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHead title="功能明细" meta="点行展开趋势" />
        <CardBody flush>
          {!data ? (
            <Empty title="暂无数据">{DASH}</Empty>
          ) : (
            <Table cols={[128, 74, 88, 88, 84, 0, 86]}>
              <thead>
                <tr>
                  <th>功能</th>
                  <th className="num">条数</th>
                  <th className="num">使用人数</th>
                  <th className="num">渗透率</th>
                  <th className="num">人均条数</th>
                  <th>占比</th>
                  <th className="num">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <Fragment key={it.key}>
                    <tr className={openKey === it.key ? 'an-row-open' : ''}>
                      <td>
                        {it.label}
                        {it.count_only && (
                          <span className="hint" style={{ marginLeft: 6 }} title="该表只有家庭维度，没有用户维度">
                            不计人数
                          </span>
                        )}
                      </td>
                      <td className="num">{fmtInt(it.records)}</td>
                      <td className="num">{it.users === null ? <span className="hint">{DASH}</span> : fmtInt(it.users)}</td>
                      <td className="num">{fmtPct(it.penetration)}</td>
                      <td className="num">{fmtRatio(it.per_user)}</td>
                      <td>
                        <ShareBar ratio={it.share} records={it.records} max={maxRecords} />
                      </td>
                      <td className="num">
                        <button className="btn btn-sm" onClick={() => setOpenKey(openKey === it.key ? null : it.key)}>
                          {openKey === it.key ? '收起' : '趋势'}
                        </button>
                      </td>
                    </tr>
                    {openKey === it.key && (
                      <tr>
                        <td colSpan={7}>
                          <div className="an-subtitle">{it.label} · 日趋势（{WINDOW_LABEL[windowKey]}）</div>
                          {trendLoading ? (
                            <Loading />
                          ) : trendOpt ? (
                            <EChart option={trendOpt} height={220} />
                          ) : (
                            <div className="hint">该功能在此期间没有记录。</div>
                          )}
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

      <Card>
        <CardHead title="无法统计的部分" meta="如实列出，避免被读成「零使用」" />
        <CardBody>
          {data && data.unavailable.length > 0 && (
            <>
              <div className="an-subtitle">本数据源没有对应表</div>
              <div className="an-chips">
                {data.unavailable.map((u) => (
                  <Pill key={u.key} kind="plain">
                    {u.label}
                    <span className="hint" style={{ marginLeft: 6 }}>{u.reason}</span>
                  </Pill>
                ))}
              </div>
            </>
          )}
          <div className="an-subtitle" style={{ marginTop: 12 }}>接入盲区</div>
          <div className="an-chips">
            {(data?.blind_spots ?? []).map((b) => (
              <Pill key={b.name} kind="warn">
                {b.name}
                <span className="hint" style={{ marginLeft: 6 }}>{b.reason}</span>
              </Pill>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            这些功能在页面上**不出现条数 0**：没有数据承载 ≠ 没有被使用。
          </div>
          <div className="an-footer" style={{ marginTop: 12 }}>
            数据源 <span className="mono">{meta?.db_name || DASH}</span> · 计算时刻 {fmtTs(meta?.computed_at)}
            {meta?.cached ? ' ·本次读缓存' : ''}
          </div>
        </CardBody>
      </Card>
    </>
  )
}

/** 占比横条：条长按最大值归一化，但**数值始终以文字给出**（长尾里靠条长看会误判为 0）。 */
function ShareBar({ ratio, records, max }: { ratio: number | null; records: number; max: number }) {
  const pct = ratio === null || ratio === undefined ? null : ratio * 100
  const width = records > 0 ? Math.max(2, Math.round((records / max) * 100)) : 0
  return (
    <div className="an-share">
      <div className="an-share-track">
        <i style={{ width: `${width}%` }} />
      </div>
      <span className="an-share-text">{pct === null ? DASH : `${pct.toFixed(1)}%`}</span>
    </div>
  )
}
