/**
 * 尿布记录 API
 * 路由：/api/family/:familyId/records/diaper
 *
 * 字段说明：
 *   diaper_type: 'wet'（湿尿布）| 'dirty'（大便）| 'mixed'（都有）| 'dry'（未换）
 *   record_time: ISO 8601 时间戳
 *   color:       大便颜色（逗号分隔，如 'yellow,green'）
 *   note:        性状、次数等附加备注
 */
import { request } from '../http'
import type { DiaperRecord, CreateDiaperDto, PaginationParams, ListResult } from '../types'

export const diaperApi = {
  /** 获取尿布记录列表 */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {}
  ): Promise<ListResult<DiaperRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<DiaperRecord>>(
      `/api/family/${familyId}/records/diaper?baby_id=${babyId}&limit=${limit}&offset=${offset}`
    )
  },

  /** 创建尿布记录 */
  create: (familyId: string, data: CreateDiaperDto): Promise<DiaperRecord> =>
    request<DiaperRecord>(`/api/family/${familyId}/records/diaper`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** 删除尿布记录 */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/diaper/${id}`, {
      method: 'DELETE',
    }),
}
