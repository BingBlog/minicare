/**
 * 全局共享 TS 类型定义
 * 按业务实体分组，供各模块 API 文件引用
 */

// ── 通用 ──────────────────────────────────────────────────────────

/** 通用翻页参数 */
export interface PaginationParams {
  limit?: number
  offset?: number
}

/** 通用列表结果（后续可升级为带 total 的结构） */
export type ListResult<T> = T[]

// ── Auth ──────────────────────────────────────────────────────────

export interface User {
  id: string
  phone: string
  nickname: string
  avatar_url?: string | null
}

export interface AuthResult {
  token: string
  user: User
  isNewUser: boolean
}

// ── Family ────────────────────────────────────────────────────────

export interface Family {
  id: string
  name: string
  createdAt: string
}

export interface FamilyMember {
  id: string
  user_id: string
  /**
   * 1 = owner（创建者）
   * 2 = editor（编辑者）
   * 3 = viewer（查看者）
   */
  role: 1 | 2 | 3
  /** user.nickname aliased */
  name: string
  /** 手机号（脱敏），如 138****5678 */
  phone?: string | null
  /** 加入时间 ISO 8601 */
  joined_at?: string | null
  /** 是否是当前登录用户 */
  is_self?: boolean
  avatar_url?: string | null
}

// ── Baby ──────────────────────────────────────────────────────────

export type AllergyType =
  | 'milk'
  | 'egg'
  | 'wheat'
  | 'peanut'
  | 'tree_nut'
  | 'soy'
  | 'fish'
  | 'shellfish'
  | 'other'

export type AllergyLevel = 'mild' | 'moderate' | 'severe' | 'unknown'

export interface Baby {
  id: string
  family_id: string
  name: string
  gender: 'male' | 'female' | 'unknown'
  birth_date: string
  allergy_types?: AllergyType[]
  allergy_level?: AllergyLevel | null
  birth_weight_g?: number | null
  birth_height_cm?: number | null
  avatar_url?: string | null
}

export interface CreateBabyDto {
  name: string
  gender: 'male' | 'female' | 'unknown'
  birth_date: string
  allergy_types?: AllergyType[]
  allergy_level?: AllergyLevel
  birth_weight_g?: number
  birth_height_cm?: number
}

export type UpdateBabyDto = Partial<CreateBabyDto>

// ── Records ───────────────────────────────────────────────────────

/** 所有记录共有的基础字段 */
export interface RecordBase {
  id: string
  baby_id: string
  recorded_by: string
  note?: string | null
  created_at: string
}

// ── Feeding ──────────────────────────────────────────────────────

export type FeedType = 'breast' | 'formula' | 'complementary' | 'supplement'
export type BreastSide = 'left' | 'right' | 'both'

export interface CreateFeedingDto {
  baby_id: string
  feed_type: FeedType
  record_time: string       // ISO 8601
  breast_side?: BreastSide
  duration_min?: number
  formula_ml?: number
  complementary_food?: string
  note?: string
}

export interface FeedingRecord extends RecordBase {
  feed_type: FeedType
  record_time: string
  breast_side?: BreastSide | null
  duration_min?: number | null
  formula_ml?: number | null
  complementary_food?: string | null
}

// ── Sleep ────────────────────────────────────────────────────────

export interface CreateSleepDto {
  baby_id: string
  start_time: string        // ISO 8601
  end_time: string          // ISO 8601
  note?: string
}

export interface SleepRecord extends RecordBase {
  start_time: string
  end_time: string
}

// ── Diaper ───────────────────────────────────────────────────────

export type DiaperType = 'wet' | 'dirty' | 'mixed' | 'dry'

export interface CreateDiaperDto {
  baby_id: string
  diaper_type: DiaperType
  record_time: string       // ISO 8601
  color?: string
  note?: string
}

export interface DiaperRecord extends RecordBase {
  diaper_type: DiaperType
  record_time: string
  color?: string | null
}

// ── Activity ─────────────────────────────────────────────────────

export type ActivityType = 'bath' | 'outdoor' | 'play' | 'tummy_time' | 'other'

export interface CreateActivityDto {
  baby_id: string
  activity_type: ActivityType
  record_time: string       // ISO 8601
  duration_min?: number
  note?: string
}

export interface ActivityRecord extends RecordBase {
  activity_type: ActivityType
  record_time: string
  duration_min?: number | null
}

// ── Health ───────────────────────────────────────────────────────

export interface CreateHealthDto {
  baby_id: string
  record_time: string       // ISO 8601
  temperature?: number      // ℃，如 37.5
  note?: string
}

export interface HealthRecord extends RecordBase {
  record_time: string
  temperature?: number | null
}

// ── Growth ───────────────────────────────────────────────────────

export interface CreateGrowthDto {
  baby_id: string
  record_date: string       // YYYY-MM-DD（每日唯一索引）
  height_mm?: number        // 毫米，整数
  weight_g?: number         // 克，整数
  head_mm?: number          // 毫米，整数
  note?: string
}

export interface GrowthRecord extends RecordBase {
  record_date: string
  height_mm?: number | null
  weight_g?: number | null
  head_mm?: number | null
}

// ── Medical ──────────────────────────────────────────────────────

export type VisitType =
  | 'checkup'
  | 'allergy'
  | 'sick'
  | 'vaccine'
  | 'blood'
  | 'other'

export interface MedicationItem {
  name: string
  dose?: string
}

export interface CreateMedicalDto {
  baby_id: string
  visit_date: string        // YYYY-MM-DD
  visit_type?: VisitType
  hospital?: string
  doctor?: string
  diagnosis?: string
  result_summary?: string
  medications?: MedicationItem[]
  follow_up_date?: string   // YYYY-MM-DD
  note?: string
}

export interface MedicalRecord extends RecordBase {
  visit_date: string
  visit_type?: VisitType | null
  hospital?: string | null
  doctor?: string | null
  diagnosis?: string | null
  result_summary?: string | null
  medications?: MedicationItem[] | null
  follow_up_date?: string | null
}

// ── Symptom ──────────────────────────────────────────────────────

export type MoodType = 'happy' | 'normal' | 'sad'
export type SpiritType = 'calm' | 'normal' | 'active' | 'sleepy'

export interface CreateSymptomDto {
  baby_id: string
  record_time: string       // ISO 8601
  mood?: MoodType
  spirit?: SpiritType
  note?: string
  /** @deprecated 兼容旧版前端，后续版本移除 */
  symptoms?: Array<{ type: number; severity: number }>
}

export interface SymptomRecord extends RecordBase {
  record_time: string
  mood?: MoodType | null
  spirit?: SpiritType | null
}

// ── Today Timeline ────────────────────────────────────────────────

export interface TodayRecord {
  type: string
  id: string
  time: string
  note?: string | null
}

// ── 通用记录条目（用于记录列表页跨类型展示） ────────────────────────────────
/**
 * RecordItem 是跨记录类型的通用视图模型
 * 各类型记录（feeding/sleep/diaper/...）列表接口均返回此结构
 *
 * 字段说明：
 * - id: 记录唯一 ID
 * - type: 记录类型（feeding | sleep | diaper | ...）
 * - note: 备注，由各记录模块自行填充，格式自由（如 "120ml"、"Bristol 3"）
 * - created_at: 创建时间 ISO 8601
 * - start_time / startTime: 部分记录类型使用"开始时间"字段，命名不统一
 * - [key]: 允许各类型携带额外字段（保持向后兼容）
 */
export interface RecordItem {
  id: string
  type?: string
  note?: string | null
  created_at?: string
  start_time?: string
  startTime?: string
  [key: string]: unknown
}
