import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import FabSheet from './FabSheet'
import { GLOBAL_FAB_GROUPS, HOME_RECORD_ROUTES } from '@/lib/constants'
import { navigateToRecord } from '@/lib/navigation'
import './TabBar.scss'

/** 全局事件名：外部组件可通过 Taro.eventCenter.trigger 打开 FAB 弹层 */
export const FAB_OPEN_EVENT = 'tabbar:openFab'

interface TabBarProps {
  activeTab: 'home' | 'records' | 'report' | 'profile'
}

const TABS = [
  { key: 'home', label: '首页', url: '/pages/home/index' },
  { key: 'records', label: '记录', url: '/pages/records/list/index' },
] as const

const RIGHT_TABS = [
  { key: 'report', label: '分析', url: '/pages/report/index' },
  { key: 'profile', label: '我的', url: '/pages/profile/index' },
] as const

export default function TabBar({ activeTab }: TabBarProps) {
  const [fabOpen, setFabOpen] = useState(false)

  // 监听外部打开 FAB 弹层事件（如首页 QuickActions 的"更多"按钮）
  useEffect(() => {
    const handler = () => setFabOpen(true)
    Taro.eventCenter.on(FAB_OPEN_EVENT, handler)
    return () => { Taro.eventCenter.off(FAB_OPEN_EVENT, handler) }
  }, [])

  const switchTo = (url: string) => {
    Taro.switchTab({ url })
  }

  return (
    <View className='tabbar-container'>
      <View className='tabbar'>
        {TABS.map((tab) => (
          <View
            key={tab.key}
            className={`tabbar__item${activeTab === tab.key ? ' is-active' : ''}`}
            onClick={() => switchTo(tab.url)}
          >
            <Text>{tab.label}</Text>
          </View>
        ))}

        {/* 中间 FAB */}
        <View className='tabbar__fab-wrap'>
          <View className='tabbar__fab' onClick={() => setFabOpen(true)}>
            <Text className='tabbar__fab-text'>+</Text>
          </View>
        </View>

        {RIGHT_TABS.map((tab) => (
          <View
            key={tab.key}
            className={`tabbar__item${activeTab === tab.key ? ' is-active' : ''}`}
            onClick={() => switchTo(tab.url)}
          >
            <Text>{tab.label}</Text>
          </View>
        ))}
      </View>

      {/* FAB 弹层 — 所有页面通用 */}
      <FabSheet
        open={fabOpen}
        onClose={() => setFabOpen(false)}
        groups={GLOBAL_FAB_GROUPS}
        onSelect={(key) => {
          const route = HOME_RECORD_ROUTES[key] ?? '/records'
          navigateToRecord(route)
        }}
      />
    </View>
  )
}
