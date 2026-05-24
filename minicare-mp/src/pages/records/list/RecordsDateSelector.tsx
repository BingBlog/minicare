/**
 * 记录列表 — 日期筛选（全部 / 今天 / 昨天 / 前天 + 日历）
 */
import { useMemo } from 'react'
import { View, Text, Picker } from '@tarojs/components'
import {
  getTodayStr,
  buildRecordsListDateOptions,
  formatRecordsListDateLabel,
} from '@/lib/dateUtils'

interface RecordsDateSelectorProps {
  value: string | null
  onChange: (date: string | null) => void
}

export default function RecordsDateSelector({ value, onChange }: RecordsDateSelectorProps) {
  const todayStr = getTodayStr()
  const dateOptions = useMemo(() => buildRecordsListDateOptions(), [todayStr])

  const displayLabel = formatRecordsListDateLabel(value)
  const isActive = value !== null

  const currentSelectorIndex = useMemo(() => {
    const idx = dateOptions.findIndex((o) => o.value === value)
    return idx >= 0 ? idx : 0
  }, [dateOptions, value])

  const pickerValue = value ?? todayStr

  const handleSelectorChange = (e: { detail: { value: string } }) => {
    const idx = Number(e.detail.value)
    if (idx >= 0 && idx < dateOptions.length) {
      onChange(dateOptions[idx].value)
    }
  }

  const handleDatePickerChange = (e: { detail: { value: string } }) => {
    onChange(e.detail.value)
  }

  return (
    <View className='records-date-selector'>
      <Picker
        mode='selector'
        range={dateOptions}
        rangeKey='label'
        value={currentSelectorIndex}
        onChange={handleSelectorChange}
      >
        <View
          className={`records-filter__today-toggle ${isActive ? 'records-filter__today-toggle--active' : ''}`}
        >
          <Text>{displayLabel}</Text>
        </View>
      </Picker>
      <Picker mode='date' value={pickerValue} end={todayStr} onChange={handleDatePickerChange}>
        <View className='records-date-selector__calendar'>
          <Text>日历</Text>
        </View>
      </Picker>
    </View>
  )
}
