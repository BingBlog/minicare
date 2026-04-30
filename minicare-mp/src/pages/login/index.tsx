import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { authApi, loginByCode } from '@/api'
import { getToken } from '@/api/http'

import './index.scss'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [loadingSend, setLoadingSend] = useState(false)
  const [loadingLogin, setLoadingLogin] = useState(false)

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
      await authApi.sendCode(phone)
      Taro.showToast({ title: '验证码已发送（测试码 123456）', icon: 'none' })
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
      await loginByCode(phone, code)
      Taro.showToast({ title: '登录成功', icon: 'success' })
      Taro.reLaunch({ url: '/pages/home/index' })
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '登录失败', icon: 'none' })
    } finally {
      setLoadingLogin(false)
    }
  }

  return (
    <View className='login-page'>
      <View className='login-card'>
        <Text className='login-title'>敏宝日记登录</Text>
        <Text className='login-subtitle'>开发模式：验证码固定 123456</Text>

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
