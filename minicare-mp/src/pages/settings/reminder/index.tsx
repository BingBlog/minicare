/**
 * 首页提醒设置（2026-10-12）
 *
 * 首页横幅区的提醒卡片可单独开关，默认全部开启；关闭后返回首页立即生效
 * （首页在 useDidShow 中重读本地存储）。
 *
 * 存储为本机设备级（`lib/reminderSettings.ts`，Taro Storage）：
 * 家庭成员各自设备独立设置，不做服务端同步。
 *
 * 开关清单与首页条目的对应关系：
 *   feed       → FeedingBanner（喂奶 / 辅食合并条）
 *   supplement → SupplementBar（补剂 & 营养素）
 *   allergy    → AllergyProgressBar（排敏进度）
 *   schedule   → ScheduleBanner +「还没有作息计划」引导条
 *   followup   → NextFollowUpBanner（复查）
 *   sleep      → SleepBanner（宝宝正在睡觉）
 *   diary      → HomeDiaryCard（昨日日记卡）
 */
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { getStatusBarHeight } from '@/lib/safeArea'
import {
  getReminderSettings,
  saveReminderSettings,
  type ReminderSettings,
} from '@/lib/reminderSettings'

import './index.scss'

const ICON_BACK = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4a3035" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>'
)}`

const iconSvg = (paths: string, stroke = '#F0B8C8') =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
  )}`

interface ReminderItemDef {
  key: keyof ReminderSettings
  label: string
  desc: string
  icon: string
}

/** Lucide 风格图标（与 SettingsGroup 的 data-uri 方案一致） */
const REMINDER_ITEMS: ReminderItemDef[] = [
  {
    key: 'feed',
    label: '喂奶 / 辅食提醒',
    desc: '距上次进食多久（取最近一项）',
    icon: iconSvg('<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>'),
  },
  {
    key: 'supplement',
    label: '补剂 & 营养素提醒',
    desc: '今天还没吃时提醒',
    icon: iconSvg('<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>'),
  },
  {
    key: 'allergy',
    label: '排敏进度提醒',
    desc: '排敏食物的观察进度',
    icon: iconSvg('<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>'),
  },
  {
    key: 'schedule',
    label: '日程提醒',
    desc: '按作息计划提醒该做什么',
    icon: iconSvg('<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>'),
  },
  {
    key: 'followup',
    label: '复查提醒',
    desc: '下次复查日期提醒',
    icon: iconSvg('<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>'),
  },
  {
    key: 'sleep',
    label: '睡眠提醒',
    desc: '睡眠中状态与结束入口',
    icon: iconSvg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  },
  {
    key: 'diary',
    label: '日记提醒',
    desc: '回顾或补写昨天的日记',
    icon: iconSvg('<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>'),
  },
]

export default function ReminderSettingsPage() {
  const [settings, setSettings] = useState<ReminderSettings>(() => getReminderSettings())

  const handleBack = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) {
      Taro.navigateBack()
    } else {
      // profile 是 tabBar 页，redirectTo 不可用
      Taro.switchTab({ url: '/pages/profile/index' })
    }
  }

  const toggle = (key: keyof ReminderSettings) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      saveReminderSettings(next)
      return next
    })
  }

  return (
    <View className='rs-page'>
      {/* 导航栏（全局 custom navigationStyle，页面自绘） */}
      <View className='rs-nav' style={{ paddingTop: `${getStatusBarHeight()}px` }}>
        <View className='rs-nav__back' onClick={handleBack}>
          <Image src={ICON_BACK} style={{ width: '22px', height: '22px' }} />
        </View>
        <Text className='rs-nav__title'>提醒设置</Text>
        <View style={{ width: '36px' }} />
      </View>

      <View className='rs-body'>
        <Text className='rs-hint'>首页的提醒卡片可单独开关，不需要的关掉即可</Text>

        <View className='rs-card'>
          {REMINDER_ITEMS.map((item, i) => {
            const checked = settings[item.key]
            return (
              <View
                key={item.key}
                className={`rs-row${i > 0 ? ' rs-row--bordered' : ''}`}
                onClick={() => toggle(item.key)}
              >
                <View className='rs-row__icon'>
                  <Image src={item.icon} style={{ width: '18px', height: '18px' }} />
                </View>
                <View className='rs-row__text'>
                  <Text className='rs-row__label'>{item.label}</Text>
                  <Text className='rs-row__desc'>{item.desc}</Text>
                </View>
                <View className='rs-toggle' style={{ background: checked ? '#F87098' : '#E5D8DA' }}>
                  <View className='rs-toggle__knob' style={{ left: checked ? 21 : 3 }} />
                </View>
              </View>
            )
          })}
        </View>

        <Text className='rs-footnote'>设置保存在本机，更换设备后需要重新设置</Text>
      </View>
    </View>
  )
}
