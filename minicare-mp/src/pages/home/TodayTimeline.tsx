import { View, Text } from '@tarojs/components'
import { useState } from 'react'
import { formatTime } from '@/lib/utils'
import type { HomeRecord, TimelineSortMode } from './types'

interface TodayTimelineProps {
  records: HomeRecord[]
  backendStatus: string
}

export default function TodayTimeline(props: TodayTimelineProps) {
  const { records, backendStatus } = props
  const [sortMode, setSortMode] = useState<TimelineSortMode>('type')

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
        {records.map((record) => (
          <View className='home-timeline__item' key={record.id}>
            <Text className='home-timeline__time'>{formatTime(record.time)}</Text>
            <View className='home-timeline__body'>
              <Text className='home-timeline__title'>{record.title}</Text>
              <Text className='home-timeline__desc'>{record.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

