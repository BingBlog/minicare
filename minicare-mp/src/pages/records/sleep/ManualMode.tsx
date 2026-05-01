/**
 * 睡眠记录 - 补录模式组件（MP 迁移）
 *
 * 与 Web pages/records/sleep/ManualMode.tsx 保持 1:1 业务逻辑对齐。
 * 差异：Taro Picker 替代 DatePicker/TimePicker 组件。
 */
import { View, Text, Picker } from '@tarojs/components'
import dayjs from 'dayjs'

/** 根据入睡日期+时间、醒来日期+时间计算时长（分钟） */
function calcDurationMin(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): number {
  const start = dayjs(`${startDate}T${startTime}:00`)
  const end = dayjs(`${endDate}T${endTime}:00`)
  if (!start.isValid() || !end.isValid()) return 0
  return Math.round(end.diff(start, 'minute', true))
}

interface Props {
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  onStartDateChange: (v: string) => void
  onEndDateChange: (v: string) => void
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
}

export default function ManualMode({
  startDate,
  endDate,
  startTime,
  endTime,
  onStartDateChange,
  onEndDateChange,
  onStartChange,
  onEndChange,
}: Props) {
  const durationMin = calcDurationMin(startDate, startTime, endDate, endTime)

  return (
    <>
      {/* 时间信息卡片 */}
      <View className='sleep-section-label'>
        <Text>时间信息</Text>
      </View>
      <View className='sleep-card'>
        {/* 入睡日期 */}
        <View className='sleep-row sleep-row--border'>
          <Text className='sleep-row__label'>入睡日期</Text>
          <Picker
            mode='date'
            value={startDate}
            onChange={(e) => onStartDateChange(e.detail.value)}
          >
            <View className='sleep-row__picker'>
              <Text>{startDate}</Text>
            </View>
          </Picker>
        </View>

        {/* 入睡时间 */}
        <View className='sleep-row sleep-row--border'>
          <Text className='sleep-row__label'>入睡时间</Text>
          <Picker
            mode='time'
            value={startTime}
            onChange={(e) => onStartChange(e.detail.value)}
          >
            <View className='sleep-row__picker'>
              <Text>{startTime}</Text>
            </View>
          </Picker>
        </View>

        {/* 醒来日期 */}
        <View className='sleep-row sleep-row--border'>
          <Text className='sleep-row__label'>醒来日期</Text>
          <Picker
            mode='date'
            value={endDate}
            onChange={(e) => onEndDateChange(e.detail.value)}
          >
            <View className='sleep-row__picker'>
              <Text>{endDate}</Text>
            </View>
          </Picker>
        </View>

        {/* 醒来时间 */}
        <View className='sleep-row sleep-row--border'>
          <Text className='sleep-row__label'>醒来时间</Text>
          <Picker
            mode='time'
            value={endTime}
            onChange={(e) => onEndChange(e.detail.value)}
          >
            <View className='sleep-row__picker'>
              <Text>{endTime}</Text>
            </View>
          </Picker>
        </View>

        {/* 自动计算的时长 */}
        <View className='sleep-row'>
          <Text className='sleep-row__label'>睡眠时长</Text>
          <Text className='sleep-row__value'>
            {durationMin > 0
              ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m（自动计算）`
              : '—'}
          </Text>
        </View>
      </View>
    </>
  )
}
