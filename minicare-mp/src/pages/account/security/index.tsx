/**
 * 账号与安全（TECH-016 §5.2）
 *
 * 设置 / 修改密码。放行条件（与后端 `SetPasswordDto` 的矩阵一致）：
 *   ① 已设置密码且填了正确的原密码
 *   ② 手机短信验证码验证通过
 *   ③ 最近 10 分钟内做过短信验证（后端 `sms_verified_at`）—— 刚用验证码登录过的用户免二次短信
 *
 * 🚨 提交成功后后端会返回新 token（`token_version` +1，旧 token 全部失效），
 *    必须 `adoptNewToken()` 覆盖本地，否则用户改完密码立刻被踢回登录页。
 */
import { View, Text, Input, Button, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useRef, useState } from 'react'
import {
  authApi,
  sendVerificationCode,
  buildPhoneProof,
  adoptNewToken,
  getUser,
  IS_TEST_MODE,
} from '@/api'
import type { PasswordStatus, SetPasswordPayload } from '@/api'
import { PASSWORD_HINT, validatePasswordConfirm } from '@/lib/passwordPolicy'
import { getStatusBarHeight } from '@/lib/safeArea'
import { ICON_EYE, ICON_EYE_OFF } from '@/assets/icons/svgDataUris'

import './index.scss'

const ICON_BACK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4a3035" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>')}`

function maskPhone(phone?: string): string {
  if (!phone || phone.length < 7) return phone || '—'
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

function formatTime(raw: string | null): string {
  if (!raw) return '—'
  // 后端返回 ISO 字符串，取到分钟即可
  return raw.replace('T', ' ').slice(0, 16)
}

export default function AccountSecurityPage() {
  const [status, setStatus] = useState<PasswordStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  /** 三个密码输入框各自的明文切换（眼睛图标） */
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [loadingSend, setLoadingSend] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const verifyOtpRef = useRef<((params: { token: string }) => Promise<unknown>) | undefined>()

  const hasPassword = !!status?.hasPassword
  // 10 分钟内短信验证过 → 免验证码（刚用验证码登录过的用户）
  const smsFresh = !!status?.smsVerifiedRecently
  const showCodeRow = !smsFresh
  const phone = getUser()?.phone

  const loadStatus = async () => {
    setLoadingStatus(true)
    setLoadError('')
    try {
      const res = await authApi.passwordStatus()
      setStatus(res)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoadingStatus(false)
    }
  }

  useDidShow(() => {
    loadStatus()
  })

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
    if (!phone) {
      Taro.showToast({ title: '未获取到手机号，请重新登录', icon: 'none' })
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
    const pwdErr = validatePasswordConfirm(newPassword, confirm)
    if (pwdErr) {
      Taro.showToast({ title: pwdErr, icon: 'none' })
      return
    }
    // 已有密码时必须二选一：原密码 或 验证码
    if (hasPassword && !currentPassword && !code.trim() && !smsFresh) {
      Taro.showToast({ title: '请输入原密码，或使用短信验证码验证', icon: 'none' })
      return
    }
    if (!hasPassword && !smsFresh && !code.trim()) {
      Taro.showToast({ title: '请先获取并输入验证码', icon: 'none' })
      return
    }

    setSubmitting(true)
    try {
      const payload: SetPasswordPayload = { newPassword }

      if (hasPassword && currentPassword) {
        payload.currentPassword = currentPassword
      } else if (code.trim()) {
        // 走验证码验证（test 传 code，sms 传 CloudBase accessToken）
        Object.assign(payload, await buildPhoneProof(code, verifyOtpRef.current))
      }

      const res = await authApi.setPassword(payload)
      adoptNewToken(res)
      Taro.showToast({ title: hasPassword ? '密码修改成功' : '密码设置成功', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '操作失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) Taro.navigateBack()
    else Taro.switchTab({ url: '/pages/profile/index' })
  }

  return (
    <View className='security-page' style={{ paddingTop: `${getStatusBarHeight()}px` }}>
      <View className='security-nav'>
        <View className='security-nav__back' onClick={handleBack}>
          <Image src={ICON_BACK} style={{ width: 22, height: 22 }} />
        </View>
      </View>

      <View className='security-card'>
        <Text className='security-title'>{hasPassword ? '修改密码' : '设置密码'}</Text>
        <Text className='security-subtitle'>
          {hasPassword
            ? '修改后其他设备需要重新登录'
            : '设置后可用手机号 + 密码快速登录'}
        </Text>

        {/* 账号信息 */}
        <View className='security-info'>
          <Text className='security-info__label'>手机号</Text>
          <Text className='security-info__value'>{maskPhone(phone)}</Text>
        </View>
        <View className='security-info'>
          <Text className='security-info__label'>密码</Text>
          <Text className='security-info__value'>
            {loadingStatus
              ? '加载中…'
              : status
                ? hasPassword
                  ? `已设置 · ${formatTime(status.passwordUpdatedAt)}`
                  : '未设置'
                : loadError || '—'}
          </Text>
        </View>

        {/* 原密码（仅修改时） */}
        {hasPassword && (
          <View className='security-field security-field--pwd'>
            <Input
              className='security-input'
              password={!showCurrent}
              maxlength={20}
              placeholder='请输入原密码'
              value={currentPassword}
              onInput={(e) => setCurrentPassword(e.detail.value)}
            />
            <View className='security-eye' onClick={() => setShowCurrent((v) => !v)}>
              <Image src={showCurrent ? ICON_EYE_OFF : ICON_EYE} style={{ width: 18, height: 18 }} />
            </View>
          </View>
        )}

        {/* 验证码（免短信窗口内隐藏） */}
        {showCodeRow && (
          <>
            <View className='security-field security-field--code'>
              <Input
                className='security-input'
                type='number'
                maxlength={6}
                placeholder={hasPassword ? '或输入短信验证码' : '请输入验证码'}
                value={code}
                onInput={(e) => setCode(e.detail.value)}
              />
              <Button
                className='security-send'
                size='mini'
                loading={loadingSend}
                disabled={loadingSend || countdown > 0}
                onClick={handleSendCode}
              >
                {countdown > 0 ? `${countdown}s` : '获取验证码'}
              </Button>
            </View>
            {!hasPassword && (
              <Text className='security-hint'>需先验证手机号，验证码将发送至上方手机号</Text>
            )}
          </>
        )}

        {smsFresh && (
          <Text className='security-hint'>已通过短信验证，无需再次验证码</Text>
        )}

        {/* 新密码 */}
        <View className='security-field security-field--pwd'>
          <Input
            className='security-input'
            password={!showNew}
            maxlength={20}
            placeholder='请输入新密码'
            value={newPassword}
            onInput={(e) => setNewPassword(e.detail.value)}
          />
          <View className='security-eye' onClick={() => setShowNew((v) => !v)}>
            <Image src={showNew ? ICON_EYE_OFF : ICON_EYE} style={{ width: 18, height: 18 }} />
          </View>
        </View>
        <View className='security-field security-field--pwd'>
          <Input
            className='security-input'
            password={!showConfirm}
            maxlength={20}
            placeholder='请再次输入新密码'
            value={confirm}
            onInput={(e) => setConfirm(e.detail.value)}
          />
          <View className='security-eye' onClick={() => setShowConfirm((v) => !v)}>
            <Image src={showConfirm ? ICON_EYE_OFF : ICON_EYE} style={{ width: 18, height: 18 }} />
          </View>
        </View>

        <Text className='security-hint'>{PASSWORD_HINT}</Text>

        <Button
          className='security-btn'
          loading={submitting}
          disabled={loadingStatus || !status}
          onClick={handleSubmit}
        >
          {hasPassword ? '确认修改' : '确认设置'}
        </Button>
      </View>
    </View>
  )
}
