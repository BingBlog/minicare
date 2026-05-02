/**
 * 登录页
 *
 * AUTH_MODE（编译时由 TARO_APP_AUTH_MODE 注入）：
 *   test → 后端固定验证码 123456，不发真实短信
 *   sms  → CloudBase JS SDK 发真实短信 → 验证后调后端 tcb-login 换 JWT
 */
import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { sendVerificationCode, loginByCode, IS_TEST_MODE } from '@/api/auth'
import { getToken } from '@/api/http'
import { getStatusBarHeight } from '@/lib/safeArea'

import './index.scss'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [loadingSend, setLoadingSend] = useState(false)
  const [loadingLogin, setLoadingLogin] = useState(false)

  // SMS 模式下保存 verifyOtp 回调，供登录时使用
  const verifyOtpRef = useRef<((params: { token: string }) => Promise<unknown>) | undefined>()

  useEffect(() => {
    const token = getToken()
    if (token) {
      Taro.reLaunch({ url: '/pages/home/index' })
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

  const handleSendCode = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: '请输入正确手机号', icon: 'none' })
      return
    }
    setLoadingSend(true)
    try {
      const { verifyOtp } = await sendVerificationCode(phone)
      verifyOtpRef.current = verifyOtp
      const toastMsg = IS_TEST_MODE
        ? '验证码已发送（测试码 123456）'
        : '验证码已发送'
      Taro.showToast({ title: toastMsg, icon: 'none' })
      startCountdown()
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '发送失败', icon: 'none' })
    } finally {
      setLoadingSend(false)
    }
  }

  const handleLogin = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: '请输入正确手机号', icon: 'none' })
      return
    }
    if (!code.trim()) {
      Taro.showToast({ title: '请输入验证码', icon: 'none' })
      return
    }
    setLoadingLogin(true)
    try {
      const result = await loginByCode(phone, code, verifyOtpRef.current)
      Taro.showToast({ title: '登录成功', icon: 'success' })
      // 新用户且无已激活家庭 → 引导创建宝宝档案
      const hasFamily = result.activatedFamilyIds && result.activatedFamilyIds.length > 0
      if (result.isNewUser && !hasFamily) {
        Taro.reLaunch({ url: '/pages/onboarding/index' })
      } else {
        Taro.reLaunch({ url: '/pages/home/index' })
      }
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '登录失败', icon: 'none' })
    } finally {
      setLoadingLogin(false)
    }
  }

  return (
    <View className='login-page' style={{ paddingTop: `${getStatusBarHeight() + 24}px` }}>
      <View className='login-card'>
        <Text className='login-title'>敏宝日记登录</Text>
        {IS_TEST_MODE && (
          <Text className='login-subtitle'>开发模式：验证码固定 123456</Text>
        )}

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

        <Button className='login-btn' loading={loadingLogin} onClick={handleLogin}>
          登录
        </Button>
      </View>
    </View>
  )
}
