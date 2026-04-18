/**
 * 散点图组件（Recharts 版）
 * 用于报告页体温、情绪等按日分布展示
 */
import React from 'react'
import {
  ScatterChart as RechartsScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { ScatterChartProps } from './types'

// ─── 散点形状（模块级）────────────────────────────────────────────────────

interface ScatterDotProps {
  cx?: number
  cy?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any
}

function ScatterDot({ cx = 0, cy = 0, payload }: ScatterDotProps) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={payload?.r ?? 5}
      fill={payload?.color ?? '#F87098'}
      stroke="white"
      strokeWidth={2}
    />
  )
}

// ─── Tooltip（模块级）────────────────────────────────────────────────────

interface ScatterTooltipProps {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  xLabels: string[]
  yFormat?: (v: number) => string
}

function ScatterTooltip({ active, payload, xLabels, yFormat }: ScatterTooltipProps) {
  if (!active || !payload?.length) return null
  const pt = payload[0]?.payload
  if (!pt) return null
  return (
    <div className="bg-white rounded-xl px-3 py-2 shadow-lg border border-gray-100 text-xs pointer-events-none">
      <p className="text-gray-500 mb-0.5">{xLabels[pt.x] ?? pt.x}</p>
      <p className="font-semibold" style={{ color: pt.color }}>
        {yFormat ? yFormat(pt.y) : pt.y}
      </p>
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────

export function ScatterChart({
  points,
  xSlotCount,
  xLabels,
  yMin,
  yMax,
  yFormat,
  height = 200,
  yTicks = 4,
  xLabelInterval,
  className,
}: ScatterChartProps) {
  if (points.length === 0) {
    return (
      <div
        className={`flex w-full min-w-0 items-center justify-center bg-gray-50 rounded-lg ${className || ''}`}
        style={{ height }}
      >
        <span className="text-gray-400 text-sm">暂无数据</span>
      </div>
    )
  }

  // Recharts 的 ScatterChart 需要数值型 X 轴，用 xSlot 0..xSlotCount-1 映射
  const chartData = points.map((p) => ({
    x: p.xSlot,
    y: p.y,
    r: p.r,
    color: p.color,
  }))

  // X 轴刻度：只显示部分 label
  const interval = xLabelInterval ?? Math.max(1, Math.ceil(xSlotCount / 7))
  const xTicks = xLabels
    .map((_, i) => i)
    .filter((i) => i % interval === 0 || i === xSlotCount - 1)

  const xTickFormatter = (v: number) => xLabels[v] ?? ''
  const yTickFormatter = yFormat ? yFormat : (v: number) => String(Math.round(v * 100) / 100)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipContent = (props: any) => (
    <ScatterTooltip {...props} xLabels={xLabels} yFormat={yFormat} />
  )

  return (
    <div className={`w-full min-w-0 ${className || ''}`}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsScatterChart margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="4 2" stroke="#E5E7EB" vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={[-0.5, xSlotCount - 0.5]}
            ticks={xTicks}
            tickFormatter={xTickFormatter}
            tick={{ fontSize: 11, fill: '#9CA3AF' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            dataKey="y"
            type="number"
            domain={[yMin, yMax]}
            tickCount={yTicks + 1}
            tick={{ fontSize: 11, fill: '#9CA3AF' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={yTickFormatter}
            width={44}
          />
          <Tooltip content={tooltipContent} cursor={false} />
          {/* Cell 不用于 ScatterChart（shape 已自定义颜色），直接删除 */}
          <Scatter data={chartData} shape={<ScatterDot />} isAnimationActive={false} />
        </RechartsScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
