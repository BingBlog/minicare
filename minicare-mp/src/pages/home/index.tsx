import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authApi, babyApi, familyApi, fetchAppConfig, recordsApi, sleepApi } from '@/api'
import type { PendingInvite } from '@/api/family'
import type { OngoingSleepRecord } from '@/api/sleep'
import { getCurrentFamilyId, setCurrentFamilyId } from '@/api/http'
import { HOME_RECORD_ROUTES } from '@/lib/constants'
import { navigateToRecord } from '@/lib/navigation'
import { getStatusBarHeight } from '@/lib/safeArea'
import { useIsIPad } from '@/lib/useIsIPad'
import { getBabyAge, getGreeting, getTodayDateStr, compareTime } from '@/lib/utils'
import { getToken } from '@/api/http'

import HeroSection from './HeroSection'
import QuickActions from './QuickActions'
import GuestQuickActions from './GuestQuickActions'
import TodayTimeline from './TodayTimeline'
import DailyComparison from './DailyComparison'
import SleepBanner from './SleepBanner'
import FeedingBanner from './FeedingBanner'
import RecordActionSheet from './RecordActionSheet'
import TabBar from '@/components/TabBar/TabBar'
import InviteModal from '@/components/InviteModal/InviteModal'
import type { BabyStat, HomeRecord } from './types'
import { toHomeRecord } from './homeRecords'
import './index.scss'

export default function HomePage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => isIPad ? `${base} is-ipad` : base
  const [backendStatus, setBackendStatus] = useState('')
  const [records, setRecords] = useState<HomeRecord[]>([])
  const [yesterdayRecords, setYesterdayRecords] = useState<HomeRecord[]>([])
  const [ongoingSleep, setOngoingSleep] = useState<OngoingSleepRecord | null>(null)
  const [actionOpen, setActionOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<HomeRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [babyName, setBabyName] = useState('宝宝')
  const [birthDate, setBirthDate] = useState('')
  const [familyId, setFamilyId] = useState('')
  const familyIdRef = useRef('')
  const [loading, setLoading] = useState(true)

  /** 获取昨日日期字符串 YYYY-MM-DD */
  const getYesterdayDateStr = useCallback(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

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

      // 同时刷新昨日记录（用于对比）
      try {
        const yRecords = await recordsApi.today(fid, getYesterdayDateStr())
        setYesterdayRecords(yRecords.map(toHomeRecord))
      } catch {
        // 昨日记录获取失败不影响主流程
      }
    } catch {
      // 静默失败，保留已有数据
    }
  }, [getYesterdayDateStr])

  // 是否处于游客模式（未登录）
  const [isGuest, setIsGuest] = useState(false)

  // 是否需要建档（已登录但无家庭或无宝宝）
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [needsOnboardingReason, setNeedsOnboardingReason] = useState<'no_family' | 'no_baby'>('no_family')

  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [inviteModalOpen, setInviteModalOpen] = useState(false)

  const checkPendingInvites = useCallback(async () => {
    try {
      const invites = await familyApi.getPendingInvites()
      if (invites.length > 0) {
        setPendingInvites(invites)
        setInviteModalOpen(true)
      }
    } catch {}
  }, [])

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
        await authApi.checkToken()

        await fetchAppConfig()
        const families = await familyApi.getMine()
        if (!families.length) {
          if (!cancelled) {
            setNeedsOnboarding(true)
            setNeedsOnboardingReason('no_family')
            setLoading(false)
          }
          return
        }

        const fid = getCurrentFamilyId(families)!

        let baby: any
        try {
          const storedBaby = Taro.getStorageSync('minicare_baby')
          if (storedBaby && storedBaby.id) {
            baby = storedBaby
          } else {
            baby = await babyApi.get(fid)
          }
        } catch {
          if (!cancelled) {
            setFamilyId(fid)
            familyIdRef.current = fid
            setNeedsOnboarding(true)
            setNeedsOnboardingReason('no_baby')
            setLoading(false)
          }
          return
        }

        const todayRecords = await recordsApi.today(fid)

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

          recordsApi.today(fid, getYesterdayDateStr())
            .then((yRecs) => { if (!cancelled) setYesterdayRecords(yRecs.map(toHomeRecord)) })
            .catch(() => {})
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : '请求失败'
          if (msg.includes('缺少访问令牌') || msg.includes('Unauthorized') || msg.includes('登录已过期')) {
            return
          }
          setBackendStatus(`后端未连通：${msg}`)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadHomeData()
    checkPendingInvites()
    return () => {
      cancelled = true
    }
  }, [checkPendingInvites])

  // 从子页面返回 / 小程序前台恢复时，刷新家庭列表 + 今日记录 + 检查新邀请
  useDidShow(() => {
    const token = getToken()
    if (!token) return

    if (!inviteModalOpen) {
      checkPendingInvites()
    }

    familyApi.getMine().then((families) => {
      if (!families.length) {
        if (!needsOnboarding) {
          setNeedsOnboarding(true)
          setNeedsOnboardingReason('no_family')
        }
        return
      }
      const latestFid = getCurrentFamilyId(families)!

      if (needsOnboarding) {
        babyApi.get(latestFid).then(() => {
          setNeedsOnboarding(false)
          setFamilyId(latestFid)
          familyIdRef.current = latestFid
          refreshTodayRecords(latestFid)
        }).catch(() => {
          setNeedsOnboardingReason('no_baby')
        })
        return
      }

      if (latestFid !== familyIdRef.current) {
        setFamilyId(latestFid)
        familyIdRef.current = latestFid
      }

      const storedBaby = Taro.getStorageSync('minicare_baby')
      if (storedBaby && storedBaby.id) {
        if (storedBaby.name !== babyName || storedBaby.birth_date !== birthDate) {
          setBabyName(storedBaby.name || '宝宝')
          setBirthDate(storedBaby.birth_date || '')
        }
      } else {
        babyApi.get(latestFid).then((baby) => {
          setBabyName(baby.name || '宝宝')
          setBirthDate(baby.birth_date || '')
        }).catch(() => {})
      }

      refreshTodayRecords(latestFid)
    }).catch(() => {
      if (familyIdRef.current) refreshTodayRecords(familyIdRef.current)
    })
  })

  // 监听语音录入成功后的刷新事件
  useEffect(() => {
    const handler = () => {
      if (familyIdRef.current) refreshTodayRecords(familyIdRef.current)
    }
    Taro.eventCenter.on('home:refresh', handler)
    return () => { Taro.eventCenter.off('home:refresh', handler) }
  }, [refreshTodayRecords])

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
    .filter((r) => {
      if (r.type !== 'feeding') return false
      const feedType = r.detail?.feed_type as string | undefined
      // 排除营养素，只保留真正的喂奶记录
      return feedType === 'formula' || feedType === 'breast' || feedType === 'complementary'
    })
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
      <View className={cls('home-page home-page--safe')} style={{ paddingTop: `${getStatusBarHeight()}px` }}>
        <View className='home-content'>
          <View className='home-card'>
            <View className='home-empty'>
              <Text className='home-empty__title'>加载中...</Text>
              <Text className='home-empty__desc'>正在获取宝宝与今日记录数据</Text>
            </View>
          </View>
        </View>
        <InviteModal
          invites={pendingInvites}
          open={inviteModalOpen}
          onAccept={async () => {
            setPendingInvites([])
            setInviteModalOpen(false)
            const families = await familyApi.getMine()
            if (families.length > 0) {
              const fid = getCurrentFamilyId(families)!
              setCurrentFamilyId(fid)
              setFamilyId(fid)
              familyIdRef.current = fid
              setNeedsOnboarding(false)
              refreshTodayRecords(fid)
            }
          }}
          onDecline={() => {
            setPendingInvites([])
            setInviteModalOpen(false)
          }}
        />
      </View>
    )
  }

  // ── 游客模式：未登录时展示功能预览，引导用户自行登录 ──
  if (isGuest) {
    return (
      <View className={cls('home-page')}>
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
          <GuestQuickActions />
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
        <InviteModal
          invites={pendingInvites}
          open={inviteModalOpen}
          onAccept={async () => {
            setPendingInvites([])
            setInviteModalOpen(false)
            const families = await familyApi.getMine()
            if (families.length > 0) {
              const fid = getCurrentFamilyId(families)!
              setCurrentFamilyId(fid)
              setFamilyId(fid)
              familyIdRef.current = fid
              setNeedsOnboarding(false)
              refreshTodayRecords(fid)
            }
          }}
          onDecline={() => {
            setPendingInvites([])
            setInviteModalOpen(false)
          }}
        />
      </View>
    )
  }

  // ── 已登录但无家庭/宝宝 → 引导建档 ──
  if (needsOnboarding) {
    const onboardingUrl = needsOnboardingReason === 'no_baby'
      ? '/pages/onboarding/index?mode=invited'
      : '/pages/onboarding/index'
    return (
      <View className={cls('home-page')}>
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
            <Text className='home-baby-card__sub'>记录每一口，呵护每一天</Text>
          </View>
          <View className='home-hero__bottom-mask' />
        </View>

        <View className='home-content'>
          <View className='home-guest-login'>
            <Text className='home-guest-login__title'>
              {needsOnboardingReason === 'no_baby' ? '请创建宝宝档案' : '欢迎加入敏宝日记'}
            </Text>
            <Text className='home-guest-login__desc'>
              {needsOnboardingReason === 'no_baby'
                ? '你已加入家庭，创建宝宝档案后即可开始记录'
                : '创建宝宝档案，开始记录宝宝的成长点滴'}
            </Text>
            <View
              className='home-guest-login__btn'
              onClick={() => Taro.navigateTo({ url: onboardingUrl })}
            >
              <Text className='home-guest-login__btn-text'>创建宝宝档案</Text>
            </View>
          </View>
        </View>
        <TabBar activeTab='home' />
        <InviteModal
          invites={pendingInvites}
          open={inviteModalOpen}
          onAccept={async () => {
            setPendingInvites([])
            setInviteModalOpen(false)
            const families = await familyApi.getMine()
            if (families.length > 0) {
              const fid = getCurrentFamilyId(families)!
              setCurrentFamilyId(fid)
              setFamilyId(fid)
              familyIdRef.current = fid
              setNeedsOnboarding(false)
              refreshTodayRecords(fid)
            }
          }}
          onDecline={() => {
            setPendingInvites([])
            setInviteModalOpen(false)
          }}
        />
      </View>
    )
  }

  return (
    <View className={cls('home-page')}>
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
        <DailyComparison
          todayRecords={records}
          yesterdayRecords={yesterdayRecords}
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
      <InviteModal
        invites={pendingInvites}
        open={inviteModalOpen}
        onAccept={async () => {
          setPendingInvites([])
          setInviteModalOpen(false)
          const families = await familyApi.getMine()
          if (families.length > 0) {
            const fid = getCurrentFamilyId(families)!
            setCurrentFamilyId(fid)
            setFamilyId(fid)
            familyIdRef.current = fid
            setNeedsOnboarding(false)
            refreshTodayRecords(fid)
          }
        }}
        onDecline={() => {
          setPendingInvites([])
          setInviteModalOpen(false)
        }}
      />
    </View>
  )
}

