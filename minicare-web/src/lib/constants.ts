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
  feeding:     { label: '饮食',   bg: '#FFE8EF', color: '#E8305A' },
  formula:     { label: '配方奶', bg: '#FFF4E6', color: '#D4720A' },  // 奶粉罐暖橙色
  breast:      { label: '母乳',   bg: '#FDEDF3', color: '#C4185A' },
  food:        { label: '辅食',   bg: '#FFF3D6', color: '#D4780A' },  // 辅食橙黄
  sleep:       { label: '睡眠',   bg: '#EAEDFF', color: '#4358C8' },  // 深靛蓝，夜空/月亮
  diaper:      { label: '尿布',   bg: '#E4F6FD', color: '#2A9ED4' },  // 天蓝，宝宝/清洁
  activity:    { label: '活动',   bg: '#FFF3E0', color: '#E07A00' },  // 活泼橙
  health:      { label: '健康',   bg: '#FFE8EF', color: '#D42060' },
  temperature: { label: '体温',   bg: '#FFE8EF', color: '#E03050' },
  growth:      { label: '生长',   bg: '#E4F8F0', color: '#2A9E70' },  // 生命绿，成长/身高
  symptom:     { label: '表现',   bg: '#FFF9E0', color: '#E8960A' },  // 暖黄，笑脸/情绪
  medical:     { label: '医疗',   bg: '#E6EEFF', color: '#2E60C8' },
  supplement:  { label: '营养素', bg: '#FFF8E0', color: '#E8A000' },  // 亮金黄，维生素 AD 滴剂色
}

/**
 * 快捷记录宫格的路由映射
 * key - 与 RECORD_TYPE_CFG 保持一致
 */
export const RECORD_ROUTES: Record<string, string> = {
  feeding:     '/records/form/feeding',
  formula:     '/records/form/feeding',
  breast:      '/records/form/feeding',
  food:        '/records/form/feeding',
  sleep:       '/records/form/sleep',
  diaper:      '/records/form/diaper',
  activity:    '/records/form/activity',
  growth:      '/records/form/growth',
  health:      '/records/form/health',
  temperature: '/records/form/health',
  medical:     '/records/form/medical',
  symptom:     '/records/form/symptom',
  supplement:  '/records/form/feeding',
}

// ────────────────────────────────────────────────────────────────────────────
// 快捷记录分区配置（首页双区分层布局）
// ────────────────────────────────────────────────────────────────────────────

/**
 * A区：喂食核心卡片（3列大卡片，展示上次记录摘要）
 * 超高频 · 行为记录 · 即时性极强
 */
export const QUICK_ACTION_A_KEYS = [
  'formula', 'breast', 'food',
] as const

/**
 * B区：即时护理格子（4列小格子）
 * 高频/偶发高紧迫 · 需要快速触达
 */
export const QUICK_ACTION_B_KEYS = [
  'diaper', 'sleep', 'temperature', 'symptom',
] as const

/**
 * FAB 弹层分组配置（C区：计划/存档类功能）
 * 每组含 label（分组标题）和 keys（功能列表）
 * 用于首页「更多」弹层（精简版，仅展示 C 区功能）
 */
export const FAB_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: '日常补录',
    keys: ['supplement', 'activity'],
  },
  {
    label: '健康档案',
    keys: ['health', 'growth', 'medical'],
  },
]

/**
 * 全局完整版分组配置（导航栏「+」弹层使用）
 * 覆盖全部 4 个分组（喂食/日常护理/日常补录/健康档案），共 11 项
 * 用户可通过导航栏「+」找到所有记录类型
 */
export const GLOBAL_FAB_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: '喂食',
    keys: ['formula', 'breast', 'food'],
  },
  {
    label: '日常护理',
    keys: ['diaper', 'sleep', 'temperature', 'symptom'],
  },
  {
    label: '日常补录',
    keys: ['supplement', 'activity'],
  },
  {
    label: '健康档案',
    keys: ['health', 'growth', 'medical'],
  },
]

/**
 * 全部可选的快捷入口 key（共 11 项，编辑模式下格子库展示范围）
 */
export const ALL_QUICK_ACTION_KEYS = [
  'formula', 'breast', 'food',
  'diaper', 'sleep', 'temperature', 'symptom',
  'supplement', 'activity',
  'health', 'growth', 'medical',
] as const

/**
 * 月龄默认快捷入口配置（首次进入时根据宝宝月龄写入，共 7 个 key）
 * 前 3 个 = A区（大卡片），后 4 个 = B区（格子）
 */
export const DEFAULT_QUICKACTION_KEYS_BY_AGE: Record<string, string[]> = {
  '0-5m':  ['formula', 'breast', 'diaper',  'sleep', 'temperature', 'symptom', 'supplement'],
  '6-11m': ['formula', 'breast', 'food',    'diaper', 'sleep', 'temperature', 'symptom'],
  '12m+':  ['food',    'breast', 'formula', 'sleep', 'diaper', 'temperature', 'symptom'],
}

/**
 * FAB 底部弹层额外副标题
 * 描述每个记录模块的具体内容，用于新增记录引导
 */
export const FAB_SUBTITLES: Record<string, string> = {
  feeding:     '喂奶 · 辅食 · 营养素',
  formula:     '奶量 · 奶粉类型 · 配比',
  breast:      '哺乳侧 · 时长',
  food:        '辅食种类 · 进食情况',
  sleep:       '计时模式 · 补录模式',
  activity:    '大运动 · 精细运动 · 户外活动',
  diaper:      '大便次数性状 · 小便次数',
  health:      '体温 · 过敏表现 · 护理',
  temperature: '快速记录宝宝体温',
  supplement:  '维生素D · 铁剂 · 益生菌 · 钙剂',
  symptom:     '精神状态 · 心情状态',
  growth:      '身高 · 体重 · 头围',
  medical:     '儿保 · 过敏检查 · 就诊',
}

// ────────────────────────────────────────────────────────────────────────────
// 过敏相关标签
// ────────────────────────────────────────────────────────────────────────────

// 以下常量已迁移至后端统一配置接口（GET /api/config），由 useAppConfig().getLabel() 消费
// 保留注释作为历史参考，不要在新代码中直接引用

// /** 过敏原类型 → 中文展示名 */
// export const ALLERGY_TYPE_LABELS: Record<AllergyType, string> = {
//   milk:      '牛奶蛋白',
//   egg:       '鸡蛋',
//   wheat:     '小麦/麸质',
//   peanut:    '花生',
//   tree_nut:  '坚果',
//   soy:       '大豆',
//   fish:      '鱼类',
//   shellfish: '贝类',
//   other:     '其他',
// }

// /** 过敏程度 → 中文展示名 */
// export const ALLERGY_LEVEL_LABELS: Record<AllergyLevel, string> = {
//   mild:     '轻度',
//   moderate: '中度',
//   severe:   '重度',
//   unknown:  '未知程度',
// }

// /** 全量过敏原类型列表（用于多选渲染） */
// export const ALL_ALLERGY_TYPES: AllergyType[] = [
//   'milk', 'egg', 'wheat', 'peanut', 'tree_nut', 'soy', 'fish', 'shellfish', 'other',
// ]

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
 * 角色 → 中文名称
 * Migration 008: family_member.role TINYINT → VARCHAR('owner' | 'member')
 */
export const ROLE_TEXT: Record<string, string> = {
  owner:  '创建者',
  member: '成员',
}

/** 角色 → 头像背景渐变/颜色 */
export const ROLE_AVATAR_STYLE: Record<string, React.CSSProperties> = {
  owner:  { background: 'linear-gradient(135deg, #F9A8C0, #F87098)', boxShadow: '0 2px 8px rgba(248,112,152,.3)' },
  member: { background: '#EEF6FF' },
}

/** 角色 → 徽章背景/前景色 */
export const ROLE_BADGE_STYLE: Record<string, React.CSSProperties> = {
  owner:  { background: '#FFF0F4', color: '#F87098' },
  member: { background: '#EEF6FF', color: '#4A90D9' },
}

/** 角色 → 头像图标 stroke 颜色 */
export const ROLE_ICON_COLOR: Record<string, string> = {
  owner:  '#fff',
  member: '#4A90D9',
}

// ────────────────────────────────────────────────────────────────────────────
// 时间线各记录类型枚举标签（已迁移至后端统一配置接口）
// ────────────────────────────────────────────────────────────────────────────
//
// 以下所有枚举标签常量已迁移至后端 app-config.data.ts，
// 通过 GET /api/config 接口下发，由前端 useAppConfig().getLabel(enumKey, value) 消费。
// 保留注释作为历史参考，不要在新代码中直接引用这些常量。

/** 奶粉类型 key → 中文名（由 milkTypeOptions 在 utils.ts 层派生，此处不重复定义） */

// /** 睡眠时段 */
// export const SLEEP_PERIOD_LABELS: Record<string, string> = {
//   night:         '夜觉',
//   morning_nap:   '上午觉',
//   afternoon_nap: '下午觉',
//   other:         '其他',
// }

// /** 睡眠质量 */
// export const SLEEP_QUALITY_LABELS: Record<string, string> = {
//   good:   '质量好',
//   normal: '一般',
//   poor:   '较差',
// }

// /** 尿布类型 */
// export const DIAPER_TYPE_LABELS: Record<string, string> = {
//   wet:   '小便',
//   dirty: '大便',
//   mixed: '混合',
//   dry:   '干净',
// }

// /** 大便性状 */
// export const POOP_TYPE_LABELS: Record<string, string> = {
//   normal:       '正常',
//   normal_soft:  '正常软便',
//   normal_form:  '正常成形',
//   loose:        '稀便',
//   watery:       '水样便',
//   hard:         '干硬粒',
//   bloody:       '血丝便',
// }

// /** 活动类型 */
// export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
//   gross_motor: '大运动练习',
//   fine_motor:  '精细运动练习',
//   edu_play:    '亲子早教互动',
//   outdoor:     '户外活动',
//   daily_care:  '日常护理',
//   other:       '其他活动',
// }

// /** 活动强度 */
// export const ACTIVITY_INTENSITY_LABELS: Record<string, string> = {
//   easy:   '轻松',
//   medium: '适中',
//   active: '活跃',
// }

// /** 情绪 */
// export const MOOD_LABELS: Record<string, string> = {
//   happy:   '愉悦满足',
//   neutral: '平静舒适',
//   fussy:   '烦躁不开心',
//   crying:  '痛苦哭闹',
// }

// /** 精神状态 */
// export const SPIRIT_LABELS: Record<string, string> = {
//   active:    '状态良好',
//   normal:    '状态良好',
//   tired:     '烦躁不安',
//   lethargic: '萎靡嗜睡',
// }

// /** 就诊类型 */
// export const VISIT_TYPE_LABELS: Record<string, string> = {
//   checkup: '常规体检',
//   allergy: '过敏专科',
//   sick:    '生病就诊',
//   vaccine: '疫苗接种',
//   blood:   '血液检查',
//   other:   '就诊',
// }

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