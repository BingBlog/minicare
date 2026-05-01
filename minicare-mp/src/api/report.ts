/**
 * 报告模块 API
 *
 * 对应后端：
 *   GET  /api/family/:familyId/report/chart-data — 获取图表逐日数据（支持缓存）
 */
import { request } from './http'

// ── 类型定义 ──────────────────────────────────────────────────────

export interface FeedingStats {
  totalFormulaMl: number
  avgDailyFormulaMl: number
  formulaCount: number
  breastCount: number
  complementaryCount: number
  totalFeedCount: number
  dailyFormulaChart: Array<{ date: string; ml: number }>
}

export interface SleepStats {
  totalMin: number
  avgDailyMin: number
  sessionCount: number
}

export interface DiaperStats {
  totalCount: number
  wetCount: number
  dirtyCount: number
  mixedCount: number
  dryCount: number
}

export interface ActivityStats {
  totalCount: number
  bathCount: number
  outdoorCount: number
  playCount: number
  tummyTimeCount: number
  otherCount: number
}

export interface GrowthStats {
  latestWeightG: number | null
  latestHeightMm: number | null
  latestHeadMm: number | null
  latestDate: string | null
  weightTrend: Array<{ date: string; weightG: number }>
}

export interface HealthStats {
  avgTemperature: number | null
  maxTemperature: number | null
  moodHappyCount: number
  moodNeutralCount: number
  moodFussyCount: number
  moodCryingCount: number
  feverCount: number
}

export interface MedicalStats {
  visitCount: number
  lastVisitDate: string | null
  lastHospital: string | null
}

export interface SymptomStats {
  count: number
}

export interface FoodObservationStats {
  observingCount: number
  safeCount: number
  allergicCount: number
  items: Array<{ foodName: string; status: number; firstIntroAt: string }>
}

export interface ReportSummary {
  babyId: string
  startDate: string
  endDate: string
  days: number
  feeding: FeedingStats
  sleep: SleepStats
  diaper: DiaperStats
  activity: ActivityStats
  growth: GrowthStats
  health: HealthStats
  medical: MedicalStats
  symptom: SymptomStats
  foodObservation: FoodObservationStats
}

export interface GetSummaryParams {
  babyId: string
  startDate: string
  endDate: string
}

// ── 图表数据类型（对应后端 ChartData 接口） ─────────────────────────────

export interface DailyFeedingData {
  date: string
  formulaMl: number
  breastCount: number
  formulaCount: number
  complementaryCount: number
  supplementCount: number
  formulaMlByMilkType?: Record<string, number>
}

export interface DailyDiaperData {
  date: string
  wetCount: number
  dirtyCount: number
  mixedCount: number
}

export interface DailySleepData {
  date: string
  totalMin: number
  sessionCount: number
  nightSleepMin: number
}

export interface DailyHealthData {
  date: string
  temperature: number | null
  mood: string | null
  spirit: string | null
}

export interface GrowthRecord {
  date: string
  weightG: number | null
  heightMm: number | null
  headMm: number | null
}

// ── 工具类型 ───────────────────────────────────────────────────────

export type ChartTabParams = GetSummaryParams

// ── API 对象 ──────────────────────────────────────────────────────

export const reportApi = {
  getFeedingChartData(familyId: string, params: ChartTabParams): Promise<{ daily: DailyFeedingData[] }> {
    const qs = new URLSearchParams()
    qs.set('babyId', params.babyId)
    qs.set('startDate', params.startDate)
    qs.set('endDate', params.endDate)
    return request<{ daily: DailyFeedingData[] }>(`/api/family/${familyId}/report/chart-data/feeding?${qs.toString()}`)
  },

  getDiaperChartData(familyId: string, params: ChartTabParams): Promise<{ daily: DailyDiaperData[] }> {
    const qs = new URLSearchParams()
    qs.set('babyId', params.babyId)
    qs.set('startDate', params.startDate)
    qs.set('endDate', params.endDate)
    return request<{ daily: DailyDiaperData[] }>(`/api/family/${familyId}/report/chart-data/diaper?${qs.toString()}`)
  },

  getSleepChartData(familyId: string, params: ChartTabParams): Promise<{ daily: DailySleepData[] }> {
    const qs = new URLSearchParams()
    qs.set('babyId', params.babyId)
    qs.set('startDate', params.startDate)
    qs.set('endDate', params.endDate)
    return request<{ daily: DailySleepData[] }>(`/api/family/${familyId}/report/chart-data/sleep?${qs.toString()}`)
  },

  getHealthChartData(familyId: string, params: ChartTabParams): Promise<{ daily: DailyHealthData[] }> {
    const qs = new URLSearchParams()
    qs.set('babyId', params.babyId)
    qs.set('startDate', params.startDate)
    qs.set('endDate', params.endDate)
    return request<{ daily: DailyHealthData[] }>(`/api/family/${familyId}/report/chart-data/health?${qs.toString()}`)
  },

  getGrowthChartData(familyId: string, params: ChartTabParams): Promise<{ records: GrowthRecord[] }> {
    const qs = new URLSearchParams()
    qs.set('babyId', params.babyId)
    qs.set('startDate', params.startDate)
    qs.set('endDate', params.endDate)
    return request<{ records: GrowthRecord[] }>(`/api/family/${familyId}/report/chart-data/growth?${qs.toString()}`)
  },
}
