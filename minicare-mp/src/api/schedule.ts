/**
 * 宝宝日程表 API（PRD-009）
 *
 * 契约要点：
 * - 模板项字段为 camelCase（itemType / executeTime / prepareTime / prepareOffsetMin）
 * - 今日状态由服务端实时派生，前端**不得**自行推断闸门/完成状态（六态只有一份推导口径）
 * - 后端无全局响应包裹层，`request<T>()` 直接返回业务体
 */
import { request } from './http'

/**
 * 日程项类型（对齐服务端 ScheduleItemType）
 *
 * ⚠️ 权威清单在服务端 `schedule-item-type.meta.ts`，经 `GET /api/config` 的
 *    `scheduleItemTypes` 下发（页面用它渲染类型选择区）。此处的 union 只为类型收窄，
 *    新增类型时两边需一起补 —— 服务端漏了会被这里挡下，前端漏了会编译报错。
 */
export type ScheduleItemType =
  // 喂食
  | 'feeding_formula'
  | 'feeding_breast'
  | 'feeding_food'
  | 'feeding_supplement'
  // 作息
  | 'sleep'
  | 'diaper'
  | 'medication'
  // 活动
  | 'activity_outdoor'
  | 'activity_bath'
  | 'activity_gross_motor'
  | 'activity_fine_motor'
  | 'activity_edu_play'
  | 'activity_daily_care'
  // 其他（不判定）
  | 'other'

/** 日程项派生状态（六态，PRD-009 §1.3.2） */
export type ScheduleItemStatus =
  | 'upcoming'  // 待开始
  | 'preparing' // 准备中（仅带准备节点的项）
  | 'doing'     // 执行中
  | 'done'      // 已完成
  | 'missed'    // 已错过
  | 'disabled'  // 停用

/** 关联记录摘要（仅 done 态有值） */
export interface ScheduleMatchedRecord {
  id: string
  type: string
  recordTime: string
  summary: string
}

/** 日程项 */
export interface ScheduleItem {
  /** 库中项的 id；默认模板未落库时为空串 */
  id: string
  itemType: ScheduleItemType
  title: string
  /** 'HH:mm' */
  executeTime: string
  /** 'HH:mm' | null */
  prepareTime: string | null
  prepareOffsetMin: number | null
  enabled: boolean
  /** 展示顺序（0..n-1，用户拖拽决定）；数组本身已按此排序 */
  sortOrder: number
  note: string | null
  /** 仅 getToday 返回 */
  status?: ScheduleItemStatus
  /** 仅 getToday 返回 */
  matchedRecord?: ScheduleMatchedRecord | null
}

export interface ScheduleTemplateResponse {
  items: ScheduleItem[]
  /** true = 系统默认模板（库中尚无模板，未落库） */
  isDefault: boolean
}

export interface ScheduleTodayResponse {
  items: ScheduleItem[]
  progress: { done: number; total: number }
}

/**
 * 保存模板时提交的单项。
 *
 * ⚠️ 无 `sort_order` 字段：**提交数组顺序即展示顺序**，服务端按下标整体重写
 * `sort_order`（0..n-1）。拖拽后直接按新顺序提交即可。
 */
export interface SaveScheduleItemDto {
  /** 已有项回传 id；新增项留空 */
  id?: string
  item_type: ScheduleItemType
  title?: string
  execute_time: string
  prepare_time?: string | null
  prepare_offset_min?: number | null
  enabled?: boolean
  note?: string | null
}

export interface SaveScheduleTemplateDto {
  items: SaveScheduleItemDto[]
}

function babyQuery(babyId: string): string {
  return `baby_id=${encodeURIComponent(babyId)}`
}

export const scheduleApi = {
  /** 取作息计划模板（US-01） */
  getTemplate: (familyId: string, babyId: string): Promise<ScheduleTemplateResponse> =>
    request<ScheduleTemplateResponse>(
      `/api/family/${familyId}/schedule/template?${babyQuery(babyId)}`,
    ),

  /** 全量保存模板（US-02）——差集语义：未提交的已有项会被软删除 */
  saveTemplate: (
    familyId: string,
    babyId: string,
    data: SaveScheduleTemplateDto,
  ): Promise<ScheduleTemplateResponse> =>
    request<ScheduleTemplateResponse>(
      `/api/family/${familyId}/schedule/template?${babyQuery(babyId)}`,
      { method: 'PUT', data },
    ),

  /** 今日日程（US-05）——状态实时派生，不落库 */
  getToday: (familyId: string, babyId: string): Promise<ScheduleTodayResponse> =>
    request<ScheduleTodayResponse>(
      `/api/family/${familyId}/schedule/today?${babyQuery(babyId)}`,
    ),
}
