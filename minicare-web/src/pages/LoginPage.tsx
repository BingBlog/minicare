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
 *
 * UI 严格对齐 minicare/ui-draft/login.html
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '@/lib/cloudbase'
import { authApi, familyApi, babyApi, setToken } from '@/api'
import { useAppStore } from '@/lib/store'

const AUTH_MODE = (import.meta.env.VITE_AUTH_MODE as string) || 'test'
const IS_TEST_MODE = AUTH_MODE === 'test'

/** Tab：验证码登录 / 密码登录 */
type LoginMode = 'sms' | 'pwd'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setUser, setCurrentFamily, setCurrentBaby } = useAppStore()

  const [mode, setMode] = useState<LoginMode>('sms')

  // 验证码模式
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [loadingSend, setLoadingSend] = useState(false)
  const [loadingLogin, setLoadingLogin] = useState(false)
  const [error, setError] = useState('')

  // 密码模式（仅 UI，无实际后端，Toast 提示）
  const [pwdPhone, setPwdPhone] = useState('')
  const [pwdPass, setPwdPass] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  // 仅 SMS 模式需要：保存 verifyOtp 回调
  const [verifyOtp, setVerifyOtp] = useState<((params: { token: string }) => Promise<any>) | null>(null)

  // ── Toast ─────────────────────────────────────────────────────────
  const [toast, setToast] = useState('')
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  // ── 登录后检查家庭/宝宝档案，决定跳转目标 ────────────────────────────
  const afterLogin = async () => {
    try {
      const families = await familyApi.getMine()
      if (families.length === 0) {
        navigate('/onboarding', { replace: true })
        return
      }
      const family = families[0]
      setCurrentFamily(family)
      try {
        const baby = await babyApi.get(family.id)
        setCurrentBaby(baby)
        navigate('/', { replace: true })
      } catch {
        navigate('/onboarding', { replace: true })
      }
    } catch {
      navigate('/', { replace: true })
    }
  }

  // ── 发送验证码 ────────────────────────────────────────────────────
  const handleSendCode = async () => {
    if (phone.length !== 11) { showToast('请输入正确的手机号'); return }
    setLoadingSend(true)
    setError('')
    try {
      if (IS_TEST_MODE) {
        await authApi.sendCode(phone)
      } else {
        const { data, error: sdkError } = await auth.signInWithOtp({ phone })
        if (sdkError) throw new Error(sdkError.message || '发送失败，请重试')
        if (data?.verifyOtp) setVerifyOtp(() => data.verifyOtp!)
      }
      setCodeSent(true)
      startCountdown()
      showToast('验证码已发送至 ' + phone)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败，请重试')
    } finally {
      setLoadingSend(false)
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

  // ── 登录验证 ──────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codeSent) { showToast('请先获取验证码'); return }
    if (code.length < 4) { setError('请输入验证码'); return }
    setLoadingLogin(true)
    setError('')
    try {
      let isNew = false
      if (IS_TEST_MODE) {
        const { token, user, isNewUser } = await authApi.verifyCode({ phone, code })
        isNew = isNewUser
        setToken(token)
        setUser(user, token)
      } else {
        if (!verifyOtp) throw new Error('请先获取验证码')
        const { data, error: sdkError } = await verifyOtp({ token: code })
        if (sdkError) throw new Error(sdkError.message || '验证码错误或已过期')
        const accessToken = data?.session?.access_token
        if (!accessToken) throw new Error('登录失败，无法获取凭证，请重试')
        const { token, user, isNewUser } = await authApi.tcbLogin(accessToken)
        isNew = isNewUser
        setToken(token)
        setUser(user, token)
      }
      if (isNew) showToast('欢迎加入敏宝日记！账号创建成功 🎉')
      await afterLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败，请重试')
    } finally {
      setLoadingLogin(false)
    }
  }

  // ── 切换 Tab ──────────────────────────────────────────────────────
  const switchMode = (m: LoginMode) => {
    setMode(m)
    setError('')
  }

  // ── 渲染 ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">

      {/* ══ 顶部插画区 ══ */}
      <div
        className="relative overflow-hidden flex-shrink-0"
        style={{
          height: 220,
          background: 'linear-gradient(180deg, #F87098 0%, #F9A8C0 60%, #FBCAD8 100%)',
        }}
      >
        {/* 太阳 */}
        <div
          className="absolute rounded-full bg-white/90"
          style={{ top: 30, left: 28, width: 34, height: 34, boxShadow: '0 0 0 8px rgba(255,255,255,.2)' }}
        />
        {/* 云朵 */}
        <div className="absolute bg-white/18 rounded-full" style={{ width: 60, height: 18, top: 50, right: 40 }} />
        <div className="absolute bg-white/18 rounded-full" style={{ width: 80, height: 22, top: 42, right: 20 }} />
        <div className="absolute bg-white/18 rounded-full" style={{ width: 45, height: 15, top: 80, left: 80 }} />
        {/* 小路 */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-full"
          style={{ width: 30, height: 100, background: 'linear-gradient(to bottom, rgba(255,240,180,0.6), rgba(255,220,120,0.3))' }}
        />
        {/* 丘陵 */}
        <div
          className="absolute bottom-5 left-0 right-0"
          style={{ height: 50, background: 'rgba(245,160,180,0.4)', borderRadius: '50% 50% 0 0 / 30px 30px 0 0' }}
        />
        {/* 地面 */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ height: 60, background: 'rgba(248,180,195,0.5)', borderRadius: '60% 60% 0 0 / 30px 30px 0 0' }}
        />
        {/* 小树 */}
        <div className="absolute flex flex-col items-center" style={{ bottom: 28, left: 22 }}>
          <div style={{ width: 18, height: 24, borderRadius: '50%', background: 'rgba(240,100,130,0.7)' }} />
          <div style={{ width: 4, height: 10, background: 'rgba(200,80,110,0.5)' }} />
        </div>
        <div className="absolute flex flex-col items-center" style={{ bottom: 32, left: 42 }}>
          <div style={{ width: 14, height: 18, borderRadius: '50%', background: 'rgba(240,100,130,0.7)' }} />
          <div style={{ width: 4, height: 8, background: 'rgba(200,80,110,0.5)' }} />
        </div>
        {/* 风车 */}
        <div className="absolute" style={{ bottom: 24, right: 60 }}>
          <div style={{ width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderBottom: '10px solid rgba(180,60,90,0.4)', margin: '0 auto' }} />
          <div style={{ width: 20, height: 14, background: 'rgba(220,80,110,0.5)', borderRadius: '4px 4px 0 0', margin: '0 auto' }} />
          <div style={{ width: 16, height: 30, background: 'rgba(240,120,150,0.5)', margin: '0 auto', borderRadius: 2 }} />
        </div>
        {/* 标题区 */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-10">
          <div className="text-lg font-bold text-white">登录</div>
          <div
            className="text-sm text-white/90 cursor-pointer font-medium"
            onClick={() => switchMode('sms')}
          >
            注册
          </div>
        </div>
      </div>

      {/* ══ 主体 ══ */}
      <div className="flex-1 bg-white overflow-y-auto px-6 pt-8 pb-6">

        {/* 测试模式提示 */}
        {IS_TEST_MODE && (
          <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            🔧 测试模式 · 验证码固定 <strong>123456</strong>，不发真实短信
          </div>
        )}

        {/* ── 模式切换 Tab ── */}
        <div className="flex mb-6" style={{ borderBottom: '1.5px solid #F0E8EA' }}>
          {(['sms', 'pwd'] as LoginMode[]).map((m) => (
            <div
              key={m}
              onClick={() => switchMode(m)}
              className="flex-1 text-center py-2.5 text-[15px] font-semibold cursor-pointer transition-all"
              style={{
                color: mode === m ? 'var(--color-primary, #F87098)' : '#9A8090',
                borderBottom: mode === m ? '2.5px solid #F87098' : '2.5px solid transparent',
                marginBottom: -1.5,
              }}
            >
              {m === 'sms' ? '验证码登录' : '密码登录'}
            </div>
          ))}
        </div>

        {/* ── 验证码面板 ── */}
        {mode === 'sms' && (
          <form onSubmit={handleLogin} className="space-y-0">
            {/* 手机号 */}
            <div
              className="flex items-center gap-3.5"
              style={{ borderBottom: '1px solid #F0E8EA', padding: '14px 0' }}
            >
              <div className="w-[22px] h-[22px] flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#F0B8C8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                  <line x1="12" y1="18" x2="12.01" y2="18"/>
                </svg>
              </div>
              <input
                type="tel"
                placeholder="请输入手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                className="flex-1 border-none outline-none bg-transparent text-[15px] text-[#4A3035] placeholder:text-[#C0A8AD]"
                maxLength={11}
                autoComplete="tel"
              />
            </div>

            {/* 验证码 */}
            <div
              className="flex items-center gap-3.5"
              style={{ borderBottom: '1px solid #F0E8EA', padding: '14px 0' }}
            >
              <div className="w-[22px] h-[22px] flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#F0B8C8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <input
                type="number"
                placeholder="请输入验证码"
                value={code}
                onChange={(e) => setCode(e.target.value.slice(0, 6))}
                className="flex-1 border-none outline-none bg-transparent text-[15px] text-[#4A3035] placeholder:text-[#C0A8AD]"
                style={{ letterSpacing: 4 }}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              {/* 发送验证码按钮 */}
              <button
                type="button"
                onClick={handleSendCode}
                disabled={loadingSend || countdown > 0}
                className="flex-shrink-0 text-[13px] font-semibold px-2.5 py-1 rounded-xl border transition-all"
                style={
                  countdown > 0
                    ? { color: '#9A8090', borderColor: '#E8E0E4', background: 'transparent', pointerEvents: 'none' }
                    : { color: '#F87098', borderColor: '#F87098', background: 'transparent' }
                }
              >
                {loadingSend
                  ? '发送中…'
                  : countdown > 0
                  ? `${countdown}s 后重发`
                  : codeSent
                  ? '重新获取'
                  : '获取验证码'}
              </button>
            </div>

            {error && (
              <div className="mt-3 text-sm text-red-500 bg-red-50 px-4 py-2.5 rounded-lg">{error}</div>
            )}

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={loadingLogin}
              className="w-full mt-8 py-4 text-white font-bold text-base cursor-pointer border-none transition-all active:scale-[0.97] disabled:opacity-60"
              style={{
                borderRadius: 50,
                background: 'linear-gradient(90deg, #F87098, #F9A8C0)',
                boxShadow: '0 6px 20px rgba(248,112,152,0.4)',
              }}
            >
              {loadingLogin ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  登录中…
                </span>
              ) : '登录 / 注册'}
            </button>

            {/* 协议 */}
            <div className="text-center mt-4 text-[11px] text-[#9A8090] leading-relaxed">
              登录即代表同意{' '}
              <span className="text-[#F87098] font-medium cursor-pointer">《用户协议》</span>
              {' '}和{' '}
              <span className="text-[#F87098] font-medium cursor-pointer">《隐私政策》</span>
            </div>
          </form>
        )}

        {/* ── 密码面板 ── */}
        {mode === 'pwd' && (
          <form
            onSubmit={(e) => { e.preventDefault(); showToast('密码登录功能开发中，请使用验证码登录') }}
            className="space-y-0"
          >
            {/* 手机号 */}
            <div
              className="flex items-center gap-3.5"
              style={{ borderBottom: '1px solid #F0E8EA', padding: '14px 0' }}
            >
              <div className="w-[22px] h-[22px] flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#F0B8C8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                  <line x1="12" y1="18" x2="12.01" y2="18"/>
                </svg>
              </div>
              <input
                type="tel"
                placeholder="请输入手机号"
                value={pwdPhone}
                onChange={(e) => setPwdPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                className="flex-1 border-none outline-none bg-transparent text-[15px] text-[#4A3035] placeholder:text-[#C0A8AD]"
                maxLength={11}
                autoComplete="tel"
              />
            </div>

            {/* 密码 */}
            <div
              className="flex items-center gap-3.5"
              style={{ borderBottom: '1px solid #F0E8EA', padding: '14px 0' }}
            >
              <div className="w-[22px] h-[22px] flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#F0B8C8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder="请输入密码"
                value={pwdPass}
                onChange={(e) => setPwdPass(e.target.value)}
                className="flex-1 border-none outline-none bg-transparent text-[15px] text-[#4A3035] placeholder:text-[#C0A8AD]"
                autoComplete="current-password"
              />
              <span
                className="text-[13px] text-[#F87098] cursor-pointer font-medium flex-shrink-0"
                onClick={() => showToast('忘记密码 - 请使用验证码登录')}
              >
                忘记密码?
              </span>
            </div>

            {/* 登录按钮 */}
            <button
              type="submit"
              className="w-full mt-8 py-4 text-white font-bold text-base cursor-pointer border-none transition-all active:scale-[0.97]"
              style={{
                borderRadius: 50,
                background: 'linear-gradient(90deg, #F87098, #F9A8C0)',
                boxShadow: '0 6px 20px rgba(248,112,152,0.4)',
              }}
            >
              登录
            </button>

            <div className="text-center mt-5 text-[13px] text-[#9A8090]">
              没有账号？{' '}
              <span
                className="text-[#F87098] font-semibold cursor-pointer"
                onClick={() => switchMode('sms')}
              >
                立即注册
              </span>
            </div>

            {/* 协议 */}
            <div className="text-center mt-4 text-[11px] text-[#9A8090] leading-relaxed">
              登录即代表同意{' '}
              <span className="text-[#F87098] font-medium cursor-pointer">《用户协议》</span>
              {' '}和{' '}
              <span className="text-[#F87098] font-medium cursor-pointer">《隐私政策》</span>
            </div>
          </form>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#4A3035] text-white text-sm px-5 py-2.5 rounded-full z-50 whitespace-nowrap shadow-lg"
          style={{ animation: 'fadeIn .2s ease' }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
