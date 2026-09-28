/**
 * 日期工具（Dashboard / 记录列表共用）
 * 使用本地时区 YYYY-MM-DD，与后端 Feed date 参数一致。
 */

/** 返回今日日期字符串 YYYY-MM-DD（本地时区） */
export function getTodayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 将 YYYY-MM-DD 偏移 n 天 */
export function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 将 YYYY-MM-DD 格式化为中文展示（今天/昨天/前天/M月D日） */
export function formatDateLabel(dateStr: string): string {
  const today = getTodayStr()
  if (dateStr === today) return '今天'
  if (dateStr === offsetDate(today, -1)) return '昨天'
  if (dateStr === offsetDate(today, -2)) return '前天'
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export interface QuickDateOption {
  label: string
  value: string | null
}

/** Dashboard：今天 / 昨天 / 前天 */
export function buildDashboardDateOptions(): QuickDateOption[] {
  const todayStr = getTodayStr()
  return [
    { label: '今天', value: todayStr },
    { label: '昨天', value: offsetDate(todayStr, -1) },
    { label: '前天', value: offsetDate(todayStr, -2) },
  ]
}

/** 记录列表：全部 + 今天 / 昨天 / 前天 */
export function buildRecordsListDateOptions(): QuickDateOption[] {
  const todayStr = getTodayStr()
  return [
    { label: '全部', value: null },
    { label: '今天', value: todayStr },
    { label: '昨天', value: offsetDate(todayStr, -1) },
    { label: '前天', value: offsetDate(todayStr, -2) },
  ]
}

/** 记录列表日期按钮文案 */
export function formatRecordsListDateLabel(dateFilter: string | null): string {
  if (!dateFilter) return '全部'
  return formatDateLabel(dateFilter)
}
