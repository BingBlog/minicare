import { request } from './http'

/** 已绑音箱设备（TECH-008 §3.1，GET /api/family/:familyId/devices） */
export interface SpeakerDevice {
  id: string
  device_name: string
  device_type: string
  mac_address: string | null
  status: 'active' | 'revoked'
  bound_at: string
  last_seen_at: string | null
  created_at: string
}

export const deviceApi = {
  /** 已绑设备列表（家庭成员） */
  list: (familyId: string) =>
    request<SpeakerDevice[]>(`/api/family/${familyId}/devices`),

  /** 生成/刷新绑定码（仅管理员，旧码自动撤销） */
  genCode: (familyId: string) =>
    request<{ code: string }>(`/api/family/${familyId}/devices/binding-code`, {
      method: 'POST',
    }),

  /** 解绑设备（仅管理员，token 立即失效） */
  unbind: (familyId: string, deviceId: string) =>
    request<{ ok: boolean }>(`/api/family/${familyId}/devices/${deviceId}`, {
      method: 'DELETE',
    }),
}
