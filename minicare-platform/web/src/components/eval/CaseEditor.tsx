import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Modal } from '../Modal'
import { expectToLines } from './expectView'
import { agentEvalApi, EVAL_GROUPS, type EvalCase } from '../../lib/agentEval'

/**
 * 用例编辑器（TECH-022 B5）：表单 / JSON 双模。
 *
 * 设计要点：
 *   · **同一份数据**（ctx / expect / judge 三个 JSON 对象）驱动两种模式——表单编辑直接改对象，
 *     JSON 模式解析成功即回写到对象，切换模式无损；解析失败阻止切换并就地报错。
 *   · ⚠️ 表单子模型（expectForm / judgeForm）是**组件本地 state**（2026-10-09 修）：
 *     不能由 data 反推——buildExpect 会丢弃"半填行"，反推会让半填写内容每击键被清掉，
 *     表现为输入框"打不了字"。本地 state 是编辑期唯一事实源，变更时再物化进 data。
 *   · 表单覆盖 harness assert.mjs 的全部常用断言；**无法结构化表达的复杂条件以"原样保留"兜底**，
 *     保存时绝不丢字段（未知键、复杂 input 等原样透传）。
 *   · 顶部提供实时「断言预览」（与运行详情同一套渲染，改完即所见）。
 *   · ctx 中的**用户信息（userId / familyId / babyId）是全局设置的**（pipeline.yaml → eval.ctx）：
 *     表单不提供编辑、展示全局值；保存时自动从用例中移除这三个键（运行时由平台注入并覆盖）。
 */

const INPUT: CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6,
  fontSize: 13, background: 'var(--surface)', color: 'var(--text)', width: '100%',
  boxSizing: 'border-box',
}

type Json = Record<string, unknown>

interface EditorData {
  case_id: string
  grp: string
  priority: string
  desc: string
  message: string
  tags: string
  enabled: boolean
  ctx: Json
  expect: Json
  judge: Json | null
}

/* ── 文本 → 值（保留 "3" → 3、JSON 字面量等语义）───────────────────── */

function textToValue(t: string): unknown {
  const s = t.trim()
  if (s === '') return ''
  if (s === 'true') return true
  if (s === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      return JSON.parse(s)
    } catch {
      return t
    }
  }
  return t
}

function tagsToList(s: string): string[] {
  return s.split(/[,，]/).map((x) => x.trim()).filter(Boolean)
}

/** ctx 中的「用户信息」键（与后端 `agent_eval/catalog.py` 的 USER_CTX_KEYS 一致）：
 *  由全局配置（pipeline.yaml → eval.ctx）提供 —— 保存时从用例中移除，运行时由平台注入覆盖。 */
const USER_CTX_KEYS = ['userId', 'familyId', 'babyId']

function stripUserCtxKeys(ctx: unknown): Json {
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return {}
  const out: Json = {}
  for (const [k, v] of Object.entries(ctx as Json)) {
    if (!USER_CTX_KEYS.includes(k)) out[k] = v
  }
  return out
}

/* ── expect 表单模型 ─────────────────────────────────────────────── */

const EXPECT_MANAGED = new Set([
  'noToolCalls', 'minToolCalls', 'maxToolCalls', 'toolCalls',
  'textContains', 'textNotContains', 'done', 'answerNotEmpty', 'errorFree',
])

interface ToolRow {
  name: string
  gte: string
  lte: string
  paramKey: string
  paramMode: 'contains' | 'eq'
  paramVal: string
  /** 复杂 input（多键 / 深层规则）：原样保留，仅 JSON 模式可编辑 */
  inputRaw?: string
}

interface ExpectForm {
  noToolCalls: boolean
  min: string
  max: string
  tools: ToolRow[]
  textContains: string
  textNotContains: string
  done: boolean
  answerNotEmpty: boolean
  errorFree: boolean
  extras: Json
}

function isRuleObj(v: unknown): v is Json {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
    && ('contains' in (v as object) || 'eq' in (v as object))
}

function parseExpectForm(expect: Json): ExpectForm {
  const extras: Json = {}
  for (const [k, v] of Object.entries(expect)) {
    if (!EXPECT_MANAGED.has(k)) extras[k] = v
  }
  const tools: ToolRow[] = []
  const raw = Array.isArray(expect.toolCalls) ? (expect.toolCalls as Json[]) : []
  for (const tc of raw) {
    const row: ToolRow = {
      name: String(tc.name ?? ''),
      gte: tc.count && (tc.count as Json).gte != null ? String((tc.count as Json).gte) : '',
      lte: tc.count && (tc.count as Json).lte != null ? String((tc.count as Json).lte) : '',
      paramKey: '', paramMode: 'contains', paramVal: '',
    }
    const input = tc.input
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const keys = Object.keys(input as object)
      const only = keys.length === 1 ? (input as Json)[keys[0]] : undefined
      if (keys.length === 1 && isRuleObj(only)) {
        row.paramKey = keys[0]
        row.paramMode = 'eq' in (only as Json) ? 'eq' : 'contains'
        row.paramVal = String('eq' in (only as Json) ? (only as Json).eq : (only as Json).contains)
      } else {
        row.inputRaw = JSON.stringify(input)
      }
    }
    tools.push(row)
  }
  return {
    noToolCalls: Boolean(expect.noToolCalls),
    min: expect.minToolCalls != null ? String(expect.minToolCalls) : '',
    max: expect.maxToolCalls != null ? String(expect.maxToolCalls) : '',
    tools,
    textContains: Array.isArray(expect.textContains) ? (expect.textContains as string[]).join(', ') : '',
    textNotContains: Array.isArray(expect.textNotContains) ? (expect.textNotContains as string[]).join(', ') : '',
    done: Boolean(expect.done),
    answerNotEmpty: Boolean(expect.answerNotEmpty),
    errorFree: Boolean(expect.errorFree),
    extras,
  }
}

function buildExpect(f: ExpectForm): { value: Json; errors: string[] } {
  const errors: string[] = []
  const expect: Json = { ...f.extras }
  if (f.noToolCalls) expect.noToolCalls = true
  if (f.min.trim() !== '') expect.minToolCalls = Number(f.min)
  if (f.max.trim() !== '') expect.maxToolCalls = Number(f.max)
  const tools: Json[] = []
  for (const row of f.tools) {
    if (!row.name.trim()) {
      errors.push('工具断言缺少工具名')
      continue
    }
    const tc: Json = { name: row.name.trim() }
    const count: Json = {}
    if (row.gte.trim() !== '') count.gte = Number(row.gte)
    if (row.lte.trim() !== '') count.lte = Number(row.lte)
    if (Object.keys(count).length) tc.count = count
    if (row.inputRaw) {
      try {
        tc.input = JSON.parse(row.inputRaw)
      } catch {
        errors.push(`工具「${row.name}」的复杂参数条件不是合法 JSON`)
      }
    } else if (row.paramKey.trim() && row.paramVal !== '') {
      tc.input = { [row.paramKey.trim()]: { [row.paramMode]: textToValue(row.paramVal) } }
    } else if (row.paramKey.trim() || row.paramVal !== '') {
      // 半填行（只填了参数名或只填了值）：以前被静默丢弃 —— 现在明确报错，避免"填了却没生效"
      errors.push(
        `工具「${row.name.trim()}」的断言参数不完整（${row.paramKey.trim() ? '参数名已填、值为空' : '值已填、参数名为空'}）—— 请补全，或清空该行参数条件`,
      )
    }
    tools.push(tc)
  }
  if (tools.length) expect.toolCalls = tools
  const tcs = tagsToList(f.textContains)
  const tns = tagsToList(f.textNotContains)
  if (tcs.length) expect.textContains = tcs
  if (tns.length) expect.textNotContains = tns
  if (f.done) expect.done = true
  if (f.answerNotEmpty) expect.answerNotEmpty = true
  if (f.errorFree) expect.errorFree = true
  return { value: expect, errors }
}

/* ── judge 表单模型 ──────────────────────────────────────────────── */

const JUDGE_MANAGED = new Set(['faithfulness', 'completeness', 'guardrail', 'style'])

interface JudgeForm {
  faithfulness: boolean
  guardrail: boolean
  style: boolean
  needsDisclaimer: boolean
  completeness: boolean
  goldenPointsText: string
  extras: Json
}

function parseJudgeForm(judge: Json | null): JudgeForm {
  const j = judge || {}
  const extras: Json = {}
  for (const [k, v] of Object.entries(j)) {
    if (!JUDGE_MANAGED.has(k)) extras[k] = v
  }
  const comp = j.completeness as Json | undefined
  const style = j.style as Json | undefined
  return {
    faithfulness: Boolean(j.faithfulness),
    guardrail: Boolean(j.guardrail),
    style: Boolean(j.style),
    needsDisclaimer: Boolean(style?.needsDisclaimer),
    completeness: Boolean(j.completeness),
    goldenPointsText: Array.isArray(comp?.goldenPoints)
      ? (comp?.goldenPoints as string[]).join('\n')
      : '',
    extras,
  }
}

function buildJudge(f: JudgeForm): Json | null {
  const judge: Json = { ...f.extras }
  if (f.faithfulness) judge.faithfulness = true
  if (f.guardrail) judge.guardrail = true
  if (f.style) judge.style = { needsDisclaimer: f.needsDisclaimer }
  if (f.completeness) {
    const points = f.goldenPointsText.split('\n').map((s) => s.trim()).filter(Boolean)
    judge.completeness = { goldenPoints: points }
  }
  return Object.keys(judge).length ? judge : null
}

/* ── 主组件 ──────────────────────────────────────────────────────── */

export function CaseEditor({
  initial, onClose, onSaved, onError,
}: {
  initial: EvalCase | null
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const isNew = initial === null
  const [data, setData] = useState<EditorData>(() => ({
    case_id: initial?.case_id ?? '',
    grp: initial?.grp ?? 'l1',
    priority: initial?.priority ?? 'P0',
    desc: initial?.desc ?? '',
    message: initial?.message ?? '',
    tags: (initial?.tags ?? []).join(','),
    enabled: initial?.enabled ?? true,
    ctx: initial?.ctx ?? {},
    expect: initial?.expect ?? {},
    judge: initial?.judge ?? null,
  }))
  const [mode, setMode] = useState<'form' | 'json'>('form')
  const [raw, setRaw] = useState({ ctx: '', expect: '', judge: '' })
  const [rawErr, setRawErr] = useState<{ ctx?: string; expect?: string; judge?: string }>({})
  const [saving, setSaving] = useState(false)

  const patch = (p: Partial<EditorData>) => setData((d) => ({ ...d, ...p }))

  /* 表单子模型 —— ⚠️ 必须是**组件本地 state**，不能由 data 派生反推。
     背景（2026-10-09 修）：早期实现用 useMemo(parseExpectForm(data.expect)) 从 data 反推，
     而 buildExpect 会丢弃"半填行"（如只填了参数名、值还空着）——每敲一个键数据都走一遍
     build→parse 往返，半填内容被清掉，表现为弹框里的 参数名/包含/值 控件**完全无法输入**。
     现在：本地 state 是编辑期间的唯一事实源；每次变更再物化进 data（供预览 / JSON 切换 / 保存）。 */
  const [expectForm, setExpectFormState] = useState<ExpectForm>(() => parseExpectForm(initial?.expect ?? {}))
  const [judgeForm, setJudgeFormState] = useState<JudgeForm>(() => parseJudgeForm(initial?.judge ?? null))

  const setExpectForm = (p: Partial<ExpectForm>) => {
    const merged = { ...expectForm, ...p }
    setExpectFormState(merged)
    patch({ expect: buildExpect(merged).value })
  }
  const setJudgeForm = (p: Partial<JudgeForm>) => {
    const merged = { ...judgeForm, ...p }
    setJudgeFormState(merged)
    patch({ judge: buildJudge(merged) })
  }

  const expectPreview = useMemo(() => expectToLines(data.expect), [data.expect])

  /* 模式切换 */
  const toJsonMode = () => {
    setRaw({
      ctx: JSON.stringify(data.ctx, null, 1),
      expect: JSON.stringify(data.expect, null, 1),
      judge: data.judge ? JSON.stringify(data.judge, null, 1) : '',
    })
    setRawErr({})
    setMode('json')
  }
  const toFormMode = () => {
    const errs: typeof rawErr = {}
    const parsed: { ctx?: Json; expect?: Json; judge?: Json | null } = {}
    for (const key of ['ctx', 'expect', 'judge'] as const) {
      const text = raw[key].trim()
      if (key === 'judge' && text === '') {
        parsed.judge = null
        continue
      }
      try {
        parsed[key] = key === 'judge' ? JSON.parse(text) : JSON.parse(text || '{}')
      } catch (e) {
        errs[key] = (e as Error).message
      }
    }
    if (Object.keys(errs).length) {
      setRawErr(errs)
      onError('JSON 有误，修正后才能切换到表单模式')
      return
    }
    const nextExpect = (parsed.expect ?? data.expect) as Json
    const nextJudge = (parsed.judge !== undefined ? parsed.judge : data.judge) as Json | null
    setData((d) => ({ ...d, ctx: parsed.ctx ?? d.ctx, expect: nextExpect, judge: nextJudge }))
    // 表单子模型重置为 JSON 解析结果 —— 本地 state 非派生，必须显式同步（否则改完 JSON 切回来还是旧表单）
    setExpectFormState(parseExpectForm(nextExpect))
    setJudgeFormState(parseJudgeForm(nextJudge))
    setRawErr({})
    setMode('form')
  }

  const switchMode = (m: 'form' | 'json') => {
    if (m === mode) return
    if (m === 'json') toJsonMode()
    else toFormMode()
  }

  /* 保存 */
  const save = async () => {
    if (isNew && !data.case_id.trim()) return onError('请填写 case_id（如 L5-01 / R2-01）')
    if (!data.message.trim()) return onError('输入 message 不能为空')

    let ctx = data.ctx
    let expect = data.expect
    let judge = data.judge
    if (mode === 'json') {
      try {
        ctx = JSON.parse(raw.ctx || '{}')
        expect = JSON.parse(raw.expect || '{}')
        judge = raw.judge.trim() ? JSON.parse(raw.judge) : null
      } catch (e) {
        return onError(`JSON 解析失败：${(e as Error).message}`)
      }
    } else {
      const built = buildExpect(expectForm)
      if (built.errors.length) return onError(built.errors[0])
      expect = built.value
      judge = buildJudge(judgeForm)
    }
    // 用户信息全局化：用例不再携带 userId / familyId / babyId（运行时由平台注入，见 effective_ctx）
    ctx = stripUserCtxKeys(ctx)

    const payload = {
      grp: data.grp, priority: data.priority || null, desc: data.desc || null,
      message: data.message, ctx, history: initial?.history ?? [], expect,
      judge, extra: initial?.extra ?? null,
      tags: tagsToList(data.tags), enabled: data.enabled,
      sort_order: initial?.sort_order ?? 0,
    }
    setSaving(true)
    try {
      if (isNew) {
        await agentEvalApi.createCase({ case_id: data.case_id.trim(), ...payload })
      } else {
        await agentEvalApi.updateCase(initial.case_id, payload)
      }
      onSaved()
    } catch (e) {
      onError(`保存失败：${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const row = (label: string, node: ReactNode, hint?: string) => (
    <div className="ce-row">
      <div className="hint ce-label">
        {label}
        {hint ? `（${hint}）` : ''}
      </div>
      {node}
    </div>
  )

  return (
    <Modal title={isNew ? '新建用例' : `编辑用例 · ${initial?.case_id}`} onClose={onClose} width={920}>
      <div className="ce-modebar">
        <div className="seg">
          <button className={`seg-btn${mode === 'form' ? ' on' : ''}`} onClick={() => switchMode('form')}>
            表单模式
          </button>
          <button className={`seg-btn${mode === 'json' ? ' on' : ''}`} onClick={() => switchMode('json')}>
            JSON 模式
          </button>
        </div>
        <span className="hint">两种模式同一份数据，随时切换；未知字段原样保留</span>
      </div>

      {/* 来源徽标（US-18 飞轮）：种子 / 派生自 xx@运行 */}
      {!isNew && (
        <div className="hint" style={{ marginBottom: 8 }}>
          来源：
          {initial?.source?.type === 'derive' ? (
            <>
              派生自 <span className="mono">{initial.source.from_case}</span>
              {initial.source.from_run ? <>（来自运行 <span className="mono">{initial.source.from_run}</span>）</> : null}
            </>
          ) : (
            '种子用例（手工创建 / 从 harness 导入）'
          )}
        </div>
      )}

      {mode === 'form' ? (
        <>
          <div className="ce-grid2">
            {isNew &&
              row('case_id', (
                <input style={INPUT} value={data.case_id} onChange={(e) => patch({ case_id: e.target.value })} placeholder="L5-01" />
              ))}
            {row('组', (
              <select style={INPUT} value={data.grp} onChange={(e) => patch({ grp: e.target.value })}>
                {EVAL_GROUPS.map(([id, name]) => (
                  <option key={id} value={id}>{id} · {name}</option>
                ))}
                <option value="custom">custom</option>
              </select>
            ))}
            {row('优先级', (
              <select style={INPUT} value={data.priority} onChange={(e) => patch({ priority: e.target.value })}>
                {['P0', 'P1', 'P2'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ))}
          </div>
          {row('描述', <input style={INPUT} value={data.desc} onChange={(e) => patch({ desc: e.target.value })} />)}
          {row('用户提问（用户会怎么说）', (
            <textarea style={{ ...INPUT, minHeight: 52 }} value={data.message} onChange={(e) => patch({ message: e.target.value })} />
          ))}
          {row('标签', (
            <input style={INPUT} value={data.tags} onChange={(e) => patch({ tags: e.target.value })} placeholder="capability,safety,realdata" />
          ), '逗号分隔，界面按中文展示：capability=能力 · safety=安全 · realdata=真实数据')}

          {/* ── 上下文 ctx：用户信息（userId/familyId/babyId）属全局配置，不在用例层设置/展示（18:26 用户评审）── */}

          {/* ── 确定性断言 expect ── */}
          <div className="ce-block">
            <div className="ce-block-head">
              确定性断言
              <span className="hint"> 运行后自动比对；未列出的高级字段原样保留</span>
            </div>
            <ExpectEditor value={expectForm} onChange={setExpectForm} />
            <div className="ce-preview">
              <div className="hint ce-label">断言预览（运行详情同款渲染）</div>
              {expectPreview.length ? (
                <ul className="ev-list">{expectPreview.map((l, i) => <li key={i}>{l}</li>)}</ul>
              ) : (
                <div className="hint">暂无断言</div>
              )}
            </div>
          </div>

          {/* ── 判分要点 judge ── */}
          <div className="ce-block">
            <div className="ce-block-head">LLM 判分要点<span className="hint"> 全不勾 = 该用例不做 LLM 判分</span></div>
            <JudgeEditor value={judgeForm} onChange={setJudgeForm} />
          </div>

          <label className="ce-enabled">
            <input type="checkbox" checked={data.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
            启用（停用的用例不参与运行）
          </label>
        </>
      ) : (
        <>
          <div className="ce-grid2">
            {isNew && row('case_id', (
              <input style={INPUT} value={data.case_id} onChange={(e) => patch({ case_id: e.target.value })} />
            ))}
            {row('组', (
              <select style={INPUT} value={data.grp} onChange={(e) => patch({ grp: e.target.value })}>
                {EVAL_GROUPS.map(([id, name]) => <option key={id} value={id}>{id} · {name}</option>)}
                <option value="custom">custom</option>
              </select>
            ))}
            {row('优先级', (
              <select style={INPUT} value={data.priority} onChange={(e) => patch({ priority: e.target.value })}>
                {['P0', 'P1', 'P2'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ))}
          </div>
          {row('描述', <input style={INPUT} value={data.desc} onChange={(e) => patch({ desc: e.target.value })} />)}
          {row('用户提问', (
            <textarea style={{ ...INPUT, minHeight: 52 }} value={data.message} onChange={(e) => patch({ message: e.target.value })} />
          ))}
          {row('标签', (
            <input style={INPUT} value={data.tags} onChange={(e) => patch({ tags: e.target.value })} />
          ), '逗号分隔')}
          <div className="ce-grid2">
            {(['ctx', 'expect'] as const).map((k) => (
              <div key={k} className="ce-jsoncol">
                <div className="hint ce-label">
                  {k === 'ctx'
                    ? 'ctx（JSON；仅存用例特有上下文，用户信息由平台全局配置提供、不在此设置）'
                    : `${k}（JSON）`}
                </div>
                <textarea
                  className="ce-json"
                  value={raw[k]}
                  onChange={(e) => setRaw((r) => ({ ...r, [k]: e.target.value }))}
                />
                {rawErr[k] && <div className="ce-err">JSON 无效：{rawErr[k]}</div>}
              </div>
            ))}
          </div>
          <div className="ce-jsoncol">
            <div className="hint ce-label">judge（JSON；留空 = 不做 LLM 判分）</div>
            <textarea
              className="ce-json"
              rows={6}
              value={raw.judge}
              onChange={(e) => setRaw((r) => ({ ...r, judge: e.target.value }))}
            />
            {rawErr.judge && <div className="ce-err">JSON 无效：{rawErr.judge}</div>}
          </div>
          <label className="ce-enabled">
            <input type="checkbox" checked={data.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
            启用（停用的用例不参与运行）
          </label>
        </>
      )}

      <div className="toolbar" style={{ margin: '14px 0 0' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
        <button className="btn" onClick={onClose}>取消</button>
      </div>
    </Modal>
  )
}

/* ── expect 编辑器 ───────────────────────────────────────────────── */

const TOOL_OPTIONS = ['search_knowledge', 'query_baby_data', 'analyze_baby_data', 'generate_diary']

function ExpectEditor({ value, onChange }: { value: ExpectForm; onChange: (p: Partial<ExpectForm>) => void }) {
  const setTool = (i: number, p: Partial<ToolRow>) => {
    const tools = value.tools.map((t, idx) => (idx === i ? { ...t, ...p } : t))
    onChange({ tools })
  }
  const addTool = () => onChange({
    tools: [...value.tools, { name: '', gte: '', lte: '', paramKey: '', paramMode: 'contains', paramVal: '' }],
  })
  const removeTool = (i: number) => onChange({ tools: value.tools.filter((_, idx) => idx !== i) })
  const extrasCount = Object.keys(value.extras).length

  return (
    <div className="ce-expect">
      <div className="ce-checks">
        <label><input type="checkbox" checked={value.noToolCalls} onChange={(e) => onChange({ noToolCalls: e.target.checked })} /> 不调用任何工具</label>
        <label><input type="checkbox" checked={value.done} onChange={(e) => onChange({ done: e.target.checked })} /> 正常收尾</label>
        <label><input type="checkbox" checked={value.answerNotEmpty} onChange={(e) => onChange({ answerNotEmpty: e.target.checked })} /> 回答非空</label>
        <label><input type="checkbox" checked={value.errorFree} onChange={(e) => onChange({ errorFree: e.target.checked })} /> 无运行错误</label>
      </div>
      <div className="ce-inline">
        <span className="hint">工具调用次数</span>
        <span>≥ <input style={{ ...INPUT, width: 56 }} value={value.min} onChange={(e) => onChange({ min: e.target.value })} /></span>
        <span>≤ <input style={{ ...INPUT, width: 56 }} value={value.max} onChange={(e) => onChange({ max: e.target.value })} /></span>
      </div>

      <div className="ce-tools">
        {value.tools.map((t, i) => (
          <div key={i} className="ce-tool-row">
            <input
              style={{ ...INPUT, width: 168 }}
              list="ce-tool-options"
              value={t.name}
              placeholder="工具名"
              onChange={(e) => setTool(i, { name: e.target.value })}
            />
            <span className="hint">次数 ≥</span>
            <input style={{ ...INPUT, width: 48 }} value={t.gte} onChange={(e) => setTool(i, { gte: e.target.value })} />
            <span className="hint">≤</span>
            <input style={{ ...INPUT, width: 48 }} value={t.lte} onChange={(e) => setTool(i, { lte: e.target.value })} />
            {t.inputRaw ? (
              <span className="hint" title={t.inputRaw}>复杂参数条件（改请切 JSON 模式）</span>
            ) : (
              <>
                <input
                  style={{ ...INPUT, width: 110 }}
                  value={t.paramKey}
                  placeholder="参数名"
                  onChange={(e) => setTool(i, { paramKey: e.target.value })}
                />
                <select
                  style={{ ...INPUT, width: 72 }}
                  value={t.paramMode}
                  onChange={(e) => setTool(i, { paramMode: e.target.value as 'contains' | 'eq' })}
                >
                  <option value="contains">包含</option>
                  <option value="eq">等于</option>
                </select>
                <input
                  style={{ ...INPUT, width: 110 }}
                  value={t.paramVal}
                  placeholder="值"
                  onChange={(e) => setTool(i, { paramVal: e.target.value })}
                />
              </>
            )}
            <button className="btn btn-mini" onClick={() => removeTool(i)}>删</button>
          </div>
        ))}
        <datalist id="ce-tool-options">
          {TOOL_OPTIONS.map((t) => <option key={t} value={t} />)}
        </datalist>
        <button className="btn btn-mini" onClick={addTool}>＋ 添加工具断言</button>
      </div>

      <div className="ce-grid2">
        <div className="ce-row">
          <div className="hint ce-label">回答必须包含（逗号分隔）</div>
          <input style={INPUT} value={value.textContains} onChange={(e) => onChange({ textContains: e.target.value })} />
        </div>
        <div className="ce-row">
          <div className="hint ce-label">回答不得出现（逗号分隔）</div>
          <input style={INPUT} value={value.textNotContains} onChange={(e) => onChange({ textNotContains: e.target.value })} />
        </div>
      </div>
      {extrasCount > 0 && (
        <div className="hint">
          另有 {extrasCount} 个高级断言字段（{Object.keys(value.extras).join('、')}）原样保留，如需编辑请切 JSON 模式
        </div>
      )}
    </div>
  )
}

/* ── judge 编辑器 ────────────────────────────────────────────────── */

function JudgeEditor({ value, onChange }: { value: JudgeForm; onChange: (p: Partial<JudgeForm>) => void }) {
  const extrasCount = Object.keys(value.extras).length
  return (
    <div className="ce-judge">
      <div className="ce-checks">
        <label><input type="checkbox" checked={value.faithfulness} onChange={(e) => onChange({ faithfulness: e.target.checked })} /> 忠实度（幻觉审查）</label>
        <label><input type="checkbox" checked={value.guardrail} onChange={(e) => onChange({ guardrail: e.target.checked })} /> 高危护栏</label>
        <label><input type="checkbox" checked={value.style} onChange={(e) => onChange({ style: e.target.checked })} /> 角色风格</label>
        <label className="ce-sub">
          <input
            type="checkbox"
            checked={value.needsDisclaimer}
            disabled={!value.style}
            onChange={(e) => onChange({ needsDisclaimer: e.target.checked })}
          />
          需要免责声明
        </label>
        <label><input type="checkbox" checked={value.completeness} onChange={(e) => onChange({ completeness: e.target.checked })} /> 关键信息完整</label>
      </div>
      {value.completeness && (
        <div className="ce-row">
          <div className="hint ce-label">必须覆盖的关键点（每行一条）</div>
          <textarea
            style={{ ...INPUT, minHeight: 66 }}
            value={value.goldenPointsText}
            onChange={(e) => onChange({ goldenPointsText: e.target.value })}
            placeholder={'明确知识库未收录\n不编造未知内容'}
          />
        </div>
      )}
      {extrasCount > 0 && (
        <div className="hint">
          另有 {extrasCount} 个高级判分字段（{Object.keys(value.extras).join('、')}）原样保留，如需编辑请切 JSON 模式
        </div>
      )}
    </div>
  )
}
