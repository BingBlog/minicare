/**
 * 登录页（TECH-016：新增「密码登录」）
 *
 * 两个 Tab：
 *   验证码登录 —— 登录即注册；AUTH_MODE=test 时固定验证码 123456
 *   密码登录   —— 仅对已设置密码的账号可用；未设置时自动切回验证码 Tab
 *
 * AUTH_MODE（编译时由 TARO_APP_AUTH_MODE 注入）：
 *   test → 后端固定验证码 123456，不发真实短信
 *   sms  → CloudBase JS SDK 发真实短信 → 验证后调后端 tcb-login 换 JWT
 *
 * 登录后跳转逻辑已抽到 `@/lib/afterLogin`，与密码登录共用。
 */
import { View, Text, Input, Button, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import {
  sendVerificationCode,
  loginByCode,
  loginByPasswordAndPersist,
  IS_TEST_MODE,
  NO_PASSWORD_SET,
  ApiError,
} from '@/api'
import { getToken } from '@/api/http'
import { afterLogin } from '@/lib/afterLogin'
import { getStatusBarHeight } from '@/lib/safeArea'

import './index.scss'

const ICON_BACK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4a3035" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>')}`
const ICON_CHECK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>')}`

type LoginMode = 'sms' | 'pwd'

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>('sms')
  // 手机号两个 Tab 共用，切换时不丢失已输入内容
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [loadingSend, setLoadingSend] = useState(false)
  const [loadingLogin, setLoadingLogin] = useState(false)
  const [agreed, setAgreed] = useState(false)

  // SMS 模式下保存 verifyOtp 回调，供登录时使用
  const verifyOtpRef = useRef<((params: { token: string }) => Promise<unknown>) | undefined>()

  useEffect(() => {
    const token = getToken()
    if (!token) return
    const fid = Taro.getStorageSync('minicare_current_family_id')
    if (fid) {
      setTimeout(() => {
        Taro.switchTab({ url: '/pages/home/index' })
      }, 100)
    }
  }, [])

  const startCountdown = () => {
    setCountdown(60)
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  /** 校验手机号 + 协议勾选，通过返回 true */
  const checkPhoneAndAgreement = (): boolean => {
    if (!agreed) {
      Taro.showToast({ title: '请先阅读并同意隐私政策和用户协议', icon: 'none' })
      return false
    }
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: '请输入正确手机号', icon: 'none' })
      return false
    }
    return true
  }

  const handleSendCode = async () => {
    if (!checkPhoneAndAgreement()) return
    setLoadingSend(true)
    try {
      const { verifyOtp } = await sendVerificationCode(phone)
      verifyOtpRef.current = verifyOtp
      const toastMsg = IS_TEST_MODE ? '验证码已发送（测试码 123456）' : '验证码已发送'
      Taro.showToast({ title: toastMsg, icon: 'none' })
      startCountdown()
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '发送失败', icon: 'none' })
    } finally {
      setLoadingSend(false)
    }
  }

  /** 验证码登录 */
  const handleSmsLogin = async () => {
    if (!checkPhoneAndAgreement()) return
    if (!code.trim()) {
      Taro.showToast({ title: '请输入验证码', icon: 'none' })
      return
    }
    setLoadingLogin(true)
    try {
      await loginByCode(phone, code, verifyOtpRef.current)
      Taro.showToast({ title: '登录成功', icon: 'success' })
      await afterLogin()
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '登录失败', icon: 'none' })
    } finally {
      setLoadingLogin(false)
    }
  }

  /** 密码登录 */
  const handlePwdLogin = async () => {
    if (!checkPhoneAndAgreement()) return
    if (!password) {
      Taro.showToast({ title: '请输入密码', icon: 'none' })
      return
    }
    setLoadingLogin(true)
    try {
      await loginByPasswordAndPersist(phone, password)
      Taro.showToast({ title: '登录成功', icon: 'success' })
      await afterLogin()
    } catch (err) {
      // 该账号从未设置密码 → 清空密码并切回验证码 Tab
      if (err instanceof ApiError && err.code === NO_PASSWORD_SET) {
        setPassword('')
        setMode('sms')
        Taro.showToast({ title: err.message, icon: 'none' })
        return
      }
      Taro.showToast({ title: err instanceof Error ? err.message : '登录失败', icon: 'none' })
    } finally {
      setLoadingLogin(false)
    }
  }

  /** 密码 Tab 的「立即注册」：注册就是验证码登录，故切回验证码 Tab */
  const switchToSmsRegister = () => {
    setMode('sms')
    Taro.showToast({ title: '手机号验证码即可注册或登录', icon: 'none' })
  }

  const goForgot = () => {
    const q = /^1\d{10}$/.test(phone) ? `?phone=${phone}` : ''
    Taro.navigateTo({ url: `/pages/login/forgot/index${q}` })
  }

  const handleBack = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) {
      Taro.navigateBack()
    } else {
      Taro.reLaunch({ url: '/pages/home/index' })
    }
  }

  return (
    <View className='login-page' style={{ paddingTop: `${getStatusBarHeight()}px` }}>
      {/* 导航栏 */}
      <View className='login-nav'>
        <View className='login-nav__back' onClick={handleBack}>
          <Image src={ICON_BACK} style={{ width: 22, height: 22 }} />
        </View>
      </View>

      <View className='login-card'>
        <Text className='login-title'>敏宝日记登录</Text>

        {/* 登录方式切换 */}
        <View className='login-mode-tabs'>
          <View
            className={`login-mode-tab${mode === 'sms' ? ' login-mode-tab--active' : ''}`}
            onClick={() => setMode('sms')}
          >
            验证码登录
          </View>
          <View
            className={`login-mode-tab${mode === 'pwd' ? ' login-mode-tab--active' : ''}`}
            onClick={() => setMode('pwd')}
          >
            密码登录
          </View>
        </View>

        {IS_TEST_MODE && (
          <Text className='login-subtitle'>
            {mode === 'sms' ? '开发模式：验证码固定 123456' : '开发模式：密码登录走真实校验'}
          </Text>
        )}

        {/* 手机号（两个 Tab 共用） */}
        <View className='login-field'>
          <Input
            className='login-input'
            type='number'
            maxlength={11}
            placeholder='请输入手机号'
            value={phone}
            onInput={(e) => setPhone(e.detail.value)}
          />
        </View>

        {mode === 'sms' ? (
          <View className='login-field login-field--code'>
            <Input
              className='login-input'
              type='number'
              maxlength={6}
              placeholder='请输入验证码'
              value={code}
              onInput={(e) => setCode(e.detail.value)}
            />
            <Button
              className='login-send'
              size='mini'
              loading={loadingSend}
              disabled={loadingSend || countdown > 0}
              onClick={handleSendCode}
            >
              {countdown > 0 ? `${countdown}s` : '获取验证码'}
            </Button>
          </View>
        ) : (
          <View className='login-field login-field--pwd'>
            <Input
              className='login-input'
              password
              maxlength={20}
              placeholder='请输入密码'
              value={password}
              onInput={(e) => setPassword(e.detail.value)}
            />
            <Text className='login-field-extra' onClick={goForgot}>
              忘记密码?
            </Text>
          </View>
        )}

        <Button
          className='login-btn'
          loading={loadingLogin}
          onClick={mode === 'sms' ? handleSmsLogin : handlePwdLogin}
        >
          登录
        </Button>

        {/* 密码 Tab 才有：注册入口（注册即验证码登录） */}
        {mode === 'pwd' && (
          <View className='login-switch'>
            <Text className='login-switch__text'>没有账号？</Text>
            <Text className='login-switch__link' onClick={switchToSmsRegister}>
              立即注册
            </Text>
          </View>
        )}

        {/* 隐私政策与用户协议勾选 */}
        <View className='login-agreement'>
          <View
            className={`login-agreement__check ${agreed ? 'login-agreement__check--active' : ''}`}
            onClick={() => setAgreed(!agreed)}
          >
            {agreed && <Image src={ICON_CHECK} style={{ width: 12, height: 12 }} />}
          </View>
          <Text className='login-agreement__text'>我已阅读并同意</Text>
          <Text
            className='login-agreement__link'
            onClick={() => Taro.navigateTo({ url: '/pages/privacy/index?tab=privacy' })}
          >
            《隐私政策》
          </Text>
          <Text className='login-agreement__text'>和</Text>
          <Text
            className='login-agreement__link'
            onClick={() => Taro.navigateTo({ url: '/pages/privacy/index?tab=terms' })}
          >
            《用户服务协议》
          </Text>
        </View>
      </View>
    </View>
  )
}
