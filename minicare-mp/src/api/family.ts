import { request } from './http'
import type { Family, FamilyMember } from './types'

export interface GetMembersResponse {
  members: FamilyMember[]
  currentUserRole: 'owner' | 'member'
}

export const familyApi = {
  getMine: () => request<Family[]>('/api/family/mine'),
  /** 创建家庭（创建者自动成为 owner） */
  create: (name: string) =>
    request<Family>('/api/family', { method: 'POST', data: { name } }),
  /**
   * 获取家庭成员列表
   * 兼容服务端新旧两种返回格式：
   *   旧：FamilyMember[]（服务端未部署时）
   *   新：{ members: FamilyMember[], currentUserRole: 'owner' | 'member' }
   */
  getMembers: async (familyId: string): Promise<GetMembersResponse> => {
    const raw = await request<GetMembersResponse | FamilyMember[]>(
      `/api/family/${familyId}/members`,
    )
    // 旧格式：直接是数组
    if (Array.isArray(raw)) {
      return { members: raw, currentUserRole: 'member' }
    }
    return raw
  },
  inviteByPhone: (familyId: string, phone: string) =>
    request<{ memberId: string; status: string }>(
      `/api/family/${familyId}/invite-by-phone`,
      { method: 'POST', data: { phone } },
    ),
  removeMember: (familyId: string, memberId: string) =>
    request<{ success: boolean }>(
      `/api/family/${familyId}/members/${memberId}`,
      { method: 'DELETE' },
    ),
}
