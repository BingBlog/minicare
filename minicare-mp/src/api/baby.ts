import { request } from './http'
import type { Baby } from './types'

export const babyApi = {
  get: (familyId: string) => request<Baby>(`/api/family/${familyId}/baby`),
}
