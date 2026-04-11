/**
 * RecordTypeIcon 记录类型图标组件
 *
 * 根据记录类型（feeding / sleep / diaper / ...）渲染对应的图标，
 * 并自动匹配视觉配置（背景色、图标前景色）。
 *
 * 被以下页面复用：
 * - HomePage（今日时间线）
 * - RecordsPage（记录列表）
 * - ReportPage（报告弹层各模块图标）
 *
 * 注意：不要在此组件内引入路由或 store，保持纯展示。
 */
import {
  IconMilk, IconMoon, IconDroplets, IconActivity,
  IconRuler, IconHeart, IconStethoscope, IconSmile, IconSupplementPill, IconThermometer,
  IconBreast, IconFood,
} from '@/components/ui/icons'
import { RECORD_TYPE_CFG } from '@/lib/constants'
import type { IconProps } from '@/components/ui/icons'

/** 支持的记录类型 key */
export type RecordTypeKey = 'feeding' | 'formula' | 'breast' | 'food' | 'sleep' | 'diaper' | 'activity' | 'health' | 'temperature' | 'growth' | 'medical' | 'symptom' | 'supplement'

/** 图标渲染函数映射（类型 key → 图标函数组件） */
const ICON_MAP: Record<RecordTypeKey, (props: IconProps) => React.ReactElement> = {
  feeding:     IconMilk,
  formula:     IconMilk,
  breast:      IconBreast,
  food:        IconFood,
  sleep:       IconMoon,
  diaper:      IconDroplets,
  activity:    IconActivity,
  growth:      IconRuler,
  health:      IconHeart,
  temperature: IconThermometer,
  medical:     IconStethoscope,
  symptom:     IconSmile,
  supplement:  IconSupplementPill,
}

/** RecordTypeIcon 属性 */
interface RecordTypeIconProps {
  /** 记录类型 key */
  type: string
  /** 容器尺寸（px），默认 36 */
  containerSize?: number
  /** 图标尺寸（px），默认 20 */
  iconSize?: number
  /** 圆角尺寸（px），默认 12（rounded-xl） */
  borderRadius?: number
}

/**
 * 记录类型图标（含背景色容器）
 *
 * @example
 * <RecordTypeIcon type="feeding" containerSize={36} />
 * <RecordTypeIcon type="sleep" containerSize={42} iconSize={22} />
 */
export default function RecordTypeIcon({
  type,
  containerSize = 36,
  iconSize = 20,
  borderRadius = 12,
}: RecordTypeIconProps) {
  // 从全局配置中获取视觉参数；不在配置中的 type 使用默认灰色
  const cfg = RECORD_TYPE_CFG[type] ?? { bg: '#F5F5F5', color: '#9A8090' }

  // 根据 type 选择对应图标，若没有匹配则回退到 activity 图标
  const IconComponent = ICON_MAP[type as RecordTypeKey] ?? IconActivity

  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: containerSize,
        height: containerSize,
        background: cfg.bg,
        borderRadius,
      }}
    >
      <IconComponent size={iconSize} color={cfg.color} />
    </div>
  )
}
