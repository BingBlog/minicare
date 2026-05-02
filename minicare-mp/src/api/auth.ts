/**
 * 认证 API 模块
 *
 * AUTH_MODE（编译时由 TARO_APP_AUTH_MODE 注入）：
 *   test → 后端 /api/auth/send-code + /api/auth/verify-code（固定验证码 123456）
 *   sms  → CloudBase JS SDK signInWithOtp + verifyOtp → 后端 /api/auth/tcb-login 换 JWT
 */
import { request, setToken, setUser } from './http'
import { auth } from '@/lib/cloudbase'

const AUTH_MODE = process.env.TARO_APP_AUTH_MODE || 'test'
export const IS_TEST_MODE = AUTH_MODE === 'test'

interface User {
  id: string
  phone: string
  nickname: string
}

interface AuthResult {
  token: string
  user: User
  isNewUser: boolean
  activatedFamilyIds?: string[]
}

export const authApi = {
  /** 测试模式：后端发送验证码 */
  sendCode: (phone: string) =>
    request<{ message: string }>('/api/auth/send-code', {
      method: 'POST',
      auth: false,
      data: { phone },
    }),

  /** 测试模式：后端验证验证码 */
  verifyCode: (phone: string, code: string) =>
    request<AuthResult>('/api/auth/verify-code', {
      method: 'POST',
      auth: false,
      data: { phone, code },
    }),

  /** SMS 模式：前端 SDK 验证成功后，用 CloudBase access_token 换取自定义 JWT */
  tcbLogin: (accessToken: string) =>
    request<AuthResult>('/api/auth/tcb-login', {
      method: 'POST',
      auth: false,
      data: { accessToken },
    }),

  /** 验证当前 token 是否在当前后端环境有效 */
  checkToken: () =>
    request<User>('/api/auth/me'),
}

/**
 * 发送验证码（自动区分模式）
 *
 * test 模式：调后端 /api/auth/send-code
 * sms 模式：调 CloudBase SDK signInWithOtp，返回 verifyOtp 函数供后续验证
 */
export async function sendVerificationCode(
  phone: string,
): Promise<{ verifyOtp?: (params: { token: string }) => Promise<unknown> }> {
  if (IS_TEST_MODE) {
    await authApi.sendCode(phone)
    return {}
  }

  // SMS 模式：使用 CloudBase JS SDK 发送真实短信
  let data: any, sdkError: any
  try {
    const result = await auth.signInWithOtp({ phone })
    data = result.data
    sdkError = result.error
  } catch (e: any) {
    console.error('[Auth] signInWithOtp exception:', JSON.stringify(e), e?.message, e?.code)
    throw new Error(e?.message || '发送失败，请重试')
  }
  if (sdkError) {
    console.error('[Auth] signInWithOtp error:', JSON.stringify(sdkError), sdkError?.message, sdkError?.code)
    throw new Error(sdkError.message || '发送失败，请重试')
  }
  if (!data?.verifyOtp) {
    console.error('[Auth] signInWithOtp no verifyOtp, data:', JSON.stringify(data))
    throw new Error('发送失败，请重试')
  }
  return { verifyOtp: data.verifyOtp }
}

/**
 * 验证码登录（自动区分模式）
 *
 * test 模式：调后端 /api/auth/verify-code
 * sms 模式：调 verifyOtp 验证 → 拿 access_token → 调后端 /api/auth/tcb-login 换 JWT
 *
 * @param phone 手机号
 * @param code 验证码
 * @param verifyOtp SMS 模式下由 sendVerificationCode 返回的验证函数
 */
export async function loginByCode(
  phone: string,
  code: string,
  verifyOtp?: (params: { token: string }) => Promise<unknown>,
): Promise<AuthResult> {
  let res: AuthResult

  if (IS_TEST_MODE) {
    res = await authApi.verifyCode(phone, code)
  } else {
    // SMS 模式
    if (!verifyOtp) {
      throw new Error('请先获取验证码')
    }
    const result = await verifyOtp({ token: code }) as {
      data?: { session?: { access_token?: string } }
      error?: { message?: string }
    }
    if (result?.error) {
      throw new Error(result.error.message || '验证码错误或已过期')
    }
    const accessToken = result?.data?.session?.access_token
    if (!accessToken) {
      throw new Error('登录失败，无法获取凭证，请重试')
    }
    // 用 CloudBase access_token 换取自定义 JWT
    res = await authApi.tcbLogin(accessToken)
  }

  setToken(res.token)
  setUser(res.user)
  return res
}
