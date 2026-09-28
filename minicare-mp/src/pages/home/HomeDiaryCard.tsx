/**
 * 首页 · 日记入口卡片
 *
 * 目标日期是「昨天」而非今天：日记定位为当日回顾式总结，当天数据还不全，
 * 首页提醒也应引导家长写昨天那篇（组件名不再叫 TodayDiaryCard，避免日期耦合误导）。
 *
 * 有昨日日记 → 展示首句摘要 + 「查看」；无 → 引导和敏宝助手写一篇。
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { DiaryDetail } from '@/api/agent'
import { yesterdayStr } from '@/lib/utils'

interface Props {
  diary: DiaryDetail | null
  loading?: boolean
}

export default function HomeDiaryCard({ diary, loading }: Props) {
  // 骨架与真实卡同外框、同 padding：原先 loading 时 return null 会让
  // 空态卡闪现 → 卡片消失（下方内容上移）→ 内容卡出现，形成三重跳变
  if (loading) {
    return (
      <View className='home-card home-diary-card home-diary-card--skeleton'>
        <View className='home-diary-card__badge' />
        <View className='home-diary-card__body'>
          <View className='home-diary-card__sk home-diary-card__sk--title' />
          <View className='home-diary-card__sk home-diary-card__sk--text' />
        </View>
      </View>
    )
  }

  const target = yesterdayStr()

  if (diary) {
    const excerpt = diary.content.replace(/\s+/g, ' ').slice(0, 42)
    return (
      <View
        className='home-card home-diary-card'
        onClick={() => Taro.navigateTo({ url: `/pages/diary/detail?date=${target}` })}
      >
        <View className='home-diary-card__badge'>
          <Text className='home-diary-card__badge-text'>记</Text>
        </View>
        <View className='home-diary-card__body'>
          <Text className='home-diary-card__title'>昨日日记</Text>
          <Text className='home-diary-card__excerpt'>{excerpt}…</Text>
        </View>
        <Text className='home-diary-card__more'>查看 ›</Text>
      </View>
    )
  }

  return (
    <View
      className='home-card home-diary-card'
      onClick={() => Taro.navigateTo({ url: `/pages/chat/index?preset=diary&date=${target}` })}
    >
      <View className='home-diary-card__badge home-diary-card__badge--empty'>
        <Text className='home-diary-card__badge-text'>记</Text>
      </View>
      <View className='home-diary-card__body'>
        <Text className='home-diary-card__title'>昨天的日记还没写</Text>
        <Text className='home-diary-card__excerpt'>和敏宝助手说一句「帮我写昨天的日记」</Text>
      </View>
      <Text className='home-diary-card__more'>去写 ›</Text>
    </View>
  )
}
