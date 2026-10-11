import { View, Text } from '@tarojs/components'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { formatTime } from '@/lib/utils'

/**
 * 喂养间隔提醒 Bar —— 一张卡片内合并两行：
 *   ① 距上次喂奶（母乳 / 配方奶）
 *   ② 距上次辅食（complementary，非营养素）
 *
 * 计时口径：营养素（feed_type='supplement'，旧数据 complementary_food='营养素'）
 * **不重置任何一行计时**——既不算辅食、也不算喂奶。过滤在 index.tsx 的
 * feedingFilter / foodFilter 里做，本组件只负责展示与计时。
 *
 * 两行各自独立可点：喂奶行 → 喂奶表单；辅食行 → 辅食表单（?tab=food）。
 * 任一行无数据时该行不渲染；两行都无数据时整个 Bar 不渲染。
 */
interface FeedingBannerProps {
  /** 上次喂奶时间；为空则不渲染喂奶行 */
  lastFeedingTime?: string
  feedingIsYesterday?: boolean
  /** 上次辅食时间；为空则不渲染辅食行 */
  lastFoodTime?: string
  foodIsYesterday?: boolean
  onFeedingClick?: () => void
  onFoodClick?: () => void
}

function formatElapsed(mins: number): string {
  if (mins < 60) return `${Math.max(mins, 1)} 分钟`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}

function elapsedSince(iso: string): number {
  return Math.max(0, dayjs().diff(dayjs(iso), 'minute'))
}

export default function FeedingBanner(props: FeedingBannerProps) {
  const {
    lastFeedingTime,
    feedingIsYesterday,
    lastFoodTime,
    foodIsYesterday,
    onFeedingClick,
    onFoodClick,
  } = props

  const [feedingMins, setFeedingMins] = useState(() =>
    lastFeedingTime ? elapsedSince(lastFeedingTime) : 0,
  )
  const [foodMins, setFoodMins] = useState(() =>
    lastFoodTime ? elapsedSince(lastFoodTime) : 0,
  )

  useEffect(() => {
    const tick = () => {
      if (lastFeedingTime) setFeedingMins(elapsedSince(lastFeedingTime))
      if (lastFoodTime) setFoodMins(elapsedSince(lastFoodTime))
    }
    tick()
    const timer = setInterval(tick, 60_000)
    return () => clearInterval(timer)
  }, [lastFeedingTime, lastFoodTime])

  if (!lastFeedingTime && !lastFoodTime) return null

  const feedingTimeLabel = lastFeedingTime
    ? (feedingIsYesterday ? `昨天 ${formatTime(lastFeedingTime)}` : formatTime(lastFeedingTime))
    : ''
  const foodTimeLabel = lastFoodTime
    ? (foodIsYesterday ? `昨天 ${formatTime(lastFoodTime)}` : formatTime(lastFoodTime))
    : ''

  return (
    <View className='home-inline-banner home-inline-banner--feeding'>
      <View className='home-inline-banner__content'>
        {lastFeedingTime ? (
          <View
            className='home-feed-row home-feed-row--feeding'
            onClick={onFeedingClick}
          >
            <View className='home-inline-banner__dot home-inline-banner__dot--feeding' />
            <View className='home-feed-row__body'>
              <Text className='home-inline-banner__title'>距上次喂奶</Text>
              <Text className='home-inline-banner__desc'>
                上次 {feedingTimeLabel} · <Text className='home-inline-banner__desc-em'>已过去 {formatElapsed(feedingMins)}</Text>
              </Text>
            </View>
            <Text className='home-inline-banner__action--feeding'>记喂奶</Text>
          </View>
        ) : null}
        {lastFoodTime ? (
          <View
            className={`home-feed-row home-feed-row--food${lastFeedingTime ? ' home-feed-row--divided' : ''}`}
            onClick={onFoodClick}
          >
            <View className='home-inline-banner__dot home-inline-banner__dot--food' />
            <View className='home-feed-row__body'>
              <Text className='home-inline-banner__title'>距上次辅食</Text>
              <Text className='home-inline-banner__desc'>
                上次 {foodTimeLabel} · <Text className='home-inline-banner__desc-em'>已过去 {formatElapsed(foodMins)}</Text>
              </Text>
            </View>
            <Text className='home-inline-banner__action--food'>记辅食</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
