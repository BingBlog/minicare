/**
 * 活动记录 API
 * 路由：/api/family/:familyId/records/activity
 *
 * 字段说明：
 *   activity_type: 活动类型（DDL: 1=bath 2=outdoor 3=play 4=tummy_time 5=other）
 *   record_time:   ISO 8601 时间戳
 *   duration_min:  活动时长（分钟）
 *   intensity:     活动强度（easy/medium/active）
 *   note:          附加备注（可选）
 */
import { request } from '../http'
import type { ActivityRecord, CreateActivityDto, UpdateActivityDto, PaginationParams, ListResult } from '../types'

export const activityApi = {
  /**
   * 获取活动记录列表（按 record_time 倒序）
   */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {},
  ): Promise<ListResult<ActivityRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<ActivityRecord>>(
      `/api/family/${familyId}/records/activity?baby_id=${babyId}&limit=${limit}&offset=${offset}`,
    ).then((items) => items.map((r) => ({ ...r, type: 'activity' })))
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