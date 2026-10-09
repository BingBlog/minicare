/**
 * 忘记密码 · 重置（TECH-016 §5.2）
 *
 * 流程：手机号 → 获取验证码 → 验证码 + 新密码 → 提交
 *
 * 重置成功后会拿到新 token（后端 token_version +1，旧 token 全部失效），
 * 用 `adoptNewToken` 覆盖本地后直接 `afterLogin()` 自动登录 —— 用户刚证明了手机所有权，
 * 少一步更顺。
 *
 * 双模式（与登录页同构）：
 *   test → 后端固定验证码 123456，phoneProof 传 { code }
 *   sms  → CloudBase 发真短信，phoneProof 传验证码换来的 { accessToken }
 */
import { View, Text, Input, Button, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useRef, useState } from 'react'
import {
  sendVerificationCode,
  authApi,
  buildPhoneProof,
  adoptNewToken,
  IS_TEST_MODE,
} from '@/api'
import { afterLogin } from '@/lib/afterLogin'
import { PASSWORD_HINT, validatePasswordConfirm } from '@/lib/passwordPolicy'
import { getStatusBarHeight } from '@/lib/safeArea'

import './index.scss'

const ICON_BACK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4a3035" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>')}`

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [phone, setPhone] = useState(router.params?.phone ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [loadingSend, setLoadingSend] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const verifyOtpRef = useRef<((params: { token: string }) => Promise<unknown>) | undefined>()

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
      Taro.showToast({
        title: IS_TEST_MODE ? '验证码已发送（测试码 123456）' : '验证码已发送',
        icon: 'none',
      })
      startCountdown()
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '发送失败', icon: 'none' })
    } finally {
      setLoadingSend(false)
    }
  }

  const handleSubmit = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: '请输入正确手机号', icon: 'none' })
      return
    }
    if (!code.trim()) {
      Taro.showToast({ title: '请输入验证码', icon: 'none' })
      return
    }
    const pwdErr = validatePasswordConfirm(password, confirm)
    if (pwdErr) {
      Taro.showToast({ title: pwdErr, icon: 'none' })
      return
    }

    setSubmitting(true)
    try {
      // 验证码 → 手机所有权凭证（test 传 code，sms 传 CloudBase accessToken）
      const proof = await buildPhoneProof(code, verifyOtpRef.current)
      const res = await authApi.resetPassword({ phone, newPassword: password, ...proof })
      adoptNewToken(res)
      Taro.showToast({ title: '密码已重置', icon: 'success' })
      await afterLogin()
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '重置失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) Taro.navigateBack()
    else Taro.reLaunch({ url: '/pages/login/index' })
  }

  return (
    <View className='forgot-page' style={{ paddingTop: `${getStatusBarHeight()}px` }}>
      <View className='forgot-nav'>
        <View className='forgot-nav__back' onClick={handleBack}>
          <Image src={ICON_BACK} style={{ width: 22, height: 22 }} />
        </View>
      </View>

      <View className='forgot-card'>
        <Text className='forgot-title'>重置密码</Text>
        <Text className='forgot-subtitle'>验证手机号后即可设置新密码</Text>

        <View className='forgot-field'>
          <Input
            className='forgot-input'
            type='number'
            maxlength={11}
            placeholder='请输入手机号'
            value={phone}
            onInput={(e) => setPhone(e.detail.value)}
          />
        </View>

        <View className='forgot-field forgot-field--code'>
          <Input
            className='forgot-input'
            type='number'
            maxlength={6}
            placeholder='请输入验证码'
            value={code}
            onInput={(e) => setCode(e.detail.value)}
          />
          <Button
            className='forgot-send'
            size='mini'
            loading={loadingSend}
            disabled={loadingSend || countdown > 0}
            onClick={handleSendCode}
          >
            {countdown > 0 ? `${countdown}s` : '获取验证码'}
          </Button>
        </View>

        <View className='forgot-field'>
          <Input
            className='forgot-input'
            password
            maxlength={20}
            placeholder='请输入新密码'
            value={password}
            onInput={(e) => setPassword(e.detail.value)}
          />
        </View>

        <View className='forgot-field'>
          <Input
            className='forgot-input'
            password
            maxlength={20}
            placeholder='请再次输入新密码'
            value={confirm}
            onInput={(e) => setConfirm(e.detail.value)}
          />
        </View>

        <Text className='forgot-hint'>{PASSWORD_HINT}</Text>

        <Button className='forgot-btn' loading={submitting} onClick={handleSubmit}>
          重置并登录
        </Button>
      </View>
    </View>
  )
}
