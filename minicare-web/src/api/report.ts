/**
 * 报告模块 API
 *
 * 对应后端：
 *   GET  /api/family/:familyId/report/summary   — 获取聚合统计（不保存）
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
  /** 宝宝 ID（必填） */
  babyId: string
  /** 起始日期 YYYY-MM-DD */
  startDate: string
  /** 截止日期 YYYY-MM-DD */
  endDate: string
}

// ── 图表数据类型（对应后端 ChartData 接口） ─────────────────────────────

/** 饮食模块逐日数据 */
export interface DailyFeedingData {
  date: string
  /** 配方奶总量 ml */
  formulaMl: number
  /** 母乳次数 */
  breastCount: number
  /** 配方奶喂养次数 */
  formulaCount: number
  /** 辅食次数 */
  complementaryCount: number
  /** 当日配方奶按奶粉类型拆分的毫升（后端有结构化字段时返回） */
  formulaMlByMilkType?: Record<string, number>
}

/** 尿布模块逐日数据 */
export interface DailyDiaperData {
  date: string
  /** 小便次数 */
  wetCount: number
  /** 大便次数 */
  dirtyCount: number
  /** 混合次数 */
  mixedCount: number
}

/** 睡眠模块逐日数据 */
export interface DailySleepData {
  date: string
  /** 总睡眠时长（分钟） */
  totalMin: number
  /** 睡眠时段数 */
  sessionCount: number
  /** 夜间睡眠时长（分钟，22:00-06:00） */
  nightSleepMin: number
}

/** 健康模块逐日数据 */
export interface DailyHealthData {
  date: string
  /** 体温（如有） */
  temperature: number | null
  /** 情绪（最频繁） */
  mood: string | null
  /** 精神状态（最频繁） */
  spirit: string | null
}

/** 生长记录数据点 */
export interface GrowthRecord {
  date: string
  /** 体重（克） */
  weightG: number | null
  /** 身高（毫米） */
  heightMm: number | null
  /** 头围（毫米） */
  headMm: number | null
}

/** 图表数据统一返回结构（与后端 ChartData 一致） */
export interface ChartData {
  feeding: { daily: DailyFeedingData[] }
  diaper: { daily: DailyDiaperData[] }
  sleep: { daily: DailySleepData[] }
  health: { daily: DailyHealthData[] }
  growth: { records: GrowthRecord[] }
}

// ── API 对象 ──────────────────────────────────────────────────────

export const reportApi = {
  /**
   * 获取报告聚合统计数据
   *
   * @param familyId  家庭 ID
   * @param params    必填参数：babyId / startDate / endDate
   */
  getSummary(familyId: string, params: GetSummaryParams): Promise<ReportSummary> {
    const qs = new URLSearchParams()
    qs.set('babyId', params.babyId)
    qs.set('startDate', params.startDate)
    qs.set('endDate', params.endDate)
    return request<ReportSummary>(`/api/family/${familyId}/report/summary?${qs.toString()}`)
  },

  /**
   * 获取图表逐日数据（支持后端缓存，1小时 TTL）
   *
   * @param familyId  家庭 ID
   * @param params    必填参数：babyId / startDate / endDate
   */
  getChartData(familyId: string, params: GetSummaryParams): Promise<ChartData> {
    const qs = new URLSearchParams()
    qs.set('babyId', params.babyId)
    qs.set('startDate', params.startDate)
    qs.set('endDate', params.endDate)
    return request<ChartData>(`/api/family/${familyId}/report/chart-data?${qs.toString()}`)
  },
}
