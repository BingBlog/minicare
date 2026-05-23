import { View, Text } from '@tarojs/components'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { formatTime } from '@/lib/utils'

interface FeedingBannerProps {
  lastFeedingTime: string
  isYesterday?: boolean
  onRecordClick?: () => void
}

function formatElapsed(mins: number): string {
  if (mins < 60) return `${Math.max(mins, 1)} 分钟`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}

export default function FeedingBanner({ lastFeedingTime, isYesterday, onRecordClick }: FeedingBannerProps) {
  const [elapsedMins, setElapsedMins] = useState(() =>
    Math.max(0, dayjs().diff(dayjs(lastFeedingTime), 'minute')),
  )

  useEffect(() => {
    setElapsedMins(Math.max(0, dayjs().diff(dayjs(lastFeedingTime), 'minute')))
    const timer = setInterval(() => {
      setElapsedMins(Math.max(0, dayjs().diff(dayjs(lastFeedingTime), 'minute')))
    }, 60_000)
    return () => clearInterval(timer)
  }, [lastFeedingTime])

  const timeLabel = isYesterday ? `昨天 ${formatTime(lastFeedingTime)}` : formatTime(lastFeedingTime)

  return (
    <View
      className='home-inline-banner home-inline-banner--feeding'
      onClick={onRecordClick}
    >
      <View className='home-inline-banner__dot home-inline-banner__dot--feeding' />
      <View className='home-inline-banner__content'>
        <Text className='home-inline-banner__title'>距上次喂奶</Text>
        <Text className='home-inline-banner__desc'>
          上次 {timeLabel} · 已过去 {formatElapsed(elapsedMins)}
        </Text>
      </View>
      <Text className='home-inline-banner__action--feeding'>记录喂奶</Text>
    </View>
  )
}
