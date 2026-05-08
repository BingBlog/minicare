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
import type { GrowthRecord, CreateGrowthDto, UpdateGrowthDto } from '../types'

export interface GrowthListParams {
  before_date?: string
}

export interface GrowthListResponse {
  items: GrowthRecord[]
  nextBeforeDate: string | null
}

function buildListQuery(babyId: string, params?: GrowthListParams): string {
  const q: string[] = [`baby_id=${babyId}`]
  if (params?.before_date) q.push(`before_date=${encodeURIComponent(params.before_date)}`)
  return q.join('&')
}

export const growthApi = {
  list: (familyId: string, babyId: string, params?: GrowthListParams): Promise<GrowthListResponse> => {
    return request<GrowthListResponse>(`/api/family/${familyId}/records/growth?${buildListQuery(babyId, params)}`)
      .then((res) => ({
        items: res.items.map((r) => ({ ...r, type: 'growth' as const })),
        nextBeforeDate: res.nextBeforeDate,
      }))
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