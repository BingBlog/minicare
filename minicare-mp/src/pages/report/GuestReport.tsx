/**
 * GuestReport — 游客模式分析页面内容
 *
 * 生长 / 饮食 Tab 使用真实 ECharts 组件渲染模拟数据，让用户直观感知分析功能。
 * 睡眠 / 尿布 / 健康 Tab 展示 LoginGuide 引导登录。
 */
import { View, Text, ScrollView } from '@tarojs/components'
import { useState } from 'react'
import LoginGuide from '@/components/LoginGuide/LoginGuide'
import { GrowthTab } from './tabs/GrowthTab'
import { FeedingTab } from './tabs/FeedingTab'
import type { TabKey } from './types'
import { TAB_CONFIG } from './types'
import type { GrowthRecord } from '@/api/report'
import type { DailyFeedingData } from '@/api/report'
import dayjs from 'dayjs'

// ── 模拟生长数据 ──────────────────────────────────
function buildDemoGrowthData(): GrowthRecord[] {
  const records: GrowthRecord[] = []
  // 模拟 0-8 月龄，每月一条记录
  const base = dayjs().subtract(8, 'month')
  const growthSamples = [
    { m: 0, w: 3200, h: 500, hd: 340 },
    { m: 1, w: 4200, h: 540, hd: 365 },
    { m: 2, w: 5100, h: 580, hd: 385 },
    { m: 3, w: 5900, h: 610, hd: 400 },
    { m: 4, w: 6500, h: 640, hd: 410 },
    { m: 5, w: 7000, h: 660, hd: 420 },
    { m: 6, w: 7500, h: 680, hd: 430 },
    { m: 7, w: 7900, h: 700, hd: 438 },
    { m: 8, w: 8300, h: 715, hd: 445 },
  ]
  for (const s of growthSamples) {
    records.push({
      date: base.add(s.m, 'month').format('YYYY-MM-DD'),
      weightG: s.w,
      heightMm: s.h,
      headMm: s.hd,
    })
  }
  return records
}

// ── 模拟饮食数据 ──────────────────────────────────
function buildDemoFeedingData(): DailyFeedingData[] {
  const data: DailyFeedingData[] = []
  const today = dayjs()
  for (let i = 13; i >= 0; i--) {
    const date = today.subtract(i, 'day').format('YYYY-MM-DD')
    const formulaMl = 500 + Math.round(Math.sin(i * 0.7) * 120 + Math.random() * 60)
    const breastCount = i % 3 === 0 ? 2 : i % 3 === 1 ? 1 : 0
    const formulaCount = Math.round(formulaMl / 120)
    const complementaryCount = i >= 4 ? (i % 2 === 0 ? 2 : 1) : 0
    const supplementCount = i % 2 === 0 ? 1 : 0
    data.push({
      date,
      formulaMl,
      breastCount,
      formulaCount,
      complementaryCount,
      supplementCount,
      formulaMlByMilkType: { aa: Math.round(formulaMl * 0.6), ph: Math.round(formulaMl * 0.4) },
    })
  }
  return data
}

const DEMO_GROWTH = buildDemoGrowthData()
const DEMO_FEEDING = buildDemoFeedingData()
const DEMO_BIRTH_DATE = dayjs().subtract(8, 'month').format('YYYY-MM-DD')

export default function GuestReport() {
  const [activeTab, setActiveTab] = useState<TabKey>('growth')

  const renderTabContent = () => {
    if (activeTab === 'growth') {
      return (
        <View style={{ padding: '16px 20px 20px' }}>
          <Text style={{ fontSize: 10, color: '#C0A8AD', display: 'block', textAlign: 'center', marginBottom: 12 }}>
            示例数据，登录后将展示宝宝的真实生长曲线
          </Text>
          <GrowthTab
            data={DEMO_GROWTH}
            loading={false}
            babyGender='male'
            babyBirthDate={DEMO_BIRTH_DATE}
          />
          <LoginGuide title='查看宝宝真实生长曲线' desc='登录后将展示宝宝的真实生长数据分析' />
        </View>
      )
    }
    if (activeTab === 'feeding') {
      return (
        <View style={{ padding: '16px 20px 20px' }}>
          <Text style={{ fontSize: 10, color: '#C0A8AD', display: 'block', textAlign: 'center', marginBottom: 12 }}>
            示例数据，登录后将展示宝宝的真实饮食分析
          </Text>
          <FeedingTab data={DEMO_FEEDING} loading={false} />
          <LoginGuide title='查看宝宝真实饮食分析' desc='登录后将展示宝宝的真实饮食数据报告' />
        </View>
      )
    }
    // 睡眠 / 尿布 / 健康 Tab → 登录引导
    return (
      <LoginGuide title='登录后查看分析' desc='登录后可查看宝宝的成长数据分析报告' />
    )
  }

  return (
    <View>
      {/* Tab 导航 — 固定在顶部不跟随滚动 */}
      <View style={{ padding: '12px 20px', flexShrink: 0, borderBottom: '0.5px solid #F5F0F2' }}>
        <ScrollView scrollX style={{ whiteSpace: 'nowrap' }}>
          {TAB_CONFIG.map((tab) => (
            <View
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'inline-block',
                padding: '8px 16px', fontSize: 13, fontWeight: 500,
                borderRadius: 20, marginRight: 8, whiteSpace: 'nowrap',
                background: activeTab === tab.key ? '#F87098' : '#F5F0F2',
                color: activeTab === tab.key ? '#fff' : '#9A8090',
              }}
            >{tab.label}</View>
          ))}
        </ScrollView>
      </View>

      {/* Tab 内容 — 使用普通 View 依赖页面原生滚动（Canvas 原生组件无法跟随 ScrollView） */}
      <View style={{ padding: '0 0 100px' }}>
        {renderTabContent()}
      </View>
    </View>
  )
}
