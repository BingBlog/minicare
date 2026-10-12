import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { SignalConfigData, SignalDraftItem, SignalWordlists, SignalWordlistTryResult } from '../lib/types'
import { Card, CardBody, ErrorBox, Loading } from '../components/ui'

/**
 * 页面：词表维护（TECH-029 / PRD-014 US-05，2026-10-11 从配置清单页拆出为独立页）
 *
 * 5 类词表平铺编辑（高致敏分组 / 食物分类 / 可忽略前缀 / 可忽略后缀 / 别名映射）
 * + 识别试跑 + 「为什么改」+ 保存为待发布修改（对助手零影响）。
 */

const WL_KEYS = ['highRiskGroups', 'categoryRules', 'prefix', 'suffix', 'alias'] as const
const REASON_MIN = 10

interface DraftErrDetail {
  errors?: { key: string; error: string }[]
}

function errText(e: unknown): string {
  const detail = (e as { detail?: DraftErrDetail }).detail
  if (detail?.errors?.length) return detail.errors.map((x) => x.error).join('；')
  return (e as Error).message
}

/** 生效值视图（从配置清单同构数据取 5 类词表） */
function liveWordlists(cfg: SignalConfigData): SignalWordlists {
  const get = (k: string) => cfg.items.find((i) => i.key === k)?.current
  return {
    highRiskGroups: (get('highRiskGroups') as SignalWordlists['highRiskGroups']) || [],
    categoryRules: (get('categoryRules') as SignalWordlists['categoryRules']) || [],
    prefix: (get('prefix') as string[]) || [],
    suffix: (get('suffix') as string[]) || [],
    alias: (get('alias') as Record<string, string>) || {},
  }
}

/** 生效值 ⊕ 草稿 的词表视图（编辑初值；用草稿里的词表项覆盖） */
function mergeWordlists(live: SignalWordlists, draftItems: SignalDraftItem[]): SignalWordlists {
  const out: SignalWordlists = JSON.parse(JSON.stringify(live))
  for (const d of draftItems) {
    if ((WL_KEYS as readonly string[]).includes(d.key)) {
      ;(out as unknown as Record<string, unknown>)[d.key] = d.newValue
    }
  }
  return out
}

export function SignalsWordsPage() {
  const { toast, nonce } = useApp()
  const { data, error, loading } = useAsync(
    async () => ({ cfg: await api.signalConfig(), draft: await api.signalDraft() }),
    [nonce],
  )
  const [wl, setWl] = useState<SignalWordlists | null>(null)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 试跑器
  const [tryInput, setTryInput] = useState('')
  const [tryResult, setTryResult] = useState<SignalWordlistTryResult | null>(null)
  const [trying, setTrying] = useState(false)
  // 别名添加（受控）
  const [aliasKey, setAliasKey] = useState('')
  const [aliasVal, setAliasVal] = useState('')

  useEffect(() => {
    if (data) {
      const live = liveWordlists(data.cfg)
      setWl(mergeWordlists(live, data.draft.draft?.items || []))
    }
  }, [data])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data || !wl) return null

  const cfg = data.cfg

  /** 保存：与生效值逐键对比，差异键写成草稿项；改回生效值的键移除草稿 */
  async function save() {
    setBusy(true)
    setErr(null)
    try {
      const live = liveWordlists(cfg)
      const next = new Map((data?.draft.draft?.items || []).map((i) => [i.key, i] as const))
      for (const k of WL_KEYS) {
        if (JSON.stringify(wl?.[k]) !== JSON.stringify(live[k])) {
          next.set(k, { key: k, newValue: wl?.[k], reason })
        } else {
          next.delete(k)
        }
      }
      await api.signalDraftSave([...next.values()])
      toast('词表修改已保存（待发布）——不影响助手')
      setReason('')
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  async function runTry() {
    const foods = tryInput
      .split(/[、,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!foods.length) return
    setTrying(true)
    setTryResult(null)
    try {
      const r = await api.signalWordlistTry(foods, wl || undefined)
      setTryResult(r)
    } catch (e) {
      setTryResult({ ok: false, foods: [], configSource: '', error: (e as Error).message })
    } finally {
      setTrying(false)
    }
  }

  function patchGrouped(tab: 'highRiskGroups' | 'categoryRules', gi: number, mutate: (g: { keys: string[] }) => { keys: string[] }) {
    if (!wl) return
    const list = wl[tab].map((g, i) => (i === gi ? mutate({ ...g, keys: [...g.keys] }) : g))
    setWl({ ...wl, [tab]: list } as SignalWordlists)
  }

  return (
    <Card>
      <CardBody>
        <div className="hint">
          5 类词表决定食物名怎么被识别与归类：「高致敏分组」「食物分类」按关键词匹配；
          识别时先剥掉「可忽略前缀 / 后缀」，「别名映射」把旧叫法归一为常用名。
          改动先保存为待发布修改（对助手零影响），可用下方「识别试跑」即时验证效果。
        </div>
      </CardBody>

      <CardBody flush>
        {/* 1. 高致敏分组 */}
        <section className="sig-section-block">
          <div className="sig-section-head">
            <b>高致敏食物分组</b>{' '}
            <span className="hint">（{wl.highRiskGroups.length} 组）用于提示各类致敏食物"已引入 / 未引入"，不做劝阻</span>
          </div>
          <div className="sig-section-body">
            {wl.highRiskGroups.map((g, gi) => (
              <div key={g.group} className="sig-wl-group">
                <b>{g.group}</b>
                <div className="sig-chips">
                  {g.keys.map((kw, ki) => (
                    <span key={kw} className="sig-chip">
                      {kw}
                      <button
                        type="button"
                        className="sig-chip-x"
                        onClick={() =>
                          patchGrouped('highRiskGroups', gi, (grp) => {
                            grp.keys = grp.keys.filter((_, i) => i !== ki)
                            return grp
                          })
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    className="sig-chip-input"
                    placeholder="+ 关键词"
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      const kw = (e.target as HTMLInputElement).value.trim()
                      if (!kw) return
                      patchGrouped('highRiskGroups', gi, (grp) => {
                        grp.keys = [...grp.keys, kw]
                        return grp
                      })
                      ;(e.target as HTMLInputElement).value = ''
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 2. 食物分类 */}
        <section className="sig-section-block">
          <div className="sig-section-head">
            <b>食物分类</b>{' '}
            <span className="hint">（{wl.categoryRules.length} 类）每种食物归入第一个命中的类别，用于"日常种类/覆盖类别"统计</span>
          </div>
          <div className="sig-section-body">
            {wl.categoryRules.map((c, gi) => (
              <div key={c.category} className="sig-wl-group">
                <b>{c.category}</b>
                <div className="sig-chips">
                  {c.keys.map((kw, ki) => (
                    <span key={kw} className="sig-chip">
                      {kw}
                      <button
                        type="button"
                        className="sig-chip-x"
                        onClick={() =>
                          patchGrouped('categoryRules', gi, (grp) => {
                            grp.keys = grp.keys.filter((_, i) => i !== ki)
                            return grp
                          })
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    className="sig-chip-input"
                    placeholder="+ 关键词"
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      const kw = (e.target as HTMLInputElement).value.trim()
                      if (!kw) return
                      patchGrouped('categoryRules', gi, (grp) => {
                        grp.keys = [...grp.keys, kw]
                        return grp
                      })
                      ;(e.target as HTMLInputElement).value = ''
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. 可忽略前缀 */}
        <section className="sig-section-block">
          <div className="sig-section-head">
            <b>可忽略前缀</b> <span className="hint">识别食物名时会被剥掉（如「纯米粉」→「米粉」）</span>
          </div>
          <div className="sig-section-body">
            <div className="sig-chips">
              {wl.prefix.map((kw, ki) => (
                <span key={kw} className="sig-chip">
                  {kw}
                  <button
                    type="button"
                    className="sig-chip-x"
                    onClick={() => setWl({ ...wl, prefix: wl.prefix.filter((_, i) => i !== ki) })}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                className="sig-chip-input"
                placeholder="+ 词条"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  const kw = (e.target as HTMLInputElement).value.trim()
                  if (!kw) return
                  setWl({ ...wl, prefix: [...wl.prefix, kw] })
                  ;(e.target as HTMLInputElement).value = ''
                }}
              />
            </div>
          </div>
        </section>

        {/* 4. 可忽略后缀 */}
        <section className="sig-section-block">
          <div className="sig-section-head">
            <b>可忽略后缀</b> <span className="hint">识别食物名时会被剥掉（如「西兰花泥」→「西兰花」）</span>
          </div>
          <div className="sig-section-body">
            <div className="sig-chips">
              {wl.suffix.map((kw, ki) => (
                <span key={kw} className="sig-chip">
                  {kw}
                  <button
                    type="button"
                    className="sig-chip-x"
                    onClick={() => setWl({ ...wl, suffix: wl.suffix.filter((_, i) => i !== ki) })}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                className="sig-chip-input"
                placeholder="+ 词条"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  const kw = (e.target as HTMLInputElement).value.trim()
                  if (!kw) return
                  setWl({ ...wl, suffix: [...wl.suffix, kw] })
                  ;(e.target as HTMLInputElement).value = ''
                }}
              />
            </div>
          </div>
        </section>

        {/* 5. 别名映射 */}
        <section className="sig-section-block">
          <div className="sig-section-head">
            <b>别名映射</b> <span className="hint">把不同的叫法归一为常用名（当前 {Object.keys(wl.alias).length} 条）</span>
          </div>
          <div className="sig-section-body">
            {Object.entries(wl.alias).map(([k, v]) => (
              <div key={k} className="sig-edit-row">
                <b>{k}</b> <span className="hint">→</span> {v}{' '}
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const next = { ...wl.alias }
                    delete next[k]
                    setWl({ ...wl, alias: next })
                  }}
                >
                  删除
                </button>
              </div>
            ))}
            <div className="sig-edit-row">
              <input
                value={aliasKey}
                onChange={(e) => setAliasKey(e.target.value)}
                placeholder="改成别的叫法（如：强化铁米）"
              />
              <span className="hint">→</span>
              <input
                value={aliasVal}
                onChange={(e) => setAliasVal(e.target.value)}
                placeholder="归一为（如：高铁米粉）"
              />
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const k = aliasKey.trim()
                  const v = aliasVal.trim()
                  if (!k || !v) return
                  setWl({ ...wl, alias: { ...wl.alias, [k]: v } })
                  setAliasKey('')
                  setAliasVal('')
                }}
              >
                添加
              </button>
            </div>
          </div>
        </section>
      </CardBody>

      <CardBody>
        <div className="sig-section">
          <div className="sig-label">识别试跑 —— 输入食物名，看系统会怎么识别它（用你正在编辑的词表，未保存也生效）</div>
          <div className="sig-run">
            <input
              value={tryInput}
              onChange={(e) => setTryInput(e.target.value)}
              placeholder="食物名，可用「、」分隔（如 土豆、豆浆）"
              style={{ flex: 1, minWidth: 220 }}
            />
            <button type="button" className="btn btn-primary" onClick={runTry} disabled={trying}>
              {trying ? '识别中…' : '看识别结果'}
            </button>
          </div>
          {tryResult ? (
            tryResult.ok ? (
              <div style={{ marginTop: 6 }}>
                {tryResult.foods.map((f) => (
                  <div key={f.input} className="hint" style={{ marginTop: 3 }}>
                    <b>{f.input}</b> → 归一化 {f.normalized.join('、')} ｜ 归类 {f.categories.join('/')} ｜{' '}
                    {f.highRisk.length
                      ? `高致敏：${f.highRisk.map((h) => `${h.group}（命中 ${h.matched.map((m) => m.by).join('/')}）`).join('；')}`
                      : '高致敏：未命中'}
                  </div>
                ))}
              </div>
            ) : (
              <div className="sig-err">{tryResult.error}</div>
            )
          ) : null}
        </div>

        <div className="sig-section" style={{ borderBottom: 'none' }}>
          <div className="sig-label">为什么改 *（本次词表编辑的理由）</div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={`至少 ${REASON_MIN} 字，会进审计日志`}
            style={{ width: '100%' }}
          />
          {err ? <div className="sig-err">{err}</div> : null}
          <div className="sig-edit-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? '保存中…' : '保存修改（待发布）'}
            </button>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
