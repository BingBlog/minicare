import { request } from './http'

export interface OngoingSleepRecord {
  id: string
  baby_id: string
  start_time: string
  status: 'ongoing'
}

export const sleepApi = {
  getOngoing: (familyId: string, babyId: string) =>
    request<OngoingSleepRecord>(`/api/family/${familyId}/records/sleep/ongoing?baby_id=${babyId}`),
}
