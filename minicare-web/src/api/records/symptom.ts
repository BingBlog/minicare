/**
 * 表现记录 API
 * 路由：/api/family/:familyId/records/symptom
 *
 * 字段说明：
 *   record_time: ISO 8601 时间戳
 *   mood:        心情，'happy' | 'normal' | 'sad'
 *   spirit:      精神，'calm' | 'normal' | 'active' | 'sleepy'
 *   note:        心情/精神标签文字等附加备注
 */
import { request } from '../http'
import type { SymptomRecord, CreateSymptomDto, PaginationParams, ListResult } from '../types'

export const symptomApi = {
  /** 获取表现记录列表 */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {}
  ): Promise<ListResult<SymptomRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<SymptomRecord>>(
      `/api/family/${familyId}/records/symptom?baby_id=${babyId}&limit=${limit}&offset=${offset}`
    )
  },

  /** 创建表现记录 */
  create: (familyId: string, data: CreateSymptomDto): Promise<SymptomRecord> =>
    request<SymptomRecord>(`/api/family/${familyId}/records/symptom`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** 删除表现记录 */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/symptom/${id}`, {
      method: 'DELETE',
    }),
}
