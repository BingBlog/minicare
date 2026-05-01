import { request, setToken, setUser } from './http'

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
  sendCode: (phone: string) =>
    request<{ message: string }>('/api/auth/send-code', {
      method: 'POST',
      auth: false,
      data: { phone },
    }),

  verifyCode: (phone: string, code: string) =>
    request<AuthResult>('/api/auth/verify-code', {
      method: 'POST',
      auth: false,
      data: { phone, code },
    }),
}

export async function loginByCode(phone: string, code: string): Promise<AuthResult> {
  const res = await authApi.verifyCode(phone, code)
  setToken(res.token)
  setUser(res.user)
  return res
}
