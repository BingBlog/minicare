import { Fragment, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { SignalConfigItem, SignalDraftItem } from '../lib/types'
import { Card, CardBody, CardHead, Empty, ErrorBox, Loading, Notice, Table } from '../components/ui'
import { Modal } from '../components/Modal'

/**
 * 页面：配置清单（TECH-029 / PRD-014 US-03/04/05/09）
 *
 * 58 项按 7 类分组；数值/开关/强度类支持行内编辑（编辑 → 填「为什么改」→ 保存为草稿）；
 * 词表类（5 项）在「词表维护」独立页编辑；草稿只存平台，发布前对 agent 零影响。
 * 医学参数（带「医」标记）纳入复审管理：超期标黄、可标记已审阅、周期可调（默认 180 天）。
 */

const GROUP_ORDER = ['ref', 'threshold', 'throttle', 'wordlist', 'inject', 'flag_switch', 'flag_strength']
const STRENGTH_CN: Record<string, string> = { strong: '强', medium: '中', weak: '弱', intercept: '拦截' }
const LIST_UNIT: Record<string, string> = { highRiskGroups: '组', categoryRules: '类', prefix: '条', suffix: '条' }
const REASON_MIN = 10

interface DraftErrDetail {
  errors?: { key: string; error: string }[]
}

function errText(e: unknown): string {
  const detail = (e as { detail?: DraftErrDetail }).detail
  if (detail?.errors?.length) return detail.errors.map((x) => x.error).join('；')
  return (e as Error).message
}

function fmtValue(it: SignalConfigItem, v: unknown): string {
  if (it.group === 'flag_strength' && typeof v === 'string') return STRENGTH_CN[v] || v
  if (it.type === 'bool') return v ? '开' : '关'
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return `${v.length} ${LIST_UNIT[it.key] || '项'}`
  if (typeof v === 'object') return `${Object.keys(v as Record<string, unknown>).length} 键`
  return `${v}${it.unit ? ` ${it.unit}` : ''}`
}

function rangeText(it: SignalConfigItem): string {
  const parts: string[] = []
  if (it.range?.length === 2) parts.push(`范围 ${it.range[0]}–${it.range[1]}${it.unit ? ` ${it.unit}` : ''}`)
  if (it.presets?.length) {
    const pres = it.group === 'flag_strength' ? it.presets.map((p) => STRENGTH_CN[String(p)] || p) : it.presets
    parts.push(`档位 ${pres.join(' / ')}`)
  }
  return parts.join(' · ')
}

function fmtDay(ts: string | null): string {
  return ts ? ts.slice(5, 10) : '—'
}

export function SignalsConfigPage() {
  const { go, toast, nonce, refresh } = useApp()
  const { data, error, loading } = useAsync(
    async () => ({ cfg: await api.signalConfig(), draft: await api.signalDraft() }),
    [nonce],
  )
  const [draftMap, setDraftMap] = useState<Map<string, SignalDraftItem>>(new Map())
  const [editKey, setEditKey] = useState<string | null>(null)
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [onlyPending, setOnlyPending] = useState(false)
  const [baselineDrift, setBaselineDrift] = useState(false)
  // 复审交互（S7）：标记已审阅弹层 / 周期调整弹层
  const [reviewTarget, setReviewTarget] = useState<SignalConfigItem | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewErr, setReviewErr] = useState<string | null>(null)
  const [cycleOpen, setCycleOpen] = useState(false)
  const [cycleDays, setCycleDays] = useState(180)
  const [cycleErr, setCycleErr] = useState<string | null>(null)

  useEffect(() => {
    if (data?.draft.draft) setDraftMap(new Map(data.draft.draft.items.map((i) => [i.key, i])))
    else setDraftMap(new Map())
    setBaselineDrift(Boolean(data?.draft.baseline.drift))
    if (data?.cfg.reviewConfig) setCycleDays(data.cfg.reviewConfig.cycleDays)
  }, [data])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  const cfg = data.cfg
  const draftCount = draftMap.size
  const isModified = (it: SignalConfigItem) => it.status === 'changed' || draftMap.has(it.key)
  const changedCount = cfg.items.filter(isModified).length
  const pendingCount = cfg.items.filter((i) => i.pendingReview).length
  const neverCount = cfg.reviewSummary?.neverReviewedCount ?? 0
  const cycle = cfg.reviewSummary?.cycleDays ?? 180
  let items = cfg.items
  if (onlyChanged) items = items.filter(isModified)
  if (onlyPending) items = items.filter((i) => i.pendingReview)
  const sections = GROUP_ORDER.map((g) => ({
    g,
    label: cfg.groupLabels[g] || g,
    list: items.filter((i) => i.group === g),
  })).filter((x) => x.list.length)

  /** 保存单项草稿（合并进草稿全集） */
  async function saveItem(key: string, newValue: unknown, reason: string) {
    const next = new Map(draftMap)
    next.set(key, { key, newValue, reason })
    await api.signalDraftSave([...next.values()])
    setDraftMap(next)
    setEditKey(null)
    toast('已保存修改（待发布）——不影响助手')
  }

  /** 移除单项草稿 */
  async function removeItem(key: string) {
    const next = new Map(draftMap)
    next.delete(key)
    if (next.size === 0) await api.signalDraftDiscard()
    else await api.signalDraftSave([...next.values()])
    setDraftMap(next)
    setEditKey(null)
    toast('已撤销这项修改')
  }

  /** 丢弃全部草稿 */
  async function discardAll() {
    if (!window.confirm(`确认放弃全部修改（${draftCount} 项）？不影响已发布的配置。`)) return
    await api.signalDraftDiscard()
    setDraftMap(new Map())
    toast('已放弃全部修改')
  }

  /** 标记已审阅（S7 / US-09） */
  async function doMarkReviewed() {
    if (!reviewTarget) return
    setReviewBusy(true)
    setReviewErr(null)
    try {
      await api.signalReview(reviewTarget.key, reviewNote.trim())
      toast(`已标记审阅：${reviewTarget.name}`)
      setReviewTarget(null)
      setReviewNote('')
      refresh()
    } catch (e) {
      setReviewErr(errText(e))
    } finally {
      setReviewBusy(false)
    }
  }

  /** 调整复审周期（S7 / US-09；本身也是受审计的配置） */
  async function doSetCycle() {
    setCycleErr(null)
    try {
      await api.signalReviewConfigSet(cycleDays)
      toast(`复审周期已调整为 ${cycleDays} 天`)
      setCycleOpen(false)
      refresh()
    } catch (e) {
      setCycleErr(errText(e))
    }
  }

  return (
    <>
      <Card>
        <CardBody>
          <div className="toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn${!onlyChanged && !onlyPending ? ' btn-primary' : ''}`}
              onClick={() => {
                setOnlyChanged(false)
                setOnlyPending(false)
              }}
            >
              全部 {cfg.count}
            </button>
            <button
              type="button"
              className={`btn${onlyChanged ? ' btn-primary' : ''}`}
              onClick={() => {
                setOnlyChanged(true)
                setOnlyPending(false)
              }}
              disabled={!changedCount}
            >
              有改动 {changedCount}
            </button>
            <button
              type="button"
              className={`btn${onlyPending ? ' btn-primary' : ''}`}
              onClick={() => {
                setOnlyPending(true)
                setOnlyChanged(false)
              }}
              disabled={!pendingCount}
            >
              待复审 {pendingCount}
            </button>
            <span style={{ flex: 1 }} />
            <span className="hint">
              复审周期 {cycle} 天{neverCount ? ` · ${neverCount} 项未审阅` : ''}
            </span>
            <button type="button" className="btn" onClick={() => setCycleOpen(true)}>
              调整
            </button>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            改动会先保存为{`「待发布修改」`}——不会影响助手，直到正式发布。带「医」标记的是医学参考参数：
            点行内「已审阅」可更新复审记录；超期（{cycle} 天）会标黄提示。
          </div>
        </CardBody>
      </Card>

      {draftCount ? (
        <Card>
          <CardBody>
            <div className="sig-draft-bar">
              <span>
                草稿：<b>{draftCount}</b> 项待发布（
                {[...draftMap.keys()]
                  .slice(0, 4)
                  .map((k) => cfg.items.find((i) => i.key === k)?.name || k)
                  .join('、')}
                {draftCount > 4 ? ' 等' : ''}）
              </span>
              <span>
                <button type="button" className="btn" onClick={discardAll}>
                  放弃全部修改
                </button>
              </span>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {baselineDrift ? (
        <Card>
          <CardBody>
            <Notice>警告：signals.yaml 在平台外被改动过（基线指纹不一致）。发布前请核对版本历史。</Notice>
          </CardBody>
        </Card>
      ) : null}

      {sections.map(({ g, label, list }) => (
        <Card key={g}>
          <CardHead title={label} meta={`${list.length} 项`} />
          <CardBody flush>
            <Table cols={[190, 150, 110, 70, 120, 140, 0, 110]}>
              <thead>
                <tr>
                  <th>参数</th>
                  <th>当前值</th>
                  <th>默认值</th>
                  <th>状态</th>
                  <th>审阅</th>
                  <th>依据</th>
                  <th>说明</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map((it) => {
                  const draft = draftMap.get(it.key)
                  const editable = !it.isFlag || it.group === 'flag_switch' || it.group === 'flag_strength'
                  const isWordlist = it.group === 'wordlist'
                  return (
                    <Fragment key={it.key}>
                      <tr>
                        <td>
                          <b>{it.name}</b>
                          {it.medical ? <span className="sig-med" title="医学参考参数，纳入定期复审">医</span> : null}
                          <div className="hint">{it.key}</div>
                        </td>
                        <td>
                          {draft ? (
                            <>
                              {fmtValue(it, draft.newValue)}
                              <div className="hint" style={{ textDecoration: 'line-through' }}>
                                现 {fmtValue(it, it.current)}
                              </div>
                            </>
                          ) : (
                            <>
                              {fmtValue(it, it.current)}
                              {rangeText(it) ? <div className="hint">{rangeText(it)}</div> : null}
                            </>
                          )}
                        </td>
                        <td>{it.default === null ? <span className="hint">代码内置</span> : fmtValue(it, it.default)}</td>
                        <td>
                          {draft ? (
                            <span className="sig-tag warn">待发布</span>
                          ) : it.status === 'changed' ? (
                            <span className="sig-tag warn">已改动</span>
                          ) : (
                            <span className="sig-tag">未改动</span>
                          )}
                        </td>
                        <td>
                          {it.reviewState === 'na' ? (
                            <span className="hint">—</span>
                          ) : it.pendingReview ? (
                            <>
                              <span className="sig-tag warn">待复审</span>
                              <div className="hint">上次 {fmtDay(it.lastReviewedAt)}</div>
                            </>
                          ) : it.lastReviewedAt ? (
                            <>
                              <span className="sig-tag ok">已审阅</span>
                              <div className="hint">{fmtDay(it.lastReviewedAt)}</div>
                            </>
                          ) : (
                            <span className="hint">未审阅</span>
                          )}
                        </td>
                        <td className="hint wrap">{it.evidence}</td>
                        <td className="wrap hint">{it.note}</td>
                        <td>
                          {isWordlist ? (
                            <button type="button" className="btn" onClick={() => go('signalswords')}>
                              去词表维护 →
                            </button>
                          ) : editable ? (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => setEditKey(editKey === it.key ? null : it.key)}
                            >
                              {editKey === it.key ? '收起' : '编辑'}
                            </button>
                          ) : null}
                          {it.medical ? (
                            <button
                              type="button"
                              className="btn"
                              style={{ marginLeft: 6 }}
                              title={it.reviewNote ? `上次结论：${it.reviewNote}` : '更新复审记录'}
                              onClick={() => {
                                setReviewTarget(it)
                                setReviewNote('')
                                setReviewErr(null)
                              }}
                            >
                              标记已审阅
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {editKey === it.key && !isWordlist ? (
                        <tr>
                          <td colSpan={8} className="sig-edit-cell">
                            <EditPanel
                              item={it}
                              initial={draftMap.get(it.key)}
                              onSave={(v, r) => saveItem(it.key, v, r)}
                              onRemove={draftMap.has(it.key) ? () => removeItem(it.key) : undefined}
                              onCancel={() => setEditKey(null)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      ))}

      {!sections.length ? (
        <Card>
          <CardBody>
            <Empty title="无匹配项">当前筛选下没有配置项。</Empty>
          </CardBody>
        </Card>
      ) : null}

      {/* 标记已审阅弹层（S7 / US-09）：复审不是「必须改」，「已审阅，维持原值」是合法结论 */}
      {reviewTarget ? (
        <Modal
          title={`标记已审阅：${reviewTarget.name}`}
          subtitle={`${reviewTarget.key} ｜ 当前值 ${fmtValue(reviewTarget, reviewTarget.current)}`}
          onClose={() => (reviewBusy ? null : setReviewTarget(null))}
          width={560}
        >
          <div className="hint">
            表示已对照依据（{reviewTarget.evidence || '—'}）复查过当前值。维持原值也是合法结论，结论与时间会记入审计日志。
          </div>
          <div className="sig-edit-row" style={{ marginTop: 10 }}>
            <input
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="复审结论（选填）：如「已核对最新指南，维持原值」"
              style={{ flex: 1, minWidth: 280 }}
            />
          </div>
          {reviewErr ? <div className="sig-err">{reviewErr}</div> : null}
          <div className="sig-edit-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setReviewTarget(null)} disabled={reviewBusy}>
              取消
            </button>
            <button type="button" className="btn btn-primary" onClick={doMarkReviewed} disabled={reviewBusy}>
              {reviewBusy ? '提交中…' : '确认已审阅'}
            </button>
          </div>
        </Modal>
      ) : null}

      {/* 复审周期调整弹层（S7 / US-09） */}
      {cycleOpen ? (
        <Modal title="调整复审周期" subtitle="对齐 CDSS 规范「更新周期一般不长于半年」" onClose={() => setCycleOpen(false)} width={460}>
          <div className="sig-edit-row">
            <span className="sig-label">周期</span>
            <input
              type="number"
              min={30}
              max={730}
              value={cycleDays}
              onChange={(e) => setCycleDays(Number(e.target.value))}
              style={{ width: 100 }}
            />
            <span className="hint">天（30–730；医学参数超过该时长未审阅将标黄提醒）</span>
          </div>
          {cycleErr ? <div className="sig-err">{cycleErr}</div> : null}
          <div className="sig-edit-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setCycleOpen(false)}>
              取消
            </button>
            <button type="button" className="btn btn-primary" onClick={doSetCycle}>
              保存（记入审计）
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  )
}

/* ── 行内编辑面板（数值 / 开关 / 强度）───────────────────────────── */

function EditPanel({
  item,
  initial,
  onSave,
  onRemove,
  onCancel,
}: {
  item: SignalConfigItem
  initial?: SignalDraftItem
  onSave: (v: unknown, reason: string) => Promise<void>
  onRemove?: () => Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState<unknown>(initial ? initial.newValue : item.current)
  const [reason, setReason] = useState(initial?.reason || '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      await onSave(value, reason)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setErr(null)
    try {
      await onRemove?.()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sig-edit">
      <div className="sig-edit-row">
        <span className="sig-label">新值</span>
        <ValueEditor item={item} value={value} onChange={setValue} />
        {item.range?.length === 2 ? (
          <span className="hint">
            范围 {item.range[0]}–{item.range[1]}
            {item.unit ? ` ${item.unit}` : ''}
          </span>
        ) : null}
        {item.presets?.map((p) => (
          <button key={String(p)} type="button" className="btn" onClick={() => setValue(p)}>
            {item.group === 'flag_strength' ? STRENGTH_CN[String(p)] || p : String(p)}
          </button>
        ))}
      </div>
      <div className="sig-edit-row">
        <span className="sig-label">为什么改 *</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={`至少 ${REASON_MIN} 字，会进审计日志`}
          style={{ flex: 1, minWidth: 260 }}
        />
      </div>
      {err ? <div className="sig-err">{err}</div> : null}
      <div className="sig-edit-row">
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? '保存中…' : '保存修改（待发布）'}
        </button>
        {onRemove ? (
          <button type="button" className="btn" onClick={remove} disabled={busy}>
            撤销这项修改
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
    </div>
  )
}

function ValueEditor({
  item,
  value,
  onChange,
}: {
  item: SignalConfigItem
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (item.group === 'flag_switch' || item.type === 'bool') {
    return (
      <select value={value ? 'true' : 'false'} onChange={(e) => onChange(e.target.value === 'true')}>
        <option value="true">开</option>
        <option value="false">关</option>
      </select>
    )
  }
  if (item.group === 'flag_strength') {
    return (
      <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {['strong', 'medium', 'weak', 'intercept'].map((s) => (
          <option key={s} value={s}>
            {STRENGTH_CN[s]}（{s}）
          </option>
        ))}
      </select>
    )
  }
  if (item.type === 'int' || item.type === 'float') {
    return (
      <input
        type="number"
        step={item.type === 'float' ? 0.01 : 1}
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        style={{ width: 110 }}
      />
    )
  }
  return <span className="hint">这个词表在这里不能直接改——请用「词表编辑」</span>
}
