import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { sleepApi } from '@/api'
import { formatTime, nowLocalISO, inferSleepPeriod } from '@/lib/utils'

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0 && m > 0) return `${h} 小时 ${m} 分钟`
  if (h > 0) return `${h} 小时`
  return `${Math.max(m, 1)} 分钟`
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

  const [tick, setTick] = useState(0)
  const [ending, setEnding] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const elapsedSeconds = Math.max(0, dayjs().diff(dayjs(startTime), 'second'))

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTick((t) => t + 1)
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  useEffect(() => {
    const onShow = () => setTick((t) => t + 1)
    Taro.onAppShow(onShow)
    return () => { Taro.offAppShow(onShow) }
  }, [])

  const handleEnd = async (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (ending) return
    setEnding(true)
    try {
      await sleepApi.endSleep(familyId, recordId, {
        end_time: nowLocalISO(),
        quality: 'normal',
        sleep_period: sleepPeriod || inferSleepPeriod(startTime),
      })
      onEnded()
    } catch {
      setEnding(false)
      Taro.showToast({ title: '结束失败，请重试', icon: 'none' })
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
        className={`home-inline-banner__action--sleep${ending ? ' home-inline-banner__action--sleep--ending' : ''}`}
        onClick={handleEnd}
      >
        {ending ? '结束中...' : '结束睡眠'}
      </Text>
    </View>
  )
}
