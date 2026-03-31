/**
 * 活动记录 API
 * 路由：/api/family/:familyId/records/activity
 *
 * 字段说明：
 *   activity_type: 活动类型（DDL: 1=bath 2=outdoor 3=play 4=tummy_time 5=other）
 *   record_time:   ISO 8601 时间戳
 *   duration_min:  活动时长（分钟）
 *   note:          活动强度等附加信息
 */
import { request } from '../http'
import type { ActivityRecord, CreateActivityDto, PaginationParams, ListResult } from '../types'

export const activityApi = {
  /**
   * 获取活动记录列表（按 record_time 倒序）
   *
   * @example 响应体
   * [
   *   {
   *     "id": "ar1ar2ar3-...",
   *     "baby_id": "b1b2b3b4-...",
   *     "recorded_by": "u1u2u3u4-...",
   *     "activity_type": "bath",
   *     "record_time": "2026-04-01T19:00:00.000Z",
   *     "duration_min": 20,
   *     "note": null,
   *     "created_at": "2026-04-01T19:00:05.000Z"
   *   },
   *   {
   *     "id": "ar4ar5ar6-...",
   *     "baby_id": "b1b2b3b4-...",
   *     "recorded_by": "u1u2u3u4-...",
   *     "activity_type": "tummy_time",
   *     "record_time": "2026-04-01T10:00:00.000Z",
   *     "duration_min": 10,
   *     "note": "用了辅助枕",
   *     "created_at": "2026-04-01T10:00:05.000Z"
   *   }
   * ]
   */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {},
  ): Promise<ListResult<ActivityRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<ActivityRecord>>(
      `/api/family/${familyId}/records/activity?baby_id=${babyId}&limit=${limit}&offset=${offset}`,
    )
  },

  /**
   * 创建活动记录
   *
   * @example 请求体（洗澡）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "activity_type": "bath",
   *   "record_time": "2026-04-01T19:00:00.000Z",
   *   "duration_min": 20
   * }
   *
   * @example 请求体（俯趴训练）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "activity_type": "tummy_time",
   *   "record_time": "2026-04-01T10:00:00.000Z",
   *   "duration_min": 10,
   *   "note": "用了辅助枕"
   * }
   *
   * @example 响应体
   * { "id": "ar1ar2ar3-..." }
   */
  create: (familyId: string, data: CreateActivityDto): Promise<ActivityRecord> =>
    request<ActivityRecord>(`/api/family/${familyId}/records/activity`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 删除活动记录
   *
   * @example 响应体
   * { "id": "ar1ar2ar3-..." }
   */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/activity/${id}`, {
      method: 'DELETE',
    }),
}
