import { request } from './http'

export interface MedicationItem {
  name: string
  dose?: string
}

export interface MedicalRecord {
  id: string
  baby_id: string
  visit_date: string
  visit_time?: string | null
  visit_type?: string | null
  hospital?: string | null
  doctor?: string | null
  result_summary?: string | null
  diagnosis?: string | null
  medications?: MedicationItem[] | null
  photo_ids?: string[] | null
  follow_up_date?: string | null
  follow_up_time?: string | null
  note?: string | null
}

export interface CreateMedicalDto {
  baby_id: string
  visit_date: string
  visit_time?: string
  visit_type?: string
  hospital?: string
  doctor?: string
  result_summary?: string
  diagnosis?: string
  medications?: MedicationItem[]
  photo_ids?: string[]
  follow_up_date?: string
  follow_up_time?: string
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

/** 下次复查提醒（首页展示）；仅未过期（follow_up_date >= 今天），过期即返回 null */
export interface NextFollowUp {
  id: string
  baby_id: string
  visit_date: string
  visit_time?: string | null
  visit_type?: string | null
  hospital?: string | null
  follow_up_date: string
  follow_up_time?: string | null
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

  /** 下次复查提醒（首页展示）；无复查计划返回 null */
  getNextFollowUp: (familyId: string, babyId: string) =>
    request<NextFollowUp | null>(`/api/family/${familyId}/records/medical/next-follow-up?baby_id=${babyId}`),
}
