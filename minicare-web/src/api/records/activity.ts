/**
 * 活动记录 API
 * 路由：/api/family/:familyId/records/activity
 *
 * 字段说明：
 *   activity_type: 活动类型（DDL: VARCHAR(20)—gross_motor/fine_motor/edu_play/outdoor/daily_care/other）
 *   record_time:   ISO 8601 时间戳
 *   duration_min:  活动时长（分钟）
 *   intensity:     活动强度（easy/medium/active）
 *   note:          附加备注（可选）
 */
import { request } from '../http'
import type { ActivityRecord, CreateActivityDto, UpdateActivityDto } from '../types'

export interface ActivityListParams {
  before_date?: string
}

export interface ActivityListResponse {
  items: ActivityRecord[]
  nextBeforeDate: string | null
}

function buildListQuery(babyId: string, params?: ActivityListParams): string {
  const q: string[] = [`baby_id=${babyId}`]
  if (params?.before_date) q.push(`before_date=${encodeURIComponent(params.before_date)}`)
  return q.join('&')
}

export const activityApi = {
  list: (familyId: string, babyId: string, params?: ActivityListParams): Promise<ActivityListResponse> => {
    return request<ActivityListResponse>(`/api/family/${familyId}/records/activity?${buildListQuery(babyId, params)}`)
      .then((res) => ({
        items: res.items.map((r) => ({ ...r, type: 'activity' })),
        nextBeforeDate: res.nextBeforeDate,
      }))
  },

  /**
   * 创建活动记录
   *
   * @example 请求体（俯趴训练，带强度）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "activity_type": "tummy_time",
   *   "record_time": "2026-04-01T10:00:00.000Z",
   *   "duration_min": 10,
   *   "intensity": "easy"
   * }
   *
   * @example 响应体
   * { "id": "ar1ar2ar3-..." }
   */
  create: (familyId: string, data: CreateActivityDto): Promise<{ id: string }> =>
    request<{ id: string }>(`/api/family/${familyId}/records/activity`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 获取单条活动记录（编辑前重新查询，确保数据最新）
   */
  getOne: (familyId: string, id: string): Promise<ActivityRecord> =>
    request<ActivityRecord>(`/api/family/${familyId}/records/activity/${id}`),

  /**
   * 更新活动记录（PATCH 局部更新）
   */
  update: (familyId: string, id: string, data: UpdateActivityDto): Promise<ActivityRecord> =>
    request<ActivityRecord>(`/api/family/${familyId}/records/activity/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * 删除活动记录
   */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/activity/${id}`, {
      method: 'DELETE',
    }),
}