/**
 * 散点图：用于报告页体温、情绪等按日分布展示
 */
import React from 'react'
import type { ScatterChartProps } from './types'

const DEFAULT_PADDING = { top: 16, right: 10, bottom: 36, left: 44 }

export function ScatterChart({
  points,
  xSlotCount,
  xLabels,
  yMin,
  yMax,
  yFormat,
  height = 200,
  width,
  padding = {},
  yTicks = 4,
  xLabelInterval,
  className,
}: ScatterChartProps) {
  const pad = { ...DEFAULT_PADDING, ...padding }
  const chartHeight = height
  const fillContainer = width == null
  const chartWidth = width ?? 300
  const innerWidth = chartWidth - pad.left - pad.right
  const innerHeight = chartHeight - pad.top - pad.bottom
  const yRange = yMax - yMin || 1

  const xLabelIntervalResolved =
    xLabelInterval ?? Math.ceil(Math.max(1, xSlotCount) / 6)

  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    const value = yMax - (yRange * i) / yTicks
    return yFormat ? yFormat(value) : Math.round(value * 100) / 100
  })

  if (points.length === 0) {
    return (
      <div
        className={`flex w-full min-w-0 items-center justify-center bg-gray-50 rounded-lg ${className || ''}`}
        style={fillContainer ? { height: chartHeight } : { width: chartWidth, height: chartHeight }}
      >
        <span className="text-gray-400 text-sm">暂无数据</span>
      </div>
    )
  }

  const xPos = (slot: number) => {
    if (xSlotCount <= 1) return pad.left + innerWidth / 2
    return pad.left + (slot / (xSlotCount - 1)) * innerWidth
  }

  const yPos = (y: number) =>
    pad.top + innerHeight - ((y - yMin) / yRange) * innerHeight

  return (
    <div className={`w-full min-w-0 ${className || ''}`}>
      <svg
        width={fillContainer ? '100%' : chartWidth}
        height={chartHeight}
        className="block"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio={fillContainer ? 'none' : 'xMidYMid meet'}
      >
        <g className="grid-lines">
          {Array.from({ length: yTicks + 1 }, (_, i) => {
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

        <g className="scatter-points">
          {points.map((p, i) => (
            <circle
              key={i}
              cx={xPos(p.xSlot)}
              cy={yPos(p.y)}
              r={p.r}
              fill={p.color}
              stroke="white"
              strokeWidth={2}
            />
          ))}
        </g>

        <g className="x-axis-labels">
          {xLabels.map((label, i) => {
            if (i % xLabelIntervalResolved !== 0 && i !== xSlotCount - 1) return null
            return (
              <text
                key={i}
                x={xPos(i)}
                y={chartHeight - pad.bottom + 18}
                textAnchor="middle"
                fill="#9CA3AF"
                fontSize={11}
              >
                {label}
              </text>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
