import { useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { SignalConfigData, SignalDryRunResult, SignalPublishResult } from '../lib/types'
import { Card, CardBody, Empty, ErrorBox, Loading, Notice } from '../components/ui'

/**
 * 页面：变更发布（TECH-029 / PRD-014 US-06/07）
 *
 * 三段式：① 待发布修改（草稿清单）→ ② 变更对比（干跑：注入块 diff + 提醒/信号变化）
 * → ③ 发布（完整校验 + 断言 167 条 → 写回配置文件 + 快照）→ 发布后事项清单。
 * 写回 ≠ 生产生效：生产随下次部署更新（清单里给出部署指引）。
 */

function nameOf(cfg: SignalConfigData | null, key: string): string {
  return cfg?.items.find((i) => i.key === key)?.name || key
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function SignalsPublishPage() {
  const { go, toast, nonce } = useApp()
  const { data, error, loading } = useAsync(
    async () => ({ cfg: await api.signalConfig(), draft: await api.signalDraft() }),
    [nonce],
  )
  const [ds, setDs] = useState<'dev' | 'prod'>('dev')
  const [baby, setBaby] = useState('旺仔')
  const [diffRes, setDiffRes] = useState<SignalDryRunResult | null>(null)
  const [diffBusy, setDiffBusy] = useState(false)
  const [diffErr, setDiffErr] = useState<string | null>(null)
  const [pubBusy, setPubBusy] = useState(false)
  const [pubErr, setPubErr] = useState<string[] | null>(null)
  const [pubOk, setPubOk] = useState<SignalPublishResult | null>(null)
  const [forceMode, setForceMode] = useState(false)
  const [forceReason, setForceReason] = useState('')

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  const cfg = data.cfg
  const items = data.draft.draft?.items || []
  const drift = data.draft.baseline.drift

  async function runDiff() {
    setDiffBusy(true)
    setDiffErr(null)
    try {
      const r = await api.signalDryRun({ baby: baby.trim() || '旺仔', datasource: ds })
      setDiffRes(r)
    } catch (e) {
      setDiffRes(null)
      setDiffErr((e as Error).message)
    } finally {
      setDiffBusy(false)
    }
  }

  async function doPublish(force = false) {
    setPubBusy(true)
    setPubErr(null)
    try {
      const r = await api.signalPublish(force, force ? forceReason : '')
      setPubOk(r)
      toast('已发布（随下次部署生效）')
    } catch (e) {
      const detail = (e as { detail?: { errors?: { error: string }[] } }).detail
      setPubErr(detail?.errors?.map((x) => x.error) || [(e as Error).message])
      if (force) setForceMode(false)
    } finally {
      setPubBusy(false)
    }
  }

  /* ── 发布完成视图 ── */
  if (pubOk) {
    return (
      <Card>
        <CardBody>
          <div style={{ fontSize: 14, fontWeight: 600 }}>✅ 已发布 {pubOk.version}</div>
          <div className="hint" style={{ marginTop: 4 }}>
            断言 {pubOk.assert.totalPasses} 项通过 ｜ 改动 {pubOk.diff.length} 项
            {pubOk.forced ? ' ｜ ⚠️ 本次为强制发布（已记审计）' : ''} ｜ 配置文件已写回（备份已生成）
          </div>
          <div className="sig-label" style={{ marginTop: 10 }}>
            发布后事项
          </div>
          {pubOk.checklist.map((c) => (
            <div key={c} className="hint" style={{ marginTop: 3 }}>
              □ {c}
            </div>
          ))}
          <div className="sig-edit-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => go('signalspublish')}>
              完成
            </button>
          </div>
        </CardBody>
      </Card>
    )
  }

  /* ── 无草稿视图 ── */
  if (!items.length) {
    return (
      <Card>
        <CardBody>
          <Empty title="当前没有待发布的修改">
            请先到「配置清单」或「词表维护」页做修改并保存——改动会先进入待发布状态，再回到这里发布。
          </Empty>
        </CardBody>
      </Card>
    )
  }

  const d = diffRes?.diff

  return (
    <>
      {drift ? (
        <Card>
          <CardBody>
            <Notice>
              注意：配置文件在平台外被改动过（基线指纹不一致）——发布会被阻止，防止覆盖外部改动。请在「配置清单」
              重新载入并保存草稿后再试。
            </Notice>
          </CardBody>
        </Card>
      ) : null}

      {/* ① 待发布修改 */}
      <Card>
        <CardBody>
          <div style={{ fontWeight: 600 }}>
            ① 待发布修改（{items.length} 项）
          </div>
          {items.map((it) => (
            <div key={it.key} className="sig-edit-row" style={{ alignItems: 'baseline' }}>
              <b style={{ minWidth: 180 }}>{nameOf(cfg, it.key)}</b>
              <span className="sig-reading">
                {fmt(cfg.items.find((i) => i.key === it.key)?.current)} → {fmt(it.newValue)}
              </span>
              <span className="hint">（为什么改：{it.reason}）</span>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* ② 变更对比 */}
      <Card>
        <CardBody>
          <div style={{ fontWeight: 600 }}>② 变更对比（用真实数据先跑一遍）</div>
          <div className="sig-run" style={{ marginTop: 6 }}>
            <span className="hint">数据源</span>
            <select value={ds} onChange={(e) => setDs(e.target.value as 'dev' | 'prod')}>
              <option value="dev">测试环境</option>
              <option value="prod">生产环境（只读）</option>
            </select>
            <input value={baby} onChange={(e) => setBaby(e.target.value)} style={{ width: 130 }} placeholder="宝宝名字或 ID" />
            <button type="button" className="btn btn-primary" onClick={runDiff} disabled={diffBusy}>
              {diffBusy ? '运行中…' : '跑对比'}
            </button>
            {diffErr ? <span className="sig-err">对比失败：{diffErr}</span> : null}
          </div>

          {d ? (
            <>
              <div className="sig-label" style={{ marginTop: 10 }}>
                配置变化（{d.configChanged.length} 项）
              </div>
              {d.configChanged.map((c) => (
                <div key={c.key} className="hint" style={{ marginTop: 2 }}>
                  {c.key}：{fmt(c.before)} → {fmt(c.after)}
                </div>
              ))}
              {!d.configChanged.length ? <div className="hint">（无）</div> : null}

              <div className="sig-label" style={{ marginTop: 10 }}>
                注入到助手的内容变化
              </div>
              {d.blockLines.some((l) => l.type !== 'same') ? (
                <div className="sig-diff">
                  {d.blockLines.map((l, i) => (
                    <div key={i} className={`sig-diff-line ${l.type}`}>
                      {l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}
                      {l.text}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="hint">（当前数据下无可见变化——改动可能只影响其他数据场景）</div>
              )}

              <div className="sig-label" style={{ marginTop: 10 }}>
                提醒变化
              </div>
              {d.flagsAdded.length || d.flagsRemoved.length || d.flagsChanged.length ? (
                <>
                  {d.flagsAdded.map((f) => (
                    <div key={`a${f.key}`} className="hint">
                      + 新增触发：{f.label}（{f.detail}）
                    </div>
                  ))}
                  {d.flagsRemoved.map((f) => (
                    <div key={`r${f.key}`} className="hint">
                      − 不再触发：{f.label}
                    </div>
                  ))}
                  {d.flagsChanged.map((f) => (
                    <div key={`c${f.key}`} className="hint">
                      ~ 变化：{f.after.label}（{f.before.strength} → {f.after.strength}）
                    </div>
                  ))}
                </>
              ) : (
                <div className="hint">（无）</div>
              )}

              {d.routeChanged ? (
                <div className="hint" style={{ marginTop: 6 }}>
                  判定路径：{d.routeChanged.before} → {d.routeChanged.after}
                </div>
              ) : null}
              {d.signalsChanged.length ? (
                <>
                  <div className="sig-label" style={{ marginTop: 10 }}>
                    信号值变化（{d.signalsChanged.length} 项）
                  </div>
                  {d.signalsChanged.map((s) => (
                    <div key={s.key} className="hint">
                      {s.key}：{fmt(s.before)} → {fmt(s.after)}
                    </div>
                  ))}
                </>
              ) : null}
            </>
          ) : null}
        </CardBody>
      </Card>

      {/* ③ 发布 */}
      <Card>
        <CardBody>
          <div style={{ fontWeight: 600 }}>③ 发布</div>
          <div className="hint" style={{ marginTop: 4 }}>
            发布将：完整校验 → 自动断言（167 条：配置层 + 行为层）→ 写回配置文件（含备份与快照）。
            写回后生产**随下次部署生效**（不会立即影响线上助手）。
          </div>
          {pubErr ? (
            <div style={{ marginTop: 8 }}>
              {pubErr.map((e) => (
                <div key={e} className="sig-err">
                  {e}
                </div>
              ))}
              {!forceMode ? (
                <button type="button" className="btn" style={{ marginTop: 6 }} onClick={() => setForceMode(true)}>
                  确认无碍，强制发布
                </button>
              ) : (
                <div className="sig-edit-row" style={{ marginTop: 6 }}>
                  <input
                    value={forceReason}
                    onChange={(e) => setForceReason(e.target.value)}
                    placeholder="强制发布理由（必填，会记入审计）"
                    style={{ flex: 1, minWidth: 260 }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => doPublish(true)}
                    disabled={pubBusy || !forceReason.trim()}
                  >
                    {pubBusy ? '发布中…' : '确认强制发布'}
                  </button>
                </div>
              )}
            </div>
          ) : null}
          <div className="sig-edit-row" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-primary" onClick={() => doPublish(false)} disabled={pubBusy}>
              {pubBusy ? '发布中（含断言运行）…' : '发布'}
            </button>
          </div>
        </CardBody>
      </Card>
    </>
  )
}
