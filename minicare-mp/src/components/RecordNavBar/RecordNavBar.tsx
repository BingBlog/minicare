/**
 * RecordNavBar — 记录表单页面通用导航栏
 *
 * 统一所有记录表单页面的导航栏结构：
 * - 左侧返回箭头
 * - 居中标题（根据编辑/新建模式切换）
 * - 右侧占位或操作按钮（编辑模式）
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getStatusBarHeight } from '@/lib/safeArea'
import './RecordNavBar.scss'

export interface RecordNavBarProps {
  /** 新建模式标题 */
  title: string
  /** 编辑模式标题，默认 "编辑{title}" */
  editTitle?: string
  /** 是否编辑模式 */
  isEditMode: boolean
  /** 右侧操作按钮点击（编辑模式下显示"删除"） */
  onRightAction?: () => void
  /** 右侧按钮文案，默认 "删除" */
  rightText?: string
  /** 自定义返回逻辑 */
  onBack?: () => void
}

export default function RecordNavBar({
  title,
  editTitle,
  isEditMode,
  onRightAction,
  rightText = '删除',
  onBack,
}: RecordNavBarProps) {
  const statusBarHeight = getStatusBarHeight()

  const handleBack = () => {
    if (onBack) onBack()
    else Taro.navigateBack()
  }

  const displayTitle = isEditMode ? (editTitle ?? `编辑${title}`) : title

  return (
    <View className='record-nav' style={{ paddingTop: `${statusBarHeight}px` }}>
      <View className='record-nav__content'>
        <View className='record-nav__back' onClick={handleBack}>
          <Text className='record-nav__back-icon'>{'\u2039'}</Text>
        </View>
        <Text className='record-nav__title'>{displayTitle}</Text>
        {isEditMode && onRightAction ? (
          <View className='record-nav__right' onClick={onRightAction}>
            <Text className='record-nav__right-text'>{rightText}</Text>
          </View>
        ) : (
          <View className='record-nav__placeholder' />
        )}
      </View>
    </View>
  )
}
