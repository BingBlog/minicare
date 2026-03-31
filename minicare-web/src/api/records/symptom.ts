/**
 * 表现记录 API
 * 路由：/api/family/:familyId/records/symptom
 *
 * 字段说明：
 *   record_time: ISO 8601 时间戳
 *   symptoms:    症状列表 [{ type, severity? }]
 *                type    编号：1=皮疹 2=呕吐 3=发烧 4=腹泻 5=便秘 6=其他
 *                severity 程度：1=轻度 2=中度 3=重度
 *   photo_ids:   照片 fileID 列表（DDL: photo_ids JSON）
 *   note:        心情/精神等状态文字、附加备注（前端拼接后传入）
 *
 * 注意：心情（mood）和精神（spirit）在前端表单中选择后，
 *       拼接为文字放入 note 字段，不单独存储为独立列（DDL 无对应列）。
 */
import { request } from '../http'
import type { SymptomRecord, CreateSymptomDto, PaginationParams, ListResult } from '../types'

export const symptomApi = {
  /**
   * 获取表现记录列表（按 record_time 倒序）
   *
   * @example 响应体
   * [
   *   {
   *     "id": "s1s2s3s4-...",
   *     "baby_id": "a1b2c3d4-...",
   *     "recorded_by": "u1u2u3u4-...",
   *     "record_time": "2026-04-01T10:00:00.000Z",
   *     "symptoms": [{ "type": 3, "severity": 1 }],
   *     "photo_ids": [],
   *     "note": "心情：开心 / 精神：正常",
   *     "created_at": "2026-04-01T10:00:05.000Z"
   *   }
   * ]
   */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {},
  ): Promise<ListResult<SymptomRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<SymptomRecord>>(
      `/api/family/${familyId}/records/symptom?baby_id=${babyId}&limit=${limit}&offset=${offset}`,
    )
  },

  /**
   * 创建表现记录
   *
   * @example 请求体（前端表单提交，心情/精神拼入 note）
   * {
   *   "baby_id": "a1b2c3d4-...",
   *   "record_time": "2026-04-01T10:00:00.000Z",
   *   "symptoms": [{ "type": 6, "severity": 1 }],
   *   "note": "心情：开心 / 精神：正常"
   * }
   *
   * @example 请求体（有具体症状场景）
   * {
   *   "baby_id": "a1b2c3d4-...",
   *   "record_time": "2026-04-01T08:30:00.000Z",
   *   "symptoms": [
   *     { "type": 3, "severity": 2 },
   *     { "type": 4, "severity": 1 }
   *   ],
   *   "photo_ids": ["cloud://file-abc123.png"],
   *   "note": "发烧 38.5℃，伴随腹泻"
   * }
   *
   * @example 响应体
   * { "id": "s1s2s3s4-..." }
   */
  create: (familyId: string, data: CreateSymptomDto): Promise<SymptomRecord> =>
    request<SymptomRecord>(`/api/family/${familyId}/records/symptom`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 删除表现记录
   *
   * @example 响应体
   * { "id": "s1s2s3s4-..." }
   */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/symptom/${id}`, {
      method: 'DELETE',
    }),
}
