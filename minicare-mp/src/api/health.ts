import { request } from './http'

export type Severity = 'mild' | 'moderate' | 'severe'

export interface HealthRecord {
  id: string
  baby_id: string
  record_time: string
  temperature?: number | null
  allergy_symptoms?: string[] | null
  allergy_severity?: Severity | null
  note?: string | null
}

export interface CreateHealthDto {
  baby_id: string
  record_time: string
  temperature?: number
  allergy_symptoms?: string[]
  allergy_severity?: Severity
  note?: string
}

export type UpdateHealthDto = Partial<Omit<CreateHealthDto, 'baby_id'>>

export interface HealthListParams {
  before_date?: string
}

export interface HealthListResponse {
  items: HealthRecord[]
  nextBeforeDate: string | null
}

function buildListQuery(babyId: string, params?: HealthListParams): string {
  const q: string[] = [`baby_id=${babyId}`]
  if (params?.before_date) q.push(`before_date=${encodeURIComponent(params.before_date)}`)
  return q.join('&')
}

export const healthApi = {
  list: (familyId: string, babyId: string, params?: HealthListParams): Promise<HealthListResponse> =>
    request<HealthListResponse>(`/api/family/${familyId}/records/health?${buildListQuery(babyId, params)}`),

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
