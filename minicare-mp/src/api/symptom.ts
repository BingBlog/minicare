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

function buildListQuery(babyId: string, limit?: number, offset?: number): string {
  const params: string[] = [`baby_id=${babyId}`]
  if (limit != null) params.push(`limit=${limit}`)
  if (offset != null) params.push(`offset=${offset}`)
  return params.join('&')
}

export const symptomApi = {
  list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
    request<SymptomRecord[]>(`/api/family/${familyId}/records/symptom?${buildListQuery(babyId, params?.limit, params?.offset)}`),

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
