/**
 * recordListDisplay — 记录列表页的展示逻辑
 *
 * 与 Web getRecordListCompactParts + getRecordSummary 保持语义一致。
 * 返回纯数据结构（非 ReactNode），由 RecordListItem 负责渲染。
 *
 * 参考源文件：
 * - minicare-web/src/components/record/RecordContent.tsx
 *   → getRecordListCompactParts（label + tags）
 *   → getRecordSummary（右侧数值摘要 + 颜色）
 */
import {
  SLEEP_PERIOD_LABELS,
  SLEEP_QUALITY_LABELS,
  POOP_TYPE_LABELS,
  ACTIVITY_TYPE_LABELS,
  MOOD_LABELS,
  SPIRIT_LABELS,
  VISIT_TYPE_LABELS,
  RECORD_TYPE_CFG,
} from '@/lib/constants'

// ── 奶粉类型简称映射（与 Web MILK_TYPE_SHORT 一致） ──
const MILK_TYPE_SHORT: Record<string, string> = {
  aa: '氨基酸',
  eh_no_lactose: '深(无糖)',
  eh_lactose: '深(含糖)',
  ph: '适度水解',
  std: '普通奶粉',
}

/** 格式化分钟时长为 "Xh Ym" / "Xh" / "Ym"（与 Web fmtDuration 一致） */
function fmtDuration(min?: number | null): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/** 格式化勺数（与 Web formatScoop 一致） */
function formatScoop(value: number): string {
  if (Number.isInteger(value)) return String(value)
  if (Math.abs(value - 0.25) < 1e-6) return '1/4'
  if (Math.abs(value - 1 / 3) < 1e-6) return '1/3'
  if (Math.abs(value - 0.5) < 1e-6) return '1/2'
  if (Math.abs(value - 2 / 3) < 1e-6) return '2/3'
  if (Math.abs(value - 0.75) < 1e-6) return '3/4'
  return Number(value.toFixed(2)).toString()
}

/**
 * 诊断展示标签收敛（记录列表 pill 单行可读，防超长硬裁）：
 * - 顿号/逗号分隔且 > 2 项 →「前 2 项 + 等N项」（与 health 症状同策略）；
 *   超 16 字时保留「等N项」结尾、中间省略（如「要吃辅食、且后续在排…等12项」）
 * - 单句/双句 > 30 字 → 截断 29 字 + …（宽松上限防超长；宽窄适配由列表 CSS 截断承担）
 * ⚠️ 规则须与服务端 timeline.service.ts（buildDiagnosisTag）保持一致，改动需同步回填脚本
 */
function buildDiagnosisTag(raw?: string | null): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const items = s.split(/[、,，;；]+/).map((x) => x.trim()).filter(Boolean)
  if (items.length > 2) {
    const head = items.slice(0, 2).join('、')
    const suffix = `等${items.length}项`
    const label = head + suffix
    if (label.length <= 16) return label
    const avail = Math.max(16 - suffix.length - 1, 4)
    return `${head.slice(0, avail)}…${suffix}`
  }
  return s.length > 30 ? `${s.slice(0, 29)}…` : s
}

// ── 返回类型定义 ──

export interface RecordListParts {
  /** 第 3 列：标题文字（如「配方奶」「母乳」「睡眠」） */
  label: string
  /** 第 4 列的标签文字数组（渲染为 Pill） */
  tags: string[]
}

/** summary 的颜色主题 */
export type SummaryTheme = 'pink' | 'warm' | 'purple' | 'fever'

export interface RecordSummaryData {
  /** 数值部分（如 "120"、"1h 30m"、"37.8"） */
  value: string
  /** 单位部分（如 "ml"、"℃"、"cm"、"kg"） */
  unit?: string
  /** 颜色主题 */
  theme: SummaryTheme
  /** 是否为活跃状态（带边框高亮，如进行中睡眠、发热） */
  active?: boolean
}

// ── 主函数：提取列表行的 label + tags ──

/**
 * 对齐 Web getRecordListCompactParts 逻辑
 * 从记录数据中提取列表行展示所需的标题和标签。
 */
export function getRecordListParts(
  type: string,
  record: Record<string, unknown>,
): RecordListParts {
  const d = record

  switch (type) {
    case 'feeding': {
      const feedType = d.feed_type as string | undefined
      const milkTypes = d.milk_types as string[] | undefined
      const food = d.complementary_food as string | undefined
      const isSupp = food === '营养素'
      const suppItems = d.supplement_items as Array<{ label?: string; dose?: string; unit?: string }> | undefined

      if (feedType === 'formula') {
        const milkScoops = d.milk_scoops as Record<string, number> | null | undefined
        const tags: string[] = []
        if (milkTypes && milkTypes.length > 0) {
          milkTypes.forEach((k) => {
            const scoop = milkScoops?.[k]
            const label = MILK_TYPE_SHORT[k] ?? k
            if (scoop != null && Number.isFinite(scoop) && scoop > 0) {
              tags.push(`${label} ${formatScoop(scoop)}勺`)
            } else {
              tags.push(label)
            }
          })
        }
        return { label: '配方奶', tags }
      }

      if (feedType === 'breast') {
        const rawSide = d.breast_side as string | undefined
        const sideLabel = rawSide === 'left' ? '左乳' : rawSide === 'right' ? '右乳' : '双侧'
        return { label: '母乳', tags: [sideLabel] }
      }

      if (feedType === 'supplement') {
        const tags: string[] = []
        if (suppItems && suppItems.length > 0) {
          suppItems.forEach((item) => {
            const name = item.label ?? ''
            const hasDose = item.dose != null && item.dose !== ''
            const pillLabel = hasDose ? `${name} ${item.dose}${item.unit ?? ''}` : name
            if (pillLabel.trim()) tags.push(pillLabel.trim())
          })
        }
        return { label: '营养素', tags }
      }

      if (feedType === 'complementary') {
        const foodItems = d.food_items as Array<{ food_name?: string }> | undefined
        const foodFromItems = (foodItems ?? []).map((item) => item.food_name ?? '').filter(Boolean).join('、')
        const displayFood = food || foodFromItems
        if (isSupp && suppItems && suppItems.length > 0) {
          const tags: string[] = []
          suppItems.forEach((item) => {
            const name = item.label ?? ''
            const hasDose = item.dose != null && item.dose !== ''
            const pillLabel = hasDose ? `${name} ${item.dose}${item.unit ?? ''}` : name
            if (pillLabel.trim()) tags.push(pillLabel.trim())
          })
          return { label: '营养素', tags }
        }
        if (!isSupp && displayFood) {
          return { label: '辅食', tags: [displayFood] }
        }
      }

      return { label: '饮食', tags: [] }
    }

    case 'sleep': {
      const ongoing = d.status === 'ongoing'
      const period = d.sleep_period as string | undefined
      const quality = d.quality as string | undefined
      const periodLabel = period ? (SLEEP_PERIOD_LABELS[period] ?? '') : ''
      const qualityLabel = quality ? (SLEEP_QUALITY_LABELS[quality] ?? '') : ''

      const primaryTitle = periodLabel
        ? ongoing ? `${periodLabel}中` : periodLabel
        : ongoing ? '睡眠中' : '睡眠'

      const tags: string[] = []
      if (ongoing) tags.push('进行中')
      if (qualityLabel) tags.push(qualityLabel)

      return { label: primaryTitle, tags }
    }

    case 'diaper': {
      const diaperType = d.diaper_type as string | undefined
      const poopType = d.poop_type as string | undefined
      const hasPoop = diaperType === 'dirty' || diaperType === 'mixed'
      const hasWet = diaperType === 'wet' || diaperType === 'mixed'
      const isDry = diaperType === 'dry'
      const poopLabel = poopType ? (POOP_TYPE_LABELS[poopType] ?? '') : ''

      const tags: string[] = []
      if (isDry) tags.push('干净')
      if (hasPoop && !hasWet) tags.push('臭臭')
      if (hasPoop && hasWet) tags.push('臭臭')
      if (hasWet && !hasPoop) tags.push('嘘嘘')
      if (hasWet && hasPoop) tags.push('嘘嘘')
      if (poopLabel && hasPoop) tags.push(poopLabel)

      return { label: '换尿布', tags }
    }

    case 'activity': {
      const actType = d.activity_type as string | undefined
      const actLabel = actType ? (ACTIVITY_TYPE_LABELS[actType] ?? '活动') : '活动'
      return { label: actLabel, tags: [] }
    }

    case 'symptom': {
      const mood = d.mood as string | undefined
      const spirit = d.spirit as string | undefined
      const moodLabel = mood ? (MOOD_LABELS[mood] ?? '') : ''
      const spiritLabel = spirit ? (SPIRIT_LABELS[spirit] ?? '') : ''
      const tags = [moodLabel, spiritLabel].filter(Boolean)
      return { label: '表现', tags }
    }

    case 'health': {
      const temp = d.temperature as number | undefined
      const isFever = temp != null && temp >= 37.5
      const meds = d.medications as Array<{ name: string }> | undefined
      const symptoms = (d.allergy_symptoms as string[] | undefined) ?? []
      const hasAllergy = symptoms.length > 0

      // 拆页后单维度记录占绝大多数；历史复合记录（体温+过敏同一条）兜底展示
      const label = temp != null && !hasAllergy ? '体温' : hasAllergy && temp == null ? '过敏表现' : '健康'

      const tags: string[] = []
      if (isFever) tags.push('发热')
      if (hasAllergy) {
        tags.push(...symptoms.slice(0, 2))
        if (symptoms.length > 2) tags.push(`等${symptoms.length}项`)
      }
      if (meds && meds.length > 0) tags.push(meds[0].name)

      return { label, tags }
    }

    case 'growth': {
      const h = d.height_mm != null ? (Number(d.height_mm) / 10).toFixed(1) : ''
      const w = d.weight_g != null ? (Number(d.weight_g) / 1000).toFixed(2) : ''
      const hc = d.head_mm != null ? (Number(d.head_mm) / 10).toFixed(1) : ''
      // growth 的数值放在 tags 中展示（与 Web 一致 — Web 用 SummaryMetric 嵌入 tags 列）
      const tags: string[] = []
      if (h) tags.push(`${h}cm`)
      if (w) tags.push(`${w}kg`)
      if (hc) tags.push(`${hc}cm头围`)
      return { label: '生长', tags }
    }

    case 'medical': {
      const visitType = d.visit_type as string | undefined
      const hospital = d.hospital as string | undefined
      const diagnosis = d.diagnosis as string | undefined
      const typeLabel = visitType ? (VISIT_TYPE_LABELS[visitType] ?? '就诊') : '就诊'
      const tags = [typeLabel, hospital, buildDiagnosisTag(diagnosis)].filter(Boolean) as string[]
      return { label: '医疗', tags }
    }

    case 'medication': {
      // 多药批次（025）：同批聚合为一条服药事件 → 药名多枚 tag
      const merged = d.merged_items as Array<{ medication_name?: string; dose?: string }> | undefined
      if (Array.isArray(merged) && merged.length > 1) {
        const tags = merged.map((i) => i.medication_name ?? '').filter(Boolean)
        const note = d.note as string | undefined
        if (note) tags.push(note)
        return { label: '用药', tags }
      }
      const name = d.medication_name as string | undefined
      const note = d.note as string | undefined
      const tags = [name, note].filter(Boolean) as string[]
      return { label: '用药', tags }
    }

    default: {
      return { label: RECORD_TYPE_CFG[type]?.label ?? type, tags: [] }
    }
  }
}

// ── 主函数：提取右侧 summary 数值 ──

/**
 * 对齐 Web getRecordSummary 逻辑
 * 从记录数据中提取右侧摘要数值和颜色主题。
 */
export function getRecordSummary(
  type: string,
  record: Record<string, unknown>,
): RecordSummaryData | null {
  const d = record

  switch (type) {
    case 'feeding': {
      const feedType = d.feed_type as string | undefined
      if (feedType === 'formula') {
        const ml = d.formula_ml as number | undefined
        if (ml) return { value: String(ml), unit: 'ml', theme: 'pink' }
      }
      if (feedType === 'breast') {
        const dur = d.duration_min as number | undefined
        if (dur) return { value: fmtDuration(dur), theme: 'pink' }
      }
      if (feedType === 'supplement') return null
      if (feedType === 'complementary') {
        const amountG = d.amount_g as number | undefined
        if (amountG) return { value: String(amountG), unit: 'g', theme: 'warm' }
      }
      return null
    }

    case 'sleep': {
      const ongoing = d.status === 'ongoing'
      const durMin = d.duration_min as number | undefined
      if (!durMin) return null
      if (ongoing) {
        return { value: fmtDuration(durMin), theme: 'pink', active: true }
      }
      return { value: fmtDuration(durMin), theme: 'warm' }
    }

    case 'health': {
      const temp = d.temperature as number | undefined
      if (temp != null) {
        const isFever = temp >= 37.5
        return {
          value: String(temp),
          unit: '℃',
          theme: isFever ? 'fever' : 'pink',
          active: isFever,
        }
      }
      return null
    }

    case 'growth':
      // growth 数值已放入 tags 列（与 Web 一致：summary 列返回 null）
      return null

    case 'activity': {
      const durMin = d.duration_min as number | undefined
      if (durMin) return { value: fmtDuration(durMin), theme: 'warm' }
      return null
    }

    case 'diaper':
    case 'symptom':
    case 'medical':
      return null

    case 'medication': {
      // 多药批次（025）：剂量并列摘要（'5ml · 1袋'）
      const merged = d.merged_items as Array<{ medication_name?: string; dose?: string }> | undefined
      if (Array.isArray(merged) && merged.length > 1) {
        const joined = merged.map((i) => i.dose ?? '').filter(Boolean).join(' · ')
        if (joined) return { value: joined, theme: 'purple' }
        return null
      }
      const dose = d.dose as string | undefined
      if (dose) return { value: dose, theme: 'purple' }
      return null
    }

    default:
      return null
  }
}
