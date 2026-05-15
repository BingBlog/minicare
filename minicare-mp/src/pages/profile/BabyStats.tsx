import { View, Text } from '@tarojs/components'
import { useState, useEffect } from 'react'
import { recordsApi } from '@/api'
import type { Baby } from '@/api'

interface BabyStatsProps {
  currentFamilyId: string | undefined
  currentBaby: Baby | null
}

interface StatItem {
  val: string
  unit: string
  name: string
}

export default function BabyStats({ currentFamilyId, currentBaby }: BabyStatsProps) {
  const [heightMm, setHeightMm] = useState<number | null>(null)
  const [weightG, setWeightG] = useState<number | null>(null)
  const [headMm, setHeadMm] = useState<number | null>(null)

  useEffect(() => {
    if (!currentFamilyId || !currentBaby) return
    recordsApi.growth
      .getLatest(currentFamilyId, currentBaby.id)
      .then((latest) => {
        if (!latest) return
        setHeightMm((latest.height_mm as number) ?? null)
        setWeightG((latest.weight_g as number) ?? null)
        setHeadMm((latest.head_mm as number) ?? null)
      })
      .catch(() => { /* 加载失败时保持默认值 */ })
  }, [currentFamilyId, currentBaby])

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
  ]

  return (
    <View className='baby-stats'>
      {stats.map((stat, i) => {
        const isEmpty = stat.val === '—'
        return (
          <View
            key={stat.name}
            className={`baby-stats__cell${i < 2 ? ' baby-stats__cell--bordered' : ''}`}
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
