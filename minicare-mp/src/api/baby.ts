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
  birth_head_cm?: number
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
    avatar_url: string
    /** 出生数据（可传 null 清空） */
    birth_weight_g: number | null
    birth_height_cm: number | null
    birth_head_cm: number | null
    /** 每日补充计划：营养素 key 数组（PRD-018）；空数组 = 未配置 */
    supplement_plan: string[]
  }>) =>
    request<Baby>(`/api/family/${familyId}/baby/${babyId}`, {
      method: 'PATCH',
      data,
    }),
  remove: (familyId: string, babyId: string) =>
    request<{ success: boolean }>(
      `/api/family/${familyId}/baby/${babyId}`,
      { method: 'DELETE' },
    ),
}
