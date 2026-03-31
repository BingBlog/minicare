/**
 * 尿布记录 API
 * 路由：/api/family/:familyId/records/diaper
 *
 * 字段说明：
 *   diaper_type: 尿布类型（DDL: 1=wet 2=dirty 3=mixed 4=dry）
 *   record_time: ISO 8601 时间戳
 *   color:       大便颜色（如 yellow/green/brown），dirty/mixed 类型时使用
 *   note:        性状、次数等附加备注
 */
import { request } from '../http'
import type { DiaperRecord, CreateDiaperDto, PaginationParams, ListResult } from '../types'

export const diaperApi = {
  /**
   * 获取尿布记录列表（按 record_time 倒序）
   *
   * @example 响应体
   * [
   *   {
   *     "id": "dr1dr2dr3-...",
   *     "baby_id": "b1b2b3b4-...",
   *     "recorded_by": "u1u2u3u4-...",
   *     "diaper_type": "dirty",
   *     "record_time": "2026-04-01T09:30:00.000Z",
   *     "color": "yellow",
   *     "note": "Bristol 4型，正常",
   *     "created_at": "2026-04-01T09:30:05.000Z"
   *   },
   *   {
   *     "id": "dr4dr5dr6-...",
   *     "baby_id": "b1b2b3b4-...",
   *     "recorded_by": "u1u2u3u4-...",
   *     "diaper_type": "wet",
   *     "record_time": "2026-04-01T07:00:00.000Z",
   *     "color": null,
   *     "note": null,
   *     "created_at": "2026-04-01T07:00:05.000Z"
   *   }
   * ]
   */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {},
  ): Promise<ListResult<DiaperRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<DiaperRecord>>(
      `/api/family/${familyId}/records/diaper?baby_id=${babyId}&limit=${limit}&offset=${offset}`,
    )
  },

  /**
   * 创建尿布记录
   *
   * @example 请求体（大便，带颜色）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "diaper_type": "dirty",
   *   "record_time": "2026-04-01T09:30:00.000Z",
   *   "color": "yellow",
   *   "note": "Bristol 4型"
   * }
   *
   * @example 请求体（湿尿布，无颜色）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "diaper_type": "wet",
   *   "record_time": "2026-04-01T07:00:00.000Z"
   * }
   *
   * @example 响应体
   * { "id": "dr1dr2dr3-..." }
   */
  create: (familyId: string, data: CreateDiaperDto): Promise<DiaperRecord> =>
    request<DiaperRecord>(`/api/family/${familyId}/records/diaper`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 删除尿布记录
   *
   * @example 响应体
   * { "id": "dr1dr2dr3-..." }
   */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/diaper/${id}`, {
      method: 'DELETE',
    }),
}
