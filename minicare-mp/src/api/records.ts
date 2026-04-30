import { request } from './http'
import type { TodayRecord } from './types'

export const recordsApi = {
  today: (familyId: string) => request<TodayRecord[]>(`/api/family/${familyId}/records/today`),
}
