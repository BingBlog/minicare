/**
 * 尿布记录列（与 Web 端业务逻辑完全一致）
 * 行布局：time | label | tags
 */
import { View, Text } from '@tarojs/components'
import type { DashboardData } from './types'
import type { TodayRecord } from '@/api'

// 与 Web 端 DIAPER_CARD_LABELS 一致
const DIAPER_CARD_LABELS: Record<string, string> = {
  wet: '嘘嘘',
  dirty: '臭臭',
  mixed: '臭臭＋嘘嘘',
  dry: '干净',
}

// 与后端 poopType 枚举对齐
const POOP_LABEL: Record<string, string> = {
  normal: '正常软便',
  loose: '稀便',
  watery: '水样便',
  hard: '干硬粒',
  bloody: '血丝便',
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  data: DashboardData
  onAdd?: () => void
}

function renderDiaperRow(r: TodayRecord) {
  const detail = r.detail ?? {}
  const diaperType = (detail.diaper_type as string) ?? 'wet'
  const poopType = detail.poop_type as string | undefined
  const time = formatHM(r.time)

  const hasPoop = diaperType === 'dirty' || diaperType === 'mixed'
  const hasWet = diaperType === 'wet' || diaperType === 'mixed'
  const isDry = diaperType === 'dry'

  // mixed 拆为两个独立 Pill（臭臭 + 嘘嘘）
  const tagPills: Array<{ text: string; cls: string }> = []
  if (isDry) {
    tagPills.push({ text: DIAPER_CARD_LABELS[diaperType] ?? diaperType, cls: '' })
  }
  if (hasPoop) {
    tagPills.push({ text: hasPoop && hasWet ? '臭臭' : (DIAPER_CARD_LABELS[diaperType] ?? diaperType), cls: 'db-pill-brown' })
  }
  if (hasWet) {
    tagPills.push({ text: hasWet && hasPoop ? '嘘嘘' : (DIAPER_CARD_LABELS[diaperType] ?? diaperType), cls: 'db-pill-blue' })
  }
  if (poopType && hasPoop) {
    const poopLabel = POOP_LABEL[poopType] ?? poopType
    tagPills.push({ text: poopLabel, cls: 'db-pill-red' })
  }

  return (
    <View key={r.id} className='db-row'>
      <Text className='db-row-time'>{time}</Text>
      <Text className='db-row-label'>换尿布</Text>
      <View className='db-row-tags'>
        {tagPills.map((p, i) => (
          <Text key={i} className={`db-pill ${p.cls}`}>{p.text}</Text>
        ))}
      </View>
    </View>
  )
}

export default function DiaperColumn({ data, onAdd }: Props) {
  const records = data.diaper

  return (
    <View className='db-col'>
      <View className='db-col-header'>
        <View className='db-col-title'>
          <Text className='db-col-title-text'>尿布</Text>
          {onAdd && <Text className='db-col-add-btn' onClick={onAdd}>+记录</Text>}
        </View>
      </View>
      <View className='db-col-records'>
        {records.length === 0 ? (
          <Text className='db-empty'>暂无记录</Text>
        ) : (
          records.map((r) => renderDiaperRow(r))
        )}
      </View>
    </View>
  )
}
