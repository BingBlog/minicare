import { useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { SignalAuditItem, SignalVersion, SignalVersionDetail } from '../lib/types'
import { Card, CardBody, Empty, ErrorBox, Loading, Notice, Table } from '../components/ui'
import { Modal } from '../components/Modal'

/**
 * 页面：版本与审计（TECH-029 / PRD-014 US-08 / US-09）
 *
 * 两个页签：
 *  - 版本历史：发布版本列表（值级 diff / 回滚 / 外部变更处理 / 部署确认）；
 *  - 审计日志：全部治理动作（草稿 / 发布 / 回滚 / 审阅 / 部署确认…），只追加不可编辑。
 *
 * 语义：写回配置 ≠ 生产生效——「确认已生效」是人工动作（部署完成后回来记一笔）。
 */

const ACTION_LABEL: Record<string, string> = {
  draft_save: '保存草稿',
  draft_discard: '丢弃草稿',
  publish: '发布',
  force_publish: '强制发布',
  rollback: '回滚',
  review: '标记已审阅',
  review_config: '调整复审周期',
  deploy_confirm: '确认已生效',
  external_register: '外部变更登记',
}

const STATUS_META: Record<string, { text: string; cls: string }> = {
  current: { text: '当前', cls: 'ok' },
  superseded: { text: '历史', cls: '' },
  rolled_back: { text: '已回滚', cls: 'warn' },
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? '开' : '关'
  if (typeof v === 'object') return JSON.stringify(v, null, 0)
  return String(v)
}

function fmtTs(ts: string | null): string {
  if (!ts) return '—'
  // '2026-10-11T18:33:20+08:00' → '10-11 18:33'
  return ts.slice(5, 16).replace('T', ' ')
}

export function SignalsHistoryPage() {
  const { refresh, toast, nonce } = useApp()
  const { data, error, loading } = useAsync(() => api.signalVersions(), [nonce])
  const [tab, setTab] = useState<'versions' | 'audit'>('versions')

  // 详情弹层
  const [detail, setDetail] = useState<SignalVersionDetail | null>(null)
  const [detailBusy, setDetailBusy] = useState<string | null>(null)
  // 名称映射（详情里 key → 中文名）
  const [nameMap, setNameMap] = useState<Record<string, string>>({})

  // 回滚弹层
  const [rbTarget, setRbTarget] = useState<SignalVersion | null>(null)
  const [rbReason, setRbReason] = useState('')
  const [rbBusy, setRbBusy] = useState(false)
  const [rbErr, setRbErr] = useState<string[] | null>(null)
  const [rbForce, setRbForce] = useState(false)
  const [rbForceReason, setRbForceReason] = useState('')

  // 外部变更 / 部署确认
  const [actBusy, setActBusy] = useState(false)

  // 审计（懒加载 + 分页）
  const [audit, setAudit] = useState<{ items: SignalAuditItem[]; total: number } | null>(null)
  const [auditBusy, setAuditBusy] = useState(false)
  const [auditErr, setAuditErr] = useState<string | null>(null)

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  const { versions, deploy, drift } = data

  async function openDetail(v: SignalVersion) {
    setDetailBusy(v.version)
    try {
      const [d, cfg] = await Promise.all([api.signalVersionDetail(v.version), api.signalConfig()])
      setNameMap(Object.fromEntries(cfg.items.map((i) => [i.key, i.name])))
      setDetail(d)
    } catch (e) {
      toast(`详情加载失败：${(e as Error).message}`)
    } finally {
      setDetailBusy(null)
    }
  }

  async function loadAudit(offset = 0) {
    setAuditBusy(true)
    setAuditErr(null)
    try {
      const r = await api.signalAudit(50, offset)
      setAudit((prev) =>
        offset === 0 || !prev ? { items: r.items, total: r.total } : { items: [...prev.items, ...r.items], total: r.total },
      )
    } catch (e) {
      setAuditErr((e as Error).message)
    } finally {
      setAuditBusy(false)
    }
  }

  function switchTab(t: 'versions' | 'audit') {
    setTab(t)
    if (t === 'audit' && !audit && !auditBusy) void loadAudit(0)
  }

  async function doRollback(force = false) {
    if (!rbTarget) return
    setRbBusy(true)
    setRbErr(null)
    try {
      const r = await api.signalRollback(rbTarget.version, rbReason.trim(), force, force ? rbForceReason : '')
      toast(`已回滚：生成新版本 ${r.version}（断言 ${r.assert.totalPasses} 项通过）`)
      setRbTarget(null)
      setRbReason('')
      setRbForce(false)
      setRbForceReason('')
      refresh()
      if (audit) void loadAudit(0)
    } catch (e) {
      const detailErr = (e as { detail?: { errors?: { error: string }[] } }).detail
      setRbErr(detailErr?.errors?.map((x) => x.error) || [(e as Error).message])
      if (force) setRbForce(false)
    } finally {
      setRbBusy(false)
    }
  }

  async function doExternalRegister() {
    setActBusy(true)
    try {
      const r = await api.signalExternalRegister()
      toast(`已登记外部变更：新版本 ${r.version}（${r.diff.length} 项）`)
      refresh()
    } catch (e) {
      const detailErr = (e as { detail?: { errors?: { error: string }[] } }).detail
      toast(`登记失败：${detailErr?.errors?.[0]?.error || (e as Error).message}`)
    } finally {
      setActBusy(false)
    }
  }

  async function doDeployConfirm() {
    setActBusy(true)
    try {
      const r = await api.signalDeployConfirm()
      toast(r.already ? `已确认过（${r.version}）` : `已确认生效：${r.version}`)
      refresh()
    } catch (e) {
      toast(`确认失败：${(e as Error).message}`)
    } finally {
      setActBusy(false)
    }
  }

  const curVer = versions.find((v) => v.isCurrent)

  return (
    <>
      {/* ① 状态条：当前版本 / 部署状态 */}
      <Card>
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>当前版本</span>
            {curVer ? (
              <>
                <span className="sig-reading" style={{ fontWeight: 600 }}>
                  {curVer.version}
                </span>
                <span className="hint">发布于 {fmtTs(curVer.createdAt)}</span>
                {deploy.confirmed ? (
                  <>
                    <span className="sig-tag ok">已部署生效</span>
                    <span className="hint">确认于 {fmtTs(deploy.confirmedAt)}</span>
                  </>
                ) : (
                  <>
                    <span className="sig-tag warn">待部署</span>
                    <span className="hint">部署 minicare-agent 后点右侧确认</span>
                    <button type="button" className="btn btn-primary" onClick={doDeployConfirm} disabled={actBusy}>
                      确认已生效
                    </button>
                  </>
                )}
              </>
            ) : (
              <span className="hint">尚无发布版本——到「变更发布」页发布第一版</span>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ② 外部变更警告（指纹漂移时） */}
      {drift.hasDrift ? (
        <Card>
          <CardBody>
            <Notice>
              检测到 signals.yaml 与最近快照（{drift.latestVersion}）不一致——文件在平台外被修改过。
              <div className="sig-toolbar" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-primary" onClick={doExternalRegister} disabled={actBusy}>
                  登记为新快照（保留外部改动）
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={actBusy}
                  onClick={() => {
                    const latest = versions.find((v) => v.isCurrent)
                    if (latest) {
                      setRbTarget(latest)
                      setRbReason('处理平台外修改：恢复最近快照的值')
                      setRbErr(null)
                    }
                  }}
                >
                  恢复最近快照（丢弃外部改动）
                </button>
                <span className="hint">
                  指纹：当前 {drift.currentFingerprint} ｜ 快照 {drift.latestFingerprint}
                </span>
              </div>
            </Notice>
          </CardBody>
        </Card>
      ) : null}

      {/* ③ 页签 */}
      <Card>
        <CardBody flush>
          <div className="sig-toolbar" style={{ padding: '10px 14px 0' }}>
            <button
              type="button"
              className={tab === 'versions' ? 'btn btn-primary' : 'btn'}
              onClick={() => switchTab('versions')}
            >
              版本历史（{versions.length}）
            </button>
            <button
              type="button"
              className={tab === 'audit' ? 'btn btn-primary' : 'btn'}
              onClick={() => switchTab('audit')}
            >
              审计日志{audit ? `（${audit.total}）` : ''}
            </button>
          </div>

          {tab === 'versions' ? (
            !versions.length ? (
              <div style={{ padding: '10px 14px 14px' }}>
                <Empty title="尚无发布版本">
                  发布后方会建档：到「变更发布」页把草稿发布，即生成第一个版本快照（可回滚、可审计）。
                </Empty>
              </div>
            ) : (
              <Table cols={[130, 110, 86, 0, 76, 225]}>
                <thead>
                  <tr>
                    <th>版本</th>
                    <th>发布时间</th>
                    <th>状态</th>
                    <th>改动摘要</th>
                    <th>部署</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => {
                    const st = STATUS_META[v.status] || { text: v.status, cls: '' }
                    return (
                      <tr key={v.version}>
                        <td>
                          <b>{v.version}</b>
                          {v.forced ? <span className="sig-tag warn" style={{ marginLeft: 6 }}>强制</span> : null}
                        </td>
                        <td className="hint">{fmtTs(v.createdAt)}</td>
                        <td>
                          <span className={`sig-tag ${st.cls}`}>{st.text}</span>
                        </td>
                        <td className="wrap">
                          <span className="sig-reading">{v.summary}</span>
                          {v.reason ? <div className="hint">理由：{v.reason}</div> : null}
                        </td>
                        <td>
                          {v.isCurrent ? (
                            deploy.confirmed ? (
                              <span className="sig-tag ok">已生效</span>
                            ) : (
                              <span className="sig-tag warn">待部署</span>
                            )
                          ) : (
                            <span className="hint">—</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => openDetail(v)}
                            disabled={detailBusy === v.version}
                          >
                            {detailBusy === v.version ? '加载中…' : '查看详情'}
                          </button>
                          {!v.isCurrent ? (
                            <button
                              type="button"
                              className="btn"
                              style={{ marginLeft: 6 }}
                              onClick={() => {
                                setRbTarget(v)
                                setRbReason('')
                                setRbErr(null)
                              }}
                            >
                              回滚到此版本
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            )
          ) : (
            <>
              {auditErr ? (
                <div style={{ padding: '10px 14px' }}>
                  <span className="sig-err">审计加载失败：{auditErr}</span>
                  <button type="button" className="btn" style={{ marginLeft: 8 }} onClick={() => loadAudit(0)}>
                    重试
                  </button>
                </div>
              ) : !audit ? (
                <div style={{ padding: '10px 14px' }} className="hint">
                  {auditBusy ? '加载中…' : '进入页签后自动加载'}
                </div>
              ) : !audit.items.length ? (
                <div style={{ padding: '10px 14px 14px' }}>
                  <Empty title="尚无变更记录">保存草稿 / 发布 / 回滚 / 审阅等动作都会在这里留痕。</Empty>
                </div>
              ) : (
                <>
                  <Table cols={[110, 100, 130, 0, 96]}>
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>动作</th>
                        <th>对象</th>
                        <th>理由 / 详情</th>
                        <th>前后值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.items.map((a) => (
                        <tr key={a.id}>
                          <td className="hint">{fmtTs(a.ts)}</td>
                          <td>
                            <span className="sig-tag">{ACTION_LABEL[a.action] || a.action}</span>
                          </td>
                          <td className="hint">{a.object_key || '—'}</td>
                          <td className="wrap">
                            <span className="sig-reading">{a.reason || '—'}</span>
                          </td>
                          <td>
                            <AuditDelta before={a.before} after={a.after} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <div className="sig-toolbar" style={{ padding: '8px 14px' }}>
                    <span className="hint">
                      已显示 {audit.items.length} / {audit.total}
                    </span>
                    {audit.items.length < audit.total ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => loadAudit(audit.items.length)}
                        disabled={auditBusy}
                      >
                        {auditBusy ? '加载中…' : '加载更多'}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {/* ④ 版本详情弹层 */}
      {detail ? (
        <Modal
          title={`版本 ${detail.version}`}
          subtitle={`${fmtTs(detail.createdAt)} ｜ 指纹 ${detail.fingerprint || '—'}${detail.forced ? ' ｜ 强制发布' : ''}`}
          onClose={() => setDetail(null)}
          width={760}
        >
          <div className="sig-label">理由</div>
          <div className="hint" style={{ marginBottom: 10 }}>
            {detail.reason || '—'}
          </div>
          <div className="sig-label">值级变化（{detail.diff.length} 项）</div>
          {detail.diff.length ? (
            <Table cols={[0, 0, 0]}>
              <thead>
                <tr>
                  <th>配置项</th>
                  <th>原值</th>
                  <th>新值</th>
                </tr>
              </thead>
              <tbody>
                {detail.diff.map((d) => (
                  <tr key={d.key}>
                    <td>
                      <b>{nameMap[d.key] || d.key}</b>
                      {nameMap[d.key] ? <div className="hint">{d.key}</div> : null}
                    </td>
                    <td className="wrap sig-reading">{fmt(d.before)}</td>
                    <td className="wrap sig-reading">
                      <span className="sig-tag ok">{fmt(d.after)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="hint">（无值级变化）</div>
          )}
        </Modal>
      ) : null}

      {/* ⑤ 回滚确认弹层 */}
      {rbTarget ? (
        <Modal
          title={`回滚到 ${rbTarget.version}`}
          onClose={() => (rbBusy ? null : setRbTarget(null))}
          width={560}
        >
          <div className="hint">流程与发布一致：完整校验 + 167 项断言 → 写回 → 生成新版本。</div>
          <div className="hint" style={{ marginTop: 3 }}>
            将把配置文件恢复为该版本的全部值，并生成一个新版本（当前版本会标记为「已回滚」）。写回后仍随下次部署生效。
          </div>
          <div className="sig-edit-row" style={{ marginTop: 10 }}>
            <input
              value={rbReason}
              onChange={(e) => setRbReason(e.target.value)}
              placeholder="回滚理由（选填，会记入审计）"
              style={{ flex: 1, minWidth: 260 }}
            />
          </div>
          {rbErr ? (
            <div style={{ marginTop: 8 }}>
              {rbErr.map((e) => (
                <div key={e} className="sig-err">
                  {e}
                </div>
              ))}
              {!rbForce ? (
                <button type="button" className="btn" style={{ marginTop: 6 }} onClick={() => setRbForce(true)}>
                  确认无碍，强制回滚
                </button>
              ) : (
                <div className="sig-edit-row" style={{ marginTop: 6 }}>
                  <input
                    value={rbForceReason}
                    onChange={(e) => setRbForceReason(e.target.value)}
                    placeholder="强制回滚理由（必填，会记入审计）"
                    style={{ flex: 1, minWidth: 240 }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => doRollback(true)}
                    disabled={rbBusy || !rbForceReason.trim()}
                  >
                    确认强制回滚
                  </button>
                </div>
              )}
            </div>
          ) : null}
          <div className="sig-edit-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setRbTarget(null)} disabled={rbBusy}>
              取消
            </button>
            <button type="button" className="btn btn-primary" onClick={() => doRollback(false)} disabled={rbBusy}>
              {rbBusy ? '回滚中（含断言运行）…' : '执行回滚'}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  )
}

/** 审计行的「前后值」小三角展开（内容可能较长，默认收拢） */
function AuditDelta({ before, after }: { before: string | null; after: string | null }) {
  const [open, setOpen] = useState(false)
  if (!before && !after) return <span className="hint">—</span>
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
        {open ? '收起' : '查看'}
      </button>
      {open ? (
        <div className="sig-diff" style={{ marginTop: 4, maxHeight: 160, overflow: 'auto' }}>
          {before ? <div className="sig-diff-line del">- {before}</div> : null}
          {after ? <div className="sig-diff-line add">+ {after}</div> : null}
        </div>
      ) : null}
    </>
  )
}
