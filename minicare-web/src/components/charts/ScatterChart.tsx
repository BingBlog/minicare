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
  Cell,
} from 'recharts'
import type { ScatterChartProps } from './types'

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
  // 将 ScatterChartPoint 转换为 recharts 所需格式（加上 y 值和颜色）
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

  // 自定义 Tooltip
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload }: any) => {
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

  // 自定义散点形状（根据 r 调整大小）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props
    return (
      <circle
        cx={cx}
        cy={cy}
        r={payload.r}
        fill={payload.color}
        stroke="white"
        strokeWidth={2}
      />
    )
  }

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
          <Tooltip content={<CustomTooltip />} cursor={false} />
          <Scatter
            data={chartData}
            shape={<CustomDot />}
            isAnimationActive={false}
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Scatter>
        </RechartsScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
