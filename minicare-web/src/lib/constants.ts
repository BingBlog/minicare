/**
 * 全局业务常量配置
 * 将各页面散落的重复配置对象统一收口，避免跨文件维护不一致
 */
import type { AllergyLevel, AllergyType } from '@/api/types'

// ────────────────────────────────────────────────────────────────────────────
// 记录类型配置
// ────────────────────────────────────────────────────────────────────────────

/**
 * 记录类型的视觉配置
 * bg    - 图标背景色
 * color - 图标前景（stroke）色
 * label - 中文标签
 *
 * 注意：icon 字段由组件层按需引入（避免常量层依赖 React）
 */
export interface RecordTypeCfg {
  label: string
  bg: string
  color: string
}

export const RECORD_TYPE_CFG: Record<string, RecordTypeCfg> = {
  feeding:  { label: '饮食', bg: '#FFF0F4', color: '#F0B8C8' },
  sleep:    { label: '睡眠', bg: '#EDFCF7', color: '#4CAF82' },
  diaper:   { label: '尿布', bg: '#E8F5E9', color: '#4CAF82' },
  activity: { label: '活动', bg: '#FFF8E6', color: '#DDB870' },
  health:   { label: '健康', bg: '#FFF0F4', color: '#E8507A' },
  growth:   { label: '生长', bg: '#F3F0FF', color: '#9B8ED8' },
  symptom:  { label: '表现', bg: '#FFF0F4', color: '#F0B8C8' },
  medical:  { label: '医疗', bg: '#F0F4FF', color: '#5B9BD5' },
}

/**
 * 快捷记录宫格的路由映射
 * key - 与 RECORD_TYPE_CFG 保持一致
 */
export const RECORD_ROUTES: Record<string, string> = {
  feeding:  '/records/form/feeding',
  sleep:    '/records/form/sleep',
  diaper:   '/records/form/diaper',
  activity: '/records/form/activity',
  growth:   '/records/form/growth',
  health:   '/records/form/health',
  medical:  '/records/form/medical',
  symptom:  '/records/form/symptom',
}

// ────────────────────────────────────────────────────────────────────────────
// 快捷记录宫格配置（首页 4x2 宫格，按顺序展示）
// ────────────────────────────────────────────────────────────────────────────
export const QUICK_ACTION_KEYS = [
  'feeding', 'diaper', 'sleep', 'activity',
  'growth', 'health', 'medical', 'symptom',
] as const

/**
 * FAB 底部弹层额外副标题
 * 描述每个记录模块的具体内容，用于新增记录引导
 */
export const FAB_SUBTITLES: Record<string, string> = {
  feeding:  '喂奶 · 辅食 · 营养素',
  sleep:    '计时模式 · 补录模式',
  activity: '爬走练习 · 视力活动 · 户外活动',
  diaper:   '大便次数性状 · 小便次数',
  health:   '过敏表现 · 用药 · 护理',
  symptom:  '心情状态 · 精神状态',
  growth:   '身高 · 体重 · 头围',
  medical:  '儿保 · 过敏检查 · 就诊',
}

// ────────────────────────────────────────────────────────────────────────────
// 过敏相关标签
// ────────────────────────────────────────────────────────────────────────────

/** 过敏原类型 → 中文展示名 */
export const ALLERGY_TYPE_LABELS: Record<AllergyType, string> = {
  milk:      '牛奶蛋白',
  egg:       '鸡蛋',
  wheat:     '小麦/麸质',
  peanut:    '花生',
  tree_nut:  '坚果',
  soy:       '大豆',
  fish:      '鱼类',
  shellfish: '贝类',
  other:     '其他',
}

/** 过敏程度 → 中文展示名 */
export const ALLERGY_LEVEL_LABELS: Record<AllergyLevel, string> = {
  mild:     '轻度',
  moderate: '中度',
  severe:   '重度',
  unknown:  '未知程度',
}

/** 全量过敏原类型列表（用于多选渲染） */
export const ALL_ALLERGY_TYPES: AllergyType[] = [
  'milk', 'egg', 'wheat', 'peanut', 'tree_nut', 'soy', 'fish', 'shellfish', 'other',
]

/** 过敏程度选项配置（含激活颜色） */
export const ALLERGY_LEVEL_OPTIONS: { value: AllergyLevel; label: string; activeColor: string }[] = [
  { value: 'mild',     label: '轻度', activeColor: '#4CAF82' },
  { value: 'moderate', label: '中度', activeColor: '#DDB870' },
  { value: 'severe',   label: '重度', activeColor: '#F05060' },
  { value: 'unknown',  label: '未知', activeColor: '#9A8090' },
]

// ────────────────────────────────────────────────────────────────────────────
// 家庭成员角色配置
// ────────────────────────────────────────────────────────────────────────────

/**
 * 角色 ID → 中文名称
 * 1 = owner（创建者）
 * 2 = editor（编辑者）
 * 3 = viewer（查看者）
 */
export const ROLE_TEXT: Record<number, string> = {
  1: '创建者',
  2: '编辑者',
  3: '查看者',
}

/** 角色 → 头像背景渐变/颜色 */
export const ROLE_AVATAR_STYLE: Record<number, React.CSSProperties> = {
  1: { background: 'linear-gradient(135deg, #F9A8C0, #F87098)', boxShadow: '0 2px 8px rgba(248,112,152,.3)' },
  2: { background: '#EEF6FF' },
  3: { background: '#F5F0F2' },
}

/** 角色 → 徽章背景/前景色 */
export const ROLE_BADGE_STYLE: Record<number, React.CSSProperties> = {
  1: { background: '#FFF0F4', color: '#F87098' },
  2: { background: '#EEF6FF', color: '#4A90D9' },
  3: { background: '#F5F0F2', color: '#9A8090' },
}

/** 角色 → 头像图标 stroke 颜色 */
export const ROLE_ICON_COLOR: Record<number, string> = {
  1: '#fff',
  2: '#4A90D9',
  3: '#9A8090',
}

// ────────────────────────────────────────────────────────────────────────────
// 时间线各记录类型枚举标签（统一收口，TodayTimeline / utils.ts 共用）
// ────────────────────────────────────────────────────────────────────────────

/** 奶粉类型 key → 中文名（由 milkTypeOptions 在 utils.ts 层派生，此处不重复定义） */

/** 睡眠时段 */
export const SLEEP_PERIOD_LABELS: Record<string, string> = {
  night:         '夜觉',
  morning_nap:   '上午觉',
  afternoon_nap: '下午觉',
  other:         '其他',
}

/** 睡眠质量 */
export const SLEEP_QUALITY_LABELS: Record<string, string> = {
  good:   '质量好',
  normal: '一般',
  poor:   '较差',
}

/** 尿布类型 */
export const DIAPER_TYPE_LABELS: Record<string, string> = {
  wet:   '小便',
  dirty: '大便',
  mixed: '混合',
  dry:   '干净',
}

/** 大便性状 */
export const POOP_TYPE_LABELS: Record<string, string> = {
  normal_soft:  '正常软便',
  loose:        '稀便',
  watery:       '水样便',
  hard:         '干硬粒',
  bloody:       '血丝便',
  normal_form:  '正常成形',
}

/** 活动类型 */
export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  bath:       '洗澡',
  outdoor:    '户外活动',
  play:       '玩耍',
  tummy_time: '俯趴练习',
  other:      '其他活动',
}

/** 活动强度 */
export const ACTIVITY_INTENSITY_LABELS: Record<string, string> = {
  easy:   '轻松',
  medium: '适中',
  active: '活跃',
}

/** 情绪 */
export const MOOD_LABELS: Record<string, string> = {
  happy:   '开心',
  neutral: '平静',
  fussy:   '烦躁',
  crying:  '哭闹',
}

/** 精神状态 */
export const SPIRIT_LABELS: Record<string, string> = {
  active:    '精神活跃',
  normal:    '精神正常',
  tired:     '有点累',
  lethargic: '萎靡',
}

/** 就诊类型 */
export const VISIT_TYPE_LABELS: Record<string, string> = {
  checkup: '常规体检',
  allergy: '过敏专科',
  sick:    '生病就诊',
  vaccine: '疫苗接种',
  blood:   '血液检查',
  other:   '就诊',
}

// ────────────────────────────────────────────────────────────────────────────
// 报告模块
// ────────────────────────────────────────────────────────────────────────────

/** 报告时间范围选项 */
export const REPORT_RANGE_OPTIONS = [
  { key: '7',      label: '7天'   },
  { key: '14',     label: '14天'  },
  { key: '30',     label: '30天'  },
  { key: 'custom', label: '自定义' },
] as const

/** 设计系统主色调 */
export const BRAND_GRADIENT = 'linear-gradient(90deg, #F87098, #F9A8C0)'
export const BRAND_COLOR     = '#F87098'
export const BRAND_LIGHT_BG  = '#FFF0F4'
