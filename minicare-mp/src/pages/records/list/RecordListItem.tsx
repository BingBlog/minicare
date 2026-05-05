/**
 * RecordListItem 记录列表条目
 *
 * 自适应布局：宽屏单行展示全部信息，窄屏时 summary 自动换行到第二行。
 *
 * 布局结构（flex-wrap）：
 *  ┌────────┬──────┬────────┬─────────────────┬──────────┬────┐
 *  │  time  │ icon │ label  │  tags           │ summary  │ >  │
 *  │ 34px   │ 36px │ auto   │  flex:1         │ auto     │    │
 *  └────────┴──────┴────────┴─────────────────┴──────────┴────┘
 *  当空间不足时，summary 自动折到第二行左对齐到 label 位置。
 *
 * 使用 recordListDisplay.ts 中的 getRecordListParts + getRecordSummary。
 * 被引用：RecordGroup.tsx → index.tsx
 */
import { View, Text, Image } from '@tarojs/components'
import { getDisplayTime, getRecordType } from '@/lib/utils'
import { RECORD_TYPE_CFG } from '@/lib/constants'
import { RECORD_TYPE_ICON_SRC } from '@/assets/icons/recordTypeIcons'
import { getTimelineIconType } from '@/pages/home/homeRecords'
import { getRecordListParts, getRecordSummary } from './recordListDisplay'
import type { RecordItem } from '@/api/types'
import type { SummaryTheme } from './recordListDisplay'

interface RecordListItemProps {
  record: RecordItem
  showDivider: boolean
  onClick: (record: RecordItem) => void
}

/** summary 颜色主题 → CSS class 映射 */
const SUMMARY_BADGE_CLS: Record<SummaryTheme, string> = {
  pink: 'record-item__summary-badge',
  warm: 'record-item__summary-badge record-item__summary-badge--warm',
  purple: 'record-item__summary-badge record-item__summary-badge--purple',
  fever: 'record-item__summary-badge record-item__summary-badge--fever',
}
const SUMMARY_VALUE_CLS: Record<SummaryTheme, string> = {
  pink: 'record-item__summary-value',
  warm: 'record-item__summary-value record-item__summary-value--warm',
  purple: 'record-item__summary-value record-item__summary-value--purple',
  fever: 'record-item__summary-value record-item__summary-value--fever',
}

export default function RecordListItem({ record, showDivider, onClick }: RecordListItemProps) {
  const displayTime = getDisplayTime(record)
  const recType = getRecordType(record)
  const iconType = getTimelineIconType({ ...record, type: recType } as never)
  const note = record.note as string | undefined
  const hasNote = !!note

  // 使用与 Web 一致的展示逻辑
  const { label, tags } = getRecordListParts(recType, record as Record<string, unknown>)
  const summary = getRecordSummary(recType, record as Record<string, unknown>)

  const iconSrc = RECORD_TYPE_ICON_SRC[iconType] ?? RECORD_TYPE_ICON_SRC.feeding
  const iconBgColor = (RECORD_TYPE_CFG[iconType]?.color ?? '#E8305A') + '1A'

  // summary 总字符长度决定是否紧凑模式
  const summaryLen = summary ? (summary.value.length + (summary.unit?.length ?? 0)) : 0
  const summaryCompact = summaryLen > 5

  const cls = [
    'record-item__main',
    showDivider ? 'record-item__main--divider' : '',
    hasNote ? 'record-item__main--has-note' : 'record-item__main--no-note',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <View className='record-item' onClick={() => onClick(record)}>
      <View className={cls}>
        {/* 主行：flex-wrap，宽屏单行，窄屏自动折行 */}
        <View className='record-item__row'>
          {/* 左侧固定区：time + icon */}
          <View className='record-item__left'>
            <Text className='record-item__time'>{displayTime}</Text>
            <View className='record-item__icon' style={{ background: iconBgColor }}>
              <Image className='record-item__icon-img' src={iconSrc} mode='aspectFit' />
            </View>
          </View>

          {/* 内容区：label + tags + summary，可换行 */}
          <View className='record-item__content'>
            <Text className='record-item__label'>{label}</Text>

            {tags.map((tag, i) => (
              <Text key={`${record.id}-t${i}`} className='record-item__tag'>
                {tag}
              </Text>
            ))}

            {summary && (
              <View className={`${SUMMARY_BADGE_CLS[summary.theme]}${summaryCompact ? ' record-item__summary-badge--compact' : ''}`}>
                <Text className={SUMMARY_VALUE_CLS[summary.theme]}>{summary.value}</Text>
                {summary.unit && (
                  <Text className={`record-item__summary-unit ${SUMMARY_VALUE_CLS[summary.theme]}`}>{summary.unit}</Text>
                )}
              </View>
            )}
          </View>

          {/* 右箭头 */}
          <Text className='record-item__arrow'>{'\u203A'}</Text>
        </View>

        {/* 备注 */}
        {hasNote && (
          <View className='record-item__note'>
            <Text>{note}</Text>
          </View>
        )}
      </View>
    </View>
  )
}
