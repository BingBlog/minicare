import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authApi, babyApi, familyApi, fetchAppConfig, recordsApi, sleepApi } from '@/api'
import type { OngoingSleepRecord } from '@/api/sleep'
import { HOME_RECORD_ROUTES } from '@/lib/constants'
import { navigateToRecord } from '@/lib/navigation'
import { getStatusBarHeight } from '@/lib/safeArea'
import { getBabyAge, getGreeting, getTodayDateStr, compareTime } from '@/lib/utils'
import { getToken } from '@/api/http'

import HeroSection from './HeroSection'
import QuickActions from './QuickActions'
import GuestQuickActions from './GuestQuickActions'
import TodayTimeline from './TodayTimeline'
import SleepBanner from './SleepBanner'
import FeedingBanner from './FeedingBanner'
import RecordActionSheet from './RecordActionSheet'
import TabBar from '@/components/TabBar/TabBar'
import type { BabyStat, HomeRecord } from './types'
import { toHomeRecord } from './homeRecords'
import './index.scss'

export default function HomePage() {
  const [backendStatus, setBackendStatus] = useState('')
  const [records, setRecords] = useState<HomeRecord[]>([])
  const [ongoingSleep, setOngoingSleep] = useState<OngoingSleepRecord | null>(null)
  const [actionOpen, setActionOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<HomeRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [babyName, setBabyName] = useState('宝宝')
  const [birthDate, setBirthDate] = useState('')
  const [familyId, setFamilyId] = useState('')
  const familyIdRef = useRef('')
  const [loading, setLoading] = useState(true)

  /** 刷新今日记录 & 进行中睡眠（页面从子页面返回时复用） */
  const refreshTodayRecords = useCallback(async (fid: string) => {
    try {
      const [baby, todayRecords] = await Promise.all([
        babyApi.get(fid),
        recordsApi.today(fid),
      ])
      let ongoing: OngoingSleepRecord | null = null
      try {
        const ongoingRec = await sleepApi.getOngoing(fid, baby.id)
        ongoing = ongoingRec ?? null
      } catch {
        ongoing = null
      }
      setBabyName(baby.name || '宝宝')
      setBirthDate(baby.birth_date || '')
      setRecords(todayRecords.map(toHomeRecord))
      setOngoingSleep(ongoing)
    } catch {
      // 静默失败，保留已有数据
    }
  }, [])

  // 是否处于游客模式（未登录）
  const [isGuest, setIsGuest] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadHomeData = async () => {
      const token = getToken()
      if (!token) {
        if (!cancelled) {
          setIsGuest(true)
          setLoading(false)
        }
        return
      }
      try {
        // 先验证 token 在当前后端环境是否有效（防止跨环境 token 残留）
        await authApi.checkToken()

        await fetchAppConfig()
        const families = await familyApi.getMine()
        if (!families.length) {
          if (!cancelled) setBackendStatus('暂无家庭数据，请先完成建档')
          return
        }

        const fid = families[0].id
        const [baby, todayRecords] = await Promise.all([
          babyApi.get(fid),
          recordsApi.today(fid),
        ])

        let ongoing: OngoingSleepRecord | null = null
        try {
          const ongoingRec = await sleepApi.getOngoing(fid, baby.id)
          ongoing = ongoingRec ?? null
        } catch {
          ongoing = null
        }

        if (!cancelled) {
          setFamilyId(fid)
          familyIdRef.current = fid
          setBabyName(baby.name || '宝宝')
          setBirthDate(baby.birth_date || '')
          setRecords(todayRecords.map(toHomeRecord))
          setOngoingSleep(ongoing)
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

  // 从子页面返回 / 小程序前台恢复时，刷新家庭列表 + 今日记录
  useDidShow(() => {
    const token = getToken()
    if (!token) return

    // 重新获取家庭列表，检测是否被邀请到新家庭
    familyApi.getMine().then((families) => {
      if (!families.length) return
      const latestFid = families[0].id
      if (latestFid !== familyIdRef.current) {
        // 家庭发生变化（被邀请到新家庭），重新加载完整数据
        setFamilyId(latestFid)
        familyIdRef.current = latestFid
        babyApi.get(latestFid).then((baby) => {
          setBabyName(baby.name || '宝宝')
          setBirthDate(baby.birth_date || '')
        }).catch(() => {})
      }
      refreshTodayRecords(latestFid)
    }).catch(() => {
      // 静默失败，继续使用已有数据
      if (familyIdRef.current) refreshTodayRecords(familyIdRef.current)
    })
  })

  const stats = useMemo<BabyStat[]>(() => {
    const feedingRecs = records.filter((r) => r.type === 'feeding')
    const sleepRecs = records.filter((r) => r.type === 'sleep')
    const diaperRecs = records.filter((r) => r.type === 'diaper')
    const symptomRecs = records.filter((r) => r.type === 'symptom')

    const totalMl = feedingRecs.reduce((acc, r) => {
      const detail = (r.detail as Record<string, unknown> | undefined) ?? {}
      if (detail.feed_type !== 'formula') return acc
      const ml = Number(detail.formula_ml ?? 0)
      return Number.isFinite(ml) && ml > 0 ? acc + ml : acc
    }, 0)

    const totalSleepMin = sleepRecs.reduce((acc, r) => {
      const detail = (r.detail as Record<string, unknown> | undefined) ?? {}
      const mins = Number(detail.duration_min ?? 0)
      return Number.isFinite(mins) && mins > 0 ? acc + mins : acc
    }, 0)

    const sleepStat: BabyStat = (() => {
      if (totalSleepMin <= 0) return { val: '—', unit: '', label: '今日睡眠' }
      if (totalSleepMin < 60) return { val: `${totalSleepMin}`, unit: '分', label: '今日睡眠' }
      const hour = Math.floor(totalSleepMin / 60)
      const minute = totalSleepMin % 60
      if (minute === 0) return { val: `${hour}`, unit: 'h', label: '今日睡眠' }
      return { val: `${hour}h${minute}`, unit: 'm', label: '今日睡眠' }
    })()

    return [
      feedingRecs.length > 0
        ? totalMl > 0
          ? { val: totalMl, unit: 'ml', label: '今日奶量' }
          : { val: feedingRecs.length, unit: '次', label: '今日奶量' }
        : { val: '—', unit: '', label: '今日奶量' },
      sleepStat,
      diaperRecs.length > 0
        ? { val: diaperRecs.length, unit: '次', label: '换尿布' }
        : { val: '—', unit: '', label: '换尿布' },
      symptomRecs.length > 0
        ? { val: symptomRecs.length, unit: '项', label: '表现' }
        : { val: '—', unit: '', label: '表现' },
    ]
  }, [records])


  const lastFeedingRecord = [...records]
    .filter((r) => r.type === 'feeding')
    .sort((a, b) => compareTime(b.time, a.time))[0]

  const handleEndSleep = () => {
    setOngoingSleep(null)
    if (familyId) {
      babyApi.get(familyId).then(() => {
        recordsApi.today(familyId).then((recs) => setRecords(recs.map(toHomeRecord)))
      }).catch(() => {})
    }
  }

  if (loading) {
    return (
      <View className='home-page home-page--safe' style={{ paddingTop: `${getStatusBarHeight()}px` }}>
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

  // ── 游客模式：未登录时展示功能预览，引导用户自行登录 ──
  if (isGuest) {
    return (
      <View className='home-page'>
        <View className='home-hero' style={{ paddingTop: `${getStatusBarHeight() + 8}px` }}>
          <View className='home-hero__decor home-hero__decor--big' />
          <View className='home-hero__decor home-hero__decor--small' />
          <View className='home-hero__head'>
            <View>
              <Text className='home-hero__date'>{getTodayDateStr()}</Text>
              <Text className='home-hero__greeting'>{getGreeting()}</Text>
            </View>
          </View>
          <View className='home-baby-card home-baby-card--guest'>
            <Text className='home-baby-card__name'>敏宝日记</Text>
            <Text className='home-baby-card__sub'>专为过敏宝宝家庭打造的成长记录工具</Text>
          </View>
          <View className='home-hero__bottom-mask' />
        </View>

        <View className='home-content'>
          {/* 快捷记录（与登录后同款网格，点击时引导登录） */}
          <GuestQuickActions />

          {/* 登录引导 */}
          <View className='home-guest-login'>
            <Text className='home-guest-login__title'>登录后即可开始记录</Text>
            <Text className='home-guest-login__desc'>使用手机号登录，随时随地记录宝宝的成长点滴</Text>
            <View
              className='home-guest-login__btn'
              onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}
            >
              <Text className='home-guest-login__btn-text'>立即登录</Text>
            </View>
          </View>
        </View>
        <TabBar activeTab='home' />
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
        onStatsClick={() => Taro.switchTab({ url: '/pages/records/list/index' })}
        banners={
          <View className='home-banners'>
            {ongoingSleep ? (
              <SleepBanner
                familyId={familyId}
                recordId={ongoingSleep.id}
                startTime={ongoingSleep.start_time}
                sleepPeriod={ongoingSleep.sleep_period}
                onEnded={handleEndSleep}
                onBannerClick={() => navigateToRecord('/records/form/sleep')}
              />
            ) : null}
            {lastFeedingRecord ? (
              <FeedingBanner
                lastFeedingTime={lastFeedingRecord.time}
                onRecordClick={() => {
                  navigateToRecord(HOME_RECORD_ROUTES.formula ?? '/records/form/feeding')
                }}
              />
            ) : null}
          </View>
        }
      />
      <View className='home-content'>
        <QuickActions
          birthDate={birthDate}
          onMoreClick={() => Taro.eventCenter.trigger('tabbar:openFab')}
          onAction={(key) => {
            const route = HOME_RECORD_ROUTES[key] ?? '/records'
            navigateToRecord(route)
          }}
        />
        <TodayTimeline
          records={records}
          backendStatus={backendStatus}
          onRecordClick={(record) => {
            setSelectedRecord(record)
            setActionOpen(true)
          }}
        />
      </View>
      <TabBar activeTab='home' />
      <RecordActionSheet
        open={actionOpen}
        record={selectedRecord}
        deleting={deletingId === selectedRecord?.id}
        onClose={() => setActionOpen(false)}
        onEdit={(record) => {
          // feeding 类型需要根据 detail.feed_type 确定子类型路由
          let routeKey = record.type as string
          if (routeKey === 'feeding' && record.detail?.feed_type) {
            routeKey = record.detail.feed_type as string
          }
          const route = HOME_RECORD_ROUTES[routeKey]
          if (route) {
            navigateToRecord(route, record.id)
          }
          setActionOpen(false)
        }}
        onDelete={(recordId) => {
          const deleting = records.find((item) => item.id === recordId)
          if (!deleting || !familyId) {
            setRecords((prev) => prev.filter((item) => item.id !== recordId))
            return
          }
          const apiType =
            deleting.type === 'formula' || deleting.type === 'breast' || deleting.type === 'food' || deleting.type === 'supplement'
              ? 'feeding'
              : deleting.type
          setDeletingId(recordId)
          recordsApi
            .remove(familyId, apiType, recordId)
            .then(() => {
              setRecords((prev) => prev.filter((item) => item.id !== recordId))
              Taro.showToast({ title: '记录已删除', icon: 'success' })
            })
            .catch((err) => {
              Taro.showToast({ title: err instanceof Error ? err.message : '删除失败', icon: 'none' })
            })
            .finally(() => {
              setDeletingId(null)
            })
        }}
      />
    </View>
  )
}

