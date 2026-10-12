import { View, Text } from '@tarojs/components'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { formatTime } from '@/lib/utils'

/**
 * 喂养间隔提醒 Bar —— 只展示「最近一次进食」
 *
 * 口径（2026-10-12 调整，原为一张卡片内并列两行）：
 * 家长主要关注「距上一次进食多久了」，喂奶 + 辅食两行并列信息密度大；
 * 现合并为单行：比较两者的绝对时间，仅展示更近的一项，
 * 展示哪项标题与按钮即随哪项（「距上次喂奶」+「记喂奶」/「距上次辅食」+「记辅食」）。
 * 比较逻辑在 index.tsx 的 lastIntake 里做，本组件只负责展示与计时。
 *
 * 计时口径：营养素（feed_type='supplement'，旧数据 complementary_food='营养素'）
 * 不参与比较、不重置任何计时——既不算辅食、也不算喂奶。
 * 过滤在 index.tsx 的 feedingFilter / foodFilter 里做。
 */
export type FeedingBannerKind = 'feeding' | 'food'

interface FeedingBannerProps {
  /** 展示项类型：喂奶 or 辅食（由调用方比较后决定） */
  kind: FeedingBannerKind
  /** 该项最近一次进食时间（ISO） */
  time: string
  isYesterday?: boolean
  onClick?: () => void
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
  const { kind, time, isYesterday, onClick } = props
  const isFeeding = kind === 'feeding'

  const [mins, setMins] = useState(() => elapsedSince(time))

  useEffect(() => {
    const tick = () => setMins(elapsedSince(time))
    tick()
    const timer = setInterval(tick, 60_000)
    return () => clearInterval(timer)
  }, [time])

  const timeLabel = isYesterday ? `昨天 ${formatTime(time)}` : formatTime(time)

  return (
    <View className='home-inline-banner home-inline-banner--feeding' onClick={onClick}>
      <View className={`home-inline-banner__dot home-inline-banner__dot--${kind}`} />
      <View className='home-inline-banner__content'>
        <Text className='home-inline-banner__title'>{isFeeding ? '距上次喂奶' : '距上次辅食'}</Text>
        <Text className='home-inline-banner__desc'>
          上次 {timeLabel} ·{' '}
          <Text className={`home-inline-banner__desc-em home-inline-banner__desc-em--${kind}`}>
            已过去 {formatElapsed(mins)}
          </Text>
        </Text>
      </View>
      <Text className={`home-inline-banner__action--${kind}`}>{isFeeding ? '记喂奶' : '记辅食'}</Text>
    </View>
  )
}
