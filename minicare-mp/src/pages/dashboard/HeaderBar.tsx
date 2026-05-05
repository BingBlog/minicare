/**
 * 顶栏组件（MP 版）
 *
 * 展示：宝宝名 | 日期选择 | 实时时钟 | 声音开关(Switch)
 */
import { useState, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Picker, Switch } from '@tarojs/components'
import type { DashboardData } from './types'
import { getTodayStr } from './useDashboardData'

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** 将 YYYY-MM-DD 偏移 n 天 */
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 将 YYYY-MM-DD 格式化为中文显示 */
function formatDateLabel(dateStr: string): string {
  const today = getTodayStr()
  if (dateStr === today) return '今天'
  if (dateStr === offsetDate(today, -1)) return '昨天'
  if (dateStr === offsetDate(today, -2)) return '前天'
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

interface Props {
  babyName: string
  data: DashboardData
  selectedDate: string
  onDateChange: (date: string) => void
  soundEnabled: boolean
  onSoundToggle: (enabled: boolean) => void
}

export default function HeaderBar({ babyName, selectedDate, onDateChange, soundEnabled, onSoundToggle }: Props) {
  const [now, setNow] = useState(new Date())

  // 获取胶囊按钮位置，计算顶栏安全区域
  const capsuleLayout = useMemo(() => {
    try {
      const menuBtn = Taro.getMenuButtonBoundingClientRect()
      const sysInfo = Taro.getSystemInfoSync()
      const statusBarHeight = sysInfo.statusBarHeight || 0
      // 顶栏 paddingTop = 胶囊按钮顶部位置（已包含状态栏高度）
      const paddingTop = menuBtn.top
      // 顶栏最小高度 = 胶囊按钮高度 + 上下间距
      const headerHeight = menuBtn.height + (menuBtn.top - statusBarHeight) * 2
      // 右侧需要避让的宽度 = 屏幕宽度 - 胶囊按钮左边界 + 一些间距
      const rightWidth = sysInfo.windowWidth - menuBtn.left + 8
      return { paddingTop, headerHeight, rightWidth }
    } catch {
      return { paddingTop: 0, headerHeight: 0, rightWidth: 0 }
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const todayStr = getTodayStr()
  const yesterdayStr = offsetDate(todayStr, -1)
  const dayBeforeStr = offsetDate(todayStr, -2)

  // 日期下拉选项：今天、昨天、前天 + 自定义日期（通过 date picker）
  const dateOptions = useMemo(() => [
    { label: '今天', value: todayStr },
    { label: '昨天', value: yesterdayStr },
    { label: '前天', value: dayBeforeStr },
  ], [todayStr, yesterdayStr, dayBeforeStr])

  // 当前选中日期的显示标签
  const currentDateLabel = formatDateLabel(selectedDate)

  // 当前选中在 selector 中的索引（不在预设范围内则为 -1）
  const currentSelectorIndex = useMemo(() => {
    const idx = dateOptions.findIndex(o => o.value === selectedDate)
    return idx >= 0 ? idx : 0
  }, [dateOptions, selectedDate])

  const handleSelectorChange = (e) => {
    const idx = Number(e.detail.value)
    if (idx >= 0 && idx < dateOptions.length) {
      onDateChange(dateOptions[idx].value)
    }
  }

  const handleDatePickerChange = (e) => {
    onDateChange(e.detail.value)
  }

  return (
    <View
      className='db-header'
      style={{
        paddingTop: capsuleLayout.paddingTop ? `${capsuleLayout.paddingTop}px` : undefined,
        paddingRight: capsuleLayout.rightWidth ? `${capsuleLayout.rightWidth}px` : undefined,
      }}
    >
      <View className='db-header-left'>
        <Text className='db-baby-name'>{babyName}</Text>

        {/* 日期选择：下拉选择器 + 日历选择 */}
        <View className='db-date-selector'>
          <Picker
            mode='selector'
            range={dateOptions}
            rangeKey='label'
            value={currentSelectorIndex}
            onChange={handleSelectorChange}
          >
            <Text className='db-date-btn db-date-btn--active'>
              {currentDateLabel}
            </Text>
          </Picker>
          <Picker mode='date' value={selectedDate} end={todayStr} onChange={handleDatePickerChange}>
            <Text className='db-date-btn db-date-btn--calendar'>
              日历
            </Text>
          </Picker>
        </View>
      </View>


      {/* 右侧：时钟 + 声音开关 */}
      <View className='db-header-right'>
        <Text className='db-header-tag db-tag-clock'>{formatTime(now)}</Text>
        <View className='db-sound-switch'>
          <Text className='db-sound-switch-label'>声音</Text>
          <Switch
            checked={soundEnabled}
            onChange={(e) => onSoundToggle(e.detail.value)}
            color='#38bdf8'
            className='db-sound-switch-ctrl'
          />
        </View>
      </View>
    </View>
  )
}
