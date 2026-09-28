/**
 * 顶栏组件（MP 版）
 *
 * 展示：宝宝名 | 日期选择 | 实时时钟 | 声音开关(Switch)
 */
import { useState, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Picker, Switch } from '@tarojs/components'
import type { DashboardData } from './types'
import {
  getTodayStr,
  formatDateLabel,
  buildDashboardDateOptions,
} from '@/lib/dateUtils'
import { getCapsuleRightPadding } from '@/lib/safeArea'

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
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
  // （H5 无胶囊 API，返回 rejected Promise 且 try/catch 捕获不到，须先按平台短路）
  const capsuleLayout = useMemo(() => {
    if (process.env.TARO_ENV !== 'weapp') {
      return { paddingTop: 0, headerHeight: 0, rightWidth: 0 }
    }
    try {
      const menuBtn = Taro.getMenuButtonBoundingClientRect()
      const sysInfo = Taro.getSystemInfoSync()
      const statusBarHeight = sysInfo.statusBarHeight || 0
      // 顶栏 paddingTop = 胶囊按钮顶部位置（已包含状态栏高度）
      const paddingTop = menuBtn.top
      // 顶栏最小高度 = 胶囊按钮高度 + 上下间距
      const headerHeight = menuBtn.height + (menuBtn.top - statusBarHeight) * 2
      // 右侧需要避让的宽度 = 屏幕宽度 - 胶囊按钮左边界 + 一些间距
      const rightWidth = getCapsuleRightPadding()
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
  const dateOptions = useMemo(() => buildDashboardDateOptions(), [todayStr])

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
