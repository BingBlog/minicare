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

function buildListQuery(babyId: string, limit?: number, offset?: number): string {
  const params: string[] = [`baby_id=${babyId}`]
  if (limit != null) params.push(`limit=${limit}`)
  if (offset != null) params.push(`offset=${offset}`)
  return params.join('&')
}

export const medicalApi = {
  list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
    request<MedicalRecord[]>(`/api/family/${familyId}/records/medical?${buildListQuery(babyId, params?.limit, params?.offset)}`),

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
