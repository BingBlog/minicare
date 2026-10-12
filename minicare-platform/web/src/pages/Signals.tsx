import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { SignalDetail, SignalFlag, SignalRegistryData, SignalValueAllResult, SignalValueResult } from '../lib/types'
import { Card, CardBody, ErrorBox, Loading, Notice, Table } from '../components/ui'

/**
 * 页面：信号总览（TECH-029 / PRD-014 US-01）
 *
 * 表格直显：信号 / 计算方式 / 数据源 / 参考依据 / 实测值 / 状态 —— 进页面自动全量实测（value-all），
 * 首屏即可看到全部 46 信号与 12 条提醒规则的当前状态；点击任意行开详情抽屉（US-02，含单点「跑一遍」）。
 */

const STRENGTH_ORDER = ['strong', 'medium', 'weak', 'intercept']
const STRENGTH_HEAD: Record<string, string> = {
  strong: '主动提醒',
  medium: '常规提醒',
  weak: '低优先',
  intercept: '仅拦截',
}
const STRENGTH_TIP: Record<string, string> = {
  strong: '会主动打断当前话题提醒（内部术语：strong）',
  medium: '每轮对话最多出现一条（内部术语：medium）',
  weak: '一般不会出现在对话里（内部术语：weak）',
  intercept: '不主动说，仅在相关操作时拦截（内部术语：intercept）',
}

type DrawerTarget =
  | { kind: 'signal'; signal: SignalDetail; groupName: string }
  | { kind: 'flag'; flag: SignalFlag }

/** 实测值单元格：紧凑单行 + 悬停看全文 */
function readingText(v: unknown): { text: string; full: string } | null {
  if (v === undefined) return null
  if (v === null) return { text: '—', full: '无值' }
  if (typeof v === 'string') return { text: v, full: v }
  if (typeof v === 'number' || typeof v === 'boolean') return { text: String(v), full: String(v) }
  const full = JSON.stringify(v)
  return { text: full.length > 56 ? `${full.slice(0, 56)}…` : full, full }
}

export function SignalsPage() {
  const { go, nonce } = useApp()
  const { data, error, loading } = useAsync<SignalRegistryData>(() => api.signalRegistry(), [nonce])
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null)
  // 实测值（value-all）：进页面自动拉取；可切换数据源 / 宝宝后重新实测
  const [baby, setBaby] = useState('旺仔')
  const [ds, setDs] = useState<'dev' | 'prod'>('dev')
  const [reading, setReading] = useState<SignalValueAllResult | null>(null)
  const [readingBusy, setReadingBusy] = useState(false)
  const [readingErr, setReadingErr] = useState<string | null>(null)

  const loadReading = useCallback(async (b: string, d: 'dev' | 'prod') => {
    setReadingBusy(true)
    setReadingErr(null)
    try {
      const r = await api.signalValueAll(b.trim() || '旺仔', d)
      setReading(r)
    } catch (e) {
      setReading(null)
      setReadingErr((e as Error).message)
    } finally {
      setReadingBusy(false)
    }
  }, [])

  useEffect(() => {
    loadReading('旺仔', 'dev')
  }, [loadReading])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  const st = data.stats
  const signalGroups = data.groups.filter((g) => g.signals.length > 0)
  const flagsSorted = [...data.flags].sort(
    (a, b) => STRENGTH_ORDER.indexOf(a.strength) - STRENGTH_ORDER.indexOf(b.strength),
  )

  return (
    <Card>
      <CardBody>
        {data.errors.length ? <Notice>注册表读取异常：{data.errors.join('；')}</Notice> : null}
        {st.degradedGroups ? (
          <div className="hint" style={{ marginTop: 4 }}>
            {st.degradedGroups} 组中有信号暂不可用（状态列有标注，悬停查看原因）
            {st.changedParams ? `；${st.changedParams} 项配置已改动` : ''}
          </div>
        ) : null}

        <div className="sig-toolbar">
          <span className="hint">实测数据源</span>
          <select
            value={ds}
            onChange={(e) => {
              const d = e.target.value as 'dev' | 'prod'
              setDs(d)
              void loadReading(baby, d)
            }}
          >
            <option value="dev">测试环境</option>
            <option value="prod">生产环境（只读）</option>
          </select>
          <input value={baby} onChange={(e) => setBaby(e.target.value)} style={{ width: 130 }} placeholder="宝宝名字或 ID" />
          <button type="button" className="btn" onClick={() => void loadReading(baby, ds)} disabled={readingBusy}>
            {readingBusy ? '实测运行中…' : '重新实测'}
          </button>
          <span className="hint" style={{ flex: 1, textAlign: 'right' }}>
            {readingErr
              ? `实测失败：${readingErr}`
              : reading?.generatedAt
                ? `实测于 ${new Date(reading.generatedAt).toLocaleTimeString('zh-CN')}（${reading.baby?.name || ''}）`
                : ''}
          </span>
        </div>
      </CardBody>

      <CardBody flush>
        <div style={{ padding: '10px 14px 8px', fontWeight: 600 }}>
          全部信号（{signalGroups.length} 组 · {st.signals} 项）—— 点击任一信号查看详情与单点实测
        </div>
        {signalGroups.map((g) => (
          <div key={g.id} className="sig-section-block">
            <div className="sig-section-head">
              <b>
                {g.id} {g.name}
              </b>{' '}
              <span className={`sig-tag${g.activeCount < g.signalCount ? ' warn' : ' ok'}`}>
                {g.activeCount}/{g.signalCount} 生效
              </span>{' '}
              <span className="hint">{g.scope}</span>
            </div>
            <Table cols={[164, 0, 110, 110, 0, 62]}>
              <thead>
                <tr>
                  <th>信号</th>
                  <th>计算方式</th>
                  <th>数据源</th>
                  <th>参考依据</th>
                  <th>实测值</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {g.signals.map((s) => {
                  const r = readingText(reading?.values?.[s.id]?.value)
                  return (
                    <tr
                      key={s.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setDrawer({ kind: 'signal', signal: s, groupName: `${g.id} ${g.name}` })}
                    >
                      <td>
                        <b>{s.name}</b>
                        <div className="hint">{s.id}</div>
                      </td>
                      <td className="wrap hint">{s.caliber}</td>
                      <td className="hint">{s.source}</td>
                      <td className="hint">{s.evidence}</td>
                      <td className="wrap">
                        {r ? (
                          <span className="sig-reading" title={r.full}>
                            {r.text}
                          </span>
                        ) : (
                          <span className="hint">{readingBusy ? '…' : '—'}</span>
                        )}
                      </td>
                      <td>
                        {s.status === 'active' ? (
                          <span className="sig-tag">生效</span>
                        ) : s.status === 'degraded' ? (
                          <span className="sig-tag warn" title={s.statusNote}>
                            暂不可用
                          </span>
                        ) : (
                          <span className="sig-tag warn" title={s.statusNote}>
                            待补齐
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        ))}
      </CardBody>

      <CardBody flush>
        <div style={{ padding: '12px 14px 8px', fontWeight: 600 }}>
          提醒规则（{data.flags.length} 条）—— 点击查看定义与单点实测
        </div>
        <Table cols={[150, 0, 76, 110, 0, 50]}>
          <thead>
            <tr>
              <th>检测项</th>
              <th>触发条件</th>
              <th>提醒级别</th>
              <th>参考依据</th>
              <th>当前状态</th>
              <th>开关</th>
            </tr>
          </thead>
          <tbody>
            {flagsSorted.map((f) => {
              const rd = reading?.flags?.[f.key]
              return (
                <tr key={f.key} style={{ cursor: 'pointer' }} onClick={() => setDrawer({ kind: 'flag', flag: f })}>
                  <td>
                    <b>{f.name}</b>
                    <div className="hint">{f.key}</div>
                  </td>
                  <td className="wrap hint">{f.triggerDesc}</td>
                  <td>
                    <span className="hint" title={STRENGTH_TIP[f.strength]}>
                      {STRENGTH_HEAD[f.strength] || f.strength}
                    </span>
                  </td>
                  <td className="hint">{f.origin}</td>
                  <td className="wrap">
                    {rd ? (
                      rd.triggered ? (
                        <>
                          <span className="sig-tag warn">触发中</span>{' '}
                          <span className="sig-reading" title={rd.detail || ''}>
                            {rd.detail}
                          </span>
                        </>
                      ) : (
                        <span className="hint">未触发</span>
                      )
                    ) : (
                      <span className="hint">{readingBusy ? '…' : '—'}</span>
                    )}
                  </td>
                  <td>{f.enabled ? '开' : '关'}</td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </CardBody>

      {drawer ? (
        <SignalDrawer
          target={drawer}
          onClose={() => setDrawer(null)}
          onGoConfig={() => {
            setDrawer(null)
            go('signalsconfig')
          }}
        />
      ) : null}
    </Card>
  )
}

/** 详情抽屉（US-02）：元数据 + 「跑一遍」实测 */
function SignalDrawer({
  target,
  onClose,
  onGoConfig,
}: {
  target: DrawerTarget
  onClose: () => void
  onGoConfig: () => void
}) {
  const [datasource, setDatasource] = useState<'dev' | 'prod'>('dev')
  const [baby, setBaby] = useState('旺仔')
  const [result, setResult] = useState<SignalValueResult | null>(null)
  const [running, setRunning] = useState(false)

  const key = target.kind === 'signal' ? target.signal.id : target.flag.key
  const name = target.kind === 'signal' ? target.signal.name : target.flag.name

  async function run() {
    setRunning(true)
    setResult(null)
    try {
      const r = await api.signalValue(baby.trim() || '旺仔', key, datasource)
      setResult(r)
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <div className="sig-drawer-mask" onClick={onClose} />
      <div className="sig-drawer">
        <div className="sig-drawer-head">
          <div>
            <div className="sig-drawer-title">{name}</div>
            <div className="hint">
              {key}
              {target.kind === 'signal' ? ` · ${target.groupName}` : ' · J 提醒规则'}
            </div>
          </div>
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
        </div>

        {target.kind === 'signal' ? (
          <div className="sig-section">
            <div className="sig-label">计算方式</div>
            <div>{target.signal.caliber}</div>
            <div className="sig-label">数据源</div>
            <div className="hint">{target.signal.source}</div>
            <div className="sig-label">关联参数（点击跳「配置清单」查看）</div>
            <div>
              {target.signal.params.length
                ? target.signal.params.map((p) => (
                    <span key={p} className="sig-chip" style={{ cursor: 'pointer' }} onClick={onGoConfig}>
                      {p}
                    </span>
                  ))
                : '—'}
            </div>
            <div className="sig-label">参考依据</div>
            <div className="hint">{target.signal.evidence}</div>
            {target.signal.status !== 'active' && target.signal.statusNote ? (
              <Notice>{target.signal.statusNote}</Notice>
            ) : null}
          </div>
        ) : (
          <div className="sig-section">
            <div className="sig-label">触发条件</div>
            <div>{target.flag.triggerDesc}</div>
            <div className="sig-label">强度 / 开关</div>
            <div>
              {target.flag.strengthLabel || target.flag.strength} · {target.flag.enabled ? '开' : '关'}
            </div>
            <div className="sig-label">出处</div>
            <div className="hint">
              {target.flag.origin} · {target.flag.evidence}
            </div>
          </div>
        )}

        <div className="sig-section">
          <div className="sig-label">实测值（跑一遍）</div>
          <div className="sig-run">
            <select value={datasource} onChange={(e) => setDatasource(e.target.value as 'dev' | 'prod')}>
              <option value="dev">测试环境</option>
              <option value="prod">生产环境（只读）</option>
            </select>
            <input value={baby} onChange={(e) => setBaby(e.target.value)} style={{ width: 150 }} placeholder="宝宝名字或 ID" />
            <button type="button" className="btn btn-primary" onClick={run} disabled={running}>
              {running ? '运行中…' : '跑一遍'}
            </button>
          </div>
          {result ? (
            result.ok ? (
              <div>
                <pre className="sig-json">
                  {typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2)}
                </pre>
                {result.note ? <div className="hint">{result.note}</div> : null}
                <div className="hint">
                  {result.datasource} · {result.baby?.name} · {result.generatedAt}
                </div>
              </div>
            ) : (
              <div className="sig-err">
                {result.error}
                {result.hint ? `（${result.hint}）` : ''}
              </div>
            )
          ) : null}
        </div>
      </div>
    </>
  )
}
