/**
 * RecordGroup 按日期分组的记录组件
 *
 * 与 Web RecordGroup 保持相同的结构和职责：
 * - 日期标题行（含彩色圆点）
 * - 白色卡片容器（内含多个 RecordListItem）
 * - groupByType 模式下在同日卡片内插入类型区段小标题（含汇总 badges）
 *
 * 被引用：index.tsx
 */
import { View, Text } from '@tarojs/components'
import { Fragment } from 'react'
import RecordListItem from './RecordListItem'
import { getRecordType } from '@/lib/utils'
import { RECORD_TYPE_CFG } from '@/lib/constants'
import type { RecordItem } from '@/api/types'

/** 单日分组数据 */
export interface RecordGroupData {
  dateKey: string
  dateLabel: string
  isToday: boolean
  items: RecordItem[]
}

interface RecordGroupProps {
  group: RecordGroupData
  onRecordClick: (record: RecordItem) => void
  groupByType?: boolean
}

/** 计算饮食类型的汇总信息（与 Web calcFeedingSummary 一致） */
function calcFeedingSummary(items: RecordItem[]): string[] {
  const badges: string[] = []
  const breastCount = items.filter((r) => r.feed_type === 'breast').length
  const formulaItems = items.filter((r) => r.feed_type === 'formula')
  const foodCount = items.filter(
    (r) => r.feed_type === 'complementary' && r.complementary_food !== '营养素',
  ).length
  // 营养素：兼容旧数据（complementary + 营养素）和新数据（feed_type=supplement）
  const supplementCount = items.filter(
    (r) => r.feed_type === 'supplement' || (r.feed_type === 'complementary' && r.complementary_food === '营养素'),
  ).length

  if (breastCount > 0) badges.push(`母乳 ${breastCount} 次`)

  if (formulaItems.length > 0) {
    const totalMl = formulaItems.reduce((sum, r) => sum + (Number(r.formula_ml) || 0), 0)
    if (totalMl > 0) {
      badges.push(`配方奶 ${totalMl} ml`)
    } else {
      badges.push(`配方奶 ${formulaItems.length} 次`)
    }
  }

  if (foodCount > 0) badges.push(`辅食 ${foodCount} 次`)
  if (supplementCount > 0) badges.push(`营养素 ${supplementCount} 次`)

  return badges
}

/** 计算尿布类型的汇总信息 */
function calcDiaperSummary(items: RecordItem[]): string[] {
  const badges: string[] = []
  const wetCount = items.filter((r) => r.diaper_type === 'wet').length
  const dirtyCount = items.filter((r) => r.diaper_type === 'dirty').length
  const mixedCount = items.filter((r) => r.diaper_type === 'mixed').length
  const totalWet = wetCount + mixedCount
  const totalDirty = dirtyCount + mixedCount
  if (totalWet > 0) badges.push(`嘘嘘 ${totalWet} 次`)
  if (totalDirty > 0) badges.push(`臭臭 ${totalDirty} 次`)
  return badges
}

function getSummaryBadges(typeKey: string, items: RecordItem[]): string[] {
  if (typeKey === 'feeding') return calcFeedingSummary(items)
  if (typeKey === 'diaper') return calcDiaperSummary(items)
  return []
}

export default function RecordGroup({ group, onRecordClick, groupByType = false }: RecordGroupProps) {
  const { dateKey, dateLabel, isToday, items } = group

  return (
    <View className='record-group'>
      {/* 日期分组标题 */}
      <View className='record-group__header'>
        <View
          className={`record-group__date ${isToday ? 'record-group__date--today' : 'record-group__date--history'}`}
        >
          <View
            className={`record-group__dot ${isToday ? 'record-group__dot--today' : 'record-group__dot--history'}`}
          />
          <Text>{dateLabel}</Text>
        </View>
        <Text
          className={`record-group__count ${isToday ? 'record-group__count--today' : 'record-group__count--history'}`}
        >
          {items.length} 条
        </Text>
      </View>

      {/* 记录卡片（白色圆角容器） */}
      <View className='record-group__card'>
        {items.map((rec, i) => {
          const t = getRecordType(rec)
          const prevT = i > 0 ? getRecordType(items[i - 1]) : ''
          const showSection = groupByType && (i === 0 || t !== prevT)
          const showDivider = i > 0 && (!groupByType || (prevT !== '' && prevT === t))

          const typeItems = showSection ? items.filter((r) => getRecordType(r) === t) : []
          const summarBadges = showSection ? getSummaryBadges(t, typeItems) : []

          return (
            <Fragment key={rec.id}>
              {showSection && (
                <View className={`record-type-section ${groupByType && i > 0 ? 'record-type-section--with-border' : ''}`}>
                  <Text className='record-type-section__label'>
                    {RECORD_TYPE_CFG[t]?.label ?? t}
                  </Text>
                  {summarBadges.length > 0 && (
                    <View className='record-type-section__badges'>
                      {summarBadges.map((badge) => (
                        <Text key={badge} className='record-type-section__badge'>
                          {badge}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              )}
              <RecordListItem record={rec} showDivider={showDivider} onClick={onRecordClick} />
            </Fragment>
          )
        })}
      </View>
    </View>
  )
}
