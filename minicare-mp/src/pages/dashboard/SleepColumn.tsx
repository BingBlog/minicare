/**
 * 睡眠记录列（与 Web 端业务逻辑完全一致）
 * 行布局：time | label | tags | summary
 * 差异化：确认操作改为 Taro.showModal
 */
import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { DashboardData } from './types'
import type { TodayRecord } from '@/api'

// 与后端 sleepPeriod 枚举对齐
const SLEEP_PERIOD_LABEL: Record<string, string> = {
  night: '夜觉',
  morning_nap: '上午觉',
  afternoon_nap: '下午觉',
  other: '小憩',
}

function fmtDuration(min?: number | null): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  data: DashboardData
  onAdd?: () => void
  onEndSleep?: (sleepId: string) => Promise<void>
}

function SleepRow({ r, onEndSleep }: { r: TodayRecord; onEndSleep?: (id: string) => Promise<void> }) {
  const [ending, setEnding] = useState(false)

  const detail = r.detail ?? {}
  const sleepPeriod = (detail.sleep_period as string) ?? 'other'
  const quality = detail.quality as string | undefined
  const durationMin = detail.duration_min as number | undefined
  const status = detail.status as string | undefined
  const time = formatHM(r.time)
  const isOngoing = status === 'ongoing'

  const periodLabel = SLEEP_PERIOD_LABEL[sleepPeriod] ?? sleepPeriod
  const label = periodLabel
    ? (isOngoing ? `${periodLabel}中` : periodLabel)
    : (isOngoing ? '睡眠中' : '睡眠')

  const QUALITY_PILL: Record<string, { text: string; cls: string }> = {
    good: { text: '质量好', cls: 'db-pill-green' },
    normal: { text: '一般', cls: 'db-pill-amber' },
    poor: { text: '较差', cls: 'db-pill-red' },
  }
  const qualityCfg = quality ? QUALITY_PILL[quality] : null

  const handleEndClick = async () => {
    if (ending || !onEndSleep) return
    // 使用 Taro.showModal 替代 Web 端的两次点击确认
    const res = await Taro.showModal({
      title: '结束睡眠',
      content: '确认结束当前睡眠吗？',
      confirmText: '确认结束',
      confirmColor: '#f06878',
    })
    if (!res.confirm) return
    setEnding(true)
    try {
      await onEndSleep(r.id)
    } catch {
      setEnding(false)
    }
  }

  return (
    <View className={`db-row ${isOngoing ? 'db-row-ongoing' : ''}`}>
      <Text className='db-row-time'>{time}</Text>
      <Text className='db-row-label'>{label}</Text>
      <View className='db-row-tags'>
        {isOngoing && <Text className='db-pill db-pill-pink'>进行中</Text>}
        {qualityCfg && <Text className={`db-pill ${qualityCfg.cls}`}>{qualityCfg.text}</Text>}
      </View>
      {isOngoing && onEndSleep ? (
        <View className='db-row-actions'>
          <Text
            className='db-end-sleep-btn'
            onClick={handleEndClick}
          >
            {ending ? '...' : '结束'}
          </Text>
        </View>
      ) : durationMin ? (
        <View className={`db-row-summary ${isOngoing ? 'db-summary-pink' : 'db-summary-gold'}`}>
          <Text className='db-row-summary-value'>{fmtDuration(durationMin)}</Text>
        </View>
      ) : null}
    </View>
  )
}

export default function SleepColumn({ data, onAdd, onEndSleep }: Props) {
  const records = data.sleep

  return (
    <View className='db-col'>
      <View className='db-col-header'>
        <View className='db-col-title'>
          <Text className='db-col-title-text'>睡眠</Text>
          {onAdd && <Text className='db-col-add-btn' onClick={onAdd}>+记录</Text>}
        </View>
      </View>
      <View className='db-col-records'>
        {records.length === 0 ? (
          <Text className='db-empty'>暂无记录</Text>
        ) : (
          records.map((r) => <SleepRow key={r.id} r={r} onEndSleep={onEndSleep} />)
        )}
      </View>
    </View>
  )
}
