/**
 * 堆积柱状图组件
 * 用于展示各类型占比（如母乳/配方奶/辅食占比）
 */
import React from 'react'
import type { StackedBarChartProps, SeriesDataPoint } from './types'
import {
  CHART_X_LABEL_BOTTOM_PAD,
  ChartRotatedXLabel,
  chartDefaultXLabelInterval,
} from './chartAxis'

const DEFAULT_PADDING = { top: 20, right: 10, bottom: CHART_X_LABEL_BOTTOM_PAD, left: 50 }

export function StackedBarChart({
  data,
  width,
  height = 200,
  padding = {},
  seriesOrder,
  seriesColors,
  seriesLabels,
  axis = {},
  showLegend = true,
  barWidth = 0.6,
  className,
}: StackedBarChartProps) {
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

  // 计算每根柱子的总和（用于确定 Y 轴最大值）
  const totals = data.map((d) =>
    seriesOrder.reduce((sum, key) => sum + (d.values[key] || 0), 0)
  )
  const yTicks = 4

  const maxTotal = Math.max(0, ...totals)
  const rawYMax = maxTotal > 0 ? maxTotal * 1.2 : 10
  // 未指定 yMax 时：取整并向上对齐到 yTicks 格，使刻度为整数（适合「次」等计数）
  const yMax =
    axis.yMax ??
    Math.max(1, Math.ceil(rawYMax / yTicks) * yTicks)

  // Y 轴刻度（自上而下：最大值 → 0，与柱形堆积比例一致）
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    const value = (yMax * (yTicks - i)) / yTicks
    const rounded = Math.round(value * 1000) / 1000
    return axis.yFormat ? axis.yFormat(rounded) : Math.round(rounded).toString()
  })

  // 柱子尺寸
  const barSpacing = innerWidth / data.length
  const actualBarWidth = barSpacing * barWidth

  // X 轴标签间隔
  const xLabelInterval = axis.xLabelInterval ?? chartDefaultXLabelInterval(data.length)

  // 计算堆积柱子的各段
  const stackedBars = data.map((d, i) => {
    const x = pad.left + i * barSpacing + (barSpacing - actualBarWidth) / 2
    let currentY = pad.top + innerHeight
    const segments: Array<{
      y: number
      height: number
      color: string
      value: number
      key: string
    }> = []

    // 按顺序堆积（从下往上）
    for (const key of seriesOrder) {
      const value = d.values[key] || 0
      const segmentHeight = Math.max(0, (value / yMax) * innerHeight)
      currentY -= segmentHeight
      segments.push({
        y: currentY,
        height: segmentHeight,
        color: seriesColors[key] || '#9CA3AF',
        value,
        key,
      })
    }

    return { x, segments, label: d.label }
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

        {/* 堆积柱子 */}
        <g className="stacked-bars">
          {stackedBars.map((bar, i) => (
            <g key={i}>
              {bar.segments.map((seg, j) => (
                <rect
                  key={j}
                  x={bar.x}
                  y={seg.y}
                  width={actualBarWidth}
                  height={seg.height}
                  fill={seg.color}
                />
              ))}
            </g>
          ))}
        </g>

        {/* X 轴标签 */}
        <g className="x-axis-labels">
          {data.map((d, i) => {
            if (i % xLabelInterval !== 0 && i !== data.length - 1) return null
            const x = pad.left + i * barSpacing + barSpacing / 2
            return (
              <ChartRotatedXLabel key={i} x={x} chartHeight={chartHeight} paddingBottom={pad.bottom}>
                {d.label}
              </ChartRotatedXLabel>
            )
          })}
        </g>
      </svg>

      {/* 图例 */}
      {showLegend && (
        <div className="flex flex-wrap gap-3 mt-2 justify-center">
          {seriesOrder.map((key) => (
            <div key={key} className="flex items-center gap-1">
              <span
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: seriesColors[key] || '#9CA3AF' }}
              />
              <span className="text-xs text-gray-600">
                {seriesLabels?.[key] ?? key}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
