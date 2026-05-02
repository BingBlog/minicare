/**
 * EcChart - 基于 echarts-for-weixin 原理的 Taro React 图表组件
 *
 * 微信小程序 Canvas 原生组件的固有限制：
 *   1. 层级最高，会覆盖 fixed TabBar 等元素
 *   2. 页面滚动时跟随有延迟（Native 与 WebView 帧不同步）
 *
 * 解决方案 — 纯截图模式：
 *   - Canvas 始终在屏幕外（left:-9999px），仅用于 ECharts 渲染 + 截图
 *   - 用户看到的始终是 Image（纯 WebView 元素），无层级问题、无滚动延迟、无闪动
 *   - option 变化时自动重新渲染并刷新截图
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { View, Canvas, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import echarts, { type ECharts, type EChartsOption } from '@/lib/echarts'

// ── WxCanvas 适配器 ──

class WxCanvas {
  ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D
  canvasId: string
  chart: ECharts | null = null
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

  setChart(chart: ECharts) { this.chart = chart }

  set width(w: number) { this._canvasNode.width = w }
  set height(h: number) { this._canvasNode.height = h }
  get width() { return this._canvasNode.width }
  get height() { return this._canvasNode.height }

  addEventListener() {}
  removeEventListener() {}
  attachEvent() {}
  detachEvent() {}
}

// ── 类型 ──

interface EcChartProps {
  option: EChartsOption
  height: string
}

let canvasIdCounter = 0

// ── 组件 ──

export default function EcChart({ option, height }: EcChartProps) {
  const idRef = useRef(`ec-${++canvasIdCounter}`)
  const cid = idRef.current

  const [inited, setInited] = useState(false)
  const [snapshotSrc, setSnapshotSrc] = useState<string | null>(null)
  const chartRef = useRef<ECharts | null>(null)
  const canvasNodeRef = useRef<WechatMiniprogram.Canvas | null>(null)

  // ── 截图 ──
  const takeSnapshot = useCallback(() => {
    const canvasNode = canvasNodeRef.current
    if (!canvasNode) return
    Taro.canvasToTempFilePath({
      canvas: canvasNode as unknown as WechatMiniprogram.Canvas,
      success: (res) => setSnapshotSrc(res.tempFilePath),
      fail: (err) => console.warn('[EcChart] snapshot fail:', err),
    })
  }, [])

  // ── 初始化 Canvas + ECharts ──
  useEffect(() => {
    if (inited) return
    const timer = setTimeout(() => {
      const query = Taro.createSelectorQuery()
      query.select(`#${cid}`).fields({ node: true, size: true })
      query.exec((res) => {
        if (!res?.[0]) return
        const { node: canvasNode, width, height: h } = res[0] as {
          node: WechatMiniprogram.Canvas; width: number; height: number
        }
        if (!canvasNode || width === 0) return

        canvasNodeRef.current = canvasNode
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
        chart.setOption({ ...option, animation: false })
        chartRef.current = chart
        setInited(true)

        // 首次截图（animation:false 渲染同步完成，短延迟等 Canvas 刷新即可）
        setTimeout(() => {
          Taro.canvasToTempFilePath({
            canvas: canvasNode as unknown as WechatMiniprogram.Canvas,
            success: (r) => setSnapshotSrc(r.tempFilePath),
            fail: () => {},
          })
        }, 50)
      })
    }, 250)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // option 更新 → 重新渲染 + 截图
  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.setOption({ ...option, animation: false }, true)
    setTimeout(takeSnapshot, 50)
  }, [option, takeSnapshot])

  // 清理
  useEffect(() => {
    return () => { chartRef.current?.dispose(); chartRef.current = null }
  }, [])

  // ── 渲染 ──

  return (
    <View style={{ width: '100%', height, position: 'relative', overflow: 'hidden' }}>
      {/* Canvas 始终在屏幕外，仅用于 ECharts 渲染和截图 */}
      <Canvas
        id={cid}
        canvasId={cid}
        type='2d'
        style={{
          width: '100%',
          height,
          display: 'block',
          position: 'absolute',
          left: '-9999px',
          top: 0,
        }}
      />

      {/* 用户看到的始终是截图 Image */}
      {snapshotSrc && (
        <Image
          src={snapshotSrc}
          mode='widthFix'
          style={{
            width: '100%',
            display: 'block',
          }}
        />
      )}
    </View>
  )
}
