/**
 * Family 模块 API
 * 路由：/api/family/*
 *
 * 权限模型：
 *   role=1（owner）：创建者，可邀请/移除成员、修改宝宝档案、查看和新增所有记录
 *   role=2（member）：普通成员，可查看和新增所有记录
 */
import { request } from './http'
import type { Family, FamilyMember } from './types'

export const familyApi = {
  /**
   * 获取我的家庭列表
   *
   * @example 响应体
   * [
   *   {
   *     "id": "f1f2f3f4-1234-5678-abcd-ef0123456789",
   *     "name": "我们家",
   *     "created_at": "2026-03-01T08:00:00.000Z",
   *     "role": 1
   *   }
   * ]
   */
  getMine: () =>
    request<Family[]>('/api/family/mine'),

  /**
   * 创建家庭（创建者自动成为 owner，role=1，status=active）
   *
   * @example 请求体
   * { "name": "我们家" }
   *
   * @example 响应体
   * {
   *   "id": "f1f2f3f4-1234-5678-abcd-ef0123456789",
   *   "name": "我们家"
   * }
   */
  create: (name: string) =>
    request<Family>('/api/family', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  /**
   * 获取家庭成员列表（仅返回 status=active 的成员）
   *
   * @example 响应体
   * [
   *   {
   *     "id": "m1m2m3m4-...",
   *     "role": 1,
   *     "status": 2,
   *     "joined_at": "2026-03-01T08:00:00.000Z",
   *     "user_id": "u1u2u3u4-...",
   *     "name": "宝妈",
   *     "avatar_url": null
   *   },
   *   {
   *     "id": "m5m6m7m8-...",
   *     "role": 2,
   *     "status": 2,
   *     "joined_at": "2026-03-05T10:00:00.000Z",
   *     "user_id": "u5u6u7u8-...",
   *     "name": "宝爸",
   *     "avatar_url": null
   *   }
   * ]
   */
  getMembers: (familyId: string) =>
    request<FamilyMember[]>(`/api/family/${familyId}/members`),

  /**
   * 生成（刷新）邀请码
   * 调用后旧邀请码立即失效，返回新的 6 位大写字母数字码
   *
   * @example 响应体
   * { "code": "A3K9MZ" }
   */
  createInviteCode: (familyId: string) =>
    request<{ code: string }>(`/api/family/${familyId}/invite`, {
      method: 'POST',
    }),

  /**
   * 通过邀请码加入家庭
   * 加入后自动成为 member（role=2），状态为 active
   *
   * @example 请求体
   * { "code": "A3K9MZ" }
   *
   * @example 响应体
   * { "familyId": "f1f2f3f4-1234-5678-abcd-ef0123456789" }
   */
  join: (code: string) =>
    request<Family>('/api/family/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
}
