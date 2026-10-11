/**
 * Agent 测评域 API（PRD-010）：`/api/agent-eval/*`
 *
 * 自包含模块：类型与请求都收敛在这里，不与 KB 域的 `types.ts` / `api.ts` 互相影响
 * （分域演进，避免全库级文件成为两个域的合流点）。
 *
 * 页面：`pages/AgentEval.tsx`（测评报告 · 只查看）、`pages/AgentEvalTasks.tsx`（任务 = 发起 + 执行 + 记录三合一）。
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
  /** 判分引擎标识（TECH-026 B4）：deepeval；旧轮无此字段 */
  judge_engine?: string | null
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
  /** 失败重跑来源（US-19 飞轮）：本轮的失败用例集派生自该轮；null/缺省 = 正常发起 */
  retry_of?: string | null
}

/** 判分引擎元数据（TECH-026 B4：scoring_meta） */
export interface EvalScoringMeta {
  deepeval?: string
  model?: string
  elapsed_ms?: number
  calls?: number
  failed?: number
  applied?: number
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
  /** 判分阶段（TECH-026 B4）：pending/running/done/failed/skipped；旧轮 null */
  scoring?: string | null
  scoring_error?: string | null
  scoring_meta?: EvalScoringMeta | null
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
  /** 三态判定（TECH-026 判分引擎）：pass / neutral / fail；旧 Node 判分无此字段 */
  verdict?: 'pass' | 'neutral' | 'fail'
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
  /** 裁判执行失败（TECH-026 T-07：逐裁判隔离后的错误载荷） */
  error?: string
  [k: string]: unknown
}

/* ── 报告 2.0（TECH-026）：五指标 / 归因 / 成本 / 决策 ─────────────── */

/** 归因分类（与后端 `agent_eval/attribution.py` CLASSES 对齐） */
export type AttributionClass = 'env' | 'data' | 'exec' | 'judge' | 'skill'

/** 单用例 Token 明细（TECH-026 §5；旧轮为 null） */
export interface EvalTokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
  total: number
}

export interface EvalMetricValue {
  num: number
  den: number
  /** 0-1；null = 无法计算（显示 "—"） */
  value: number | null
}

export interface EvalMetrics {
  total: number
  raw: EvalMetricValue
  decontaminated: EvalMetricValue
  functional: EvalMetricValue
  env_blocked: EvalMetricValue
}

export interface EvalAttributionBlock {
  counts: Record<AttributionClass, number>
  total_failed: number
  den: number
  reviewed: number
  overridden: number
  /** 旧轮无归因列时"读取时实时推导"的行数 */
  derived: number
  /** 逐用例最终归因（含人工改判与旧轮实时推导）；用例表展示/筛选消费 */
  by_case?: Record<string, AttributionClass>
}

export interface EvalCost {
  durations: { avg: number | null; p50: number | null; p90: number | null; p95: number | null; max: number | null; n: number }
  tokens: { input: number | null; output: number | null; cacheRead: number | null; cacheCreation: number | null; total: number | null; n: number }
  top: { case_id: string; desc: string | null; ms: number | null; tokens: number | null }[]
}

/** 决策四态 + 运行态（TECH-026 §4.4；`scoring` 为第 1.5 期判分中态） */
export type EvalDecisionKind = 'pass' | 'fail' | 'partial' | 'no_valid' | 'failed' | 'cancelled' | 'running' | 'scoring'

export interface EvalDecision {
  kind: EvalDecisionKind
  title: string
  reasons: string[]
  actions: string[]
  note: string | null
}

export interface EvalReport {
  metrics: EvalMetrics
  attribution: EvalAttributionBlock
  cost: EvalCost
  decision: EvalDecision
  meta: {
    total: number
    derived_attribution: number
    token_cases: number
    /** 判分阶段（TECH-026 B4） */
    scoring?: string | null
    scoring_error?: string | null
    scoring_meta?: EvalScoringMeta | null
  }
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
  /** 归因（TECH-026 §3）：仅失败样本有值；NULL = 未归类（旧行 / 已恢复自动，后端读取时实时推导） */
  attribution?: AttributionClass | null
  attribution_source?: 'auto' | 'manual' | null
  attribution_note?: string | null
  tokens?: EvalTokenUsage | null
  /** 样本分（TECH-026 §5.2 两级聚合）：0-1；旧轮 null → 显示「—」 */
  sample_score?: number | null
  /** 各指标分拆解（indicator_id → 0-1）；仅供 hover 展示 */
  indicator_scores?: Record<string, number> | null
}

export interface EvalRunDetail extends EvalRunMeta {
  cases: EvalCaseResult[]
  /** 运行快照中的用例定义（message/ctx/expect）；早于物化时代的运行缺失 = null */
  case_defs?: Record<string, EvalCaseDef> | null
  /** 报告 2.0 聚合（TECH-026 §4，实时计算）；旧轮/接口降级 = null/undefined */
  report?: EvalReport | null
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

/**
 * 运行身份（全局用户信息）单行展示：`user xxx… · family xxx… · baby xxx…`（UUID 截 8 位）。
 * 18:26 用户评审：用户信息由平台全局配置统一提供，在任务创建与报告层集中呈现一次，不在用例层出现。
 */
export function identityText(ctx: Record<string, string> | null | undefined): string {
  if (!ctx || Object.keys(ctx).length === 0) return '未配置（用例自带值生效）'
  const short = (v: string) => (v.length > 10 ? `${v.slice(0, 8)}…` : v)
  const parts: string[] = []
  if (ctx.userId) parts.push(`user ${short(ctx.userId)}`)
  if (ctx.familyId) parts.push(`family ${short(ctx.familyId)}`)
  if (ctx.babyId) parts.push(`baby ${short(ctx.babyId)}`)
  return parts.length ? parts.join(' · ') : '未配置'
}

export interface EvalProgress {
  run_id: string
  status: string
  live: boolean
  /** 阶段（TECH-026 B4）：executing 执行中 / scoring 判分中 */
  phase?: 'executing' | 'scoring'
  done: number | null
  total: number | null
  passed?: number
  current?: string | null
  /** 当前用例的描述（TECH-022 B1：进度卡显示「L1-04 · 调用工具」） */
  current_desc?: string | null
  /** 判分进度（phase=scoring 时有效） */
  scoring_done?: number
  scoring_total?: number
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
  /** 本次重判的维度（C6：裁判可挂多维度，试跑按维度选择） */
  dim_id?: string
  dim_key: string
  case_id: string
  source_run_id: string
  judge: EvalJudgeDetail | null
  all: Record<string, EvalJudgeDetail>
  prev: EvalJudgeDetail | null
  prev_run_id: string | null
  dir: string
  /** 判分引擎标识（C4 起 = deepeval；旧 Node 无此字段） */
  engine?: string
  /** 引擎耗时（ms） */
  elapsed_ms?: number
}

/* ── 配置对象（TECH-021）────────────────────────────────────────── */

/** 用例来源链（US-18 飞轮）：种子 = null；派生 = {type:'derive', from_case, from_run} */
export interface EvalCaseSource {
  type: string
  from_case?: string
  from_run?: string | null
}

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
  /** 来源（US-18）：null = 种子用例 */
  source?: EvalCaseSource | null
  enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface EvalJudge {
  judge_id: string
  /** 兼容字段：首维绑定（裁判→维度 1:N 后主绑定在 dimension.judge_id，前端用 dimsOfJudge 组装） */
  dim_id: string
  name: string
  /** 业务场景说明（裁判中心化 C6） */
  description?: string | null
  type: string
  model: string | null
  temperature: number
  prompt: string | null
  code_ref: string | null
  /** 判分引擎 metric 类型（TECH-026 §3.3）：ternary（默认）/ geval / builtin:* */
  metric_type?: string
  /** 引擎参数（params.criteria 旧版兼容；params.variables = 自定义变量表） */
  params?: Record<string, unknown> | null
  enabled: boolean
  created_at: string
  updated_at: string
}

/** 指标（TECH-026 §3.3：判分维度的聚合层；PRD-012 US-15 两级结构的上层） */
export interface EvalIndicator {
  indicator_id: string
  name: string
  description: string | null
  enabled: boolean
  sort_order: number
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
  /** 挂载指标（TECH-026 §3.3）；null = 未分组（页面顶部提示修复） */
  indicator_id?: string | null
  /** 反向维度（US-16：分值取补 1−score；v1 默认全正向） */
  reverse?: boolean
  /** 判分维度键（用例 judge 配置与引擎维度名引用；缺省按 dim_id 推导） */
  metric_key?: string | null
  /** 归属裁判（裁判中心化 C6：维度是裁判内部配置；run 级为 null） */
  judge_id?: string | null
  /** 判定要点（判分引擎优先读取；缺省回退裁判 params.criteria → 内置模板） */
  criteria?: string | null
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
  /** 是否判分（C11 起为派生值：judge_id 非空 = true；保留供展示/兼容） */
  judge: boolean
  /** 关联裁判（C11：任务编辑器下拉选择；null = 不启用判分） */
  judge_id?: string | null
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
  /** 归因人工改判 / 恢复自动（TECH-026 §3.2）；返回更新后的用例行 + 全量重算的 report */
  updateAttribution: (runId: string, caseId: string, body: { attribution: AttributionClass | null; note?: string }) =>
    req<{ case: EvalCaseResult; report: EvalReport }>(
      `/api/agent-eval/runs/${encodeURIComponent(runId)}/cases/${encodeURIComponent(caseId)}/attribution`,
      { method: 'PUT', body: JSON.stringify(body) },
    ),
  progress: (runId: string) => req<EvalProgress>(`/api/agent-eval/runs/${encodeURIComponent(runId)}/progress`),
  cancel: (runId: string) => post<{ ok: boolean }>(`/api/agent-eval/runs/${encodeURIComponent(runId)}/cancel`),
  /** 重判（TECH-026 B4）：对存量结果重新判分，不重跑执行 */
  score: (runId: string) =>
    post<{ ok: boolean; run_id: string; scoring: string }>(
      `/api/agent-eval/runs/${encodeURIComponent(runId)}/score`),
  overview: () => req<EvalOverview>('/api/agent-eval/overview'),
  estimate: (scope: string, judge: boolean, runs: number) =>
    req<EvalEstimate>(
      `/api/agent-eval/estimate?scope=${encodeURIComponent(scope)}&judge=${judge}&runs=${runs}`),
  /** 失败重跑（US-19 飞轮）：以源轮的失败用例集派生新运行（范围/口径服务端自动取自源轮） */
  retryRun: (sourceRunId: string) =>
    post<{ run_id: string; task_id: string | null; scope_label: string; case_count: number }>(
      '/api/agent-eval/runs',
      { retry_of: sourceRunId },
    ),

  /* ── 配置对象（TECH-021 §5）── */
  listCases: (params = '') => req<{ items: EvalCase[]; count: number }>(`/api/agent-eval/cases${params}`),
  getCase: (caseId: string) => req<EvalCase>(`/api/agent-eval/cases/${encodeURIComponent(caseId)}`),
  createCase: (body: Record<string, unknown>) => post<EvalCase>('/api/agent-eval/cases', body),
  /** 派生新用例（US-18 飞轮）：复制为 {家族根}b/c…，可携带 from_run 记录来源轮 */
  deriveCase: (caseId: string, fromRun?: string | null) =>
    post<{ case: EvalCase }>(`/api/agent-eval/cases/${encodeURIComponent(caseId)}/derive`,
      { from_run: fromRun || undefined }),
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
  createJudge: (body: Record<string, unknown>) => post<EvalJudge>('/api/agent-eval/judges', body),
  updateJudge: (judgeId: string, body: Record<string, unknown>) =>
    req<EvalJudge>(`/api/agent-eval/judges/${encodeURIComponent(judgeId)}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  tryJudge: (judgeId: string, caseId: string, runId?: string, dimId?: string) =>
    post<EvalRejudgeResult>(`/api/agent-eval/judges/${encodeURIComponent(judgeId)}/try`,
      { case_id: caseId, run_id: runId || undefined, dim_id: dimId || undefined }),

  listDimensions: () => req<{ items: EvalDimension[]; count: number }>('/api/agent-eval/dimensions'),
  createDimension: (body: Record<string, unknown>) => post<EvalDimension>('/api/agent-eval/dimensions', body),
  updateDimension: (dimId: string, body: Record<string, unknown>) =>
    req<EvalDimension>(`/api/agent-eval/dimensions/${encodeURIComponent(dimId)}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),

  /* ── 指标（TECH-026 §3.3 / PRD-012 US-15）── */
  listIndicators: () => req<{ items: EvalIndicator[]; count: number }>('/api/agent-eval/indicators'),
  createIndicator: (body: Record<string, unknown>) => post<EvalIndicator>('/api/agent-eval/indicators', body),
  updateIndicator: (indicatorId: string, body: Record<string, unknown>) =>
    req<EvalIndicator>(`/api/agent-eval/indicators/${encodeURIComponent(indicatorId)}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  deleteIndicator: (indicatorId: string) =>
    req<{ ok: boolean; indicator_id: string }>(
      `/api/agent-eval/indicators/${encodeURIComponent(indicatorId)}`, { method: 'DELETE' }),

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

/** 判分阶段展示名（TECH-026 B4：eval_run.scoring） */
export const SCORING_LABEL: Record<string, string> = {
  pending: '判分排队中',
  running: '判分中',
  done: '判分完成',
  failed: '判分失败',
  skipped: '未启用判分',
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

/** 裁判名下的判分维度（C6：dim.judge_id 主绑定；回退首期 judge.dim_id 匹配，已排序） */
export function dimsOfJudge(dims: EvalDimension[], judge: EvalJudge): EvalDimension[] {
  const byJudge = dims.filter((d) => d.judge_id && d.judge_id === judge.judge_id)
  const hit = byJudge.length
    ? byJudge
    : dims.filter((d) => !d.judge_id && d.dim_id === judge.dim_id && judge.dim_id)
  return [...hit].sort((a, b) => a.sort_order - b.sort_order || a.dim_id.localeCompare(b.dim_id))
}

/** 维度键（metric_key 优先；缺省按 dim_id 推导）——与后端 `_compile_dimensions` 同口径 */
export function dimKeyOfDim(d: { dim_id: string; metric_key?: string | null }): string {
  if (d.metric_key) return d.metric_key
  return d.dim_id.includes('-') ? d.dim_id.split('-').slice(1).join('-') : d.dim_id
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

/* ── 裁判提示词变量（US-17）──────────────────────────────────────── */

/** 系统变量（只读，运行时自动注入） */
export const JUDGE_SYS_VARS: [string, string][] = [
  ['sys_run_id', '运行标识'],
  ['sys_case_id', '用例号'],
  ['sys_scope', '范围标签'],
]

/** 输出变量（只读；说明裁判必须产出的三态结构） */
export const JUDGE_OUT_VARS: [string, string][] = [
  ['sys_result', '评测结果（通过/中性/失败）'],
  ['sys_reason', '评测原因'],
]

/** 自定义变量·预置 6 个（对齐图灵命名） */
export const JUDGE_PRESET_VARS: [string, string][] = [
  ['chat_query', '本轮用户输入'],
  ['chat_response', '本轮 Agent 回复'],
  ['chat_history', '历史对话'],
  ['tool_execution', '标准化执行轨迹'],
  ['expected_behavior', '本轮预期行为'],
  ['expected_skills', '预期工具链'],
]

/** 旧占位符兼容映射（旧名 → 变量名）：旧提示词继续可解析，不误报「未定义」 */
export const JUDGE_LEGACY_ALIASES: Record<string, string> = {
  message: 'chat_query',
  answer: 'chat_response',
  tool_outputs: 'tool_execution',
  golden_points: 'expected_behavior',
}

/** 自定义变量数量上限（预置 + 新增合计） */
export const JUDGE_VAR_LIMIT = 20

/** 扫描提示词中的 `{{var}}` 引用（去重保序） */
export function scanPromptVars(prompt: string): string[] {
  const out: string[] = []
  const re = /\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(prompt)) !== null) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

/* ── 样本分（US-16 两级聚合）──────────────────────────────────────── */

/** 样本分阈值（US-16：默认 0.50，压线算通过；任务级覆盖见 US-20，前端按默认口径展示） */
export const SAMPLE_THRESHOLD = 0.5

/** 样本分展示：1 位小数；null/undefined → 「—」 */
export function fmtSampleScore(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toFixed(1)
}

/** 样本分临界：低于阈值但差距 ≤0.2（标黄提示「临界」） */
export function sampleScoreWarn(v: number | null | undefined, threshold = SAMPLE_THRESHOLD): boolean {
  if (v == null) return false
  return v < threshold && v >= threshold - 0.2
}

/* ── 报告 2.0 展示辅助（TECH-026）────────────────────────────────── */

/** 归因分类展示名（与后端 `attribution.py` LABELS 对齐） */
export const ATTRIBUTION_LABEL: Record<AttributionClass, string> = {
  env: '环境阻断',
  data: '测试数据问题',
  exec: '机评执行失败',
  judge: '裁判执行失败',
  skill: '被测缺陷',
}

/** 归因分类解释（改判编辑器内展示） */
export const ATTRIBUTION_HINT: Record<AttributionClass, string> = {
  env: '基础设施不可用（数据库 / 嵌入服务 / 网络 / 密钥）导致失败',
  data: '用例自身配置问题（ctx / 期望断言 / 输入无效）',
  exec: '执行未产出且特征不明（含空回答、无活动超时）',
  judge: '裁判模型调用或解析失败',
  skill: '进入过评审但未通过——被测 Agent 的真实质量问题',
}

/** 归因分布展示顺序（修复优先级：被测缺陷在前） */
export const ATTRIBUTION_ORDER: AttributionClass[] = ['skill', 'env', 'exec', 'judge', 'data']

export function attributionLabel(a: string | null | undefined): string {
  if (!a) return '—'
  return ATTRIBUTION_LABEL[a as AttributionClass] || a
}

/** 五指标数值格式：`80.0% (16/20)`；无法计算 → `—（0/0）` */
export function fmtMetric(v: EvalMetricValue | null | undefined): string {
  if (!v) return '—'
  if (v.value == null) return `—（${v.num}/${v.den}）`
  return `${(v.value * 100).toFixed(1)}% (${v.num}/${v.den})`
}

/** Token 数格式：1000+ → `12.3k` */
export function fmtTokens(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return String(v)
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
  regression: '回归集',
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
