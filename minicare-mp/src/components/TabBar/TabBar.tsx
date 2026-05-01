import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './TabBar.scss'

interface TabBarProps {
  activeTab: 'home' | 'records' | 'report' | 'profile'
  onFabClick?: () => void
  showFab?: boolean
}

const TABS = [
  { key: 'home', label: '首页', url: '/pages/home/index' },
  { key: 'records', label: '记录', url: '/pages/records/list/index' },
] as const

const RIGHT_TABS = [
  { key: 'report', label: '分析', url: '/pages/report/index' },
  { key: 'profile', label: '我的', url: '/pages/profile/index' },
] as const

export default function TabBar({ activeTab, onFabClick, showFab = false }: TabBarProps) {
  const switchTo = (url: string) => {
    Taro.switchTab({ url })
  }

  return (
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
        {showFab ? (
          <View className='tabbar__fab' onClick={onFabClick}>
            <Text className='tabbar__fab-text'>+</Text>
          </View>
        ) : (
          <View className='tabbar__fab tabbar__fab--dimmed' onClick={onFabClick}>
            <Text className='tabbar__fab-text'>+</Text>
          </View>
        )}
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
  )
}
