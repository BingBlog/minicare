/**
 * Dashboard 看板页面 — 平板床头大屏
 *
 * 全屏深色布局，无 Tab Bar，横屏优化。
 * 数据来源：todayApi + 各记录类型 list API
 * 实时更新：定时轮询（每 30 秒）
 *
 * 布局结构（4+4 八格等宽）：
 * ┌─ HeaderBar（体温 · 精神/情绪 · 实时时钟 · 退出）
 * ├─ 上排四列（喂养 | 尿布 | 睡眠 | 补剂）
 * └─ 下排四列（活动 | 表现 | 今日节律 | 提醒待办）
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { familyApi, babyApi, recordsApi } from '@/api'
import { useAppStore } from '@/lib/store'
import { inferSleepPeriod } from '@/lib/utils'
import { dateToLocalISO } from '@/pages/records/shared'
import type { Baby } from '@/api'
import type { SleepPeriod } from '@/api/types'
import HeaderBar from './HeaderBar'
import FeedingColumn from './FeedingColumn'
import DiaperColumn from './DiaperColumn'
import SleepColumn from './SleepColumn'
import SupplementQuickEntry from './SupplementQuickEntry'
import ActivityColumn from './ActivityColumn'
import SymptomColumn from './SymptomColumn'
import TimelineColumn from './TimelineColumn'
import RemindersColumn from './RemindersColumn'
import RecordDrawer from './RecordDrawer'
import type { DrawerRecordType } from './RecordDrawer'
import { useDashboardData, getTodayStr } from './useDashboardData'
import { useReminder, createFeedingSource, ReminderOverlay, audioManager } from './reminder'
import { FeedingModel } from './reminder/sources/feedingSource'
import type { ReminderSource } from './reminder'
import { useRecentSupplements } from './useRecentSupplements'
import AudioUnlockBanner from './AudioUnlockBanner'
import './dashboard.css'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { currentFamily, currentBaby, setCurrentFamily, setCurrentBaby } = useAppStore()

  const [loading, setLoading] = useState(true)
  const [family, setFamily] = useState(currentFamily)
  const [baby, setBaby] = useState<Baby | null>(currentBaby)

  const feedingModelRef = useRef<FeedingModel | null>(null)

  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr)

  useEffect(() => {
    async function init() {
      try {
        let f = currentFamily
        if (!f) {
          const families = await familyApi.getMine()
          if (families.length === 0) { navigate('/onboarding', { replace: true }); return }
          f = families[0]
          setCurrentFamily(f)
        }
        setFamily(f)

        let b = currentBaby
        if (!b) {
          b = await babyApi.get(f.id)
          setCurrentBaby(b)
        }
        setBaby(b)

        if (b?.id && !feedingModelRef.current) {
          feedingModelRef.current = new FeedingModel(b.id)
          feedingModelRef.current.load()
        }
      } catch {
        navigate('/login', { replace: true })
      } finally {
        setLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 抽屉状态
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerType, setDrawerType] = useState<DrawerRecordType>('feeding')
  const [drawerInitialTab, setDrawerInitialTab] = useState<string | undefined>()

  const openDrawer = (type: DrawerRecordType, initialTab?: string) => {
    setDrawerType(type)
    setDrawerInitialTab(initialTab)
    setDrawerOpen(true)
  }
  const closeDrawer = () => { setDrawerOpen(false); setDrawerInitialTab(undefined) }

  // 数据加载 hook
  const data = useDashboardData(family?.id ?? null, baby?.id ?? null, loading, selectedDate)

  const lastAddedDateRef = useRef<string | null>(null)
  useEffect(() => {
    if (!data.yesterdayFeeding.length || !baby?.id) return
    const firstTime = data.yesterdayFeeding[0]?.time
    if (!firstTime) return
    const yesterdayStr = firstTime.slice(0, 10)
    if (lastAddedDateRef.current === yesterdayStr) return

    if (!feedingModelRef.current) {
      feedingModelRef.current = new FeedingModel(baby.id)
      feedingModelRef.current.load()
    }
    feedingModelRef.current.addDay(data.yesterdayFeeding)
    lastAddedDateRef.current = yesterdayStr
  }, [data.yesterdayFeeding, baby?.id])

  const { recentList, loading: recentSuppLoading, refresh: refreshRecent } = useRecentSupplements(family?.id ?? null, baby?.id ?? null)

  // 结束睡眠
  const handleEndSleep = useCallback(async (sleepId: string) => {
    if (!family) return
    const sleepRecord = data.sleep.find((r) => r.id === sleepId)
    const period = sleepRecord ? inferSleepPeriod(sleepRecord.time) : inferSleepPeriod(dateToLocalISO(new Date()))
    await recordsApi.sleep.endSleep(family.id, sleepId, {
      end_time: dateToLocalISO(new Date()),
      quality: 'normal',
      sleep_period: period as SleepPeriod,
    })
    data.refresh()
  }, [family, data])

  // 夜间模式：22:00-06:00 自动降低亮度
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

  // 提醒声音开关（默认开启）
  const [soundEnabled, setSoundEnabled] = useState(true)
  // 音频是否已解锁
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  // 关闭声音时立即停止播放
  useEffect(() => {
    if (!soundEnabled) {
      audioManager.stop()
    }
  }, [soundEnabled])

  // 提醒系统
  const reminderSources = useMemo<ReminderSource[]>(() => [
    createFeedingSource(
      () => data.feeding,
      () => data.yesterdayFeeding,
      () => feedingModelRef.current,
    ),
  ], [data.feeding, data.yesterdayFeeding])

  const isToday = selectedDate === getTodayStr()
  const { active: activeReminder, dismiss: dismissReminder } = useReminder(reminderSources, {
    isNight,
    enabled: isToday && soundEnabled, // 仅查看今日且声音开启时启用提醒
  })

  // 防误触：拦截后退手势
  useEffect(() => {
    history.pushState(null, '', location.href)
    const onPopState = () => history.pushState(null, '', location.href)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // 防误触：离开前确认
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // 全屏请求
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {})
  }, [])

  // 解锁音频：监听用户首次交互以满足浏览器自动播放策略
  const handleUnlockAudio = useCallback(() => {
    audioManager.unlock()
    setAudioUnlocked(true)
  }, [])

  useEffect(() => {
    const unlockAudio = () => {
      handleUnlockAudio()
      document.removeEventListener('click', unlockAudio)
      document.removeEventListener('touchstart', unlockAudio)
      document.removeEventListener('keydown', unlockAudio)
    }
    document.addEventListener('click', unlockAudio)
    document.addEventListener('touchstart', unlockAudio)
    document.addEventListener('keydown', unlockAudio)
    return () => {
      document.removeEventListener('click', unlockAudio)
      document.removeEventListener('touchstart', unlockAudio)
      document.removeEventListener('keydown', unlockAudio)
    }
  }, [handleUnlockAudio])

  if (loading) {
    return (
      <div className="db-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="db-loading-spinner" />
      </div>
    )
  }

  return (
    <div className={`db-root ${isNight ? 'db-night' : ''}`}>
      <HeaderBar
        baby={baby}
        data={data}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        soundEnabled={soundEnabled}
        onSoundToggle={setSoundEnabled}
      />

      {/* 音频解锁提示 — 页面加载时显示，用户点击后消失 */}
      {!audioUnlocked && (
        <AudioUnlockBanner onUnlock={handleUnlockAudio} />
      )}

      <div className="db-body">
        {/* 上排：喂养 | 尿布 | 睡眠 | 补剂 */}
        <div className="db-grid-row db-grid-row--top">
          <div className="db-col db-col-feeding">
            <FeedingColumn data={data} onAdd={() => openDrawer('feeding')} />
          </div>
          <div className="db-col db-col-diaper">
            <DiaperColumn data={data} onAdd={() => openDrawer('diaper')} />
          </div>
          <div className="db-col db-col-sleep">
            <SleepColumn data={data} onAdd={() => openDrawer('sleep')} onEndSleep={handleEndSleep} />
          </div>
          <div className="db-col db-col-supplement">
            <SupplementQuickEntry
              data={data}
              familyId={family?.id ?? null}
              babyId={baby?.id ?? null}
              recentList={recentList}
              recentLoading={recentSuppLoading}
              onAdd={() => openDrawer('feeding', 'supplement')}
              onRecorded={() => { data.refresh(); refreshRecent(); }}
            />
          </div>
        </div>

        {/* 下排：活动 | 表现 | 今日节律 | 提醒待办 */}
        <div className="db-grid-row db-grid-row--bottom">
          <div className="db-col db-col-activity">
            <ActivityColumn data={data} onAdd={() => openDrawer('activity')} />
          </div>
          <div className="db-col db-col-symptom">
            <SymptomColumn data={data} onAdd={() => openDrawer('health')} />
          </div>
          <div className="db-col db-col-timeline">
            <TimelineColumn data={data} selectedDate={selectedDate} />
          </div>
          <div className="db-col db-col-reminders">
            <RemindersColumn data={data} selectedDate={selectedDate} onAdd={(type) => openDrawer(type)} feedingModel={feedingModelRef.current} />
          </div>
        </div>
      </div>

      <RecordDrawer
        open={drawerOpen}
        recordType={drawerType}
        initialTab={drawerInitialTab}
        onClose={closeDrawer}
        onSuccess={() => data.refresh()}
      />

      {activeReminder && (
        <ReminderOverlay reminder={activeReminder} onDismiss={dismissReminder} />
      )}
    </div>
  )
}
