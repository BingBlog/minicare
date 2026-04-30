import Taro from '@tarojs/taro'

function resolveApiBaseUrl(): string {
  // 小程序运行时没有 Node 的 process 全局，需要先判空再读取。
  if (typeof process !== 'undefined' && process?.env?.TARO_APP_API_BASE_URL) {
    return process.env.TARO_APP_API_BASE_URL
  }
  return 'http://127.0.0.1:3001'
}

const API_BASE_URL = resolveApiBaseUrl()

export function getToken(): string | null {
  return Taro.getStorageSync('minicare_token') || null
}

export function setToken(token: string): void {
  Taro.setStorageSync('minicare_token', token)
}

export function removeToken(): void {
  Taro.removeStorageSync('minicare_token')
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
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
    if (errMsg.includes('timeout')) {
      throw new Error(`请求超时（>${timeoutMs}ms）：请确认本地后端已启动并可访问 ${API_BASE_URL}`)
    }
    if (errMsg.includes('fail')) {
      throw new Error(`网络请求失败：${errMsg}`)
    }
    throw err
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    const message =
      (res.data as { message?: string })?.message ||
      `HTTP ${res.statusCode}`
    throw new Error(message)
  }
  return res.data as T
}

