import Taro from '@tarojs/taro'
import { API_BASE_URL } from './base'

export function getToken(): string | null {
  return Taro.getStorageSync('minicare_token') || null
}

export function setToken(token: string): void {
  Taro.setStorageSync('minicare_token', token)
}

export function removeToken(): void {
  Taro.removeStorageSync('minicare_token')
}

const USER_KEY = 'minicare_user'

export function getUser(): { id: string; phone: string; nickname: string } | null {
  try {
    const raw = Taro.getStorageSync(USER_KEY)
    return raw || null
  } catch {
    return null
  }
}

export function setUser(user: { id: string; phone: string; nickname: string }): void {
  Taro.setStorageSync(USER_KEY, user)
}

export function removeUser(): void {
  Taro.removeStorageSync(USER_KEY)
}

const CURRENT_FAMILY_ID_KEY = 'minicare_current_family_id'
const CURRENT_BABY_ID_KEY = 'minicare_current_baby_id'

export function getCurrentFamilyId(families: { id: string }[]): string | null {
  if (families.length === 0) return null
  const stored = Taro.getStorageSync(CURRENT_FAMILY_ID_KEY)
  if (stored && families.some((f) => f.id === stored)) return stored
  return families[0].id
}

export function setCurrentFamilyId(familyId: string): void {
  Taro.setStorageSync(CURRENT_FAMILY_ID_KEY, familyId)
}

export function getStoredFamilyId(): string | null {
  return Taro.getStorageSync(CURRENT_FAMILY_ID_KEY) || null
}

export function getStoredBabyId(): string | null {
  return Taro.getStorageSync(CURRENT_BABY_ID_KEY) || null
}

export function getCurrentBabyId(babies: { id: string }[]): string | null {
  if (babies.length === 0) return null
  const stored = Taro.getStorageSync(CURRENT_BABY_ID_KEY)
  if (stored && babies.some((b) => b.id === stored)) return stored
  return babies[0].id
}

export function setCurrentBabyId(babyId: string): void {
  Taro.setStorageSync(CURRENT_BABY_ID_KEY, babyId)
}

let isRedirectingToLogin = false

/**
 * API 业务错误
 *
 * `request()` 对非 2xx 一律抛错。仅携带 message 时前端无法区分业务错误码
 * （例如密码登录的 `NO_PASSWORD_SET` 需要自动切回验证码 Tab），故额外附带
 * `statusCode` 与后端返回的 `code`。
 *
 * 向后兼容：仍是 Error 子类，`err.message` 语义不变，既有 catch 无需改动。
 */
export class ApiError extends Error {
  statusCode: number
  code?: string

  constructor(message: string, statusCode: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.code = code
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  auth?: boolean
  data?: unknown
  timeoutMs?: number
  /**
   * 收到 401 时是否按「登录态失效」处理（清凭证 + reLaunch 登录页）。默认 `true`。
   *
   * 🚨 登录 / 验证码 / 改密这类接口的 401 是**可预期的业务错误**（密码错误、验证码错误、
   *    原密码错误、验证凭证不匹配……），必须传 `false`。否则：
   *      ① 用户输错密码会看到「登录已过期，请重新登录」，而不是真正的原因与剩余次数；
   *      ② `reLaunch` 会把已填的手机号/密码/协议勾选全部清空；
   *      ③ 本地 token 被无端清除，已登录用户仅因输错原密码就被登出。
   */
  redirectOn401?: boolean
  /**
   * 可选：暴露底层 RequestTask（用于主动 abort，如长耗时解析请求的「取消」）。
   * 调用方保存 task 引用，取消时 `task.abort()`；框架级 abort 已被下方 catch 静默处理。
   */
  onTask?: (task: Taro.RequestTask<any>) => void
}

/**
 * 从响应体里提取 `{ message, code }`
 *
 * - 微信在 `Content-Type: application/json` 时会自动反序列化 → 得到对象
 * - NestJS `ValidationPipe` 的报错 `message` 是**字符串数组** → 取第一条作为展示文案
 * - 网关/异常页可能返回纯文本 → `res.data` 是 string，兜底成 message
 */
function extractErrorBody(data: unknown): { message?: string; code?: string } {
  if (typeof data === 'string') {
    return { message: data.trim() || undefined }
  }
  if (data && typeof data === 'object') {
    const d = data as { message?: unknown; code?: unknown }
    const raw = d.message
    const message =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw) && raw.length > 0
          ? String(raw[0])
          : undefined
    return {
      message,
      code: typeof d.code === 'string' ? d.code : undefined,
    }
  }
  return {}
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    auth = true,
    data,
    timeoutMs = 8000,
    redirectOn401 = true,
    onTask,
  } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res: Taro.request.SuccessCallbackResult
  try {
    const task = Taro.request({
      url: `${API_BASE_URL}${path}`,
      method,
      data,
      header: headers,
      timeout: timeoutMs,
    })
    onTask?.(task)
    res = await task
  } catch (err) {
    const errMsg = (err as { errMsg?: string })?.errMsg ?? ''
    // 请求被主动中止（开发者工具终止会话 / 页面销毁 / 小程序切后台时，
    // 微信框架会 abort 所有挂起的请求）。属正常生命周期行为，静默处理，
    // 避免向上抛出形成 unhandled rejection 误报（MiniProgramError）。
    if (errMsg.includes('abort')) {
      return undefined as T
    }
    if (errMsg.includes('timeout')) {
      throw new Error(`请求超时（>${timeoutMs}ms）：请确认本地后端已启动并可访问 ${API_BASE_URL}`)
    }
    if (errMsg.includes('fail')) {
      throw new Error(`网络请求失败：${errMsg}`)
    }
    // wx.request 底层异常（如 Failed to fetch）——给出可操作的诊断信息
    const nativeMsg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `网络请求失败（无法连接 ${API_BASE_URL}）：\n` +
      `${nativeMsg}\n` +
      `排障：\n` +
      `  1. 确认后端已启动（npm run start:dev）\n` +
      `  2. 真机调试请将 localhost 改为本机局域网IP\n` +
      `  3. 微信开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名」\n` +
      `  4. 基础库版本过高可降级至 3.x（详情 → 本地设置）`,
    )
  }

  // 非 2xx 统一抛 ApiError（携带 statusCode + 后端业务码 code）
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const body = extractErrorBody(res.data)

    // 401「登录态失效」→ 清除本地凭证并跳转登录页。
    // ⚠️ 仅当调用方声明 redirectOn401（默认 true）时才这么做：登录 / 验证码 / 改密等接口的
    //    401 属于业务错误，必须把后端原始文案透出给用户（见 RequestOptions.redirectOn401）。
    if (res.statusCode === 401 && redirectOn401) {
      removeToken()
      removeUser()
      if (!isRedirectingToLogin) {
        isRedirectingToLogin = true
        Taro.reLaunch({ url: '/pages/login/index' }).finally(() => {
          isRedirectingToLogin = false
        })
      }
      // 文案保持原样：pages/home/index.tsx 依赖它区分「未登录」与「后端未连通」
      throw new ApiError('登录已过期，请重新登录', res.statusCode, body.code)
    }

    throw new ApiError(body.message || `HTTP ${res.statusCode}`, res.statusCode, body.code)
  }
  return res.data as T
}

