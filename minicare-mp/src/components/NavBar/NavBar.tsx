/**
 * 自定义导航栏组件
 *
 * 全局 navigationStyle: 'custom' 后，需要各页面自行处理状态栏区域。
 * 此组件提供与原生导航栏一致的高度占位 + 可选标题/返回按钮。
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getStatusBarHeight } from '@/lib/safeArea'
import './NavBar.scss'

interface NavBarProps {
  /** 标题文字 */
  title?: string
  /** 是否显示返回按钮（非首层页面） */
  showBack?: boolean
  /** 背景色，默认透明 */
  background?: string
  /** 标题颜色，默认 #4a3035 */
  color?: string
  /** 自定义返回逻辑 */
  onBack?: () => void
}

export default function NavBar({
  title,
  showBack = false,
  background = 'transparent',
  color = '#4a3035',
  onBack,
}: NavBarProps) {
  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      Taro.navigateBack({ delta: 1 })
    }
  }

  return (
    <View className='navbar' style={{ background }}>
      {/* 状态栏占位 */}
      <View className='navbar__status-bar' style={{ height: `${getStatusBarHeight()}px` }} />
      {/* 导航内容区 */}
      <View className='navbar__content'>
        {showBack && (
          <View className='navbar__back' onClick={handleBack}>
            <View className='navbar__back-icon' style={{ borderColor: color }} />
          </View>
        )}
        {title && (
          <Text className='navbar__title' style={{ color }}>
            {title}
          </Text>
        )}
      </View>
    </View>
  )
}
