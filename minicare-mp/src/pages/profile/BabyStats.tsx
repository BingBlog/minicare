import { View, Text } from '@tarojs/components'
import { useState, useEffect } from 'react'
import { recordsApi } from '@/api'
import type { Baby, Family } from '@/api'

interface BabyStatsProps {
  currentFamily: Family | null
  currentBaby: Baby | null
}

interface StatItem {
  val: string
  unit: string
  name: string
}

export default function BabyStats({ currentFamily, currentBaby }: BabyStatsProps) {
  const [heightMm, setHeightMm] = useState<number | null>(null)
  const [weightG, setWeightG] = useState<number | null>(null)
  const [headMm, setHeadMm] = useState<number | null>(null)

  useEffect(() => {
    if (!currentFamily || !currentBaby) return
    recordsApi.growth
      .list(currentFamily.id, currentBaby.id, { limit: 1, offset: 0 })
      .then((records) => {
        const latest = records[0]
        if (!latest) return
        setHeightMm((latest.height_mm as number) ?? null)
        setWeightG((latest.weight_g as number) ?? null)
        setHeadMm((latest.head_mm as number) ?? null)
      })
      .catch(() => { /* 加载失败时保持默认值 */ })
  }, [currentFamily, currentBaby])

  const fmtCm = (mm: number | null): string => {
    if (mm == null) return '—'
    return (mm / 10).toFixed(1)
  }
  const fmtKg = (g: number | null): string => {
    if (g == null) return '—'
    return (g / 1000).toFixed(1)
  }

  const stats: StatItem[] = [
    { val: fmtCm(heightMm), unit: heightMm != null ? 'cm' : '', name: '身高' },
    { val: fmtKg(weightG),  unit: weightG  != null ? 'kg' : '', name: '体重' },
    { val: fmtCm(headMm),   unit: headMm   != null ? 'cm' : '', name: '头围' },
    { val: '—',             unit: '',                           name: '稳定期' },
  ]

  return (
    <View className='baby-stats'>
      {stats.map((stat, i) => {
        const isEmpty = stat.val === '—'
        return (
          <View
            key={stat.name}
            className={`baby-stats__cell${i < 3 ? ' baby-stats__cell--bordered' : ''}`}
          >
            <View className={`baby-stats__value${isEmpty ? ' baby-stats__value--empty' : ''}`}>
              <Text>{stat.val}</Text>
              {!isEmpty && (
                <Text className='baby-stats__unit'>{stat.unit}</Text>
              )}
            </View>
            <Text className={`baby-stats__label${isEmpty ? ' baby-stats__label--empty' : ''}`}>
              {stat.name}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
