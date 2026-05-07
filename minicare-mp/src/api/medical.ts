import { request } from './http'

export interface MedicationItem {
  name: string
  dose?: string
}

export interface MedicalRecord {
  id: string
  baby_id: string
  visit_date: string
  visit_type?: string | null
  hospital?: string | null
  doctor?: string | null
  result_summary?: string | null
  diagnosis?: string | null
  medications?: MedicationItem[] | null
  follow_up_date?: string | null
  note?: string | null
}

export interface CreateMedicalDto {
  baby_id: string
  visit_date: string
  visit_type?: string
  hospital?: string
  doctor?: string
  result_summary?: string
  diagnosis?: string
  medications?: MedicationItem[]
  follow_up_date?: string
  note?: string
}

export type UpdateMedicalDto = Partial<Omit<CreateMedicalDto, 'baby_id'>>

export interface MedicalListParams {
  before_date?: string
}

export interface MedicalListResponse {
  items: MedicalRecord[]
  nextBeforeDate: string | null
}

function buildListQuery(babyId: string, params?: MedicalListParams): string {
  const q: string[] = [`baby_id=${babyId}`]
  if (params?.before_date) q.push(`before_date=${encodeURIComponent(params.before_date)}`)
  return q.join('&')
}

export const medicalApi = {
  list: (familyId: string, babyId: string, params?: MedicalListParams): Promise<MedicalListResponse> =>
    request<MedicalListResponse>(`/api/family/${familyId}/records/medical?${buildListQuery(babyId, params)}`),

  create: (familyId: string, data: CreateMedicalDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/medical`, {
      method: 'POST',
      data,
    }),

  update: (familyId: string, id: string, data: UpdateMedicalDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/medical/${id}`, {
      method: 'PATCH',
      data,
    }),

  remove: (familyId: string, id: string) =>
    request<void>(`/api/family/${familyId}/records/medical/${id}`, { method: 'DELETE' }),

  getOne: (familyId: string, id: string) =>
    request<MedicalRecord>(`/api/family/${familyId}/records/medical/${id}`),
}
