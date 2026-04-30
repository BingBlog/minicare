import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import { babyApi, familyApi, fetchAppConfig, recordsApi, sleepApi } from '@/api'
import { FAB_GROUPS } from '@/lib/constants'
import { getBabyAge, getGreeting, getTodayDateStr } from '@/lib/utils'
import { useQuickActionKeys } from '@/lib/useQuickActionKeys'
import { getToken } from '@/api/http'

import HeroSection from './HeroSection'
import QuickActions from './QuickActions'
import FabSheet from './FabSheet'
import TodayTimeline from './TodayTimeline'
import SleepBanner from './SleepBanner'
import FeedingBanner from './FeedingBanner'
import RecordActionSheet from './RecordActionSheet'
import type { BabyStat, HomeRecord } from './types'
import './index.scss'

function toHomeRecord(rec: { type: string; id: string; time: string; note?: string | null; detail?: Record<string, unknown> | null }): HomeRecord {
  const detail = rec.detail ?? {}
  const feedType = (detail.feed_type as string | undefined) ?? ''
  const ml = Number((detail.formula_ml as number | undefined) ?? 0)
  const duration = Number((detail.duration_min as number | undefined) ?? 0)
  const titleByType: Record<string, string> = {
    formula: ml > 0 ? `配方奶 ${ml}ml` : '配方奶记录',
    breast: '母乳记录',
    food: '辅食记录',
    feeding: feedType === 'formula'
      ? (ml > 0 ? `配方奶 ${ml}ml` : '配方奶记录')
      : feedType === 'breast'
        ? '母乳记录'
        : feedType === 'complementary'
          ? '辅食记录'
          : feedType === 'supplement'
            ? '营养素记录'
            : '饮食记录',
    sleep: duration > 0 ? `睡眠 ${duration} 分钟` : '睡眠记录',
    diaper: '换尿布',
    activity: '活动记录',
    health: '健康记录',
    temperature: '体温记录',
    growth: '生长记录',
    medical: '医疗记录',
    supplement: '营养素记录',
    symptom: '表现记录',
  }

  return {
    id: rec.id,
    type: (rec.type as HomeRecord['type']) ?? 'feeding',
    time: rec.time,
    title: titleByType[rec.type] ?? '记录',
    desc: rec.note || '暂无备注',
    detail: detail as Record<string, unknown>,
  }
}

export default function HomePage() {
  const [backendStatus, setBackendStatus] = useState('')
  const [fabOpen, setFabOpen] = useState(false)
  const [records, setRecords] = useState<HomeRecord[]>([])
  const [ongoingSleepStart, setOngoingSleepStart] = useState<string | null>(null)
  const [actionOpen, setActionOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<HomeRecord | null>(null)
  const [babyName, setBabyName] = useState('宝宝')
  const [birthDate, setBirthDate] = useState('')
  const [loading, setLoading] = useState(true)
  const { keys: quickKeys } = useQuickActionKeys(birthDate)

  useEffect(() => {
    let cancelled = false
    const loadHomeData = async () => {
      const token = getToken()
      if (!token) {
        Taro.reLaunch({ url: '/pages/login/index' })
        return
      }
      try {
        await fetchAppConfig()
        const families = await familyApi.getMine()
        if (!families.length) {
          if (!cancelled) setBackendStatus('暂无家庭数据，请先完成建档')
          return
        }

        const familyId = families[0].id
        const [baby, todayRecords] = await Promise.all([
          babyApi.get(familyId),
          recordsApi.today(familyId),
        ])

        let ongoingStart: string | null = null
        try {
          const ongoing = await sleepApi.getOngoing(familyId, baby.id)
          ongoingStart = ongoing?.start_time ?? null
        } catch {
          ongoingStart = null
        }

        if (!cancelled) {
          setBabyName(baby.name || '宝宝')
          setBirthDate(baby.birth_date || '')
          setRecords(todayRecords.map(toHomeRecord))
          setOngoingSleepStart(ongoingStart)
          setBackendStatus('')
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : '请求失败'
          if (msg.includes('缺少访问令牌') || msg.includes('Unauthorized') || msg.includes('401')) {
            Taro.reLaunch({ url: '/pages/login/index' })
            return
          }
          setBackendStatus(`后端未连通：${msg}`)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadHomeData()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo<BabyStat[]>(() => {
    const feedingRecs = records.filter((r) => ['feeding', 'formula', 'breast', 'food'].includes(r.type))
    const sleepRecs = records.filter((r) => r.type === 'sleep')
    const diaperRecs = records.filter((r) => r.type === 'diaper')
    const symptomRecs = records.filter((r) => r.type === 'symptom')

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
  }, [records])

  const filteredFabGroups = FAB_GROUPS
    .map((g) => ({ ...g, keys: g.keys.filter((k) => !quickKeys.includes(k)) }))
    .filter((g) => g.keys.length > 0)
  const filteredFabCount = filteredFabGroups.reduce((acc, g) => acc + g.keys.length, 0)

  const lastFeedingRecord = [...records]
    .filter((r) => r.type === 'feeding')
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0]

  const fabRouteHint: Record<string, string> = {
    formula: '/records/form/feeding?tab=formula',
    breast: '/records/form/feeding?tab=breast',
    food: '/records/form/feeding?tab=food',
    supplement: '/records/form/feeding?tab=supplement',
    sleep: '/records/form/sleep',
    diaper: '/records/form/diaper',
    activity: '/records/form/activity',
    health: '/records/form/health',
    temperature: '/records/form/health?expandTemp=true',
    growth: '/records/form/growth',
    medical: '/records/form/medical',
    symptom: '/records/form/symptom',
  }

  if (loading) {
    return (
      <View className='home-page'>
        <View className='home-content'>
          <View className='home-card'>
            <View className='home-empty'>
              <Text className='home-empty__title'>加载中...</Text>
              <Text className='home-empty__desc'>正在获取宝宝与今日记录数据</Text>
            </View>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className='home-page'>
      <HeroSection
        babyName={babyName}
        babyAgeText={birthDate ? getBabyAge(birthDate) : '—'}
        greeting={getGreeting()}
        dateText={getTodayDateStr()}
        stats={stats}
        banners={
          <View className='home-banners'>
            {ongoingSleepStart ? <SleepBanner startTime={ongoingSleepStart} /> : null}
            {lastFeedingRecord ? <FeedingBanner lastFeedingTime={lastFeedingRecord.time} /> : null}
          </View>
        }
      />
      <View className='home-content'>
        <QuickActions birthDate={birthDate} onMoreClick={() => setFabOpen(true)} fabCount={filteredFabCount} />
        <TodayTimeline
          records={records}
          backendStatus={backendStatus}
          onRecordClick={(record) => {
            setSelectedRecord(record)
            setActionOpen(true)
          }}
        />
      </View>
      <View className='home-tabbar'>
        <Text className='home-tabbar__item is-active'>首页</Text>
        <Text className='home-tabbar__item'>记录</Text>
        <View className='home-tabbar__fab' onClick={() => setFabOpen(true)}>+</View>
        <Text className='home-tabbar__item'>分析</Text>
        <Text className='home-tabbar__item'>我的</Text>
      </View>
      <FabSheet
        open={fabOpen}
        onClose={() => setFabOpen(false)}
        groups={filteredFabGroups.length > 0 ? filteredFabGroups : FAB_GROUPS}
        onSelect={(key) => {
          const route = fabRouteHint[key] ?? '/records'
          Taro.showToast({ title: `待接入页面：${route}`, icon: 'none' })
        }}
      />
      <RecordActionSheet
        open={actionOpen}
        record={selectedRecord}
        onClose={() => setActionOpen(false)}
        onDelete={(recordId) => {
          setRecords((prev) => prev.filter((item) => item.id !== recordId))
        }}
      />
    </View>
  )
}

