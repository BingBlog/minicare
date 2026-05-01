/**
 * EcChart - 基于 echarts-for-weixin 原理的 Taro React 图表组件
 *
 * 核心逻辑与 ecomfe/echarts-for-weixin 的 ec-canvas 组件完全一致：
 *   1. Canvas 2D 节点获取 (createSelectorQuery.fields({ node: true }))
 *   2. WxCanvas 适配器
 *   3. echarts.setPlatformAPI 平台注入
 *   4. echarts.init + setOption
 *
 * 差异化：不依赖微信原生自定义组件，直接用 Taro Canvas 元素 + React hooks。
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { View, Canvas } from '@tarojs/components'
import Taro from '@tarojs/taro'
import * as echarts from 'echarts'

class WxCanvas {
  ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D
  canvasId: string
  chart: echarts.ECharts | null = null
  _canvasNode: WechatMiniprogram.Canvas

  constructor(
    ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
    canvasId: string,
    canvasNode: WechatMiniprogram.Canvas,
  ) {
    this.ctx = ctx
    this.canvasId = canvasId
    this._canvasNode = canvasNode
  }

  getContext(contextType: string) {
    if (contextType === '2d') return this.ctx
  }

  setChart(chart: echarts.ECharts) { this.chart = chart }

  set width(w: number) { this._canvasNode.width = w }
  set height(h: number) { this._canvasNode.height = h }
  get width() { return this._canvasNode.width }
  get height() { return this._canvasNode.height }

  addEventListener() {}
  attachEvent() {}
  detachEvent() {}
}

interface EcChartProps {
  option: echarts.EChartsOption
  height: string
}

let canvasIdCounter = 0

export default function EcChart({ option, height }: EcChartProps) {
  const [inited, setInited] = useState(false)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const idRef = useRef(`ec-${++canvasIdCounter}`)
  const cid = idRef.current

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inited) return
      const query = Taro.createSelectorQuery()
      query.select(`#${cid}`).fields({ node: true, size: true })
      query.exec((res) => {
        if (!res?.[0]) return
        const { node: canvasNode, width, height: h } = res[0] as {
          node: WechatMiniprogram.Canvas
          width: number
          height: number
        }
        if (!canvasNode || width === 0) return

        const dpr = Taro.getSystemInfoSync().pixelRatio
        const ctx = canvasNode.getContext('2d')
        const canvas = new WxCanvas(ctx, cid, canvasNode);

        (echarts as unknown as { setPlatformAPI: Function }).setPlatformAPI({
          createCanvas: () => canvas,
          loadImage: (src: string, onload: () => void, onerror: () => void) => {
            if (canvasNode.createImage) {
              const img = canvasNode.createImage()
              img.onload = onload
              img.onerror = onerror
              img.src = src
              return img
            }
            onerror?.()
          },
        })

        const chart = echarts.init(canvas as unknown as HTMLElement, undefined, {
          width, height: h, devicePixelRatio: dpr,
        })
        canvas.setChart(chart)
        chart.setOption(option)
        chartRef.current = chart
        setInited(true)
      })
    }, 250)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (chartRef.current) chartRef.current.setOption(option, true)
  }, [option])

  useEffect(() => {
    return () => { chartRef.current?.dispose(); chartRef.current = null }
  }, [])

  // ── 触摸事件 → ECharts zrender（与 ec-canvas.js touchStart/touchMove/touchEnd 一致）──

  const dispatchToChart = useCallback((type: string, x: number, y: number) => {
    if (!chartRef.current) return
    const handler = chartRef.current.getZr().handler
    handler.dispatch(type, {
      zrX: x,
      zrY: y,
      preventDefault: () => {},
      stopImmediatePropagation: () => {},
      stopPropagation: () => {},
    })
  }, [])

  const handleTouchStart = useCallback((e: { touches: Array<{ x: number; y: number }> }) => {
    if (!chartRef.current || !e.touches.length) return
    const { x, y } = e.touches[0]
    const handler = chartRef.current.getZr().handler
    dispatchToChart('mousedown', x, y)
    dispatchToChart('mousemove', x, y)
    // 触发 processGesture 以支持 ECharts 内部手势（如 tooltip 跟随）
    for (let i = 0; i < e.touches.length; ++i) {
      const t = e.touches[i];
      (t as { offsetX: number; offsetY: number }).offsetX = t.x;
      (t as { offsetX: number; offsetY: number }).offsetY = t.y
    }
    handler.processGesture(e, 'start')
  }, [dispatchToChart])

  const handleTouchMove = useCallback((e: { touches: Array<{ x: number; y: number }> }) => {
    if (!chartRef.current || !e.touches.length) return
    const { x, y } = e.touches[0]
    dispatchToChart('mousemove', x, y)
    for (let i = 0; i < e.touches.length; ++i) {
      const t = e.touches[i];
      (t as { offsetX: number; offsetY: number }).offsetX = t.x;
      (t as { offsetX: number; offsetY: number }).offsetY = t.y
    }
    chartRef.current.getZr().handler.processGesture(e, 'change')
  }, [dispatchToChart])

  const handleTouchEnd = useCallback((e: { changedTouches: Array<{ x: number; y: number }> }) => {
    if (!chartRef.current) return
    const touch = e.changedTouches?.[0] ?? { x: 0, y: 0 }
    const handler = chartRef.current.getZr().handler
    dispatchToChart('mouseup', touch.x, touch.y)
    dispatchToChart('click', touch.x, touch.y)
    for (let i = 0; i < (e as { touches?: Array<{ x: number; y: number }> }).touches?.length ?? 0; ++i) {
      const t = (e as { touches: Array<{ x: number; y: number }> }).touches[i];
      (t as { offsetX: number; offsetY: number }).offsetX = t.x;
      (t as { offsetX: number; offsetY: number }).offsetY = t.y
    }
    handler.processGesture(e, 'end')
  }, [dispatchToChart])

  return (
    <View style={{ width: '100%', height, position: 'relative' }}>
      <Canvas
        id={cid}
        canvasId={cid}
        type='2d'
        style={{ width: '100%', height, display: 'block' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </View>
  )
}
