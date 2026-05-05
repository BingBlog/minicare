/**
 * Dashboard 页面类型定义
 * 与 Web 端 useDashboardData.ts 中的 DashboardData 接口保持一致
 */
import type { TodayRecord } from '@/api'

export interface DashboardData {
  /** 原始时间轴（按时间倒序） */
  all: TodayRecord[]
  /** 喂养记录（breast + formula + food，不含 supplement） */
  feeding: TodayRecord[]
  /** 营养素/补剂记录 */
  supplement: TodayRecord[]
  /** 尿布记录 */
  diaper: TodayRecord[]
  /** 睡眠记录 */
  sleep: TodayRecord[]
  /** 活动记录 */
  activity: TodayRecord[]
  /** 健康记录（体温等） */
  health: TodayRecord[]
  /** 表现记录（精神/情绪） */
  symptom: TodayRecord[]
  /** 最新体温 */
  latestTemp: number | null
  /** 最新精神状态 */
  latestSpirit: string | null
  /** 最新情绪 */
  latestMood: string | null
  /** 是否有正在进行中的睡眠 */
  isSleeping: boolean
  /** 进行中睡眠的开始时间（ISO 字符串） */
  sleepingSince: string | null
  /** 昨日喂奶次数（用于进度对比） */
  yesterdayFeedingCount: number
  /** 昨日尿布次数（用于进度对比） */
  yesterdayDiaperCount: number
  /** 昨日喂奶记录（用于节律对比） */
  yesterdayFeeding: TodayRecord[]
  /** 昨日睡眠记录（用于节律对比） */
  yesterdaySleep: TodayRecord[]
  /** 昨日尿布记录（用于节律对比） */
  yesterdayDiaper: TodayRecord[]
  /** 是否正在加载 */
  loading: boolean
  /** 上次刷新时间 */
  lastRefresh: Date | null
  /** 手动刷新 */
  refresh: () => void
}

/** 记录类型（用于跳转到对应表单页） */
export type RecordFormType = 'feeding' | 'diaper' | 'sleep' | 'activity' | 'health'
