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

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  auth?: boolean
  data?: unknown
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', auth = true, data } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await Taro.request({
    url: `${API_BASE_URL}${path}`,
    method,
    data,
    header: headers,
  })

  if (res.statusCode < 200 || res.statusCode >= 300) {
    const message =
      (res.data as { message?: string })?.message ||
      `HTTP ${res.statusCode}`
    throw new Error(message)
  }
  return res.data as T
}

