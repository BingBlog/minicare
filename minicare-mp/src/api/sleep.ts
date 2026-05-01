import { request } from './http'

export type SleepQuality = 'good' | 'normal' | 'poor'
export type SleepPeriod = 'night' | 'morning_nap' | 'afternoon_nap' | 'other'

export interface SleepRecord {
  id: string
  baby_id: string
  start_time: string
  end_time?: string | null
  status: 'ongoing' | 'ended'
  duration_min?: number | null
  quality?: SleepQuality | null
  sleep_period?: SleepPeriod | null
  note?: string | null
}

export interface StartSleepDto {
  baby_id: string
  start_time: string
  quality?: SleepQuality
  sleep_period?: SleepPeriod
  note?: string
}

export interface EndSleepDto {
  end_time: string
  quality?: SleepQuality
  sleep_period?: SleepPeriod
  note?: string
}

export interface CreateCompleteSleepDto {
  baby_id: string
  start_time: string
  end_time: string
  quality?: SleepQuality
  sleep_period?: SleepPeriod
  note?: string
}

export interface UpdateSleepDto {
  start_time?: string
  end_time?: string
  quality?: SleepQuality
  sleep_period?: SleepPeriod
  note?: string
}

export const sleepApi = {
  getOngoing: (familyId: string, babyId: string) =>
    request<SleepRecord | null>(`/api/family/${familyId}/records/sleep/ongoing?baby_id=${babyId}`),

  startSleep: (familyId: string, data: StartSleepDto) =>
    request<{ id: string; status: 'ongoing' }>(
      `/api/family/${familyId}/records/sleep/start`,
      { method: 'POST', data },
    ),

  endSleep: (familyId: string, sleepId: string, data: EndSleepDto) =>
    request<{ id: string; duration_min: number; status: 'ended' }>(
      `/api/family/${familyId}/records/sleep/${sleepId}/end`,
      { method: 'PATCH', data },
    ),

  createComplete: (familyId: string, data: CreateCompleteSleepDto) =>
    request<{ id: string; duration_min: number; status: 'ended' }>(
      `/api/family/${familyId}/records/sleep/complete`,
      { method: 'POST', data },
    ),

  getOne: (familyId: string, id: string) =>
    request<SleepRecord>(`/api/family/${familyId}/records/sleep/${id}`),

  update: (familyId: string, id: string, data: UpdateSleepDto) =>
    request<SleepRecord>(
      `/api/family/${familyId}/records/sleep/${id}`,
      { method: 'PATCH', data },
    ),

  remove: (familyId: string, id: string) =>
    request<void>(`/api/family/${familyId}/records/sleep/${id}`, { method: 'DELETE' }),
}
