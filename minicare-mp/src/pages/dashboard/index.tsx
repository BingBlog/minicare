/**
 * Dashboard 看板页面 — MP 版
 *
 * 深色布局，竖屏优化（小程序不支持横屏锁定）。
 * 数据来源：recordsApi.today(familyId, date?)
 * 实时更新：定时轮询（每 30 秒）+ useDidShow 页面恢复刷新
 *
 * 差异化：
 * - 无 router，使用 Taro.navigateTo 跳转记录表单页
 * - 无全局 store，使用 Taro.getStorageSync 获取 family/baby 信息
 * - 无 RecordDrawer，点击"记录"直接跳转对应分包页面
 * - 无全屏按钮、无 AudioUnlockBanner（小程序无自动播放限制）
 * - setKeepScreenOn(true) 防止屏幕熄灭
 *
 * 布局结构（竖屏两列四行）：
 * ┌─ HeaderBar
 * ├─ Row1: 喂养 | 尿布
 * ├─ Row2: 睡眠 | 补剂
 * ├─ Row3: 活动 | 表现
 * └─ Row4: 时间线 | 提醒待办
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { babyApi, recordsApi } from '@/api'
import { getStoredFamilyId } from '@/api/http'
import { inferSleepPeriod } from '@/lib/utils'
import type { RecordFormType } from './types'
import { useDashboardData, getTodayStr } from './useDashboardData'
import HeaderBar from './HeaderBar'
import FeedingColumn from './FeedingColumn'
import DiaperColumn from './DiaperColumn'
import SleepColumn from './SleepColumn'
import SupplementQuickEntry from './SupplementQuickEntry'
import { useRecentSupplements } from './useRecentSupplements'
import ActivityColumn from './ActivityColumn'
import SymptomColumn from './SymptomColumn'
import TimelineColumn from './TimelineColumn'
import RemindersColumn from './RemindersColumn'
import { useReminder, createFeedingSource, ReminderOverlay } from './reminder'
import { FeedingModel } from './reminder/sources/feedingSource'
import type { ReminderSource } from './reminder'
import './index.scss'

/** 记录类型 → 分包页面路径映射 */
const RECORD_PAGE_MAP: Record<RecordFormType, string> = {
  feeding: '/pages/records/feeding/index',
  diaper: '/pages/records/diaper/index',
  sleep: '/pages/records/sleep/index',
  activity: '/pages/records/activity/index',
  temperature: '/pages/records/health/temperature/index',
  allergy: '/pages/records/health/allergy/index',
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [babyName, setBabyName] = useState('宝宝')
  const [babyId, setBabyId] = useState<string | null>(null)

  // 当前查看的日期
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr())

  // 多日学习模型（V3 喂奶预测用）
  const feedingModelRef = useRef<FeedingModel | null>(null)

  // 初始化家庭和宝宝
  useEffect(() => {
    async function init() {
      try {
        // 尝试从缓存获取
        const cachedFamily = Taro.getStorageSync('currentFamily')
        const cachedBaby = Taro.getStorageSync('currentBaby')

        let fId = cachedFamily?.id || getStoredFamilyId()
        let bName = cachedBaby?.name || '宝宝'
        let bId = cachedBaby?.id

        if (!fId) {
          Taro.redirectTo({ url: '/pages/login/index' })
          return
        }

        if (!bId) {
          const baby = await babyApi.get(fId)
          bId = baby.id
          bName = baby.name
          Taro.setStorageSync('currentBaby', baby)
        }

        setFamilyId(fId)
        setBabyId(bId)
        setBabyName(bName)

        // 初始化喂奶预测模型
        if (bId && !feedingModelRef.current) {
          feedingModelRef.current = new FeedingModel(bId)
          feedingModelRef.current.load()
        }
      } catch {
        Taro.redirectTo({ url: '/pages/login/index' })
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // 保持屏幕常亮（H5 无此 API，返回 rejected Promise 且 try/catch 捕获不到，直接跳过）
  useEffect(() => {
    if (process.env.TARO_ENV !== 'weapp') return
    Taro.setKeepScreenOn({ keepScreenOn: true })
    return () => {
      Taro.setKeepScreenOn({ keepScreenOn: false })
    }
  }, [])

  // 数据加载
  const data = useDashboardData(familyId, babyId, loading, selectedDate)

  // 更新多日学习模型：每日将昨日完整数据录入模型
  const lastAddedDateRef = useRef<string | null>(null)
  useEffect(() => {
    if (!data.yesterdayFeeding.length || !babyId) return
    // 用昨日的日期作为去重 key（取第一条记录的时间提取日期）
    const firstTime = data.yesterdayFeeding[0]?.time
    if (!firstTime) return
    const yesterdayStr = firstTime.slice(0, 10) // YYYY-MM-DD
    if (lastAddedDateRef.current === yesterdayStr) return // 已录入过

    if (!feedingModelRef.current) {
      feedingModelRef.current = new FeedingModel(babyId)
      feedingModelRef.current.load()
    }
    feedingModelRef.current.addDay(data.yesterdayFeeding)
    lastAddedDateRef.current = yesterdayStr
  }, [data.yesterdayFeeding, babyId])

  // 近 7 天补剂数据（用于快捷录入）
  const { recentList, loading: recentSuppLoading, refresh: refreshRecent } = useRecentSupplements(familyId, babyId)

  // 跳转到记录表单页
  const handleAdd = useCallback((type: RecordFormType, query?: Record<string, string>) => {
    const url = RECORD_PAGE_MAP[type]
    if (url) {
      const qs = query ? '?' + Object.entries(query).map(([k, v]) => `${k}=${v}`).join('&') : ''
      Taro.navigateTo({ url: url + qs })
    }
  }, [])

  // 结束睡眠
  const handleEndSleep = useCallback(async (sleepId: string) => {
    if (!familyId) return
    const now = new Date()
    const endTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    // 从当天睡眠记录中查找对应记录的入睡时间，用于推断 sleep_period
    const sleepRecord = data.sleep.find((r) => r.id === sleepId)
    const period = sleepRecord ? inferSleepPeriod(sleepRecord.time) : inferSleepPeriod(endTime)
    try {
      await recordsApi.sleep.endSleep(familyId, sleepId, {
        end_time: endTime,
        // 睡眠卡无质量选择入口：默认「良好」（与计时/补录页默认值一致）
        quality: 'good',
        sleep_period: period,
      })
      data.refresh()
    } catch (err) {
      console.error('[Dashboard] endSleep error:', err)
      Taro.showToast({ title: '操作失败', icon: 'none' })
    }
  }, [familyId, data])

  // 夜间模式
  const [isNight, setIsNight] = useState(() => {
    const h = new Date().getHours()
    return h >= 22 || h < 6
  })
  useEffect(() => {
    const timer = setInterval(() => {
      const h = new Date().getHours()
      setIsNight(h >= 22 || h < 6)
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  // 提醒声音开关
  const [soundEnabled, setSoundEnabled] = useState(true)

  // 提醒系统
  const isToday = selectedDate === getTodayStr()
  const reminderSources: ReminderSource[] = [
    createFeedingSource(
      () => data.feeding,
      () => data.yesterdayFeeding,
      () => feedingModelRef.current,
    ),
  ]
  const { active: activeReminder, dismiss: dismissReminder } = useReminder(reminderSources, {
    isNight,
    enabled: isToday && soundEnabled,
  })

  if (loading) {
    return (
      <View className='db-root db-loading'>
        <Text className='db-loading-text'>加载中...</Text>
      </View>
    )
  }

  return (
    <View className={`db-root ${isNight ? 'db-night' : ''}`}>
      <HeaderBar
        babyName={babyName}
        data={data}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        soundEnabled={soundEnabled}
        onSoundToggle={setSoundEnabled}
      />

      <View className='db-body'>
        {/* 上排四列：喂养 | 尿布 | 睡眠 | 补剂 */}
        <View className='db-grid-row db-grid-row--top'>
          <View className='db-col-wrap db-col-feeding'>
            <FeedingColumn data={data} onAdd={() => handleAdd('feeding')} />
          </View>
          <View className='db-col-wrap db-col-diaper'>
            <DiaperColumn data={data} onAdd={() => handleAdd('diaper')} />
          </View>
          <View className='db-col-wrap db-col-sleep'>
            <SleepColumn data={data} onAdd={() => handleAdd('sleep')} onEndSleep={handleEndSleep} />
          </View>
          <View className='db-col-wrap db-col-supplement'>
            <SupplementQuickEntry
              data={data}
              familyId={familyId}
              babyId={babyId}
              recentList={recentList}
              recentLoading={recentSuppLoading}
              onAdd={() => handleAdd('feeding', { tab: 'supplement' })}
              onRecorded={() => { data.refresh(); refreshRecent(); }}
            />
          </View>
        </View>

        {/* 下排四列：活动 | 表现 | 时间线 | 提醒待办 */}
        <View className='db-grid-row db-grid-row--bottom'>
          <View className='db-col-wrap db-col-activity'>
            <ActivityColumn data={data} onAdd={() => handleAdd('activity')} />
          </View>
          <View className='db-col-wrap db-col-symptom'>
            <SymptomColumn data={data} onAdd={() => handleAdd('allergy')} />
          </View>
          <View className='db-col-wrap db-col-timeline'>
            <TimelineColumn data={data} selectedDate={selectedDate} />
          </View>
          <View className='db-col-wrap db-col-reminders'>
            <RemindersColumn data={data} selectedDate={selectedDate} onAdd={handleAdd} feedingModel={feedingModelRef.current} />
          </View>
        </View>
      </View>

      {/* 提醒浮层 */}
      {activeReminder && (
        <ReminderOverlay reminder={activeReminder} onDismiss={dismissReminder} />
      )}
    </View>
  )
}
