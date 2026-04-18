/**
 * 环形图组件（Recharts 版）
 * 用于展示比例数据（如情绪分布、大便性状分布等）
 */
import React from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { DonutChartProps } from './types'

export function DonutChart({
  data,
  size = 120,
  innerRadius = 0.6,
  showCenter = true,
  centerText,
  centerValue,
  className,
}: DonutChartProps) {
  if (data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 rounded-lg ${className || ''}`}
        style={{ width: size, height: size }}
      >
        <span className="text-gray-400 text-sm">暂无数据</span>
      </div>
    )
  }

  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (total === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 rounded-lg ${className || ''}`}
        style={{ width: size, height: size }}
      >
        <span className="text-gray-400 text-sm">无数据</span>
      </div>
    )
  }

  const outerR = size / 2 - 2
  const innerR = outerR * innerRadius

  // 自定义 Tooltip
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const entry = payload[0]
    const pct = Math.round((entry.value / total) * 100)
    return (
      <div className="bg-white rounded-xl px-3 py-2 shadow-lg border border-gray-100 text-xs pointer-events-none">
        <p className="font-semibold" style={{ color: entry.payload.color }}>
          {entry.name}
        </p>
        <p className="text-gray-500">{pct}%</p>
      </div>
    )
  }

  // 自定义中心标签（通过 SVG foreignObject 渲染，或直接在容器内叠加）
  const centerX = size / 2
  const centerY = size / 2

  return (
    <div className={className}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <PieChart width={size} height={size}>
          <Pie
            data={data}
            cx={centerX}
            cy={centerY}
            innerRadius={innerR}
            outerRadius={outerR}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
          {data.map((entry) => (
            <Cell key={entry.label} fill={entry.color} />
          ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>

        {/* 中心文字叠加层 */}
        {showCenter && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: size,
              height: size,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            {centerText && (
              <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
                {centerText}
              </span>
            )}
            {centerValue && (
              <span style={{ fontSize: 18, fontWeight: 600, color: '#F87098' }}>
                {centerValue}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-2 mt-2 justify-center">
        {data.map((d) => {
          const pct = Math.round((d.value / total) * 100)
          return (
            <div key={d.label} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-xs text-gray-600">
                {d.label} {pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
