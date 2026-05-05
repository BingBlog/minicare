import { request } from './http'
import type { TodayRecord, RecordItem } from './types'
import { sleepApi } from './sleep'
import type {
  SleepRecord,
  StartSleepDto,
  EndSleepDto,
  CreateCompleteSleepDto,
  UpdateSleepDto,
} from './sleep'
import { feedingApi } from './feeding'
import type { FeedingRecord, CreateFeedingDto, UpdateFeedingDto } from './feeding'
import { diaperApi } from './diaper'
import type { DiaperRecord, CreateDiaperDto, UpdateDiaperDto } from './diaper'
import { activityApi } from './activity'
import type { ActivityRecord, CreateActivityDto, UpdateActivityDto } from './activity'
import { healthApi } from './health'
import type { HealthRecord, CreateHealthDto, UpdateHealthDto } from './health'
import { growthApi } from './growth'
import type { GrowthRecord, CreateGrowthDto, UpdateGrowthDto } from './growth'
import { medicalApi } from './medical'
import type { MedicalRecord, CreateMedicalDto, UpdateMedicalDto } from './medical'
import { symptomApi } from './symptom'
import type { SymptomRecord, CreateSymptomDto, UpdateSymptomDto } from './symptom'

function withType<T extends { id: string }>(type: string, items: T[]): T[] {
  return items.map((r) => ({ ...r, type }))
}

export const recordsApi = {
  today: (familyId: string, date?: string) =>
    request<TodayRecord[]>(`/api/family/${familyId}/records/today${date ? `?date=${date}` : ''}`),
  remove: (familyId: string, type: string, id: string) =>
    request<void>(`/api/family/${familyId}/records/${type}/${id}`, { method: 'DELETE' }),
  feeding: {
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      feedingApi.list(familyId, babyId, params)
        .then((items) => withType('feeding', items)),
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
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) => {
      const query: string[] = [`baby_id=${babyId}`]
      if (params?.limit != null) query.push(`limit=${params.limit}`)
      if (params?.offset != null) query.push(`offset=${params.offset}`)
      return request<SleepRecord[]>(`/api/family/${familyId}/records/sleep?${query.join('&')}`)
        .then((items) => withType('sleep', items))
    },
    getOngoing: sleepApi.getOngoing,
    startSleep: sleepApi.startSleep,
    endSleep: sleepApi.endSleep,
    createComplete: sleepApi.createComplete,
    getOne: sleepApi.getOne,
    update: sleepApi.update,
    remove: sleepApi.remove,
  },
  diaper: {
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      diaperApi.list(familyId, babyId, params)
        .then((items) => withType('diaper', items)),
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
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      activityApi.list(familyId, babyId, params)
        .then((items) => withType('activity', items)),
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
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      healthApi.list(familyId, babyId, params)
        .then((items) => withType('health', items)),
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
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      growthApi.list(familyId, babyId, params)
        .then((items) => withType('growth', items)),
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
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      medicalApi.list(familyId, babyId, params)
        .then((items) => withType('medical', items)),
    create: (familyId: string, data: CreateMedicalDto) =>
      medicalApi.create(familyId, data),
    update: (familyId: string, id: string, data: UpdateMedicalDto) =>
      medicalApi.update(familyId, id, data),
    remove: (familyId: string, id: string) =>
      medicalApi.remove(familyId, id),
    getOne: (familyId: string, id: string) =>
      medicalApi.getOne(familyId, id),
  },
  symptom: {
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      symptomApi.list(familyId, babyId, params)
        .then((items) => withType('symptom', items)),
    create: (familyId: string, data: CreateSymptomDto) =>
      symptomApi.create(familyId, data),
    update: (familyId: string, id: string, data: UpdateSymptomDto) =>
      symptomApi.update(familyId, id, data),
    remove: (familyId: string, id: string) =>
      symptomApi.remove(familyId, id),
    getOne: (familyId: string, id: string) =>
      symptomApi.getOne(familyId, id),
  },
}

export type {
  SleepRecord, StartSleepDto, EndSleepDto, CreateCompleteSleepDto, UpdateSleepDto,
  FeedingRecord, CreateFeedingDto, UpdateFeedingDto,
  DiaperRecord, CreateDiaperDto, UpdateDiaperDto,
  ActivityRecord, CreateActivityDto, UpdateActivityDto,
  HealthRecord, CreateHealthDto, UpdateHealthDto,
  GrowthRecord, CreateGrowthDto, UpdateGrowthDto,
  MedicalRecord, CreateMedicalDto, UpdateMedicalDto,
  SymptomRecord, CreateSymptomDto, UpdateSymptomDto,
}

// Re-export for backward compatibility
export type { TodayRecord, RecordItem }
