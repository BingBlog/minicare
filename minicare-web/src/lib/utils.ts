/**
 * 全局通用工具函数
 * 将各页面散落的重复逻辑统一收口到此处，供所有模块引用
 */

// ────────────────────────────────────────────────────────────────────────────
// 日期 / 时间格式化
// ────────────────────────────────────────────────────────────────────────────

/**
 * 将 ISO 8601 字符串格式化为 HH:MM
 * 例："2026-03-31T14:30:00.000Z" → "22:30"（北京时间 UTC+8）
 */
export function formatTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

/**
 * 将 ISO 日期转成分组显示标签
 * - 今天：  "2026年3月31日 · 今天"
 * - 昨天：  "2026年3月30日 · 昨天"
 * - 更早：  "2026年3月28日"
 */
export function getDateLabel(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))
  const base = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  if (diff === 0) return `${base} · 今天`
  if (diff === 1) return `${base} · 昨天`
  return base
}

/**
 * 将 ISO 日期转成分组 key（YYYY-M-D），用于 Map 分组去重
 */
export function getDateKey(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * 将时间差格式化为相对时间描述
 * - < 1小时：  "刚刚"
 * - < 1天：    "X小时前"
 * - >= 1天：   "X天前"
 */
export function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days >= 1) return `${days}天前`
  const hours = Math.floor(diff / 3600000)
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
  const h = new Date().getHours()
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

/**
 * 获取今天的格式化日期字符串
 * 例：「3月31日 星期二」
 */
export function getTodayDateStr(): string {
  const today = new Date()
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][today.getDay()]
  return `${today.getMonth() + 1}月${today.getDate()}日 星期${weekday}`
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
 */
export function getBabyAge(birthDate: string): string {
  const birth = new Date(birthDate)
  const now = new Date()
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth())
  const totalDays = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24))
  const days = totalDays % 30
  if (months < 1) return `${totalDays}天`
  if (months < 12) return `${months}个月${days}天`
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
  const now = new Date()
  const fmt = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  if (key === 'custom') return '自定义时间范围'
  const days = parseInt(key, 10)
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
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
