import { request } from './http'
import type { TodayRecord } from './types'

export const recordsApi = {
  today: (familyId: string) => request<TodayRecord[]>(`/api/family/${familyId}/records/today`),
  remove: (familyId: string, type: string, id: string) =>
    request<void>(`/api/family/${familyId}/records/${type}/${id}`, { method: 'DELETE' }),
  feeding: {
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
  diaper: {
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
}
