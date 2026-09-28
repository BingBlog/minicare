import { request } from './http'

export interface GrowthRecord {
  id: string
  baby_id: string
  record_date: string
  record_time?: string | null
  height_mm?: number | null
  weight_g?: number | null
  head_mm?: number | null
  note?: string | null
}

export interface CreateGrowthDto {
  baby_id: string
  record_date: string
  record_time?: string
  height_mm?: number
  weight_g?: number
  head_mm?: number
  note?: string
}

export type UpdateGrowthDto = Partial<Omit<CreateGrowthDto, 'baby_id'>>

export interface GrowthListParams {
  before_date?: string
}

export interface GrowthListResponse {
  items: GrowthRecord[]
  nextBeforeDate: string | null
}

function buildListQuery(babyId: string, params?: GrowthListParams): string {
  const q: string[] = [`baby_id=${babyId}`]
  if (params?.before_date) q.push(`before_date=${encodeURIComponent(params.before_date)}`)
  return q.join('&')
}

export const growthApi = {
  list: (familyId: string, babyId: string, params?: GrowthListParams): Promise<GrowthListResponse> =>
    request<GrowthListResponse>(`/api/family/${familyId}/records/growth?${buildListQuery(babyId, params)}`),

  getLatest: (familyId: string, babyId: string): Promise<GrowthRecord | null> =>
    request<GrowthRecord | null>(`/api/family/${familyId}/records/growth/latest?baby_id=${babyId}`),

  create: (familyId: string, data: CreateGrowthDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/growth`, {
      method: 'POST',
      data,
    }),

  update: (familyId: string, id: string, data: UpdateGrowthDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/growth/${id}`, {
      method: 'PATCH',
      data,
    }),

  remove: (familyId: string, id: string) =>
    request<void>(`/api/family/${familyId}/records/growth/${id}`, { method: 'DELETE' }),

  getOne: (familyId: string, id: string) =>
    request<GrowthRecord>(`/api/family/${familyId}/records/growth/${id}`),
}
