/**
 * 表现记录 API
 * 路由：/api/family/:familyId/records/symptom
 *
 * 字段说明：
 *   record_time: ISO 8601 时间戳
 *   symptoms:    症状列表 [{ type, severity? }]
 *                type    编号：1=皮疹 2=呕吐 3=发烧 4=腹泻 5=便秘 6=其他
 *                severity 程度：1=轻度 2=中度 3=重度
 *   spirit:      精神状态（active/normal/tired/lethargic）
 *   mood:        情绪状态（happy/neutral/fussy/crying）
 *   photo_ids:   照片 fileID 列表（DDL: photo_ids JSON）
 *   note:        附加备注（可选）
 */
import { request } from '../http'
import type { SymptomRecord, CreateSymptomDto, UpdateSymptomDto, PaginationParams, ListResult } from '../types'

export const symptomApi = {
  /**
   * 获取表现记录列表（按 record_time 倒序）
   */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {},
  ): Promise<ListResult<SymptomRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<SymptomRecord>>(
      `/api/family/${familyId}/records/symptom?baby_id=${babyId}&limit=${limit}&offset=${offset}`,
    ).then((items) => items.map((r) => ({ ...r, type: 'symptom' as const })))
  },

  /**
   * 创建表现记录
   *
   * @example 请求体（正常状态，使用结构化字段）
   * {
   *   "baby_id": "a1b2c3d4-...",
   *   "record_time": "2026-04-01T10:00:00.000Z",
   *   "symptoms": [{ "type": 6, "severity": 1 }],
   *   "spirit": "active",
   *   "mood": "happy"
   * }
   *
   * @example 响应体
   * { "id": "s1s2s3s4-..." }
   */
  create: (familyId: string, data: CreateSymptomDto): Promise<{ id: string }> =>
    request<{ id: string }>(`/api/family/${familyId}/records/symptom`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 获取单条表现记录（编辑前重新查询，确保数据最新）
   */
  getOne: (familyId: string, id: string): Promise<SymptomRecord> =>
    request<SymptomRecord>(`/api/family/${familyId}/records/symptom/${id}`),

  /**
   * 更新表现记录（PATCH 局部更新）
   */
  update: (familyId: string, id: string, data: UpdateSymptomDto): Promise<SymptomRecord> =>
    request<SymptomRecord>(`/api/family/${familyId}/records/symptom/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * 删除表现记录
   */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/symptom/${id}`, {
      method: 'DELETE',
    }),
}