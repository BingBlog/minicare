import { request } from './http'

export interface AppConfigResponse {
  enums?: Record<string, Array<{ value: string; label: string }>>
  limits?: Record<string, unknown>
}

export async function fetchAppConfig() {
  return request<AppConfigResponse>('/api/config', { auth: false })
}

