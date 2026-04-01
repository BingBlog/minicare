/**
 * 生长记录 API
 * 路由：/api/family/:familyId/records/growth
 *
 * 字段说明：
 *   record_date: YYYY-MM-DD（同一宝宝同一天唯一索引 uk_growth_baby_date）
 *   height_mm:   身高，毫米整数（前端 cm × 10 后传入），范围 300~1500
 *   weight_g:    体重，克整数（前端 kg × 1000 后传入），范围 500~30000
 *   head_mm:     头围，毫米整数（前端 cm × 10 后传入），范围 250~600
 *   note:        测量机构等附加备注
 *
 * 注意：同一天只允许一条记录，重复提交后端返回 409。
 */
import { request } from '../http'
import type { GrowthRecord, CreateGrowthDto, UpdateGrowthDto, PaginationParams, ListResult } from '../types'

export const growthApi = {
  /**
   * 获取生长记录列表（按 record_date 倒序，默认 limit=50）
   *
   * @example 响应体
   * [
   *   {
   *     "id": "gr1gr2gr3-...",
   *     "baby_id": "b1b2b3b4-...",
   *     "recorded_by": "u1u2u3u4-...",
   *     "record_date": "2026-04-01",
   *     "weight_g": 8200,
   *     "height_mm": 700,
   *     "head_mm": 440,
   *     "note": "儿科门诊测量",
   *     "created_at": "2026-04-01T10:00:05.000Z"
   *   },
   *   {
   *     "id": "gr4gr5gr6-...",
   *     "baby_id": "b1b2b3b4-...",
   *     "recorded_by": "u1u2u3u4-...",
   *     "record_date": "2026-03-01",
   *     "weight_g": 7800,
   *     "height_mm": 685,
   *     "head_mm": 435,
   *     "note": null,
   *     "created_at": "2026-03-01T09:00:05.000Z"
   *   }
   * ]
   */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {},
  ): Promise<ListResult<GrowthRecord>> => {
    const { limit = 50, offset = 0 } = params
    return request<ListResult<GrowthRecord>>(
      `/api/family/${familyId}/records/growth?baby_id=${babyId}&limit=${limit}&offset=${offset}`,
    ).then((items) => items.map((r) => ({ ...r, type: 'growth' as const })))
  },

  /**
   * 创建生长记录（同一天只可记录一次，重复返回 409）
   *
   * @example 请求体（三项全填）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "record_date": "2026-04-01",
   *   "weight_g": 8200,
   *   "height_mm": 700,
   *   "head_mm": 440,
   *   "note": "儿科门诊测量"
   * }
   *
   * @example 请求体（只填体重）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "record_date": "2026-04-01",
   *   "weight_g": 8200
   * }
   *
   * @example 响应体
   * { "id": "gr1gr2gr3-..." }
   */
  create: (familyId: string, data: CreateGrowthDto): Promise<GrowthRecord> =>
    request<GrowthRecord>(`/api/family/${familyId}/records/growth`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 获取单条生长记录（编辑前重新查询，确保数据最新）
   */
  getOne: (familyId: string, id: string): Promise<GrowthRecord> =>
    request<GrowthRecord>(`/api/family/${familyId}/records/growth/${id}`),

  /**
   * 更新生长记录（PATCH 局部更新）
   */
  update: (familyId: string, id: string, data: UpdateGrowthDto): Promise<GrowthRecord> =>
    request<GrowthRecord>(`/api/family/${familyId}/records/growth/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * 删除生长记录
   *
   * @example 响应体
   * { "id": "gr1gr2gr3-..." }
   */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/growth/${id}`, {
      method: 'DELETE',
    }),
}