/**
 * Auth 模块 API
 * 路由：/api/auth/*
 */
import { request } from './http'
import type { User, AuthResult } from './types'

export const authApi = {
  /**
   * 发送短信验证码
   * @remarks 仅 AUTH_TEST_MODE=true 时可用（测试环境）
   *
   * @example 请求体
   * { "phone": "13812345678" }
   *
   * @example 响应体
   * { "message": "验证码已发送" }
   */
  sendCode: (phone: string) =>
    request<{ message: string }>('/api/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ phone }),
      auth: false,
    }),

  /**
   * 验证码登录（测试环境）
   * @remarks 仅 AUTH_TEST_MODE=true 时可用
   *
   * @example 请求体
   * { "phone": "13812345678", "code": "123456" }
   *
   * @example 响应体
   * {
   *   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
   *   "user": {
   *     "id": "u1u2u3u4-1234-5678-abcd-ef0123456789",
   *     "phone": "13812345678",
   *     "nickname": "宝妈"
   *   },
   *   "isNewUser": false
   * }
   */
  verifyCode: (data: { phone: string; code: string }) =>
    request<AuthResult>('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify(data),
      auth: false,
    }),

  /**
   * CloudBase Token 换取自定义 JWT（生产模式）
   * 前端 SDK 完成短信验证后，传 access_token 换取 JWT
   *
   * @example 请求体
   * { "accessToken": "cloudbase-access-token-xxx" }
   *
   * @example 响应体
   * {
   *   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
   *   "user": {
   *     "id": "u1u2u3u4-1234-5678-abcd-ef0123456789",
   *     "phone": "13812345678",
   *     "nickname": "宝妈",
   *     "avatar_url": null
   *   },
   *   "isNewUser": true
   * }
   */
  tcbLogin: (accessToken: string) =>
    request<AuthResult>('/api/auth/tcb-login', {
      method: 'POST',
      body: JSON.stringify({ accessToken }),
      auth: false,
    }),

  /**
   * 获取当前登录用户信息
   *
   * @example 响应体
   * {
   *   "id": "u1u2u3u4-1234-5678-abcd-ef0123456789",
   *   "phone": "13812345678",
   *   "nickname": "宝妈",
   *   "avatar_url": null
   * }
   */
  profile: () => request<User>('/api/auth/me'),

  checkToken: () => request<User>('/api/auth/me'),
}
