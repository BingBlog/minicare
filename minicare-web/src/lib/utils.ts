/**
 * 全局通用工具函数
 * 将各页面散落的重复逻辑统一收口到此处，供所有模块引用
 *
 * 时间处理统一使用 dayjs，通过本文件统一封装后对外暴露，
 * 业务组件不应直接 import dayjs，而应 import 本文件中的工具函数。
 */
import dayjs from 'dayjs'

// ────────────────────────────────────────────────────────────────────────────
// 日期 / 时间格式化
// ────────────────────────────────────────────────────────────────────────────

/**
 * 将 ISO 8601 字符串格式化为 HH:mm（本地时间）
 * 例："2026-03-31T14:30:00.000Z" → "22:30"（北京时间 UTC+8）
 */
export function formatTime(iso: string): string {
  if (!iso) return ''
  return dayjs(iso).format('HH:mm')
}

/**
 * 将 ISO 日期转成分组显示标签
 * - 今天：  "2026年3月31日 · 今天"
 * - 昨天：  "2026年3月30日 · 昨天"
 * - 更早：  "2026年3月28日"
 */
export function getDateLabel(iso: string): string {
  if (!iso) return ''
  const d = dayjs(iso)
  const today = dayjs().startOf('day')
  const diff = today.diff(d.startOf('day'), 'day')
  const base = `${d.year()}年${d.month() + 1}月${d.date()}日`
  if (diff === 0) return `${base} · 今天`
  if (diff === 1) return `${base} · 昨天`
  return base
}

/**
 * 将 ISO 日期转成分组 key（YYYY-M-D），用于 Map 分组去重
 */
export function getDateKey(iso: string): string {
  if (!iso) return ''
  const d = dayjs(iso)
  return `${d.year()}-${d.month() + 1}-${d.date()}`
}

/**
 * 将时间差格式化为相对时间描述
 * - < 1小时：  "刚刚"
 * - < 1天：    "X小时前"
 * - >= 1天：   "X天前"
 */
export function timeAgo(isoStr: string): string {
  const now = dayjs()
  const target = dayjs(isoStr)
  const days = now.diff(target, 'day')
  if (days >= 1) return `${days}天前`
  const hours = now.diff(target, 'hour')
  if (hours >= 1) return `${hours}小时前`
  return '刚刚'
}

/**
 * 获取当前时段问候语
 * - 0-11 点：早上好
 * - 12-17 点：下午好
 * - 18-23 点：晚上好
 */
export function getGreeting(): string {
  const h = dayjs().hour()
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

/**
 * 获取今天的格式化日期字符串
 * 例：「3月31日 星期二」
 */
export function getTodayDateStr(): string {
  const today = dayjs()
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][today.day()]
  return `${today.month() + 1}月${today.date()}日 星期${weekday}`
}

/**
 * 将 YYYY-MM-DD 日期格式化为 "M/D"（无补零），用于图表 X 轴标签
 * 例："2026-03-05" → "3/5"
 */
export function formatDateSlash(dateStr: string): string {
  if (!dateStr) return ''
  return dayjs(dateStr).format('M/D')
}

/**
 * 将 YYYY-MM-DD 日期格式化为 "M月D日"（无补零），用于简短中文日期显示
 * 例："2026-03-05" → "3月5日"
 */
export function formatDateCN(dateStr: string): string {
  if (!dateStr) return ''
  return dayjs(dateStr).format('M月D日')
}

/**
 * 将 YYYY-MM-DD 日期格式化为 "YYYY年M月D日"（无补零），用于完整中文日期显示
 * 例："2026-03-05" → "2026年3月5日"
 */
export function formatFullDateCN(dateStr: string): string {
  if (!dateStr) return ''
  return dayjs(dateStr).format('YYYY年M月D日')
}

/**
 * 将分钟数格式化为可读时长
 * - 0 分钟：  "0分钟"
 * - < 60 分钟：  "X分钟"
 * - 整点：    "X小时"
 * - 其他：    "X小时Y分钟"
 */
export function formatDurationMinutes(minutes: number): string {
  const safe = Number.isFinite(minutes) ? Math.round(minutes) : 0
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  if (hours === 0) return `${mins}分钟`
  if (mins === 0) return `${hours}小时`
  return `${hours}小时${mins}分钟`
}

/**
 * 将小数月龄格式化为 "X月龄" 或 "X.X月龄"
 * 例：3 → "3月龄"，3.5 → "3.5月龄"
 */
export function formatAgeMonths(ageMonths: number): string {
  const n = Math.round(ageMonths * 10) / 10
  return Number.isInteger(n) ? `${n}月龄` : `${n.toFixed(1)}月龄`
}

export function nowDate(): string {
  return dayjs().format('YYYY-MM-DD')
}

export function nowTime(): string {
  return dayjs().format('HH:mm')
}

export function isoToLocalDate(iso: string): string {
  if (!iso) return ''
  return dayjs(iso).format('YYYY-MM-DD')
}

export function isoToLocalTime(iso: string): string {
  if (!iso) return ''
  return dayjs(iso).format('HH:mm')
}

export function toLocalISO(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}:00`
}

export function dateToLocalISO(d: Date): string {
  return dayjs(d).format('YYYY-MM-DDTHH:mm:ss')
}

export function nowLocalISO(): string {
  return dayjs().format('YYYY-MM-DDTHH:mm:ss')
}

export function getTodayKey(): string {
  return dayjs().format('YYYY-M-D')
}

// ────────────────────────────────────────────────────────────────────────────
// 时间计算
// ────────────────────────────────────────────────────────────────────────────

export function addMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = ((h * 60 + m + delta) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function timeDiffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let diff = eh * 60 + em - (sh * 60 + sm)
  if (diff < 0) diff += 1440
  return diff
}

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

export function compareTime(a: string, b: string): number {
  return dayjs(a).valueOf() - dayjs(b).valueOf()
}

export function inferSleepPeriod(startTime: string): 'night' | 'morning_nap' | 'afternoon_nap' | 'other' {
  const hour = dayjs(startTime).hour()
  if (hour >= 22 || hour < 6) return 'night'
  if (hour < 12) return 'morning_nap'
  if (hour < 18) return 'afternoon_nap'
  return 'other'
}

// ────────────────────────────────────────────────────────────────────────────
// 宝宝年龄计算
// ────────────────────────────────────────────────────────────────────────────

/**
 * 根据出生日期计算宝宝年龄文案
 * - < 1个月：  "X天"
 * - < 12个月：  "X个月Y天"
 * - >= 12个月：  "X岁Y个月"
 *
 * @param birthDate - YYYY-MM-DD 格式的出生日期
 *
 * 实现说明：
 * dayjs.add(n, 'month') 内部与原生 setMonth 一样会发生月末溢出（1月31日+1月=3月3日），
 * 因此仍需手动处理。具体策略：
 *   1. 用日历月差得到候选 months
 *   2. 将出生日锁定到目标月末（若该月无对应日），计算"满 months 个月"那天
 *   3. 若今天还未到达满月日，months--
 *   4. 剩余天数 = 今天 - 最近满月日（用 dayjs.diff('day') 计算，避免手动毫秒换算）
 */
export function getBabyAge(birthDate: string): string {
  const birth = dayjs(birthDate).startOf('day')
  const now = dayjs().startOf('day')

  // 先按日历月差计算候选月数
  let months = now.diff(birth, 'month')

  /**
   * 计算"出生日期 + n 个月"，并处理月末溢出。
   * dayjs.add(n, 'month') 对月末日期的处理与原生 setMonth 相同，
   * 例：1月31日 + 3个月 → 4月30日（dayjs 自动处理为目标月最后一天），
   * 所以直接使用 dayjs.add 即可，不需要额外处理。
   */
  const birthPlusMonths = birth.add(months, 'month')

  // 若今天还没到"满月对应日"，说明当月尚未满，月数减一
  if (now.isBefore(birthPlusMonths)) {
    months--
  }

  const fullMonthDate = birth.add(months, 'month')
  const remainDays = now.diff(fullMonthDate, 'day')
  const totalDays = now.diff(birth, 'day')

  if (months < 1) return `${totalDays}天`
  if (months < 12) return `${months}个月${remainDays}天`
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  return `${years}岁${remMonths > 0 ? remMonths + '个月' : ''}`
}

// ────────────────────────────────────────────────────────────────────────────
// 报告日期范围
// ────────────────────────────────────────────────────────────────────────────

/**
 * 根据天数 key 生成报告范围文案
 * - "7"  → "2026年3月24日—2026年3月31日（7天）"
 * - "custom" → "自定义时间范围"
 */
export function getReportRangeText(key: string): string {
  if (key === 'custom') return '自定义时间范围'
  const days = parseInt(key, 10)
  const now = dayjs()
  const start = now.subtract(days - 1, 'day')
  const fmt = (d: dayjs.Dayjs) => `${d.year()}年${d.month() + 1}月${d.date()}日`
  return `${fmt(start)}—${fmt(now)}（${days}天）`
}

// ────────────────────────────────────────────────────────────────────────────
// 记录工具
// ────────────────────────────────────────────────────────────────────────────

/**
 * 从 RecordItem 中提取时间字段
 * 优先级：record_time > startTime > start_time > created_at
 * 各记录类型说明：
 *  - feeding/diaper/activity/symptom/health：使用 record_time
 *  - sleep：使用 start_time
 *  - growth：使用 record_date（当作时间处理）
 *  - medical：使用 visit_date
 */
export function getRecordTime(rec: {
  record_time?: string
  /** 今日时间线 API 使用 time 字段 */
  time?: string
  startTime?: string
  start_time?: string
  record_date?: string
  visit_date?: string
  created_at?: string
}): string {
  // record_time 可能是完整 ISO 字符串（含日期，如 "2026-04-12T08:32:00"）
  // 也可能是 growth 记录的纯时间字符串（如 "08:32:00"）。
  // 纯时间字符串不含 "-"，不能作为排序/分组依据，需要跳过，改用 record_date。
  const rt = rec.record_time
  const recordTimeValid = rt && rt.includes('-')

  return (
    (recordTimeValid ? rt : undefined) ??
    rec.time ??
    rec.startTime ??
    rec.start_time ??
    rec.record_date ??
    rec.visit_date ??
    rec.created_at
  ) ?? ''
}

/**
 * 从 RecordItem 中提取用于列表展示的 HH:mm 时间字符串。
 *
 * 与 getRecordTime 的区别：
 * - getRecordTime  → 返回可被 new Date() 正确解析的完整时间串，用于排序/分组
 * - getDisplayTime → 返回 HH:mm，专用于 UI 展示
 *
 * growth 记录的 record_time 是纯时间串 "HH:mm:ss"，不含日期，
 * 直接截取前 5 位即可；其余记录走 getRecordTime 再 formatTime。
 */
export function getDisplayTime(rec: {
  record_time?: string
  time?: string
  startTime?: string
  start_time?: string
  record_date?: string
  visit_date?: string
  created_at?: string
}): string {
  const rt = rec.record_time
  // 纯时间串（不含 "-"），直接取 HH:mm
  if (rt && !rt.includes('-')) {
    return rt.substring(0, 5)
  }
  // 其余情况走完整时间串再格式化
  return formatTime(getRecordTime(rec))
}

/**
 * 从 RecordItem 中提取 type 字段
 */
export function getRecordType(rec: { type?: string }): string {
  return rec.type ?? ''
}
