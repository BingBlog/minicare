import {
  ACTIVITY_TYPE_LABELS,
  MOOD_LABELS,
  POOP_TYPE_LABELS,
  RECORD_TYPE_CFG,
  SLEEP_PERIOD_LABELS,
  SLEEP_QUALITY_LABELS,
  SPIRIT_LABELS,
  VISIT_TYPE_LABELS,
} from '@/lib/constants'
import type { HomeRecord } from './types'

export interface HomeApiRecord {
  type: string
  id: string
  time: string
  note?: string | null
  detail?: Record<string, unknown> | null
}

export interface TimelineRecordDisplay {
  label: string
  tags: string[]
  summary: string
}

const MILK_TYPE_SHORT: Record<string, string> = {
  aa: '氨基酸',
  eh_no_lactose: '深(无糖)',
  eh_lactose: '深(含糖)',
  ph: '适度水解',
  std: '普通奶粉',
}

function formatDurationMin(min?: number): string {
  if (!min || !Number.isFinite(min)) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function formatScoop(value: number): string {
  if (Number.isInteger(value)) return String(value)
  if (Math.abs(value - 0.25) < 1e-6) return '1/4'
  if (Math.abs(value - 1 / 3) < 1e-6) return '1/3'
  if (Math.abs(value - 0.5) < 1e-6) return '1/2'
  if (Math.abs(value - 2 / 3) < 1e-6) return '2/3'
  if (Math.abs(value - 0.75) < 1e-6) return '3/4'
  return Number(value.toFixed(2)).toString()
}

export function toHomeRecord(rec: HomeApiRecord): HomeRecord {
  const detail = rec.detail ?? {}
  return {
    id: rec.id,
    type: (rec.type as HomeRecord['type']) ?? 'feeding',
    time: rec.time,
    title: RECORD_TYPE_CFG[rec.type]?.label ?? '记录',
    desc: rec.note || '',
    detail: detail as Record<string, unknown>,
  }
}

export function getTimelineIconType(record: HomeRecord): string {
  if (record.type !== 'feeding') return record.type
  const feedType = record.detail?.feed_type as string | undefined
  if (feedType === 'formula') return 'formula'
  if (feedType === 'breast') return 'breast'
  if (feedType === 'supplement') return 'supplement'
  if (feedType === 'complementary') {
    const food = record.detail?.complementary_food as string | undefined
    return food === '营养素' ? 'supplement' : 'food'
  }
  return 'feeding'
}

export function getTimelineRecordDisplay(record: HomeRecord): TimelineRecordDisplay {
  const d = record.detail ?? {}
  if (record.type === 'feeding' || record.type === 'formula' || record.type === 'breast' || record.type === 'food' || record.type === 'supplement') {
    const feedType = (d.feed_type as string | undefined) ?? (record.type === 'feeding' ? undefined : record.type)
    if (feedType === 'formula') {
      const milkScoopsRaw = (d.milk_scoops as Record<string, number | string> | undefined) ?? {}
      const milkTypes = ((d.milk_types as string[] | undefined) ?? Object.keys(milkScoopsRaw)).filter(Boolean)
      const ml = Number(d.formula_ml ?? 0)
      const tags = milkTypes.map((k) => {
        const scoop = Number(milkScoopsRaw[k] ?? 0)
        const label = MILK_TYPE_SHORT[k] ?? k
        return Number.isFinite(scoop) && scoop > 0 ? `${label} ${formatScoop(scoop)}勺` : label
      })
      return { label: '配方奶', tags, summary: ml > 0 ? `${ml}ml` : '' }
    }
    if (feedType === 'breast') {
      const sideMap: Record<string, string> = { left: '左乳', right: '右乳', both: '双侧' }
      const side = sideMap[(d.breast_side as string) ?? ''] ?? '双侧'
      return { label: '母乳', tags: [side], summary: formatDurationMin(Number(d.duration_min ?? 0)) }
    }
    if (feedType === 'supplement') {
      const suppItems = (d.supplement_items as Array<{ label?: string; dose?: string; unit?: string }> | undefined) ?? []
      const tags = suppItems.slice(0, 3).map((item) => {
        const name = item.label ?? ''
        const hasDose = item.dose != null && item.dose !== ''
        return hasDose ? `${name} ${item.dose}${item.unit ?? ''}` : name
      }).filter(Boolean)
      return { label: '营养素', tags, summary: '' }
    }
    if (feedType === 'complementary') {
      const foodItems = (d.food_items as Array<{ food_name?: string }> | undefined) ?? []
      const foodFromItems = foodItems.map((item) => item.food_name ?? '').filter(Boolean).join('、')
      const food = (d.complementary_food as string | undefined) ?? foodFromItems
      const amount = Number(d.amount_g ?? 0)
      return { label: food === '营养素' ? '营养素' : '辅食', tags: food ? [food] : [], summary: amount > 0 ? `${amount}g` : '' }
    }
    return { label: '饮食', tags: [], summary: '' }
  }

  if (record.type === 'sleep') {
    const period = SLEEP_PERIOD_LABELS[(d.sleep_period as string) ?? ''] ?? ''
    const ongoing = d.status === 'ongoing'
    const quality = SLEEP_QUALITY_LABELS[(d.quality as string) ?? ''] ?? ''
    return {
      label: ongoing ? (period ? `${period}中` : '睡眠中') : (period || '睡眠'),
      tags: [ongoing ? '进行中' : '', quality].filter(Boolean),
      summary: formatDurationMin(Number(d.duration_min ?? 0)),
    }
  }

  if (record.type === 'diaper') {
    const diaperType = d.diaper_type as string | undefined
    const diaperLabelMap: Record<string, string> = { wet: '嘘嘘', dirty: '臭臭', mixed: '臭臭+嘘嘘', dry: '干净' }
    const poopType = POOP_TYPE_LABELS[(d.poop_type as string) ?? ''] ?? ''
    return { label: '换尿布', tags: [diaperLabelMap[diaperType ?? ''] ?? '', poopType].filter(Boolean), summary: '' }
  }

  if (record.type === 'activity') {
    const act = ACTIVITY_TYPE_LABELS[(d.activity_type as string) ?? ''] ?? '活动'
    return { label: act, tags: [], summary: formatDurationMin(Number(d.duration_min ?? 0)) }
  }

  if (record.type === 'health') {
    const temp = d.temperature as number | undefined
    return { label: '健康', tags: [temp != null && temp >= 37.5 ? '发热' : ''].filter(Boolean), summary: temp != null ? `${temp}℃` : '' }
  }

  if (record.type === 'growth') {
    const h = d.height_mm != null ? (Number(d.height_mm) / 10).toFixed(1) : ''
    const w = d.weight_g != null ? (Number(d.weight_g) / 1000).toFixed(2) : ''
    return { label: '生长', tags: [], summary: h ? `${h}cm` : (w ? `${w}kg` : '') }
  }

  if (record.type === 'medical') {
    const visit = VISIT_TYPE_LABELS[(d.visit_type as string) ?? ''] ?? ''
    return { label: '医疗', tags: visit ? [visit] : [], summary: '' }
  }

  if (record.type === 'symptom') {
    const mood = MOOD_LABELS[(d.mood as string) ?? ''] ?? ''
    const spirit = SPIRIT_LABELS[(d.spirit as string) ?? ''] ?? ''
    return { label: '表现', tags: [mood, spirit].filter(Boolean), summary: '' }
  }

  return { label: RECORD_TYPE_CFG[record.type]?.label ?? record.type, tags: [], summary: '' }
}
