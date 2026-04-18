/**
 * 堆积柱状图组件（Recharts 版）
 * 用于展示各类型占比（如母乳/配方奶/辅食占比）
 */
import React from 'react'
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { StackedBarChartProps } from './types'

// ─── Tooltip 提升到模块级，避免在 render 内定义导致每次重新创建组件引发闪烁 ───

interface StackedBarTooltipProps {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  label?: string
  seriesLabels?: Record<string, string>
  yFormat?: (v: number) => string
}

function StackedBarTooltip({
  active,
  payload,
  label,
  seriesLabels,
  yFormat,
}: StackedBarTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl px-3 py-2 shadow-lg border border-gray-100 text-xs pointer-events-none">
      <p className="text-gray-500 mb-1">{label}</p>
      {payload
        .filter((entry: { value: number }) => entry.value > 0)
        .map((entry: { dataKey: string; value: number; color: string }) => (
          <p key={entry.dataKey} className="font-semibold" style={{ color: entry.color }}>
            {seriesLabels?.[entry.dataKey] ?? entry.dataKey}：
            {yFormat ? yFormat(entry.value) : entry.value}
          </p>
        ))}
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────

export function StackedBarChart({
  data,
  height = 200,
  seriesOrder,
  seriesColors,
  seriesLabels,
  axis = {},
  showLegend = true,
  barWidth = 0.6,
  className,
}: StackedBarChartProps) {
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

  // 计算每根柱子总和，确定 Y 轴最大值
  const totals = data.map((d) =>
    seriesOrder.reduce((sum, key) => sum + (d.values[key] || 0), 0),
  )
  const yTicks = 4
  const maxTotal = Math.max(0, ...totals)
  const rawYMax = maxTotal > 0 ? maxTotal * 1.2 : 10
  const yMax = axis.yMax ?? Math.max(1, Math.ceil(rawYMax / yTicks) * yTicks)
  const yMin = axis.yMin ?? 0

  const tickFormatter = axis.yFormat ? axis.yFormat : (v: number) => String(Math.round(v))

  // 构建 Recharts 数据格式
  const chartData = data.map((d) => ({
    label: d.label,
    ...Object.fromEntries(seriesOrder.map((key) => [key, d.values[key] ?? 0])),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipContent = (props: any) => (
    <StackedBarTooltip {...props} seriesLabels={seriesLabels} yFormat={axis.yFormat} />
  )

  const lastKey = seriesOrder[seriesOrder.length - 1]

  return (
    <div className={`w-full min-w-0 ${className || ''}`}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={chartData}
          margin={{ top: 10, right: 10, bottom: 5, left: 10 }}
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
          {seriesOrder.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="stack"
              fill={seriesColors[key] ?? '#9CA3AF'}
              isAnimationActive={false}
              name={seriesLabels?.[key] ?? key}
              // 只给最顶层（最后一个系列）加圆角
              radius={key === lastKey ? [4, 4, 0, 0] : undefined}
            />
          ))}
          {showLegend && (
            <Legend
              iconType="square"
              iconSize={10}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
          )}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}
