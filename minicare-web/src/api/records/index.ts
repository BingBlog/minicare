/**
 * Records 模块聚合出口
 * 统一导出所有记录类型的 API 对象
 */
import { request } from '../http'
import type { TodayRecord, ListResult, RecordItem } from '../types'

export { feedingApi } from './feeding'
export type { FeedingListParams, FeedingListResponse } from './feeding'
export { sleepApi } from './sleep'
export type { SleepListParams, SleepListResponse } from './sleep'
export { diaperApi } from './diaper'
export type { DiaperListParams, DiaperListResponse } from './diaper'
export { activityApi } from './activity'
export type { ActivityListParams, ActivityListResponse } from './activity'
export { healthApi } from './health'
export type { HealthListParams, HealthListResponse } from './health'
export { growthApi } from './growth'
export type { GrowthListParams, GrowthListResponse } from './growth'
export { medicalApi } from './medical'
export type { MedicalListParams, MedicalListResponse } from './medical'
export { symptomApi } from './symptom'
export type { SymptomListParams, SymptomListResponse } from './symptom'

export interface DatePaginatedResponse<T = RecordItem> {
  items: T[]
  nextBeforeDate: string | null
}

export interface DateListParams {
  before_date?: string
}

export const todayApi = {
  list: (familyId: string, date?: string): Promise<ListResult<TodayRecord>> => {
    const qs = date ? `?date=${encodeURIComponent(date)}` : ''
    return request<ListResult<TodayRecord>>(`/api/family/${familyId}/records/today${qs}`)
  },
}
