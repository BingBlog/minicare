/**
 * 登录页业务逻辑 Hook
 *
 * 封装验证码登录 + 密码登录（UI 占位）的全部状态与操作：
 *   - 手机号 / 验证码 输入状态
 *   - 发送验证码（TEST 模式 / SMS 模式）+ 60 秒倒计时
 *   - 登录验证（TEST 模式 / SMS 模式）
 *   - 登录后跳转逻辑（有家庭 → 首页，无家庭 → 引导页）
 *   - Toast 提示
 *   - Tab 切换
 *
 * AUTH_MODE：
 *   test  → 后端 /api/auth/send-code + /api/auth/verify-code
 *   sms   → CloudBase signInWithOtp + /api/auth/tcb-login
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '@/lib/cloudbase'
import { authApi, familyApi, babyApi, setToken } from '@/api'
import { useAppStore } from '@/lib/store'

const AUTH_MODE = (import.meta.env.VITE_AUTH_MODE as string) || 'test'
const IS_TEST_MODE = AUTH_MODE === 'test'

export type LoginMode = 'sms' | 'pwd'

export function useLoginLogic() {
  const navigate = useNavigate()
  const { setUser, setCurrentFamily, setCurrentBaby } = useAppStore()

  // ── Tab ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<LoginMode>('sms')

  // ── 验证码模式状态 ──────────────────────────────────────────────────
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [loadingSend, setLoadingSend] = useState(false)
  const [loadingLogin, setLoadingLogin] = useState(false)
  const [error, setError] = useState('')

  // ── 密码模式状态（UI 占位，无实际后端） ───────────────────────────────
  const [pwdPhone, setPwdPhone] = useState('')
  const [pwdPass, setPwdPass] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  // ── SMS 模式：CloudBase verifyOtp 回调 ─────────────────────────────
  const [verifyOtp, setVerifyOtp] = useState<((params: { token: string }) => Promise<unknown>) | null>(null)

  // ── Toast ───────────────────────────────────────────────────────────
  const [toast, setToast] = useState('')
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  // ── 登录后检查家庭/宝宝档案，决定跳转目标 ──────────────────────────────
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

  // ── 发送验证码 ───────────────────────────────────────────────────────
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

  // ── 60 秒倒计时 ──────────────────────────────────────────────────────
  const startCountdown = () => {
    setCountdown(60)
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timer); return 0 }
        return c - 1
      })
    }, 1000)
  }

  // ── 验证码登录提交 ───────────────────────────────────────────────────
  const handleSmsLogin = async (e: React.FormEvent) => {
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
        const { data, error: sdkError } = await (verifyOtp as (p: { token: string }) => Promise<{ data?: { session?: { access_token?: string } }; error?: { message?: string } }>)({ token: code })
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

  // ── 密码登录提交（功能开发中） ───────────────────────────────────────
  const handlePwdLogin = (e: React.FormEvent) => {
    e.preventDefault()
    showToast('密码登录功能开发中，请使用验证码登录')
  }

  // ── Tab 切换 ─────────────────────────────────────────────────────────
  const switchMode = (m: LoginMode) => {
    setMode(m)
    setError('')
  }

  return {
    // Tab
    mode,
    switchMode,
    // 验证码面板
    phone, setPhone,
    code, setCode,
    codeSent,
    countdown,
    loadingSend,
    loadingLogin,
    error,
    handleSendCode,
    handleSmsLogin,
    // 密码面板
    pwdPhone, setPwdPhone,
    pwdPass, setPwdPass,
    showPwd, setShowPwd,
    handlePwdLogin,
    // Toast
    toast,
    showToast,
    IS_TEST_MODE,
  }
}
