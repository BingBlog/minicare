import { View, Text } from '@tarojs/components'
import { useMemo } from 'react'
import { navigateToRecord } from '@/lib/navigation'
import { HOME_RECORD_ROUTES } from '@/lib/constants'
import type { HomeRecord } from './types'

/** 补剂项（从 supplement 记录的 detail.supplement_items 中提取） */
interface SupplementItem {
  key: string
  label: string
  dose?: string
  unit?: string
}

interface SupplementBarProps {
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

/**
 * 补剂&营养素提醒 Bar（首页 banners 区，紧随排敏进度 Bar 下方）
 *
 * 形态与「排敏进度」Bar 一致：圆点 + 标题 +（今日补剂 tags | 未记录提醒）+ chevron。
 * - 今日有记录：展示今日补剂 tags（最多 2 项，多则「另有 n 项」）
 * - 今日未记录（昨日有）：提示「今日暂未记录 · 昨日：xxx」，起提醒作用
 * - 今昨两天都无记录：不渲染（与卡片版行为一致）
 *
 * 点击整条 → 补剂记录表单（feeding?tab=supplement）。
 */
export default function SupplementBar({ todayRecords, yesterdayRecords }: SupplementBarProps) {
  const todaySupplements = useMemo(() => extractSupplements(todayRecords), [todayRecords])
  const yesterdaySupplements = useMemo(() => extractSupplements(yesterdayRecords), [yesterdayRecords])

  if (todaySupplements.length === 0 && yesterdaySupplements.length === 0) {
    return null
  }

  const displayItems = todaySupplements.slice(0, 2)
  const extraCount = todaySupplements.length - 2

  return (
    <View
      className='home-inline-banner home-inline-banner--supplement'
      onClick={() => navigateToRecord(HOME_RECORD_ROUTES.supplement ?? '/records/form/feeding?tab=supplement')}
    >
      <View className='home-inline-banner__dot home-inline-banner__dot--supplement' />
      <View className='home-inline-banner__content'>
        <Text className='home-inline-banner__title'>补剂&营养素</Text>
        {todaySupplements.length > 0 ? (
          <View className='home-inline-banner__content-inner'>
            {displayItems.map((s) => (
              <Text key={s.key} className='home-inline-banner__tag'>
                {s.label}{s.dose ? ` ${s.dose}${s.unit ?? ''}` : ''}
              </Text>
            ))}
            {extraCount > 0 && (
              <Text className='home-inline-banner__tag home-inline-banner__tag--more'>
                另有{extraCount}项
              </Text>
            )}
          </View>
        ) : (
          <Text className='home-inline-banner__desc'>
            <Text className='home-inline-banner__desc-em'>今日暂未记录</Text>
            {yesterdaySupplements.length > 0
              ? ` · 昨日：${yesterdaySupplements.map((s) => s.label).join('、')}`
              : ''}
          </Text>
        )}
      </View>
      <Text className='home-inline-banner__action--supplement'>记补剂</Text>
    </View>
  )
}
