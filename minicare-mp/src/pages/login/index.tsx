/**
 * 登录页
 *
 * AUTH_MODE（编译时由 TARO_APP_AUTH_MODE 注入）：
 *   test → 后端固定验证码 123456，不发真实短信
 *   sms  → CloudBase JS SDK 发真实短信 → 验证后调后端 tcb-login 换 JWT
 */
import { View, Text, Input, Button, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { sendVerificationCode, loginByCode, IS_TEST_MODE } from '@/api/auth'
import { familyApi, babyApi } from '@/api'
import { getToken, setCurrentFamilyId, setCurrentBabyId, getCurrentFamilyId } from '@/api/http'
import { getStatusBarHeight } from '@/lib/safeArea'

import './index.scss'

const ICON_BACK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4a3035" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>')}`
const ICON_CHECK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>')}`

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
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

  const handleSendCode = async () => {
    if (!agreed) {
      Taro.showToast({ title: '请先阅读并同意隐私政策和用户协议', icon: 'none' })
      return
    }
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
    if (!agreed) {
      Taro.showToast({ title: '请先阅读并同意隐私政策和用户协议', icon: 'none' })
      return
    }
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
      await loginByCode(phone, code, verifyOtpRef.current)
      Taro.showToast({ title: '登录成功', icon: 'success' })

      let babies: any[] = []
      let pendingInvites: any[] = []
      try {
        ;[babies, pendingInvites] = await Promise.all([
          babyApi.getMine().catch(async () => {
            const families = await familyApi.getMine()
            if (!families.length) return []
            const fid = getCurrentFamilyId(families)!
            setCurrentFamilyId(fid)
            try {
              const baby = await babyApi.get(fid)
              return [{ ...baby, family_id: fid, family_name: families.find(f => f.id === fid)?.name, family_role: families.find(f => f.id === fid)?.role }]
            } catch {
              return []
            }
          }),
          familyApi.getPendingInvites().catch(() => []),
        ])
      } catch {
        Taro.reLaunch({ url: '/pages/onboarding/index' })
        return
      }

      if (!babies.length && !pendingInvites.length) {
        Taro.reLaunch({ url: '/pages/onboarding/index' })
        return
      }

      if (pendingInvites.length > 0) {
        Taro.reLaunch({ url: '/pages/home/index' })
        return
      }

      const baby = babies[0]
      setCurrentFamilyId(baby.family_id)
      setCurrentBabyId(baby.id)
      Taro.reLaunch({ url: '/pages/home/index' })
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '登录失败', icon: 'none' })
    } finally {
      setLoadingLogin(false)
    }
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

        {/* 隐私政策与用户协议勾选 */}
        <View className='login-agreement'>
          <View
            className={`login-agreement__check ${agreed ? 'login-agreement__check--active' : ''}`}
            onClick={() => setAgreed(!agreed)}
          >
            {agreed && (
              <Image src={ICON_CHECK} style={{ width: 12, height: 12 }} />
            )}
          </View>
          <Text className='login-agreement__text'>我已阅读并同意</Text>
          <Text
            className='login-agreement__link'
            onClick={() => Taro.navigateTo({ url: '/pages/privacy/index?tab=privacy' })}
          >《隐私政策》</Text>
          <Text className='login-agreement__text'>和</Text>
          <Text
            className='login-agreement__link'
            onClick={() => Taro.navigateTo({ url: '/pages/privacy/index?tab=terms' })}
          >《用户服务协议》</Text>
        </View>
      </View>
    </View>
  )
}
