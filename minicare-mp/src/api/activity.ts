import { request } from './http'

export type ActivityType = 'gross_motor' | 'fine_motor' | 'edu_play' | 'outdoor' | 'bath' | 'daily_care' | 'other'
export type ActivityIntensity = 'easy' | 'medium' | 'active'

export interface ActivityRecord {
  id: string
  baby_id: string
  record_time: string
  activity_type: ActivityType
  intensity?: ActivityIntensity | null
  duration_min?: number | null
  note?: string | null
}

export interface CreateActivityDto {
  baby_id: string
  record_time: string
  activity_type: ActivityType
  intensity?: ActivityIntensity
  duration_min?: number
  note?: string
}

export type UpdateActivityDto = Partial<Omit<CreateActivityDto, 'baby_id'>>

export interface ActivityListParams {
  before_date?: string
}

export interface ActivityListResponse {
  items: ActivityRecord[]
  nextBeforeDate: string | null
}

function buildListQuery(babyId: string, params?: ActivityListParams): string {
  const q: string[] = [`baby_id=${babyId}`]
  if (params?.before_date) q.push(`before_date=${encodeURIComponent(params.before_date)}`)
  return q.join('&')
}

export const activityApi = {
  list: (familyId: string, babyId: string, params?: ActivityListParams): Promise<ActivityListResponse> =>
    request<ActivityListResponse>(`/api/family/${familyId}/records/activity?${buildListQuery(babyId, params)}`),

  create: (familyId: string, data: CreateActivityDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/activity`, {
      method: 'POST',
      data,
    }),

  update: (familyId: string, id: string, data: UpdateActivityDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/activity/${id}`, {
      method: 'PATCH',
      data,
    }),

  remove: (familyId: string, id: string) =>
    request<void>(`/api/family/${familyId}/records/activity/${id}`, { method: 'DELETE' }),

  getOne: (familyId: string, id: string) =>
    request<ActivityRecord>(`/api/family/${familyId}/records/activity/${id}`),
}
