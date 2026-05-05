/**
 * Dashboard 数据加载 Hook
 *
 * 策略（与 Web 端完全一致）：
 * 1. 首次加载：recordsApi.today 获取聚合时间轴
 * 2. 今日模式：每 30 秒轮询刷新
 * 3. 历史日期模式：仅加载一次，不轮询
 * 4. 按类型分组，供各列组件消费
 *
 * 差异化：
 * - API 调用改为 recordsApi.today()（MP 端无独立 todayApi）
 * - 增加 useDidShow 页面恢复时刷新
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useDidShow } from '@tarojs/taro'
import { recordsApi } from '@/api'
import type { TodayRecord } from '@/api'
import type { DashboardData } from './types'

const POLL_INTERVAL = 30_000 // 30 秒

/** 返回今日日期字符串 YYYY-MM-DD（本地时区） */
export function getTodayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function groupRecords(records: TodayRecord[]) {
  const feeding: TodayRecord[] = []
  const supplement: TodayRecord[] = []
  const diaper: TodayRecord[] = []
  const sleep: TodayRecord[] = []
  const activity: TodayRecord[] = []
  const health: TodayRecord[] = []
  const symptom: TodayRecord[] = []

  for (const r of records) {
    const detail = r.detail ?? {}
    switch (r.type) {
      case 'feeding': {
        const ft = detail.feed_type as string | undefined
        // supplement_items 非空 → 补剂列；否则 → 喂养列
        if (ft === 'supplement' || (detail.supplement_items && Array.isArray(detail.supplement_items) && (detail.supplement_items as unknown[]).length > 0)) {
          supplement.push(r)
        } else {
          feeding.push(r)
        }
        break
      }
      case 'sleep':
        sleep.push(r)
        break
      case 'diaper':
        diaper.push(r)
        break
      case 'activity':
        activity.push(r)
        break
      case 'health':
        health.push(r)
        break
      case 'symptom':
        symptom.push(r)
        break
      default:
        // growth / medical 等暂不在看板展示
        break
    }
  }

  // API 返回按时间倒序，反转为正序（从早到晚）方便看板阅读
  feeding.reverse()
  supplement.reverse()
  diaper.reverse()
  sleep.reverse()
  activity.reverse()
  health.reverse()
  symptom.reverse()

  return { feeding, supplement, diaper, sleep, activity, health, symptom }
}

function extractLatest(records: TodayRecord[]) {
  let latestTemp: number | null = null
  let latestSpirit: string | null = null
  let latestMood: string | null = null
  let isSleeping = false
  let sleepingSince: string | null = null

  // health 记录中找最新体温
  for (const r of records) {
    if (r.type === 'health' && r.detail?.temperature != null) {
      latestTemp = r.detail.temperature as number
      break // 已按时间倒序，第一条即最新
    }
  }

  // symptom 记录中找最新精神/情绪
  for (const r of records) {
    if (r.type === 'symptom') {
      if (r.detail?.spirit) latestSpirit = r.detail.spirit as string
      if (r.detail?.mood) latestMood = r.detail.mood as string
      break
    }
  }

  // sleep 记录中检测是否有进行中的睡眠
  for (const r of records) {
    if (r.type === 'sleep' && r.detail?.status === 'ongoing') {
      isSleeping = true
      sleepingSince = r.time
      break
    }
  }

  return { latestTemp, latestSpirit, latestMood, isSleeping, sleepingSince }
}

/** 获取某日期的前一天字符串 */
function getYesterdayStr(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useDashboardData(
  familyId: string | null,
  _babyId: string | null,
  initialLoading: boolean,
  /** 查看的日期，YYYY-MM-DD，undefined 表示今日 */
  selectedDate?: string,
): DashboardData {
  const [all, setAll] = useState<TodayRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [yesterdayFeedingCount, setYesterdayFeedingCount] = useState(0)
  const [yesterdayDiaperCount, setYesterdayDiaperCount] = useState(0)
  const [yesterdayFeeding, setYesterdayFeeding] = useState<TodayRecord[]>([])
  const [yesterdaySleep, setYesterdaySleep] = useState<TodayRecord[]>([])
  const [yesterdayDiaper, setYesterdayDiaper] = useState<TodayRecord[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  // 是否是今日（今日才轮询）
  const isToday = !selectedDate || selectedDate === getTodayStr()

  const fetchData = useCallback(async () => {
    if (!familyId) return
    try {
      const records = await recordsApi.today(familyId, selectedDate)
      setAll(records)
      setLastRefresh(new Date())
    } catch (err) {
      console.error('[Dashboard] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [familyId, selectedDate])

  // 获取昨日数据（统计次数 + 保留完整记录用于节律对比）
  useEffect(() => {
    if (initialLoading || !familyId) return
    const yesterdayDate = getYesterdayStr(selectedDate)
    recordsApi.today(familyId, yesterdayDate).then((records) => {
      const grouped = groupRecords(records)
      setYesterdayFeedingCount(grouped.feeding.length)
      setYesterdayDiaperCount(grouped.diaper.length)
      setYesterdayFeeding(grouped.feeding)
      setYesterdaySleep(grouped.sleep)
      setYesterdayDiaper(grouped.diaper)
    }).catch(() => {
      setYesterdayFeedingCount(0)
      setYesterdayDiaperCount(0)
      setYesterdayFeeding([])
      setYesterdaySleep([])
      setYesterdayDiaper([])
    })
  }, [initialLoading, familyId, selectedDate])

  // 初始加载（selectedDate 变化时重新加载）
  useEffect(() => {
    if (initialLoading || !familyId) return
    setLoading(true)
    setAll([])
    fetchData()
  }, [initialLoading, familyId, fetchData])

  // 定时轮询（仅今日模式）
  useEffect(() => {
    if (initialLoading || !familyId || !isToday) return
    timerRef.current = setInterval(fetchData, POLL_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [initialLoading, familyId, isToday, fetchData])

  // 页面恢复时刷新（MP 特有：从记录表单页返回时触发）
  useDidShow(() => {
    if (!initialLoading && familyId && isToday) {
      fetchData()
    }
  })

  const grouped = groupRecords(all)
  const latest = extractLatest(all)

  return {
    all,
    ...grouped,
    ...latest,
    yesterdayFeedingCount,
    yesterdayDiaperCount,
    yesterdayFeeding,
    yesterdaySleep,
    yesterdayDiaper,
    loading: loading && !initialLoading,
    lastRefresh,
    refresh: fetchData,
  }
}
