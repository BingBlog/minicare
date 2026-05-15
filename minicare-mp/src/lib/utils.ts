import dayjs from 'dayjs'

// ===========================================================================
// 时间获取
// ===========================================================================

/** 当前本地日期，格式 YYYY-MM-DD */
export function nowDate(): string {
  return dayjs().format('YYYY-MM-DD')
}

/** 当前本地时间，格式 HH:mm */
export function nowTime(): string {
  return dayjs().format('HH:mm')
}

// ===========================================================================
// 时间格式转换（全部基于 dayjs，不使用 new Date）
// ===========================================================================

/** ISO/日期时间字符串 → HH:mm 展示时间 */
export function formatTime(iso: string): string {
  if (!iso) return ''
  return dayjs(iso).format('HH:mm')
}

/** ISO/日期时间字符串 → 本地日期 YYYY-MM-DD */
export function isoToLocalDate(iso: string): string {
  if (!iso) return ''
  return dayjs(iso).format('YYYY-MM-DD')
}

/** ISO/日期时间字符串 → 本地时间 HH:mm（等价于 formatTime，语义更明确） */
export function isoToLocalTime(iso: string): string {
  if (!iso) return ''
  return dayjs(iso).format('HH:mm')
}

/**
 * 日期 + 时间 → 不带时区后缀的本地 ISO 字符串（供后端接收）
 *
 * 输出格式：'YYYY-MM-DDTHH:mm:ss'（不带 Z，后端 toMysqlDatetime 直接提取分量）
 * 注意：绝不使用 .toISOString()，避免 UTC 转换导致 8 小时偏差
 */
export function toLocalISO(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}:00`
}

/** Date 对象 → 不带时区后缀的本地 ISO 字符串 */
export function dateToLocalISO(d: Date): string {
  return dayjs(d).format('YYYY-MM-DDTHH:mm:ss')
}

/** 当前时刻的本地 ISO 字符串（不带 Z） */
export function nowLocalISO(): string {
  return dayjs().format('YYYY-MM-DDTHH:mm:ss')
}

/**
 * 构建入睡/醒来的 ISO 时间对（支持跨日）
 * 返回不带时区后缀的本地时间字符串
 */
export function buildLocalISOPair(
  startDateStr: string,
  startTime: string,
  endDateStr: string,
  endTime: string,
): { startISO: string; endISO: string } {
  return {
    startISO: `${startDateStr}T${startTime}:00`,
    endISO: `${endDateStr}T${endTime}:00`,
  }
}

// ===========================================================================
// 时间计算
// ===========================================================================

/** HH:mm 加减分钟数（纯算术，支持跨日循环） */
export function addMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = ((h * 60 + m + delta) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** 两个 HH:mm 的差值（分钟），跨日时自动 +1440 */
export function timeDiffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let diff = eh * 60 + em - (sh * 60 + sm)
  if (diff < 0) diff += 1440
  return diff
}

/** 根据日期+时间范围计算时长（分钟），基于 dayjs */
export function calcDurationMinFromRange(
  startDateStr: string,
  startTime: string,
  endDateStr: string,
  endTime: string,
): number {
  const start = dayjs(`${startDateStr}T${startTime}:00`)
  const end = dayjs(`${endDateStr}T${endTime}:00`)
  if (!start.isValid() || !end.isValid()) return 0
  return Math.round(end.diff(start, 'minute', true))
}

/** 比较两个时间字符串的先后（用于排序），基于 dayjs */
export function compareTime(a: string, b: string): number {
  return dayjs(a).valueOf() - dayjs(b).valueOf()
}

// ===========================================================================
// 睡眠时段推断
// ===========================================================================

/**
 * 根据入睡时间自动推断睡眠时段（sleep_period）
 *
 * 规则（基于入睡时刻的小时数）：
 *   22:00 ~ 05:59 → night（夜觉）
 *   06:00 ~ 11:59 → morning_nap（上午觉）
 *   12:00 ~ 17:59 → afternoon_nap（下午觉）
 *   18:00 ~ 21:59 → other（傍晚小憩）
 */
export function inferSleepPeriod(startTime: string): 'night' | 'morning_nap' | 'afternoon_nap' | 'other' {
  const hour = dayjs(startTime).hour()
  if (hour >= 22 || hour < 6) return 'night'
  if (hour < 12) return 'morning_nap'
  if (hour < 18) return 'afternoon_nap'
  return 'other'
}

// ===========================================================================
// 日期展示与分组
// ===========================================================================

/** 转换为 "YYYY-M-D" 日期分组 key */
export function getDateKey(iso: string): string {
  if (!iso) return ''
  return dayjs(iso).format('YYYY-M-D')
}

/** 获取今天的日期分组 key */
export function getTodayKey(): string {
  return dayjs().format('YYYY-M-D')
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

// ===========================================================================
// 记录相关时间提取
// ===========================================================================

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

export function getRecordDateForGroup(rec: Record<string, unknown>): string {
  const end_time = rec.end_time as string | undefined
  const status = rec.status as string | undefined
  if (end_time && end_time.includes('-') && status === 'ended') {
    const startSrc = (rec.start_time as string | undefined) ?? (rec.time as string | undefined) ?? ''
    if (startSrc) {
      const startDate = startSrc.slice(0, 10)
      const endDate = end_time.slice(0, 10)
      if (startDate !== endDate) return end_time
    }
  }
  return getRecordTime(rec)
}

/** 返回 HH:mm 展示时间（含纯时间字符串兼容） */
export function getDisplayTime(rec: Record<string, unknown>): string {
  const recordTime = rec.record_time as string | undefined
  if (recordTime && !recordTime.includes('-')) {
    return recordTime.length >= 5 ? recordTime.slice(0, 5) : recordTime
  }
  return formatTime(getRecordTime(rec))
}

/** 从记录中提取 type 字段 */
export function getRecordType(rec: { type?: string }): string {
  return rec.type ?? ''
}

// ===========================================================================
// 时长格式化
// ===========================================================================

/** 分钟数格式化为中文时长 */
export function formatDurationMinutes(minutes: number): string {
  const safe = Number.isFinite(minutes) ? Math.round(minutes) : 0
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  if (hours === 0) return `${mins}分钟`
  if (mins === 0) return `${hours}小时`
  return `${hours}小时${mins}分钟`
}

// ===========================================================================
// 问候语 / 日期文案
// ===========================================================================

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

// ===========================================================================
// 宝宝年龄 / 月龄
// ===========================================================================

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

/** 月龄格式化 */
export function formatAgeMonths(ageMonths: number): string {
  const n = Math.round(ageMonths * 10) / 10
  return Number.isInteger(n) ? `${n}月龄` : `${n.toFixed(1)}月龄`
}

// ===========================================================================
// 兼容别名（保持向后兼容，逐步废弃）
// ===========================================================================

/** @deprecated 使用 toLocalISO 代替 */
export function timeToISO(dateStr: string, timeStr?: string): string {
  if (!dateStr) return ''
  if (timeStr) return `${dateStr}T${timeStr}:00`
  return dayjs(dateStr).format('YYYY-MM-DDTHH:mm:ss')
}
