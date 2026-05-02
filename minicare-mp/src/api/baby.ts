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
  get: (familyId: string) => request<Baby>(`/api/family/${familyId}/baby`),
  /** 创建宝宝档案（每家庭唯一，重复创建返回 409） */
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
