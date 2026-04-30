export interface RecordTypeCfg {
  label: string
  bg: string
  color: string
}

export const RECORD_TYPE_CFG: Record<string, RecordTypeCfg> = {
  feeding: { label: '饮食', bg: '#FFE8EF', color: '#E8305A' },
  formula: { label: '配方奶', bg: '#FFF4E6', color: '#D4720A' },
  breast: { label: '母乳', bg: '#FDEDF3', color: '#C4185A' },
  food: { label: '辅食', bg: '#FFF3D6', color: '#D4780A' },
  sleep: { label: '睡眠', bg: '#EAEDFF', color: '#4358C8' },
  diaper: { label: '尿布', bg: '#E4F6FD', color: '#2A9ED4' },
  activity: { label: '活动', bg: '#FFF3E0', color: '#E07A00' },
  health: { label: '健康', bg: '#FFE8EF', color: '#D42060' },
  temperature: { label: '体温', bg: '#FFE8EF', color: '#E03050' },
  growth: { label: '生长', bg: '#E4F8F0', color: '#2A9E70' },
  symptom: { label: '表现', bg: '#FFF9E0', color: '#E8960A' },
  medical: { label: '医疗', bg: '#E6EEFF', color: '#2E60C8' },
  supplement: { label: '营养素', bg: '#FFF8E0', color: '#E8A000' },
}

export const ALL_QUICK_ACTION_KEYS = [
  'formula',
  'breast',
  'food',
  'diaper',
  'sleep',
  'temperature',
  'symptom',
  'supplement',
  'activity',
  'health',
  'growth',
  'medical',
] as const

export const GLOBAL_FAB_GROUPS: { label: string; keys: string[] }[] = [
  { label: '喂食', keys: ['formula', 'breast', 'food'] },
  { label: '日常护理', keys: ['diaper', 'sleep', 'temperature', 'symptom'] },
  { label: '日常补录', keys: ['supplement', 'activity'] },
  { label: '健康档案', keys: ['health', 'growth', 'medical'] },
]

export const FAB_GROUPS: { label: string; keys: string[] }[] = [
  { label: '日常补录', keys: ['supplement', 'activity'] },
  { label: '健康档案', keys: ['health', 'growth', 'medical'] },
]

export const DEFAULT_QUICKACTION_KEYS_BY_AGE: Record<string, string[]> = {
  '0-5m': ['formula', 'breast', 'diaper', 'sleep', 'temperature', 'symptom', 'supplement', 'activity'],
  '6-11m': ['formula', 'breast', 'food', 'diaper', 'sleep', 'temperature', 'symptom', 'supplement'],
  '12m+': ['food', 'breast', 'formula', 'sleep', 'diaper', 'temperature', 'symptom', 'activity'],
}

export const FAB_SUBTITLES: Record<string, string> = {
  formula: '奶量 · 奶粉类型 · 配比',
  breast: '哺乳侧 · 时长',
  food: '辅食种类 · 进食情况',
  sleep: '计时模式 · 补录模式',
  activity: '大运动 · 精细运动 · 户外活动',
  diaper: '大便次数性状 · 小便次数',
  health: '体温 · 过敏表现 · 护理',
  temperature: '快速记录宝宝体温',
  supplement: '维生素D · 铁剂 · 益生菌 · 钙剂',
  symptom: '精神状态 · 心情状态',
  growth: '身高 · 体重 · 头围',
  medical: '儿保 · 过敏检查 · 就诊',
}

/** Home 页内记录入口的目标路由（与 web RECORD_ROUTES 对齐）。 */
export const HOME_RECORD_ROUTES: Record<string, string> = {
  formula: '/records/form/feeding?tab=formula',
  breast: '/records/form/feeding?tab=breast',
  food: '/records/form/feeding?tab=food',
  supplement: '/records/form/feeding?tab=supplement',
  sleep: '/records/form/sleep',
  diaper: '/records/form/diaper',
  activity: '/records/form/activity',
  health: '/records/form/health',
  temperature: '/records/form/health?expandTemp=true',
  growth: '/records/form/growth',
  medical: '/records/form/medical',
  symptom: '/records/form/symptom',
}

export const SLEEP_PERIOD_LABELS: Record<string, string> = {
  night: '夜觉',
  morning_nap: '上午觉',
  afternoon_nap: '下午觉',
  other: '其他',
}

export const SLEEP_QUALITY_LABELS: Record<string, string> = {
  good: '质量好',
  normal: '一般',
  poor: '较差',
}

export const POOP_TYPE_LABELS: Record<string, string> = {
  normal: '正常软便',
  loose: '稀便',
  watery: '水样便',
  constipated: '偏硬便',
}

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  bath: '洗澡',
  outdoor: '户外活动',
  play: '玩耍',
  tummy_time: '俯趴练习',
  other: '其他',
}

export const MOOD_LABELS: Record<string, string> = {
  happy: '开心',
  calm: '平静',
  fussy: '烦躁',
  crying: '哭闹',
}

export const SPIRIT_LABELS: Record<string, string> = {
  active: '精神活跃',
  normal: '精神正常',
  tired: '有点累',
  low: '萎靡',
}

export const VISIT_TYPE_LABELS: Record<string, string> = {
  checkup: '常规体检',
  allergy: '过敏专科',
  sick: '生病就诊',
}
