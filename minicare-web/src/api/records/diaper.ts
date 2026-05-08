/**
 * 尿布记录 API
 * 路由：/api/family/:familyId/records/diaper
 *
 * 字段说明：
 *   diaper_type:  尿布类型（DDL: VARCHAR(10)—'wet' | 'dirty' | 'mixed'）
 *   record_time:  ISO 8601 时间戳
 *   color:        大便颜色（如 yellow/green/brown_yellow），dirty/mixed 类型时使用
 *   poop_type:    大便性状（DDL: VARCHAR(30)—normal/loose/watery/hard/bloody）
 *   diaper_count: 今日换尿布次数（0~20）
 *   note:         附加备注（可选）
 */
import { request } from '../http'
import type { DiaperRecord, CreateDiaperDto, UpdateDiaperDto } from '../types'

export interface DiaperListParams {
  before_date?: string
}

export interface DiaperListResponse {
  items: DiaperRecord[]
  nextBeforeDate: string | null
}

function buildListQuery(babyId: string, params?: DiaperListParams): string {
  const q: string[] = [`baby_id=${babyId}`]
  if (params?.before_date) q.push(`before_date=${encodeURIComponent(params.before_date)}`)
  return q.join('&')
}

export const diaperApi = {
  list: (familyId: string, babyId: string, params?: DiaperListParams): Promise<DiaperListResponse> => {
    return request<DiaperListResponse>(`/api/family/${familyId}/records/diaper?${buildListQuery(babyId, params)}`)
      .then((res) => ({
        items: res.items.map((r) => ({ ...r, type: 'diaper' })),
        nextBeforeDate: res.nextBeforeDate,
      }))
  },

  /**
   * 创建尿布记录
   *
   * @example 请求体（大便，带性状和颜色）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "diaper_type": "dirty",
   *   "record_time": "2026-04-01T09:30:00.000Z",
   *   "color": "yellow",
   *   "poop_type": "normal_soft",
   *   "diaper_count": 4
   * }
   *
   * @example 请求体（湿尿布）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "diaper_type": "wet",
   *   "record_time": "2026-04-01T07:00:00.000Z",
   *   "diaper_count": 6
   * }
   *
   * @example 响应体
   * { "id": "dr1dr2dr3-..." }
   */
  create: (familyId: string, data: CreateDiaperDto): Promise<{ id: string }> =>
    request<{ id: string }>(`/api/family/${familyId}/records/diaper`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 获取单条尿布记录（编辑前重新查询，确保数据最新）
   */
  getOne: (familyId: string, id: string): Promise<DiaperRecord> =>
    request<DiaperRecord>(`/api/family/${familyId}/records/diaper/${id}`),

  /**
   * 更新尿布记录（PATCH 局部更新）
   */
  update: (familyId: string, id: string, data: UpdateDiaperDto): Promise<DiaperRecord> =>
    request<DiaperRecord>(`/api/family/${familyId}/records/diaper/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * 删除尿布记录
   */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/diaper/${id}`, {
      method: 'DELETE',
    }),
}