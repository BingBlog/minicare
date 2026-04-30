import { View, Text } from '@tarojs/components'
import { useEffect, useMemo, useState } from 'react'
import { fetchAppConfig } from '@/api'
import { getGreeting, getTodayDateStr } from '@/lib/utils'

import HeroSection from './HeroSection'
import QuickActions from './QuickActions'
import TodayTimeline from './TodayTimeline'
import type { BabyStat, HomeRecord } from './types'
import './index.scss'

const MOCK_RECORDS: HomeRecord[] = []

export default function HomePage() {
  const [backendStatus, setBackendStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    const checkBackend = async () => {
      // 后端重启时首页可能先于服务可用，做 3 次短重试。
      for (let i = 0; i < 3; i += 1) {
        try {
          await fetchAppConfig()
          if (!cancelled) setBackendStatus('')
          return
        } catch (err) {
          if (i === 2 && !cancelled) {
            const msg = err instanceof Error ? err.message : '请求失败'
            setBackendStatus(`后端未连通：${msg}`)
          }
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }
    }
    checkBackend()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo<BabyStat[]>(() => {
    const feedingRecs = MOCK_RECORDS.filter((r) => r.type === 'feeding')
    const sleepRecs = MOCK_RECORDS.filter((r) => r.type === 'sleep')
    const diaperRecs = MOCK_RECORDS.filter((r) => r.type === 'diaper')
    const symptomRecs = MOCK_RECORDS.filter((r) => r.type === 'symptom')

    const totalMl = feedingRecs.reduce((acc, r) => {
      const ml = Number((r.detail as Record<string, unknown> | undefined)?.formula_ml ?? 0)
      return Number.isFinite(ml) ? acc + ml : acc
    }, 0)

    const totalSleepMin = sleepRecs.reduce((acc, r) => {
      const mins = Number((r.detail as Record<string, unknown> | undefined)?.duration_min ?? 0)
      return Number.isFinite(mins) ? acc + mins : acc
    }, 0)

    const sleepStat: BabyStat =
      totalSleepMin <= 0
        ? { val: '—', unit: '', label: '今日睡眠' }
        : totalSleepMin < 60
          ? { val: `${totalSleepMin}`, unit: '分', label: '今日睡眠' }
          : { val: `${Math.floor(totalSleepMin / 60)}`, unit: 'h', label: '今日睡眠' }

    return [
      totalMl > 0 ? { val: totalMl, unit: 'ml', label: '今日奶量' } : { val: '—', unit: '', label: '今日奶量' },
      sleepStat,
      diaperRecs.length > 0
        ? { val: diaperRecs.length, unit: '次', label: '换尿布' }
        : { val: '—', unit: '', label: '换尿布' },
      symptomRecs.length > 0
        ? { val: symptomRecs.length, unit: '项', label: '表现' }
        : { val: '—', unit: '', label: '表现' },
    ]
  }, [])

  return (
    <View className='home-page'>
      <HeroSection
        babyName='旺仔'
        babyAgeText='4个月1天'
        greeting={getGreeting()}
        dateText={getTodayDateStr()}
        stats={stats}
      />
      <View className='home-content'>
        <QuickActions birthDate='2025-12-28' />
        <TodayTimeline records={MOCK_RECORDS} backendStatus={backendStatus} />
      </View>
      <View className='home-tabbar'>
        <Text className='home-tabbar__item is-active'>首页</Text>
        <Text className='home-tabbar__item'>记录</Text>
        <View className='home-tabbar__fab'>+</View>
        <Text className='home-tabbar__item'>分析</Text>
        <Text className='home-tabbar__item'>我的</Text>
      </View>
    </View>
  )
}

