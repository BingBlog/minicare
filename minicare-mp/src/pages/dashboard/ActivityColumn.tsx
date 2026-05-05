/**
 * 活动列（与 Web 端业务逻辑完全一致）
 * 展示当日活动记录：大运动、精细运动、亲子早教、户外活动等
 * 行布局：time | label | summary(时长)
 */
import { View, Text } from '@tarojs/components'
import type { DashboardData } from './types'
import type { TodayRecord } from '@/api'

// 对齐后端 activityType 枚举
const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  gross_motor: '大运动',
  fine_motor: '精细运动',
  edu_play: '亲子早教',
  outdoor: '户外',
  daily_care: '日常护理',
  other: '其他',
}

function fmtDuration(min?: number | null): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  data: DashboardData
  onAdd: () => void
}

function renderRow(r: TodayRecord) {
  const detail = r.detail ?? {}
  const actType = (detail.activity_type as string) ?? 'other'
  const durationMin = detail.duration_min as number | undefined
  const time = formatHM(r.time)
  const label = ACTIVITY_TYPE_LABEL[actType] ?? actType

  return (
    <View key={r.id} className='db-row'>
      <Text className='db-row-time'>{time}</Text>
      <Text className='db-row-label'>{label}</Text>
      <View className='db-row-tags' />
      {durationMin ? (
        <View className='db-row-summary db-summary-gold'>
          <Text className='db-row-summary-value'>{fmtDuration(durationMin)}</Text>
        </View>
      ) : null}
    </View>
  )
}

export default function ActivityColumn({ data, onAdd }: Props) {
  const activities = data.activity

  return (
    <View className='db-col'>
      <View className='db-col-header'>
        <View className='db-col-title'>
          <Text className='db-col-title-text'>活动</Text>
          <Text className='db-col-add-btn' onClick={onAdd}>+记录</Text>
        </View>
      </View>
      <View className='db-col-records'>
        {activities.length === 0 ? (
          <Text className='db-empty'>暂无活动</Text>
        ) : (
          activities.map((r) => renderRow(r))
        )}
      </View>
    </View>
  )
}
