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

export interface DiaperListParams {
  before_date?: string
}

export interface DiaperListResponse {
  items: DiaperRecord[]
  nextBeforeDate: string | null
}

function buildListQuery(babyId: string, params?: DiaperListParams): string {
  const q: string[] = [`baby_id=${babyId}`]
  if (params?.before_date) q.push(`before_date=${encodeURIComponent(params.before_date)}`)
  return q.join('&')
}

export const diaperApi = {
  list: (familyId: string, babyId: string, params?: DiaperListParams): Promise<DiaperListResponse> =>
    request<DiaperListResponse>(`/api/family/${familyId}/records/diaper?${buildListQuery(babyId, params)}`),

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
