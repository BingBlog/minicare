import { useCallback, useEffect, useMemo, useState } from 'react'
import { EChart } from '../components/EChart'
import { Card, CardBody, CardHead, Empty, KV, Loading, Notice, Pill, Table } from '../components/ui'
import { useApp } from '../lib/app-context'
import {
  DASH,
  METRIC_NOTE,
  SOURCE_LABEL,
  WINDOWS,
  WINDOW_LABEL,
  analyticsApi,
  fmtDelta,
  fmtInt,
  fmtPct,
  fmtRatio,
  fmtTs,
  type ActivityData,
  type OverviewData,
  type RetentionData,
  type WindowKey,
} from '../lib/analytics'
import type { HealthData } from '../lib/analytics'
import { dailyLineOption, weeklyBarOption } from '../lib/analyticsChart'

/**
 * 页面：活跃总览（PRD-016 US-01/02/03/06 · TECH-033）。
 *
 * 四段：
 *   ① 数据源与口径（含「非预期库」黄色警示、`computed_at`、缓存标记）；
 *   ② 规模四卡（累计用户 / 家庭 / 宝宝 / 记录 + 本窗新增，与上一窗对比）；
 *   ③ 活跃（DAU 折线 + 活跃家庭折线 + 7 日均线；WAU/MAU/黏性；活跃家庭 / 活跃宝宝）；
 *   ④ 留存 cohort（**每格带样本数**，`n < 3` 或未到期一律显示"样本不足"而非百分比）；
 *   ⑤ 数据源自检（`record_timeline` 与业务表对账差异如实展示，不隐藏）。
 *
 * 两条贯穿全页的展示纪律（TECH-033 §2.4）：
 *   · **算不出来 = `—`，绝不是 `0`**（`0` 是"确实没有"，`—` 是"没算出来"，两件事）；
 *   · 数据源标识常驻页脚 —— 防"看着 dev 数据做生产决策"。
 *
 * 取数方式：窗口切换写 URL 私有参数（同「检索测试」的 `q` 惯例）；
 * 顶栏「刷新」通过 `nonce` 触发，本页刷新时会带 `force=1` 穿透后端缓存。
 */
export function AnalyticsPage() {
  const { nonce } = useApp()

  const [windowKey, setWindowKey] = useState<WindowKey>(() => {
    const w = new URLSearchParams(window.location.search).get('window')
    return (WINDOWS as readonly string[]).includes(w ?? '') ? (w as WindowKey) : '30d'
  })

  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [activity, setActivity] = useState<ActivityData | null>(null)
  const [retention, setRetention] = useState<RetentionData | null>(null)
  const [health, setHealth] = useState<HealthData | null>(null)
  const [meta, setMeta] = useState<{ source: string; db_name: string; computed_at: string | null; cached: boolean; warning: string | null; version: string } | null>(null)
  const [err, setErr] = useState<{ message: string; hint: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshAt, setRefreshAt] = useState(Date.now())

  // 切换窗口时写回 URL（私有参数，不参与跨页延续）
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    q.set('window', windowKey)
    window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`)
  }, [windowKey])

  const load = useCallback(
    async (force: boolean) => {
      setLoading(true)
      const [ov, ac, rt, he] = await Promise.all([
        analyticsApi.overview(windowKey, force),
        analyticsApi.activity(windowKey, force),
        analyticsApi.retention(),
        analyticsApi.health(),
      ])

      // 任一请求失败即视为「数据源不可用」：页面整体降级为横幅 + `—`
      const first = ov.error ?? ac.error ?? rt.error ?? he.error
      setErr(first ? { message: first.message, hint: first.hint } : null)

      setOverview(ov.data)
      setActivity(ac.data)
      setRetention(rt.data)
      setHealth(he.data)
      setMeta({
        source: ov.meta.source,
        db_name: ov.meta.db_name || he.meta.db_name,
        computed_at: ov.meta.computed_at,
        cached: ov.meta.cached,
        warning: ov.meta.db_name_warning,
        version: ov.meta.metric_version,
      })
      setLoading(false)
    },
    [windowKey],
  )

  // 首次挂载 / 切窗口：走缓存（force=false）
  useEffect(() => {
    load(false)
  }, [load])

  // 顶栏刷新 / 本页刷新：穿透缓存。`refreshAt` 让"连点两次刷新"也生效
  useEffect(() => {
    if (nonce === 0) return
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, refreshAt])

  const cards = overview?.cards
  const srcLabel = meta ? SOURCE_LABEL[meta.source as 'prod'] ?? meta.source : DASH
  const small = activity?.small_sample === true

  const dailyOpt = useMemo(
    () => (activity ? dailyLineOption(activity.series, activity.families_series) : null),
    [activity],
  )
  const userWeekOpt = useMemo(
    () => (overview ? weeklyBarOption(overview.series.users) : null),
    [overview],
  )
  const recordWeekOpt = useMemo(
    () => (overview ? weeklyBarOption(overview.series.records, '#8fb8dc') : null),
    [overview],
  )

  if (loading && !overview && !err) return <Loading />

  return (
    <>
      {/* ── ① 数据源与口径 ─────────────────────────────────────────────── */}
      <Card>
        <CardHead
          title="数据源与口径"
          meta={
            <span className="an-actions">
              {WINDOWS.map((w) => (
                <button
                  key={w}
                  className={`btn btn-sm ${w === windowKey ? 'btn-primary' : ''}`}
                  onClick={() => setWindowKey(w)}
                >
                  {WINDOW_LABEL[w]}
                </button>
              ))}
              <button className="btn btn-sm" disabled={loading} onClick={() => { setRefreshAt(Date.now()); load(true) }}>
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
              <div className="hint">下面所有指标显示为「—」而不是 0 —— 「没算出来」和「确实没有」是两件事。</div>
            </Notice>
          )}
          {!err && meta?.warning && <Notice tone="warn">{meta.warning}</Notice>}

          <KV
            rows={[
              [
                '当前数据源',
                <>
                  <Pill kind={meta?.source === 'prod' ? 'ok' : meta?.source === 'dev' ? 'warn' : 'plain'}>
                    {srcLabel}
                  </Pill>
                  <span className="mono hint" style={{ marginLeft: 8 }}>
                    {meta?.db_name || DASH}
                  </span>
                </>,
              ],
              ['口径版本', <span key="v" className="mono">{meta?.version || DASH}</span>],
              [
                '计算时刻',
                <span key="c" className="mono">
                  {fmtTs(meta?.computed_at)}
                  {meta?.cached ? <span className="hint"> ·本次读缓存</span> : null}
                </span>,
              ],
              [
                '排除名单',
                <span key="e">
                  {meta?.source === 'prod' ? null : null}
                  {health ? (
                    <>
                      排除 <b>{fmtInt(health.exclusions.users)}</b> 个账号 / <b>{fmtInt(health.exclusions.families)}</b> 个家庭
                      {health.exclusions.patterns > 0 ? ` · ${health.exclusions.patterns} 条昵称规则命中 ${health.exclusions.pattern_hits} 个` : ''}
                      <span className="hint mono" style={{ marginLeft: 8 }}>
                        指纹 {health.exclusions.fingerprint}
                      </span>
                    </>
                  ) : (
                    DASH
                  )}
                </span>,
              ],
            ]}
          />
          {health?.exclusions.warning && <Notice tone="warn">{health.exclusions.warning}</Notice>}

          <Notice tone="accent">{METRIC_NOTE}</Notice>
        </CardBody>
      </Card>

      {/* ── ② 规模四卡 ────────────────────────────────────────────────── */}
      <Card>
        <CardHead title="规模" meta={`${WINDOW_LABEL[windowKey]}新增与上一窗口对比`} />
        <CardBody>
          <div className="an-kpis">
            <ScaleCard label="累计用户" note={`已验证 ${fmtInt(cards?.users_verified)}`} cur={cards?.users} />
            <ScaleCard label="家庭" cur={cards?.families} />
            <ScaleCard label="宝宝" cur={cards?.babies} />
            <ScaleCard label="记录总量" cur={cards?.records} />
          </div>
          <div className="hint">{overview?.scope_note ?? ''}</div>
        </CardBody>
      </Card>

      {/* ── ③ 活跃 ───────────────────────────────────────────────────── */}
      <Card>
        <CardHead title="活跃与趋势" meta={WINDOW_LABEL[windowKey]} />
        <CardBody>
          <div className="an-kpis an-kpis-5">
            <Metric label="DAU（今日）" value={fmtInt(activity?.dau)} hint="今日产生过记录的人数" />
            <Metric label="WAU（近 7 天）" value={fmtInt(activity?.wau)} />
            <Metric label="MAU（近 30 天）" value={fmtInt(activity?.mau)} />
            <Metric
              label="黏性 DAU/MAU"
              value={small ? '样本不足' : fmtPct(activity?.sticky)}
              hint={small ? `总用户数 < ${meta ? '' : ''}阈值，不出百分比` : undefined}
            />
            <Metric label="活跃家庭（今日）" value={fmtInt(activity?.active_families)} />
            <Metric label="活跃宝宝（今日）" value={fmtInt(activity?.active_babies)} />
          </div>
          <div className="hint">{activity?.scope_note ?? ''}</div>
          {dailyOpt ? (
            <EChart option={dailyOpt} height={260} className="an-chart" />
          ) : (
            <Empty title="暂无活跃数据">数据源不可用时，这里不画空图 —— 空图会被读成"没人用"。</Empty>
          )}
          {activity?.families_note && <div className="hint">{activity.families_note}</div>}
        </CardBody>
      </Card>

      {/* ── ④ 留存 ───────────────────────────────────────────────────── */}
      <Card>
        <CardHead title="记录留存" meta={retention ? `样本门槛 ${retention.min_sample}` : undefined} />
        <CardBody flush>
          {!retention ? (
            <Empty title="留存暂不可用">{DASH}</Empty>
          ) : retention.cohorts.length === 0 ? (
            <Empty title="暂无 cohort">还没有注册用户。</Empty>
          ) : (
            <>
              <div className="hint" style={{ padding: '0 0 8px' }}>{retention.scope_note}</div>
              <div className="an-cohort">
                <Table cols={[86, 62, 78, 78, 0]}>
                  <thead>
                    <tr>
                      <th>注册周</th>
                      <th className="num">样本数</th>
                      <th className="num">次日留存</th>
                      <th className="num">7 日留存</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retention.cohorts.map((c) => (
                      <tr key={c.week}>
                        <td className="mono">{c.week}</td>
                        <td className="num">{c.n}</td>
                        <td className="num">{rateCell(c.d1_rate, c.d1, c.n, c.small_sample, c.d1_mature)}</td>
                        <td className="num">{rateCell(c.d7_rate, c.d7, c.n, c.small_sample, c.d7_mature)}</td>
                        <td className="hint">
                          {c.small_sample ? '样本不足，不展示比例' : !c.d1_mature || !c.d7_mature ? '尚未到期' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <div className="hint" style={{ padding: '8px 0 0' }}>
                回流用户（沉睡 ≥14 天后再次记录）：<b>{fmtInt(retention.returning)}</b>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* ── ⑤ 规模趋势 ───────────────────────────────────────────────── */}
      <Card>
        <CardHead title="近 90 天增长（按周）" meta="新增用户 / 新增记录" />
        <CardBody>
          {userWeekOpt && recordWeekOpt && (overview?.series.users.length ?? 0) > 0 ? (
            <div className="an-grid2">
              <div>
                <div className="an-subtitle">新增用户</div>
                <EChart option={userWeekOpt} height={200} />
              </div>
              <div>
                <div className="an-subtitle">新增记录</div>
                <EChart option={recordWeekOpt} height={200} />
              </div>
            </div>
          ) : (
            <Empty title="暂无趋势数据">{DASH}</Empty>
          )}
        </CardBody>
      </Card>

      {/* ── ⑥ 数据源自检 ─────────────────────────────────────────────── */}
      <Card>
        <CardHead title="数据源自检" meta={health?.server.dsn} />
        <CardBody flush={false}>
          {!health ? (
            <Empty title="自检不可用">{DASH}</Empty>
          ) : (
            <>
              <KV
                rows={[
                  ['服务器时间', <span key="t" className="mono">{health.server.server_time}</span>],
                  ['数据库版本', <span key="v" className="mono">{health.server.server_version}</span>],
                  [
                    '库结构与预期',
                    health.tables.missing.length === 0 ? (
                      <Pill key="m" kind="ok">一致（{health.tables.total} 张表）</Pill>
                    ) : (
                      <span key="m">
                        <Pill kind="warn">缺 {health.tables.missing.length} 张表</Pill>
                        <span className="mono hint" style={{ marginLeft: 8 }}>{health.tables.missing.join('、')}</span>
                        <div className="hint">对应的功能不会出现在「功能分析」里，也不会被当作 0。</div>
                      </span>
                    ),
                  ],
                  [
                    '累计（原始）',
                    <span key="c" className="mono">
                      用户 {fmtInt(health.counts.users)} · 家庭 {fmtInt(health.counts.families)} · 宝宝 {fmtInt(health.counts.babies)} · 时间线 {fmtInt(health.counts.timeline)}
                    </span>,
                  ],
                ]}
              />
              <div className="hint" style={{ margin: '8px 0' }}>{health.reconcile_note}</div>
              <Table cols={[110, 0, 90, 90, 80]}>
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>对应业务表</th>
                    <th className="num">时间线</th>
                    <th className="num">业务表</th>
                    <th className="num">差异</th>
                  </tr>
                </thead>
                <tbody>
                  {health.reconcile.map((r) => (
                    <tr key={r.source_type}>
                      <td>{r.label}</td>
                      <td className="mono wrap">{r.tables.join(' + ')}</td>
                      <td className="num">{r.timeline}</td>
                      <td className="num">{r.business}</td>
                      <td className="num">
                        {r.diff === 0 ? (
                          <Pill kind="ok">一致</Pill>
                        ) : (
                          <Pill kind={r.diff > 0 ? 'warn' : 'plain'}>
                            {r.diff > 0 ? `+${r.diff}` : r.diff}
                          </Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {health.no_timeline_functions.length > 0 && (
                <div className="hint" style={{ marginTop: 8 }}>
                  未进入时间线的功能（有业务表但未物化，因此不计入对账、也不代表"没用过"）：
                  {health.no_timeline_functions.map((f) => f.label).join('、')}
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <div className="an-footer">
        数据源 <span className="mono">{meta?.db_name || DASH}</span> · {srcLabel} · 口径 {meta?.version || DASH} · 计算时刻{' '}
        {fmtTs(meta?.computed_at)}
      </div>
    </>
  )
}

/* ── 局部组件 ─────────────────────────────────────────────────────────────── */

function ScaleCard({
  label,
  cur,
  note,
}: {
  label: string
  cur?: { value: number; new_cur: number; new_prev: number; note: string }
  note?: string
}) {
  const delta = cur ? fmtDelta(cur.new_cur, cur.new_prev) : null
  return (
    <div className="an-card">
      <div className="k">{label}</div>
      <div className="v">{cur ? fmtInt(cur.value) : DASH}</div>
      <div className="n">
        {cur ? (
          <>
            本窗新增 <b>{fmtInt(cur.new_cur)}</b>
            {delta ? <span className={`an-delta ${delta.tone}`}>{delta.text}</span> : null}
          </>
        ) : (
          DASH
        )}
      </div>
      {(note || cur?.note) && <div className="hint">{note || cur?.note}</div>}
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="an-card">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

/**
 * 留存格子：只在**样本足够且该 horizon 已到期**时给百分比。
 * 其余一律给文字（"样本不足" / "未到期"），并附原始命中数供人工判断。
 * 绝不把 n=1 的 100% 当成真实留存画出来。
 */
function rateCell(
  rate: number | null,
  hit: number,
  n: number,
  small: boolean,
  mature: boolean,
): React.ReactNode {
  if (rate === null || rate === undefined) {
    if (small) return <span className="hint">样本不足</span>
    if (!mature) return <span className="hint">未到期</span>
    return <span className="hint">{hit}/{n}</span>
  }
  return (
    <>
      {fmtPct(rate, 0)}
      <span className="hint"> ({hit}/{n})</span>
    </>
  )
}

/** 供其它页面复用的小工具导出（避免各自实现一套 ratio 文案） */
export const analyticsRatioText = (v: number | null | undefined) => fmtRatio(v)
