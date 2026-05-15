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
  /**
   * 本次登录/注册时被激活的家庭 ID 列表（手机号邀请流程）
   * 非空时前端需展示"切换宝宝"引导弹层
   */
  activatedFamilyIds?: string[]
}

// ── Family ────────────────────────────────────────────────────────

export interface Family {
  id: string
  name: string
  createdAt: string
}

export interface FamilyMember {
  id: string
  user_id: string | null
  /**
   * DDL: family_member.role VARCHAR(20)（Migration 008: TINYINT → VARCHAR）
   * 'owner'  — 创建者，可邀请/移除成员、修改宝宝档案
   * 'member' — 普通成员，可查看和新增所有记录
   */
  role: 'owner' | 'member'
  /**
   * DDL: family_member.status VARCHAR(20)（Migration 008: TINYINT → VARCHAR）
   * 'pending' — 待接受：已发出手机号邀请，对方尚未登录激活
   * 'active'  — 已激活：正式成员
   * 'left'    — 已离开
   */
  status?: 'pending' | 'active' | 'left'
  /** user.nickname aliased；pending 状态时可能为 null */
  name: string | null
  /** 手机号（脱敏），如 138****5678；active 成员来自 user_account，pending 来自 invite_phone */
  phone?: string | null
  /** 被邀请手机号（pending 状态下展示用，脱敏后） */
  invite_phone?: string | null
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
  family_name?: string
  family_role?: 'owner' | 'member'
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
 * 喂养记录类型（Migration 008: 拆分为 4 张独立子表）
 *   feeding_breast_record     — 母乳哺乳
 *   feeding_formula_record    — 配方奶喂养
 *   feeding_food_record       — 辅食
 *   feeding_supplement_record — 营养素
 * feed_type 字段由后端根据来源表展入
 */
/** Migration 008: supplement 是独立子表的 feed_type，不再用 complementary+食物名区分 */
export type FeedType = 'breast' | 'formula' | 'complementary' | 'supplement'
export type BreastSide = 'left' | 'right' | 'both'

/** 营养素条目 */
export interface SupplementItem {
  key: string
  label: string
  dose: string
  unit: string
}

export interface CreateFeedingDto {
  baby_id: string
  /** 喂养类型：breast=母乳 formula=配方奶 complementary=辅食/营养素 */
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
  /**
   * formula 专用：奶粉类型列表（替代写入 note）
   * 如 ["aa", "eh_no_lactose"]
   */
  milk_types?: string[]
  /**
   * formula 专用：各类奶粉勺数映射（替代写入 note）
   * 如 { "aa": 3, "eh_no_lactose": 0.33 }
   */
  milk_scoops?: Record<string, number>
  /**
   * complementary 营养素专用：营养素明细列表
   * 如 [{ key: "vitD", label: "维D", dose: "400", unit: "IU" }]
   */
  supplement_items?: SupplementItem[]
  note?: string
}

export type UpdateFeedingDto = Partial<Omit<CreateFeedingDto, 'baby_id'>>

export interface FeedingRecord extends RecordBase {
  /** 后端根据来源表展入的喂养类型字符串 */
  feed_type: FeedType
  record_time: string
  breast_side?: BreastSide | null
  duration_min?: number | null
  formula_ml?: number | null
  complementary_food?: string | null
  amount_g?: number | null
  milk_types?: string[] | null
  milk_scoops?: Record<string, number> | null
  supplement_items?: SupplementItem[] | null
}

// ── Sleep ────────────────────────────────────────────────────────

/** 睡眠质量 */
export type SleepQuality = 'good' | 'normal' | 'poor'
/** 睡眠时段 */
export type SleepPeriod = 'night' | 'morning_nap' | 'afternoon_nap' | 'other'

/**
 * 开始睡眠（计时模式 & 补录模式开始）
 * 对应 POST /records/sleep/start
 */
export interface StartSleepDto {
  baby_id: string
  start_time: string        // ISO 8601
  quality?: SleepQuality
  sleep_period?: SleepPeriod
  note?: string
}

/**
 * 结束睡眠（计时模式停止 & 补录模式）
 * 对应 PATCH /records/sleep/:id/end
 */
export interface EndSleepDto {
  end_time: string          // ISO 8601
  quality?: SleepQuality
  sleep_period?: SleepPeriod
  note?: string
}

/**
 * 补录已完成睡眠（与进行中计时不冲突）
 * 对应 POST /records/sleep/complete
 */
export interface CreateCompleteSleepDto {
  baby_id: string
  start_time: string
  end_time: string
  quality?: SleepQuality
  sleep_period?: SleepPeriod
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
  quality?: SleepQuality
  sleep_period?: SleepPeriod
  note?: string
}

export interface UpdateSleepDto {
  start_time?: string
  end_time?: string
  quality?: SleepQuality
  sleep_period?: SleepPeriod
  note?: string
}

export interface SleepRecord extends RecordBase {
  start_time: string
  end_time?: string | null
  status: 'ongoing' | 'ended'
  duration_min?: number | null
  quality?: SleepQuality | null
  sleep_period?: SleepPeriod | null
}

export type OngoingSleepRecord = SleepRecord

// ── Diaper ───────────────────────────────────────────────────────

/** DDL: diaper_record.diaper_type VARCHAR(10)（Migration 008: TINYINT → VARCHAR） */
export type DiaperType = 'wet' | 'dirty' | 'mixed'

/**
 * 大便性状枚举
 * DDL: diaper_record.poop_type VARCHAR(30)
 * normal_soft / normal_form 已合并为 normal（正常）
 */
export type PoopType =
  | 'normal'   // 正常（含原 normal_soft / normal_form）
  | 'loose'    // 稀便
  | 'watery'   // 水样便
  | 'hard'     // 干硬粒
  | 'bloody'   // 血丝便

/**
 * 屁屁状态枚举
 * DDL: diaper_record.butt_condition VARCHAR(30)
 */
export type ButtCondition =
  | 'normal'        // 正常
  | 'slightly_red'  // 轻微发红
  | 'rash'          // 红屁屁（尿布疹）
  | 'severe_rash'   // 严重红屁屁（破皮渗出）
  | 'fungal'        // 疑似真菌感染
  | 'other'         // 其他异常

export interface CreateDiaperDto {
  baby_id: string
  /** DDL: VARCHAR(10)—‘wet’=嘘嘘 | ‘dirty’=臭臭 | ‘mixed’=臭臭+嘘嘘 */
  diaper_type: DiaperType
  record_time: string       // ISO 8601
  /** 大便颜色（如 yellow/green/brown），dirty/mixed 时使用 */
  color?: string
  /** 大便性状，dirty/mixed 时使用 */
  poop_type?: PoopType
  /** 屁屁状态 */
  butt_condition?: ButtCondition
  stool_colors?: string[]
  diaper_count?: number
  note?: string
}

export type UpdateDiaperDto = Partial<Omit<CreateDiaperDto, 'baby_id'>>

export interface DiaperRecord extends RecordBase {
  /** DDL: VARCHAR(10) */
  diaper_type: DiaperType
  record_time: string
  color?: string | null
  poop_type?: PoopType | null
  butt_condition?: ButtCondition | null
  stool_colors?: string[] | null
  diaper_count?: number | null
}

// ── Activity ─────────────────────────────────────────────────────

/** DDL: activity_type VARCHAR(20) 直接存储字符串枚举值，新增类型无需数据迁移 */
export type ActivityType = 'gross_motor' | 'fine_motor' | 'edu_play' | 'outdoor' | 'daily_care' | 'other'

/** 活动强度 */
export type ActivityIntensity = 'easy' | 'medium' | 'active'

export interface CreateActivityDto {
  baby_id: string
  /** gross_motor=大运动练习 fine_motor=精细运动练习 edu_play=亲子早教互动 outdoor=户外活动 daily_care=日常护理 other=其他活动 */
  activity_type: ActivityType
  record_time: string       // ISO 8601
  /** 活动时长（分钟） */
  duration_min?: number
  /** 活动强度 */
  intensity?: ActivityIntensity
  note?: string
}

export type UpdateActivityDto = Partial<Omit<CreateActivityDto, 'baby_id'>>

export interface ActivityRecord extends RecordBase {
  activity_type: ActivityType
  record_time: string
  duration_min?: number | null
  intensity?: ActivityIntensity | null
}

// ── Health ───────────────────────────────────────────────────────

/**
 * 情绪状态（DDL: symptom_record.mood VARCHAR(20)）
 * Migration 008: health_record.mood 字段已删除，情绪统一由 symptom_record 记录
 */
export type MoodType = 'happy' | 'neutral' | 'fussy' | 'crying'

/** 过敏严重程度 */
export type AllergySeverity = 'mild' | 'moderate' | 'severe'

/** 用药条目 */
export interface HealthMedicationItem {
  name: string
  dose?: string
}

export interface CreateHealthDto {
  baby_id: string
  record_time: string       // ISO 8601
  /** 体温（℃），正常范围 35~42，如 37.5 */
  temperature?: number
  /**
   * @deprecated Migration 008 已删除 health_record.mood，保留局部兼容，后端已忽略此字段
   * 情绪统一由 symptom_record.mood 记录
   */
  mood?: MoodType
  /** 过敏症状列表，如 ["荨麻疹", "血便"] */
  allergy_symptoms?: string[]
  /** 过敏严重程度 */
  allergy_severity?: AllergySeverity
  /** 用药列表，如 [{ name: "维生素D", dose: "400IU" }] */
  medications?: HealthMedicationItem[]
  /** 护理项目列表，如 ["已做保湿", "涂抹面霜"] */
  skin_care?: string[]
  note?: string
}

export type UpdateHealthDto = Partial<Omit<CreateHealthDto, 'baby_id'>>

export interface HealthRecord extends RecordBase {
  record_time: string
  temperature?: number | null
  /** @deprecated Migration 008 已删除 health_record.mood，后端不再返回此字段 */
  mood?: MoodType | null
  allergy_symptoms?: string[] | null
  allergy_severity?: AllergySeverity | null
  medications?: HealthMedicationItem[] | null
  skin_care?: string[] | null
}

// ── Growth ───────────────────────────────────────────────────────

export interface CreateGrowthDto {
  baby_id: string
  record_date: string       // YYYY-MM-DD（每日唯一索引）
  /** 测量时间 HH:mm，不传则为 NULL */
  record_time?: string
  /** 身高，毫米整数（前端 cm × 10 后传入），范围 300~1500 */
  height_mm?: number
  /** 体重，克整数（前端 kg × 1000 后传入），范围 500~30000 */
  weight_g?: number
  /** 头围，毫米整数（前端 cm × 10 后传入），范围 250~600 */
  head_mm?: number
  note?: string
}

export type UpdateGrowthDto = Partial<Omit<CreateGrowthDto, 'baby_id'>>

export interface GrowthRecord extends RecordBase {
  record_date: string
  /** 测量时间 HH:mm（可能为 NULL） */
  record_time?: string | null
  height_mm?: number | null
  weight_g?: number | null
  head_mm?: number | null
}

// ── Medical ──────────────────────────────────────────────────────

/**
 * 就诊类型（DDL: medical_record.visit_type VARCHAR(20)）
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

export type UpdateMedicalDto = Partial<Omit<CreateMedicalDto, 'baby_id'>>

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

/** 精神状态 */
export type SpiritLevel = 'active' | 'normal' | 'tired' | 'lethargic'

/** 情绪状态 */
export type MoodLevel = 'happy' | 'neutral' | 'fussy' | 'crying'

export interface CreateSymptomDto {
  baby_id: string
  record_time: string       // ISO 8601
  /**
   * 症状列表，如 [{ type: 3, severity: 2 }] 表示"发烧-中度"
   * DDL: symptom_record.symptoms JSON
   */
  symptoms: SymptomItem[]
  /** 精神状态（DDL: spirit VARCHAR(20)） */
  spirit?: SpiritLevel
  /** 情绪状态（DDL: mood VARCHAR(20)） */
  mood?: MoodLevel
  /** 照片 fileID 列表，DDL: photo_ids JSON */
  photo_ids?: string[]
  note?: string
}

export interface UpdateSymptomDto {
  record_time?: string
  symptoms?: SymptomItem[]
  spirit?: SpiritLevel
  mood?: MoodLevel
  photo_ids?: string[]
  note?: string
}

export interface SymptomRecord extends RecordBase {
  record_time: string
  symptoms: SymptomItem[]
  spirit?: SpiritLevel | null
  mood?: MoodLevel | null
  photo_ids?: string[] | null
}

// ── Today Timeline ────────────────────────────────────────────────

export interface TodayRecord {
  type: string
  id: string
  time: string
  note?: string | null
  /**
   * 各记录类型的关键摘要字段（由后端 JSON_OBJECT 生成）
   *
   * feeding(breast):     feed_type / breast_side / duration_min
   * feeding(formula):    feed_type / formula_ml
   * feeding(food):       feed_type
   * feeding(supplement): feed_type / supplement_items
   * sleep:               duration_min / sleep_period / quality / status
   * diaper:              diaper_type / poop_type / diaper_count
   * activity:            activity_type / duration_min / intensity
   * health:              temperature（mood 已删除）
   * symptom:             spirit / mood
   * growth:              height_mm / weight_g / head_mm
   * medical:             hospital / diagnosis
   */
  detail?: Record<string, unknown> | null
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