/**
 * HTTP 基础请求工具
 * 统一处理 Base URL、Token 注入、错误抛出
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string

export function getToken(): string | null {
  return localStorage.getItem('minicare_token')
}

export function setToken(token: string): void {
  localStorage.setItem('minicare_token', token)
}

export function removeToken(): void {
  localStorage.removeItem('minicare_token')
}

interface RequestOptions extends RequestInit {
  /** 是否附加 Authorization 头，默认 true */
  auth?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, ...init } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }

  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}
