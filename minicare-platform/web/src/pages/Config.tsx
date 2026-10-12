/**
 * 页面：全局配置（原「生效阈值」，2026-10-09 用户升级；2026-10-11 升为平台级 + 按域分类）
 *
 * 三件事：
 *   ① **查看明细** —— 全平台生效配置一页看全：
 *      · 管线条数（pipeline.yaml 13 组 × 60+ 项）：中文名 / 生效值 / 代码默认值 / 来源 / 说明；
 *      · 密钥与环境变量（.env）：已配置状态、掩码值、生效来源（`environment` 覆盖时明示）。
 *   ② **在线修改** —— 按类型渲染控件（开关 / 数字 / 文本 / 每行一项 / JSON 文本），
 *      改动先本地暂存（「待保存」徽标 + 导航角标），点「保存修改」批量提交。
 *   ③ **安全写回** —— 后端先全量校验、再备份、后写回原文件并**热重载**（无需重启服务）；
 *      保存前弹确认框列出每项 from → to；带警示的字段（如 platform.version 会让缓存整体失效）
 *      在确认框里单列醒目提示。
 *
 * 2026-10-11（用户要求「按 知识库 / Agent 测评 / 观测 等分类展示」）：
 *   · 页面**不再挂在知识库域**——已升为平台级页面，入口在顶栏右侧（见 `nav.ts` / `Topnav`）；
 *   · 左导航按**平台域**分列（知识库 / Agent 测评 / 观测 / 平台，顺序与域口径同 `nav.ts`）：
 *     每个域下 = 它的管线条数分组 + 它的「密钥与环境变量」（`.env` 项按 `domain` 归属拆分，
 *     观测的 9 项由此从知识库凭证里分出去）；分类归属由后端下发（`config_center.py`），
 *     前端只做分列与中文名映射，缺省落「知识库」；
 *   · 「原始文件」仍为页尾的独立视图（pipeline.yaml 整体，不属于任何单个域）。
 *
 * 交互约定：
 *   · 「撤销」= 放弃该字段的未保存草稿；「恢复默认」= 把草稿设为代码默认值（仍需保存才写回）；
 *   · 只读字段（如 metadata.doc_mapping）展示值但不可编辑（业务数据，将迁入台账）；
 *   · 「重新读取」= 丢掉草稿并重读磁盘（文件被手工改过时用）；有草稿时先确认。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { DOMAINS } from '../nav'
import { Modal } from '../components/Modal'
import { Card, CardBody, CardHead, Empty, ErrorBox, Loading, Notice, Pill } from '../components/ui'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import type {
  ConfigDetail,
  ConfigEnvItem,
  ConfigField,
  ConfigGroupDetail,
  ConfigRaw,
} from '../lib/types'

const INPUT: CSSProperties = {
  padding: '6px 8px',
  border: '1px solid var(--line)',
  borderRadius: 6,
  fontSize: 13,
  background: 'var(--surface)',
  color: 'var(--text)',
  boxSizing: 'border-box',
}

/** 左导航特殊项 id：各域「密钥与环境变量」视图 = `__env__:<scope>`；原始文件 = `__raw__` */
const ENV_PREFIX = '__env__:'
const RAW_ID = '__raw__'
const envIdOf = (scope: string) => `${ENV_PREFIX}${scope}`

/* ── 平台域分类（左导航的一级列）─────────────────────────────────────────
   中文名与顺序取 `nav.ts` 的 `DOMAINS`（与顶栏域页签同口径），platform 殿后补位；
   每个域一列 = 它的分组 + 它的 `.env` 项（空列不渲染 —— 如信号管理暂无配置项）。 */

const SCOPE_LABEL: Record<string, string> = {
  ...Object.fromEntries(DOMAINS.map((dd) => [dd.id, dd.label])),
  platform: '平台',
}
const SCOPE_ORDER: string[] = [...DOMAINS.map((dd) => dd.id), 'platform']

interface ScopeColumn {
  id: string
  label: string
  groups: ConfigGroupDetail[]
  envItems: ConfigEnvItem[]
}

/** 把分组合 `.env` 项按域拆列（后端下发顺序即组内顺序；未知域兜底排最后） */
function scopeColumns(d: ConfigDetail): ScopeColumn[] {
  const cols = new Map<string, ScopeColumn>()
  const ensure = (id: string): ScopeColumn => {
    let c = cols.get(id)
    if (!c) {
      c = { id, label: SCOPE_LABEL[id] ?? id, groups: [], envItems: [] }
      cols.set(id, c)
    }
    return c
  }
  for (const g of d.groups) ensure(g.domain ?? 'kb').groups.push(g)
  for (const it of d.env.items) ensure(it.domain ?? 'kb').envItems.push(it)
  const rank = (id: string) => {
    const i = SCOPE_ORDER.indexOf(id)
    return i === -1 ? SCOPE_ORDER.length : i
  }
  return [...cols.values()].sort((a, b) => rank(a.id) - rank(b.id))
}

const dkey = (groupId: string, key: string) => `${groupId}.${key}`

/* ── 值的序列化 / 解析（编辑控件统一以字符串承载草稿）──────────────── */

function serialize(f: ConfigField): string {
  if (f.kind === 'scalar' && f.type === 'bool') return f.value ? 'true' : 'false'
  if (f.kind === 'list') return ((f.value as unknown[]) ?? []).map((x) => String(x)).join('\n')
  if (f.kind === 'dict') return JSON.stringify(f.value ?? {}, null, 2)
  return f.value == null ? '' : String(f.value)
}

/** 草稿 → 提交值；格式非法时抛 Error（live 校验与保存共用） */
function parseDraft(f: ConfigField, raw: string): unknown {
  if (f.kind === 'scalar') {
    if (f.type === 'bool') return raw === 'true'
    if (f.type === 'int') return Number(raw.trim())
    if (f.type === 'float') return Number(raw.trim())
    return raw
  }
  if (f.kind === 'list') return raw.split('\n').map((s) => s.trim()).filter(Boolean)
  if (f.kind === 'dict') return JSON.parse(raw)
  return raw
}

/** 草稿的即时校验（返回错误文案；null = 通过） */
function parseError(f: ConfigField, raw: string): string | null {
  if (f.kind === 'scalar') {
    if (f.type === 'int') return /^-?\d+$/.test(raw.trim()) ? null : '需要整数'
    if (f.type === 'float') {
      return raw.trim() !== '' && Number.isFinite(Number(raw.trim())) ? null : '需要数字'
    }
    if (f.type === 'path') return raw.trim() === '' ? '路径不能为空' : null
    return null
  }
  if (f.kind === 'dict') {
    try {
      JSON.parse(raw)
      return null
    } catch {
      return 'JSON 解析失败'
    }
  }
  return null
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) return v.length ? v.map(String).join('、') : '（空列表）'
  if (typeof v === 'object') return `{ ${Object.keys(v as object).length} 项 }`
  return String(v)
}

/* ── 确认框模型 ───────────────────────────────────────────────────── */

interface SaveChange {
  scope: 'yaml' | 'env'
  label: string
  from: string
  to: string
}

type ModalState =
  | {
      kind: 'save'
      items: SaveChange[]
      warns: string[]
      yaml: { group: string; key: string; value: unknown }[]
      env: { key: string; value: string }[]
    }
  | { kind: 'reload' }

/* ── 页面 ─────────────────────────────────────────────────────────── */

export function ConfigPage() {
  const { nonce, toast } = useApp()
  const [data, setData] = useState<ConfigDetail | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<string>('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  /** 环境变量草稿：key 存在 = 该行处于编辑态（值即待写的新值） */
  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [onlyMod, setOnlyMod] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [raw, setRaw] = useState<ConfigRaw | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await api.configDetail()
      setData(d)
      setError(null)
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, nonce])

  /** 原始文件按需加载（切到该视图时才拉；保存后失效重拉） */
  useEffect(() => {
    if (active !== RAW_ID || raw) return
    api
      .configRaw('pipeline')
      .then(setRaw)
      .catch((e) => toast(`原始文件读取失败：${(e as Error).message}`))
  }, [active, raw, toast])

  const dirtyOf = useCallback(
    (groupId: string, f: ConfigField): boolean => {
      const d = drafts[dkey(groupId, f.key)]
      return d !== undefined && d !== serialize(f)
    },
    [drafts],
  )

  const groupDirty = useCallback(
    (g: ConfigGroupDetail): number => g.fields.filter((f) => dirtyOf(g.id, f)).length,
    [dirtyOf],
  )

  /** 全部待保存项（yaml 草稿 + env 编辑态） */
  const pending = useMemo(() => {
    if (!data) return { yaml: 0, env: 0, total: 0 }
    let y = 0
    for (const g of data.groups) y += groupDirty(g)
    const e = Object.keys(envDrafts).length
    return { yaml: y, env: e, total: y + e }
  }, [data, groupDirty, envDrafts])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  const d = data
  const query = q.trim().toLowerCase()
  const searching = query.length > 0
  const cols = scopeColumns(d)
  /** 当前导航项 id：未显式选择时落第一组（首屏即有内容 + 有高亮；原始文件/环境变量需显式点击） */
  const activeId = active || (d.groups[0]?.id ?? '')
  const activeGroup = d.groups.find((g) => g.id === activeId) ?? d.groups[0]
  /** 各域「密钥与环境变量」视图的当前域（非该视图时为空串） */
  const envScope = activeId.startsWith(ENV_PREFIX) ? activeId.slice(ENV_PREFIX.length) : ''
  const envScopeItems = envScope ? d.env.items.filter((it) => (it.domain ?? 'kb') === envScope) : []

  const matchField = (g: ConfigGroupDetail, f: ConfigField) =>
    `${g.label} ${g.id} ${f.label} ${f.key} ${f.desc} ${f.warn ?? ''}`.toLowerCase().includes(query)

  const searchHits: { group: ConfigGroupDetail; field: ConfigField }[] = []
  if (searching) {
    for (const g of d.groups) {
      for (const f of g.fields) if (matchField(g, f)) searchHits.push({ group: g, field: f })
    }
  }
  const envHits = searching
    ? d.env.items.filter((it) =>
        `${it.label} ${it.key} ${it.desc} ${it.warn ?? ''}`.toLowerCase().includes(query),
      )
    : []

  const setDraft = (groupId: string, f: ConfigField, v: string | undefined) =>
    setDrafts((m) => {
      const next = { ...m }
      const k = dkey(groupId, f.key)
      if (v === undefined) delete next[k]
      else next[k] = v
      return next
    })

  /* ── 保存流程 ── */

  const onSaveClick = () => {
    const items: SaveChange[] = []
    const warns: string[] = []
    const yaml: { group: string; key: string; value: unknown }[] = []
    const errs: string[] = []

    for (const g of d.groups) {
      for (const f of g.fields) {
        if (!dirtyOf(g.id, f)) continue
        const draftRaw = drafts[dkey(g.id, f.key)]
        const err = parseError(f, draftRaw)
        if (err) {
          errs.push(`${f.label}：${err}`)
          continue
        }
        const val = parseDraft(f, draftRaw)
        yaml.push({ group: g.id, key: f.key, value: val })
        items.push({ scope: 'yaml', label: `${g.label} · ${f.label}`, from: fmtVal(f.value), to: fmtVal(val) })
        if (f.warn) warns.push(`${f.label}：${f.warn}`)
      }
    }

    const env: { key: string; value: string }[] = []
    for (const it of d.env.items) {
      if (!(it.key in envDrafts)) continue
      const v = envDrafts[it.key] ?? ''
      env.push({ key: it.key, value: v })
      items.push({
        scope: 'env',
        label: `${it.label}（${it.key}）`,
        from: envFrom(it),
        to: it.secret ? (v ? `新值（${v.length} 字符）` : '（清空）') : v || '（清空）',
      })
      if (it.warn) warns.push(`${it.label}：${it.warn}`)
    }

    if (errs.length) {
      toast(`有 ${errs.length} 项格式有误，不能保存：${errs.join('；')}`, 8000)
      return
    }
    if (!items.length) {
      toast('没有需要保存的修改')
      return
    }
    setModal({ kind: 'save', items, warns, yaml, env })
  }

  const applySave = async (m: Extract<ModalState, { kind: 'save' }>) => {
    setSaving(true)
    try {
      const res = await api.configSave({ yaml: m.yaml, env: m.env })
      setData(res.detail)
      setDrafts({})
      setEnvDrafts({})
      setRaw(null)
      setModal(null)
      const parts: string[] = []
      if (res.applied.yaml.length) parts.push(`管线条数 ${res.applied.yaml.length} 项`)
      if (res.applied.env.length) parts.push(`环境变量 ${res.applied.env.length} 项`)
      toast(`已保存并热重载：${parts.join('、')}${res.backups.length ? '（已备份原文件）' : ''}`)
    } catch (e) {
      setModal(null)
      toast(`保存失败：${(e as Error).message}`, 9000)
    } finally {
      setSaving(false)
    }
  }

  const doReload = async () => {
    try {
      const fresh = await api.configReload()
      setData(fresh)
      setDrafts({})
      setEnvDrafts({})
      setRaw(null)
      setModal(null)
      toast('已重新读取磁盘配置（未保存的修改已丢弃）')
    } catch (e) {
      toast(`读取失败：${(e as Error).message}`)
    }
  }

  const onReloadClick = () => {
    if (pending.total > 0) setModal({ kind: 'reload' })
    else void doReload()
  }

  /* ── 渲染 ── */

  const renderFieldRow = (g: ConfigGroupDetail, f: ConfigField, showGroup = false) => (
    <FieldRow
      key={dkey(g.id, f.key) + (showGroup ? '@s' : '')}
      group={g}
      field={f}
      showGroup={showGroup}
      draft={drafts[dkey(g.id, f.key)]}
      dirty={dirtyOf(g.id, f)}
      onDraft={(v) => setDraft(g.id, f, v)}
      onRestoreDefault={() => setDraft(g.id, f, serialize({ ...f, value: f.default }))}
    />
  )

  const renderEnvRow = (it: ConfigEnvItem) => (
    <EnvRow
      key={it.key}
      item={it}
      draft={envDrafts[it.key]}
      editing={it.key in envDrafts}
      onOpen={() => setEnvDrafts((m) => ({ ...m, [it.key]: m[it.key] ?? '' }))}
      onChange={(v) => setEnvDrafts((m) => ({ ...m, [it.key]: v }))}
      onCancel={() =>
        setEnvDrafts((m) => {
          const next = { ...m }
          delete next[it.key]
          return next
        })
      }
    />
  )

  return (
    <>
      <Notice tone={d.yaml_loaded ? 'ok' : 'warn'}>
        <b>管线条数：</b>
        <code>{d.config_file}</code> · <b>密钥与环境变量：</b>
        <code>{d.env_file}</code>
        <br />
        {d.yaml_loaded
          ? '配置文件已生效。'
          : '⚠️ 未检测到有效的 pipeline.yaml，当前全部使用代码默认值（保存任一项会写入该文件）。'}
        保存 = 全量校验 → 备份（data/config_backups/）→ 写回原文件 → 热重载，无需重启服务。
      </Notice>

      <div className="cfg-top">
        <input
          className="cfg-search"
          placeholder="搜索配置项：名称 / key / 说明…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="cfg-check">
          <input type="checkbox" checked={onlyMod} onChange={(e) => setOnlyMod(e.target.checked)} /> 仅看已改动
        </label>
        <span className="hint">
          {d.stats.fields} 项阈值（{d.stats.from_yaml} 项来自 yaml）· 密钥与环境变量 {d.env.configured}/
          {d.env.total} 已配置
        </span>
        <span className="cfg-spacer" />
        {pending.total > 0 ? <Pill kind="warn">{pending.total} 处待保存</Pill> : null}
        <button className="btn" onClick={onReloadClick} disabled={saving}>
          重新读取
        </button>
        <button className="btn btn-primary" onClick={onSaveClick} disabled={saving || pending.total === 0}>
          {saving ? '保存中…' : '保存修改'}
        </button>
      </div>

      <div className="cfg-wrap">
        <nav className="cfg-nav">
          {cols.map((c) => {
            const envDirty = c.envItems.filter((it) => it.key in envDrafts).length
            return (
              <div className="cfg-catnode" key={c.id}>
                <div className="cfg-cat">{c.label}</div>
                {c.groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`cfg-tab${!searching && activeId === g.id ? ' on' : ''}`}
                    onClick={() => {
                      setQ('')
                      setActive(g.id)
                    }}
                  >
                    <span className="t">{g.label}</span>
                    <span className="n">{groupDirty(g) > 0 ? <em>{groupDirty(g)}</em> : g.fields.length}</span>
                  </button>
                ))}
                {c.envItems.length > 0 ? (
                  <button
                    type="button"
                    className={`cfg-tab${!searching && activeId === envIdOf(c.id) ? ' on' : ''}`}
                    onClick={() => {
                      setQ('')
                      setActive(envIdOf(c.id))
                    }}
                  >
                    <span className="t">密钥与环境变量</span>
                    <span className="n">{envDirty > 0 ? <em>{envDirty}</em> : c.envItems.length}</span>
                  </button>
                ) : null}
              </div>
            )
          })}
          <div className="cfg-sep" />
          <button
            type="button"
            className={`cfg-tab${!searching && activeId === RAW_ID ? ' on' : ''}`}
            onClick={() => {
              setQ('')
              setActive(RAW_ID)
            }}
          >
            <span className="t">原始文件</span>
          </button>
        </nav>

        <div className="cfg-main">
          {searching ? (
            <Card>
              <CardHead
                title={`搜索结果：${searchHits.length + envHits.length} 项`}
                meta={<span className="hint">跨全部配置分组与 .env</span>}
              />
              <CardBody flush>
                {searchHits.length + envHits.length === 0 ? (
                  <Empty title="没有匹配的配置项">换个关键词试试（支持中文名 / 原始 key / 说明文本）</Empty>
                ) : (
                  <>
                    {searchHits.map(({ group, field }) => renderFieldRow(group, field, true))}
                    {envHits.length > 0 && <div className="cfg-subhead">密钥与环境变量</div>}
                    {envHits.map((it) => renderEnvRow(it))}
                  </>
                )}
              </CardBody>
            </Card>
          ) : envScope ? (
            <Card>
              <CardHead
                title="密钥与环境变量"
                meta={
                  <span className="hint">
                    {SCOPE_LABEL[envScope] ?? envScope} · {envScopeItems.filter((it) => it.configured).length}/
                    {envScopeItems.length} 已配置 · 写入 <code>{d.env.path}</code>
                  </span>
                }
              />
              <CardBody flush>
                <div className="cfg-note">
                  密钥仅显示掩码，不提供明文查看；点「修改」填写新值，随底部「保存修改」一起写入 .env。
                  留空 = 清空该键（环境变量优先于 .env：标记「系统环境变量」的键，写 .env 不会覆盖当前进程的值）。
                </div>
                {envScopeItems.map((it) => renderEnvRow(it))}
              </CardBody>
            </Card>
          ) : activeId === RAW_ID ? (
            <Card>
              <CardHead
                title="原始文件（只读）"
                meta={
                  raw ? (
                    <span className="hint">
                      <code>{raw.path}</code> · {raw.lines} 行
                    </span>
                  ) : null
                }
              />
              <CardBody>
                <div className="toolbar" style={{ marginBottom: 10 }}>
                  <button className="btn" onClick={() => setRaw(null)}>
                    刷新
                  </button>
                  <span className="hint">写入前会先备份；此视图帮助核对「保存后文件到底变成了什么样」</span>
                </div>
                {raw ? <pre className="cfg-raw mono">{raw.text}</pre> : <Loading />}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHead
                title={activeGroup.label}
                meta={
                  <span className="hint">
                    来源：{activeGroup.fields.filter((f) => f.in_yaml).length}/{activeGroup.fields.length} 项写入
                    yaml
                    {groupDirty(activeGroup) > 0 ? ` · ${groupDirty(activeGroup)} 处待保存` : ''}
                  </span>
                }
              />
              <CardBody flush>
                {activeGroup.note ? <div className="cfg-note">{activeGroup.note}</div> : null}
                {(() => {
                  const rows = activeGroup.fields.filter((f) => !onlyMod || f.customized || dirtyOf(activeGroup.id, f))
                  if (!rows.length) {
                    return <Empty title={onlyMod ? '本组没有已改动的项' : '本组没有配置项'} />
                  }
                  return rows.map((f) => renderFieldRow(activeGroup, f))
                })()}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {modal?.kind === 'save' ? (
        <Modal
          title="确认写入配置"
          subtitle="先备份 → 写回 pipeline.yaml / .env → 热重载生效"
          onClose={() => (saving ? undefined : setModal(null))}
          width={780}
        >
          <div className="cfg-changes">
            <div className="hint" style={{ marginBottom: 8 }}>
              本次将写入 <b>{modal.items.length}</b> 项：
            </div>
            {modal.items.map((c, i) => (
              <div key={i} className="cfg-change">
                <span className={`cfg-chip ${c.scope}`}>{c.scope === 'yaml' ? '阈值' : '密钥'}</span>
                <span className="lbl">{c.label}</span>
                <span className="from mono" title={c.from}>
                  {c.from}
                </span>
                <span className="arrow">→</span>
                <span className="to mono" title={c.to}>
                  {c.to}
                </span>
              </div>
            ))}
            {modal.warns.length > 0 ? (
              <div className="cfg-warnbox">
                <b>⚠️ 以下改动影响较大，请确认：</b>
                {modal.warns.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="toolbar" style={{ margin: '14px 0 0' }}>
            <button className="btn btn-primary" onClick={() => void applySave(modal)} disabled={saving}>
              {saving ? '写入中…' : '确认保存'}
            </button>
            <button className="btn" onClick={() => setModal(null)} disabled={saving}>
              取消
            </button>
          </div>
        </Modal>
      ) : null}

      {modal?.kind === 'reload' ? (
        <Modal title="重新读取磁盘配置？" onClose={() => setModal(null)} width={520}>
          <p style={{ marginTop: 0 }}>
            将从 <code>pipeline.yaml</code> / <code>.env</code> 重新读取并热重载。
            <b>当前 {pending.total} 处未保存的修改会被丢弃</b>（文件被手工改过时才需要这样做）。
          </p>
          <div className="toolbar" style={{ margin: '14px 0 0' }}>
            <button className="btn btn-primary" onClick={() => void doReload()}>
              确认重新读取
            </button>
            <button className="btn" onClick={() => setModal(null)}>
              取消
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  )
}

/* ── 环境变量行的展示辅助 ─────────────────────────────────────────── */

function envFrom(it: ConfigEnvItem): string {
  if (it.secret) return it.configured ? it.masked || '已配置' : '（未配置）'
  return it.value ? it.value : '（空）'
}

/* ── 单行：管线条数（阈值）字段 ───────────────────────────────────── */

function FieldRow({
  group,
  field,
  draft,
  dirty,
  showGroup,
  onDraft,
  onRestoreDefault,
}: {
  group: ConfigGroupDetail
  field: ConfigField
  draft: string | undefined
  dirty: boolean
  showGroup?: boolean
  onDraft: (v: string | undefined) => void
  onRestoreDefault: () => void
}) {
  const cur = draft !== undefined ? draft : serialize(field)
  const liveErr = draft !== undefined ? parseError(field, draft) : null

  return (
    <div className={`cfg-field${dirty ? ' dirty' : ''}`}>
      <div className="cfg-fhead">
        <b className="cfg-label">{field.label}</b>
        <code className="cfg-key">{field.key}</code>
        {showGroup ? <span className="cfg-groupchip">{group.label}</span> : null}
        <Pill kind={field.source === 'yaml' ? 'accent' : 'plain'}>
          {field.source === 'yaml' ? 'yaml' : '代码默认'}
        </Pill>
        {field.customized ? <Pill kind="ok">已定制</Pill> : null}
        {!field.editable ? <Pill kind="plain">只读</Pill> : null}
        {dirty ? <Pill kind="warn">待保存</Pill> : null}
        <span className="cfg-spacer" />
        {dirty && field.editable ? (
          <button className="btn btn-mini" onClick={() => onDraft(undefined)}>
            撤销
          </button>
        ) : null}
        {!dirty && field.editable && field.customized ? (
          <button
            className="btn btn-mini"
            title="把编辑框设为代码默认值（仍需点「保存修改」才写回文件）"
            onClick={onRestoreDefault}
          >
            恢复默认
          </button>
        ) : null}
      </div>

      <div className="cfg-fbody">
        <div className="cfg-ctl">
          {field.editable ? (
            <FieldControl field={field} value={cur} invalid={!!liveErr} onChange={onDraft} />
          ) : (
            <pre className="cfg-ro mono">{JSON.stringify(field.value, null, 2)}</pre>
          )}
        </div>
        <div className="cfg-side">
          <span className="hint">默认：{fmtVal(field.default)}</span>
          {field.editable ? null : <span className="hint"> · 由平台维护，不支持在线修改</span>}
        </div>
      </div>

      {field.desc ? <div className="cfg-desc">{field.desc}</div> : null}
      {field.warn ? <div className="cfg-warn">⚠️ {field.warn}</div> : null}
      {liveErr ? <div className="cfg-err">{liveErr}</div> : null}
    </div>
  )
}

/* ── 编辑控件（按 kind / type 分派）────────────────────────────────── */

function FieldControl({
  field,
  value,
  invalid,
  onChange,
}: {
  field: ConfigField
  value: string
  invalid: boolean
  onChange: (v: string) => void
}) {
  const style: CSSProperties = invalid ? { ...INPUT, borderColor: 'var(--danger)' } : INPUT

  if (field.kind === 'scalar' && field.type === 'bool') {
    return (
      <label className="cfg-bool">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
        />
        <span className="mono">{value === 'true' ? 'true' : 'false'}</span>
      </label>
    )
  }
  if (field.kind === 'scalar' && (field.type === 'int' || field.type === 'float')) {
    return (
      <input
        style={{ ...style, width: 160 }}
        type="number"
        step={field.type === 'int' ? 1 : 0.01}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  if (field.kind === 'scalar') {
    return (
      <input
        style={{ ...style, width: field.type === 'path' ? 420 : 340 }}
        className="mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  if (field.kind === 'list') {
    return (
      <textarea
        style={{ ...style, width: 420, lineHeight: 1.5 }}
        rows={Math.min(9, Math.max(3, value.split('\n').length))}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="每行一项"
      />
    )
  }
  // dict：JSON 文本
  return (
    <textarea
      style={{ ...style, width: 520, lineHeight: 1.5 }}
      className="mono"
      rows={Math.min(16, Math.max(6, value.split('\n').length))}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/* ── 单行：环境变量（.env）────────────────────────────────────────── */

function EnvRow({
  item,
  draft,
  editing,
  onOpen,
  onChange,
  onCancel,
}: {
  item: ConfigEnvItem
  draft: string | undefined
  editing: boolean
  onOpen: () => void
  onChange: (v: string) => void
  onCancel: () => void
}) {
  const srcLabel =
    item.source === 'environment' ? '系统环境变量' : item.source === 'env-file' ? '.env' : '未设置'
  return (
    <div className={`cfg-field${editing ? ' dirty' : ''}`}>
      <div className="cfg-fhead">
        <b className="cfg-label">{item.label}</b>
        <code className="cfg-key">{item.key}</code>
        {item.configured ? <Pill kind="ok">已配置</Pill> : <Pill kind="plain">未配置</Pill>}
        {item.source === 'environment' ? <Pill kind="warn">系统环境变量</Pill> : null}
        {item.overridden ? <Pill kind="accent">已定制</Pill> : null}
        {editing ? <Pill kind="warn">待保存</Pill> : null}
        <span className="cfg-spacer" />
        {editing ? (
          <button className="btn btn-mini" onClick={onCancel}>
            取消
          </button>
        ) : (
          <button className="btn btn-mini" onClick={onOpen}>
            修改
          </button>
        )}
      </div>
      <div className="cfg-fbody">
        <div className="cfg-ctl">
          {editing ? (
            <input
              style={{ ...INPUT, width: 420 }}
              className="mono"
              type={item.secret ? 'password' : 'text'}
              value={draft ?? ''}
              placeholder="新值（留空 = 清空该键）"
              autoFocus
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <code className="cfg-val mono">{item.secret ? item.masked || '（未配置）' : item.value || '（空）'}</code>
          )}
        </div>
        <div className="cfg-side">
          <span className="hint">
            来源：{srcLabel}
            {item.default && item.overridden ? ` · 内置默认：${item.default}` : ''}
          </span>
        </div>
      </div>
      {item.desc ? <div className="cfg-desc">{item.desc}</div> : null}
      {item.warn ? <div className="cfg-warn">⚠️ {item.warn}</div> : null}
      {item.source === 'environment' ? (
        <div className="cfg-desc">当前进程的值来自系统环境变量（优先级高于 .env）——写 .env 后需在无该环境变量的进程里才会生效。</div>
      ) : null}
    </div>
  )
}
