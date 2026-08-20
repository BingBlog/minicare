import { request } from './http'

/** 药品清单项 */
export interface Medication {
  id: string
  baby_id: string
  name: string
  default_dose?: string | null
  note?: string | null
  created_at?: string
  updated_at?: string
}

export interface CreateMedicationDto {
  baby_id: string
  name: string
  default_dose?: string
  note?: string
}

export type UpdateMedicationDto = Partial<Omit<CreateMedicationDto, 'baby_id'>>

/** 单次服药打卡记录 */
export interface MedicationRecord {
  id: string
  baby_id: string
  medication_id?: string | null
  medication_name: string
  dose?: string | null
  record_time: string
  note?: string | null
  recorded_by?: string
  created_at?: string
  updated_at?: string
}

export interface CreateMedicationRecordDto {
  baby_id: string
  medication_id?: string
  medication_name: string
  dose?: string
  record_time: string
  note?: string
}

export type UpdateMedicationRecordDto = Partial<
  Omit<CreateMedicationRecordDto, 'baby_id'>
>

export const medicationApi = {
  // ── 药品清单 ──
  list: (familyId: string, babyId: string) =>
    request<Medication[]>(
      `/api/family/${familyId}/medications?baby_id=${babyId}`,
    ),
  create: (familyId: string, data: CreateMedicationDto) =>
    request<{ id: string }>(`/api/family/${familyId}/medications`, {
      method: 'POST',
      data,
    }),
  update: (familyId: string, babyId: string, id: string, data: UpdateMedicationDto) =>
    request<{ id: string }>(
      `/api/family/${familyId}/medications/${id}?baby_id=${babyId}`,
      { method: 'PATCH', data },
    ),
  remove: (familyId: string, id: string) =>
    request<{ id: string }>(
      `/api/family/${familyId}/medications/${id}`,
      { method: 'DELETE' },
    ),

  // ── 服药打卡 ──
  listRecords: (familyId: string, babyId: string, date?: string) => {
    const q = [`baby_id=${babyId}`]
    if (date) q.push(`date=${encodeURIComponent(date)}`)
    return request<MedicationRecord[]>(
      `/api/family/${familyId}/records/medication?${q.join('&')}`,
    )
  },
  createRecord: (familyId: string, data: CreateMedicationRecordDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/medication`, {
      method: 'POST',
      data,
    }),
  updateRecord: (familyId: string, id: string, data: UpdateMedicationRecordDto) =>
    request<{ id: string }>(
      `/api/family/${familyId}/records/medication/${id}`,
      { method: 'PATCH', data },
    ),
  removeRecord: (familyId: string, id: string) =>
    request<{ id: string }>(
      `/api/family/${familyId}/records/medication/${id}`,
      { method: 'DELETE' },
    ),
  getRecord: (familyId: string, id: string) =>
    request<MedicationRecord>(
      `/api/family/${familyId}/records/medication/${id}`,
    ),
}
