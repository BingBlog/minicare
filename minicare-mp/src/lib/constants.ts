export interface RecordTypeCfg {
  label: string
  bg: string
  color: string
}

export const RECORD_TYPE_CFG: Record<string, RecordTypeCfg> = {
  feeding: { label: '饮食', bg: '#FFF0F4', color: '#F0B8C8' },
  formula: { label: '配方奶', bg: '#FFF0F4', color: '#F87098' },
  breast: { label: '母乳', bg: '#FFF5F8', color: '#E8507A' },
  food: { label: '辅食', bg: '#FFF8E6', color: '#DDB870' },
  sleep: { label: '睡眠', bg: '#EDFCF7', color: '#4CAF82' },
  diaper: { label: '尿布', bg: '#E8F5E9', color: '#4CAF82' },
  activity: { label: '活动', bg: '#FFF8E6', color: '#DDB870' },
  health: { label: '健康', bg: '#FFF0F4', color: '#E8507A' },
  temperature: { label: '体温', bg: '#FFF0F4', color: '#E8507A' },
  growth: { label: '生长', bg: '#F3F0FF', color: '#9B8ED8' },
  symptom: { label: '表现', bg: '#FFF0F4', color: '#F0B8C8' },
  medical: { label: '医疗', bg: '#F0F4FF', color: '#5B9BD5' },
  supplement: { label: '营养素', bg: '#F0F8FF', color: '#4A90D9' },
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

export const DEFAULT_QUICKACTION_KEYS_BY_AGE: Record<string, string[]> = {
  '0-5m': ['formula', 'breast', 'diaper', 'sleep', 'temperature', 'symptom', 'supplement'],
  '6-11m': ['formula', 'breast', 'food', 'diaper', 'sleep', 'temperature', 'symptom'],
  '12m+': ['food', 'breast', 'formula', 'sleep', 'diaper', 'temperature', 'symptom'],
}
