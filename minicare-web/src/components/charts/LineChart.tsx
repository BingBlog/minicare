/**
 * 折线图组件
 * 用于展示趋势数据（如奶量变化、睡眠时长等）
 * 支持单系列 data 或多系列 seriesData + seriesOrder
 */
import React from 'react'
import type { LineChartProps, DataPoint, SeriesDataPoint } from './types'
import {
  CHART_X_LABEL_BOTTOM_PAD,
  ChartRotatedXLabel,
  chartDefaultXLabelInterval,
} from './chartAxis'

const DEFAULT_COLORS = {
  primary: '#F87098',
  secondary: '#9B8ED8',
  tertiary: '#7EC8E3',
  quaternary: '#F5A962',
  quinary: '#6BCB77',
}

const DEFAULT_PADDING = { top: 20, right: 10, bottom: CHART_X_LABEL_BOTTOM_PAD, left: 50 }

const SERIES_COLOR_KEYS = ['primary', 'secondary', 'tertiary', 'quaternary', 'quinary'] as const

function buildLinePath(
  points: Array<{ x: number; y: number }>,
  smooth: boolean,
): string {
  if (points.length === 0) return ''
  return points
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
}

export function LineChart({
  data,
  seriesData,
  seriesOrder,
  seriesLabels,
  width,
  height = 200,
  padding = {},
  colors = DEFAULT_COLORS,
  axis = {},
  showDots = true,
  showValues = false,
  fillArea = false,
  smooth = true,
  showLegend,
  className,
}: LineChartProps) {
  const pad = { ...DEFAULT_PADDING, ...padding }
  const chartWidth = width ?? 300
  const chartHeight = height
  const fillContainer = width == null
  const innerWidth = chartWidth - pad.left - pad.right
  const innerHeight = chartHeight - pad.top - pad.bottom

  const isMulti =
    seriesData != null &&
    seriesData.length > 0 &&
    seriesOrder != null &&
    seriesOrder.length > 0

  const singleData: DataPoint[] = !isMulti && data ? data : []
  const multiData: SeriesDataPoint[] = isMulti ? seriesData! : []

  if (!isMulti && singleData.length === 0) {
    return (
      <div
        className={`flex w-full min-w-0 items-center justify-center bg-gray-50 rounded-lg ${className || ''}`}
        style={fillContainer ? { height: chartHeight } : { width: chartWidth, height: chartHeight }}
      >
        <span className="text-gray-400 text-sm">暂无数据</span>
      </div>
    )
  }

  if (isMulti && multiData.length === 0) {
    return (
      <div
        className={`flex w-full min-w-0 items-center justify-center bg-gray-50 rounded-lg ${className || ''}`}
        style={fillContainer ? { height: chartHeight } : { width: chartWidth, height: chartHeight }}
      >
        <span className="text-gray-400 text-sm">暂无数据</span>
      </div>
    )
  }

  const n = isMulti ? multiData.length : singleData.length
  const xStep = innerWidth / Math.max(1, n - 1)

  let yMin: number
  let yMax: number
  if (isMulti) {
    const flat = seriesOrder!.flatMap((key) => multiData.map((d) => d.values[key] ?? 0))
    const vmax = Math.max(...flat, 0)
    yMin = axis.yMin ?? Math.min(0, ...flat)
    yMax = axis.yMax ?? (vmax * 1.1 || 10)
  } else {
    const values = singleData.map((d) => d.value)
    yMin = axis.yMin ?? Math.min(0, ...values)
    yMax = axis.yMax ?? (Math.max(...values) * 1.1 || 10)
  }
  const yRange = yMax - yMin || 1

  const yTicks = 4
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    const value = yMax - (yRange * i) / yTicks
    const clean = Math.round(value * 1e6) / 1e6
    return axis.yFormat ? axis.yFormat(clean) : Math.round(clean).toString()
  })

  const xLabelInterval = axis.xLabelInterval ?? chartDefaultXLabelInterval(n)

  const seriesColorList = isMulti
    ? seriesOrder!.map((_, i) => {
        const k = SERIES_COLOR_KEYS[i % SERIES_COLOR_KEYS.length]
        return colors[k] ?? DEFAULT_COLORS[k]
      })
    : [colors.primary]

  const showLegendRow = isMulti && (showLegend !== false)

  return (
    <div className={`w-full min-w-0 ${className || ''}`}>
      <svg
        width={fillContainer ? '100%' : chartWidth}
        height={chartHeight}
        className="block"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio={fillContainer ? 'none' : 'xMidYMid meet'}
      >
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

        {isMulti
          ? seriesOrder!.map((key, si) => {
              const stroke = seriesColorList[si]
              const points = multiData.map((d, i) => ({
                x: pad.left + i * xStep,
                y: pad.top + innerHeight - ((d.values[key] ?? 0) - yMin) / yRange * innerHeight,
                label: d.label,
                value: d.values[key] ?? 0,
              }))
              const linePath = buildLinePath(
                points.map((p) => ({ x: p.x, y: p.y })),
                smooth,
              )
              const isFirst = si === 0
              const areaPath =
                fillArea && isFirst
                  ? `${linePath} L ${points[points.length - 1].x} ${pad.top + innerHeight} L ${points[0].x} ${pad.top + innerHeight} Z`
                  : ''

              return (
                <g key={key} className={`series-${key}`}>
                  {fillArea && isFirst && areaPath && (
                    <path d={areaPath} fill={stroke} fillOpacity={0.12} />
                  )}
                  <path
                    d={linePath}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {showDots &&
                    points.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={3}
                        fill={stroke}
                        stroke="white"
                        strokeWidth={2}
                      />
                    ))}
                  {showValues &&
                    points.map((p, i) => (
                      <text
                        key={i}
                        x={p.x}
                        y={p.y - 8}
                        textAnchor="middle"
                        fill={stroke}
                        fontSize={10}
                        fontWeight={500}
                      >
                        {axis.yFormat ? axis.yFormat(p.value) : p.value}
                      </text>
                    ))}
                </g>
              )
            })
          : (() => {
              const points = singleData.map((d, i) => ({
                x: pad.left + i * xStep,
                y: pad.top + innerHeight - ((d.value - yMin) / yRange) * innerHeight,
                label: d.label,
                value: d.value,
              }))
              const linePath = buildLinePath(
                points.map((p) => ({ x: p.x, y: p.y })),
                smooth,
              )
              const areaPath = fillArea
                ? `${linePath} L ${points[points.length - 1].x} ${pad.top + innerHeight} L ${points[0].x} ${pad.top + innerHeight} Z`
                : ''
              return (
                <g>
                  {fillArea && areaPath && (
                    <path d={areaPath} fill={colors.primary} fillOpacity={0.15} />
                  )}
                  <path
                    d={linePath}
                    fill="none"
                    stroke={colors.primary}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
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
                </g>
              )
            })()}

        <g className="x-axis-labels">
          {(isMulti ? multiData : singleData).map((d, i) => {
            if (i % xLabelInterval !== 0 && i !== n - 1) return null
            const x = pad.left + i * xStep
            const label = 'label' in d ? d.label : (d as DataPoint).label
            return (
              <ChartRotatedXLabel key={i} x={x} chartHeight={chartHeight} paddingBottom={pad.bottom}>
                {label}
              </ChartRotatedXLabel>
            )
          })}
        </g>
      </svg>

      {showLegendRow && (
        <div className="flex flex-wrap gap-4 mt-2 justify-center text-xs text-gray-500">
          {seriesOrder!.map((key, i) => (
            <span key={key} className="flex items-center gap-1.5">
              <span
                className="w-6 h-0.5 rounded-full shrink-0"
                style={{ backgroundColor: seriesColorList[i] }}
              />
              {seriesLabels?.[key] ?? key}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
