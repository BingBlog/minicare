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

function buildListQuery(babyId: string, limit?: number, offset?: number): string {
  const params: string[] = [`baby_id=${babyId}`]
  if (limit != null) params.push(`limit=${limit}`)
  if (offset != null) params.push(`offset=${offset}`)
  return params.join('&')
}

function withType<T extends Record<string, unknown>>(type: string, items: T[]): T[] {
  return items.map((r) => ({ ...r, type }))
}

export const recordsApi = {
  today: (familyId: string) => request<TodayRecord[]>(`/api/family/${familyId}/records/today`),
  remove: (familyId: string, type: string, id: string) =>
    request<void>(`/api/family/${familyId}/records/${type}/${id}`, { method: 'DELETE' }),
  feeding: {
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      request<Record<string, unknown>[]>(`/api/family/${familyId}/records/feeding?${buildListQuery(babyId, params?.limit, params?.offset)}`)
        .then((items) => withType('feeding', items)),
    create: (familyId: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/feeding`, {
        method: 'POST',
        data,
      }),
    update: (familyId: string, id: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/feeding/${id}`, {
        method: 'PATCH',
        data,
      }),
    remove: (familyId: string, id: string) =>
      request<void>(`/api/family/${familyId}/records/feeding/${id}`, { method: 'DELETE' }),
    getOne: (familyId: string, id: string) =>
      request<Record<string, unknown>>(`/api/family/${familyId}/records/feeding/${id}`),
  },
  sleep: {
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      request<Record<string, unknown>[]>(`/api/family/${familyId}/records/sleep?${buildListQuery(babyId, params?.limit, params?.offset)}`)
        .then((items) => withType('sleep', items)),
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
      request<Record<string, unknown>[]>(`/api/family/${familyId}/records/diaper?${buildListQuery(babyId, params?.limit, params?.offset)}`)
        .then((items) => withType('diaper', items)),
    create: (familyId: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/diaper`, {
        method: 'POST',
        data,
      }),
    update: (familyId: string, id: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/diaper/${id}`, {
        method: 'PATCH',
        data,
      }),
    remove: (familyId: string, id: string) =>
      request<void>(`/api/family/${familyId}/records/diaper/${id}`, { method: 'DELETE' }),
    getOne: (familyId: string, id: string) =>
      request<Record<string, unknown>>(`/api/family/${familyId}/records/diaper/${id}`),
  },
  activity: {
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      request<Record<string, unknown>[]>(`/api/family/${familyId}/records/activity?${buildListQuery(babyId, params?.limit, params?.offset)}`)
        .then((items) => withType('activity', items)),
    create: (familyId: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/activity`, {
        method: 'POST',
        data,
      }),
    update: (familyId: string, id: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/activity/${id}`, {
        method: 'PATCH',
        data,
      }),
    remove: (familyId: string, id: string) =>
      request<void>(`/api/family/${familyId}/records/activity/${id}`, { method: 'DELETE' }),
    getOne: (familyId: string, id: string) =>
      request<Record<string, unknown>>(`/api/family/${familyId}/records/activity/${id}`),
  },
  health: {
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      request<Record<string, unknown>[]>(`/api/family/${familyId}/records/health?${buildListQuery(babyId, params?.limit, params?.offset)}`)
        .then((items) => withType('health', items)),
    create: (familyId: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/health`, {
        method: 'POST',
        data,
      }),
    update: (familyId: string, id: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/health/${id}`, {
        method: 'PATCH',
        data,
      }),
    remove: (familyId: string, id: string) =>
      request<void>(`/api/family/${familyId}/records/health/${id}`, { method: 'DELETE' }),
    getOne: (familyId: string, id: string) =>
      request<Record<string, unknown>>(`/api/family/${familyId}/records/health/${id}`),
  },
  growth: {
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      request<Record<string, unknown>[]>(`/api/family/${familyId}/records/growth?${buildListQuery(babyId, params?.limit, params?.offset)}`)
        .then((items) => withType('growth', items)),
    create: (familyId: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/growth`, {
        method: 'POST',
        data,
      }),
    update: (familyId: string, id: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/growth/${id}`, {
        method: 'PATCH',
        data,
      }),
    remove: (familyId: string, id: string) =>
      request<void>(`/api/family/${familyId}/records/growth/${id}`, { method: 'DELETE' }),
    getOne: (familyId: string, id: string) =>
      request<Record<string, unknown>>(`/api/family/${familyId}/records/growth/${id}`),
  },
  medical: {
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      request<Record<string, unknown>[]>(`/api/family/${familyId}/records/medical?${buildListQuery(babyId, params?.limit, params?.offset)}`)
        .then((items) => withType('medical', items)),
    create: (familyId: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/medical`, {
        method: 'POST',
        data,
      }),
    update: (familyId: string, id: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/medical/${id}`, {
        method: 'PATCH',
        data,
      }),
    remove: (familyId: string, id: string) =>
      request<void>(`/api/family/${familyId}/records/medical/${id}`, { method: 'DELETE' }),
    getOne: (familyId: string, id: string) =>
      request<Record<string, unknown>>(`/api/family/${familyId}/records/medical/${id}`),
  },
  symptom: {
    list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
      request<Record<string, unknown>[]>(`/api/family/${familyId}/records/symptom?${buildListQuery(babyId, params?.limit, params?.offset)}`)
        .then((items) => withType('symptom', items)),
    create: (familyId: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/symptom`, {
        method: 'POST',
        data,
      }),
    update: (familyId: string, id: string, data: Record<string, unknown>) =>
      request<{ id: string }>(`/api/family/${familyId}/records/symptom/${id}`, {
        method: 'PATCH',
        data,
      }),
    remove: (familyId: string, id: string) =>
      request<void>(`/api/family/${familyId}/records/symptom/${id}`, { method: 'DELETE' }),
    getOne: (familyId: string, id: string) =>
      request<Record<string, unknown>>(`/api/family/${familyId}/records/symptom/${id}`),
  },
}

export type { SleepRecord, StartSleepDto, EndSleepDto, CreateCompleteSleepDto, UpdateSleepDto }
