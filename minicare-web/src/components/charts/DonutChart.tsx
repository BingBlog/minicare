/**
 * 环形图组件
 * 用于展示比例数据（如情绪分布、大便性状分布等）
 */
import React from 'react'
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
  const radius = size / 2
  const innerR = radius * innerRadius

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

  // 计算总值
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

  // 计算每段弧度
  let currentAngle = -Math.PI / 2 // 从顶部开始
  const segments = data.map((d) => {
    const angle = (d.value / total) * Math.PI * 2
    const segment = {
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: d.color,
      label: d.label,
      value: d.value,
      percentage: Math.round((d.value / total) * 100),
    }
    currentAngle += angle
    return segment
  })

  // 绘制弧线路径
  const describeArc = (
    cx: number,
    cy: number,
    outerR: number,
    innerR: number,
    startAngle: number,
    endAngle: number
  ) => {
    // 处理完整圆（角度接近 2π）
    const isFullCircle = Math.abs(endAngle - startAngle - Math.PI * 2) < 0.001
    if (isFullCircle) {
      // 绘制两个半圆
      const x1Outer = cx + outerR * Math.cos(startAngle)
      const y1Outer = cy + outerR * Math.sin(startAngle)
      const x2Outer = cx + outerR * Math.cos(startAngle + Math.PI)
      const y2Outer = cy + outerR * Math.sin(startAngle + Math.PI)
      const x1Inner = cx + innerR * Math.cos(startAngle)
      const y1Inner = cy + innerR * Math.sin(startAngle)

      return `
        M ${x1Outer} ${y1Outer}
        A ${outerR} ${outerR} 0 0 1 ${x2Outer} ${y2Outer}
        A ${outerR} ${outerR} 0 0 1 ${x1Outer} ${y1Outer}
        Z
        M ${x1Inner} ${y1Inner}
        A ${innerR} ${innerR} 0 0 0 ${cx + innerR * Math.cos(startAngle + Math.PI)} ${cy + innerR * Math.sin(startAngle + Math.PI)}
        A ${innerR} ${innerR} 0 0 0 ${x1Inner} ${y1Inner}
        Z
      `
    }

    const x1Outer = cx + outerR * Math.cos(startAngle)
    const y1Outer = cy + outerR * Math.sin(startAngle)
    const x2Outer = cx + outerR * Math.cos(endAngle)
    const y2Outer = cy + outerR * Math.sin(endAngle)
    const x1Inner = cx + innerR * Math.cos(endAngle)
    const y1Inner = cy + innerR * Math.sin(endAngle)
    const x2Inner = cx + innerR * Math.cos(startAngle)
    const y2Inner = cy + innerR * Math.sin(startAngle)

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0

    return `
      M ${x1Outer} ${y1Outer}
      A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}
      L ${x1Inner} ${y1Inner}
      A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2Inner} ${y2Inner}
      Z
    `
  }

  return (
    <div className={className}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* 各段弧线 */}
        {segments.map((seg, i) => (
          <path
            key={i}
            d={describeArc(
              radius,
              radius,
              radius - 2,
              innerR,
              seg.startAngle,
              seg.endAngle
            )}
            fill={seg.color}
          />
        ))}

        {/* 中心文字 */}
        {showCenter && (
          <text
            x={radius}
            y={radius - (centerValue ? 8 : 0)}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#374151"
            fontSize={12}
            fontWeight={500}
          >
            {centerText}
          </text>
        )}

        {/* 中心数值 */}
        {showCenter && centerValue && (
          <text
            x={radius}
            y={radius + 12}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#F87098"
            fontSize={18}
            fontWeight={600}
          >
            {centerValue}
          </text>
        )}
      </svg>

      {/* 图例 */}
      <div className="flex flex-wrap gap-2 mt-2 justify-center">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-xs text-gray-600">
              {seg.label} {seg.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
