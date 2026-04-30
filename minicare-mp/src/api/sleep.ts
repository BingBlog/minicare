import { request } from './http'

export interface OngoingSleepRecord {
  id: string
  baby_id: string
  start_time: string
  status: 'ongoing'
  sleep_period?: string
}

export const sleepApi = {
  getOngoing: (familyId: string, babyId: string) =>
    request<OngoingSleepRecord>(`/api/family/${familyId}/records/sleep/ongoing?baby_id=${babyId}`),

  endSleep: (familyId: string, sleepId: string, data: { end_time: string; quality: string; sleep_period: string }) =>
    request<{ id: string; duration_min: number; status: 'ended' }>(
      `/api/family/${familyId}/records/sleep/${sleepId}/end`,
      { method: 'PATCH', body: JSON.stringify(data) },
    ),
}
