/**
 * 健康记录 API
 * 路由：/api/family/:familyId/records/health
 *
 * 字段说明：
 *   record_time:  ISO 8601 时间戳
 *   temperature:  体温（℃，如 37.5），可选，范围 35～42
 *   note:         过敏表现、用药、护理等附加信息
 */
import { request } from '../http'
import type { HealthRecord, CreateHealthDto, PaginationParams, ListResult } from '../types'

export const healthApi = {
  /** 获取健康记录列表 */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {}
  ): Promise<ListResult<HealthRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<HealthRecord>>(
      `/api/family/${familyId}/records/health?baby_id=${babyId}&limit=${limit}&offset=${offset}`
    )
  },

  /** 创建健康记录 */
  create: (familyId: string, data: CreateHealthDto): Promise<HealthRecord> =>
    request<HealthRecord>(`/api/family/${familyId}/records/health`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** 删除健康记录 */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/health/${id}`, {
      method: 'DELETE',
    }),
}
