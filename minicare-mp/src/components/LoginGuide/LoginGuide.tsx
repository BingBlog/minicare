/**
 * 通用登录引导组件
 *
 * 用于各 tabBar 页面在未登录时展示友好提示，
 * 而非直接 reLaunch 到登录页，满足微信审核要求。
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

import './LoginGuide.scss'

interface LoginGuideProps {
  /** 提示标题，默认"登录后查看" */
  title?: string
  /** 提示描述 */
  desc?: string
}

export default function LoginGuide({ title = '登录后查看', desc = '登录后即可使用完整功能' }: LoginGuideProps) {
  return (
    <View className='login-guide'>
      <View className='login-guide__icon'>
        <svg viewBox='0 0 24 24' fill='none' stroke='#f87098' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' style={{ width: 32, height: 32 }}>
          <path d='M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2' />
          <circle cx='12' cy='7' r='4' />
        </svg>
      </View>
      <Text className='login-guide__title'>{title}</Text>
      <Text className='login-guide__desc'>{desc}</Text>
      <View
        className='login-guide__btn'
        onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}
      >
        <Text className='login-guide__btn-text'>去登录</Text>
      </View>
    </View>
  )
}
