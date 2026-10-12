import { useEffect, useRef } from 'react'
import echarts, { type ECharts, type EChartsOption } from '../lib/echarts'

/**
 * ECharts 容器组件（TECH-033 §6.4）。
 *
 * 职责边界很窄：**给一个固定高度的盒子、把 option 画上去、容器变了就 resize、卸载就 dispose**。
 * 图表长什么样全部由调用方通过 `option`（见 `lib/analyticsChart.ts`）决定，
 * 这里不掺业务判断。
 *
 * 几个刻意的选择：
 *   · **高度必须由 props 给出**（默认 260px）。ECharts 初始化的那一刻会读容器尺寸，
 *     父级高度为 `auto` 时会量到 0，结果就是"图不显示但也不报错"——这是该组件最常见的坑；
 *   · `setOption(option, true)` 第二参 `true` = **不合并、整体替换**。本域的 option 每次
 *     都由最新数据完整重建，合并旧状态只会让切换时间窗后残留上一窗的 series；
 *   · `animation: false` —— 平台是高频刷新的数据看板，动效只拖慢读数（与小程序端同口径）；
 *   · `ResizeObserver` —— 侧栏收起/展开、窗口缩放都靠它，不用监听 window resize。
 */
export function EChart({
  option,
  height = 260,
  className,
}: {
  option: EChartsOption
  /** 容器高度（px）。**必填语义**：给 0 或省略会量不到高度，图不渲染。 */
  height?: number
  className?: string
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ECharts | null>(null)

  // 初始化一次；容器尺寸变化由 ResizeObserver 接管
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const chart = echarts.init(box, undefined, { renderer: 'canvas' })
    chartRef.current = chart

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => chart.resize())
      ro.observe(box)
    }

    return () => {
      ro?.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  // option 变化 → 整体替换重绘（本组件的 effect 顺序保证「先 init 再 setOption」）
  useEffect(() => {
    chartRef.current?.setOption({ ...option, animation: false }, true)
  }, [option])

  return <div ref={boxRef} className={className} style={{ width: '100%', height }} />
}
