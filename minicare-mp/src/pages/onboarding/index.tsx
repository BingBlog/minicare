/**
 * 新用户引导页 — 创建家庭 + 添加宝宝
 *
 * 流程（3 步，与 Web onboarding/index.tsx 完全一致）：
 *   Step 0：引导介绍页（产品特性 + 「开始创建宝宝档案」按钮）
 *   Step 1：档案创建表单（姓名/出生日期/性别/过敏程度）
 *   Step 2：创建成功页（动画圆圈 + 宝宝信息卡片 + 进入首页）
 *
 * 子组件（与 Web 1:1 对应）：
 *   Step0WelcomePage  引导介绍页
 *   StepDots          步骤进度指示器
 *   BabyInfoForm      基本信息表单（姓名/日期/性别）
 *   AllergySection    过敏信息（程度选择 + CDC 提示）
 *   Step2SuccessPage  创建成功页
 *
 * 差异化：
 *   - 全局状态：Web Zustand store → MP Taro.setStorageSync
 *   - Toast：Web 自定义 DOM → MP Taro.showToast
 *   - 导航：Web react-router → MP Taro.navigateBack/reLaunch
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { familyApi, babyApi } from '@/api'
import type { AllergyLevel } from '@/api'
import { nowDate } from '@/lib/utils'

import NavBar from '@/components/NavBar/NavBar'
import Step0WelcomePage from './Step0WelcomePage'
import StepDots from './StepDots'
import BabyInfoForm from './BabyInfoForm'
import AllergySection from './AllergySection'
import Step2SuccessPage from './Step2SuccessPage'

import './index.scss'

type Step = 0 | 1 | 2
type AllergyLevelKey = AllergyLevel | ''

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(0)

  // 家庭信息（Step 1 隐藏，自动生成）
  const [familyName] = useState('我们的家')

  // 宝宝基础信息
  const [babyName, setBabyName] = useState('')
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [birthDate, setBirthDate] = useState(() => nowDate())

  // 过敏信息
  const [allergyLevel, setAllergyLevel] = useState<AllergyLevelKey>('unknown')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ── 保存档案（与 Web handleCreate 逻辑完全一致） ──────────────────
  const handleCreate = async () => {
    if (!babyName.trim()) {
      Taro.showToast({ title: '请输入宝宝昵称', icon: 'none' })
      return
    }
    if (!birthDate) {
      Taro.showToast({ title: '请选择出生日期', icon: 'none' })
      return
    }

    setLoading(true)
    setError('')
    try {
      const family = await familyApi.create(familyName)
      // MP 无全局 store，将家庭信息缓存到本地存储
      Taro.setStorageSync('minicare_family', family)

      const baby = await babyApi.create(family.id, {
        name: babyName.trim(),
        gender,
        birth_date: birthDate,
        allergy_types: ['milk'],
        allergy_level: allergyLevel || undefined,
      })
      Taro.setStorageSync('minicare_baby', baby)

      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 0：引导页 ──────────────────────────────────────────────
  if (step === 0) {
    return <Step0WelcomePage onStart={() => setStep(1)} />
  }

  // ── Step 2：创建成功 ────────────────────────────────────────────
  if (step === 2) {
    return (
      <Step2SuccessPage
        babyName={babyName}
        gender={gender}
        birthDate={birthDate}
        allergyLevel={allergyLevel}
      />
    )
  }

  // ── Step 1：档案创建表单 ────────────────────────────────────────
  return (
    <View className='onboarding-page'>
      {/* 顶部导航 */}
      <NavBar
        title='创建宝宝档案'
        showBack
        background='#fff'
        onBack={() => setStep(0)}
      />

      {/* 步骤进度点 */}
      <StepDots current={1} total={3} />

      {/* 表单滚动区 */}
      <View className='onboarding-page__body'>
        {/* 基本信息 */}
        <BabyInfoForm
          babyName={babyName}
          onBabyNameChange={setBabyName}
          birthDate={birthDate}
          onBirthDateChange={setBirthDate}
          gender={gender}
          onGenderChange={setGender}
        />

        {/* 过敏信息 */}
        <AllergySection
          allergyLevel={allergyLevel}
          onAllergyLevelChange={setAllergyLevel}
        />

        {/* 错误提示 */}
        {error && (
          <View className='onboarding-page__error'>
            <Text className='onboarding-page__error-text'>{error}</Text>
          </View>
        )}
      </View>

      {/* 底部保存按钮 */}
      <View className='onboarding-page__footer'>
        <View
          className={`onboarding-page__submit ${loading ? 'onboarding-page__submit--disabled' : ''}`}
          onClick={loading ? undefined : handleCreate}
        >
          {loading ? (
            <View className='onboarding-page__submit-loading'>
              <View className='onboarding-page__spinner' />
              <Text className='onboarding-page__submit-text'>创建中...</Text>
            </View>
          ) : (
            <Text className='onboarding-page__submit-text'>保存档案</Text>
          )}
        </View>
      </View>
    </View>
  )
}
