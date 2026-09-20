import { request } from './http'
import type { TodayRecord, RecordItem } from './types'
import { sleepApi } from './sleep'
import type {
  SleepRecord,
  SleepListParams,
  StartSleepDto,
  EndSleepDto,
  CreateCompleteSleepDto,
  UpdateSleepDto,
} from './sleep'
import { feedingApi } from './feeding'
import type { FeedingRecord, FeedingListResponse, FeedingListParams, CreateFeedingDto, UpdateFeedingDto } from './feeding'
import { diaperApi } from './diaper'
import type { DiaperRecord, DiaperListParams, CreateDiaperDto, UpdateDiaperDto } from './diaper'
import { activityApi } from './activity'
import type { ActivityRecord, ActivityListParams, CreateActivityDto, UpdateActivityDto } from './activity'
import { healthApi } from './health'
import type { HealthRecord, HealthListParams, CreateHealthDto, UpdateHealthDto } from './health'
import { growthApi } from './growth'
import type { GrowthRecord, GrowthListParams, CreateGrowthDto, UpdateGrowthDto } from './growth'
import { medicalApi } from './medical'
import type {
  MedicalRecord,
  MedicalListParams,
  CreateMedicalDto,
  UpdateMedicalDto,
  VaccineSettingPayload,
} from './medical'
import { symptomApi } from './symptom'
import type { SymptomRecord, SymptomListParams, CreateSymptomDto, UpdateSymptomDto } from './symptom'
import { medicationApi } from './medication'
import type { MedicationRecord, CreateMedicationRecordDto, UpdateMedicationRecordDto } from './medication'

function withType<T extends { id: string }>(type: string, items: T[]): T[] {
  return items.map((r) => ({ ...r, type }))
}

/** 统一日期分页响应格式 */
export interface DatePaginatedResponse<T = RecordItem> {
  items: T[]
  nextBeforeDate: string | null
}

/** 统一日期分页参数 */
export interface DateListParams {
  before_date?: string
}

export type FeedType =
  | 'feeding'
  | 'sleep'
  | 'diaper'
  | 'activity'
  | 'health'
  | 'growth'
  | 'medical'
  | 'symptom'

export interface FeedSummary {
  title: string
  tags?: string[]
  value?: string
  unit?: string
  theme?: 'pink' | 'warm' | 'purple' | 'fever'
  active?: boolean
}

export interface FeedItem {
  id: string
  type: FeedType
  event_time: string
  note?: string | null
  summary: FeedSummary
  detail?: Record<string, unknown>
}

export interface FeedListParams {
  baby_id: string
  limit?: number
  cursor?: string
  type?: 'all' | FeedType
  /** YYYY-MM-DD，按 event_time 自然日筛选 */
  date?: string
}

export interface FeedListResponse {
  items: FeedItem[]
  nextCursor: string | null
  hasMore: boolean
  /** 符合条件的记录总数（仅首屏返回） */
  totalCount?: number
}

export const recordsApi = {
  today: (familyId: string, date?: string) =>
    request<TodayRecord[]>(`/api/family/${familyId}/records/today${date ? `?date=${date}` : ''}`),
  feed: {
    list: (familyId: string, params: FeedListParams) => {
      const query: string[] = [`baby_id=${encodeURIComponent(params.baby_id)}`]
      if (params.limit != null) query.push(`limit=${params.limit}`)
      if (params.cursor) query.push(`cursor=${encodeURIComponent(params.cursor)}`)
      if (params.type) query.push(`type=${encodeURIComponent(params.type)}`)
      if (params.date) query.push(`date=${encodeURIComponent(params.date)}`)
      return request<FeedListResponse>(`/api/family/${familyId}/records/feed?${query.join('&')}`)
    },
  },
  remove: (familyId: string, type: string, id: string) =>
    request<void>(`/api/family/${familyId}/records/${type}/${id}`, { method: 'DELETE' }),
  feeding: {
    list: (familyId: string, babyId: string, params?: FeedingListParams) =>
      feedingApi.list(familyId, babyId, params)
        .then((res) => ({
          items: withType('feeding', res.items),
          nextBeforeDate: res.nextBeforeDate,
        })),
    create: (familyId: string, data: CreateFeedingDto) =>
      feedingApi.create(familyId, data),
    update: (familyId: string, id: string, data: UpdateFeedingDto) =>
      feedingApi.update(familyId, id, data),
    remove: (familyId: string, id: string) =>
      feedingApi.remove(familyId, id),
    getOne: (familyId: string, id: string) =>
      feedingApi.getOne(familyId, id),
  },
  sleep: {
    list: (familyId: string, babyId: string, params?: DateListParams) =>
      sleepApi.list(familyId, babyId, params as SleepListParams)
        .then((res) => ({ items: withType('sleep', res.items), nextBeforeDate: res.nextBeforeDate })),
    getOngoing: sleepApi.getOngoing,
    startSleep: sleepApi.startSleep,
    endSleep: sleepApi.endSleep,
    createComplete: sleepApi.createComplete,
    getOne: sleepApi.getOne,
    update: sleepApi.update,
    remove: sleepApi.remove,
  },
  diaper: {
    list: (familyId: string, babyId: string, params?: DateListParams) =>
      diaperApi.list(familyId, babyId, params as DiaperListParams)
        .then((res) => ({ items: withType('diaper', res.items), nextBeforeDate: res.nextBeforeDate })),
    create: (familyId: string, data: CreateDiaperDto) =>
      diaperApi.create(familyId, data),
    update: (familyId: string, id: string, data: UpdateDiaperDto) =>
      diaperApi.update(familyId, id, data),
    remove: (familyId: string, id: string) =>
      diaperApi.remove(familyId, id),
    getOne: (familyId: string, id: string) =>
      diaperApi.getOne(familyId, id),
  },
  activity: {
    list: (familyId: string, babyId: string, params?: DateListParams) =>
      activityApi.list(familyId, babyId, params as ActivityListParams)
        .then((res) => ({ items: withType('activity', res.items), nextBeforeDate: res.nextBeforeDate })),
    create: (familyId: string, data: CreateActivityDto) =>
      activityApi.create(familyId, data),
    update: (familyId: string, id: string, data: UpdateActivityDto) =>
      activityApi.update(familyId, id, data),
    remove: (familyId: string, id: string) =>
      activityApi.remove(familyId, id),
    getOne: (familyId: string, id: string) =>
      activityApi.getOne(familyId, id),
  },
  health: {
    list: (familyId: string, babyId: string, params?: DateListParams) =>
      healthApi.list(familyId, babyId, params as HealthListParams)
        .then((res) => ({ items: withType('health', res.items), nextBeforeDate: res.nextBeforeDate })),
    create: (familyId: string, data: CreateHealthDto) =>
      healthApi.create(familyId, data),
    update: (familyId: string, id: string, data: UpdateHealthDto) =>
      healthApi.update(familyId, id, data),
    remove: (familyId: string, id: string) =>
      healthApi.remove(familyId, id),
    getOne: (familyId: string, id: string) =>
      healthApi.getOne(familyId, id),
  },
  growth: {
    list: (familyId: string, babyId: string, params?: DateListParams) =>
      growthApi.list(familyId, babyId, params as GrowthListParams)
        .then((res) => ({ items: withType('growth', res.items), nextBeforeDate: res.nextBeforeDate })),
    getLatest: growthApi.getLatest,
    create: (familyId: string, data: CreateGrowthDto) =>
      growthApi.create(familyId, data),
    update: (familyId: string, id: string, data: UpdateGrowthDto) =>
      growthApi.update(familyId, id, data),
    remove: (familyId: string, id: string) =>
      growthApi.remove(familyId, id),
    getOne: (familyId: string, id: string) =>
      growthApi.getOne(familyId, id),
  },
  medical: {
    list: (familyId: string, babyId: string, params?: DateListParams) =>
      medicalApi.list(familyId, babyId, params as MedicalListParams)
        .then((res) => ({ items: withType('medical', res.items), nextBeforeDate: res.nextBeforeDate })),
    create: (familyId: string, data: CreateMedicalDto) =>
      medicalApi.create(familyId, data),
    update: (familyId: string, id: string, data: UpdateMedicalDto) =>
      medicalApi.update(familyId, id, data),
    remove: (familyId: string, id: string) =>
      medicalApi.remove(familyId, id),
    getOne: (familyId: string, id: string) =>
      medicalApi.getOne(familyId, id),
    getNextFollowUp: (familyId: string, babyId: string) =>
      medicalApi.getNextFollowUp(familyId, babyId),
    /** 疫苗参考程序（US-02 联想数据源）/ 疫苗本状态机 / 疫苗偏好 */
    getVaccineSchedule: (familyId: string) =>
      medicalApi.getVaccineSchedule(familyId),
    getVaccineBook: (familyId: string, babyId: string) =>
      medicalApi.getVaccineBook(familyId, babyId),
    patchVaccineSetting: (familyId: string, data: VaccineSettingPayload) =>
      medicalApi.patchVaccineSetting(familyId, data),
  },
  symptom: {
    list: (familyId: string, babyId: string, params?: DateListParams) =>
      symptomApi.list(familyId, babyId, params as SymptomListParams)
        .then((res) => ({ items: withType('symptom', res.items), nextBeforeDate: res.nextBeforeDate })),
    create: (familyId: string, data: CreateSymptomDto) =>
      symptomApi.create(familyId, data),
    update: (familyId: string, id: string, data: UpdateSymptomDto) =>
      symptomApi.update(familyId, id, data),
    remove: (familyId: string, id: string) =>
      symptomApi.remove(familyId, id),
    getOne: (familyId: string, id: string) =>
      symptomApi.getOne(familyId, id),
  },
  medication: {
    list: (familyId: string, babyId: string, date?: string) =>
      medicationApi.listRecords(familyId, babyId, date)
        .then((items) => withType('medication', items)),
    create: (familyId: string, data: CreateMedicationRecordDto) =>
      medicationApi.createRecord(familyId, data),
    update: (familyId: string, id: string, data: UpdateMedicationRecordDto) =>
      medicationApi.updateRecord(familyId, id, data),
    remove: (familyId: string, id: string) =>
      medicationApi.removeRecord(familyId, id),
    getOne: (familyId: string, id: string) =>
      medicationApi.getRecord(familyId, id),
  },
}

export type {
  SleepRecord, SleepListParams, StartSleepDto, EndSleepDto, CreateCompleteSleepDto, UpdateSleepDto,
  FeedingRecord, FeedingListResponse, FeedingListParams, CreateFeedingDto, UpdateFeedingDto,
  DiaperRecord, DiaperListParams, CreateDiaperDto, UpdateDiaperDto,
  ActivityRecord, ActivityListParams, CreateActivityDto, UpdateActivityDto,
  HealthRecord, HealthListParams, CreateHealthDto, UpdateHealthDto,
  GrowthRecord, GrowthListParams, CreateGrowthDto, UpdateGrowthDto,
  MedicalRecord, MedicalListParams, CreateMedicalDto, UpdateMedicalDto,
  SymptomRecord, SymptomListParams, CreateSymptomDto, UpdateSymptomDto,
  MedicationRecord, CreateMedicationRecordDto, UpdateMedicationRecordDto,
}

// Re-export for backward compatibility
export type { TodayRecord, RecordItem }
