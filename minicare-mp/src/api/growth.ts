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

function buildListQuery(babyId: string, limit?: number, offset?: number): string {
  const params: string[] = [`baby_id=${babyId}`]
  if (limit != null) params.push(`limit=${limit}`)
  if (offset != null) params.push(`offset=${offset}`)
  return params.join('&')
}

export const growthApi = {
  list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
    request<GrowthRecord[]>(`/api/family/${familyId}/records/growth?${buildListQuery(babyId, params?.limit, params?.offset)}`),

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
