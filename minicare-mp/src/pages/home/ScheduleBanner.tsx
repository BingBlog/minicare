/**
 * 首页日程提醒 Bar（PRD-009 US-03）
 *
 * 口径分工（重要，防两个时间口径打架）：
 *   · 本 Bar = **计划视角**，回答"该几点做"，所有时间文案统一用「计划 HH:mm」前缀，**不使用"预计"**。
 *   · 既有 FeedingBanner = **事实视角**，回答"距上次多久"，本期不做任何联动改动。
 *
 * 展示优先级（自上而下，命中即停）：
 *   ① 执行中 ② 准备中 ③ 已错过 ④ 待开始 ⑤ 今日全部完成
 *
 * ⚠️ 状态本身来自服务端派生（`GET /schedule/today`），本组件只做展示与
 * 60 秒本地倒计时刷新；**不要在前端重新推断状态**。
 */
import { View, Text } from '@tarojs/components'
import { useEffect, useMemo, useState } from 'react'
import type { ScheduleItem } from '@/api'
import { buildScheduleTypeIndex, type ScheduleTypeIndex } from '@/lib/schedule'
import { useAppConfig } from '@/lib/useAppConfig'

interface ScheduleBannerProps {
  items: ScheduleItem[]
  progress: { done: number; total: number }
  onClick?: () => void
}

function hmToMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function nowMin(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function formatDuration(min: number): string {
  const safe = Math.max(0, min)
  if (safe < 60) return `${safe} 分钟`
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`
}

/** 项名称：服务端 title 优先（服务端已用类型默认名兜底），再退 config 默认名，最后退枚举值 */
function titleOf(item: ScheduleItem, index: ScheduleTypeIndex): string {
  return item.title || index.byType.get(item.itemType)?.label || item.itemType
}

function byExecAsc(a: ScheduleItem, b: ScheduleItem): number {
  return hmToMin(a.executeTime) - hmToMin(b.executeTime)
}

interface Presentation {
  variant: 'doing' | 'preparing' | 'missed' | 'upcoming' | 'done'
  title: string
  desc: string
}

function buildPresentation(items: ScheduleItem[], index: ScheduleTypeIndex): Presentation | null {
  const current = nowMin()

  const doing = items.filter((i) => i.status === 'doing').sort(byExecAsc)[0]
  if (doing) {
    return {
      variant: 'doing',
      title: `现在该做：${titleOf(doing, index)}`,
      desc: `计划 ${doing.executeTime} · 已开始 ${formatDuration(current - hmToMin(doing.executeTime))}`,
    }
  }

  const preparing = items.filter((i) => i.status === 'preparing').sort(byExecAsc)[0]
  if (preparing) {
    return {
      variant: 'preparing',
      title: `该备餐了：${titleOf(preparing, index)}`,
      desc: `准备 ${preparing.prepareTime ?? ''} · 距开始还有 ${formatDuration(
        hmToMin(preparing.executeTime) - current,
      )}`,
    }
  }

  const missed = items.filter((i) => i.status === 'missed').sort(byExecAsc)[0]
  if (missed) {
    return {
      variant: 'missed',
      title: `已错过：${titleOf(missed, index)}（计划 ${missed.executeTime}）`,
      desc: `已错过 ${formatDuration(current - hmToMin(missed.executeTime))} · 现在补记录`,
    }
  }

  const upcoming = items.filter((i) => i.status === 'upcoming').sort(byExecAsc)[0]
  if (upcoming) {
    return {
      variant: 'upcoming',
      title: `下一项：${titleOf(upcoming, index)}`,
      desc: `计划 ${upcoming.executeTime} · 还有 ${formatDuration(
        hmToMin(upcoming.executeTime) - current,
      )}`,
    }
  }

  // 无 doing / preparing / missed / upcoming ⇒ 判定的项都已完成
  const judgable = items.filter((i) => i.itemType !== 'other')
  if (judgable.length > 0 && judgable.every((i) => i.status === 'done')) {
    return {
      variant: 'done',
      title: '今日日程已全部完成',
      desc: '作息规律，继续保持',
    }
  }

  return null
}

export default function ScheduleBanner({ items, progress, onClick }: ScheduleBannerProps) {
  // 每分钟本地重算倒计时文案，不请求接口
  const [tick, setTick] = useState(0)
  // 类型默认名来自服务端下发的 config（前端不内置类型清单）
  const { config } = useAppConfig()
  const typeIndex = useMemo(() => buildScheduleTypeIndex(config?.scheduleItemTypes), [config])

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(timer)
  }, [])

  const model = (() => {
    void tick
    return buildPresentation(items, typeIndex)
  })()

  if (items.length === 0 || !model) return null

  return (
    <View
      className={`home-inline-banner home-inline-banner--schedule home-inline-banner--schedule-${model.variant}`}
      onClick={onClick}
    >
      <View className={`home-inline-banner__dot home-inline-banner__dot--schedule-${model.variant}`} />
      <View className='home-inline-banner__content'>
        <Text className='home-inline-banner__title'>{model.title}</Text>
        <Text className='home-inline-banner__desc'>{model.desc}</Text>
      </View>
      {/* 分母为 0（只剩 other 类型项）时不显示进度数字 */}
      {progress.total > 0 ? (
        <View className='home-inline-banner__action--schedule'>
          <Text className='home-inline-banner__action-text--schedule'>
            已完成 {progress.done}/{progress.total}
          </Text>
          <Text className='home-inline-banner__chevron'>{'\u203A'}</Text>
        </View>
      ) : null}
    </View>
  )
}
