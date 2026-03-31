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
   * DDL: family_member.role TINYINT
   * 1 = owner（创建者，可邀请/移除成员、修改宝宝档案）
   * 2 = member（普通成员，可查看和新增所有记录）
   */
  role: 1 | 2
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

/**
 * DDL: feed_type TINYINT  1=breast 2=formula 3=complementary
 * 注：前端"营养素"Tab 实际使用 feed_type='complementary'，complementary_food='营养素'
 */
export type FeedType = 'breast' | 'formula' | 'complementary'
export type BreastSide = 'left' | 'right' | 'both'

export interface CreateFeedingDto {
  baby_id: string
  /** DDL: 1=breast 2=formula 3=complementary */
  feed_type: FeedType
  record_time: string       // ISO 8601
  /** 母乳哺乳侧，feed_type='breast' 时使用 */
  breast_side?: BreastSide
  /** 母乳时长（分钟），范围 0~120 */
  duration_min?: number
  /** 奶粉喂养量（毫升），范围 0~500 */
  formula_ml?: number
  /** 辅食/营养素名称（多项逗号/顿号分隔） */
  complementary_food?: string
  /** 辅食克数，范围 0~500 */
  amount_g?: number
  note?: string
}

export interface FeedingRecord extends RecordBase {
  /** DDL: 1=breast 2=formula 3=complementary（后端返回字符串） */
  feed_type: FeedType
  record_time: string
  breast_side?: BreastSide | null
  duration_min?: number | null
  formula_ml?: number | null
  complementary_food?: string | null
  amount_g?: number | null
}

// ── Sleep ────────────────────────────────────────────────────────

/**
 * 开始睡眠（计时模式 & 补录模式开始）
 * 对应 POST /records/sleep/start
 */
export interface StartSleepDto {
  baby_id: string
  start_time: string        // ISO 8601
  note?: string
}

/**
 * 结束睡眠（计时模式停止 & 补录模式）
 * 对应 PATCH /records/sleep/:id/end
 */
export interface EndSleepDto {
  end_time: string          // ISO 8601
  note?: string
}

/**
 * @deprecated 旧接口兼容，前端已改为 startSleep + endSleep 两步流程
 * 该类型保留供补录模式单次提交使用（后续可删除）
 */
export interface CreateSleepDto {
  baby_id: string
  start_time: string        // ISO 8601
  end_time?: string         // ISO 8601，补录时必传
  note?: string
}

export interface SleepRecord extends RecordBase {
  start_time: string
  end_time?: string | null  // null 表示进行中
  /**
   * DDL: status TINYINT  1=ongoing 2=ended
   * 后端返回字符串: 'ongoing' | 'ended'
   */
  status: 'ongoing' | 'ended'
  duration_min?: number | null
}

// ── Diaper ───────────────────────────────────────────────────────

/** DDL: diaper_type TINYINT  1=wet 2=dirty 3=mixed 4=dry */
export type DiaperType = 'wet' | 'dirty' | 'mixed' | 'dry'

export interface CreateDiaperDto {
  baby_id: string
  /** DDL: 1=wet 2=dirty 3=mixed 4=dry */
  diaper_type: DiaperType
  record_time: string       // ISO 8601
  /** 大便颜色（如 yellow/green/brown），dirty/mixed 时使用 */
  color?: string
  note?: string
}

export interface DiaperRecord extends RecordBase {
  diaper_type: DiaperType
  record_time: string
  color?: string | null
}

// ── Activity ─────────────────────────────────────────────────────

/** DDL: activity_type TINYINT  1=bath 2=outdoor 3=play 4=tummy_time 5=other */
export type ActivityType = 'bath' | 'outdoor' | 'play' | 'tummy_time' | 'other'

export interface CreateActivityDto {
  baby_id: string
  /** DDL: 1=bath 2=outdoor 3=play 4=tummy_time 5=other */
  activity_type: ActivityType
  record_time: string       // ISO 8601
  /** 活动时长（分钟） */
  duration_min?: number
  note?: string
}

export interface ActivityRecord extends RecordBase {
  activity_type: ActivityType
  record_time: string
  duration_min?: number | null
}

// ── Health ───────────────────────────────────────────────────────

/**
 * DDL: health_record.mood TINYINT
 * 1=happy 2=neutral 3=fussy 4=crying
 * 后端返回字符串
 */
export type MoodType = 'happy' | 'neutral' | 'fussy' | 'crying'

export interface CreateHealthDto {
  baby_id: string
  record_time: string       // ISO 8601
  /** 体温（℃），正常范围 35~42，如 37.5 */
  temperature?: number
  /**
   * 情绪状态（DDL: 1=happy 2=neutral 3=fussy 4=crying）
   * 后端传字符串，自动映射到 TINYINT
   */
  mood?: MoodType
  note?: string
}

export interface HealthRecord extends RecordBase {
  record_time: string
  temperature?: number | null
  /** DDL: 1=happy 2=neutral 3=fussy 4=crying（后端返回字符串） */
  mood?: MoodType | null
}

// ── Growth ───────────────────────────────────────────────────────

export interface CreateGrowthDto {
  baby_id: string
  record_date: string       // YYYY-MM-DD（每日唯一索引）
  /** 身高，毫米整数（前端 cm × 10 后传入），范围 300~1500 */
  height_mm?: number
  /** 体重，克整数（前端 kg × 1000 后传入），范围 500~30000 */
  weight_g?: number
  /** 头围，毫米整数（前端 cm × 10 后传入），范围 250~600 */
  head_mm?: number
  note?: string
}

export interface GrowthRecord extends RecordBase {
  record_date: string
  height_mm?: number | null
  weight_g?: number | null
  head_mm?: number | null
}

// ── Medical ──────────────────────────────────────────────────────

/**
 * 就诊类型（前端展示枚举，存储到 medical_record.visit_type VARCHAR(20)）
 */
export type VisitType =
  | 'checkup'       // 常规体检
  | 'allergy'       // 过敏专科
  | 'sick'          // 生病就诊
  | 'vaccine'       // 疫苗接种
  | 'blood'         // 血液检查
  | 'other'         // 其他

export interface MedicationItem {
  name: string
  dose?: string
}

export interface CreateMedicalDto {
  baby_id: string
  /** 就诊日期，YYYY-MM-DD */
  visit_date: string
  /** 就诊类型（存储到 visit_type 列） */
  visit_type?: VisitType
  hospital?: string
  /** 主诊医生（存储到 doctor 列） */
  doctor?: string
  diagnosis?: string
  /** 结果摘要（存储到 result_summary 列） */
  result_summary?: string
  /** 用药列表，[{ name, dose? }] */
  medications?: MedicationItem[]
  /** 下次复查日期，YYYY-MM-DD（存储到 follow_up_date 列） */
  follow_up_date?: string
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

/**
 * 单条症状项
 * type: 症状类型编号（1=rash 2=vomit 3=fever 4=diarrhea 5=constipation 6=other）
 * severity: 严重程度（1=mild 2=moderate 3=severe）
 */
export interface SymptomItem {
  type: number
  severity?: number
}

export interface CreateSymptomDto {
  baby_id: string
  record_time: string       // ISO 8601
  /**
   * 症状列表，如 [{ type: 3, severity: 2 }] 表示"发烧-中度"
   * DDL: symptom_record.symptoms JSON
   */
  symptoms: SymptomItem[]
  /** 照片 fileID 列表，DDL: photo_ids JSON */
  photo_ids?: string[]
  note?: string
}

export interface SymptomRecord extends RecordBase {
  record_time: string
  symptoms: SymptomItem[]
  photo_ids?: string[] | null
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
