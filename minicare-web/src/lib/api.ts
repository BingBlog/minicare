/**
 * API 客户端
 * 路由结构对齐 minicare-server NestJS 后端
 *
 * Auth:    /api/auth/send-code  /api/auth/verify-code  /api/auth/me
 * Family:  /api/family  /api/family/mine
 * Baby:    /api/family/:familyId/baby
 * Records: /api/family/:familyId/records/:type
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string

function getToken(): string | null {
  return localStorage.getItem('minicare_token')
}

export function setToken(token: string) {
  localStorage.setItem('minicare_token', token)
}

export function removeToken() {
  localStorage.removeItem('minicare_token')
}

interface RequestOptions extends RequestInit {
  auth?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, ...init } = options

  const headers: { [key: string]: string } = {
    'Content-Type': 'application/json',
    ...(init.headers as { [key: string]: string }),
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

  return res.json()
}

// ── Auth ──────────────────────────────────────────────────────────
export const authApi = {
  /** 发送短信验证码（测试模式，仅 AUTH_TEST_MODE=true 时可用） */
  sendCode: (phone: string) =>
    request<{ message: string }>('/api/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ phone }),
      auth: false,
    }),

  /** 验证码登录（测试模式，仅 AUTH_TEST_MODE=true 时可用） */
  verifyCode: (data: { phone: string; code: string }) =>
    request<{ token: string; user: User }>('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify(data),
      auth: false,
    }),

  /**
   * CloudBase Token 登录（生产模式）
   * 前端 SDK 完成短信验证后，传 access_token 换取自定义 JWT
   */
  tcbLogin: (accessToken: string) =>
    request<{ token: string; user: User }>('/api/auth/tcb-login', {
      method: 'POST',
      body: JSON.stringify({ accessToken }),
      auth: false,
    }),

  profile: () => request<User>('/api/auth/me'),
}

// ── Family ────────────────────────────────────────────────────────
export const familyApi = {
  /** 获取我的家庭列表 */
  getMine: () => request<Family[]>('/api/family/mine'),

  /** 创建家庭 */
  create: (name: string) =>
    request<Family>('/api/family', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  /** 获取家庭成员 */
  getMembers: (familyId: string) =>
    request<FamilyMember[]>(`/api/family/${familyId}/members`),

  /** 生成邀请码 */
  createInviteCode: (familyId: string) =>
    request<{ code: string }>(`/api/family/${familyId}/invite`, { method: 'POST' }),

  /** 通过邀请码加入家庭 */
  join: (code: string) =>
    request<Family>('/api/family/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
}

// ── Baby ──────────────────────────────────────────────────────────
export const babyApi = {
  /** 获取家庭的宝宝档案 */
  get: (familyId: string) =>
    request<Baby>(`/api/family/${familyId}/baby`),

  /** 创建宝宝档案 */
  create: (familyId: string, data: CreateBabyDto) =>
    request<Baby>(`/api/family/${familyId}/baby`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// ── Records ───────────────────────────────────────────────────────
// 所有记录类型统一结构：GET/POST /api/family/:familyId/records/:type
type RecordType = 'feeding' | 'sleep' | 'diaper' | 'activity' | 'health' | 'growth' | 'medical' | 'symptom'

function makeRecordsApi(type: RecordType) {
  return {
    list: (familyId: string, babyId: string, limit = 20, offset = 0) =>
      request<RecordItem[]>(
        `/api/family/${familyId}/records/${type}?baby_id=${babyId}&limit=${limit}&offset=${offset}`
      ),
    create: (familyId: string, data: { [key: string]: unknown }) =>
      request<RecordItem>(`/api/family/${familyId}/records/${type}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    remove: (familyId: string, id: string) =>
      request<void>(`/api/family/${familyId}/records/${type}/${id}`, { method: 'DELETE' }),
  }
}

export const recordsApi = {
  feeding: makeRecordsApi('feeding'),
  sleep: makeRecordsApi('sleep'),
  diaper: makeRecordsApi('diaper'),
  activity: makeRecordsApi('activity'),
  health: makeRecordsApi('health'),
  growth: makeRecordsApi('growth'),
  medical: makeRecordsApi('medical'),
  symptom: makeRecordsApi('symptom'),
}

// ── Types ─────────────────────────────────────────────────────────
export interface User {
  id: string
  phone: string
  nickname: string
  avatar_url?: string | null
}

export interface Family {
  id: string
  name: string
  createdAt: string
}

export interface FamilyMember {
  id: string
  userId: string
  role: 'owner' | 'editor' | 'viewer'
  nickname: string
}

export interface Baby {
  id: string
  familyId: string
  name: string
  gender: 'male' | 'female' | 'unknown'
  birthDate: string
  avatarUrl?: string
}

export interface CreateBabyDto {
  name: string
  gender: 'male' | 'female' | 'unknown'
  birthDate: string
}

export interface RecordItem {
  id: string
  babyId: string
  familyId: string
  type: string
  startTime: string
  endTime?: string
  note?: string
  createdBy?: string
  [key: string]: unknown
}
