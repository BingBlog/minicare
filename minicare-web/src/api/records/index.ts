/**
 * Records 模块聚合出口
 * 统一导出所有记录类型的 API 对象
 */
import { request } from '../http'
import type { TodayRecord, ListResult } from '../types'

export { feedingApi } from './feeding'
export { sleepApi } from './sleep'
export { diaperApi } from './diaper'
export { activityApi } from './activity'
export { healthApi } from './health'
export { growthApi } from './growth'
export { medicalApi } from './medical'
export { symptomApi } from './symptom'

/**
 * 今日聚合时间轴
 * 路由：GET /api/family/:familyId/records/today
 * 返回当天所有类型记录的时间轴（倒序）
 */
export const todayApi = {
  list: (familyId: string): Promise<ListResult<TodayRecord>> =>
    request<ListResult<TodayRecord>>(`/api/family/${familyId}/records/today`),
}
