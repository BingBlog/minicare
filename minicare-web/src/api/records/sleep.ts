/**
 * 睡眠记录 API
 * 路由：/api/family/:familyId/records/sleep
 *
 * 字段说明：
 *   start_time: 入睡时间（ISO 8601）
 *   end_time:   醒来时间（ISO 8601）
 *   note:       睡眠时段、质量等附加信息
 */
import { request } from '../http'
import type { SleepRecord, CreateSleepDto, PaginationParams, ListResult } from '../types'

export const sleepApi = {
  /** 获取睡眠记录列表 */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {}
  ): Promise<ListResult<SleepRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<SleepRecord>>(
      `/api/family/${familyId}/records/sleep?baby_id=${babyId}&limit=${limit}&offset=${offset}`
    )
  },

  /** 创建睡眠记录（计时模式或补录模式均使用此接口） */
  create: (familyId: string, data: CreateSleepDto): Promise<SleepRecord> =>
    request<SleepRecord>(`/api/family/${familyId}/records/sleep`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** 删除睡眠记录 */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/sleep/${id}`, {
      method: 'DELETE',
    }),
}
