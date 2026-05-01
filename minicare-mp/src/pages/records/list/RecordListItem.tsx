/**
 * RecordListItem 记录列表条目
 *
 * 与 Web RecordListItem 保持相同的 6 列定宽布局。
 * 每列职责与宽度与 Web 严格对齐。
 *
 * 被引用：RecordGroup.tsx → index.tsx
 */
import { View, Text, Image } from '@tarojs/components'
import { getDisplayTime, getRecordType } from '@/lib/utils'
import { RECORD_TYPE_CFG } from '@/lib/constants'
import { RECORD_TYPE_ICON_SRC } from '@/assets/icons/recordTypeIcons'
import { getTimelineIconType, getTimelineRecordDisplay } from '@/pages/home/homeRecords'
import type { RecordItem } from '@/api/types'

interface RecordListItemProps {
  record: RecordItem
  showDivider: boolean
  onClick: (record: RecordItem) => void
}

export default function RecordListItem({ record, showDivider, onClick }: RecordListItemProps) {
  const displayTime = getDisplayTime(record)
  const recType = getRecordType(record)
  const iconType = getTimelineIconType({ ...record, type: recType } as never)
  const note = record.note as string | undefined
  const hasNote = !!note

  const { label, tags, summary } = getTimelineRecordDisplay(
    { ...record, type: recType } as never,
  )

  const iconSrc = RECORD_TYPE_ICON_SRC[iconType] ?? RECORD_TYPE_ICON_SRC.feeding
  const iconBgColor = (RECORD_TYPE_CFG[iconType]?.color ?? '#E8305A') + '1A'

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
        <View className='record-item__row'>
          <Text className='record-item__time'>{displayTime}</Text>

          <View className='record-item__icon' style={{ background: iconBgColor }}>
            <Image className='record-item__icon-img' src={iconSrc} mode='aspectFit' />
          </View>

          <View className='record-item__label'>
            {label && <Text className='record-item__label-text'>{label}</Text>}
          </View>

          <View className='record-item__tags'>
            {tags.map((tag, i) => (
              <Text key={`${record.id}-t${i}`} className='record-item__tag'>
                {tag}
              </Text>
            ))}
          </View>

          <View className='record-item__summary'>
            {summary ? (
              <Text className='record-item__summary-value'>{summary}</Text>
            ) : null}
          </View>

          <Text className='record-item__arrow'>{'\u203A'}</Text>
        </View>

        {hasNote && (
          <View className='record-item__note'>
            <Text>{note}</Text>
          </View>
        )}
      </View>
    </View>
  )
}
