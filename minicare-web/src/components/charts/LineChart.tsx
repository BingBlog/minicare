/**
 * 折线图组件（Recharts 版）
 * 用于展示趋势数据（如奶量变化、睡眠时长等）
 * 支持单系列 data 或多系列 seriesData + seriesOrder
 */
import React from 'react'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
} from 'recharts'
import type { LineChartProps } from './types'

const DEFAULT_COLORS = {
  primary: '#F87098',
  secondary: '#9B8ED8',
  tertiary: '#7EC8E3',
  quaternary: '#F5A962',
  quinary: '#6BCB77',
}

const SERIES_COLOR_KEYS = ['primary', 'secondary', 'tertiary', 'quaternary', 'quinary'] as const

// ─── Tooltip 提升到模块级，避免在 render 内定义导致每次重新创建组件 ───

interface LineTooltipPayloadEntry {
  dataKey: string
  value: number
  color: string
}

interface LineTooltipProps {
  active?: boolean
  payload?: LineTooltipPayloadEntry[]
  label?: string
  isMulti: boolean
  seriesLabels?: Record<string, string>
  yFormat?: (v: number) => string
}

function LineTooltip({ active, payload, label, isMulti, seriesLabels, yFormat }: LineTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl px-3 py-2 shadow-lg border border-gray-100 text-xs pointer-events-none">
      <p className="text-gray-500 mb-1">{label}</p>
      {isMulti
        ? payload.map((entry) => {
            const seriesLabel = seriesLabels?.[entry.dataKey] ?? entry.dataKey
            return (
              <p key={entry.dataKey} className="font-semibold" style={{ color: entry.color }}>
                {seriesLabel}：{yFormat ? yFormat(entry.value) : entry.value}
              </p>
            )
          })
        : payload.map((entry, i) => (
            <p key={i} className="font-semibold" style={{ color: entry.color }}>
              {yFormat ? yFormat(entry.value) : entry.value}
            </p>
          ))}
    </div>
  )
}

// ─── 空状态 ───────────────────────────────────────────────────────────────

function EmptyState({ height, className }: { height: number; className?: string }) {
  return (
    <div
      className={`flex w-full min-w-0 items-center justify-center bg-gray-50 rounded-lg ${className || ''}`}
      style={{ height }}
    >
      <span className="text-gray-400 text-sm">暂无数据</span>
    </div>
  )
}

// ─── 公共轴/网格配置 ──────────────────────────────────────────────────────

interface CommonAxisProps {
  yMin: number
  yMax: number
  tickFormatter: (v: number) => string
}

function CommonAxes({ yMin, yMax, tickFormatter }: CommonAxisProps) {
  return (
    <>
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
    </>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────

export function LineChart({
  data,
  seriesData,
  seriesOrder,
  seriesLabels,
  height = 200,
  colors = DEFAULT_COLORS,
  axis = {},
  showDots = true,
  showValues = false,
  fillArea = false,
  smooth = true,
  showLegend,
  className,
}: LineChartProps) {
  const isMulti =
    seriesData != null &&
    seriesData.length > 0 &&
    seriesOrder != null &&
    seriesOrder.length > 0

  const singleData = !isMulti && data ? data : []
  const multiData = isMulti ? seriesData! : []

  if (!isMulti && singleData.length === 0) return <EmptyState height={height} className={className} />
  if (isMulti && multiData.length === 0) return <EmptyState height={height} className={className} />

  // 系列颜色列表
  const seriesColorList = isMulti
    ? seriesOrder!.map((_, i) => {
        const k = SERIES_COLOR_KEYS[i % SERIES_COLOR_KEYS.length]
        return colors[k] ?? DEFAULT_COLORS[k]
      })
    : [colors.primary ?? DEFAULT_COLORS.primary]

  // Y 轴范围
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

  const showLegendRow = isMulti && showLegend !== false
  const curveType = smooth ? 'monotone' : 'linear'
  const tickFormatter = axis.yFormat ? axis.yFormat : (v: number) => String(Math.round(v))

  // 构建 Recharts 数据格式
  const chartData = isMulti
    ? multiData.map((d) => ({ label: d.label, ...d.values }))
    : singleData.map((d) => ({ label: d.label, value: d.value }))

  // Tooltip content 提升为稳定引用（绑定运行时参数）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipContent = (props: any) => (
    <LineTooltip
      {...props}
      isMulti={isMulti}
      seriesLabels={seriesLabels}
      yFormat={axis.yFormat}
    />
  )

  if (!isMulti) {
    const lineColor = colors.primary ?? DEFAULT_COLORS.primary
    return (
      <div className={`w-full min-w-0 ${className || ''}`}>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
            <CommonAxes yMin={yMin} yMax={yMax} tickFormatter={tickFormatter} />
            <Tooltip content={tooltipContent} />
            {fillArea && (
              <Area
                type={curveType}
                dataKey="value"
                stroke={lineColor}
                fill={lineColor}
                fillOpacity={0.15}
                strokeWidth={0}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                legendType="none"
              />
            )}
            <Line
              type={curveType}
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              dot={showDots ? { r: 3, fill: lineColor, stroke: 'white', strokeWidth: 2 } : false}
              activeDot={{ r: 5, fill: lineColor, stroke: 'white', strokeWidth: 2 }}
              isAnimationActive={false}
              label={
                showValues
                  ? {
                      position: 'top',
                      fontSize: 10,
                      fill: lineColor,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter: (v: any) => (axis.yFormat ? axis.yFormat(v) : String(v)),
                    }
                  : undefined
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // 多系列
  return (
    <div className={`w-full min-w-0 ${className || ''}`}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
          <CommonAxes yMin={yMin} yMax={yMax} tickFormatter={tickFormatter} />
          <Tooltip content={tooltipContent} />
          {seriesOrder!.map((key, si) => {
            const stroke = seriesColorList[si]
            const isFirst = si === 0
            return (
              <React.Fragment key={key}>
                {fillArea && isFirst && (
                  <Area
                    type={curveType}
                    dataKey={key}
                    stroke={stroke}
                    fill={stroke}
                    fillOpacity={0.12}
                    strokeWidth={0}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                    legendType="none"
                  />
                )}
                <Line
                  type={curveType}
                  dataKey={key}
                  stroke={stroke}
                  strokeWidth={2}
                  dot={showDots ? { r: 3, fill: stroke, stroke: 'white', strokeWidth: 2 } : false}
                  activeDot={{ r: 5, fill: stroke, stroke: 'white', strokeWidth: 2 }}
                  isAnimationActive={false}
                  name={seriesLabels?.[key] ?? key}
                />
              </React.Fragment>
            )
          })}
          {showLegendRow && (
            <Legend
              iconType="line"
              iconSize={16}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
