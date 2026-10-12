import Taro from '@tarojs/taro'
import { request } from './http'

export interface MedicationItem {
  name: string
  /** 单次用量，如 1.25ml / 0.8袋（PRD-017 识图复用此字段） */
  dose?: string
  /** 服药天数（手填数字；AI 识图的描述性文字不入此字段） */
  days?: number
  // ── PRD-017 识图建档扩展（全可选，向后兼容）──
  /** 规格，如 0.6g 15ml/瓶 */
  spec?: string
  /** 数量，如 1瓶 / 1盒 */
  quantity?: string
  /** 频次，如 每日3次 / 必要时 */
  frequency?: string
  /** 给药途径，如 口服 */
  route?: string
  /** 备注 */
  note?: string
}

// ── PRD-017 识图建档：解析结果 / 单据档案（与 server DTO、agent 契约同源）──

/** agent 单图解析结果（协议层，TECH-035 §5.1） */
export interface ParsedDocResult {
  fileId: string
  ok: boolean
  docType?: string
  confidence?: 'high' | 'low'
  lowConfidenceFields?: string[]
  data?: Record<string, any>
  error?: { code: string; message: string }
}

/** 保存时提交的单据档案（行=图片；parsed_json = {docType,confidence,lowConfidenceFields,data}） */
export interface MedicalDocumentInput {
  file_id: string
  doc_type: string
  status: 'success' | 'failed'
  confidence?: 'high' | 'low'
  parsed_json?: Record<string, any>
  error_note?: string
  /** 仅 getOne 返回（档案更新时间，展示"识别于"用） */
  updated_at?: string
}

/** 020 类型化后的医疗就诊类型（与后端 VisitType 枚举键一一对应） */
export type MedicalVisitType = 'checkup' | 'sick' | 'vaccine' | 'other'
/** 已废弃类型（仅老数据展示/编辑归一用） */
export type LegacyMedicalVisitType = 'blood' | 'allergy'
/** feed subtype / archive visit_type 过滤白名单（'unknown' = 物化 NULL 老数据） */
export type MedicalSubtypeFilter = MedicalVisitType | LegacyMedicalVisitType | 'unknown'

/** 疫苗参考库一行（GET vaccine/schedule，snake 字段 = 后端原始列） */
export interface VaccineScheduleRow {
  vkey: string
  name: string
  category: 'free' | 'paid'
  dose_seq: number
  dose_label: string
  month_min: number | null
  month_rec: number
  month_max: number | null
  note: string | null
}

/** 接种反应枚举（键与后端 VaccineReaction 对齐，文案见 constants VACCINE_REACTION_LABELS） */
export type VaccineReactionKey =
  | 'none'
  | 'fever'
  | 'local_redness'
  | 'induration'
  | 'rash'
  | 'sleepy_irritable'
  | 'other'
/** 接种部位枚举（键与后端 VaccineSite 对齐） */
export type VaccineSiteKey = 'left_arm' | 'right_arm' | 'thigh' | 'oral' | 'other' | 'unknown'
/** 儿保里程碑维度（与后端 CheckupMilestoneDim 对齐） */
export type CheckupMilestoneDimKey = 'gross' | 'fine' | 'language' | 'cognitive' | 'social'
/** 里程碑三态（与后端 MilestoneStatus 对齐） */
export type MilestoneStatusKey = 'ok' | 'watch' | 'na'

export interface MilestoneItem {
  dim: CheckupMilestoneDimKey
  status: MilestoneStatusKey
  note?: string
}

export interface QaItem {
  question: string
  answer?: string
}

export interface MedicalRecord {
  id: string
  baby_id: string
  visit_date: string
  visit_time?: string | null
  visit_type?: MedicalVisitType | LegacyMedicalVisitType | null
  hospital?: string | null
  doctor?: string | null
  result_summary?: string | null
  diagnosis?: string | null
  medications?: MedicationItem[] | null
  photo_ids?: string[] | null
  follow_up_date?: string | null
  follow_up_time?: string | null
  note?: string | null

  // ── 020 类型化扩展列（mapRow 原样透出，均为可选）──
  vaccine_name?: string | null
  vaccine_schedule_key?: string | null
  vaccine_dose_seq?: number | null
  vaccine_site?: VaccineSiteKey | null
  vaccine_batch?: string | null
  vaccine_reactions?: VaccineReactionKey[] | null
  vaccine_reaction_note?: string | null
  checkup_height_mm?: number | null
  checkup_weight_g?: number | null
  checkup_head_mm?: number | null
  checkup_milestones?: MilestoneItem[] | null
  checkup_assessment?: string | null
  checkup_qa?: QaItem[] | null
  checkup_growth_sync?: 'none' | 'synced' | 'overwritten' | 'skipped' | null
  sick_complaint?: string | null
  sick_symptom_flags?: string[] | null
  /** 单据解析档案（仅 getOne 返回；列表/档案接口不携带） */
  documents?: MedicalDocumentInput[] | null
  /** 老疫苗记录无疫苗名 → 前端展示"补全为疫苗记录"引导（US-10） */
  needsCompletion?: boolean
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

  // ── 020 类型化字段（各类型只提交自己分区字段）──
  vaccine_name?: string
  vaccine_schedule_key?: string | null
  vaccine_dose_seq?: number
  vaccine_site?: string
  vaccine_batch?: string
  vaccine_reactions?: string[]
  vaccine_reaction_note?: string
  checkup_height_mm?: number
  checkup_weight_g?: number
  checkup_head_mm?: number
  checkup_milestones?: MilestoneItem[]
  checkup_assessment?: string
  checkup_qa?: QaItem[]
  checkup_growth_sync?: 'none' | 'synced' | 'overwritten' | 'skipped'
  sick_complaint?: string
  sick_symptom_flags?: string[]
  /** 单据解析档案（PRD-017 识图；随保存全量提交，服务端 upsert + 按 photo_ids 清理） */
  documents?: MedicalDocumentInput[]
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

// ── 020 疫苗本（TECH-011 §3.4，结构对齐后端 vaccine-book.core）──

export interface VaccineBookDose {
  dose_seq: number
  dose_label: string
  month_min: number | null
  month_rec: number
  month_max: number | null
  status: 'done' | 'pending' | 'overdue' | 'upcoming' | 'replaced' | 'hidden'
  date?: string
  record_id?: string
}

export interface VaccineCard {
  vkey: string
  name: string
  category: 'free' | 'paid'
  track_flag: boolean
  replaced_flag: boolean
  doses: VaccineBookDose[]
}

export interface NextVaccine {
  vkey: string
  name: string
  dose_seq: number
  dose_label: string
  month_rec: number
  reason: 'overdue' | 'window' | 'near'
}

export interface VaccineBook {
  baby_months: number
  overview: { done_doses: number; total_tracked: number; todo_doses: number; overdue_doses: number }
  next: NextVaccine[]
  vaccines: VaccineCard[]
  custom_vaccines: { name: string; shot_count: number; last_date?: string }[]
}

export interface VaccineSettingPayload {
  baby_id: string
  vaccine_key: string
  track_flag?: boolean
  replaced_flag?: boolean
  replaced_note?: string
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

  /**
   * 识图解析（PRD-017/TECH-035）：解析不落库，结果经用户确认后随保存提交（documents）。
   * 90s 超时 = 6 图 × 并发 3 的最坏预算余量（实测 5 图端到端 ~7s）；onTask 供「取消」abort。
   */
  parseImages: (
    familyId: string,
    babyId: string,
    fileIds: string[],
    onTask?: (task: Taro.RequestTask<any>) => void,
  ): Promise<{ results: ParsedDocResult[] }> =>
    request<{ results: ParsedDocResult[] }>(`/api/family/${familyId}/records/medical/parse-images`, {
      method: 'POST',
      data: { baby_id: babyId, file_ids: fileIds },
      timeoutMs: 90_000,
      onTask,
    }),

  // ── 020 类型化资源（PD-P0-05，供疫苗本页 / 儿保档案页消费）──

  /** 全量 keyset 分页档案（非 7 天窗口）；visit_type 过滤，before_date 翻页 */
  getArchive: (
    familyId: string,
    babyId: string,
    params?: { visit_type?: string; before_date?: string },
  ): Promise<MedicalListResponse> => {
    const q: string[] = [`baby_id=${babyId}`]
    if (params?.visit_type) q.push(`visit_type=${encodeURIComponent(params.visit_type)}`)
    if (params?.before_date) q.push(`before_date=${encodeURIComponent(params.before_date)}`)
    return request<MedicalListResponse>(`/api/family/${familyId}/records/medical/archive?${q.join('&')}`)
  },

  /** 疫苗参考程序库全量（疫苗本渲染 + 记录表单疫苗联想） */
  getVaccineSchedule: (familyId: string): Promise<VaccineScheduleRow[]> =>
    request<VaccineScheduleRow[]>(`/api/family/${familyId}/records/medical/vaccine/schedule`),

  /** 疫苗本：程序进度状态机结果（US-03） */
  getVaccineBook: (familyId: string, babyId: string): Promise<VaccineBook> =>
    request<VaccineBook>(`/api/family/${familyId}/records/medical/vaccine/book?baby_id=${babyId}`),

  /** 宝宝级疫苗偏好 upsert（跟踪/替代标记） */
  patchVaccineSetting: (familyId: string, data: VaccineSettingPayload) =>
    request<{ baby_id: string; vaccine_key: string }>(`/api/family/${familyId}/records/medical/vaccine/settings`, {
      method: 'PATCH',
      data,
    }),
}
