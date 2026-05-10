import { request } from './http'
import type { Baby } from './types'

export interface CreateBabyDto {
  name: string
  gender: 'male' | 'female'
  birth_date: string
  allergy_types?: string[]
  allergy_level?: string
  birth_weight_g?: number
  birth_height_cm?: number
}

export const babyApi = {
  getMine: () => request<Baby[]>('/api/baby/mine'),
  get: (familyId: string) => request<Baby>(`/api/family/${familyId}/baby`),
  list: (familyId: string) => request<Baby[]>(`/api/family/${familyId}/baby/list`),
  create: (familyId: string, data: CreateBabyDto) =>
    request<Baby>(`/api/family/${familyId}/baby`, { method: 'POST', data }),
  update: (familyId: string, babyId: string, data: Partial<{
    name: string
    birth_date: string
    gender: 'male' | 'female' | 'unknown'
    allergy_types: string[]
    allergy_level: string
  }>) =>
    request<Baby>(`/api/family/${familyId}/baby/${babyId}`, {
      method: 'PATCH',
      data,
    }),
}
