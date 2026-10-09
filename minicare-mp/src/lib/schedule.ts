/**
 * 日程表前端展示配置（PRD-009）
 *
 * ⚠️ 状态（六态）的**推导口径在服务端**（`schedule.service.ts`），前端只负责渲染。
 * 这里只放「状态 → 文案 / 样式」这类纯展示映射，不得在此处推断状态。
 *
 * ⚠️ 日程项类型清单（有哪些类型 / 叫什么 / 分哪组 / 默认提前量）**不在前端维护** ——
 * 由 `GET /api/config` 的 `scheduleItemTypes` 下发，权威源是服务端
 * `minicare-server/src/schedule/schedule-item-type.meta.ts`（新增类型只改服务端）。
 * 本文件只保留两类前端专属信息：
 *   ① `SCHEDULE_ITEM_TYPE_RECORD`：类型 → 记录页跳转（页面路径服务端不该知道）；
 *   ② 判定窗口/准备时长的**兜底镜像值**（仅在 config 未加载时用于本地预校验，服务端仍会兜底）。
 */
import type { ScheduleItemType, ScheduleItemStatus } from '@/api'

/**
 * 同类项最小间隔（分钟）= 提前 60 + 宽限 90。
 *
 * ⚠️ 必须与服务端 `schedule.constants.ts` 的 `SCHEDULE_MIN_GAP_MINUTES` 保持一致：
 * 该值与判定窗口是同一个整体（窗口 60/90 → 同类项间隔 ≥150），改一个必须同步改另一个。
 * 前端仅用于保存前的本地预校验，服务端仍会兜底。
 */
export const SCHEDULE_MIN_GAP_MINUTES = 150

/** 提前准备时长快捷选项 */
export const SCHEDULE_PREPARE_OFFSET_OPTIONS = [30, 60, 90, 120, 150, 180, 240]

/** 打开"提前准备"开关时，未取到默认提前量时的兜底值（分钟） */
export const SCHEDULE_PREPARE_OFFSET_FALLBACK_MIN = 30

// ── 类型声明（由 /api/config 下发）────────────────────────────

/** 单个日程项类型（服务端 `schedule-item-type.meta.ts` 的可下发子集） */
export interface ScheduleItemTypeOption {
  type: ScheduleItemType
  label: string
  group: string
  /** 是否参与自动判定与进度分母 */
  judgable: boolean
  /** 默认准备提前量（分钟）；null = 默认不带准备节点 */
  defaultPrepareOffsetMin: number | null
}

/** `/api/config` 的 `scheduleItemTypes` 字段 */
export interface ScheduleItemTypeConfig {
  groups: { key: string; label: string }[]
  items: ScheduleItemTypeOption[]
}

/** 分组后的类型选项（页面按此渲染） */
export interface ScheduleItemTypeGroupView {
  key: string
  label: string
  options: ScheduleItemTypeOption[]
}

export interface ScheduleTypeIndex {
  /** 类型 → 声明（用于取默认名与默认提前量） */
  byType: Map<ScheduleItemType, ScheduleItemTypeOption>
  /** 分组视图（顺序取自服务端 groups，组内顺序取自服务端 items） */
  groups: ScheduleItemTypeGroupView[]
}

/**
 * 把下发的类型声明整理成查询表 + 分组视图。
 * 缺字段/未加载时返回空表，页面据此显示"类型列表未加载"，**不回退到前端硬编码清单**。
 */
export function buildScheduleTypeIndex(payload?: ScheduleItemTypeConfig | null): ScheduleTypeIndex {
  const byType = new Map<ScheduleItemType, ScheduleItemTypeOption>()
  if (!payload || !Array.isArray(payload.items)) return { byType, groups: [] }

  for (const item of payload.items) {
    if (item && item.type) byType.set(item.type, item)
  }

  const groups: ScheduleItemTypeGroupView[] = []
  for (const group of payload.groups ?? []) {
    const options = payload.items.filter((item) => item.group === group.key)
    if (options.length > 0) groups.push({ key: group.key, label: group.label, options })
  }
  // 兜底：若服务端未下发 groups（旧版本 config 缓存），按分组字段自行归并
  if (groups.length === 0) {
    const fallbackOrder: string[] = []
    for (const item of payload.items) {
      const key = item.group ?? 'other'
      if (!fallbackOrder.includes(key)) fallbackOrder.push(key)
    }
    for (const key of fallbackOrder) {
      groups.push({
        key,
        label: key,
        options: payload.items.filter((item) => (item.group ?? 'other') === key),
      })
    }
  }

  return { byType, groups }
}

// ── 记录页跳转（前端专属映射）────────────────────────────────

export interface ScheduleRecordTarget {
  /** MP 页面路径；空串 = 无对应记录页（不跳转） */
  path: string
  /** 基础查询串（不含 '?'）；feeding 用 tab 选档，activity 用 initType 预选活动类型 */
  query?: string
}

/**
 * 类型 → 记录页。
 * ⚠️ 新增类型时若该类型有对应记录页，需在此登记；否则"去记录"按钮对该类型无效。
 * （类型清单本身仍由 config 下发，此表只回答"点了去哪"。）
 */
export const SCHEDULE_ITEM_TYPE_RECORD: Record<ScheduleItemType, ScheduleRecordTarget> = {
  feeding_formula: { path: '/pages/records/feeding/index', query: 'tab=formula' },
  feeding_breast: { path: '/pages/records/feeding/index', query: 'tab=breast' },
  feeding_food: { path: '/pages/records/feeding/index', query: 'tab=food' },
  feeding_supplement: { path: '/pages/records/feeding/index', query: 'tab=supplement' },

  sleep: { path: '/pages/records/sleep/index' },
  diaper: { path: '/pages/records/diaper/index' },
  medication: { path: '/pages/records/medication/index' },

  activity_outdoor: { path: '/pages/records/activity/index', query: 'initType=outdoor' },
  activity_bath: { path: '/pages/records/activity/index', query: 'initType=bath' },
  activity_gross_motor: { path: '/pages/records/activity/index', query: 'initType=gross_motor' },
  activity_fine_motor: { path: '/pages/records/activity/index', query: 'initType=fine_motor' },
  activity_edu_play: { path: '/pages/records/activity/index', query: 'initType=edu_play' },
  activity_daily_care: { path: '/pages/records/activity/index', query: 'initType=daily_care' },

  other: { path: '' },
}

/** 拼接"去记录"页面的完整 URL（自动处理查询串连接） */
export function buildRecordUrl(target: ScheduleRecordTarget, extra: string[] = []): string {
  if (!target.path) return ''
  const parts = [target.query ?? '', ...extra].filter(Boolean)
  return `${target.path}${parts.length ? `?${parts.join('&')}` : ''}`
}

// ── 状态展示 ─────────────────────────────────────────────────

/** 六态展示元信息 */
export interface ScheduleStatusMeta {
  label: string
  /** 语义色（文字 / 强调） */
  color: string
  /** 背景色（浅底） */
  bg: string
}

export const SCHEDULE_STATUS_META: Record<ScheduleItemStatus, ScheduleStatusMeta> = {
  upcoming: { label: '待开始', color: '#8A8FA8', bg: '#F2F3F7' },
  preparing: { label: '准备中', color: '#D4870A', bg: '#FFF7E6' },
  doing: { label: '执行中', color: '#2E7BD4', bg: '#EAF3FF' },
  done: { label: '已完成', color: '#2A9E70', bg: '#E4F8F0' },
  missed: { label: '已错过', color: '#D4483A', bg: '#FDECE9' },
  disabled: { label: '已停用', color: '#9AA0AE', bg: '#F2F3F7' },
}

/** 状态排序权重（列表内稳定的展示顺序：进行中 → 待开始 → 已完成 → 已错过） */
export const SCHEDULE_STATUS_ORDER: Record<ScheduleItemStatus, number> = {
  doing: 0,
  preparing: 1,
  upcoming: 2,
  done: 3,
  missed: 4,
  disabled: 5,
}
