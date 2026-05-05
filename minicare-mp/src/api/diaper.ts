import { request } from './http'

export type DiaperType = 'wet' | 'dirty' | 'mixed'
export type ButtCondition = 'normal' | 'red' | 'rash' | 'other'

export interface DiaperRecord {
  id: string
  baby_id: string
  record_time: string
  diaper_type: DiaperType
  diaper_count?: number | null
  poop_type?: string | null
  butt_condition?: ButtCondition | null
  stool_colors?: string[] | null
  note?: string | null
}

export interface CreateDiaperDto {
  baby_id: string
  record_time: string
  diaper_type: DiaperType
  diaper_count?: number
  poop_type?: string
  butt_condition?: ButtCondition
  stool_colors?: string[]
  note?: string
}

export type UpdateDiaperDto = Partial<Omit<CreateDiaperDto, 'baby_id'>>

function buildListQuery(babyId: string, limit?: number, offset?: number): string {
  const params: string[] = [`baby_id=${babyId}`]
  if (limit != null) params.push(`limit=${limit}`)
  if (offset != null) params.push(`offset=${offset}`)
  return params.join('&')
}

export const diaperApi = {
  list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
    request<DiaperRecord[]>(`/api/family/${familyId}/records/diaper?${buildListQuery(babyId, params?.limit, params?.offset)}`),

  create: (familyId: string, data: CreateDiaperDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/diaper`, {
      method: 'POST',
      data,
    }),

  update: (familyId: string, id: string, data: UpdateDiaperDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/diaper/${id}`, {
      method: 'PATCH',
      data,
    }),

  remove: (familyId: string, id: string) =>
    request<void>(`/api/family/${familyId}/records/diaper/${id}`, { method: 'DELETE' }),

  getOne: (familyId: string, id: string) =>
    request<DiaperRecord>(`/api/family/${familyId}/records/diaper/${id}`),
}
