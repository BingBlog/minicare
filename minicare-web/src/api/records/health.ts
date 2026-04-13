/**
 * 健康记录 API
 * 路由：/api/family/:familyId/records/health
 *
 * 字段说明：
 *   record_time:  ISO 8601 时间戳
 *   temperature:  体温（℃，如 37.5），正常范围 35～42
 *   mood:         @deprecated Migration 008 已删除 health_record.mood，情绪统一由 symptom_record.mood 记录
 *   note:         过敏表现、用药、护理等附加信息（前端拼接后传入）
 */
import { request } from '../http'
import type { HealthRecord, CreateHealthDto, UpdateHealthDto, PaginationParams, ListResult } from '../types'

export const healthApi = {
  /**
   * 获取健康记录列表（按 record_time 倒序）
   *
   * @example 响应体
   * [
   *   {
   *     "id": "hr1hr2hr3-...",
   *     "baby_id": "b1b2b3b4-...",
   *     "recorded_by": "u1u2u3u4-...",
   *     "record_time": "2026-04-01T08:00:00.000Z",
   *     "temperature": 38.2,
   *     "mood": "fussy",
   *     "note": "过敏表现：皮疹 / 严重程度：轻度 / 用药：维生素D（400IU）",
   *     "created_at": "2026-04-01T08:00:05.000Z"
   *   },
   *   {
   *     "id": "hr4hr5hr6-...",
   *     "baby_id": "b1b2b3b4-...",
   *     "recorded_by": "u1u2u3u4-...",
   *     "record_time": "2026-04-01T20:00:00.000Z",
   *     "temperature": 36.8,
   *     "mood": "happy",
   *     "note": null,
   *     "created_at": "2026-04-01T20:00:05.000Z"
   *   }
   * ]
   */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {},
  ): Promise<ListResult<HealthRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<HealthRecord>>(
      `/api/family/${familyId}/records/health?baby_id=${babyId}&limit=${limit}&offset=${offset}`,
    ).then((items) => items.map((r) => ({ ...r, type: 'health' as const })))
  },

  /**
   * 创建健康记录
   *
   * @example 请求体（带体温和情绪）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "record_time": "2026-04-01T08:00:00.000Z",
   *   "temperature": 38.2,
   *   "mood": "fussy",
   *   "note": "过敏表现：皮疹 / 严重程度：轻度 / 用药：维生素D（400IU）"
   * }
   *
   * @example 请求体（仅体温）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "record_time": "2026-04-01T20:00:00.000Z",
   *   "temperature": 36.8
   * }
   *
   * @example 响应体
   * { "id": "hr1hr2hr3-..." }
   */
  create: (familyId: string, data: CreateHealthDto): Promise<HealthRecord> =>
    request<HealthRecord>(`/api/family/${familyId}/records/health`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 获取单条健康记录（编辑前重新查询，确保数据最新）
   */
  getOne: (familyId: string, id: string): Promise<HealthRecord> =>
    request<HealthRecord>(`/api/family/${familyId}/records/health/${id}`),

  /**
   * 更新健康记录（PATCH 局部更新）
   */
  update: (familyId: string, id: string, data: UpdateHealthDto): Promise<HealthRecord> =>
    request<HealthRecord>(`/api/family/${familyId}/records/health/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * 删除健康记录
   *
   * @example 响应体
   * { "id": "hr1hr2hr3-..." }
   */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/health/${id}`, {
      method: 'DELETE',
    }),
}