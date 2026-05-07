import { request } from './http'

export type SpiritLevel = 'active' | 'normal' | 'tired' | 'lethargic'
export type MoodLevel = 'happy' | 'neutral' | 'fussy' | 'crying'

export interface SymptomItem {
  type: number
  severity?: number
}

export interface SymptomRecord {
  id: string
  baby_id: string
  record_time: string
  mood?: MoodLevel | null
  spirit?: SpiritLevel | null
  symptoms?: SymptomItem[] | null
  note?: string | null
}

export interface CreateSymptomDto {
  baby_id: string
  record_time: string
  mood?: MoodLevel
  spirit?: SpiritLevel
  symptoms?: SymptomItem[]
  note?: string
}

export type UpdateSymptomDto = Partial<Omit<CreateSymptomDto, 'baby_id'>>

export interface SymptomListParams {
  before_date?: string
}

export interface SymptomListResponse {
  items: SymptomRecord[]
  nextBeforeDate: string | null
}

function buildListQuery(babyId: string, params?: SymptomListParams): string {
  const q: string[] = [`baby_id=${babyId}`]
  if (params?.before_date) q.push(`before_date=${encodeURIComponent(params.before_date)}`)
  return q.join('&')
}

export const symptomApi = {
  list: (familyId: string, babyId: string, params?: SymptomListParams): Promise<SymptomListResponse> =>
    request<SymptomListResponse>(`/api/family/${familyId}/records/symptom?${buildListQuery(babyId, params)}`),

  create: (familyId: string, data: CreateSymptomDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/symptom`, {
      method: 'POST',
      data,
    }),

  update: (familyId: string, id: string, data: UpdateSymptomDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/symptom/${id}`, {
      method: 'PATCH',
      data,
    }),

  remove: (familyId: string, id: string) =>
    request<void>(`/api/family/${familyId}/records/symptom/${id}`, { method: 'DELETE' }),

  getOne: (familyId: string, id: string) =>
    request<SymptomRecord>(`/api/family/${familyId}/records/symptom/${id}`),
}
