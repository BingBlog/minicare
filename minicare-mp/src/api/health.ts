import { request } from './http'

export type Severity = 'mild' | 'moderate' | 'severe'

export interface HealthRecord {
  id: string
  baby_id: string
  record_time: string
  temperature?: number | null
  allergy_symptoms?: string[] | null
  allergy_severity?: Severity | null
  skin_care?: string[] | null
  note?: string | null
}

export interface CreateHealthDto {
  baby_id: string
  record_time: string
  temperature?: number
  allergy_symptoms?: string[]
  allergy_severity?: Severity
  skin_care?: string[]
  note?: string
}

export type UpdateHealthDto = Partial<Omit<CreateHealthDto, 'baby_id'>>

function buildListQuery(babyId: string, limit?: number, offset?: number): string {
  const params: string[] = [`baby_id=${babyId}`]
  if (limit != null) params.push(`limit=${limit}`)
  if (offset != null) params.push(`offset=${offset}`)
  return params.join('&')
}

export const healthApi = {
  list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
    request<HealthRecord[]>(`/api/family/${familyId}/records/health?${buildListQuery(babyId, params?.limit, params?.offset)}`),

  create: (familyId: string, data: CreateHealthDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/health`, {
      method: 'POST',
      data,
    }),

  update: (familyId: string, id: string, data: UpdateHealthDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/health/${id}`, {
      method: 'PATCH',
      data,
    }),

  remove: (familyId: string, id: string) =>
    request<void>(`/api/family/${familyId}/records/health/${id}`, { method: 'DELETE' }),

  getOne: (familyId: string, id: string) =>
    request<HealthRecord>(`/api/family/${familyId}/records/health/${id}`),
}
