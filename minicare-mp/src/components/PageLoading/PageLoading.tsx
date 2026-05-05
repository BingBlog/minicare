/**
 * PageLoading — 页面加载占位组件
 *
 * 统一所有页面的 loading 状态 UI。
 */
import { View, Text } from '@tarojs/components'
import './PageLoading.scss'

export interface PageLoadingProps {
  /** 加载提示文案，默认 "加载中..." */
  text?: string
}

export default function PageLoading({ text = '加载中...' }: PageLoadingProps) {
  return (
    <View className='page-loading'>
      <Text className='page-loading__text'>{text}</Text>
    </View>
  )
}
