/**
 * 登录/注册页（验证码流程）
 *
 * VITE_AUTH_MODE=test  （开发/测试环境）
 *   → 调后端 /api/auth/send-code + /api/auth/verify-code
 *   → 后端固定验证码 123456，不发真实短信
 *
 * VITE_AUTH_MODE=sms   （生产环境）
 *   → 前端 @cloudbase/js-sdk signInWithOtp 发真实短信
 *   → 验证成功后调后端 /api/auth/tcb-login 换取自定义 JWT
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '@/lib/cloudbase'
import { authApi, setToken } from '@/lib/api'
import { useAppStore } from '@/lib/store'

const AUTH_MODE = (import.meta.env.VITE_AUTH_MODE as string) || 'test'
const IS_TEST_MODE = AUTH_MODE === 'test'

type Step = 'phone' | 'code'

export default function LoginPage() {
  const navigate = useNavigate()
  const setUser = useAppStore((s) => s.setUser)

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 仅 SMS 模式需要：保存 verifyOtp 回调
  const [verifyOtp, setVerifyOtp] = useState<((params: { token: string }) => Promise<any>) | null>(null)

  // ── 发送验证码 ────────────────────────────────────────────────────
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phone.length !== 11) {
      setError('请输入正确的 11 位手机号')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (IS_TEST_MODE) {
        // 测试模式：调后端接口（固定验证码 123456，不发短信）
        await authApi.sendCode(phone)
      } else {
        // SMS 模式：CloudBase JS SDK 发真实短信
        const { data, error: sdkError } = await auth.signInWithOtp({ phone })
        if (sdkError) throw new Error(sdkError.message || '发送失败，请重试')
        if (data?.verifyOtp) setVerifyOtp(() => data.verifyOtp!)
      }
      setStep('code')
      startCountdown()
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  // ── 重新发送 ──────────────────────────────────────────────────────
  const handleResend = async () => {
    if (countdown > 0) return
    setLoading(true)
    setError('')
    try {
      if (IS_TEST_MODE) {
        await authApi.sendCode(phone)
      } else {
        const { data, error: sdkError } = await auth.signInWithOtp({ phone })
        if (sdkError) throw new Error(sdkError.message || '发送失败，请重试')
        if (data?.verifyOtp) setVerifyOtp(() => data.verifyOtp!)
      }
      startCountdown()
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  // ── 验证登录 ──────────────────────────────────────────────────────
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length < 4) {
      setError('请输入验证码')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (IS_TEST_MODE) {
        // 测试模式：直接用后端接口验证（固定 123456）
        const { token, user } = await authApi.verifyCode({ phone, code })
        setToken(token)
        setUser(user, token)
      } else {
        // SMS 模式：SDK 验证 → 拿 access_token → 换 JWT
        if (!verifyOtp) throw new Error('请先获取验证码')
        const { data, error: sdkError } = await verifyOtp({ token: code })
        if (sdkError) throw new Error(sdkError.message || '验证码错误或已过期')
        const accessToken = data?.session?.access_token
        if (!accessToken) throw new Error('登录失败，无法获取凭证，请重试')
        const { token, user } = await authApi.tcbLogin(accessToken)
        setToken(token)
        setUser(user, token)
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  // ── 倒计时 ────────────────────────────────────────────────────────
  const startCountdown = () => {
    setCountdown(60)
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timer); return 0 }
        return c - 1
      })
    }, 1000)
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* 顶部插画区 */}
      <div className="h-52 relative overflow-hidden flex-shrink-0 bg-gradient-to-b from-primary via-[#F9A8C0] to-[#FBCAD8]">
        <div className="absolute top-7 left-7 w-8 h-8 rounded-full bg-white/90 shadow-[0_0_0_8px_rgba(255,255,255,0.2)]" />
        <div className="absolute top-5 right-10 w-16 h-16 rounded-full bg-white/10" />
        <div className="absolute top-20 right-5 w-8 h-8 rounded-full bg-white/10" />
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-[rgba(248,180,195,0.5)] rounded-t-[60px]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-20 bg-gradient-to-b from-[rgba(255,240,180,0.6)] to-[rgba(255,220,120,0.3)] rounded-t-full" />
        <div className="absolute bottom-8 left-0 right-0 text-center">
          <span className="text-2xl font-bold text-white drop-shadow-sm tracking-wide">敏宝日记</span>
        </div>
      </div>

      {/* 表单区 */}
      <div className="flex-1 bg-white px-6 pt-8 pb-6">
        {step === 'phone' ? (
          <>
            <h2 className="text-xl font-bold text-text mb-1">手机号登录 / 注册</h2>
            <p className="text-sm text-subtext mb-6">未注册的手机号将自动创建账号</p>

            {/* 测试环境提示 */}
            {IS_TEST_MODE && (
              <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                🔧 测试模式 · 验证码固定为 <strong>123456</strong>，不会发送真实短信
              </div>
            )}

            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">手机号</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-subtext text-sm">+86</span>
                  <input
                    type="tel"
                    placeholder="请输入手机号"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    className="w-full h-12 pl-14 pr-4 rounded-xl border border-border bg-gray-50 text-text placeholder-subtext focus:outline-none focus:border-primary focus:bg-white transition-colors"
                    maxLength={11}
                    autoComplete="tel"
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-500 bg-red-50 px-4 py-2.5 rounded-lg">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading || phone.length !== 11}
                className="w-full h-12 bg-primary text-white font-semibold rounded-xl shadow-md shadow-primary/30 active:scale-[0.98] transition-all disabled:opacity-50 mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    发送中...
                  </span>
                ) : '获取验证码'}
              </button>
            </form>
          </>
        ) : (
          <>
            {/* 返回修改手机号 */}
            <button
              onClick={() => { setStep('phone'); setCode(''); setError(''); setVerifyOtp(null) }}
              className="flex items-center gap-1 text-sm text-subtext mb-6 -ml-1"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-subtext">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
              </svg>
              返回
            </button>

            <h2 className="text-xl font-bold text-text mb-1">输入验证码</h2>
            <p className="text-sm text-subtext mb-6">
              验证码已发送至 <span className="text-text font-medium">{phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}</span>
            </p>

            {/* 测试环境提示 */}
            {IS_TEST_MODE && (
              <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                🔧 测试模式 · 请输入固定验证码 <strong>123456</strong>
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">验证码</label>
                <input
                  type="number"
                  placeholder="请输入 6 位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value.slice(0, 6))}
                  className="w-full h-12 px-4 rounded-xl border border-border bg-gray-50 text-text placeholder-subtext focus:outline-none focus:border-primary focus:bg-white transition-colors text-center text-xl tracking-[0.5em] font-bold"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
              </div>

              {/* 重新发送 */}
              <div className="text-center">
                {countdown > 0 ? (
                  <span className="text-sm text-subtext">{countdown}s 后可重新发送</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={loading}
                    className="text-sm text-primary font-medium"
                  >
                    重新发送验证码
                  </button>
                )}
              </div>

              {error && (
                <div className="text-sm text-red-500 bg-red-50 px-4 py-2.5 rounded-lg">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading || code.length < 4}
                className="w-full h-12 bg-primary text-white font-semibold rounded-xl shadow-md shadow-primary/30 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    验证中...
                  </span>
                ) : '登 录'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
