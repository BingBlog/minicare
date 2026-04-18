/**
 * 生长曲线图组件（Recharts 版）
 * 展示体重/身高/头围的生长曲线，叠加国家标准百分位区域
 */
import React from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type { GrowthChartProps, GrowthDataPoint } from './types'

// 百分位参考线颜色
const REFERENCE_LINE_COLOR = '#C4B5D4'
// 实际数据点颜色
const DATA_POINT_COLOR = '#F87098'

// 百分位线样式配置
const PERCENTILE_CONFIG: Record<
  string,
  { strokeWidth: number; dasharray: string; labelColor: string }
> = {
  p3:  { strokeWidth: 1,   dasharray: '3 3', labelColor: '#B0A0C8' },
  p15: { strokeWidth: 1,   dasharray: '3 3', labelColor: '#B0A0C8' },
  p50: { strokeWidth: 1.5, dasharray: '',    labelColor: '#9B8ED8' },
  p85: { strokeWidth: 1,   dasharray: '3 3', labelColor: '#B0A0C8' },
  p97: { strokeWidth: 1,   dasharray: '3 3', labelColor: '#B0A0C8' },
}

// 测量类型配置
const MEASURE_CONFIG = {
  weight: {
    label: '体重',
    unit: 'kg',
    // 原始值 g → 显示 kg（保留 2 位小数）
    formatValue: (v: number) => (v / 1000).toFixed(2),
    // 百分位曲线原始值也是 g，统一转 kg
    scalePercentile: (v: number) => v / 1000,
    // 实测数据：data.value 单位 g
    scaleData: (v: number) => v / 1000,
  },
  height: {
    label: '身高',
    unit: 'cm',
    formatValue: (v: number) => (v / 10).toFixed(1),
    scalePercentile: (v: number) => v / 10,
    scaleData: (v: number) => v / 10,
  },
  head: {
    label: '头围',
    unit: 'cm',
    formatValue: (v: number) => (v / 10).toFixed(1),
    scalePercentile: (v: number) => v / 10,
    scaleData: (v: number) => v / 10,
  },
}

// 合并后的图表数据点类型
interface MergedPoint {
  ageMonths: number
  p3?: number
  p15?: number
  p50?: number
  p85?: number
  p97?: number
  actual?: number
  // 保留原始数据用于 Tooltip 显示
  _rawValue?: number
  _date?: string
}

// 自定义 Tooltip 组件
interface GrowthTooltipProps {
  active?: boolean
  payload?: Array<{ dataKey?: string; value?: number; payload?: MergedPoint }>
  measureType: 'weight' | 'height' | 'head'
}
function GrowthTooltip({ active, payload: typedPayload, measureType }: GrowthTooltipProps) {
  if (!active || !typedPayload?.length) return null
  const config = MEASURE_CONFIG[measureType]

  // 只找实际测量点（有 actual 值的）
  const actualEntry = typedPayload.find((p) => p.dataKey === 'actual')
  if (!actualEntry || actualEntry.value == null) return null

  const rawValue = actualEntry.payload?._rawValue
  const date = actualEntry.payload?._date
  const ageMonths = actualEntry.payload?.ageMonths

  const displayValue = rawValue != null ? config.formatValue(rawValue) : String(actualEntry.value)

  const formatAgeMonths = (m: number) => {
    const n = Math.round(m * 10) / 10
    return Number.isInteger(n) ? `${n}月龄` : `${n.toFixed(1)}月龄`
  }

  const formatDate = (d: string) => {
    if (!d) return ''
    const parts = d.slice(0, 10).split('-')
    return `${parseInt(parts[1] ?? '0')}月${parseInt(parts[2] ?? '0')}日`
  }

  return (
    <div className="bg-white rounded-xl px-3 py-2 shadow-lg border border-gray-100 text-xs pointer-events-none">
      <p className="font-semibold text-[#F87098]">
        {displayValue} {config.unit}
      </p>
      {date && <p className="text-gray-500 mt-0.5">{formatDate(date)}</p>}
      {ageMonths != null && (
        <p className="text-gray-400">{formatAgeMonths(ageMonths)}</p>
      )}
    </div>
  )
}

export function GrowthChart({
  data,
  percentiles,
  gender,
  measureType,
  height = 280,
  containerWidth,
  className,
}: GrowthChartProps) {
  const config = MEASURE_CONFIG[measureType]

  // 按月龄排序实测数据
  const validData = data
    .filter((d) => d.value > 0)
    .sort((a, b) => a.ageMonths - b.ageMonths)

  const stdMaxMonth =
    percentiles.length > 0
      ? Math.max(...percentiles.map((p) => p.ageMonths))
      : 36

  // X 轴范围计算（保留原有局部放大逻辑）
  const dataMinMonth = validData.length > 0 ? Math.min(...validData.map((d) => d.ageMonths)) : 0
  const dataMaxMonth = validData.length > 0 ? Math.max(...validData.map((d) => d.ageMonths)) : 0
  const dataSpanMo = dataMaxMonth - dataMinMonth

  const ZOOM_SPAN = 1.5
  const DOMAIN_PAD = 0.4
  let xDomainMin = 0
  let xDomainMax = Math.min(stdMaxMonth, Math.max(6, Math.ceil(dataMaxMonth) + 1))

  if (validData.length >= 2 && dataSpanMo < ZOOM_SPAN) {
    let lo = Math.max(0, dataMinMonth - DOMAIN_PAD)
    let hi = Math.min(stdMaxMonth, dataMaxMonth + DOMAIN_PAD)
    if (hi - lo < 2) {
      const mid = (dataMinMonth + dataMaxMonth) / 2
      lo = Math.max(0, mid - 1)
      hi = Math.min(stdMaxMonth, mid + 1)
    }
    xDomainMin = lo
    xDomainMax = hi
  } else if (validData.length === 1 || dataSpanMo === 0) {
    const mid = dataMaxMonth
    xDomainMin = Math.max(0, mid - 0.85)
    xDomainMax = Math.min(stdMaxMonth, mid + 0.85)
  }

  // 收集可视区间内的百分位月龄采样点（整数月）
  const mStart = Math.max(0, Math.floor(xDomainMin))
  const mEnd = Math.min(stdMaxMonth, Math.ceil(xDomainMax))
  const percentileMonths = new Set<number>()
  for (let m = mStart; m <= mEnd; m++) percentileMonths.add(m)

  // 构建合并数据：以月龄为 key，百分位 + 实测数据合并
  const pointMap = new Map<number, MergedPoint>()

  // 添加百分位采样点
  percentiles.forEach((p) => {
    if (!percentileMonths.has(p.ageMonths)) return
    const curve = p[gender]
    if (!curve) return
    const existing = pointMap.get(p.ageMonths) ?? { ageMonths: p.ageMonths }
    existing.p3  = config.scalePercentile(curve.p3)
    existing.p15 = config.scalePercentile(curve.p15)
    existing.p50 = config.scalePercentile(curve.p50)
    existing.p85 = config.scalePercentile(curve.p85)
    existing.p97 = config.scalePercentile(curve.p97)
    pointMap.set(p.ageMonths, existing)
  })

  // 添加实测数据点（月龄可能不是整数，与百分位点合并）
  validData.forEach((d) => {
    const key = Math.round(d.ageMonths * 100) / 100
    const existing = pointMap.get(key) ?? { ageMonths: key }
    existing.actual = config.scaleData(d.value)
    existing._rawValue = d.value
    existing._date = d.date
    pointMap.set(key, existing)
  })

  // 按月龄升序排列
  const mergedData = Array.from(pointMap.values()).sort((a, b) => a.ageMonths - b.ageMonths)

  // Y 轴范围：取可视区间内数据的动态范围
  const allScaledValues: number[] = []
  validData.forEach((d) => allScaledValues.push(config.scaleData(d.value)))
  const visiblePercentiles = percentiles.filter(
    (p) => p.ageMonths >= xDomainMin - 0.5 && p.ageMonths <= xDomainMax + 0.5,
  )
  visiblePercentiles.forEach((p) => {
    const curve = p[gender]
    if (curve) {
      allScaledValues.push(config.scalePercentile(curve.p3))
      allScaledValues.push(config.scalePercentile(curve.p97))
    }
  })

  const positive = allScaledValues.filter((v) => v > 0)
  const rawYMin = positive.length > 0 ? Math.min(...positive) : 2
  const rawYMax = positive.length > 0 ? Math.max(...positive) : 16
  const yPad = (rawYMax - rawYMin) * 0.08 || rawYMin * 0.08
  const yMin = Math.max(0, Math.floor((rawYMin - yPad) * 10) / 10)
  const yMax = Math.ceil((rawYMax + yPad) * 10) / 10

  // X 轴刻度格式
  const formatMonth = (v: number) => {
    const n = Math.round(v * 10) / 10
    if (Number.isInteger(n)) return `${n}月`
    return `${n.toFixed(1)}月`
  }

  const chartHeight = height

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart
          data={mergedData}
          margin={{ top: 10, right: 50, bottom: 20, left: 10 }}
        >
          <CartesianGrid strokeDasharray="4 2" stroke="#F3F4F6" vertical={false} />
          <XAxis
            dataKey="ageMonths"
            type="number"
            domain={[xDomainMin, xDomainMax]}
            tickFormatter={formatMonth}
            tick={{ fontSize: 11, fill: '#9CA3AF' }}
            tickLine={false}
            axisLine={false}
            label={{ value: '月龄', position: 'insideBottom', offset: -8, fontSize: 11, fill: '#6B7280' }}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 11, fill: '#9CA3AF' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => v.toFixed(1)}
            label={{ value: config.unit, angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: '#6B7280' }}
          />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Tooltip content={(props: any) => <GrowthTooltip active={props.active} payload={props.payload} measureType={measureType} />} />

          {/* 百分位曲线（P3/P15/P85/P97 虚线，P50 实线） */}
          {(['p3', 'p15', 'p85', 'p97'] as const).map((key) => (
            <Line
              key={key}
              dataKey={key}
              stroke={REFERENCE_LINE_COLOR}
              strokeWidth={PERCENTILE_CONFIG[key].strokeWidth}
              strokeDasharray={PERCENTILE_CONFIG[key].dasharray}
              dot={false}
              activeDot={false}
              legendType="none"
              connectNulls
              isAnimationActive={false}
              tooltipType="none"
            />
          ))}
          <Line
            dataKey="p50"
            stroke="#9B8ED8"
            strokeWidth={PERCENTILE_CONFIG.p50.strokeWidth}
            dot={false}
            activeDot={false}
            legendType="none"
            connectNulls
            isAnimationActive={false}
            tooltipType="none"
          />

          {/* 实测数据线 */}
          <Line
            dataKey="actual"
            stroke={DATA_POINT_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 4, fill: DATA_POINT_COLOR, stroke: 'white', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: DATA_POINT_COLOR, stroke: 'white', strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* 图例 */}
      <div
        className="flex flex-wrap gap-3 mt-1 justify-center text-xs"
        style={{ color: '#B0A0C8' }}
      >
        <span className="flex items-center gap-1">
          <svg width="16" height="8">
            <line x1="0" y1="4" x2="16" y2="4" stroke="#C4B5D4" strokeWidth="1.5" strokeDasharray="3 3" />
          </svg>
          P3 / P15 / P85 / P97
        </span>
        <span className="flex items-center gap-1">
          <svg width="16" height="8">
            <line x1="0" y1="4" x2="16" y2="4" stroke="#9B8ED8" strokeWidth="1.5" />
          </svg>
          P50
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DATA_POINT_COLOR }} />
          <span className="text-gray-500">实际测量</span>
        </span>
      </div>
    </div>
  )
}
