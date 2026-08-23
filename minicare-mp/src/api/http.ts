import Taro from '@tarojs/taro'

// Taro 编译时会将 process.env.TARO_APP_* 替换为字面量字符串，
// 小程序运行时无 process 全局，不可用运行时判断。
// 各环境 .env 文件中配置：
//   .env.development  → http://127.0.0.1:3001
//   .env.staging      → staging CloudRun URL
//   .env.production   → production CloudRun URL
const API_BASE_URL = process.env.TARO_APP_API_BASE_URL || 'http://localhost:3001'

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

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  auth?: boolean
  data?: unknown
  timeoutMs?: number
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', auth = true, data, timeoutMs = 8000 } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res: Taro.request.SuccessCallbackResult
  try {
    res = await Taro.request({
      url: `${API_BASE_URL}${path}`,
      method,
      data,
      header: headers,
      timeout: timeoutMs,
    })
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

  // 401 token 失效 → 清除本地凭证并跳转登录页
  if (res.statusCode === 401) {
    removeToken()
    removeUser()
    if (!isRedirectingToLogin) {
      isRedirectingToLogin = true
      Taro.reLaunch({ url: '/pages/login/index' }).finally(() => {
        isRedirectingToLogin = false
      })
    }
    throw new Error('登录已过期，请重新登录')
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    const message =
      (res.data as { message?: string })?.message ||
      `HTTP ${res.statusCode}`
    throw new Error(message)
  }
  return res.data as T
}

