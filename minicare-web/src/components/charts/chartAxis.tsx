/**
 * 图表 X 轴日期类标签：倾斜展示以容纳更多刻度
 */
import React from 'react'

/** 与常见日期轴一致的逆时针角度 */
export const CHART_X_LABEL_ROTATE = -45

/** 含倾斜日期时的默认底边距（需容纳旋转后字形上下延伸，避免与绘图区重叠） */
export const CHART_X_LABEL_BOTTOM_PAD = 52

/** 标签锚点距绘图区下沿的偏移（与底边距配合，让日期带与网格留出空隙） */
export const CHART_X_LABEL_OFFSET_FROM_PLOT = 20

/**
 * 默认 X 轴刻度间隔：略稀一点，让斜向日期之间不「挤在一起」
 * - 7 天及以内：每天一个标签
 * - 更长区间：约每 6 个点一个刻度，且至少隔 2 天
 */
export function chartDefaultXLabelInterval(pointCount: number): number {
  if (pointCount <= 1) return 1
  if (pointCount <= 7) return 1
  return Math.max(2, Math.ceil(pointCount / 6))
}

/** 旋转后的 X 轴刻度文案（日期等），以刻度位置为中心 */
export function ChartRotatedXLabel({
  x,
  chartHeight,
  paddingBottom = CHART_X_LABEL_BOTTOM_PAD,
  children,
}: {
  x: number
  chartHeight: number
  /** 与图表 SVG 的 bottom padding 一致，用于对齐 X 轴标签位置 */
  paddingBottom?: number
  children: React.ReactNode
}) {
  const plotBottomY = chartHeight - paddingBottom
  const y = plotBottomY + CHART_X_LABEL_OFFSET_FROM_PLOT
  return (
    <text
      x={x}
      y={y}
      transform={`rotate(${CHART_X_LABEL_ROTATE} ${x} ${y})`}
      textAnchor="middle"
      fill="#9CA3AF"
      fontSize={11}
    >
      {children}
    </text>
  )
}
