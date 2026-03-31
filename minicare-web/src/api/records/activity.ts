/**
 * 活动记录 API
 * 路由：/api/family/:familyId/records/activity
 *
 * 字段说明：
 *   activity_type: 'bath'（洗澡）| 'outdoor'（户外）| 'play'（运动）| 'tummy_time'（爬走）| 'other'
 *   record_time:   ISO 8601 时间戳
 *   duration_min:  活动时长（分钟）
 *   note:          活动强度等附加信息
 */
import { request } from '../http'
import type { ActivityRecord, CreateActivityDto, PaginationParams, ListResult } from '../types'

export const activityApi = {
  /** 获取活动记录列表 */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {}
  ): Promise<ListResult<ActivityRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<ActivityRecord>>(
      `/api/family/${familyId}/records/activity?baby_id=${babyId}&limit=${limit}&offset=${offset}`
    )
  },

  /** 创建活动记录 */
  create: (familyId: string, data: CreateActivityDto): Promise<ActivityRecord> =>
    request<ActivityRecord>(`/api/family/${familyId}/records/activity`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** 删除活动记录 */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/activity/${id}`, {
      method: 'DELETE',
    }),
}
