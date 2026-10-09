/**
 * Agent 测评域 API（PRD-010）：`/api/agent-eval/*`
 *
 * 自包含模块：类型与请求都收敛在这里，不与 KB 域的 `types.ts` / `api.ts` 互相影响
 * （分域演进，避免全库级文件成为两个域的合流点）。
 *
 * 页面：`pages/AgentEval.tsx`（总览 · 发起 · 用例钻取）、`pages/AgentEvalHistory.tsx`（历史运行）。
 * 路由约定：`?page=agenteval&doc=<run_id>` —— 借用通用 `doc` 参数承载「当前查看的运行」。
 */
import { req } from './api'

/* ── 类型 ─────────────────────────────────────────────────────────── */

export type GateState = 'pass' | 'fail' | 'na'

export interface EvalGateItem {
  label: string
  dim_id?: string
  text: string
  pass: boolean
  /** 三态（TECH-022 A2）：pass / fail / na（未测）。旧轮快照无此字段，用 gateState() 兼容推导 */
  state?: GateState
  target: string
  must_pass?: boolean
}

export interface EvalSummary {
  total: number
  passed: number
  p0: number | null
  p0Pass: number | null
  gate?: Record<string, EvalGateItem>
  censored?: boolean
  note?: string
}

export interface EvalEnvSnapshot {
  agent_model?: string
  judge_model?: string | null
  db?: string | null
  cases_hash?: string | null
  cases?: { count?: number; hash?: string | null; ids?: string[] } | null
  git?: string | null
  harness?: string
  task_id?: string
  dims?: string[]
  judges?: string[]
  /** 当轮使用的全局运行身份（pipeline.yaml → eval.ctx；2026-10-09 起物化时注入每条用例） */
  eval_ctx?: Record<string, string> | null
}

export interface EvalRunMeta {
  run_id: string
  task_id?: string | null
  scope: string
  scope_label: string
  judge: boolean
  runs_n: number
  status: string
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
  env_snapshot: EvalEnvSnapshot
  summary: EvalSummary | null
  error: string | null
  created_at: string
}

/** 当轮实际使用的用例定义（运行快照。TECH-022 B3：详情页展示"问题原文/期望断言"用） */
export interface EvalCaseDef {
  message: string | null
  ctx: Record<string, unknown>
  history: unknown[]
  expect: Record<string, unknown>
  judge: Record<string, unknown> | null
}

export interface EvalToolCall {
  name: string
  input?: unknown
  output?: string
  ms?: number
}

export interface EvalJudgeDetail {
  pass?: boolean
  score?: number
  reason?: string
  /** style 裁判返回多条目理由数组（TECH-022 D6：原 UI 只读 reason，此字段长期不显示） */
  reasons?: string[]
  hardHallucination?: boolean
  covered?: number
  total?: number
  missed?: string[]
  seekCare?: boolean
  dangerousAdvice?: boolean
  disclaimerPresent?: boolean
  [k: string]: unknown
}

export interface EvalCaseResult {
  case_id: string
  grp: string | null
  priority: string | null
  desc: string | null
  pass: boolean
  stage: string | null
  detail: string | null
  ms: number | null
  tool_calls: EvalToolCall[]
  trace_id: string | null
  force_finished: boolean
  answer: string
  judge: Record<string, EvalJudgeDetail> | null
}

export interface EvalRunDetail extends EvalRunMeta {
  cases: EvalCaseResult[]
  /** 运行快照中的用例定义（message/ctx/expect）；早于物化时代的运行缺失 = null */
  case_defs?: Record<string, EvalCaseDef> | null
}

export interface EvalHealth {
  ok: boolean
  node: string | null
  agent_dir: string
  env_local: boolean
  harness: boolean
  running: boolean
  active_run_id: string | null
  issues: string[]
}

/** 全局运行身份（GET /agent-eval/ctx；来源：pipeline.yaml → eval.ctx，「全局配置」页可改） */
export interface EvalRuntimeCtx {
  ctx: Record<string, string>
  /** 是否已配置（全空 = 未配置 —— 运行时回落到用例内已有值） */
  configured: boolean
  source?: string
}

export interface EvalProgress {
  run_id: string
  status: string
  live: boolean
  done: number | null
  total: number | null
  passed?: number
  current?: string | null
  /** 当前用例的描述（TECH-022 B1：进度卡显示「L1-04 · 调用工具」） */
  current_desc?: string | null
  elapsed_ms: number | null
  recent: { id: string; pass: boolean; stage: string | null; ms: number | null }[]
}

export interface EvalDelta {
  scope: string
  prev_run_id: string
  prev_created_at: string
  prev_status: string
  rate_cur: number
  rate_prev: number
  rate_delta: number
  fixed: string[]
  new_fail: string[]
  still_fail: string[]
}

export interface EvalOverview {
  latest: EvalRunMeta | null
  delta: EvalDelta | null
  recent: EvalRunMeta[]
}

/** 耗时估算（TECH-022 B7）：用例数 × 历史单例均时（按 judge 口径分桶） */
export interface EvalEstimate {
  case_count: number
  judge: boolean
  runs_n: number
  est_ms: number
  per_case_ms: number
  sample_runs: number
  basis: 'history' | 'default'
}

/** 裁判试跑结果（TECH-022 B6）：对历史回答重新判分，不写台账 */
export interface EvalRejudgeResult {
  judge_id: string
  dim_key: string
  case_id: string
  source_run_id: string
  judge: EvalJudgeDetail | null
  all: Record<string, EvalJudgeDetail>
  prev: EvalJudgeDetail | null
  prev_run_id: string | null
  dir: string
}

/* ── 配置对象（TECH-021）────────────────────────────────────────── */

export interface EvalCase {
  case_id: string
  grp: string
  priority: string | null
  desc: string | null
  message: string
  ctx: Record<string, unknown>
  history: unknown[]
  expect: Record<string, unknown>
  judge: Record<string, unknown> | null
  extra: Record<string, unknown> | null
  tags: string[]
  enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface EvalJudge {
  judge_id: string
  dim_id: string
  name: string
  type: string
  model: string | null
  temperature: number
  prompt: string | null
  code_ref: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface EvalDimension {
  dim_id: string
  name: string
  level: string
  grp: string | null
  description: string | null
  score_type: string
  threshold: number | null
  weight: number
  must_pass: boolean
  enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface EvalTaskScope {
  all?: boolean
  groups?: string[]
  ids?: string[]
  tags?: string[]
  priorities?: string[]
}

export interface EvalTask {
  task_id: string
  name: string
  scope: EvalTaskScope
  dims: string[] | null
  judge: boolean
  runs_n: number
  note: string | null
  enabled: boolean
  last_run?: EvalRunMeta | null
  run_count?: number
  created_at: string
  updated_at: string
}

/* ── API ─────────────────────────────────────────────────────────── */

const post = <T>(path: string, payload?: unknown) =>
  req<T>(path, { method: 'POST', body: JSON.stringify(payload ?? {}) })

export const agentEvalApi = {
  health: () => req<EvalHealth>('/api/agent-eval/health'),
  /** 全局运行身份（用例编辑器展示；用户信息全局设置的唯一事实源在「全局配置」页） */
  getCtx: () => req<EvalRuntimeCtx>('/api/agent-eval/ctx'),
  start: (scope: string, judge: boolean, runs: number) =>
    post<{ run_id: string; scope_label: string; judge: boolean; runs_n: number }>(
      '/api/agent-eval/runs',
      { scope, judge, runs },
    ),
  listRuns: (limit = 50) => req<{ items: EvalRunMeta[] }>(`/api/agent-eval/runs?limit=${limit}`),
  runDetail: (runId: string) => req<EvalRunDetail>(`/api/agent-eval/runs/${encodeURIComponent(runId)}`),
  runDelta: (runId: string) =>
    req<{ delta: EvalDelta | null }>(`/api/agent-eval/runs/${encodeURIComponent(runId)}/delta`),
  progress: (runId: string) => req<EvalProgress>(`/api/agent-eval/runs/${encodeURIComponent(runId)}/progress`),
  cancel: (runId: string) => post<{ ok: boolean }>(`/api/agent-eval/runs/${encodeURIComponent(runId)}/cancel`),
  overview: () => req<EvalOverview>('/api/agent-eval/overview'),
  estimate: (scope: string, judge: boolean, runs: number) =>
    req<EvalEstimate>(
      `/api/agent-eval/estimate?scope=${encodeURIComponent(scope)}&judge=${judge}&runs=${runs}`),

  /* ── 配置对象（TECH-021 §5）── */
  listCases: (params = '') => req<{ items: EvalCase[]; count: number }>(`/api/agent-eval/cases${params}`),
  createCase: (body: Record<string, unknown>) => post<EvalCase>('/api/agent-eval/cases', body),
  updateCase: (caseId: string, body: Record<string, unknown>) =>
    req<EvalCase>(`/api/agent-eval/cases/${encodeURIComponent(caseId)}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  deleteCase: (caseId: string) =>
    req<{ ok: boolean }>(`/api/agent-eval/cases/${encodeURIComponent(caseId)}`, { method: 'DELETE' }),
  importCases: (force = false) =>
    post<{ imported: number; skipped: boolean; existing?: number }>('/api/agent-eval/cases/import', { force }),
  exportCases: () => req<{ cases: unknown[]; count: number }>('/api/agent-eval/cases/export'),

  listJudges: () => req<{ items: EvalJudge[]; count: number }>('/api/agent-eval/judges'),
  updateJudge: (judgeId: string, body: Record<string, unknown>) =>
    req<EvalJudge>(`/api/agent-eval/judges/${encodeURIComponent(judgeId)}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  tryJudge: (judgeId: string, caseId: string, runId?: string) =>
    post<EvalRejudgeResult>(`/api/agent-eval/judges/${encodeURIComponent(judgeId)}/try`,
      { case_id: caseId, run_id: runId || undefined }),

  listDimensions: () => req<{ items: EvalDimension[]; count: number }>('/api/agent-eval/dimensions'),
  updateDimension: (dimId: string, body: Record<string, unknown>) =>
    req<EvalDimension>(`/api/agent-eval/dimensions/${encodeURIComponent(dimId)}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),

  listTasks: () => req<{ items: EvalTask[]; count: number }>('/api/agent-eval/tasks'),
  createTask: (body: Record<string, unknown>) => post<EvalTask>('/api/agent-eval/tasks', body),
  updateTask: (taskId: string, body: Record<string, unknown>) =>
    req<EvalTask>(`/api/agent-eval/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  deleteTask: (taskId: string) =>
    req<{ ok: boolean }>(`/api/agent-eval/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' }),
  runTask: (taskId: string, body: Record<string, unknown> = {}) =>
    post<{ run_id: string; scope_label: string; case_count: number }>(
      `/api/agent-eval/tasks/${encodeURIComponent(taskId)}/run`, body,
    ),
}

/* ── 展示辅助 ────────────────────────────────────────────────────── */

export const RUN_STATUS_LABEL: Record<string, string> = {
  running: '运行中',
  completed: '已完成',
  failed: '已失败',
  cancelled: '已中止',
}

/** 闸门单项三态（旧轮快照无 state 字段 → 按 text/pass 兼容推导；TECH-022 A2） */
export function gateState(g: EvalGateItem): GateState {
  if (g.state === 'pass' || g.state === 'fail' || g.state === 'na') return g.state
  if (!g.text || g.text === 'N/A') return 'na'
  return g.pass ? 'pass' : 'fail'
}

export type VerdictKind = 'pass' | 'fail' | 'partial' | 'cancelled' | 'failed' | 'running' | 'none'

export interface EvalVerdict {
  kind: VerdictKind
  /** 一句话结论（横幅标题） */
  title: string
  /** 未达标项（fail）的逐条说明 */
  reasons: string[]
  /** 未测项（na）的维度名 */
  naLabels: string[]
}

/**
 * 闸门结论推导（TECH-022 A1/D1）。
 *
 * 口径（与 PRD-010 US-03 / US-06 对齐）：
 *   · 任一已测维度未达标 → fail（含非 must_pass 项；对齐 gate.mjs 的 allPass 语义）
 *   · 无未达标但存在未测维度 → partial（"未测 ≠ 未通过"，不能宣称达标）
 *   · 全部已测且达标 → pass
 * 运行态（cancelled/failed/running）单独成态，由横幅另行呈现覆盖数。
 */
export function deriveVerdict(run: EvalRunMeta | null | undefined): EvalVerdict {
  const empty: EvalVerdict = { kind: 'none', title: '', reasons: [], naLabels: [] }
  if (!run) return empty
  if (run.status === 'running') return { kind: 'running', title: '运行中', reasons: [], naLabels: [] }
  if (run.status === 'failed') {
    return { kind: 'failed', title: '运行失败', reasons: run.error ? [run.error] : [], naLabels: [] }
  }
  if (run.status === 'cancelled') {
    const covered = run.summary ? `${run.summary.passed}/${run.summary.total}` : '—'
    return {
      kind: 'cancelled',
      title: `已中止 · 部分结论（覆盖 ${covered}）`,
      reasons: [], naLabels: [],
    }
  }
  const gate = run.summary?.gate
  if (!gate) return empty
  const items = Object.values(gate)
  const fails = items.filter((g) => gateState(g) === 'fail')
  const nas = items.filter((g) => gateState(g) === 'na')
  if (fails.length > 0) {
    return {
      kind: 'fail',
      title: '闸门未达标',
      reasons: fails.map((g) => `${g.label}：${g.text}（目标 ${g.target}）${g.must_pass ? ' · 硬门槛' : ''}`),
      naLabels: nas.map((g) => g.label),
    }
  }
  if (nas.length > 0) {
    return {
      kind: 'partial',
      title: '闸门未完整覆盖',
      reasons: [],
      naLabels: nas.map((g) => g.label),
    }
  }
  return { kind: 'pass', title: '闸门达标', reasons: [], naLabels: [] }
}

/** 历史列表等窄场景用的一句话结论（title + 主原因） */
export function verdictShort(v: EvalVerdict): string {
  if (v.kind === 'fail') return `${v.title}：${v.reasons[0] || ''}`
  if (v.kind === 'partial') return `${v.title}：${v.naLabels.join('、')} 未测`
  return v.title
}

export const VERDICT_PILL_KIND: Record<VerdictKind, 'ok' | 'danger' | 'warn' | 'plain'> = {
  pass: 'ok', fail: 'danger', partial: 'warn', cancelled: 'plain',
  failed: 'danger', running: 'warn', none: 'plain',
}

export const VERDICT_PILL_TEXT: Record<VerdictKind, string> = {
  pass: '达标', fail: '未达标', partial: '未完整', cancelled: '已中止',
  failed: '失败', running: '运行中', none: '—',
}

/** 裁判维度键（dim-guardrail → guardrail）；试跑与判分渲染共用 */
export function dimKeyOfJudge(j: { dim_id: string; judge_id: string }): string {
  return j.dim_id.includes('-') ? j.dim_id.split('-').slice(1).join('-') : j.dim_id
}

export const JUDGE_KEY_LABEL: Record<string, string> = {
  faithfulness: '忠实度',
  completeness: '关键信息完整',
  guardrail: '高危护栏',
  style: '角色风格',
}

export function fmtThresholdPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(0)}%`
}


export function statusPillKind(status: string): string {
  return status === 'completed' ? 'ok'
    : status === 'failed' ? 'danger'
      : status === 'running' ? 'warn'
        : 'plain'
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return s % 60 === 0 ? `${m}m` : `${m}m${String(s % 60).padStart(2, '0')}s`
}

/** 分组选择清单（harness `--group` 取值） */
export const EVAL_GROUPS: [string, string][] = [
  ['l0', 'L0 检索'],
  ['l1', 'L1 工具调用'],
  ['l2', 'L2 回答质量'],
  ['l3', 'L3 安全护栏'],
  ['l4', 'L4 对话与会话'],
  ['r1', 'R1 真实数据'],
]

/** 用例分组的展示名（用例表「组」列） */
export function groupLabel(grp: string | null): string {
  if (!grp) return '—'
  const hit = EVAL_GROUPS.find(([id]) => grp.startsWith(id))
  return hit ? hit[1] : grp
}

/** 用例标签展示名（`eval_case.tags`）：数据侧存英文原值（任务筛选按原值匹配），界面统一转中文 */
export const TAG_LABEL: Record<string, string> = {
  capability: '能力',
  safety: '安全',
  realdata: '真实数据',
}

export function tagLabel(t: string): string {
  return TAG_LABEL[t.toLowerCase()] || t
}

/** 用例优先级展示名（与后端 `agent_eval/ledger.py` 的 `PRIORITY_LABELS` 对齐） */
export const PRIORITY_LABEL: Record<string, string> = {
  p0: 'P0（关键）',
  p1: 'P1（普通）',
  p2: 'P2（次要）',
}

export function priorityLabel(p: string | null | undefined): string {
  if (!p) return '—'
  return PRIORITY_LABEL[p.toLowerCase()] || p
}

/** 维度级别展示名（`eval_dimension.level`） */
export const DIM_LEVEL_LABEL: Record<string, string> = {
  case: '用例级',
  run: '运行级',
}

/** 维度评分方式展示名（`eval_dimension.score_type`） */
export const SCORE_TYPE_LABEL: Record<string, string> = {
  boolean: '布尔判定',
  numeric: '数值比例',
}

/** 用例结果的「失败阶段」（`eval_case_result.stage`） */
export const STAGE_LABEL: Record<string, string> = {
  deterministic: '确定性断言',
  judge: '裁判判分',
  error: '运行异常',
  ok: '通过',
}

export function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
