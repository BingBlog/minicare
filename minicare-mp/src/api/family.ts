import { request } from './http'
import type { Family } from './types'

export const familyApi = {
  getMine: () => request<Family[]>('/api/family/mine'),
}
