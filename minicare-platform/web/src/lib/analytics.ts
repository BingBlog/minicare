/**
 * 用户分析域（PRD-016 / TECH-033）的前端契约层。
 *
 * 与平台其它域的一点关键差别：**后端所有响应都是同一种信封**
 * （`{data, meta, error}`，成败皆然），所以这里不抛错，而是把信封原样交回页面，
 * 由页面决定"横幅怎么写、卡片显示 `—` 还是数字"。
 *
 * 为什么这么做：本域最危险的展示事故不是"报错"，而是**把算不出来的指标画成 0**
 * （历史踩坑：库连不上 → 页面一片 0 → 被读成"没人用"）。
 * `null → —` 这条规则因此是本文件的头等约束，且集中在 `fmtInt / fmtPct / fmtRatio` 里实现。
 */
import { req } from './api'

/* ── 信封 ─────────────────────────────────────────────────────────────────── */

export type DataSource = 'prod' | 'dev' | 'custom'

export interface ExcludedInfo {
  users: number
  families: number
  patterns: number
  fingerprint: string
  warning: string | null
}

export interface AnalyticsMeta {
  source: DataSource
  db_name: string
  metric_version: string
  window: string | null
  window_days: number | null
  computed_at: string | null
  cached: boolean
  excluded: ExcludedInfo | null
  partial: string[]
  db_name_warning: string | null
  small_sample_users?: number
  /** `/features` 回显当前视角 */
  view?: string
  /** `/users` 回显筛选条件 */
  segment?: string
  include_excluded?: boolean
  sort?: string
}

export interface AnalyticsError {
  code: string
  message: string
  hint: string
}

export interface Envelope<T> {
  data: T | null
  meta: AnalyticsMeta
  error: AnalyticsError | null
}

export const EMPTY_META: AnalyticsMeta = {
  source: 'custom',
  db_name: '',
  metric_version: '',
  window: null,
  window_days: null,
  computed_at: null,
  cached: false,
  excluded: null,
  partial: [],
  db_name_warning: null,
}

/**
 * 分析域的取数入口：**永不 reject**，一律返回信封。
 *
 * 覆盖三种失败：
 *   · 后端降级（503）→ 已经是信封，直接透传；
 *   · FastAPI 的 `HTTPException`（422 参数错 / 404 用户不存在）→ `{detail}`，包成信封；
 *   · 网络层失败（后端没起）→ `network_error`。
 */
export async function areq<T>(path: string, opts?: RequestInit): Promise<Envelope<T>> {
  try {
    const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts })
    const body: unknown = await r.json().catch(() => null)

    // 后端信封（含 503 降级）
    if (body && typeof body === 'object' && 'meta' in body && 'error' in body) {
      return body as Envelope<T>
    }
    if (r.ok) {
      return { data: body as T, meta: { ...EMPTY_META }, error: null }
    }
    const detail = (body as { detail?: unknown } | null)?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : ((detail as { message?: string } | null)?.message ?? `HTTP ${r.status}`)
    return {
      data: null,
      meta: { ...EMPTY_META },
      error: { code: `http_${r.status}`, message, hint: '' },
    }
  } catch (e) {
    return {
      data: null,
      meta: { ...EMPTY_META },
      error: {
        code: 'network_error',
        message: (e as Error).message || '请求失败',
        hint: '无法访问平台后端（默认 127.0.0.1:8787）—— 确认服务已启动',
      },
    }
  }
}

/* ── 数据模型（与后端 `analytics/metrics.py` 的返回结构一一对应）──────────── */

/** 卡片：当前值 + 本窗新增 + 上一窗新增（用于环比） */
export interface CardValue {
  value: number
  new_cur: number
  new_prev: number
  note: string
}

export interface WeekPoint {
  week: string
  start: string
  n: number
}

export interface OverviewData {
  cards: {
    users: CardValue
    users_verified: number
    families: CardValue
    babies: CardValue
    records: CardValue
  }
  series: { days: number; users: WeekPoint[]; records: WeekPoint[] }
  scope_note: string
}

export interface DayPoint {
  date: string
  n: number
  ma7?: number
}

export interface ActivityData {
  dau: number
  wau: number
  mau: number
  /** 黏性 = DAU / MAU；小样本下为 null */
  sticky: number | null
  small_sample: boolean
  total_users: number
  active_babies: number | null
  active_families: number | null
  series: DayPoint[]
  /** 活跃家庭日序列（来源 = `record_timeline` × `baby_profile`，与 `active_families` 同口径） */
  families_series: DayPoint[]
  scope_note: string
  /** 活跃家庭口径说明（与用户口径的差距是口径差异，不是漏算） */
  families_note?: string
}

export interface FeatureItem {
  key: string
  label: string
  records: number
  /** 使用人数；count_only 功能为 null（无用户维度） */
  users: number | null
  per_user: number | null
  penetration: number | null
  share: number | null
  count_only: boolean
}

export interface FeaturesData {
  window: string
  window_days: number
  active_users: number
  total_records: number
  items: FeatureItem[]
  /** 当前数据源没有对应表、无法统计的功能 */
  unavailable: { key: string; label: string; reason: string }[]
  missing_tables: string[]
  blind_spots: { name: string; reason: string }[]
}

export type FeatureView = 'count' | 'penetration' | 'per_user'

export const VIEW_LABEL: Record<FeatureView, string> = {
  count: '条数',
  penetration: '渗透率',
  per_user: '人均条数',
}

export const VIEW_HINT: Record<FeatureView, string> = {
  count: '该功能在此期间被记录的总条数',
  penetration: '使用过该功能的人数 ÷ 同期活跃人数',
  per_user: '总条数 ÷ 使用人数（用得有多重）',
}

export interface FeatureTrendData {
  key: string
  label: string
  series: { date: string; n: number; users: number }[]
}

export type Segment = 'all' | 'core' | 'active' | 'dormant' | 'lost'

export const SEGMENT_LABEL: Record<Segment, string> = {
  all: '全部',
  core: '核心（7 天内）',
  active: '活跃（30 天内）',
  dormant: '沉睡（90 天内）',
  lost: '流失（更久 / 从未）',
}

/** 档位标签的短版（表格里用） */
export const SEGMENT_SHORT: Record<Segment, string> = {
  all: '全部',
  core: '核心',
  active: '活跃',
  dormant: '沉睡',
  lost: '流失',
}

/** 档位 → Pill 配色 */
export const SEGMENT_KIND: Record<Segment, string> = {
  all: 'plain',
  core: 'ok',
  active: 'accent',
  dormant: 'warn',
  lost: 'plain',
}

export interface AnalyticsUser {
  id: string
  nickname: string
  phone_masked: string
  created_at: string
  sms_verified: boolean
  families: number
  babies: number
  records_total: number
  records_window: number
  last_active: string | null
  segment: Segment
  excluded: boolean
}

export interface UsersData {
  items: AnalyticsUser[]
  total: number
}

export interface UserDetailData {
  id: string
  nickname: string
  phone_masked: string
  created_at: string
  sms_verified: boolean
  records_total: number
  last_active: string | null
  segment: Segment
  families: { id: string; name: string; created_at: string }[]
  babies: { id: string; name: string; birth_date: string; family_id: string }[]
  functions: { key: string; label: string; records: number }[]
  series: { date: string; n: number }[]
  window_days: number
}

export interface CohortRow {
  week: string
  start: string
  n: number
  d1: number
  d7: number
  d1_eligible: number
  d7_eligible: number
  d1_rate: number | null
  d7_rate: number | null
  small_sample: boolean
  d1_mature: boolean
  d7_mature: boolean
}

export interface RetentionData {
  cohorts: CohortRow[]
  returning: number
  scope_note: string
  min_sample: number
  today: string
}

export interface ReconcileRow {
  source_type: string
  label: string
  timeline: number
  business: number
  diff: number
  tables: string[]
  missing_tables: string[]
}

export interface HealthData {
  server: { db_name: string; server_version: string; server_time: string; expected_db: string; dsn: string }
  counts: { users: number; families: number; babies: number; timeline: number }
  reconcile: ReconcileRow[]
  reconcile_note: string
  tables: { total: number; missing: string[] }
  no_timeline_functions: { key: string; label: string }[]
  exclusions: ExcludedInfo & { pattern_hits: number }
  metric_version: string
  handler_ok: boolean
}

export interface ExclusionsData {
  users: string[]
  families: string[]
  nickname_patterns: string[]
  pattern_hits: string[]
  fingerprint: string
  warning: string | null
  candidates: { id: string; nickname: string; phone: string; created_at: string; reason: string }[]
  candidates_error: string | null
  file: string
  test_nickname_pattern: string
}

/* ── 取数 ─────────────────────────────────────────────────────────────────── */

export const WINDOWS = ['7d', '30d', '90d'] as const
export type WindowKey = (typeof WINDOWS)[number]

export const WINDOW_LABEL: Record<WindowKey, string> = { '7d': '近 7 天', '30d': '近 30 天', '90d': '近 90 天' }

const qs = (window: string, force?: boolean, extra?: Record<string, string | number>) => {
  const q = new URLSearchParams({ window })
  if (force) q.set('force', '1')
  for (const [k, v] of Object.entries(extra ?? {})) q.set(k, String(v))
  return q.toString()
}

export const analyticsApi = {
  health: () => areq<HealthData>('/api/analytics/health'),
  overview: (window: string, force = false) => areq<OverviewData>(`/api/analytics/overview?${qs(window, force)}`),
  activity: (window: string, force = false) => areq<ActivityData>(`/api/analytics/activity?${qs(window, force)}`),
  features: (window: string, view: FeatureView, force = false) =>
    areq<FeaturesData>(`/api/analytics/features?${qs(window, force, { view })}`),
  featureTrend: (key: string, window: string) =>
    areq<FeatureTrendData>(`/api/analytics/features/${encodeURIComponent(key)}?${qs(window)}`),
  users: (
    window: string,
    opts: { segment?: Segment; includeExcluded?: boolean; sort?: 'last_active' | 'records' } = {},
  ) =>
    areq<UsersData>(
      `/api/analytics/users?${qs(window, false, {
        segment: opts.segment ?? 'all',
        include_excluded: opts.includeExcluded ? 1 : 0,
        sort: opts.sort ?? 'last_active',
      })}`,
    ),
  userDetail: (id: string, window = '90d') =>
    areq<UserDetailData>(`/api/analytics/users/${encodeURIComponent(id)}?${qs(window)}`),
  retention: () => areq<RetentionData>('/api/analytics/retention'),
  exclusions: () => areq<ExclusionsData>('/api/analytics/exclusions'),
  mutateExclusion: (body: { action: 'add' | 'remove'; kind: 'user' | 'family' | 'pattern'; value: string; reason: string }) =>
    areq<Record<string, unknown>>('/api/analytics/exclusions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

/* ── 展示规则：`null` 一律是 `—`，不是 `0` ─────────────────────────────────── */

export const DASH = '—'

/** 整数。null / undefined → `—`（**不是 0**） */
export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return DASH
  return String(v)
}

/** 百分比（入参是 0~1 的比率）。null → `—` */
export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return DASH
  return `${(v * 100).toFixed(digits)}%`
}

/** 比率/倍数。null → `—` */
export function fmtRatio(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return DASH
  return v.toFixed(digits)
}

/** 环比：返回 {text, tone}。基线为 0 或缺失时给 `—`（不编造"暴涨"） */
export function fmtDelta(cur: number, prev: number): { text: string; tone: 'up' | 'down' | 'flat' } {
  const diff = cur - prev
  if (!prev) return { text: diff > 0 ? `新增 ${diff}` : DASH, tone: diff > 0 ? 'up' : 'flat' }
  const pct = (diff / prev) * 100
  if (diff === 0) return { text: '持平', tone: 'flat' }
  return {
    text: `${diff > 0 ? '+' : ''}${pct.toFixed(0)}%`,
    tone: diff > 0 ? 'up' : 'down',
  }
}

/** 时间戳裁剪到秒（`2026-10-12 20:51:03`） */
export function fmtTs(s: string | null | undefined): string {
  if (!s) return DASH
  return s.slice(0, 19).replace('T', ' ')
}

/** 只保留日期部分 */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return DASH
  return s.slice(0, 10)
}

/** 计算耗时（ms → 人话） */
export function fmtDur(ms: number | null | undefined): string {
  if (ms == null) return DASH
  if (ms < 1000) return `${ms}ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}s`
  return `${Math.floor(sec / 60)}m${String(Math.round(sec % 60)).padStart(2, '0')}s`
}

/** 口径说明（页面常驻，防止"这两个月数字怎么变了"） */
export const METRIC_NOTE =
  '活跃 = 当日产生过至少一条记录（时间取录入时刻）。只看不录的用户不计入，因此这里的活跃数是「活跃下限」。'

/** 数据源徽标文案 */
export const SOURCE_LABEL: Record<DataSource, string> = {
  prod: '生产库（真实用户数据）',
  dev: '开发库（含测试与镜像数据）',
  custom: '自定义库',
}

/** 排除名单为空时的提示 */
export const EXCLUSIONS_HINT =
  '默认不排除任何账号。若发现测试账号混入统计，请到「用户清单 → 排除名单」确认后再加入。'

/* 兼容：平台其它地方（如表单）偶尔用到的统一请求器 */
export { req }
