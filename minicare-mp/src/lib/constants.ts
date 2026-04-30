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
