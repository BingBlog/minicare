import { request } from './http'

/** 药品清单项 */
export interface Medication {
  id: string
  baby_id: string
  name: string
  default_dose?: string | null
  /** 药品照片 fileID（拍药盒，迁移 025） */
  photo_id?: string | null
  note?: string | null
  created_at?: string
  updated_at?: string
}

export interface CreateMedicationDto {
  baby_id: string
  name: string
  default_dose?: string
  photo_id?: string
  note?: string
}

export type UpdateMedicationDto = Partial<Omit<CreateMedicationDto, 'baby_id'>>

/** 单次服药打卡记录（多药批次时批内每药一条，共享 batch_id） */
export interface MedicationRecord {
  id: string
  baby_id: string
  medication_id?: string | null
  /** 多药批次 id（NULL=历史单药记录，迁移 025） */
  batch_id?: string | null
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

/** ── 多药批次（一次服药多种药）── */

/** 批次中的单个药品行 */
export interface MedicationBatchItem {
  /** 既有记录 id（编辑保留行回传；新增行为空） */
  record_id?: string
  medication_id?: string
  medication_name: string
  dose?: string
}

export interface CreateMedicationBatchDto {
  baby_id: string
  record_time: string
  note?: string
  items: MedicationBatchItem[]
}

export interface UpdateMedicationBatchDto {
  record_time?: string
  note?: string
  items: MedicationBatchItem[]
}

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
    request<{ id: string; deleted?: number }>(
      `/api/family/${familyId}/records/medication/${id}`,
      { method: 'DELETE' },
    ),
  getRecord: (familyId: string, id: string) =>
    request<MedicationRecord>(
      `/api/family/${familyId}/records/medication/${id}`,
    ),

  // ── 多药批次 ──
  /** 新建服药批次：一次多种药，返回批 id 与批内记录 ids */
  createBatch: (familyId: string, data: CreateMedicationBatchDto) =>
    request<{ batch_id: string; ids: string[] }>(
      `/api/family/${familyId}/records/medication/batch`,
      { method: 'POST', data },
    ),
  /** 加载该记录所属批次全部成员（历史单药返回单条数组） */
  getBatch: (familyId: string, recordId: string) =>
    request<MedicationRecord[]>(
      `/api/family/${familyId}/records/medication/${recordId}/batch`,
    ),
  /** 整批保存（保留行更新 / 新增行插入 / 缺失行软删） */
  updateBatch: (familyId: string, recordId: string, data: UpdateMedicationBatchDto) =>
    request<{ batch_id: string | null; ids: string[] }>(
      `/api/family/${familyId}/records/medication/${recordId}/batch`,
      { method: 'PUT', data },
    ),
}
