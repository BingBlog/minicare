import { request } from './http'
import type { ScheduleItemTypeConfig } from '@/lib/schedule'

export interface AppConfigResponse {
  version?: string
  enums?: Record<string, Array<{ value: string; label: string }>>
  limits?: Record<string, unknown>
  supplements?: Array<{ key: string; label: string; unit: string; hint: string; group: string }>
  /** 日程项类型清单（PRD-009，服务端权威声明表下发） */
  scheduleItemTypes?: ScheduleItemTypeConfig
}

export async function fetchAppConfig() {
  return request<AppConfigResponse>('/api/config', { auth: false })
}

