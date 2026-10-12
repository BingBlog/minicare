import { useCallback, useEffect, useMemo, useState } from 'react'
import { EChart } from '../components/EChart'
import { Card, CardBody, CardHead, Empty, KV, Loading, Notice, Pill, Table } from '../components/ui'
import { useApp } from '../lib/app-context'
import {
  DASH,
  EXCLUSIONS_HINT,
  SEGMENT_KIND,
  SEGMENT_LABEL,
  SEGMENT_SHORT,
  WINDOWS,
  WINDOW_LABEL,
  analyticsApi,
  fmtDate,
  fmtInt,
  fmtTs,
  type AnalyticsUser,
  type ExclusionsData,
  type Segment,
  type UserDetailData,
  type UsersData,
  type WindowKey,
} from '../lib/analytics'
import { userSparkOption } from '../lib/analyticsChart'

/**
 * 页面：用户清单（PRD-016 US-05 / US-07 · TECH-033 §3.3）。
 *
 * 两件事放一页，因为它们必须一起用：
 *   ① **用户清单** —— 每人一行：档位（核心/活跃/沉睡/流失）、家庭数、宝宝数、记录数、最后活跃；
 *      点行开右侧抽屉看单用户构成（家庭 / 宝宝 / 功能分布 / 近 90 天时间分布）；
 *   ② **排除名单** —— 生产库 29 个账号里 17 个是「用户_0001」这类自动昵称、9 个零记录，
 *      不排除就没法谈"真实用户"。名单在 `analytics/exclusions.yaml`（不落库），
 *      写回前自动备份；**候选项只列出来，绝不自动排除**。
 *
 * 隐私口径（TECH-033 §4.2）：手机号在后端脱敏后下发（`138****1234`），
 * 前端拿不到明文；页面不展示原始 UUID，也不做记录内容下钻。
 */
export function AnalyticsUsersPage() {
  const { nonce, toast } = useApp()

  const [windowKey, setWindowKey] = useState<WindowKey>(() => {
    const w = new URLSearchParams(window.location.search).get('window')
    return (WINDOWS as readonly string[]).includes(w ?? '') ? (w as WindowKey) : '30d'
  })
  const [segment, setSegment] = useState<Segment>('all')
  const [includeExcluded, setIncludeExcluded] = useState(false)
  const [sort, setSort] = useState<'last_active' | 'records'>('last_active')

  const [users, setUsers] = useState<UsersData | null>(null)
  const [exc, setExc] = useState<ExclusionsData | null>(null)
  const [meta, setMeta] = useState<{ db_name: string; computed_at: string | null; warning: string | null } | null>(null)
  const [err, setErr] = useState<{ message: string; hint: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const [drawer, setDrawer] = useState<AnalyticsUser | null>(null)
  const [detail, setDetail] = useState<UserDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [busy, setBusy] = useState(false)
  const [pendingValue, setPendingValue] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [u, e] = await Promise.all([
      analyticsApi.users(windowKey, { segment, includeExcluded, sort }),
      analyticsApi.exclusions(),
    ])
    setUsers(u.data)
    setExc(e.data)
    setMeta({
      db_name: u.meta.db_name || e.meta.db_name,
      computed_at: u.meta.computed_at,
      warning: u.meta.db_name_warning,
    })
    setErr(u.error ? { message: u.error.message, hint: u.error.hint } : null)
    setLoading(false)
  }, [windowKey, segment, includeExcluded, sort])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (nonce === 0) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce])

  // 抽屉：拉单用户下钻
  useEffect(() => {
    if (!drawer) {
      setDetail(null)
      return
    }
    let alive = true
    setDetailLoading(true)
    analyticsApi.userDetail(drawer.id, '90d').then((r) => {
      if (!alive) return
      setDetail(r.data)
      setDetailLoading(false)
    })
    return () => {
      alive = false
    }
  }, [drawer])

  const sparkOpt = useMemo(
    () => (detail && detail.series.length > 0 ? userSparkOption(detail.series) : null),
    [detail],
  )

  const mutate = async (action: 'add' | 'remove', kind: 'user' | 'family' | 'pattern', value: string, reason: string) => {
    setBusy(true)
    const r = await analyticsApi.mutateExclusion({ action, kind, value, reason })
    setBusy(false)
    if (r.error) {
      toast(r.error.message)
      return
    }
    toast(action === 'add' ? '已加入排除名单（改完即时生效）' : '已移出排除名单')
    await load()
  }

  const onExcludeUser = (u: AnalyticsUser) => {
    const reason = window.prompt(
      `把「${u.nickname || u.id}」加入排除名单？\n\n将不再计入用户数 / 活跃 / 渗透率等所有用户维度指标。\n请填写理由（用于审计回执）：`,
      '疑似测试账号',
    )
    if (reason === null) return
    if (!reason.trim()) {
      toast('理由不能为空')
      return
    }
    mutate('add', 'user', u.id, reason.trim())
  }

  const onAddManual = (kind: 'user' | 'pattern') => {
    const value = pendingValue.trim()
    if (!value) {
      toast('请先填写内容')
      return
    }
    const reason = window.prompt('填写理由（用于审计回执）：', kind === 'pattern' ? '批量排除自动生成的昵称' : '疑似测试账号')
    if (reason === null || !reason.trim()) return
    mutate('add', kind, value, reason.trim()).then(() => setPendingValue(''))
  }

  if (loading && !users && !err) return <Loading />

  const excludedSet = new Set(exc?.users ?? [])

  return (
    <>
      <Card>
        <CardHead
          title="用户清单"
          meta={
            <span className="an-actions">
              {WINDOWS.map((w) => (
                <button key={w} className={`btn btn-sm ${w === windowKey ? 'btn-primary' : ''}`} onClick={() => setWindowKey(w)}>
                  {WINDOW_LABEL[w]}
                </button>
              ))}
              <button className="btn btn-sm" onClick={load} disabled={loading}>
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

          <div className="an-filters">
            {(Object.keys(SEGMENT_LABEL) as Segment[]).map((s) => (
              <button key={s} className={`btn btn-sm ${s === segment ? 'btn-primary' : ''}`} onClick={() => setSegment(s)}>
                {SEGMENT_LABEL[s]}
              </button>
            ))}
            <span className="an-sep" />
            <label className="an-check">
              <input type="checkbox" checked={includeExcluded} onChange={(e) => setIncludeExcluded(e.target.checked)} />
              显示已排除账号
            </label>
            <span className="an-sep" />
            <button
              className={`btn btn-sm ${sort === 'last_active' ? 'btn-primary' : ''}`}
              onClick={() => setSort('last_active')}
            >
              按最后活跃
            </button>
            <button className={`btn btn-sm ${sort === 'records' ? 'btn-primary' : ''}`} onClick={() => setSort('records')}>
              按记录数
            </button>
          </div>

          <div className="an-kpis an-kpis-3">
            <div className="an-card">
              <div className="k">当前筛选人数</div>
              <div className="v">{fmtInt(users?.total)}</div>
              <div className="n">
                档位「{SEGMENT_SHORT[segment]}」· 窗口 {WINDOW_LABEL[windowKey]}
                {includeExcluded ? ' · 含已排除' : ''}
              </div>
            </div>
            <div className="an-card">
              <div className="k">排除名单</div>
              <div className="v">{fmtInt(exc?.users.length ?? null)}</div>
              <div className="n">
                账号 {fmtInt(exc?.users.length ?? null)} · 家庭 {fmtInt(exc?.families.length ?? null)} · 昵称规则{' '}
                {fmtInt(exc?.nickname_patterns.length ?? null)}
              </div>
            </div>
            <div className="an-card">
              <div className="k">榜上最后活跃</div>
              <div className="v an-v-sm mono">{fmtTs(users?.items.find((u) => u.last_active)?.last_active)}</div>
              <div className="n">最近一次产生记录的时刻</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead title="用户明细" meta="点行查看构成" />
        <CardBody flush>
          {!users || users.items.length === 0 ? (
            <Empty title={err ? '数据源不可用' : '没有符合条件的用户'}>
              换个档位或窗口再看看；「流失」档位包含从未记录过的账号。
            </Empty>
          ) : (
            <Table cols={[0, 116, 92, 60, 60, 78, 78, 156, 92]}>
              <thead>
                <tr>
                  <th>昵称</th>
                  <th>手机号</th>
                  <th>档位</th>
                  <th className="num">家庭</th>
                  <th className="num">宝宝</th>
                  <th className="num">窗口记录</th>
                  <th className="num">累计记录</th>
                  <th>最后活跃</th>
                  <th className="num">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.items.map((u) => (
                  <tr key={u.id} className={u.excluded ? 'an-row-muted' : ''}>
                    <td>
                      <button className="an-link" onClick={() => setDrawer(u)}>
                        {u.nickname || '(无昵称)'}
                      </button>
                      {u.sms_verified && <span className="hint" style={{ marginLeft: 6 }}>已验证</span>}
                      {u.excluded && <Pill kind="plain">已排除</Pill>}
                    </td>
                    <td className="mono">{u.phone_masked || DASH}</td>
                    <td>
                      <Pill kind={SEGMENT_KIND[u.segment]}>{SEGMENT_SHORT[u.segment] ?? u.segment}</Pill>
                    </td>
                    <td className="num">{fmtInt(u.families)}</td>
                    <td className="num">{fmtInt(u.babies)}</td>
                    <td className="num">{fmtInt(u.records_window)}</td>
                    <td className="num">{fmtInt(u.records_total)}</td>
                    <td className="mono">{fmtTs(u.last_active)}</td>
                    <td className="num">
                      {u.excluded ? (
                        <button
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() => mutate('remove', 'user', u.id, '人工恢复')}
                        >
                          移出名单
                        </button>
                      ) : (
                        <button className="btn btn-sm" disabled={busy} onClick={() => onExcludeUser(u)}>
                          排除
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* ── 排除名单 ─────────────────────────────────────────────────── */}
      <Card>
        <CardHead title="排除名单" meta={exc ? `文件 ${exc.file} · 指纹 ` : undefined} />
        <CardBody>
          <Notice tone="accent">{EXCLUSIONS_HINT}</Notice>
          {exc?.warning && <Notice tone="warn">{exc.warning}</Notice>}
          {exc?.candidates_error && <Notice tone="warn">候选识别失败：{exc.candidates_error}</Notice>}

          <KV
            rows={[
              [
                '已排除账号',
                exc && exc.users.length > 0 ? (
                  <span className="an-chips">
                    {exc.users.map((id) => (
                      <Pill key={id} kind="plain">
                        <span className="mono">{id.slice(0, 8)}…</span>
                        <button className="an-x" disabled={busy} onClick={() => mutate('remove', 'user', id, '人工移出')}>
                          ×
                        </button>
                      </Pill>
                    ))}
                  </span>
                ) : (
                  <span className="hint">（空）</span>
                ),
              ],
              [
                '已排除家庭',
                exc && exc.families.length > 0 ? (
                  <span className="an-chips">
                    {exc.families.map((id) => (
                      <Pill key={id} kind="plain">
                        <span className="mono">{id.slice(0, 8)}…</span>
                        <button className="an-x" disabled={busy} onClick={() => mutate('remove', 'family', id, '人工移出')}>
                          ×
                        </button>
                      </Pill>
                    ))}
                  </span>
                ) : (
                  <span className="hint">（空）</span>
                ),
              ],
              [
                '昵称规则',
                exc && exc.nickname_patterns.length > 0 ? (
                  <span className="an-chips">
                    {exc.nickname_patterns.map((p) => (
                      <Pill key={p} kind="warn">
                        <span className="mono">{p}</span>
                        <button className="an-x" disabled={busy} onClick={() => mutate('remove', 'pattern', p, '人工移出')}>
                          ×
                        </button>
                      </Pill>
                    ))}
                    <span className="hint">命中 {fmtInt(exc.pattern_hits.length)} 个账号</span>
                  </span>
                ) : (
                  <span className="hint">（空）—— 默认不按昵称排除</span>
                ),
              ],
              ['指纹', <span key="f" className="mono">{exc?.fingerprint || DASH}</span>],
              ['当前昵称规则（配置项）', <span key="t" className="mono">{exc?.test_nickname_pattern || DASH}</span>],
            ]}
          />

          <div className="an-actions" style={{ marginTop: 10 }}>
            <input
              type="text"
              placeholder="手动添加用户 id"
              value={pendingValue}
              onChange={(e) => setPendingValue(e.target.value)}
              style={{ width: 300 }}
            />
            <button className="btn btn-sm" disabled={busy} onClick={() => onAddManual('user')}>
              加入账号
            </button>
            <button className="btn btn-sm" disabled={busy} onClick={() => onAddManual('pattern')}>
              按正则批量排除
            </button>
          </div>

          <div className="an-subtitle" style={{ marginTop: 14 }}>
            疑似测试账号候选（{exc?.candidates.length ?? 0}）
          </div>
          {!exc || exc.candidates.length === 0 ? (
            <div className="hint">没有识别到疑似测试账号。</div>
          ) : (
            <Table cols={[0, 116, 130, 0, 96]}>
              <thead>
                <tr>
                  <th>昵称</th>
                  <th>手机号</th>
                  <th>注册时间</th>
                  <th>判定依据</th>
                  <th className="num">操作</th>
                </tr>
              </thead>
              <tbody>
                {exc.candidates.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nickname || '(无昵称)'}</td>
                    <td className="mono">{c.phone ? `${c.phone.slice(0, 3)}****${c.phone.slice(-4)}` : DASH}</td>
                    <td className="mono">{fmtDate(c.created_at)}</td>
                    <td className="wrap">{c.reason}</td>
                    <td className="num">
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() =>
                          mutate('add', 'user', c.id, `候选识别：${c.reason}`)
                        }
                      >
                        加入名单
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="hint" style={{ marginTop: 8 }}>
            候选项**不会被自动排除** —— 必须人工确认，避免把真实的小号误判成测试账号。
          </div>
        </CardBody>
      </Card>

      {/* ── 单用户抽屉 ───────────────────────────────────────────────── */}
      {drawer && (
        <div className="an-drawer-mask" onClick={() => setDrawer(null)}>
          <aside className="an-drawer" onClick={(e) => e.stopPropagation()}>
            <header className="an-drawer-h">
              <div>
                <h3>{drawer.nickname || '(无昵称)'}</h3>
                <div className="hint mono">{drawer.id}</div>
              </div>
              <button className="btn btn-sm" onClick={() => setDrawer(null)}>
                关闭
              </button>
            </header>
            <div className="an-drawer-b">
              {detailLoading ? (
                <Loading />
              ) : !detail ? (
                <Empty title="下钻数据不可用">{DASH}</Empty>
              ) : (
                <>
                  <KV
                    rows={[
                      ['档位', <Pill key="s" kind={SEGMENT_KIND[detail.segment]}>{SEGMENT_LABEL[detail.segment]}</Pill>],
                      ['手机号', <span key="p" className="mono">{detail.phone_masked || DASH}</span>],
                      ['注册时间', <span key="c" className="mono">{fmtTs(detail.created_at)}</span>],
                      ['最后活跃', <span key="l" className="mono">{fmtTs(detail.last_active)}</span>],
                      ['累计记录', fmtInt(detail.records_total)],
                      ['短信验证', detail.sms_verified ? '已验证' : '未验证'],
                    ]}
                  />

                  <div className="an-subtitle">家庭（{detail.families.length}）</div>
                  {detail.families.length === 0 ? (
                    <div className="hint">未加入任何家庭。</div>
                  ) : (
                    <ul className="an-list">
                      {detail.families.map((f) => (
                        <li key={f.id}>
                          <span>{f.name || '(未命名家庭)'}</span>
                          <span className="hint mono">{fmtDate(f.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="an-subtitle">宝宝（{detail.babies.length}）</div>
                  {detail.babies.length === 0 ? (
                    <div className="hint">未登记宝宝。</div>
                  ) : (
                    <ul className="an-list">
                      {detail.babies.map((b) => (
                        <li key={b.id}>
                          <span>{b.name || '(未命名宝宝)'}</span>
                          <span className="hint mono">生日 {fmtDate(b.birth_date)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="an-subtitle">功能构成（近 {detail.window_days} 天）</div>
                  {detail.functions.length === 0 ? (
                    <div className="hint">此期间没有记录。</div>
                  ) : (
                    <Table cols={[0, 80]}>
                      <thead>
                        <tr>
                          <th>功能</th>
                          <th className="num">条数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.functions.map((f) => (
                          <tr key={f.key}>
                            <td>{f.label}</td>
                            <td className="num">{f.records}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}

                  <div className="an-subtitle">近 90 天记录分布</div>
                  {sparkOpt ? (
                    <EChart option={sparkOpt} height={160} />
                  ) : (
                    <div className="hint">此期间没有记录。</div>
                  )}

                  {excludedSet.has(detail.id) ? (
                    <button className="btn" disabled={busy} onClick={() => mutate('remove', 'user', detail.id, '人工移出')}>
                      移出排除名单
                    </button>
                  ) : (
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        onExcludeUser({
                          ...drawer,
                          nickname: detail.nickname,
                        })
                      }
                    >
                      加入排除名单
                    </button>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      <div className="an-footer">
        手机号已脱敏（明文不出后端）· 不展示用户 UUID 与记录内容 · 数据源{' '}
        <span className="mono">{meta?.db_name || DASH}</span>
      </div>
    </>
  )
}
