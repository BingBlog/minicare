/**
 * TodayTimeline 今日时间线组件
 *
 * 首页 L2 区第二张卡片：按时间降序展示今日所有记录。
 * 每条记录对重点信息做突出展示（数值 chip、状态 pill 等）。
 * 空状态时显示引导提示。
 *
 * 被引用：HomePage.tsx
 */
import { useNavigate } from 'react-router-dom'
import RecordTypeIcon from '@/components/record/RecordTypeIcon'
import { RECORD_TYPE_CFG } from '@/lib/constants'
import {
  SLEEP_PERIOD_LABELS,
  SLEEP_QUALITY_LABELS,
  DIAPER_TYPE_LABELS,
  POOP_TYPE_LABELS,
  ACTIVITY_TYPE_LABELS,
  MOOD_LABELS,
  SPIRIT_LABELS,
  VISIT_TYPE_LABELS,
} from '@/lib/constants'
import { formatTime } from '@/lib/utils'
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
  IconChevronRight,
  IconActivity,
} from '@/components/ui/icons'
import type { TodayRecord } from '@/api/types'
import type { IconProps } from '@/components/ui/icons'

/** 奶粉类型 key → 中文名（统一从 milkTypeOptions 派生） */
const MILK_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  milkTypeOptions.map((o) => [o.key, o.label])
)

/** 情绪 key → 对应图标组件 */
const MOOD_ICON_MAP: Record<string, (p: IconProps) => React.ReactElement> = {
  happy:   IconFaceHappy,
  neutral: IconFaceNeutral,
  fussy:   IconFaceFussy,
  crying:  IconFaceCrying,
}

/** 活动类型 key → 对应图标组件 */
const ACTIVITY_ICON_MAP: Record<string, (p: IconProps) => React.ReactElement> = {
  bath:       IconBath,
  outdoor:    IconSun,
  play:       IconPlay2,
  tummy_time: IconBaby,
  other:      IconRun,
}

/** TodayTimeline 属性 */
interface TodayTimelineProps {
  /** 今日记录列表（已按时间降序排列） */
  records: TodayRecord[]
  /** 点击单条记录回调（用于弹出 ActionSheet） */
  onRecordClick?: (record: TodayRecord) => void
}

// ── 公共子组件 ────────────────────────────────────────────────────

/** 数值型 chip：粉色浅底，数值粗体 */
function MetricChip({ value, unit, active }: { value: string | number; unit?: string; active?: boolean }) {
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

/** 暖金色 chip：用于完成的睡眠时长 */
function DoneMetricChip({ value, unit }: { value: string | number; unit?: string }) {
  return (
    <span className="inline-flex items-baseline gap-px rounded-md px-1.5 py-0.5 flex-shrink-0" style={{ background: '#FFF8E6' }}>
      <span className="font-extrabold tracking-tight" style={{ fontSize: 15, lineHeight: 1.2, color: '#C0922A', letterSpacing: '-0.5px' }}>
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

/** 圆形胶囊 pill：带可选 icon */
function Pill({
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
function FoodChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-semibold"
      style={{ fontSize: 11, background: '#FFF8E6', color: '#B07820' }}
    >
      {children}
    </span>
  )
}

/** 进行中呼吸小点 */
function LiveDot() {
  return (
    <span
      className="inline-block rounded-full flex-shrink-0 mr-0.5"
      style={{
        width: 6,
        height: 6,
        background: '#F87098',
        verticalAlign: 'middle',
        animation: 'tl-pulse 2s infinite',
      }}
    />
  )
}

// ── 各记录类型的内容渲染 ──────────────────────────────────────────

/** 将分钟数格式化为 "Xh Ym" 或 "Ym" */
function fmtDuration(min?: number | null): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/** feeding 记录内容 */
function FeedingContent({ d }: { d: Record<string, unknown> }) {
  const feedType = d.feed_type as string | undefined

  if (feedType === 'formula') {
    const ml = d.formula_ml as number | undefined
    const milkTypes = d.milk_types as string[] | undefined
    const milkLabel = milkTypes && milkTypes.length > 0
      ? milkTypes.map(k => MILK_TYPE_LABELS[k] ?? k).join('/')
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

/** sleep 记录内容 */
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
          ? (ongoing
            ? <MetricChip value={fmtDuration(durMin)} active />
            : <DoneMetricChip value={fmtDuration(durMin)} />)
          : null
        }
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

/** diaper 记录内容 */
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

/** activity 记录内容 */
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

/** symptom/表现 记录内容 */
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

/** health 记录内容 */
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

/** growth 记录内容 */
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

/** medical 记录内容 */
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

// ── 内容分派器 ──────────────────────────────────────────────────

function RecordContent({ type, detail }: { type: string; detail?: Record<string, unknown> | null }) {
  const d: Record<string, unknown> = detail ?? {}

  switch (type) {
    case 'feeding':  return <FeedingContent d={d} />
    case 'sleep':    return <SleepContent   d={d} />
    case 'diaper':   return <DiaperContent  d={d} />
    case 'activity': return <ActivityContent d={d} />
    case 'symptom':  return <SymptomContent d={d} />
    case 'health':   return <HealthContent  d={d} />
    case 'growth':   return <GrowthContent  d={d} />
    case 'medical':  return <MedicalContent d={d} />
    default: {
      const cfg = RECORD_TYPE_CFG[type]
      return <div className="text-sm font-medium" style={{ color: '#7a5a60' }}>{cfg?.label ?? type}</div>
    }
  }
}

// ── 主组件 ───────────────────────────────────────────────────────

/**
 * 今日时间线卡片
 *
 * 每条记录按类型突出展示核心数值：
 * - 饮食：奶量 metric chip
 * - 睡眠：时长 chip + 进行中呼吸动效
 * - 尿布：类型/性状彩色 pill（含语义 icon）
 * - 活动：活动类型 pill + 时长 chip
 * - 表现：情绪/精神 pill
 * - 健康：体温 chip + 症状 pill
 * - 生长：身高/体重 chip
 * - 医疗：就诊类型 pill
 */
export default function TodayTimeline({ records, onRecordClick }: TodayTimelineProps) {
  const navigate = useNavigate()

  return (
    <>
      {/* 呼吸动效 keyframes（注入一次即可） */}
      <style>{`
        @keyframes tl-pulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(248,112,152,0.25); }
          50%       { box-shadow: 0 0 0 5px rgba(248,112,152,0.06); }
        }
      `}</style>

      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 2px 12px rgba(200,100,120,0.08), 0 1px 3px rgba(0,0,0,0.04)' }}
      >
        {/* 标题行 */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5">
          <span className="text-[11px] font-semibold text-[#9A8090] tracking-[0.8px] uppercase">
            今日时间线
          </span>
          <span
            className="text-xs text-primary font-medium cursor-pointer"
            onClick={() => navigate('/records')}
          >
            全部 ›
          </span>
        </div>

        {/* 空状态 */}
        {records.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="mb-2 flex justify-center">
              <RecordTypeIcon type="feeding" containerSize={40} iconSize={20} />
            </div>
            <div className="text-sm text-subtext">今日尚无记录</div>
            <div className="text-xs text-subtext/70 mt-1">点击上方快捷按钮开始记录</div>
          </div>
        ) : (
          records.map((rec, i) => {
            return (
              <div
                key={rec.id}
                className="flex items-start gap-3 px-4 py-3 cursor-pointer active:bg-[#FFF9FA] transition-colors"
                style={i > 0 ? { borderTop: '1px solid #F5F0F2' } : {}}
                onClick={() => onRecordClick ? onRecordClick(rec) : navigate('/records')}
              >
                {/* 左侧时间戳 */}
                <span
                  className="text-xs flex-shrink-0 w-10 text-right pt-0.5"
                  style={{ color: '#9A8090' }}
                >
                  {formatTime(rec.time)}
                </span>

                {/* 记录类型图标 */}
                <div className="flex-shrink-0 mt-0.5">
                  <RecordTypeIcon type={rec.type} containerSize={32} iconSize={16} />
                </div>

                {/* 内容区：按记录类型渲染重点信息 */}
                <div className="flex-1 min-w-0">
                  <RecordContent type={rec.type} detail={rec.detail} />
                  {/* 备注（有备注时额外展示） */}
                  {rec.note && (
                    <div
                      className="text-xs truncate mt-1"
                      style={{ color: '#B0A0A4' }}
                    >
                      {rec.note}
                    </div>
                  )}
                </div>

                {/* 操作指示 */}
                <IconChevronRight size={14} color="#C0A8AD" style={{ flexShrink: 0, marginTop: 2 }} />
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
