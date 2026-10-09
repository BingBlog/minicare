/**
 * 认证 API 模块
 *
 * AUTH_MODE（编译时由 TARO_APP_AUTH_MODE 注入）：
 *   test → 后端 /api/auth/send-code + /api/auth/verify-code（固定验证码 123456）
 *   sms  → CloudBase JS SDK signInWithOtp + verifyOtp → 后端 /api/auth/tcb-login 换 JWT
 */
import { request, setToken, setUser } from './http'

const AUTH_MODE = process.env.TARO_APP_AUTH_MODE || 'test'
export const IS_TEST_MODE = AUTH_MODE === 'test'

// cloudbase SDK 仅在 sms 模式下按需加载，避免 test 模式下因 TARO_APP_TCB_ENV_ID
// 未定义导致 process is not defined 运行时崩溃
async function getAuth() {
  const { auth } = await import('@/lib/cloudbase')
  return auth
}

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

/** 手机所有权凭证（phoneProof）：test 用 code，sms 用 accessToken */
export interface PhoneProofPayload {
  code?: string
  accessToken?: string
}

export interface PasswordStatus {
  hasPassword: boolean
  passwordUpdatedAt: string | null
  smsVerifiedRecently: boolean
}

export interface SetPasswordPayload extends PhoneProofPayload {
  newPassword: string
  currentPassword?: string
}

export interface ResetPasswordPayload extends PhoneProofPayload {
  phone: string
  newPassword: string
}

/** 设置/重置密码的返回：**必须**用其中的 token 覆盖本地，否则旧 token 已失效会被踢下线 */
export interface PasswordMutateResult {
  ok: true
  token: string
  user: User
}

/** 未设置密码的业务错误码：前端据此自动切回验证码 Tab */
export const NO_PASSWORD_SET = 'NO_PASSWORD_SET'

export const authApi = {
  /** 测试模式：后端发送验证码 */
  sendCode: (phone: string) =>
    request<{ message: string }>('/api/auth/send-code', {
      method: 'POST',
      auth: false,
      data: { phone },
    }),

  /** 测试模式：后端验证验证码（401 = 验证码错误，属业务错误，不能触发登出跳转） */
  verifyCode: (phone: string, code: string) =>
    request<AuthResult>('/api/auth/verify-code', {
      method: 'POST',
      auth: false,
      redirectOn401: false,
      data: { phone, code },
    }),

  /** SMS 模式：前端 SDK 验证成功后，用 CloudBase access_token 换取自定义 JWT */
  tcbLogin: (accessToken: string) =>
    request<AuthResult>('/api/auth/tcb-login', {
      method: 'POST',
      auth: false,
      redirectOn401: false,
      data: { accessToken },
    }),

  /** 验证当前 token 是否在当前后端环境有效（401 = 登录态失效，走默认登出跳转） */
  checkToken: () =>
    request<User>('/api/auth/me'),

  // ── 密码登录（TECH-016）────────────────────────────────

  /** 手机号 + 密码登录（401 = 密码错误/次数过多锁定，属业务错误） */
  loginByPassword: (phone: string, password: string) =>
    request<AuthResult>('/api/auth/login-by-password', {
      method: 'POST',
      auth: false,
      redirectOn401: false,
      data: { phone, password },
    }),

  /** 查询当前账号密码状态（需登录）。401 = token 失效 → 走默认登出跳转 */
  passwordStatus: () =>
    request<PasswordStatus>('/api/auth/password-status'),

  /**
   * 设置 / 修改密码（需登录）。返回新 token
   *
   * 401 = 原密码错误 / 未通过凭证验证 —— 此时**用户是已登录状态**，
   * 绝不能触发登出跳转（否则输错原密码就被踢出登录）。
   */
  setPassword: (data: SetPasswordPayload) =>
    request<PasswordMutateResult>('/api/auth/password', {
      method: 'POST',
      redirectOn401: false,
      data,
    }),

  /** 忘记密码 · 重置（公开，无需登录）。401 = 验证码错误或已过期，属业务错误 */
  resetPassword: (data: ResetPasswordPayload) =>
    request<PasswordMutateResult>('/api/auth/reset-password', {
      method: 'POST',
      auth: false,
      redirectOn401: false,
      data,
    }),
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
  const auth = await getAuth()
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

/**
 * 密码登录（含本地持久化）
 *
 * 与 `loginByCode` 对称：成功后写入 `minicare_token` / `minicare_user`。
 * `isNewUser` 恒为 false —— 密码登录不承担注册。
 */
export async function loginByPasswordAndPersist(
  phone: string,
  password: string,
): Promise<AuthResult> {
  const res = await authApi.loginByPassword(phone, password)
  setToken(res.token)
  setUser(res.user)
  return res
}

/**
 * 采用设置/重置密码后新签发的 token
 *
 * 🚨 改密会让后端 `token_version + 1`，**旧 token（含当前设备手上的）立即失效**。
 *    调用方必须用返回的新 token 覆盖本地，否则用户改完密码就被踢回登录页。
 */
export function adoptNewToken(res: PasswordMutateResult): void {
  setToken(res.token)
  setUser(res.user)
}

/**
 * 验证码 → 手机所有权凭证（phoneProof）
 *
 * 复用与 `loginByCode` 完全相同的双模式分流：
 *   - test 模式：后端自行比对常量，直接回传 `{ code }`
 *   - sms 模式 ：调 CloudBase `verifyOtp` 拿 `session.access_token` 回传 `{ accessToken }`
 *
 * 供「设置密码 / 忘记密码」复用，避免再写一套 SDK 分支。
 */
export async function buildPhoneProof(
  code: string,
  verifyOtp?: (params: { token: string }) => Promise<unknown>,
): Promise<PhoneProofPayload> {
  if (IS_TEST_MODE) {
    return { code }
  }

  if (!verifyOtp) {
    throw new Error('请先获取验证码')
  }
  const result = (await verifyOtp({ token: code })) as {
    data?: { session?: { access_token?: string } }
    error?: { message?: string }
  }
  if (result?.error) {
    throw new Error(result.error.message || '验证码错误或已过期')
  }
  const accessToken = result?.data?.session?.access_token
  if (!accessToken) {
    throw new Error('验证失败，无法获取凭证，请重试')
  }
  return { accessToken }
}
