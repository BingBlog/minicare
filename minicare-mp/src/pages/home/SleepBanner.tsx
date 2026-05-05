import { View, Text } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { sleepApi } from '@/api'
import { formatTime, nowLocalISO } from '@/lib/utils'

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

interface SleepBannerProps {
  familyId: string
  recordId: string
  startTime: string
  sleepPeriod?: string
  onEnded: () => void
  onBannerClick?: () => void
}

export default function SleepBanner(props: SleepBannerProps) {
  const { familyId, recordId, startTime, sleepPeriod, onEnded, onBannerClick } = props

  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    Math.max(0, dayjs().diff(dayjs(startTime), 'second')),
  )
  const [ending, setEnding] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1)
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const handleEnd = async (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (ending) return
    setEnding(true)
    try {
      await sleepApi.endSleep(familyId, recordId, {
        end_time: nowLocalISO(),
        quality: 'normal',
        sleep_period: sleepPeriod || 'night',
      })
      onEnded()
    } catch {
      setEnding(false)
    }
  }

  return (
    <View className='home-inline-banner home-inline-banner--sleep' onClick={onBannerClick}>
      <View className='home-inline-banner__dot home-inline-banner__dot--sleep' />
      <View className='home-inline-banner__content'>
        <Text className='home-inline-banner__title'>宝宝正在睡觉</Text>
        <Text className='home-inline-banner__desc'>
          开始于 {formatTime(startTime)} · 已睡 {formatElapsed(elapsedSeconds)}
        </Text>
      </View>
      <Text
        className='home-inline-banner__action'
        onClick={handleEnd}
        style={{ opacity: ending ? 0.5 : 1 }}
      >
        {ending ? '结束中...' : '结束睡眠'}
      </Text>
    </View>
  )
}
