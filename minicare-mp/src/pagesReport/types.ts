export type TabKey = 'feeding' | 'diaper' | 'growth' | 'sleep' | 'health' | 'allergy'

export const TAB_CONFIG: Array<{ key: TabKey; label: string }> = [
  { key: 'growth', label: '生长' },
  { key: 'feeding', label: '饮食' },
  { key: 'sleep', label: '睡眠' },
  { key: 'diaper', label: '尿布' },
  { key: 'health', label: '健康' },
  { key: 'allergy', label: '排敏' },
]

export const TIME_RANGES: Array<{ key: string; label: string; days: number }> = [
  { key: '7', label: '7天', days: 7 },
  { key: '14', label: '14天', days: 14 },
  { key: '30', label: '30天', days: 30 },
  { key: '90', label: '90天', days: 90 },
  { key: '180', label: '半年', days: 180 },
  { key: '365', label: '一年', days: 365 },
]

export const DEFAULT_RANGE_MAP: Record<TabKey, string> = {
  feeding: '30',
  diaper: '30',
  growth: 'birth',
  sleep: '30',
  health: '180',
  allergy: '30',
}

export const LONG_RANGE_LABEL: Record<string, string> = {
  '90': '近3个月',
  '180': '近半年',
  '365': '近一年',
}
