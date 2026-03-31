/**
 * Auth 模块 API
 * 路由：/api/auth/*
 */
import { request } from './http'
import type { User, AuthResult } from './types'

export const authApi = {
  /**
   * 发送短信验证码
   * @remarks 仅 AUTH_TEST_MODE=true 时可用
   */
  sendCode: (phone: string) =>
    request<{ message: string }>('/api/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ phone }),
      auth: false,
    }),

  /**
   * 验证码登录
   * @remarks 仅 AUTH_TEST_MODE=true 时可用
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
   */
  tcbLogin: (accessToken: string) =>
    request<AuthResult>('/api/auth/tcb-login', {
      method: 'POST',
      body: JSON.stringify({ accessToken }),
      auth: false,
    }),

  /** 获取当前登录用户信息 */
  profile: () => request<User>('/api/auth/me'),
}
