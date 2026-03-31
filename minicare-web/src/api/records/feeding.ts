/**
 * 饮食记录 API
 * 路由：/api/family/:familyId/records/feeding
 *
 * 字段说明：
 *   feed_type: 'breast'（母乳）| 'formula'（奶粉）| 'complementary'（辅食）| 'supplement'（营养素）
 *   record_time: ISO 8601 时间戳
 *   breast_side: 母乳时使用，'left' | 'right' | 'both'
 *   duration_min: 母乳哺乳时长（分钟）
 *   formula_ml: 奶粉喂养量（毫升）
 *   complementary_food: 辅食名称（多项逗号分隔）
 */
import { request } from '../http'
import type { FeedingRecord, CreateFeedingDto, PaginationParams, ListResult } from '../types'

export const feedingApi = {
  /** 获取饮食记录列表 */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {}
  ): Promise<ListResult<FeedingRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<FeedingRecord>>(
      `/api/family/${familyId}/records/feeding?baby_id=${babyId}&limit=${limit}&offset=${offset}`
    )
  },

  /** 创建饮食记录 */
  create: (familyId: string, data: CreateFeedingDto): Promise<FeedingRecord> =>
    request<FeedingRecord>(`/api/family/${familyId}/records/feeding`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** 删除饮食记录 */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/feeding/${id}`, {
      method: 'DELETE',
    }),
}
