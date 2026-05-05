import { request } from './http'

export type ActivityType = 'gross_motor' | 'fine_motor' | 'edu_play' | 'outdoor' | 'daily_care' | 'other'
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

function buildListQuery(babyId: string, limit?: number, offset?: number): string {
  const params: string[] = [`baby_id=${babyId}`]
  if (limit != null) params.push(`limit=${limit}`)
  if (offset != null) params.push(`offset=${offset}`)
  return params.join('&')
}

export const activityApi = {
  list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
    request<ActivityRecord[]>(`/api/family/${familyId}/records/activity?${buildListQuery(babyId, params?.limit, params?.offset)}`),

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
