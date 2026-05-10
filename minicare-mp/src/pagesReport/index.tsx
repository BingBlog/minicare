import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useCallback, useRef, useEffect } from 'react'
import dayjs from 'dayjs'
import { babyApi, familyApi } from '@/api'
import { reportApi } from '@/api/report'
import type { DailyFeedingData, DailyDiaperData, DailySleepData, DailyHealthData, GrowthRecord } from '@/api/report'
import { FeedingTab } from './tabs/FeedingTab'
import { DiaperTab } from './tabs/DiaperTab'
import { GrowthTab } from './tabs/GrowthTab'
import { SleepTab } from './tabs/SleepTab'
import { HealthTab } from './tabs/HealthTab'
import GuestReport from './GuestReport'
import { TabKey, TAB_CONFIG, TIME_RANGES, DEFAULT_RANGE_MAP, LONG_RANGE_LABEL } from './types'
import TabBar from '@/components/TabBar/TabBar'
import { getStatusBarHeight } from '@/lib/safeArea'
import { getToken, getCurrentFamilyId, setCurrentFamilyId } from '@/api/http'
import './index.scss'

function calcDateRange(rangeKey: string, birthDate?: string | null) {
  const now = dayjs()
  const todayStr = now.format('YYYY-MM-DD')
  if (rangeKey === 'birth' && birthDate) {
    return { startDate: birthDate.slice(0, 10), endDate: todayStr }
  }
  const days = parseInt(rangeKey, 10)
  if (isNaN(days) || days <= 0) {
    return { startDate: now.subtract(29, 'day').format('YYYY-MM-DD'), endDate: todayStr }
  }
  return { startDate: now.subtract(days - 1, 'day').format('YYYY-MM-DD'), endDate: todayStr }
}

function getRangeText(rangeKey: string, birthDate?: string | null) {
  const { startDate, endDate } = calcDateRange(rangeKey, birthDate)
  const fmtCN = (d: string) => {
    const [, m, day] = d.split('-')
    return `${parseInt(m)}月${parseInt(day)}日`
  }
  if (rangeKey === 'birth') return `从出生 · ${fmtCN(startDate)}—${fmtCN(endDate)}`
  const longLabel = LONG_RANGE_LABEL[rangeKey]
  if (longLabel) return `${longLabel} · ${fmtCN(startDate)}—${fmtCN(endDate)}`
  const days = parseInt(rangeKey, 10)
  return `${days}天 · ${fmtCN(startDate)}—${fmtCN(endDate)}`
}

const S = {
  page: { minHeight: '100vh', background: '#FFF8FA', display: 'flex', flexDirection: 'column' as const },
  headerWrap: { paddingTop: `${getStatusBarHeight() + 12}px`, paddingLeft: 20, paddingRight: 20, flexShrink: 0 },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: 800, color: '#4A3035', letterSpacing: -0.5 },
  exportBtn: { fontSize: 13, color: '#F87098', fontWeight: 500 },
  subtitle: { fontSize: 13, color: '#9A8090', marginTop: 2 },
  tabWrap: { padding: '12px 20px', flexShrink: 0, borderBottom: '0.5px solid #F5F0F2' },
  rangeWrap: { padding: '12px 20px', flexShrink: 0 },
  rangeText: { fontSize: 12, color: '#C0A8AD', marginTop: 6 },
  contentArea: { padding: '16px 20px 100px' },
}

export default function ReportPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('growth')
  const [rangeMap, setRangeMap] = useState<Record<TabKey, string>>(DEFAULT_RANGE_MAP)
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const [babyGender, setBabyGender] = useState<'male' | 'female' | null>(null)
  const [babyBirthDate, setBabyBirthDate] = useState<string | null>(null)
  const [babyName, setBabyName] = useState('宝宝')

  const [feedingData, setFeedingData] = useState<DailyFeedingData[] | null>(null)
  const [diaperData, setDiaperData] = useState<DailyDiaperData[] | null>(null)
  const [sleepData, setSleepData] = useState<DailySleepData[] | null>(null)
  const [healthData, setHealthData] = useState<DailyHealthData[] | null>(null)
  const [growthData, setGrowthData] = useState<GrowthRecord[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [isGuest, setIsGuest] = useState(false)

  const currentRange = rangeMap[activeTab]

  const activeTabRef = useRef(activeTab)
  const rangeMapRef = useRef(rangeMap)
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { rangeMapRef.current = rangeMap }, [rangeMap])

  useDidShow(() => {
    const token = getToken()
    if (!token) {
      setIsGuest(true)
      return
    }
    setIsGuest(false)

    let cancelled = false

    const init = async () => {
      try {
        const families = await familyApi.getMine()
        if (cancelled || !families.length) return
        const fid = getCurrentFamilyId(families)!
        setCurrentFamilyId(fid)

        const baby = await babyApi.get(fid)
        if (cancelled) return

        setFamilyId(fid)
        setBabyId(baby.id)
        setBabyName(baby.name)
        setBabyGender(baby.gender as 'male' | 'female' | null)
        setBabyBirthDate(baby.birth_date)

        const tab = activeTabRef.current
        const range = rangeMapRef.current[tab]
        loadTabData(fid, baby.id, range, tab, baby.birth_date)
      } catch (e) {
        if (!cancelled) console.error('[report] init error', e)
      }
    }

    init()

    return () => { cancelled = true }
  })

  const loadTabData = useCallback(async (
    fid: string, bid: string, rangeKey: string, tab: TabKey, birthDate?: string | null,
  ) => {
    setLoading(true)
    const { startDate, endDate } = calcDateRange(rangeKey, birthDate)
    const params = { babyId: bid, startDate, endDate }
    try {
      switch (tab) {
        case 'feeding': { const r = await reportApi.getFeedingChartData(fid, params); setFeedingData(r.daily); break }
        case 'diaper':  { const r = await reportApi.getDiaperChartData(fid, params); setDiaperData(r.daily); break }
        case 'sleep':   { const r = await reportApi.getSleepChartData(fid, params); setSleepData(r.daily); break }
        case 'health':  { const r = await reportApi.getHealthChartData(fid, params); setHealthData(r.daily); break }
        case 'growth':  { const r = await reportApi.getGrowthChartData(fid, params); setGrowthData(r.records); break }
      }
    } catch (e) {
      console.error('[report] load error', e)
      Taro.showToast({ title: '数据加载失败，请重试', icon: 'none' })
    } finally { setLoading(false) }
  }, [])

  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab)
    setFeedingData(null); setDiaperData(null); setSleepData(null); setHealthData(null); setGrowthData(null)
    if (familyId && babyId) loadTabData(familyId, babyId, rangeMap[tab], tab, babyBirthDate)
  }, [familyId, babyId, rangeMap, babyBirthDate, loadTabData])

  const handleRangeChange = useCallback((rangeKey: string) => {
    setRangeMap(prev => ({ ...prev, [activeTab]: rangeKey }))
    if (familyId && babyId) loadTabData(familyId, babyId, rangeKey, activeTab, babyBirthDate)
  }, [activeTab, familyId, babyId, babyBirthDate, loadTabData])

  if (isGuest) {
    return (
      <View style={S.page}>
        <View style={S.headerWrap}>
          <View style={S.headerRow}>
            <Text style={S.title}>分析</Text>
          </View>
          <Text style={S.subtitle}>数据洞察</Text>
        </View>
        <GuestReport />
        <TabBar activeTab='report' />
      </View>
    )
  }

  return (
    <View style={S.page}>
      <View style={S.headerWrap}>
        <View style={S.headerRow}>
          <Text style={S.title}>分析</Text>
          <Text style={S.exportBtn} onClick={() => Taro.showToast({ title: '导出功能开发中', icon: 'none' })}>导出</Text>
        </View>
        <Text style={S.subtitle}>{babyName}的数据洞察</Text>
      </View>

      <View style={S.tabWrap}>
        <ScrollView scrollX style={{ whiteSpace: 'nowrap' }}>
          {TAB_CONFIG.map(tab => (
            <View
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
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

      <View style={S.rangeWrap}>
        <ScrollView scrollX style={{ whiteSpace: 'nowrap' }}>
          {TIME_RANGES.map(range => {
            if (activeTab === 'growth' && range.key !== 'birth') return null
            const isActive = currentRange === range.key
            return (
              <View
                key={range.key}
                onClick={() => handleRangeChange(range.key)}
                style={{
                  display: 'inline-block',
                  padding: '6px 12px', fontSize: 12, fontWeight: 500,
                  borderRadius: 20, marginRight: 8, whiteSpace: 'nowrap',
                  background: isActive ? '#FFF0F4' : '#fff',
                  color: isActive ? '#F87098' : '#9A8090',
                  border: isActive ? '1px solid rgba(248,112,152,0.3)' : '1px solid #E8E0E4',
                }}
              >{range.label}</View>
            )
          })}
        </ScrollView>
        <Text style={S.rangeText}>{getRangeText(currentRange, babyBirthDate)}</Text>
      </View>

      <View style={S.contentArea}>
        {activeTab === 'feeding' && <FeedingTab data={feedingData} loading={loading} />}
        {activeTab === 'diaper' && <DiaperTab data={diaperData} loading={loading} />}
        {activeTab === 'growth' && <GrowthTab data={growthData} loading={loading} babyGender={babyGender} babyBirthDate={babyBirthDate} />}
        {activeTab === 'sleep' && <SleepTab data={sleepData} loading={loading} />}
        {activeTab === 'health' && <HealthTab data={healthData} loading={loading} />}
      </View>

      <TabBar activeTab='report' />
    </View>
  )
}
