import { request } from './http'
import type { Family, FamilyMember } from './types'

export interface GetMembersResponse {
  members: FamilyMember[]
  currentUserRole: 'owner' | 'member'
}

export interface PendingInvite {
  id: string
  family_id: string
  family_name: string
  inviter_name: string | null
}

export const familyApi = {
  getMine: () => request<Family[]>('/api/family/mine'),
  create: (name: string) =>
    request<Family>('/api/family', { method: 'POST', data: { name } }),
  getMembers: async (familyId: string): Promise<GetMembersResponse> => {
    const raw = await request<GetMembersResponse | FamilyMember[]>(
      `/api/family/${familyId}/members`,
    )
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
  getPendingInvites: () =>
    request<PendingInvite[]>('/api/family/pending-invites'),
  acceptInvite: (memberId: string) =>
    request<{ familyId: string; success: boolean }>(
      `/api/family/pending-invites/${memberId}/accept`,
      { method: 'POST' },
    ),
  declineInvite: (memberId: string) =>
    request<{ success: boolean }>(
      `/api/family/pending-invites/${memberId}/decline`,
      { method: 'POST' },
    ),
  leave: (familyId: string) =>
    request<{ success: boolean }>(
      `/api/family/${familyId}/leave`,
      { method: 'POST' },
    ),
}
