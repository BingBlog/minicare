/**
 * Family 模块 API
 * 路由：/api/family/*
 *
 * 权限模型：
 *   role=1（owner）：创建者，可邀请/移除成员、修改宝宝档案、查看和新增所有记录
 *   role=2（member）：普通成员，可查看和新增所有记录
 *
 * 邀请流程（v2，手机号邀请）：
 *   邀请方：inviteByPhone() → 创建 pending 记录
 *   被邀请方：登录后后端自动激活 pending → activatedFamilyIds 返回给前端
 */
import { request } from './http'
import type { Family, FamilyMember } from './types'

export interface GetMembersResponse {
  members: FamilyMember[]
  currentUserRole: 'owner' | 'member'
}

export const familyApi = {
  /**
   * 获取我的家庭列表
   */
  getMine: () =>
    request<Family[]>('/api/family/mine'),

  /**
   * 创建家庭（创建者自动成为 owner，role=1，status=active）
   */
  create: (name: string) =>
    request<Family>('/api/family', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  /**
   * 获取家庭成员列表
   * 返回 active（status=2）+ pending（status=1）两类成员
   * pending 成员无 name/user_id，展示 invite_phone
   *
   * 兼容服务端新旧两种返回格式：
   *   旧：FamilyMember[]（服务端未部署时）
   *   新：{ members: FamilyMember[], currentUserRole: 'owner' | 'member' }
   */
  getMembers: async (familyId: string): Promise<GetMembersResponse> => {
    const raw = await request<GetMembersResponse | FamilyMember[]>(
      `/api/family/${familyId}/members`,
    )
    if (Array.isArray(raw)) {
      return { members: raw, currentUserRole: 'member' }
    }
    return raw
  },

  /**
   * 按手机号邀请家庭成员（替代邀请码流程）
   * 仅 Owner 可调用
   *
   * @example 请求体
   * { "phone": "13812345678" }
   *
   * @example 响应体
   * { "memberId": "uuid", "status": "pending" }
   *
   * @example 错误
   *   409 - "该成员已在家庭中" / "已邀请，等待对方登录接受" / "不能邀请自己"
   *   403 - 当前用户非 Owner
   */
  inviteByPhone: (familyId: string, phone: string) =>
    request<{ memberId: string; status: 'pending' }>(
      `/api/family/${familyId}/invite-by-phone`,
      {
        method: 'POST',
        body: JSON.stringify({ phone }),
      },
    ),

  /**
   * 移除家庭成员或撤销 pending 邀请
   * 仅 Owner 可调用，memberId 为 family_member.id
   */
  removeMember: (familyId: string, memberId: string) =>
    request<{ success: boolean }>(
      `/api/family/${familyId}/members/${memberId}`,
      { method: 'DELETE' },
    ),

  // ── 以下接口已废弃，保留供旧版本兼容 ───────────────────────────────

  /**
   * @deprecated 邀请码流程已废弃，请使用 inviteByPhone()
   */
  createInviteCode: (familyId: string) =>
    request<{ code: string }>(`/api/family/${familyId}/invite`, {
      method: 'POST',
    }),

  /**
   * @deprecated 邀请码流程已废弃，登录后自动激活 pending 邀请
   */
  join: (code: string) =>
    request<Family>('/api/family/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  // ── 邀请接受/拒绝相关 ─────────────────────────────────────────────

  /**
   * 获取当前用户的待处理邀请列表
   */
  getPendingInvites: () =>
    request<PendingInvite[]>('/api/family/pending-invites'),

  /**
   * 接受邀请
   */
  acceptInvite: (memberId: string) =>
    request<{ familyId: string; success: boolean }>(
      `/api/family/pending-invites/${memberId}/accept`,
      { method: 'POST' },
    ),

  /**
   * 拒绝邀请
   */
  declineInvite: (memberId: string) =>
    request<{ success: boolean }>(
      `/api/family/pending-invites/${memberId}/decline`,
      { method: 'POST' },
    ),

  /**
   * 退出家庭（仅非 owner 成员可调用）
   */
  leave: (familyId: string) =>
    request<{ success: boolean }>(
      `/api/family/${familyId}/leave`,
      { method: 'POST' },
    ),
}

export interface PendingInvite {
  id: string
  family_id: string
  family_name: string
  inviter_name: string | null
}