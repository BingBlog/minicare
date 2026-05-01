import dayjs from 'dayjs'

export function formatTime(iso: string): string {
  if (!iso) return ''
  return dayjs(iso).format('HH:mm')
}

/** 从记录中提取可排序的时间字段（与 Web getRecordTime 完全一致） */
export function getRecordTime(rec: Record<string, unknown>): string {
  const recordTime = rec.record_time as string | undefined
  if (recordTime && recordTime.includes('-')) return recordTime
  const time = rec.time as string | undefined
  if (time && time.includes('-')) return time
  const startTime = rec.startTime as string | undefined
  if (startTime && startTime.includes('-')) return startTime
  const start_time = rec.start_time as string | undefined
  if (start_time && start_time.includes('-')) return start_time
  const recordDate = rec.record_date as string | undefined
  if (recordDate) return recordDate
  const visitDate = rec.visit_date as string | undefined
  if (visitDate) return visitDate
  return (rec.created_at as string) ?? ''
}

/** 返回 HH:mm 展示时间（含纯时间字符串兼容） */
export function getDisplayTime(rec: Record<string, unknown>): string {
  const recordTime = rec.record_time as string | undefined
  if (recordTime && !recordTime.includes('-')) {
    return recordTime.length >= 5 ? recordTime.slice(0, 5) : recordTime
  }
  return formatTime(getRecordTime(rec))
}

/** 转换为 "YYYY-M-D" 日期分组 key */
export function getDateKey(iso: string): string {
  if (!iso) return ''
  return dayjs(iso).format('YYYY-M-D')
}

/** 日期展示标签：今天/昨天 + 中文日期 */
export function getDateLabel(iso: string): string {
  if (!iso) return ''
  const d = dayjs(iso).startOf('day')
  const today = dayjs().startOf('day')
  const diff = today.diff(d, 'day')
  const datePart = d.format('YYYY年M月D日')
  if (diff === 0) return `${datePart} · 今天`
  if (diff === 1) return `${datePart} · 昨天`
  return datePart
}

/** 从记录中提取 type 字段 */
export function getRecordType(rec: { type?: string }): string {
  return rec.type ?? ''
}

export function getGreeting(): string {
  const h = dayjs().hour()
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function getTodayDateStr(): string {
  const now = dayjs()
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.day()]
  return `${now.month() + 1}月${now.date()}日 星期${weekday}`
}

export function timeAgo(isoStr: string): string {
  const now = dayjs()
  const target = dayjs(isoStr)
  const days = now.diff(target, 'day')
  if (days >= 1) return `${days}天前`
  const hours = now.diff(target, 'hour')
  if (hours >= 1) return `${hours}小时前`
  return '刚刚'
}

export function getBabyAge(birthDate: string): string {
  const birth = dayjs(birthDate).startOf('day')
  const now = dayjs().startOf('day')
  const totalDays = now.diff(birth, 'day')
  let months = now.diff(birth, 'month')
  const monthMark = birth.add(months, 'month')
  if (now.isBefore(monthMark)) months -= 1
  const remainDays = now.diff(birth.add(months, 'month'), 'day')
  if (months < 1) return `${totalDays}天`
  if (months < 12) return `${months}个月${remainDays}天`
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  return `${years}岁${remMonths > 0 ? `${remMonths}个月` : ''}`
}

/** 当前本地日期，格式 YYYY-MM-DD */
export function nowDate(): string {
  return dayjs().format('YYYY-MM-DD')
}

/** 格式化为 M/D */
export function formatDateSlash(dateStr: string): string {
  if (!dateStr) return ''
  return dayjs(dateStr).format('M/D')
}

/** 格式化为 M月D日 */
export function formatDateCN(dateStr: string): string {
  if (!dateStr) return ''
  return dayjs(dateStr).format('M月D日')
}

/** 分钟数格式化为中文时长 */
export function formatDurationMinutes(minutes: number): string {
  const safe = Number.isFinite(minutes) ? Math.round(minutes) : 0
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  if (hours === 0) return `${mins}分钟`
  if (mins === 0) return `${hours}小时`
  return `${hours}小时${mins}分钟`
}

/** 月龄格式化 */
export function formatAgeMonths(ageMonths: number): string {
  const n = Math.round(ageMonths * 10) / 10
  return Number.isInteger(n) ? `${n}月龄` : `${n.toFixed(1)}月龄`
}

/** 返回时间戳字符串（YYYY-MM-DD HH:mm:ss）供后端日志 */
export function timeToISO(dateStr: string, timeStr?: string): string {
  if (!dateStr) return ''
  if (timeStr) return `${dateStr}T${timeStr}:00`
  return dayjs(dateStr).format('YYYY-MM-DDTHH:mm:ss')
}
