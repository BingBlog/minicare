/**
 * 首页 · 今日日记入口卡片（P3）
 *
 * 有今日日记 → 展示首句摘要 + 「查看」；无 → 引导和敏宝助手写一篇。
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { DiaryDetail } from '@/api/agent'

interface Props {
  diary: DiaryDetail | null
  loading?: boolean
}

export default function TodayDiaryCard({ diary, loading }: Props) {
  if (loading) return null

  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  if (diary) {
    const excerpt = diary.content.replace(/\s+/g, ' ').slice(0, 42)
    return (
      <View
        className='home-card home-diary-card'
        onClick={() => Taro.navigateTo({ url: `/pages/diary/detail?date=${today}` })}
      >
        <View className='home-diary-card__badge'>
          <Text className='home-diary-card__badge-text'>记</Text>
        </View>
        <View className='home-diary-card__body'>
          <Text className='home-diary-card__title'>今日日记</Text>
          <Text className='home-diary-card__excerpt'>{excerpt}…</Text>
        </View>
        <Text className='home-diary-card__more'>查看 ›</Text>
      </View>
    )
  }

  return (
    <View className='home-card home-diary-card' onClick={() => Taro.navigateTo({ url: '/pages/chat/index?preset=diary' })}>
      <View className='home-diary-card__badge home-diary-card__badge--empty'>
        <Text className='home-diary-card__badge-text'>记</Text>
      </View>
      <View className='home-diary-card__body'>
        <Text className='home-diary-card__title'>今天的日记还没写</Text>
        <Text className='home-diary-card__excerpt'>和敏宝助手说一句「帮我写今天的日记」</Text>
      </View>
      <Text className='home-diary-card__more'>去写 ›</Text>
    </View>
  )
}
