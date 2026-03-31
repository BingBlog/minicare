/**
 * Family 模块 API
 * 路由：/api/family/*
 */
import { request } from './http'
import type { Family, FamilyMember } from './types'

export const familyApi = {
  /** 获取我的家庭列表 */
  getMine: () =>
    request<Family[]>('/api/family/mine'),

  /** 创建家庭 */
  create: (name: string) =>
    request<Family>('/api/family', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  /** 获取家庭成员列表 */
  getMembers: (familyId: string) =>
    request<FamilyMember[]>(`/api/family/${familyId}/members`),

  /** 生成邀请码 */
  createInviteCode: (familyId: string) =>
    request<{ code: string }>(`/api/family/${familyId}/invite`, {
      method: 'POST',
    }),

  /**
   * 通过邀请码加入家庭
   * @param code 6 位邀请码
   */
  join: (code: string) =>
    request<Family>('/api/family/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
}
