/**
 * 全局通用工具函数
 * 将各页面散落的重复逻辑统一收口到此处，供所有模块引用
 */
import { formatScoop } from '@/pages/records/feeding/scoopUtils'
import { milkTypeOptions } from '@/pages/records/feeding/types'
import {
  SLEEP_PERIOD_LABELS,
  SLEEP_QUALITY_LABELS,
  DIAPER_TYPE_LABELS,
  POOP_TYPE_LABELS,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_INTENSITY_LABELS,
  MOOD_LABELS,
  SPIRIT_LABELS,
} from '@/lib/constants'

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
  return (
    rec.record_time ??
    rec.time ??
    rec.startTime ??
    rec.start_time ??
    rec.record_date ??
    rec.visit_date ??
    rec.created_at
  ) ?? ''
}

/**
 * 从 RecordItem 中提取 type 字段
 */
export function getRecordType(rec: { type?: string }): string {
  return rec.type ?? ''
}

// ────────────────────────────────────────────────────────────────────────────
// 记录摘要生成（适配结构化字段，替代从 note 中解析）
// ────────────────────────────────────────────────────────────────────────────

/** 奶粉类型 key → 中文名（统一从 milkTypeOptions 派生，避免重复维护） */
const MILK_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  milkTypeOptions.map((o) => [o.key, o.label])
)

/**
 * 根据记录数据生成简短的可读摘要
 * 适配结构化字段（milk_types/milk_scoops/supplement_items 等）
 * 不再依赖 note 字段拼接
 *
 * @param rec RecordItem（含各模块专有字段）
 * @returns 单行可读摘要字符串
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRecordSummary(rec: Record<string, any>): string {
  const type = rec.type ?? ''

  switch (type) {
    case 'feeding': {
      const feedType = rec.feed_type ?? ''
      if (feedType === 'formula') {
        const ml = rec.formula_ml ? `${rec.formula_ml}ml` : ''
        // 奶粉类型摘要
        let milkDesc = ''
        if (rec.milk_types && Array.isArray(rec.milk_types) && rec.milk_types.length > 0) {
          const scoops = (rec.milk_scoops as Record<string, number>) ?? {}
          milkDesc = rec.milk_types
            .map((k: string) => {
              const label = MILK_TYPE_LABELS[k] ?? k
              const s = scoops[k]
              return s != null ? `${label}${formatScoop(Number(s))}勺` : label
            })
            .join('、')
        }
        return [ml, milkDesc].filter(Boolean).join(' · ')
      } else if (feedType === 'breast') {
        const side = rec.breast_side === 'left' ? '左侧' : rec.breast_side === 'right' ? '右侧' : '双侧'
        const dur = rec.duration_min ? `${rec.duration_min}min` : ''
        return [side, dur].filter(Boolean).join(' · ')
      } else if (feedType === 'complementary') {
        // 营养素
        if (rec.complementary_food === '营养素') {
          if (rec.supplement_items && Array.isArray(rec.supplement_items) && rec.supplement_items.length > 0) {
            return rec.supplement_items
              .map((item: {label?: string; dose?: string; unit?: string}) =>
                `${item.label ?? ''}${item.dose ?? ''}${item.unit ?? ''}`
              )
              .join('、')
          }
          return '营养素'
        }
        // 辅食
        const food = rec.complementary_food ?? ''
        const amount = rec.amount_g ? `${rec.amount_g}g` : ''
        return [food, amount].filter(Boolean).join(' · ')
      }
      return rec.note ?? ''
    }

    case 'sleep': {
      const parts: string[] = []
      if (rec.sleep_period) parts.push(SLEEP_PERIOD_LABELS[rec.sleep_period] ?? rec.sleep_period)
      if (rec.duration_min) parts.push(`${rec.duration_min}min`)
      if (rec.quality) parts.push(SLEEP_QUALITY_LABELS[rec.quality] ?? rec.quality)
      if (rec.status === 'ongoing') parts.push('进行中')
      return parts.join(' · ')
    }

    case 'diaper': {
      const parts: string[] = []
      if (rec.diaper_type) parts.push(DIAPER_TYPE_LABELS[rec.diaper_type] ?? rec.diaper_type)
      if (rec.poop_type) parts.push(POOP_TYPE_LABELS[rec.poop_type] ?? rec.poop_type)
      if (rec.diaper_count != null) parts.push(`今日${rec.diaper_count}次`)
      return parts.join(' · ')
    }

    case 'activity': {
      const parts: string[] = []
      if (rec.activity_type) parts.push(ACTIVITY_TYPE_LABELS[rec.activity_type] ?? rec.activity_type)
      if (rec.duration_min) parts.push(`${rec.duration_min}min`)
      if (rec.intensity) parts.push(ACTIVITY_INTENSITY_LABELS[rec.intensity] ?? rec.intensity)
      return parts.join(' · ')
    }

    case 'symptom': {
      const parts: string[] = []
      if (rec.spirit) parts.push(SPIRIT_LABELS[rec.spirit] ?? rec.spirit)
      if (rec.mood) parts.push(MOOD_LABELS[rec.mood] ?? rec.mood)
      return parts.join(' · ')
    }

    case 'health': {
      const parts: string[] = []
      if (rec.temperature != null) parts.push(`体温${rec.temperature}℃`)
      if (rec.mood) parts.push(MOOD_LABELS[rec.mood] ?? rec.mood)
      return parts.join(' · ')
    }

    case 'growth': {
      const parts: string[] = []
      if (rec.height_mm != null) parts.push(`身高${(rec.height_mm / 10).toFixed(1)}cm`)
      if (rec.weight_g != null) parts.push(`体重${(rec.weight_g / 1000).toFixed(2)}kg`)
      if (rec.head_mm != null) parts.push(`头围${(rec.head_mm / 10).toFixed(1)}cm`)
      return parts.join(' · ')
    }

    case 'medical': {
      const parts: string[] = []
      if (rec.hospital) parts.push(rec.hospital)
      if (rec.diagnosis) parts.push(rec.diagnosis)
      return parts.join(' · ')
    }

    default:
      return rec.note ?? ''
  }
}