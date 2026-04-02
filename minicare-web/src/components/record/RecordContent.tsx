/**
 * RecordContent —— 各记录类型的内容渲染器（共享组件）
 *
 * 被以下页面共用：
 *   - pages/home/TodayTimeline.tsx（首页今日时间线）
 *   - pages/records-list/RecordListItem.tsx（全部记录列表）
 *
 * 每种记录类型均会突出展示关键数值/状态：
 *   - 饮食：奶量 MetricChip / 母乳时长 / 辅食 FoodChip
 *   - 睡眠：时长 chip + 进行中动效
 *   - 尿布：类型彩色 Pill（含语义图标）
 *   - 活动：活动类型 Pill + 时长 MetricChip
 *   - 表现：情绪 / 精神 Pill
 *   - 健康：体温 MetricChip + 症状 Pill
 *   - 生长：身高 / 体重 / 头围 MetricChip
 *   - 医疗：就诊类型 Pill + 医院/诊断文字
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
import { milkTypeOptions } from '@/pages/records/feeding/types'
import {
  IconPoop,
  IconDrop,
  IconLeaf,
  IconBath,
  IconSun,
  IconPlay2,
  IconBaby,
  IconRun,
  IconFaceHappy,
  IconFaceNeutral,
  IconFaceFussy,
  IconFaceCrying,
  IconHospital,
  IconThermometer,
  IconPill,
  IconAlertTriangle,
  IconZap,
  IconClock,
  IconActivity,
} from '@/components/ui/icons'
import type { IconProps } from '@/components/ui/icons'

// ── 奶粉类型 / 情绪 / 活动 映射 ───────────────────────────────────

const MILK_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  milkTypeOptions.map((o) => [o.key, o.label])
)

const MOOD_ICON_MAP: Record<string, (p: IconProps) => React.ReactElement> = {
  happy:   IconFaceHappy,
  neutral: IconFaceNeutral,
  fussy:   IconFaceFussy,
  crying:  IconFaceCrying,
}

const ACTIVITY_ICON_MAP: Record<string, (p: IconProps) => React.ReactElement> = {
  bath:       IconBath,
  outdoor:    IconSun,
  play:       IconPlay2,
  tummy_time: IconBaby,
  other:      IconRun,
}

// ── 公共基础子组件 ────────────────────────────────────────────────

/** 将分钟数格式化为 "Xh Ym" / "Xh" / "Ym" */
export function fmtDuration(min?: number | null): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/** 粉色数值 chip：高亮关键数据 */
export function MetricChip({ value, unit, active }: { value: string | number; unit?: string; active?: boolean }) {
  return (
    <span
      className="inline-flex items-baseline gap-px rounded-md px-1.5 py-0.5 flex-shrink-0"
      style={{
        background: '#FFF0F4',
        border: active ? '1px solid #F8B8CC' : undefined,
      }}
    >
      <span
        className="font-extrabold tracking-tight"
        style={{ fontSize: 15, lineHeight: 1.2, color: '#F87098', letterSpacing: '-0.5px' }}
      >
        {value}
      </span>
      {unit && (
        <span className="font-semibold" style={{ fontSize: 11, color: '#F87098', opacity: 0.8 }}>
          {unit}
        </span>
      )}
    </span>
  )
}

/** 暖金色 chip：已完成的睡眠时长 */
export function DoneMetricChip({ value, unit }: { value: string | number; unit?: string }) {
  return (
    <span
      className="inline-flex items-baseline gap-px rounded-md px-1.5 py-0.5 flex-shrink-0"
      style={{ background: '#FFF8E6' }}
    >
      <span
        className="font-extrabold tracking-tight"
        style={{ fontSize: 15, lineHeight: 1.2, color: '#C0922A', letterSpacing: '-0.5px' }}
      >
        {value}
      </span>
      {unit && (
        <span className="font-semibold" style={{ fontSize: 11, color: '#C0922A', opacity: 0.8 }}>
          {unit}
        </span>
      )}
    </span>
  )
}

/** 圆角胶囊 Pill：带可选 icon */
export function Pill({
  icon: Icon,
  children,
  color = '#b07820',
  bg = '#fff8ec',
}: {
  icon?: (p: IconProps) => React.ReactElement
  children: React.ReactNode
  color?: string
  bg?: string
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
      style={{ fontSize: 11, lineHeight: 1.3, color, background: bg }}
    >
      {Icon && <Icon size={11} color={color} />}
      {children}
    </span>
  )
}

/** 辅食 chip：暖黄底 */
export function FoodChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-semibold"
      style={{ fontSize: 11, background: '#FFF8E6', color: '#B07820' }}
    >
      {children}
    </span>
  )
}

/** 进行中呼吸动效小点 */
export function LiveDot() {
  return (
    <span
      className="inline-block rounded-full flex-shrink-0 mr-0.5"
      style={{
        width: 6,
        height: 6,
        background: '#F87098',
        verticalAlign: 'middle',
        animation: 'rc-pulse 2s infinite',
      }}
    />
  )
}

/** 呼吸动效 keyframes（使用前需在父级注入，或由 RecordContent 自动注入） */
export const PULSE_STYLE = `
  @keyframes rc-pulse {
    0%, 100% { box-shadow: 0 0 0 2px rgba(248,112,152,0.25); }
    50%       { box-shadow: 0 0 0 5px rgba(248,112,152,0.06); }
  }
`

// ── 各记录类型内容渲染 ────────────────────────────────────────────

function FeedingContent({ d }: { d: Record<string, unknown> }) {
  const feedType = d.feed_type as string | undefined

  if (feedType === 'formula') {
    const ml = d.formula_ml as number | undefined
    const milkTypes = d.milk_types as string[] | undefined
    const milkLabel =
      milkTypes && milkTypes.length > 0
        ? milkTypes.map((k) => MILK_TYPE_LABELS[k] ?? k).join('/')
        : null

    return (
      <>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium" style={{ color: '#7a5a60' }}>喂奶</span>
          {ml ? <MetricChip value={ml} unit="ml" /> : null}
        </div>
        {milkLabel && (
          <div className="mt-1 text-xs" style={{ color: '#9A8090' }}>{milkLabel}</div>
        )}
      </>
    )
  }

  if (feedType === 'breast') {
    const side = d.breast_side === 'left' ? '左侧' : d.breast_side === 'right' ? '右侧' : '双侧'
    const dur = d.duration_min as number | undefined
    return (
      <>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium" style={{ color: '#7a5a60' }}>母乳</span>
          {dur ? <MetricChip value={fmtDuration(dur)} /> : null}
        </div>
        <div className="mt-1 text-xs" style={{ color: '#9A8090' }}>{side}</div>
      </>
    )
  }

  if (feedType === 'complementary') {
    const food = d.complementary_food as string | undefined
    const amountG = d.amount_g as number | undefined
    const isSupp = food === '营养素'
    const suppItems = d.supplement_items as Array<{ label?: string; dose?: string; unit?: string }> | undefined

    if (isSupp && suppItems && suppItems.length > 0) {
      return (
        <>
          <div className="text-sm font-medium" style={{ color: '#7a5a60' }}>营养素</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {suppItems.slice(0, 3).map((item, i) => (
              <FoodChip key={i}>
                <IconPill size={10} color="#B07820" />
                {item.label}{item.dose}{item.unit}
              </FoodChip>
            ))}
          </div>
        </>
      )
    }

    return (
      <>
        <div className="text-sm font-medium" style={{ color: '#7a5a60' }}>辅食</div>
        <div className="flex flex-wrap gap-1 mt-1">
          {food && <FoodChip>{food}{amountG ? ` ${amountG}g` : ''}</FoodChip>}
        </div>
      </>
    )
  }

  return <div className="text-sm font-medium" style={{ color: '#7a5a60' }}>饮食</div>
}

function SleepContent({ d }: { d: Record<string, unknown> }) {
  const ongoing = d.status === 'ongoing'
  const durMin = d.duration_min as number | undefined
  const period = d.sleep_period as string | undefined
  const quality = d.quality as string | undefined
  const periodLabel = period ? (SLEEP_PERIOD_LABELS[period] ?? period) : undefined
  const qualityLabel = quality ? (SLEEP_QUALITY_LABELS[quality] ?? quality) : undefined

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-sm font-medium" style={{ color: '#7a5a60' }}>
          {ongoing && <LiveDot />}
          {ongoing ? '睡眠中' : '睡眠'}
        </span>
        {durMin
          ? ongoing
            ? <MetricChip value={fmtDuration(durMin)} active />
            : <DoneMetricChip value={fmtDuration(durMin)} />
          : null}
        {ongoing && (
          <Pill icon={IconClock} color="#F87098" bg="#FFF0F4">进行中</Pill>
        )}
      </div>
      {(periodLabel || qualityLabel) && (
        <div className="mt-1 text-xs" style={{ color: '#9A8090' }}>
          {[periodLabel, qualityLabel].filter(Boolean).join(' · ')}
        </div>
      )}
    </>
  )
}

function DiaperContent({ d }: { d: Record<string, unknown> }) {
  const diaperType = d.diaper_type as string | undefined
  const poopType = d.poop_type as string | undefined
  const diaperCount = d.diaper_count as number | undefined

  const hasPoop = diaperType === 'dirty' || diaperType === 'mixed'
  const hasWet  = diaperType === 'wet'   || diaperType === 'mixed'
  const isDry   = diaperType === 'dry'

  const poopLabel = poopType ? (POOP_TYPE_LABELS[poopType] ?? poopType) : '大便'

  return (
    <>
      <div className="text-sm font-medium" style={{ color: '#7a5a60' }}>换尿布</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {isDry   && <Pill icon={IconLeaf} bg="#F5F5F5" color="#9A8090">干净</Pill>}
        {hasPoop && <Pill icon={IconPoop} bg="#FFF8EC" color="#B07820">{poopLabel}</Pill>}
        {hasWet  && <Pill icon={IconDrop} bg="#E8F5FD" color="#2080B8">小便</Pill>}
        {diaperCount != null && diaperCount > 0 && (
          <Pill bg="#F5F0F2" color="#9A7E82">今日 {diaperCount} 次</Pill>
        )}
      </div>
    </>
  )
}

function ActivityContent({ d }: { d: Record<string, unknown> }) {
  const actType = d.activity_type as string | undefined
  const durMin  = d.duration_min as number | undefined
  const actLabel = actType ? (ACTIVITY_TYPE_LABELS[actType] ?? actType) : '活动'
  const ActIcon = actType ? (ACTIVITY_ICON_MAP[actType] ?? IconActivity) : IconActivity

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-sm font-medium" style={{ color: '#7a5a60' }}>活动</span>
        <Pill icon={ActIcon} bg="#FFF0F4" color="#E85580">{actLabel}</Pill>
        {durMin ? <MetricChip value={fmtDuration(durMin)} /> : null}
      </div>
    </>
  )
}

function SymptomContent({ d }: { d: Record<string, unknown> }) {
  const mood   = d.mood as string | undefined
  const spirit = d.spirit as string | undefined
  const moodLabel   = mood   ? (MOOD_LABELS[mood]     ?? mood)   : undefined
  const spiritLabel = spirit ? (SPIRIT_LABELS[spirit] ?? spirit) : undefined
  const MoodIcon = mood ? (MOOD_ICON_MAP[mood] ?? IconFaceNeutral) : undefined

  return (
    <>
      <div className="text-sm font-medium" style={{ color: '#7a5a60' }}>表现记录</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {moodLabel && MoodIcon && (
          <Pill icon={MoodIcon} bg="#FFF0F4" color="#E85580">{moodLabel}</Pill>
        )}
        {spiritLabel && (
          <Pill icon={IconZap} bg="#FFF8E6" color="#C0922A">{spiritLabel}</Pill>
        )}
      </div>
    </>
  )
}

function HealthContent({ d }: { d: Record<string, unknown> }) {
  const temp = d.temperature as number | undefined
  const mood = d.mood as string | undefined
  const moodLabel = mood ? (MOOD_LABELS[mood] ?? mood) : undefined
  const MoodIcon  = mood ? (MOOD_ICON_MAP[mood] ?? IconFaceNeutral) : undefined
  const allergySx = d.allergy_symptoms as string[] | undefined
  const meds = d.medications as Array<{ name: string }> | undefined
  const isFever = temp != null && temp >= 37.5

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-sm font-medium" style={{ color: '#7a5a60' }}>健康</span>
        {temp != null && (
          <MetricChip value={temp} unit="℃" active={isFever} />
        )}
        {isFever && (
          <Pill icon={IconThermometer} bg="#FFF1F4" color="#F05070">发热</Pill>
        )}
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {moodLabel && MoodIcon && (
          <Pill icon={MoodIcon} bg="#FFF0F4" color="#E85580">{moodLabel}</Pill>
        )}
        {allergySx && allergySx.length > 0 && (
          <Pill icon={IconAlertTriangle} bg="#FFF1F4" color="#F05070">
            {allergySx[0]}{allergySx.length > 1 ? `+${allergySx.length - 1}` : ''}
          </Pill>
        )}
        {meds && meds.length > 0 && (
          <Pill icon={IconPill} bg="#F3F0FF" color="#9B8ED8">{meds[0].name}</Pill>
        )}
      </div>
    </>
  )
}

function GrowthContent({ d }: { d: Record<string, unknown> }) {
  const h  = d.height_mm != null ? (Number(d.height_mm) / 10).toFixed(1) : null
  const w  = d.weight_g  != null ? (Number(d.weight_g) / 1000).toFixed(2) : null
  const hc = d.head_mm   != null ? (Number(d.head_mm) / 10).toFixed(1) : null

  return (
    <>
      <div className="text-sm font-medium" style={{ color: '#7a5a60' }}>生长记录</div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {h  && <MetricChip value={h}  unit="cm" />}
        {w  && <MetricChip value={w}  unit="kg" />}
        {hc && <MetricChip value={hc} unit="cm头围" />}
      </div>
    </>
  )
}

function MedicalContent({ d }: { d: Record<string, unknown> }) {
  const visitType = d.visit_type as string | undefined
  const hospital  = d.hospital  as string | undefined
  const diagnosis = d.diagnosis as string | undefined
  const typeLabel = visitType ? (VISIT_TYPE_LABELS[visitType] ?? visitType) : '就诊'

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-sm font-medium" style={{ color: '#7a5a60' }}>医疗</span>
        <Pill icon={IconHospital} bg="#F0F4FF" color="#5B9BD5">{typeLabel}</Pill>
      </div>
      {(hospital || diagnosis) && (
        <div className="mt-1 text-xs truncate" style={{ color: '#9A8090' }}>
          {[hospital, diagnosis].filter(Boolean).join(' · ')}
        </div>
      )}
    </>
  )
}

// ── 主分派组件（供外部直接使用） ─────────────────────────────────────────

/**
 * 根据 type 字段分派渲染对应记录类型的内容
 *
 * detail 来源兼容：
 *   - TodayRecord.detail（首页时间线）
 *   - RecordItem 展平字段（记录列表页）
 *
 * @example
 * <RecordContent type="feeding" detail={{ feed_type: 'formula', formula_ml: 120 }} />
 */
export default function RecordContent({
  type,
  detail,
}: {
  type: string
  detail?: Record<string, unknown> | null
}) {
  const d: Record<string, unknown> = detail ?? {}

  switch (type) {
    case 'feeding':  return <FeedingContent  d={d} />
    case 'sleep':    return <SleepContent    d={d} />
    case 'diaper':   return <DiaperContent   d={d} />
    case 'activity': return <ActivityContent d={d} />
    case 'symptom':  return <SymptomContent  d={d} />
    case 'health':   return <HealthContent   d={d} />
    case 'growth':   return <GrowthContent   d={d} />
    case 'medical':  return <MedicalContent  d={d} />
    default: {
      const cfg = RECORD_TYPE_CFG[type]
      return <div className="text-sm font-medium" style={{ color: '#7a5a60' }}>{cfg?.label ?? type}</div>
    }
  }
}
