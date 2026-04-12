/**
 * RecordContent —— 各记录类型的内容渲染器（共享组件）
 *
 * 被以下页面共用：
 *   - pages/home/TodayTimeline.tsx（首页今日时间线）
 *   - pages/records-list/RecordListItem.tsx（全部记录列表）
 *
 * 新增 compact 模式：
 *   - compact=false（默认）：完整展示（首页时间线等）
 *   - compact=true：单行横排 primary + tags + meta（与 getRecordListCompactParts 一致）
 * 列表页条目由 RecordListItem 组合：第一行 + getRecordSummary；第二行仅 note
 *
 * getRecordListCompactParts / getRecordSummary：
 *   列表主行文案与右侧数值摘要
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
import type { ReactNode } from 'react'

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

/** 右侧摘要专用数值显示（字号稍小，适合列表右侧） */
export function SummaryMetric({ value, unit, color = '#F87098', bg = '#FFF0F4', active }: {
  value: string | number
  unit?: string
  color?: string
  bg?: string
  active?: boolean
}) {
  return (
    <span
      className="inline-flex items-baseline gap-px rounded-lg px-2 py-0.5 flex-shrink-0"
      style={{
        background: bg,
        border: active ? `1px solid ${color}55` : undefined,
      }}
    >
      <span
        className="font-extrabold tabular-nums"
        style={{ fontSize: 14, lineHeight: 1.25, color, letterSpacing: '-0.3px' }}
      >
        {value}
      </span>
      {unit && (
        <span className="font-medium" style={{ fontSize: 10, color, opacity: 0.75 }}>
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

// ── 各记录类型：完整内容渲染（默认模式） ────────────────────────

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

// 尿布类型 → 中文标签（与表单页对齐）
const DIAPER_CARD_LABELS: Record<string, string> = {
  wet:   '嘘嘘',
  dirty: '臭臭',
  mixed: '臭臭＋嘘嘘',
  dry:   '干净',
}

function DiaperContent({ d }: { d: Record<string, unknown> }) {
  const diaperType = d.diaper_type as string | undefined
  const poopType = d.poop_type as string | undefined
  const diaperCount = d.diaper_count as number | undefined

  const hasPoop = diaperType === 'dirty' || diaperType === 'mixed'
  const hasWet  = diaperType === 'wet'   || diaperType === 'mixed'
  const isDry   = diaperType === 'dry'
  const typeLabel = diaperType ? (DIAPER_CARD_LABELS[diaperType] ?? diaperType) : null
  const poopLabel = poopType ? (POOP_TYPE_LABELS[poopType] ?? poopType) : null

  return (
    <>
      <div className="text-sm font-medium" style={{ color: '#7a5a60' }}>换尿布</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {isDry   && <Pill icon={IconLeaf} bg="#F5F5F5" color="#9A8090">{typeLabel}</Pill>}
        {hasPoop && <Pill icon={IconPoop} bg="#FFF8EC" color="#B07820">{typeLabel}</Pill>}
        {hasWet  && !hasPoop && <Pill icon={IconDrop} bg="#E8F5FD" color="#2080B8">{typeLabel}</Pill>}
        {hasWet  &&  hasPoop && <Pill icon={IconDrop} bg="#E8F5FD" color="#2080B8">嘘嘘</Pill>}
        {poopLabel && hasPoop && <Pill bg="#FFF5EE" color="#C05020">{poopLabel}</Pill>}
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

// ── 列表页：主行文案拆分为 primary / tags / meta（备注不在此，由 RecordListItem 单独第二行） ──

const LIST_TITLE_CLS = 'text-[15px] font-semibold leading-snug text-[#3D2B2E]'
const LIST_META_CLS = 'text-[11px] leading-relaxed text-[#9A7E82]'

/**
 * 记录列表主行：标题、标签（Pill）、补充 meta 文案；与 getRecordSummary 搭配使用。
 * 列表第二行仅展示用户备注 note，不在此返回。
 */
export function getRecordListCompactParts(
  type: string,
  detail: Record<string, unknown> | null | undefined
): { primary: ReactNode; tags: ReactNode | null; meta: ReactNode | null } {
  const d = detail ?? {}

  switch (type) {
    case 'feeding': {
      const feedType = d.feed_type as string | undefined
      const milkTypes = d.milk_types as string[] | undefined
      const milkLabel =
        milkTypes && milkTypes.length > 0
          ? milkTypes.map((k) => MILK_TYPE_LABELS[k] ?? k).join('/')
          : null
      const food = d.complementary_food as string | undefined
      const isSupp = food === '营养素'
      const suppItems = d.supplement_items as Array<{ label?: string; dose?: string; unit?: string }> | undefined

      let title = '饮食'
      let meta: string | null = null
      const tagNodes: ReactNode[] = []

      if (feedType === 'formula') {
        title = '配方奶'
        meta = milkLabel
      } else if (feedType === 'breast') {
        title = '母乳'
        const side = d.breast_side === 'left' ? '左侧' : d.breast_side === 'right' ? '右侧' : '双侧'
        meta = side
      } else if (feedType === 'complementary') {
        title = isSupp ? '营养素' : '辅食'
        if (!isSupp && food) meta = food
        // 营养素记录：以 Tag 形式展示具体营养素名称
        if (isSupp && suppItems && suppItems.length > 0) {
          suppItems.forEach((item, i) => {
            tagNodes.push(
              <Pill key={i} icon={IconPill} bg="#F3F0FF" color="#9B8ED8">
                {item.label}
              </Pill>
            )
          })
        }
      }

      return {
        primary: <div className={`${LIST_TITLE_CLS} shrink-0 truncate`}>{title}</div>,
        tags: tagNodes.length > 0 ? <div className="flex flex-wrap items-center gap-1">{tagNodes}</div> : null,
        meta: meta ? <span className={`${LIST_META_CLS} truncate`}>{meta}</span> : null,
      }
    }

    case 'sleep': {
      const ongoing = d.status === 'ongoing'
      const period = d.sleep_period as string | undefined
      const periodLabel = period ? (SLEEP_PERIOD_LABELS[period] ?? period) : null

      const primary = (
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className={`${LIST_TITLE_CLS} truncate inline-flex items-center gap-1.5`}>
            {ongoing && <LiveDot />}
            {ongoing ? '睡眠中' : '睡眠'}
          </span>
          {ongoing && (
            <Pill icon={IconClock} color="#F87098" bg="#FFF0F4">
              进行中
            </Pill>
          )}
        </div>
      )

      return {
        primary,
        tags: null,
        meta: periodLabel ? <span className={`${LIST_META_CLS} truncate`}>{periodLabel}</span> : null,
      }
    }

    case 'diaper': {
      const diaperType = d.diaper_type as string | undefined
      const poopType = d.poop_type as string | undefined
      const hasPoop = diaperType === 'dirty' || diaperType === 'mixed'
      const hasWet = diaperType === 'wet' || diaperType === 'mixed'
      const isDry = diaperType === 'dry'
      const typeLabel = diaperType ? (DIAPER_CARD_LABELS[diaperType] ?? diaperType) : null
      const poopLabel = poopType ? (POOP_TYPE_LABELS[poopType] ?? poopType) : null

      const tagNodes: ReactNode[] = []
      if (isDry)  tagNodes.push(<Pill key="dry"  icon={IconLeaf} bg="#F5F5F5" color="#9A8090">{typeLabel}</Pill>)
      if (hasPoop) tagNodes.push(<Pill key="dirty" icon={IconPoop} bg="#FFF8EC" color="#B07820">{hasPoop && !hasWet ? typeLabel : '臭臭'}</Pill>)
      if (hasWet)  tagNodes.push(<Pill key="wet"  icon={IconDrop} bg="#E8F5FD" color="#2080B8">{hasWet && !hasPoop ? typeLabel : '嘘嘘'}</Pill>)
      if (poopLabel && hasPoop) tagNodes.push(<Pill key="poop-type" bg="#FFF5EE" color="#C05020">{poopLabel}</Pill>)

      return {
        primary: <div className={`${LIST_TITLE_CLS} shrink-0`}>换尿布</div>,
        tags:
          tagNodes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">{tagNodes}</div>
          ) : null,
        meta: null,
      }
    }

    case 'activity': {
      const actType = d.activity_type as string | undefined
      const actLabel = actType ? (ACTIVITY_TYPE_LABELS[actType] ?? actType) : null
      const ActIcon = actType ? (ACTIVITY_ICON_MAP[actType] ?? IconActivity) : null

      return {
        primary: <div className={`${LIST_TITLE_CLS} shrink-0`}>活动</div>,
        tags:
          actLabel && ActIcon ? (
            <div className="flex flex-wrap items-center gap-1">
              <Pill icon={ActIcon} bg="#FFF0F4" color="#E85580">
                {actLabel}
              </Pill>
            </div>
          ) : null,
        meta: null,
      }
    }

    case 'symptom': {
      const mood = d.mood as string | undefined
      const spirit = d.spirit as string | undefined
      const moodLabel = mood ? (MOOD_LABELS[mood] ?? mood) : null
      const spiritLabel = spirit ? (SPIRIT_LABELS[spirit] ?? spirit) : null
      const MoodIcon = mood ? (MOOD_ICON_MAP[mood] ?? IconFaceNeutral) : null

      const tagNodes: ReactNode[] = []
      if (moodLabel && MoodIcon) {
        tagNodes.push(
          <Pill key="mood" icon={MoodIcon} bg="#FFF0F4" color="#E85580">
            {moodLabel}
          </Pill>
        )
      }
      if (spiritLabel) {
        tagNodes.push(
          <Pill key="spirit" icon={IconZap} bg="#FFF8E6" color="#C0922A">
            {spiritLabel}
          </Pill>
        )
      }

      return {
        primary: <div className={`${LIST_TITLE_CLS} shrink-0`}>表现记录</div>,
        tags: tagNodes.length > 0 ? <div className="flex flex-wrap items-center gap-1">{tagNodes}</div> : null,
        meta: null,
      }
    }

    case 'health': {
      const temp = d.temperature as number | undefined
      const isFever = temp != null && temp >= 37.5
      const meds = d.medications as Array<{ name: string }> | undefined
      const hasAllergy = (d.allergy_symptoms as string[] | undefined)?.length

      const tagNodes: ReactNode[] = []
      if (isFever) {
        tagNodes.push(
          <Pill key="fever" icon={IconThermometer} bg="#FFF1F4" color="#F05070">
            发热
          </Pill>
        )
      }
      if (hasAllergy) {
        tagNodes.push(
          <Pill key="allergy" icon={IconAlertTriangle} bg="#FFF1F4" color="#F05070">
            过敏
          </Pill>
        )
      }
      if (meds && meds.length > 0) {
        tagNodes.push(
          <Pill key="med" icon={IconPill} bg="#F3F0FF" color="#9B8ED8">
            {meds[0].name}
          </Pill>
        )
      }

      return {
        primary: <div className={`${LIST_TITLE_CLS} shrink-0`}>健康记录</div>,
        tags: tagNodes.length > 0 ? <div className="flex flex-wrap items-center gap-1">{tagNodes}</div> : null,
        meta: null,
      }
    }

    case 'growth': {
      const h  = d.height_mm != null ? (Number(d.height_mm) / 10).toFixed(1) : null
      const w  = d.weight_g  != null ? (Number(d.weight_g) / 1000).toFixed(2) : null
      const hc = d.head_mm   != null ? (Number(d.head_mm) / 10).toFixed(1) : null

      const chips: React.ReactNode[] = []
      if (h)  chips.push(<SummaryMetric key="h"  value={h}  unit="cm"    color="#9B8ED8" bg="#F3F0FF" />)
      if (w)  chips.push(<SummaryMetric key="w"  value={w}  unit="kg"    color="#9B8ED8" bg="#F3F0FF" />)
      if (hc) chips.push(<SummaryMetric key="hc" value={hc} unit="cm头围" color="#9B8ED8" bg="#F3F0FF" />)

      return {
        primary: <div className={`${LIST_TITLE_CLS} shrink-0`}>生长记录</div>,
        tags: chips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">{chips}</div>
        ) : null,
        meta: null,
      }
    }

    case 'medical': {
      const visitType = d.visit_type as string | undefined
      const hospital = d.hospital as string | undefined
      const typeLabel = visitType ? (VISIT_TYPE_LABELS[visitType] ?? visitType) : '就诊'

      return {
        primary: <div className={`${LIST_TITLE_CLS} shrink-0`}>医疗</div>,
        tags: (
          <div className="flex flex-wrap items-center gap-1">
            <Pill icon={IconHospital} bg="#F0F4FF" color="#5B9BD5">
              {typeLabel}
            </Pill>
          </div>
        ),
        meta: hospital ? <span className={`${LIST_META_CLS} truncate`}>{hospital}</span> : null,
      }
    }

    default: {
      const cfg = RECORD_TYPE_CFG[type]
      return {
        primary: <div className={`${LIST_TITLE_CLS} truncate`}>{cfg?.label ?? type}</div>,
        tags: null,
        meta: null,
      }
    }
  }
}

// ── getRecordSummary：提取右侧核心数值摘要 ───────────────────────

/**
 * 提取各记录类型的核心数值，返回右侧显示的摘要 JSX。
 * 仅在列表页 compact 模式下使用。
 */
export function getRecordSummary(
  type: string,
  d: Record<string, unknown>
): React.ReactNode | null {
  switch (type) {
    case 'feeding': {
      const feedType = d.feed_type as string | undefined
      if (feedType === 'formula') {
        const ml = d.formula_ml as number | undefined
        if (ml) return <SummaryMetric value={ml} unit="ml" />
      }
      if (feedType === 'breast') {
        const dur = d.duration_min as number | undefined
        if (dur) return <SummaryMetric value={fmtDuration(dur)} />
      }
      if (feedType === 'complementary') {
        const amountG = d.amount_g as number | undefined
        if (amountG) return <SummaryMetric value={amountG} unit="g" color="#B07820" bg="#FFF8E6" />
      }
      return null
    }

    case 'sleep': {
      const ongoing = d.status === 'ongoing'
      const durMin = d.duration_min as number | undefined
      if (!durMin) return null
      if (ongoing) {
        return <SummaryMetric value={fmtDuration(durMin)} active color="#F87098" bg="#FFF0F4" />
      }
      return <SummaryMetric value={fmtDuration(durMin)} color="#C0922A" bg="#FFF8E6" />
    }

    case 'health': {
      const temp = d.temperature as number | undefined
      if (temp != null) {
        const isFever = temp >= 37.5
        return (
          <SummaryMetric
            value={temp}
            unit="℃"
            color={isFever ? '#F05070' : '#F87098'}
            bg={isFever ? '#FFF1F4' : '#FFF0F4'}
            active={isFever}
          />
        )
      }
      return null
    }

    case 'growth':
      return null

    case 'activity': {
      const durMin = d.duration_min as number | undefined
      if (durMin) return <SummaryMetric value={fmtDuration(durMin)} color="#C0922A" bg="#FFF8E6" />
      return null
    }

    case 'diaper':
    case 'symptom':
    case 'medical':
    default:
      return null
  }
}

// ── 主分派组件（供外部直接使用） ─────────────────────────────────────────

/**
 * 根据 type 字段分派渲染对应记录类型的内容
 *
 * @param compact  true = 仅标题/标签行（列表页用），false = 完整展示（首页时间线用）
 *
 * detail 来源兼容：
 *   - TodayRecord.detail（首页时间线）
 *   - RecordItem 展平字段（记录列表页）
 *
 * @example
 * <RecordContent type="feeding" detail={{ feed_type: 'formula', formula_ml: 120 }} />
 * <RecordContent type="feeding" detail={...} compact />
 */
export default function RecordContent({
  type,
  detail,
  compact = false,
}: {
  type: string
  detail?: Record<string, unknown> | null
  compact?: boolean
}) {
  const d: Record<string, unknown> = detail ?? {}

  if (compact) {
    const { primary, tags, meta } = getRecordListCompactParts(type, d)
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {primary}
        {tags}
        {meta}
      </div>
    )
  }

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
