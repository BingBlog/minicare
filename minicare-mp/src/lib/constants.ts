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
  sleep_start: { label: '开始睡觉', bg: '#EAEDFF', color: '#4358C8' },
  sleep_end: { label: '醒来', bg: '#EAEDFF', color: '#4358C8' },
  diaper: { label: '尿布', bg: '#E4F6FD', color: '#2A9ED4' },
  activity: { label: '活动', bg: '#FFF3E0', color: '#E07A00' },
  health: { label: '健康', bg: '#FFE8EF', color: '#D42060' },
  allergy: { label: '过敏表现', bg: '#FFE8EF', color: '#D42060' },
  temperature: { label: '体温', bg: '#FFE8EF', color: '#E03050' },
  growth: { label: '生长', bg: '#E4F8F0', color: '#2A9E70' },
  symptom: { label: '表现', bg: '#FFF9E0', color: '#E8960A' },
  medical: { label: '医疗', bg: '#E6EEFF', color: '#2E60C8' },
  medication: { label: '用药', bg: '#F0EFFF', color: '#6C5CE7' },
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
  'allergy',
  'growth',
  'medical',
  'medication',
] as const

export const GLOBAL_FAB_GROUPS: { label: string; keys: string[] }[] = [
  { label: '喂食', keys: ['formula', 'breast', 'food'] },
  { label: '日常护理', keys: ['diaper', 'sleep', 'temperature', 'symptom'] },
  { label: '日常补录', keys: ['supplement', 'activity'] },
  { label: '健康档案', keys: ['allergy', 'growth', 'medical', 'medication'] },
]

export const FAB_GROUPS: { label: string; keys: string[] }[] = [
  { label: '日常补录', keys: ['supplement', 'activity'] },
  { label: '健康档案', keys: ['allergy', 'growth', 'medical', 'medication'] },
]

export const DEFAULT_QUICKACTION_KEYS_BY_AGE: Record<string, string[]> = {
  '0-5m': ['formula', 'breast', 'diaper', 'sleep', 'temperature', 'symptom', 'supplement', 'activity'],
  '6-11m': ['formula', 'breast', 'food', 'diaper', 'sleep', 'temperature', 'symptom', 'medication'],
  '12m+': ['food', 'breast', 'formula', 'sleep', 'diaper', 'temperature', 'medication', 'activity'],
}

export const FAB_SUBTITLES: Record<string, string> = {
  formula: '奶量 · 奶粉类型 · 配比',
  breast: '哺乳侧 · 时长',
  food: '辅食种类 · 进食情况',
  sleep: '计时模式 · 补录模式',
  activity: '大运动 · 精细运动 · 户外活动',
  diaper: '大便次数性状 · 小便次数',
  allergy: '皮疹 · 腹泻 · 呼吸急促等表现',
  temperature: '快速记录宝宝体温',
  supplement: '维生素D · 铁剂 · 益生菌 · 钙剂',
  symptom: '精神状态 · 心情状态',
  growth: '身高 · 体重 · 头围',
  medical: '儿保 · 过敏检查 · 就诊',
  medication: '常用药清单 · 单次服药打卡',
}

/** Home 页内记录入口的目标路由（与 web RECORD_ROUTES 对齐）。 */
export const HOME_RECORD_ROUTES: Record<string, string> = {
  formula: '/records/form/feeding?tab=formula',
  breast: '/records/form/feeding?tab=breast',
  food: '/records/form/feeding?tab=food',
  supplement: '/records/form/feeding?tab=supplement',
  sleep: '/records/form/sleep',
  sleep_start: '/records/form/sleep',
  sleep_end: '/records/form/sleep',
  diaper: '/records/form/diaper',
  activity: '/records/form/activity',
  allergy: '/records/form/allergy',
  temperature: '/records/form/temperature',
  growth: '/records/form/growth',
  medical: '/records/form/medical',
  symptom: '/records/form/symptom',
  medication: '/records/form/medication',
}

/**
 * 已迁移的 Web 路由 → MP 页面路径直接映射。
 * 在此表中的路由将直接跳转到 MP 页面，不再经过 records 分发器中间页。
 * 未在此表中的路由仍然走 /pages/records/index?target= 兜底。
 */
export const HOME_RECORD_MP_ROUTES: Record<string, string> = {
  '/records': '/pages/records/list/index',
  '/records/form/feeding': '/pages/records/feeding/index',
  '/records/form/diaper': '/pages/records/diaper/index',
  '/records/form/sleep': '/pages/records/sleep/index',
  '/records/form/growth': '/pages/records/growth/index',
  '/records/form/medical': '/pages/records/medical/index',
  '/records/form/allergy': '/pages/records/health/allergy/index',
  '/records/form/temperature': '/pages/records/health/temperature/index',
  '/records/form/activity': '/pages/records/activity/index',
  '/records/form/symptom': '/pages/records/symptom/index',
  '/records/form/medication': '/pages/records/medication/index',
}

export const SLEEP_PERIOD_LABELS: Record<string, string> = {
  night: '夜觉',
  morning_nap: '上午觉',
  afternoon_nap: '下午觉',
  other: '傍晚觉',
}

export const SLEEP_QUALITY_LABELS: Record<string, string> = {
  good: '良好',
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
  checkup: '儿保检查',
  sick: '就诊记录',
  vaccine: '疫苗接种',
  other: '其他检查',
  // 已废弃类型（2026-08-22 精简），仅用于老数据列表展示
  allergy: '过敏原检测',
  blood: '血液检查',
}

/** 过敏程度选项配置（含激活颜色） */
export const ALLERGY_LEVEL_OPTIONS: { value: string; label: string; activeColor: string }[] = [
  { value: 'mild',     label: '轻度', activeColor: '#4CAF82' },
  { value: 'moderate', label: '中度', activeColor: '#DDB870' },
  { value: 'severe',   label: '重度', activeColor: '#F05060' },
  { value: 'unknown',  label: '未知', activeColor: '#9A8090' },
]

/** 角色 -> 中文名称 */
export const ROLE_TEXT: Record<string, string> = {
  owner:  '创建者',
  member: '成员',
}

/** 角色 -> 头像背景颜色 */
export const ROLE_AVATAR_BG: Record<string, string> = {
  owner:  'linear-gradient(135deg, #F9A8C0, #F87098)',
  member: '#EEF6FF',
}

/** 角色 -> 头像盒子阴影（仅 owner） */
export const ROLE_AVATAR_SHADOW: Record<string, string> = {
  owner:  '0 2px 8px rgba(248,112,152,.3)',
  member: '',
}

/** 角色 -> 徽章背景色 */
export const ROLE_BADGE_BG: Record<string, string> = {
  owner:  '#FFF0F4',
  member: '#EEF6FF',
}

/** 角色 -> 徽章文字色 */
export const ROLE_BADGE_COLOR: Record<string, string> = {
  owner:  '#F87098',
  member: '#4A90D9',
}

/** 角色 -> 头像图标 stroke 颜色 */
export const ROLE_ICON_COLOR: Record<string, string> = {
  owner:  '#fff',
  member: '#4A90D9',
}

export const OBSERVATION_STATUS_LABELS: Record<string, string> = {
  observing: '观察中',
  paused: '已停用',
  safe: '已耐受',
  suspected: '疑似过敏',
  allergic: '确认过敏',
}

export const OBSERVATION_STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  observing: { label: '观察中', bg: '#FFF8EC', color: '#DDB870' },
  paused: { label: '已停用', bg: '#F5F0F2', color: '#9A8090' },
  safe: { label: '已耐受', bg: '#E4F8F0', color: '#2A9E70' },
  suspected: { label: '疑似过敏', bg: '#FFF3E0', color: '#E07A00' },
  allergic: { label: '确认过敏', bg: '#FFE8EF', color: '#E8305A' },
}

export const REACTION_LEVEL_LABELS: Record<string, string> = {
  none: '无反应',
  mild: '轻度',
  moderate: '中度',
  severe: '重度',
}

export const REACTION_FLAGS_LABELS: Record<string, string> = {
  rash: '皮疹',
  vomit: '呕吐',
  diarrhea: '腹泻',
  blood_stool: '血便',
  wheeze: '喘息',
  face_swelling: '面部肿胀',
  other: '其他',
}
