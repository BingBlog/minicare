/**
 * 检索质检台 API（PRD-011）：`/api/quality/*`
 *
 * 自包含模块（对齐 `agentEval.ts` 的分域惯例：类型与请求收敛在这里，
 * 不让 `types.ts` / `api.ts` 成为两个域的合流点）。
 *
 * 页面：`pages/Quality.tsx`（质检台 · 发起 · 结论）、`pages/QualityCases.tsx`（用例集）、
 * `pages/QualityRuns.tsx`（执行记录）。
 * 路由约定：`?page=qualityruns&doc=<run_id>` —— 借用通用 `doc` 参数承载「当前查看的运行」。
 *
 * 用例集的维护载体 = **Excel**（`/cases/template.xlsx` 下载模板、`/cases/export.xlsx` 导出、
 * `/import-excel` 上传导入）；表格式 Markdown / JSON 的路径通道保留为兼容。
 */
import { req } from './api'

/* ── 类型 ─────────────────────────────────────────────────────────── */

export interface QualityEnvSnapshot {
  embedding?: string
  rrf_k?: number
  top_k?: number
  diag_depth?: number
  kb_rows?: number | null
  case_set?: { count: number; hash: string }
  metric_version?: string
  gold_version?: string
  git?: string | null
}

export interface QualityMetrics {
  k: number
  recall5: number | null
  recall10: number | null
  mrr: number | null
  harmful_rate: number
  emergency_recall: number | null
  n: number
  answerable: number
  out_of_scope: number
  buckets: Record<string, number>
  metric_version?: string | null
  note?: string | null
}

export interface QualityThresholds {
  recall5_min: number
  recall10_min: number
  harmful_max: number
  emergency_min: number
  emergency_gate: boolean
  metric_version?: string
  diag_depth?: number
}

export interface QualityDelta {
  scope: string
  prev_run_id: string
  prev_created_at: string
  prev_status: string
  metric_version_same: boolean
  metric_version_cur?: string | null
  metric_version_prev?: string | null
  metrics: Record<string, number>
  new_miss: string[]
  fixed: string[]
  still_miss: string[]
}

export interface QualityRunMeta {
  run_id: string
  scope: string
  scope_label: string
  top_k: number
  diag_depth: number
  status: string
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
  env_snapshot: QualityEnvSnapshot
  metrics: QualityMetrics | null
  thresholds: QualityThresholds | null
  passed: boolean | null
  baseline_run_id?: string | null
  delta: QualityDelta | null
  error: string | null
  created_at: string
}

export interface QualityChunkState {
  kb_id: string
  title: string
  state: string // enabled / excluded / missing / unknown
}

export interface QualityCaseEntry {
  code: string
  name: string
  status: string // ok / partial / stale / unmapped
  chunks: QualityChunkState[]
}

export interface QualityCaseRow {
  case_id: string
  module: string
  question: string
  theme?: string | null
  risk: string
  case_type: string
  source: string
  note: string | null
  enabled: boolean
  expect: {
    gold?: { code: string; name: string }[]
    acceptable?: { code: string; name: string }[]
    negative?: { code: string; name: string }[]
    key_info?: string
  }
  status: string // ok / warn / blocked
  entries: { gold: QualityCaseEntry[]; acceptable: QualityCaseEntry[]; negative: QualityCaseEntry[] }
}

export interface QualityCaseStats {
  total: number
  enabled: number
  answerable: number
  out_of_scope: number
  by_module: Record<string, number>
  by_risk: Record<string, number>
  /** 模块字母 → 语义名（单一事实源在后端 import_runner.MODULE_LABELS） */
  module_labels: Record<string, string>
  mapping: { ok: number; warn: number; blocked: number }
  db_ok: boolean | null
  db_error: string | null
}

export interface QualityCasesResponse {
  items: QualityCaseRow[]
  stats: QualityCaseStats
  paths: { testset: string; mapping: string }
}

export interface QualityHealth {
  db_ok: boolean | null
  db_error: string | null
  tokenhub: boolean
}

export interface QualityOverview {
  cases: QualityCaseStats
  health: QualityHealth
  latest: QualityRunMeta | null
  delta: QualityDelta | null
  recent: QualityRunMeta[]
  thresholds: QualityThresholds
  paths: { testset: string; mapping: string }
  running: { run_id: string; scope_label: string; done: number; total: number; current: string | null } | null
}

export interface QualityProgress {
  run_id: string
  status: string
  live: boolean
  done: number | null
  total: number | null
  current: string | null
  elapsed_ms: number | null
  recent: { case_id: string; verdict: string; attribution: string | null; ms: number | null }[]
}

export interface QualityCaseResult {
  case_id: string
  module: string | null
  risk: string | null
  question: string | null
  verdict: string // hit / miss / out_of_scope
  attribution: string | null // ranked / coverage / excluded / map_stale
  first_hit_rank: number | null
  top1_score: number | null
  expected: {
    gold?: QualityChunkState[]
    acceptable?: QualityChunkState[]
    negative?: QualityChunkState[]
  }
  topk: { rank: number; kb_id: string; title: string; score: number; tier: string }[]
  best_rank: string | null
  harmful: { rank: number; kb_id: string; title: string }[]
  ms: number | null
}

export interface QualityRunDetail extends QualityRunMeta {
  cases: QualityCaseResult[]
}

export interface QualityImportReport {
  ok: boolean
  /** 行级校验错误（Excel 通道；有错时报告仍返回，但**不会写入**） */
  errors?: string[]
  dry_run: boolean
  testset: {
    path: string
    parsed: number
    answerable: number
    out_of_scope: number
    by_module: Record<string, number>
  }
  mapping: { path: string; format: string; entries: number; chunks: number }
  resolved_chunks: number
  tier_overlap: number
  used_entries: number
  unmapped_entries: string[]
  health: {
    db_ok: boolean
    db_error: string | null
    ok: number
    warn: number
    blocked: number
    blocked_cases: string[]
  }
  diff: { new: number; updated: number; unchanged: number; existing: number; removed_from_file: string[] }
  warnings: string[]
  written: boolean
}

/* ── API ─────────────────────────────────────────────────────────── */

const post = <T>(path: string, payload?: unknown) =>
  req<T>(path, { method: 'POST', body: JSON.stringify(payload ?? {}) })

/**
 * 触发浏览器下载（服务端按附件返回，文件名优先取 `Content-Disposition` 的 UTF-8 名）。
 * 不走 `req()`：它的 JSON 解析对二进制响应不适用。
 */
async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const r = await fetch(path)
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { detail?: string }
    throw new Error(b.detail || `HTTP ${r.status}`)
  }
  const cd = r.headers.get('Content-Disposition') || ''
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  const name = m ? decodeURIComponent(m[1]) : fallbackName
  const blob = await r.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const todayTag = () => new Date().toISOString().slice(0, 10).replace(/-/g, '')

export const qualityApi = {
  overview: () => req<QualityOverview>('/api/quality/overview'),
  cases: () => req<QualityCasesResponse>('/api/quality/cases'),
  updateCase: (caseId: string, body: { enabled?: boolean; note?: string | null }) =>
    req<{ ok: boolean }>(`/api/quality/cases/${encodeURIComponent(caseId)}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),
  importDataset: (body: { testset_path?: string; mapping_path?: string; dry_run: boolean }) =>
    post<QualityImportReport>('/api/quality/import', body),

  /* ── Excel 通道（模板 / 导出 / 上传导入）── */
  /** 下载 Excel 模板（固定格式：测试集 / 映射表 / 说明三表） */
  downloadTemplate: () => downloadFile('/api/quality/cases/template.xlsx', '用例集-Excel模板.xlsx'),
  /** 导出当前用例集（同格式；维护后可直接再导入） */
  exportCases: () => downloadFile('/api/quality/cases/export.xlsx', `用例集-导出-${todayTag()}.xlsx`),
  /**
   * Excel 导入（两步式）。请求体 = 文件原始字节（对齐「上传新文档」的 raw body 惯例）。
   * `dryRun=true` 只解析 + 体检、不写入；确认后同文件再发一次 `dryRun=false`。
   */
  importExcel: (file: File, dryRun: boolean) =>
    req<QualityImportReport>(
      `/api/quality/import-excel?${new URLSearchParams({ filename: file.name, dry: dryRun ? '1' : '0' }).toString()}`,
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file },
    ),
  start: (scope: string) =>
    post<{ run_id: string; scope: string; scope_label: string; case_count: number }>('/api/quality/runs', { scope }),
  listRuns: (limit = 100) => req<{ items: QualityRunMeta[] }>(`/api/quality/runs?limit=${limit}`),
  runDetail: (runId: string) => req<QualityRunDetail>(`/api/quality/runs/${encodeURIComponent(runId)}`),
  progress: (runId: string) => req<QualityProgress>(`/api/quality/runs/${encodeURIComponent(runId)}/progress`),
  cancel: (runId: string) => post<{ ok: boolean }>(`/api/quality/runs/${encodeURIComponent(runId)}/cancel`),
  caseToGap: (runId: string, caseId: string) =>
    post<{ ok: boolean }>(
      `/api/quality/runs/${encodeURIComponent(runId)}/cases/${encodeURIComponent(caseId)}/to-gap`,
    ),
}

/* ── 展示辅助 ────────────────────────────────────────────────────── */

export const RUN_STATUS_LABEL: Record<string, string> = {
  running: '运行中',
  completed: '已完成',
  failed: '已失败',
  cancelled: '已中止',
}

export function statusPillKind(status: string): string {
  return status === 'completed' ? 'ok'
    : status === 'failed' ? 'danger'
      : status === 'running' ? 'warn'
        : 'plain'
}

/** 结论徽标：达标 / 未达标 / 未判定 */
export function verdictPill(run: QualityRunMeta | QualityRunDetail): { kind: string; text: string } {
  if (run.status === 'cancelled') return { kind: 'plain', text: '已中止' }
  if (run.status === 'failed') return { kind: 'danger', text: '已失败' }
  if (run.status === 'running') return { kind: 'warn', text: '运行中' }
  if (run.passed === true) return { kind: 'ok', text: '达标' }
  if (run.passed === false) return { kind: 'danger', text: '未达标' }
  return { kind: 'plain', text: '未判定' }
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return s % 60 === 0 ? `${m}m` : `${m}m${String(s % 60).padStart(2, '0')}s`
}

export function pct(v: number | null | undefined, digits = 1): string {
  return v == null ? '—' : `${(v * 100).toFixed(digits)}%`
}

export const VERDICT_LABEL: Record<string, string> = {
  hit: '命中',
  miss: '未命中',
  out_of_scope: '负样本',
}

export const ATTR_LABEL: Record<string, string> = {
  ranked: '排序问题',
  coverage: '覆盖缺口',
  excluded: '切片/排除',
  map_stale: '映射失效',
}

/** 归因 → 建议动作（与后端 `_suggest` / runner 的 evidence 口径一致） */
export const ATTR_ACTION: Record<string, string> = {
  ranked: '排查排序（关键词 / 权重 / 切块粒度），内容已在库',
  coverage: '补录相关语料（登记 → 六步 → 发布）',
  excluded: '到「已屏蔽内容」恢复该块',
  map_stale: '重新导入映射或重映射',
}

export const RISK_LABEL: Record<string, string> = {
  low: '低',
  caution: '注意',
  emergency: '高危',
}

/** 模块显示名：以后端下发的 `stats.module_labels` 为准（单一事实源在后端），
 *  未登记的新模块兜底显示原字母（不吞信息、不制造空串）。 */
export function moduleLabel(stats: QualityCaseStats | null | undefined, module: string): string {
  return stats?.module_labels?.[module] || module
}

/** 三态标注短名（用例「标注」列 / 结果 tier 徽标；完整口径见页头 hint 的三态说明）。 */
export const TIER_LABEL: Record<string, string> = {
  gold: '必命中',
  acceptable: '可接受',
  negative: '有害',
}

export const CASE_STATUS_LABEL: Record<string, string> = {
  ok: '正常',
  warn: '部分失效',
  blocked: '全部失效',
}

export const ENTRY_STATUS_LABEL: Record<string, string> = {
  ok: '正常',
  partial: '部分失效',
  stale: '全部失效',
  unmapped: '无映射',
}

export const CHUNK_STATE_LABEL: Record<string, string> = {
  enabled: '可检索',
  excluded: '被排除',
  missing: '已失效',
  unknown: '未知',
}

export function caseStatusPill(status: string): string {
  return status === 'ok' ? 'ok' : status === 'warn' ? 'warn' : 'danger'
}

/** 未命中归因的兜底说明（evidence 不在逐题结果里落库，展示层按归因+位次拼） */
export function attributionHint(c: QualityCaseResult): string {
  if (c.verdict === 'out_of_scope') return `负样本：仅记录 top1 相关度（${c.top1_score ?? '—'}），不判定`
  if (c.verdict !== 'miss') return ''
  const attr = c.attribution || ''
  if (attr === 'ranked') return `gold 块最佳位次 ${c.best_rank}（差一点进榜）`
  if (attr === 'coverage') return 'gold 块在库可检索，但未进诊断深度'
  if (attr === 'excluded') return 'gold 块存在但被排除检索'
  if (attr === 'map_stale') return 'gold 块已不存在（需重映射）'
  return '未知'
}
