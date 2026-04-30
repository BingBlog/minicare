import { View, Text, Image } from '@tarojs/components'
import { useMemo, useState } from 'react'
import { formatTime } from '@/lib/utils'
import { sortHomeDayItems, type RecordsSortMode } from '@/lib/recordsSort'
import type { HomeRecord } from './types'
import { RECORD_TYPE_CFG } from '@/lib/constants'
import { RECORD_TYPE_ICON_SRC } from '@/assets/icons/recordTypeIcons'
import { getTimelineIconType, getTimelineRecordDisplay } from './homeRecords'

interface TodayTimelineProps {
  records: HomeRecord[]
  backendStatus: string
  onRecordClick?: (record: HomeRecord) => void
}

export default function TodayTimeline(props: TodayTimelineProps) {
  const { records, backendStatus, onRecordClick } = props
  const [sortMode, setSortMode] = useState<RecordsSortMode>('type')
  const sortedRecords = useMemo(() => {
    return sortHomeDayItems(records, sortMode)
  }, [records, sortMode])

  return (
    <View className='home-card'>
      <View className='home-card__head'>
        <Text className='home-card__title'>今日时间线</Text>
        <Text className='home-card__hint'>全部 ›</Text>
      </View>
      {backendStatus ? <Text className='home-api-status'>{backendStatus}</Text> : null}

      <View className='home-sort-switch'>
        <View
          className={`home-sort-switch__item ${sortMode === 'type' ? 'is-active' : ''}`}
          onClick={() => setSortMode('type')}
        >
          <Text>按类型</Text>
        </View>
        <View
          className={`home-sort-switch__item ${sortMode === 'time' ? 'is-active' : ''}`}
          onClick={() => setSortMode('time')}
        >
          <Text>按时间</Text>
        </View>
      </View>

      <View className='home-timeline'>
        {records.length === 0 && (
          <View className='home-empty'>
            <View className='home-empty__icon'>记</View>
            <Text className='home-empty__title'>今日尚无记录</Text>
            <Text className='home-empty__desc'>点击上方快捷按钮开始记录</Text>
          </View>
        )}
        {sortedRecords.map((record, idx) => {
          const prevType = idx > 0 ? sortedRecords[idx - 1].type : ''
          const showTypeHeader = sortMode === 'type' && record.type !== prevType
          const iconType = getTimelineIconType(record)
          const display = getTimelineRecordDisplay(record)
          return (
            <View key={record.id}>
              {showTypeHeader ? (
                <View className='home-timeline__section'>
                  <Text className='home-timeline__section-text'>{RECORD_TYPE_CFG[record.type]?.label ?? record.type}</Text>
                </View>
              ) : null}
              <View className='home-timeline__item' onClick={() => onRecordClick?.(record)}>
                <Text className='home-timeline__time'>{formatTime(record.time)}</Text>
                <View className='home-timeline__body'>
                  <View className='home-timeline__meta'>
                    <View
                      className='home-timeline__icon'
                      style={{
                        background: `${RECORD_TYPE_CFG[iconType]?.color ?? '#E8E8E8'}1A`,
                      }}
                    >
                      <Image className='home-timeline__icon-img' src={RECORD_TYPE_ICON_SRC[iconType] ?? RECORD_TYPE_ICON_SRC.feeding} mode='aspectFit' />
                    </View>
                    <View className='home-timeline__text'>
                      <View className='home-timeline__title-row'>
                        <Text className='home-timeline__title'>{display.label}</Text>
                        {display.tags.map((tag) => (
                          <Text key={`${record.id}-${tag}`} className='home-timeline__tag'>{tag}</Text>
                        ))}
                      </View>
                      {record.desc && record.desc !== '暂无备注' ? (
                        <Text className='home-timeline__desc'>{record.desc}</Text>
                      ) : null}
                    </View>
                    {display.summary ? <Text className='home-timeline__summary'>{display.summary}</Text> : null}
                    <Text className='home-timeline__arrow'>›</Text>
                  </View>
                </View>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

