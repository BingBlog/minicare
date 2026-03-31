/**
 * 生长记录 API
 * 路由：/api/family/:familyId/records/growth
 *
 * 字段说明：
 *   record_date: YYYY-MM-DD（同一天唯一索引 uk_growth_baby_date）
 *   height_mm:   身高，毫米整数（前端 cm × 10 后传入）
 *   weight_g:    体重，克整数（前端 kg × 1000 后传入）
 *   head_mm:     头围，毫米整数（前端 cm × 10 后传入）
 *   note:        测量机构等附加备注
 *
 * 注意：同一天只允许一条记录，重复提交将报错。
 */
import { request } from '../http'
import type { GrowthRecord, CreateGrowthDto, PaginationParams, ListResult } from '../types'

export const growthApi = {
  /** 获取生长记录列表 */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {}
  ): Promise<ListResult<GrowthRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<GrowthRecord>>(
      `/api/family/${familyId}/records/growth?baby_id=${babyId}&limit=${limit}&offset=${offset}`
    )
  },

  /** 创建生长记录（同一天只可记录一次） */
  create: (familyId: string, data: CreateGrowthDto): Promise<GrowthRecord> =>
    request<GrowthRecord>(`/api/family/${familyId}/records/growth`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** 删除生长记录 */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/growth/${id}`, {
      method: 'DELETE',
    }),
}
