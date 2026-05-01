import { request } from './http'
import type { Family, FamilyMember } from './types'

export const familyApi = {
  getMine: () => request<Family[]>('/api/family/mine'),
  getMembers: (familyId: string) =>
    request<FamilyMember[]>(`/api/family/${familyId}/members`),
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
