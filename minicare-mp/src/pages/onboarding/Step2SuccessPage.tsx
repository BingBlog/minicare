/**
 * Onboarding Step 2 — 创建成功页
 *
 * 内容（与 Web Step2SuccessPage 一致）：
 *   - 成功动画勾选圆圈
 *   - 成功标题 + 引导文案
 *   - 宝宝信息卡片（姓名、性别月龄）
 *   - 「进入首页，开始记录」按钮
 *
 * 差异化：
 *   - 导航：useNavigate → Taro.reLaunch
 *   - 动画：CSS @keyframes → SCSS animation
 *   - getBabyAge：复用 MP lib/utils.ts 中已有的同名函数（L1）
 */
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getBabyAge } from '@/lib/utils'
import type { AllergyLevel } from '@/api'
import { getStatusBarHeight } from '@/lib/safeArea'

interface Props {
  babyName: string
  gender: 'male' | 'female'
  /** 出生日期字符串（YYYY-MM-DD），用于计算月龄 */
  birthDate: string
  allergyLevel: AllergyLevel | ''
}

export default function Step2SuccessPage({
  babyName,
  gender,
  birthDate,
}: Props) {
  const genderText = gender === 'male' ? '男宝宝' : '女宝宝'
  const ageText = birthDate ? getBabyAge(birthDate) : ''

  const handleGoHome = () => {
    Taro.reLaunch({ url: '/pages/home/index' })
  }

  return (
    <View
      className='success-page'
      style={{ paddingTop: `${getStatusBarHeight() + 24}px` }}
    >
      {/* 成功动画圆圈 */}
      <View className='success-page__check-circle'>
        <Image
          className='success-page__check-icon'
          src='data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cG9seWxpbmUgcG9pbnRzPSIyMCA2IDkgMTcgNCAxMiIvPjwvc3ZnPg=='
          mode='aspectFit'
        />
      </View>

      <Text className='success-page__title'>宝宝档案已创建！</Text>
      <Text className='success-page__desc'>
        开始用敏宝日记记录宝宝的{'\n'}每一天，就医时不再烦恼
      </Text>

      {/* 宝宝信息卡片 */}
      <View className='success-page__card'>
        {/* 头像 */}
        <View className='success-page__avatar'>
          <Image
            className='success-page__avatar-icon'
            src='data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEyIDJhNCA0IDAgMCAxIDQgNCA0IDQgMCAwIDEtNCA0IDQgNCAwIDAgMS00LTQgNCA0IDAgMCAxIDQtNCIvPjxwYXRoIGQ9Ik01IDIwYTcgNyAwIDAgMSAxNCAwIi8+PC9zdmc+'
            mode='aspectFit'
          />
        </View>

        {/* 信息 */}
        <Text className='success-page__baby-name'>{babyName || '小宝'}</Text>
        <Text className='success-page__baby-info'>
          {genderText}{ageText ? ` · ${ageText}` : ''}
        </Text>
      </View>

      {/* 进入首页按钮 */}
      <View className='success-page__cta' onClick={handleGoHome}>
        <Text className='success-page__cta-text'>进入首页，开始记录</Text>
      </View>
    </View>
  )
}
