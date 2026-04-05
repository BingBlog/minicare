/**
 * 折线图组件
 * 用于展示趋势数据（如奶量变化、睡眠时长等）
 */
import React from 'react'
import type { LineChartProps, DataPoint } from './types'

const DEFAULT_COLORS = {
  primary: '#F87098',
  secondary: '#9B8ED8',
  tertiary: '#7EC8E3',
  quaternary: '#F5A962',
  quinary: '#6BCB77',
}

const DEFAULT_PADDING = { top: 20, right: 20, bottom: 40, left: 50 }

export function LineChart({
  data,
  width,
  height = 200,
  padding = {},
  colors = DEFAULT_COLORS,
  axis = {},
  showDots = true,
  showValues = false,
  fillArea = false,
  smooth = true,
  className,
}: LineChartProps) {
  const pad = { ...DEFAULT_PADDING, ...padding }
  const chartWidth = width || 300
  const chartHeight = height
  const innerWidth = chartWidth - pad.left - pad.right
  const innerHeight = chartHeight - pad.top - pad.bottom

  if (data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 rounded-lg ${className || ''}`}
        style={{ width: chartWidth, height: chartHeight }}
      >
        <span className="text-gray-400 text-sm">暂无数据</span>
      </div>
    )
  }

  // 计算数据范围
  const values = data.map((d) => d.value)
  const yMin = axis.yMin ?? Math.min(0, ...values)
  const yMax = axis.yMax ?? (Math.max(...values) * 1.1 || 10)
  const yRange = yMax - yMin || 1

  // X 轴比例
  const xStep = innerWidth / Math.max(1, data.length - 1)

  // Y 轴刻度
  const yTicks = 4
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    const value = yMin + (yRange * i) / yTicks
    return axis.yFormat ? axis.yFormat(value) : Math.round(value).toString()
  })

  // 生成路径点
  const points = data.map((d, i) => ({
    x: pad.left + i * xStep,
    y: pad.top + innerHeight - ((d.value - yMin) / yRange) * innerHeight,
    label: d.label,
    value: d.value,
  }))

  // 生成折线路径
  const linePath = points
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`
      if (smooth) {
        const prev = points[i - 1]
        const cpx = (prev.x + p.x) / 2
        return `C ${cpx} ${prev.y} ${cpx} ${p.y} ${p.x} ${p.y}`
      }
      return `L ${p.x} ${p.y}`
    })
    .join(' ')

  // 生成填充区域路径
  const areaPath = fillArea
    ? `${linePath} L ${points[points.length - 1].x} ${pad.top + innerHeight} L ${points[0].x} ${pad.top + innerHeight} Z`
    : ''

  // X 轴标签间隔
  const xLabelInterval = axis.xLabelInterval ?? Math.ceil(data.length / 6)

  return (
    <svg
      width={chartWidth}
      height={chartHeight}
      className={className}
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
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

      {/* 填充区域 */}
      {fillArea && (
        <path d={areaPath} fill={colors.primary} fillOpacity={0.15} />
      )}

      {/* 折线 */}
      <path
        d={linePath}
        fill="none"
        stroke={colors.primary}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 数据点 */}
      {showDots && (
        <g className="data-points">
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3}
              fill={colors.primary}
              stroke="white"
              strokeWidth={2}
            />
          ))}
        </g>
      )}

      {/* 数值标签 */}
      {showValues && (
        <g className="value-labels">
          {points.map((p, i) => (
            <text
              key={i}
              x={p.x}
              y={p.y - 8}
              textAnchor="middle"
              fill={colors.primary}
              fontSize={10}
              fontWeight={500}
            >
              {axis.yFormat ? axis.yFormat(p.value) : p.value}
            </text>
          ))}
        </g>
      )}

      {/* X 轴标签 */}
      <g className="x-axis-labels">
        {data.map((d, i) => {
          if (i % xLabelInterval !== 0 && i !== data.length - 1) return null
          const x = pad.left + i * xStep
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
  )
}
