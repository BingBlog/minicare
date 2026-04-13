import { request } from '@/api/http'

// ── 类型定义 ──────────────────────────────────────────────────────

/** 通用枚举项（value=存储值 label=中文标签 int=TINYINT映射） */
export interface EnumOption {
  value: string
  label: string
  int?: number
}

/** 奶粉类型（含 short 短标签，用于列表展示） */
export interface MilkTypeOption {
  value: string
  label: string
  short: string
}

/** 过敏原选项 */
export interface AllergyTypeOption {
  value: string
  label: string
}

/** 营养素配置项 */
export interface SuppItem {
  key: string
  label: string
  unit: string
  hint: string
  group: string
}

/** 数值范围 */
export interface NumRange {
  min: number
  max: number
}

/** 数值限制表 */
export interface AppLimits {
  formulaMl:         NumRange
  breastDurationMin: NumRange
  foodAmountG:       NumRange
  scoopCount:        NumRange
  heightMm:          NumRange
  weightG:           NumRange
  headMm:            NumRange
  diaperCount:       NumRange
  temperature:       NumRange
  feverThreshold:    number
}

/** 枚举配置表 */
export interface AppEnums {
  // 喂养
  feedType:          EnumOption[]
  breastSide:        EnumOption[]
  milkType:          MilkTypeOption[]
  // 尿布
  diaperType:        EnumOption[]
  poopType:          EnumOption[]
  poopColor:         EnumOption[]
  buttCondition:     EnumOption[]
  // 睡眠
  sleepQuality:      EnumOption[]
  sleepPeriod:       EnumOption[]
  // 活动
  activityType:      EnumOption[]
  activityIntensity: EnumOption[]
  // 情绪/精神
  mood:              EnumOption[]
  spiritLevel:       EnumOption[]
  // 医疗
  visitType:         EnumOption[]
  // 过敏
  allergyType:       AllergyTypeOption[]
  allergyLevel:      EnumOption[]
  // 宝宝
  babyGender:        EnumOption[]
}

/** 完整应用配置 */
export interface AppConfig {
  /** 配置版本号，用于前端缓存失效判断，如 "2026-04-13.1" */
  version:             string
  enums:               AppEnums
  limits:              AppLimits
  supplements:         SuppItem[]
  quickActionDefaults: Record<'0-5' | '6-11' | '12+', string[]>
}

// ── API 调用 ──────────────────────────────────────────────────────

/**
 * 获取全量应用配置
 * 无需鉴权，供前端在启动时加载并缓存
 */
export async function fetchAppConfig(): Promise<AppConfig> {
  return request<AppConfig>('/api/config', { auth: false })
}
