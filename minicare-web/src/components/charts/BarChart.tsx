/**
 * 柱状图组件
 * 用于展示每日数据对比（如每日大便次数、每日睡眠时长等）
 */
import React from 'react'
import type { BarChartProps, DataPoint } from './types'

const DEFAULT_COLORS = {
  primary: '#F87098',
  secondary: '#9B8ED8',
  tertiary: '#7EC8E3',
  quaternary: '#F5A962',
  quinary: '#6BCB77',
}

const DEFAULT_PADDING = { top: 20, right: 10, bottom: 40, left: 50 }

export function BarChart({
  data,
  width,
  height = 200,
  padding = {},
  colors = DEFAULT_COLORS,
  axis = {},
  showDots = false,
  showValues = false,
  barWidth = 0.6,
  rounded = true,
  className,
}: BarChartProps) {
  const pad = { ...DEFAULT_PADDING, ...padding }
  const chartWidth = width ?? 300
  const chartHeight = height
  const fillContainer = width == null
  const innerWidth = chartWidth - pad.left - pad.right
  const innerHeight = chartHeight - pad.top - pad.bottom

  if (data.length === 0) {
    return (
      <div
        className={`flex w-full min-w-0 items-center justify-center bg-gray-50 rounded-lg ${className || ''}`}
        style={fillContainer ? { height: chartHeight } : { width: chartWidth, height: chartHeight }}
      >
        <span className="text-gray-400 text-sm">暂无数据</span>
      </div>
    )
  }

  // 计算数据范围
  const values = data.map((d) => d.value)
  const yMin = axis.yMin ?? 0
  const yMax = axis.yMax ?? (Math.max(...values) * 1.2 || 10)
  const yRange = yMax - yMin || 1

  // 柱子尺寸
  const barSpacing = innerWidth / data.length
  const actualBarWidth = barSpacing * barWidth

  // Y 轴刻度
  const yTicks = 4
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    const value = yMin + (yRange * i) / yTicks
    return axis.yFormat ? axis.yFormat(value) : Math.round(value).toString()
  })

  // X 轴标签间隔
  const xLabelInterval = axis.xLabelInterval ?? Math.ceil(data.length / 6)

  // 计算柱子位置和高度
  const bars = data.map((d, i) => {
    const x = pad.left + i * barSpacing + (barSpacing - actualBarWidth) / 2
    const barHeight = Math.max(2, ((d.value - yMin) / yRange) * innerHeight)
    const y = pad.top + innerHeight - barHeight
    return {
      x,
      y,
      width: actualBarWidth,
      height: barHeight,
      label: d.label,
      value: d.value,
    }
  })

  return (
    <div className={`w-full min-w-0 ${className || ''}`}>
      <svg
        width={fillContainer ? '100%' : chartWidth}
        height={chartHeight}
        className="block"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio={fillContainer ? 'none' : 'xMidYMid meet'}
      >
      {/* 网格线 */}
      {axis.showGrid !== false && (
        <g className="grid-lines">
          {yTickValues.map((_, i) => {
            const y = pad.top + (i * innerHeight) / yTicks
            return (
              <line
                key={i}
                x1={pad.left}
                y1={y}
                x2={chartWidth - pad.right}
                y2={y}
                stroke="#E5E7EB"
                strokeWidth={1}
                strokeDasharray="4 2"
              />
            )
          })}
        </g>
      )}

      {/* Y 轴标签 */}
      <g className="y-axis-labels">
        {yTickValues.map((label, i) => {
          const y = pad.top + (i * innerHeight) / yTicks
          return (
            <text
              key={i}
              x={pad.left - 8}
              y={y + 4}
              textAnchor="end"
              fill="#9CA3AF"
              fontSize={11}
            >
              {label}
            </text>
          )
        })}
      </g>

      {/* 柱子 */}
      <g className="bars">
        {bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            fill={colors.primary}
            rx={rounded ? 4 : 0}
            ry={rounded ? 4 : 0}
          />
        ))}
      </g>

      {/* 数值标签 */}
      {showValues && (
        <g className="value-labels">
          {bars.map((bar, i) => (
            <text
              key={i}
              x={bar.x + bar.width / 2}
              y={bar.y - 6}
              textAnchor="middle"
              fill={colors.primary}
              fontSize={10}
              fontWeight={500}
            >
              {axis.yFormat ? axis.yFormat(bar.value) : bar.value}
            </text>
          ))}
        </g>
      )}

      {/* X 轴标签 */}
      <g className="x-axis-labels">
        {data.map((d, i) => {
          if (i % xLabelInterval !== 0 && i !== data.length - 1) return null
          const x = pad.left + i * barSpacing + barSpacing / 2
          return (
            <text
              key={i}
              x={x}
              y={chartHeight - pad.bottom + 20}
              textAnchor="middle"
              fill="#9CA3AF"
              fontSize={11}
            >
              {d.label}
            </text>
          )
        })}
      </g>
      </svg>
    </div>
  )
}
