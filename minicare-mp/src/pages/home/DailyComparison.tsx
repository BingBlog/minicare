import { View, Text, Image } from '@tarojs/components'
import { useMemo } from 'react'
import { RECORD_TYPE_ICON_SRC } from '@/assets/icons/recordTypeIcons'
import { ACTIVITY_TYPE_LABELS } from '@/lib/constants'
import type { HomeRecord } from './types'

/** 补剂项（从 supplement 记录的 detail.supplement_items 中提取） */
interface SupplementItem {
  key: string
  label: string
  dose?: string
  unit?: string
}

/** 活动类型标签映射（表单页面使用的 6 种类型） */
const ACTIVITY_TYPE_DISPLAY: Record<string, string> = {
  gross_motor: '大运动',
  fine_motor: '精细运动',
  edu_play: '亲子早教',
  outdoor: '户外活动',
  daily_care: '日常护理',
  bath: '洗澡',
  play: '玩耍',
  tummy_time: '俯趴练习',
  other: '其他',
  ...ACTIVITY_TYPE_LABELS,
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

/** 从记录列表中提取活动类型 */
function extractActivities(records: HomeRecord[]): { type: string; label: string; durationMin: number }[] {
  const map = new Map<string, { label: string; totalMin: number; count: number }>()
  for (const r of records) {
    if (r.type !== 'activity') continue
    const d = r.detail ?? {}
    const actType = (d.activity_type as string) ?? 'other'
    const dur = Number(d.duration_min ?? 0)
    const existing = map.get(actType)
    if (existing) {
      existing.totalMin += dur
      existing.count += 1
    } else {
      map.set(actType, {
        label: ACTIVITY_TYPE_DISPLAY[actType] ?? actType,
        totalMin: dur,
        count: 1,
      })
    }
  }
  return Array.from(map.entries()).map(([type, v]) => ({
    type,
    label: v.label,
    durationMin: v.totalMin,
  }))
}

export default function DailyComparison({ todayRecords, yesterdayRecords }: DailyComparisonProps) {
  const todaySupplements = useMemo(() => extractSupplements(todayRecords), [todayRecords])
  const yesterdaySupplements = useMemo(() => extractSupplements(yesterdayRecords), [yesterdayRecords])
  const todayActivities = useMemo(() => extractActivities(todayRecords), [todayRecords])
  const yesterdayActivities = useMemo(() => extractActivities(yesterdayRecords), [yesterdayRecords])

  // 计算今日未补充的营养素（昨日有但今日没有的）
  const todaySupKeys = new Set(todaySupplements.map((s) => s.key))
  const missedSupplements = yesterdaySupplements.filter((s) => !todaySupKeys.has(s.key))

  // 计算今日未进行的活动（昨日有但今日没有的）
  const todayActTypes = new Set(todayActivities.map((a) => a.type))
  const missedActivities = yesterdayActivities.filter((a) => !todayActTypes.has(a.type))

  // 如果昨日和今日都没有任何补剂和活动记录，不展示此模块
  if (
    todaySupplements.length === 0 && yesterdaySupplements.length === 0 &&
    todayActivities.length === 0 && yesterdayActivities.length === 0
  ) {
    return null
  }

  return (
    <View className='daily-compare'>
      {/* 补剂&营养素对比 */}
      {(todaySupplements.length > 0 || yesterdaySupplements.length > 0) && (
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

            {/* 今日未补充提示 */}
            {missedSupplements.length > 0 && (
              <View className='daily-compare__missed'>
                <Text className='daily-compare__missed-label'>今日待补充</Text>
                <View className='daily-compare__tags'>
                  {missedSupplements.map((s) => (
                    <View key={s.key} className='daily-compare__tag daily-compare__tag--missed'>
                      <Text className='daily-compare__tag-text'>{s.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 活动对比 */}
      {(todayActivities.length > 0 || yesterdayActivities.length > 0) && (
        <View className='daily-compare__card'>
          <View className='daily-compare__head'>
            <View className='daily-compare__icon' style={{ background: '#FFF3E0' }}>
              <Image className='daily-compare__icon-img' src={RECORD_TYPE_ICON_SRC.activity} mode='aspectFit' />
            </View>
            <Text className='daily-compare__title'>活动</Text>
          </View>

          <View className='daily-compare__body'>
            {/* 今日活动 */}
            <View className='daily-compare__row'>
              <Text className='daily-compare__label'>今日</Text>
              <View className='daily-compare__tags'>
                {todayActivities.length > 0 ? todayActivities.map((a) => (
                  <View key={a.type} className='daily-compare__tag daily-compare__tag--done'>
                    <Text className='daily-compare__tag-text'>
                      {a.label}{a.durationMin > 0 ? ` ${a.durationMin}min` : ''}
                    </Text>
                  </View>
                )) : (
                  <Text className='daily-compare__empty-text'>暂无记录</Text>
                )}
              </View>
            </View>

            {/* 昨日活动 */}
            <View className='daily-compare__row'>
              <Text className='daily-compare__label'>昨日</Text>
              <View className='daily-compare__tags'>
                {yesterdayActivities.length > 0 ? yesterdayActivities.map((a) => (
                  <View key={a.type} className='daily-compare__tag daily-compare__tag--past'>
                    <Text className='daily-compare__tag-text'>
                      {a.label}{a.durationMin > 0 ? ` ${a.durationMin}min` : ''}
                    </Text>
                  </View>
                )) : (
                  <Text className='daily-compare__empty-text'>暂无记录</Text>
                )}
              </View>
            </View>

            {/* 今日未进行提示 */}
            {missedActivities.length > 0 && (
              <View className='daily-compare__missed'>
                <Text className='daily-compare__missed-label'>今日待进行</Text>
                <View className='daily-compare__tags'>
                  {missedActivities.map((a) => (
                    <View key={a.type} className='daily-compare__tag daily-compare__tag--missed'>
                      <Text className='daily-compare__tag-text'>{a.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  )
}
