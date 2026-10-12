import { View, Text, Canvas } from '@tarojs/components'
import Taro, { useDidShow, getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authApi, babyApi, familyApi, fetchAppConfig, foodObservationApi, recordsApi, scheduleApi, sleepApi } from '@/api'
import type { PendingInvite } from '@/api/family'
import type { OngoingSleepRecord } from '@/api/sleep'
import type { FoodObservation, ScheduleTodayResponse } from '@/api'
import { agentDiaryApi, type DiaryDetail } from '@/api/agent'
import { getStoredFamilyId, setCurrentFamilyId, getToken } from '@/api/http'
import { HOME_RECORD_ROUTES } from '@/lib/constants'
import { navigateToRecord } from '@/lib/navigation'
import { getStatusBarHeight } from '@/lib/safeArea'
import { useIsIPad } from '@/lib/useIsIPad'
import { useFileDisplayUrl } from '@/lib/useFileDisplayUrl'
import { getBabyAge, getGreeting, getTodayDateStr, yesterdayStr, compareTime } from '@/lib/utils'
import { mergeMedicationBatches } from '@/lib/mergeBatches'
import { getReminderSettings, type ReminderSettings } from '@/lib/reminderSettings'

import HeroSection from './HeroSection'
import QuickActions from './QuickActions'
import GuestQuickActions from './GuestQuickActions'
import TodayTimeline from './TodayTimeline'
import SleepBanner from './SleepBanner'
import FeedingBanner from './FeedingBanner'
import ScheduleBanner from './ScheduleBanner'
import NextFollowUpBanner from './NextFollowUpBanner'
import AllergyProgressBar from './AllergyProgressBar'
import SupplementBar from './SupplementBar'
import HomeDiaryCard from './HomeDiaryCard'
import RecordActionSheet from './RecordActionSheet'
import TabBar from '@/components/TabBar/TabBar'
import InviteModal from '@/components/InviteModal/InviteModal'
import type { NextFollowUp } from '@/api/medical'
import type { BabyStat, HomeRecord } from './types'
import { toHomeRecord } from './homeRecords'
import './index.scss'

// 分享配置 - 转发给好友
let shareImageUrl = ''
export function onShareAppMessage() {
  const baby = Taro.getStorageSync('minicare_baby') || {}
  const familyId = getStoredFamilyId()
  const babyName = baby.name || '宝宝'

  return {
    title: `${babyName}今天的护理记录`,
    path: `/pages/home/index?familyId=${familyId}&babyId=${baby.id || ''}`,
    imageUrl: shareImageUrl || undefined,
  }
}

// 分享配置 - 分享到朋友圈
export function onShareTimeline() {
  const baby = Taro.getStorageSync('minicare_baby') || {}
  const familyId = getStoredFamilyId()

  return {
    title: `${baby.name || '宝宝'}今天的护理记录`,
    query: `familyId=${familyId}&babyId=${baby.id || ''}`,
    imageUrl: shareImageUrl || undefined,
  }
}

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
  const [babyAvatarFileID, setBabyAvatarFileID] = useState('')
  // 宝宝头像：fileID → 临时展示 URL
  const babyAvatarUrl = useFileDisplayUrl(babyAvatarFileID)
  const [familyId, setFamilyId] = useState('')
  const familyIdRef = useRef('')
  const babyIdRef = useRef('')
  const [loading, setLoading] = useState(true)
  const [babyGrowth, setBabyGrowth] = useState<{ weightKg?: string; heightCm?: string; headCm?: string } | null>(null)
  const [foodObservations, setFoodObservations] = useState<FoodObservation[]>([])
  const [nextFollowUp, setNextFollowUp] = useState<NextFollowUp | null>(null)
  // 今日日程派生结果（PRD-009 US-03）；null = 未拉到 / 接口失败 → 不渲染 Bar（静默降级）
  const [scheduleToday, setScheduleToday] = useState<ScheduleTodayResponse | null>(null)
  const [scheduleLoaded, setScheduleLoaded] = useState(false)
  // 首页提醒卡片开关（本地存储，设置页可调，默认全开）
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(() => getReminderSettings())
  // 宝宝「每日补充计划」（PRD-018）：随 baby 详情拉取，[] = 未配置
  const [babyPlan, setBabyPlan] = useState<string[]>([])
  const [yesterdayDiary, setYesterdayDiary] = useState<DiaryDetail | null>(null)
  // 初值 true：首帧即渲染等高骨架，避免「空态卡闪现 → 卡片消失 → 内容卡出现」的三重跳变
  const [diaryLoading, setDiaryLoading] = useState(true)
  const diaryLoadedRef = useRef(false)

  // 页面加载时，解析 URL 参数
  useEffect(() => {
    const instance = getCurrentInstance()
    const routerParams = instance?.router?.params || {}

    if (routerParams.familyId) {
      const token = getToken()
      if (token) {
        setCurrentFamilyId(routerParams.familyId as string)
      }
    }
  }, [])

  /**
   * 昨日日记摘要（首页卡片，失败静默）。
   *
   * 目标日期是「昨天」而非今天：日记定位为当日回顾式总结，当天数据还不全。
   * 注意参数必须用 yesterdayStr()（YYYY-MM-DD）—— getTodayDateStr() 返回的是
   * 「9月19日 星期六」这类展示串，传给接口会被日期校验拒收，卡片将恒显空态。
   *
   * silent=true 时跳过 loading 态：用于从子页面返回、以及 diary:changed 事件触发的刷新，
   * 避免每次回首页都把卡片切回骨架（原实现在这里反复闪）。
   */
  const loadDiaryPreview = useCallback(async (fid: string, bid: string, silent = false) => {
    babyIdRef.current = bid
    const target = yesterdayStr()
    const showSkeleton = !silent && !diaryLoadedRef.current
    if (showSkeleton) setDiaryLoading(true)
    try {
      const item = await agentDiaryApi.detail(fid, bid, target)
      setYesterdayDiary(item)
    } catch {
      setYesterdayDiary(null)
    } finally {
      diaryLoadedRef.current = true
      if (showSkeleton) setDiaryLoading(false)
    }
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
      // 多药批次（025）：同批服药记录聚合为一条「服药事件」再渲染
      setRecords(mergeMedicationBatches(todayRecords).map(toHomeRecord))
      setOngoingSleep(ongoing)
      setBabyPlan(Array.isArray(baby.supplement_plan) ? baby.supplement_plan : [])

      try {
        const latest = await recordsApi.growth.getLatest(fid, baby.id)
        if (latest) {
          const g: { weightKg?: string; heightCm?: string; headCm?: string } = {}
          if (latest.weight_g != null) g.weightKg = (Number(latest.weight_g) / 1000).toFixed(1)
          if (latest.height_mm != null) g.heightCm = (Number(latest.height_mm) / 10).toFixed(1)
          if (latest.head_mm != null) g.headCm = (Number(latest.head_mm) / 10).toFixed(1)
          setBabyGrowth(Object.keys(g).length > 0 ? g : null)
        } else {
          setBabyGrowth(null)
        }
      } catch {
        setBabyGrowth(null)
      }

      // 同时刷新昨日记录（用于对比）
      try {
        const yRecords = await recordsApi.today(fid, yesterdayStr())
        setYesterdayRecords(yRecords.map(toHomeRecord))
      } catch {
        // 昨日记录获取失败不影响主流程
      }

      try {
        const observations = await foodObservationApi.list(fid, baby.id)
        setFoodObservations(observations)
      } catch {
        setFoodObservations([])
      }

      loadDiaryPreview(fid, baby.id)

      try {
        const nf = await recordsApi.medical.getNextFollowUp(fid, baby.id)
        setNextFollowUp(nf)
      } catch {
        setNextFollowUp(null)
      }

      // 今日日程派生（PRD-009 US-03）：搭在首页同一条刷新路径上（useDidShow / home:refresh），
      // 避免与今日记录各拉一遍当日全量记录（派工 §7 I2）。失败静默降级，不影响首页其它内容。
      try {
        const schedule = await scheduleApi.getToday(fid, baby.id)
        setScheduleToday(schedule)
      } catch {
        setScheduleToday(null)
      } finally {
        setScheduleLoaded(true)
      }
    } catch {
      // 静默失败，保留已有数据
    }
  }, [yesterdayStr, loadDiaryPreview])

  // 是否处于游客模式（未登录）
  const [isGuest, setIsGuest] = useState(false)

  // 是否需要建档（已登录但无家庭或无宝宝）
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [needsOnboardingReason, setNeedsOnboardingReason] = useState<'no_family' | 'no_baby'>('no_family')

  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [inviteModalOpen, setInviteModalOpen] = useState(false)

  const checkPendingInvites = useCallback(async () => {
    if (!getToken()) return
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
        const fid = getStoredFamilyId()
        if (!fid) {
          if (cancelled) return
          // 检查是否存在待处理的邀请，有邀请时优先展示邀请弹层
          try {
            const invites = await familyApi.getPendingInvites()
            if (invites.length > 0) {
              setPendingInvites(invites)
              setInviteModalOpen(true)
              setLoading(false)
              return
            }
          } catch {}
          setNeedsOnboarding(true)
          setNeedsOnboardingReason('no_family')
          setLoading(false)
          return
        }

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
          setBabyAvatarFileID(baby.avatar_url ?? '')
          setBabyPlan(Array.isArray(baby.supplement_plan) ? baby.supplement_plan : [])
          // 多药批次（025）：同批服药记录聚合为一条「服药事件」再渲染
          setRecords(mergeMedicationBatches(todayRecords).map(toHomeRecord))
          setOngoingSleep(ongoing)
          setBackendStatus('')

          recordsApi.growth.getLatest(fid, baby.id)
            .then((latest) => {
              if (cancelled) return
              if (latest) {
                const g: { weightKg?: string; heightCm?: string; headCm?: string } = {}
                if (latest.weight_g != null) g.weightKg = (Number(latest.weight_g) / 1000).toFixed(1)
                if (latest.height_mm != null) g.heightCm = (Number(latest.height_mm) / 10).toFixed(1)
                if (latest.head_mm != null) g.headCm = (Number(latest.head_mm) / 10).toFixed(1)
                setBabyGrowth(Object.keys(g).length > 0 ? g : null)
              } else {
                setBabyGrowth(null)
              }
            })
            .catch(() => {})

          recordsApi.today(fid, yesterdayStr())
            .then((yRecs) => { if (!cancelled) setYesterdayRecords(yRecs.map(toHomeRecord)) })
            .catch(() => {})

          loadDiaryPreview(fid, baby.id)

          recordsApi.medical.getNextFollowUp(fid, baby.id)
            .then((nf) => { if (!cancelled) setNextFollowUp(nf) })
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

    // 提醒开关存本机：从设置页返回时重读，关闭的提醒立即消失
    setReminderSettings(getReminderSettings())

    if (!inviteModalOpen) {
      checkPendingInvites()
    }

    const latestFid = getStoredFamilyId()
    if (!latestFid) {
      if (!needsOnboarding) {
        setNeedsOnboarding(true)
        setNeedsOnboardingReason('no_family')
      }
      return
    }

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
      setBabyAvatarFileID(storedBaby.avatar_url ?? '')
    } else {
      babyApi.get(latestFid).then((baby) => {
        setBabyName(baby.name || '宝宝')
        setBirthDate(baby.birth_date || '')
        setBabyAvatarFileID(baby.avatar_url ?? '')
      }).catch(() => {})
    }

    refreshTodayRecords(latestFid)
  })

  // 监听语音录入成功后的刷新事件
  useEffect(() => {
    const handler = () => {
      if (familyIdRef.current) refreshTodayRecords(familyIdRef.current)
    }
    Taro.eventCenter.on('home:refresh', handler)
    return () => { Taro.eventCenter.off('home:refresh', handler) }
  }, [refreshTodayRecords])

  // 监听日记变更事件（chat 页保存草稿 / 日记详情页保存后均会 trigger）→ 静默刷新卡片。
  // 此前该事件全项目无监听者，导致保存完日记回到首页卡片仍是旧的。
  useEffect(() => {
    const handler = () => {
      const fid = familyIdRef.current
      const bid = babyIdRef.current
      if (fid && bid) void loadDiaryPreview(fid, bid, true)
    }
    Taro.eventCenter.on('diary:changed', handler)
    return () => { Taro.eventCenter.off('diary:changed', handler) }
  }, [loadDiaryPreview])

  // 启用分享菜单（H5 无此 API，编译期剔除）
  useEffect(() => {
    if (process.env.TARO_ENV !== 'weapp') return
    Taro.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
      success() {
        console.log('分享菜单启用成功')
      },
      fail() {
        console.log('分享菜单启用失败')
      }
    })
  }, [])

  const stats = useMemo<BabyStat[]>(() => {
    const feedingRecs = records.filter((r) => r.type === 'feeding')
    const sleepRecs = records.filter((r) => r.type === 'sleep')
    const diaperRecs = records.filter((r) => r.type === 'diaper')

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
      const hour = Math.floor(totalSleepMin / 60)
      const minute = totalSleepMin % 60
      if (hour > 0 && minute > 0) {
        return {
          val: `${hour}小时${minute}分`,
          unit: '',
          label: '今日睡眠',
          parts: [
            { text: String(hour) },
            { text: '小时', small: true },
            { text: String(minute) },
            { text: '分', small: true },
          ],
        }
      }
      if (hour > 0) {
        return {
          val: `${hour}小时`,
          unit: '',
          label: '今日睡眠',
          parts: [
            { text: String(hour) },
            { text: '小时', small: true },
          ],
        }
      }
      return {
        val: `${minute}分`,
        unit: '',
        label: '今日睡眠',
        parts: [
          { text: String(minute) },
          { text: '分', small: true },
        ],
      }
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
    ]
  }, [records])


  // 喂奶间隔仅受母乳和奶粉影响，营养素（feeding_supplement_record）不计入
  const feedingFilter = (r: HomeRecord) => {
    if (r.type !== 'feeding') return false
    const feedType = r.detail?.feed_type as string | undefined
    return feedType === 'formula' || feedType === 'breast'
  }

  // 辅食间隔只看「辅食」：营养素不计入
  // —— 读取侧（family.service.getTodayRecords / timeline.loadFeedingPayload）把营养素出口为
  //    feed_type='supplement'，另有历史数据用 complementary_food='营养素' 标记，两种都要排除
  const foodFilter = (r: HomeRecord) => {
    if (r.type !== 'feeding') return false
    const feedType = r.detail?.feed_type as string | undefined
    const foodName = r.detail?.complementary_food as string | undefined
    if (feedType !== 'complementary') return false
    return foodName !== '营养素'
  }

  /** 今日优先，无今日记录时回落到昨日（与喂奶提醒口径一致） */
  const pickLatest = (filter: (r: HomeRecord) => boolean) => {
    const today = [...records].filter(filter).sort((a, b) => compareTime(b.time, a.time))
    if (today.length > 0) return { record: today[0], isYesterday: false }
    const yesterday = [...yesterdayRecords].filter(filter).sort((a, b) => compareTime(b.time, a.time))
    if (yesterday.length > 0) return { record: yesterday[0], isYesterday: true }
    return null
  }

  const lastFeedingRecord = pickLatest(feedingFilter)
  const lastFoodRecord = pickLatest(foodFilter)

  /**
   * 喂养条合并口径（2026-10-12）：喂奶与辅食只展示最近的一项。
   * 用绝对时间比较（time 为含日期的 ISO，今天/昨日混比时跨天比较自然正确）。
   */
  const lastIntake = (() => {
    if (lastFeedingRecord && lastFoodRecord) {
      return compareTime(lastFeedingRecord.record.time, lastFoodRecord.record.time) >= 0
        ? { kind: 'feeding' as const, ...lastFeedingRecord }
        : { kind: 'food' as const, ...lastFoodRecord }
    }
    if (lastFeedingRecord) return { kind: 'feeding' as const, ...lastFeedingRecord }
    if (lastFoodRecord) return { kind: 'food' as const, ...lastFoodRecord }
    return null
  })()

  const handleEndSleep = () => {
    setOngoingSleep(null)
    if (familyId) {
      refreshTodayRecords(familyId)
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
            const babies = await babyApi.getMine()
            if (babies.length > 0) {
              const fid = babies[0].family_id
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
            const babies = await babyApi.getMine()
            if (babies.length > 0) {
              const fid = babies[0].family_id
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
            const babies = await babyApi.getMine()
            if (babies.length > 0) {
              const fid = babies[0].family_id
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
        avatarUrl={babyAvatarUrl}
        stats={stats}
        onStatsClick={() => Taro.switchTab({ url: '/pages/records/list/index' })}
        banners={
          <View className='home-banners'>
            {/* 各提醒 Bar 受「我的-首页提醒」本地开关控制（默认全开） */}
            {/* PRD-009 US-03：日程 Bar 排在最前（线框图 ① 的口径），只在有启用中的模板项时渲染 */}
            {reminderSettings.schedule && scheduleToday && scheduleToday.items.length > 0 ? (
              <ScheduleBanner
                items={scheduleToday.items}
                progress={scheduleToday.progress}
                onClick={() => Taro.navigateTo({ url: '/pages/schedule/today' })}
              />
            ) : reminderSettings.schedule && scheduleLoaded && !isGuest && !needsOnboarding ? (
              /* 无模板时不渲染 Bar（US-03 场景5），改为一条独立的「去设置」引导项（随日程开关） */
              <View
                className='home-inline-banner home-inline-banner--schedule-setup'
                onClick={() => Taro.navigateTo({ url: '/pages/schedule/index' })}
              >
                <View className='home-inline-banner__dot home-inline-banner__dot--schedule-setup' />
                <View className='home-inline-banner__content'>
                  <Text className='home-inline-banner__title'>还没有作息计划</Text>
                  <Text className='home-inline-banner__desc'>
                    排一份作息，首页会提醒你几点该做什么
                  </Text>
                </View>
                <View className='home-inline-banner__action--schedule'>
                  <Text className='home-inline-banner__action-text--schedule-setup'>去设置</Text>
                </View>
              </View>
            ) : null}
            {reminderSettings.sleep && ongoingSleep ? (
              <SleepBanner
                familyId={familyId}
                recordId={ongoingSleep.id}
                startTime={ongoingSleep.start_time}
                sleepPeriod={ongoingSleep.sleep_period}
                onEnded={handleEndSleep}
                onBannerClick={() => navigateToRecord('/records/form/sleep')}
              />
            ) : null}
            {reminderSettings.feed && lastIntake ? (
              <FeedingBanner
                kind={lastIntake.kind}
                time={lastIntake.record.time}
                isYesterday={lastIntake.isYesterday}
                onClick={() => {
                  navigateToRecord(
                    lastIntake.kind === 'feeding'
                      ? (HOME_RECORD_ROUTES.formula ?? '/records/form/feeding')
                      : (HOME_RECORD_ROUTES.food ?? '/records/form/feeding'),
                  )
                }}
              />
            ) : null}
            {reminderSettings.followup && nextFollowUp ? (
              <NextFollowUpBanner
                followUpDate={nextFollowUp.follow_up_date}
                followUpTime={nextFollowUp.follow_up_time}
                visitType={nextFollowUp.visit_type}
                hospital={nextFollowUp.hospital}
                onRecordClick={() => navigateToRecord('/records/form/medical', nextFollowUp.id)}
              />
            ) : null}
            {/* 补剂&营养素：计划对账 Bar（PRD-018）；未配置时渲染引导条 */}
            {reminderSettings.supplement ? (
              <SupplementBar planKeys={babyPlan} todayRecords={records} />
            ) : null}
            {reminderSettings.allergy ? (
              <AllergyProgressBar observations={foodObservations} />
            ) : null}
          </View>
        }
      />
      <View className='home-content'>
        {/* 日记卡受「我的-首页提醒」的「日记提醒」开关控制（默认全开） */}
        {reminderSettings.diary ? (
          <HomeDiaryCard diary={yesterdayDiary} loading={diaryLoading} />
        ) : null}
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
            const feedType = record.detail.feed_type as string
            if (feedType === 'complementary') {
              routeKey = record.detail.complementary_food === '营养素' ? 'supplement' : 'food'
            } else {
              routeKey = feedType
            }
          }
          // health 已拆分为体温/过敏两个独立页，按记录内容分流
          if (routeKey === 'health') {
            const detail = (record.detail ?? {}) as Record<string, unknown>
            routeKey = detail.temperature != null ? 'temperature' : 'allergy'
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
          const babies = await babyApi.getMine()
          if (babies.length > 0) {
            const fid = babies[0].family_id
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

