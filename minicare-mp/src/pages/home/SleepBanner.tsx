import { View, Text } from '@tarojs/components'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { formatTime } from '@/lib/utils'

interface SleepBannerProps {
  startTime: string
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function SleepBanner({ startTime }: SleepBannerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(() => Math.max(0, dayjs().diff(dayjs(startTime), 'second')))

  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <View className='home-inline-banner home-inline-banner--sleep'>
      <View className='home-inline-banner__dot home-inline-banner__dot--sleep' />
      <View className='home-inline-banner__content'>
        <Text className='home-inline-banner__title'>宝宝正在睡觉</Text>
        <Text className='home-inline-banner__desc'>开始于 {formatTime(startTime)} · 已睡 {formatElapsed(elapsedSeconds)}</Text>
      </View>
      <Text className='home-inline-banner__action'>结束睡眠</Text>
    </View>
  )
}
