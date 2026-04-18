/**
 * 柱状图组件（Recharts 版）
 * 用于展示每日数据对比（如每日大便次数、每日睡眠时长等）
 */
import React from 'react'
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import type { BarChartProps } from './types'

const DEFAULT_COLORS = {
  primary: '#F87098',
  secondary: '#9B8ED8',
  tertiary: '#7EC8E3',
  quaternary: '#F5A962',
  quinary: '#6BCB77',
}

// ─── Tooltip 提升到模块级，避免在 render 内定义导致每次重新创建组件引发闪烁 ───

interface BarTooltipProps {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  label?: string
  barColor: string
  yFormat?: (v: number) => string
}

function BarTooltip({ active, payload, label, barColor, yFormat }: BarTooltipProps) {
  if (!active || !payload?.length) return null
  const value = payload[0]?.value
  return (
    <div className="bg-white rounded-xl px-3 py-2 shadow-lg border border-gray-100 text-xs pointer-events-none">
      <p className="text-gray-500 mb-0.5">{label}</p>
      <p className="font-semibold" style={{ color: barColor }}>
        {yFormat ? yFormat(value) : value}
      </p>
    </div>
  )
}

// ─── 柱顶标签（模块级，参数稳定）────────────────────────────────────────────

interface BarLabelProps {
  x?: number
  y?: number
  width?: number
  value?: number
  barColor: string
  yFormat?: (v: number) => string
}

function BarLabel({ x = 0, y = 0, width = 0, value, barColor, yFormat }: BarLabelProps) {
  if (value == null) return null
  return (
    <text
      x={x + width / 2}
      y={y - 4}
      textAnchor="middle"
      fill={barColor}
      fontSize={10}
      fontWeight={500}
    >
      {yFormat ? yFormat(value) : value}
    </text>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────

export function BarChart({
  data,
  height = 200,
  colors = DEFAULT_COLORS,
  axis = {},
  showValues = false,
  barWidth = 0.6,
  rounded = false,
  className,
}: BarChartProps) {
  if (data.length === 0) {
    return (
      <div
        className={`flex w-full min-w-0 items-center justify-center bg-gray-50 rounded-lg ${className || ''}`}
        style={{ height }}
      >
        <span className="text-gray-400 text-sm">暂无数据</span>
      </div>
    )
  }

  const values = data.map((d) => d.value)
  const yMin = axis.yMin ?? 0
  const yMax = axis.yMax ?? (Math.max(...values) * 1.2 || 10)
  const barColor = colors.primary ?? DEFAULT_COLORS.primary
  const tickFormatter = axis.yFormat ? axis.yFormat : (v: number) => String(Math.round(v))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipContent = (props: any) => (
    <BarTooltip {...props} barColor={barColor} yFormat={axis.yFormat} />
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLabel = (props: any) => {
    if (!showValues) return null
    return <BarLabel {...props} barColor={barColor} yFormat={axis.yFormat} />
  }

  return (
    <div className={`w-full min-w-0 ${className || ''}`}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={data}
          margin={{ top: 16, right: 10, bottom: 5, left: 10 }}
          barCategoryGap={`${Math.round((1 - barWidth) * 100)}%`}
        >
          <CartesianGrid strokeDasharray="4 2" stroke="#E5E7EB" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#9CA3AF' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 11, fill: '#9CA3AF' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFormatter}
            width={44}
          />
          <Tooltip content={tooltipContent} cursor={{ fill: 'rgba(248,112,152,0.06)' }} />
          <Bar
            dataKey="value"
            fill={barColor}
            radius={rounded ? [4, 4, 0, 0] : undefined}
            label={showValues ? renderLabel : undefined}
            isAnimationActive={false}
          />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}
