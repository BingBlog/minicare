import { View, Text, Image } from '@tarojs/components'
import { useMemo } from 'react'
import { RECORD_TYPE_ICON_SRC } from '@/assets/icons/recordTypeIcons'
import type { HomeRecord } from './types'

/** 补剂项（从 supplement 记录的 detail.supplement_items 中提取） */
interface SupplementItem {
  key: string
  label: string
  dose?: string
  unit?: string
}

interface DailyComparisonProps {
  todayRecords: HomeRecord[]
  yesterdayRecords: HomeRecord[]
}

/** 从记录列表中提取补剂项 */
function extractSupplements(records: HomeRecord[]): SupplementItem[] {
  const items: SupplementItem[] = []
  const seen = new Set<string>()
  for (const r of records) {
    if (r.type !== 'feeding' && r.type !== 'supplement') continue
    const d = r.detail ?? {}
    const feedType = d.feed_type as string | undefined
    if (feedType !== 'supplement' && feedType !== 'complementary') continue
    if (feedType === 'complementary' && d.complementary_food !== '营养素') continue
    const suppItems = (d.supplement_items as SupplementItem[] | undefined) ?? []
    for (const item of suppItems) {
      if (!seen.has(item.key)) {
        seen.add(item.key)
        items.push(item)
      }
    }
  }
  return items
}

export default function DailyComparison({ todayRecords, yesterdayRecords }: DailyComparisonProps) {
  const todaySupplements = useMemo(() => extractSupplements(todayRecords), [todayRecords])
  const yesterdaySupplements = useMemo(() => extractSupplements(yesterdayRecords), [yesterdayRecords])

  // 如果昨日和今日都没有任何补剂记录，不展示此模块
  if (todaySupplements.length === 0 && yesterdaySupplements.length === 0) {
    return null
  }

  return (
    <View className='daily-compare'>
      <View className='daily-compare__card'>
        <View className='daily-compare__head'>
          <View className='daily-compare__icon' style={{ background: '#FFF8E0' }}>
            <Image className='daily-compare__icon-img' src={RECORD_TYPE_ICON_SRC.supplement} mode='aspectFit' />
          </View>
          <Text className='daily-compare__title'>补剂&营养素</Text>
        </View>

        <View className='daily-compare__body'>
          {/* 今日已补充 */}
          <View className='daily-compare__row'>
            <Text className='daily-compare__label'>今日</Text>
            <View className='daily-compare__tags'>
              {todaySupplements.length > 0 ? todaySupplements.map((s) => (
                <View key={s.key} className='daily-compare__tag daily-compare__tag--done'>
                  <Text className='daily-compare__tag-text'>
                    {s.label}{s.dose ? ` ${s.dose}${s.unit ?? ''}` : ''}
                  </Text>
                </View>
              )) : (
                <Text className='daily-compare__empty-text'>暂无记录</Text>
              )}
            </View>
          </View>

          {/* 昨日已补充 */}
          <View className='daily-compare__row'>
            <Text className='daily-compare__label'>昨日</Text>
            <View className='daily-compare__tags'>
              {yesterdaySupplements.length > 0 ? yesterdaySupplements.map((s) => (
                <View key={s.key} className='daily-compare__tag daily-compare__tag--past'>
                  <Text className='daily-compare__tag-text'>
                    {s.label}{s.dose ? ` ${s.dose}${s.unit ?? ''}` : ''}
                  </Text>
                </View>
              )) : (
                <Text className='daily-compare__empty-text'>暂无记录</Text>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
