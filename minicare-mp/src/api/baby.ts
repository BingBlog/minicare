import { request } from './http'
import type { Baby } from './types'

export const babyApi = {
  get: (familyId: string) => request<Baby>(`/api/family/${familyId}/baby`),
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
