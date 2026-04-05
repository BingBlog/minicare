/**
 * 生长曲线图组件
 * 展示体重/身高/头围的生长曲线，叠加国家标准百分位区域
 */
import React from 'react'
import type { GrowthChartProps, GrowthDataPoint, PercentileCurve } from './types'
import { ChartRotatedXLabel } from './chartAxis'

const DEFAULT_HEIGHT = 280
/** 底部略大于通用值，为「月龄」标题与倾斜刻度留出空间 */
const DEFAULT_PADDING = { top: 30, right: 30, bottom: 54, left: 55 }

// 百分位区域颜色
const PERCENTILE_COLORS = {
  p3_p15: 'rgba(156, 142, 216, 0.15)',   // 淡紫色
  p15_p50: 'rgba(156, 142, 216, 0.25)',
  p50_p85: 'rgba(156, 142, 216, 0.25)',
  p85_p97: 'rgba(156, 142, 216, 0.15)',
}

// 百分位参考线颜色
const REFERENCE_LINE_COLOR = '#D1D5DB'

// 实际数据点颜色
const DATA_POINT_COLOR = '#F87098'

// 测量类型配置
/** 与 LineChart 一致：用三次贝塞尔在相邻点间平滑过渡 */
function smoothPathFromPoints(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  return points
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`
      const prev = points[i - 1]
      const cpx = (prev.x + p.x) / 2
      return `C ${cpx} ${prev.y} ${cpx} ${p.y} ${p.x} ${p.y}`
    })
    .join(' ')
}

const MEASURE_CONFIG = {
  weight: {
    label: '体重',
    unit: 'kg',
    formatValue: (v: number) => (v / 1000).toFixed(1), // g -> kg
    yMin: 2,
    yMax: 16,
  },
  height: {
    label: '身高',
    unit: 'cm',
    formatValue: (v: number) => (v / 10).toFixed(1), // mm -> cm
    yMin: 45,
    yMax: 100,
  },
  head: {
    label: '头围',
    unit: 'cm',
    formatValue: (v: number) => (v / 10).toFixed(1), // mm -> cm
    yMin: 30,
    yMax: 50,
  },
}

export function GrowthChart({
  data,
  percentiles,
  gender,
  measureType,
  height = DEFAULT_HEIGHT,
  className,
}: GrowthChartProps) {
  const pad = { ...DEFAULT_PADDING }
  const chartHeight = height
  const innerHeight = chartHeight - pad.top - pad.bottom

  // 动态计算图表宽度（基于最大月龄）
  const maxAgeMonths = Math.max(
    36, // 至少显示到 36 个月
    ...percentiles.map((p) => p.ageMonths),
    ...data.map((d) => d.ageMonths)
  )

  // 计算合适的宽度（每月约 20px，最小 300px）
  const chartWidth = Math.max(300, pad.left + pad.right + maxAgeMonths * 20)
  const innerWidth = chartWidth - pad.left - pad.right

  const config = MEASURE_CONFIG[measureType]

  // Y 轴范围（根据数据动态调整）
  const allValues = data.map((d) => {
    if (measureType === 'weight') return d.value / 1000 // g -> kg
    return d.value / 10 // mm -> cm
  })
  const pValues = percentiles.flatMap((p) => {
    const curve = p[gender]
    if (!curve) return []
    if (measureType === 'weight') return [curve.p3 / 1000, curve.p97 / 1000]
    return [curve.p3 / 10, curve.p97 / 10]
  })
  const allYValues = [...allValues, ...pValues].filter((v) => v > 0)

  const yMin = Math.floor(Math.min(config.yMin, ...allYValues) * 0.9)
  const yMax = Math.ceil(Math.max(config.yMax, ...allYValues) * 1.1)
  const yRange = yMax - yMin

  // 坐标转换函数
  const xScale = (ageMonths: number) => pad.left + (ageMonths / maxAgeMonths) * innerWidth
  const yScale = (value: number) => pad.top + innerHeight - ((value - yMin) / yRange) * innerHeight

  // Y 轴刻度
  const yTicks = 5
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    const value = yMin + (yRange * i) / yTicks
    return { value, label: value.toFixed(1) }
  })

  // X 轴刻度（每 6 个月）
  const xTickMonths = Array.from({ length: Math.ceil(maxAgeMonths / 6) + 1 }, (_, i) => i * 6)
    .filter((m) => m <= maxAgeMonths)

  // 绘制百分位区域路径
  const renderPercentileAreas = () => {
    const areas: JSX.Element[] = []
    const genderPercentiles = percentiles.filter((p) => p[gender])

    if (genderPercentiles.length < 2) return areas

    // 获取插值函数
    const getPercentileValue = (months: number, key: 'p3' | 'p15' | 'p50' | 'p85' | 'p97') => {
      // 找到最近的数据点
      const sorted = [...genderPercentiles].sort((a, b) => a.ageMonths - b.ageMonths)
      const exact = sorted.find((p) => p.ageMonths === months)
      if (exact && exact[gender]) {
        const val = exact[gender]![key]
        return measureType === 'weight' ? val / 1000 : val / 10
      }
      // 线性插值
      let lower = sorted[0]
      let upper = sorted[sorted.length - 1]
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].ageMonths <= months && sorted[i + 1].ageMonths >= months) {
          lower = sorted[i]
          upper = sorted[i + 1]
          break
        }
      }
      if (!lower[gender] || !upper[gender]) return null
      const ratio = (months - lower.ageMonths) / (upper.ageMonths - lower.ageMonths)
      const lowerVal = lower[gender]![key]
      const upperVal = upper[gender]![key]
      const interpolated = lowerVal + ratio * (upperVal - lowerVal)
      return measureType === 'weight' ? interpolated / 1000 : interpolated / 10
    }

    // 绘制 P3-P15 区域
    const p3p15Path: string[] = []
    const p15p3Path: string[] = []

    for (let m = 0; m <= maxAgeMonths; m += 1) {
      const p15 = getPercentileValue(m, 'p15')
      const p3 = getPercentileValue(m, 'p3')
      if (p15 === null || p3 === null) continue
      if (p3p15Path.length === 0) {
        p3p15Path.push(`M ${xScale(m)} ${yScale(p15)}`)
      } else {
        p3p15Path.push(`L ${xScale(m)} ${yScale(p15)}`)
      }
    }
    for (let m = maxAgeMonths; m >= 0; m -= 1) {
      const p3 = getPercentileValue(m, 'p3')
      if (p3 === null) continue
      if (p15p3Path.length === 0) {
        p15p3Path.push(`M ${xScale(m)} ${yScale(p3)}`)
      } else {
        p15p3Path.push(`L ${xScale(m)} ${yScale(p3)}`)
      }
    }

    areas.push(
      <path
        key="p3-p15"
        d={`${p3p15Path.join(' ')} ${p15p3Path.join(' ')} Z`}
        fill={PERCENTILE_COLORS.p3_p15}
      />
    )

    // 绘制 P15-P50 区域
    const p15p50Path: string[] = []
    const p50p15Path: string[] = []

    for (let m = 0; m <= maxAgeMonths; m += 1) {
      const p50 = getPercentileValue(m, 'p50')
      if (p50 === null) continue
      if (p15p50Path.length === 0) {
        p15p50Path.push(`M ${xScale(m)} ${yScale(p50)}`)
      } else {
        p15p50Path.push(`L ${xScale(m)} ${yScale(p50)}`)
      }
    }
    for (let m = maxAgeMonths; m >= 0; m -= 1) {
      const p15 = getPercentileValue(m, 'p15')
      if (p15 === null) continue
      if (p50p15Path.length === 0) {
        p50p15Path.push(`M ${xScale(m)} ${yScale(p15)}`)
      } else {
        p50p15Path.push(`L ${xScale(m)} ${yScale(p15)}`)
      }
    }

    areas.push(
      <path
        key="p15-p50"
        d={`${p15p50Path.join(' ')} ${p50p15Path.join(' ')} Z`}
        fill={PERCENTILE_COLORS.p15_p50}
      />
    )

    // 绘制 P50-P85 区域
    const p50p85Path: string[] = []
    const p85p50Path: string[] = []

    for (let m = 0; m <= maxAgeMonths; m += 1) {
      const p85 = getPercentileValue(m, 'p85')
      if (p85 === null) continue
      if (p50p85Path.length === 0) {
        p50p85Path.push(`M ${xScale(m)} ${yScale(p85)}`)
      } else {
        p50p85Path.push(`L ${xScale(m)} ${yScale(p85)}`)
      }
    }
    for (let m = maxAgeMonths; m >= 0; m -= 1) {
      const p50 = getPercentileValue(m, 'p50')
      if (p50 === null) continue
      if (p85p50Path.length === 0) {
        p85p50Path.push(`M ${xScale(m)} ${yScale(p50)}`)
      } else {
        p85p50Path.push(`L ${xScale(m)} ${yScale(p50)}`)
      }
    }

    areas.push(
      <path
        key="p50-p85"
        d={`${p50p85Path.join(' ')} ${p85p50Path.join(' ')} Z`}
        fill={PERCENTILE_COLORS.p50_p85}
      />
    )

    // 绘制 P85-P97 区域
    const p85p97Path: string[] = []
    const p97p85Path: string[] = []

    for (let m = 0; m <= maxAgeMonths; m += 1) {
      const p97 = getPercentileValue(m, 'p97')
      if (p97 === null) continue
      if (p85p97Path.length === 0) {
        p85p97Path.push(`M ${xScale(m)} ${yScale(p97)}`)
      } else {
        p85p97Path.push(`L ${xScale(m)} ${yScale(p97)}`)
      }
    }
    for (let m = maxAgeMonths; m >= 0; m -= 1) {
      const p85 = getPercentileValue(m, 'p85')
      if (p85 === null) continue
      if (p97p85Path.length === 0) {
        p97p85Path.push(`M ${xScale(m)} ${yScale(p85)}`)
      } else {
        p97p85Path.push(`L ${xScale(m)} ${yScale(p85)}`)
      }
    }

    areas.push(
      <path
        key="p85-p97"
        d={`${p85p97Path.join(' ')} ${p97p85Path.join(' ')} Z`}
        fill={PERCENTILE_COLORS.p85_p97}
      />
    )

    return areas
  }

  // 绘制百分位参考线
  const renderPercentileLines = () => {
    const lines: JSX.Element[] = []
    const genderPercentiles = percentiles.filter((p) => p[gender])

    if (genderPercentiles.length < 2) return lines

    const percentileKeys: Array<'p3' | 'p15' | 'p50' | 'p85' | 'p97'> = ['p3', 'p15', 'p50', 'p85', 'p97']

    percentileKeys.forEach((key) => {
      const coords: { x: number; y: number }[] = []
      for (let m = 0; m <= maxAgeMonths; m += 1) {
        const point = percentiles.find((p) => p.ageMonths === m)
        if (point && point[gender]) {
          const val = point[gender]![key]
          const scaledVal = measureType === 'weight' ? val / 1000 : val / 10
          coords.push({ x: xScale(m), y: yScale(scaledVal) })
        }
      }
      if (coords.length > 1) {
        lines.push(
          <path
            key={`line-${key}`}
            d={smoothPathFromPoints(coords)}
            fill="none"
            stroke={REFERENCE_LINE_COLOR}
            strokeWidth={key === 'p50' ? 1.5 : 1}
            strokeDasharray={key === 'p50' ? 'none' : '4 2'}
          />
        )
      }
    })

    return lines
  }

  // 绘制实际数据点连线和点
  const renderDataPoints = () => {
    if (data.length === 0) return null

    const validData = data
      .filter((d) => d.value > 0)
      .sort((a, b) => a.ageMonths - b.ageMonths)
    if (validData.length === 0) return null

    // 转换数据
    const points = validData.map((d) => ({
      x: xScale(d.ageMonths),
      y: yScale(measureType === 'weight' ? d.value / 1000 : d.value / 10),
      ...d,
    }))

    const linePath = smoothPathFromPoints(points.map((p) => ({ x: p.x, y: p.y })))

    return (
      <g className="data-series">
        {/* 连线 */}
        <path
          d={linePath}
          fill="none"
          stroke={DATA_POINT_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 数据点 */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={DATA_POINT_COLOR}
            stroke="white"
            strokeWidth={2}
          />
        ))}
      </g>
    )
  }

  return (
    <div className={className}>
      <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        {/* 网格线 */}
        <g className="grid-lines">
          {yTickValues.map((tick, i) => (
            <line
              key={i}
              x1={pad.left}
              y1={yScale(tick.value)}
              x2={chartWidth - pad.right}
              y2={yScale(tick.value)}
              stroke="#F3F4F6"
              strokeWidth={1}
            />
          ))}
        </g>

        {/* Y 轴标签 */}
        <g className="y-axis-labels">
          {yTickValues.map((tick, i) => (
            <text
              key={i}
              x={pad.left - 10}
              y={yScale(tick.value) + 4}
              textAnchor="end"
              fill="#9CA3AF"
              fontSize={11}
            >
              {tick.label}
            </text>
          ))}
          {/* Y 轴单位 */}
          <text
            x={pad.left - 10}
            y={pad.top - 10}
            textAnchor="end"
            fill="#6B7280"
            fontSize={11}
            fontWeight={500}
          >
            {config.unit}
          </text>
        </g>

        {/* X 轴标签（月龄刻度，倾斜以与其它图表一致） */}
        <g className="x-axis-labels">
          {xTickMonths.map((m) => (
            <ChartRotatedXLabel key={m} x={xScale(m)} chartHeight={chartHeight} paddingBottom={pad.bottom}>
              {m}月
            </ChartRotatedXLabel>
          ))}
          {/* X 轴标题 */}
          <text
            x={chartWidth / 2}
            y={chartHeight - 4}
            textAnchor="middle"
            fill="#6B7280"
            fontSize={11}
            fontWeight={500}
          >
            月龄
          </text>
        </g>

        {/* 百分位区域 */}
        {renderPercentileAreas()}

        {/* 百分位参考线 */}
        {renderPercentileLines()}

        {/* 实际数据点 */}
        {renderDataPoints()}
      </svg>

      {/* 图例 */}
      <div className="flex flex-wrap gap-3 mt-2 justify-center text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-gray-300"></span>
          P3/P97
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-gray-300" style={{ borderStyle: 'dashed' }}></span>
          P15/P85
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-gray-400"></span>
          P50
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DATA_POINT_COLOR }}></span>
          实际测量
        </span>
      </div>
    </div>
  )
}
