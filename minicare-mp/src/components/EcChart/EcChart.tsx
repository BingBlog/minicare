/**
 * EcChart — canvas type="2d" 同层渲染直显组件（TECH-025，2026-10-11 重构）
 *
 * 架构变更（替代原「离屏渲染 + canvasToTempFilePath 截图 + Image 展示」方案）：
 *   1. canvas type="2d" 自基础库 2.9.0 起支持同层渲染，官方现行口径
 *      「除事件相关，同层渲染下已无层级/滚动限制」，直接参与文档流展示，
 *      无需截图绕行（旧限制针对的是非同层渲染的旧版 canvas）。
 *   2. 初始化用「轮询等待布局」替代固定 250ms 延时；失败留告警而非静默放弃。
 *   3. option 存 ref，init 时读取最新值，消除「init 闭包捕获陈旧 option」竞态。
 *   4. 触摸事件转发 zrender（与 echarts-for-weixin 同机制），解锁 tooltip；
 *      垂直滑动识别为页面滚动 → 主动收起提示框，不拦截滚动。
 *
 * 历史方案论证与真机验收要求见 docs/tech/TECH-025-mp-chart-rendering-research.md
 */
import { useEffect, useRef, useCallback } from 'react'
import { View, Canvas } from '@tarojs/components'
import type { CanvasTouchEvent } from '@tarojs/components'
import Taro from '@tarojs/taro'
import echarts, { type ECharts, type EChartsOption } from '@/lib/echarts'

// ── 小程序 Canvas 节点最小类型（不引入 WechatMiniprogram 全局命名空间，
//    避免其与 lib.dom 的 HTMLCanvasElement 等声明冲突）──

interface MpCanvasImage {
  onload: (() => void) | null
  onerror: (() => void) | null
  src: string
}

interface MpCanvasNode {
  width: number
  height: number
  getContext(contextType: '2d'): CanvasRenderingContext2D
  createImage?: () => MpCanvasImage
}

// ── WxCanvas 适配器 ──

class WxCanvas {
  ctx: CanvasRenderingContext2D
  canvasId: string
  chart: ECharts | null = null
  _canvasNode: MpCanvasNode

  constructor(
    ctx: CanvasRenderingContext2D,
    canvasId: string,
    canvasNode: MpCanvasNode,
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
  /** 触摸提示框（默认开启；H5 由 zrender 原生事件接管，无需手动转发） */
  interactive?: boolean
}

type ZrHandler = ReturnType<ECharts['getZr']>['handler']

/** 手势状态：用于区分「点按/横向拖动」与「垂直滚动页面」 */
interface TouchState {
  startX: number
  startY: number
  scrolling: boolean
}

let canvasIdCounter = 0

// ── 组件 ──

export default function EcChart({ option, height, interactive = true }: EcChartProps) {
  const idRef = useRef(`ec-${++canvasIdCounter}`)
  const cid = idRef.current

  const optionRef = useRef(option)
  optionRef.current = option // 始终指向最新 option，供 init 读取
  const chartRef = useRef<ECharts | null>(null)
  const touchStateRef = useRef<TouchState | null>(null)

  // ── 初始化：H5 直连真实 canvas；weapp 轮询等待节点布局完成（替代固定 250ms）──
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let tries = 0

    const tryInit = () => {
      if (disposed || chartRef.current) return
      Taro.createSelectorQuery()
        .select(`#${cid}`)
        .fields({ node: true, size: true })
        .exec((res) => {
          if (disposed || chartRef.current) return
          const item = res?.[0] as
            | { node?: MpCanvasNode; width?: number; height?: number }
            | undefined
          const node = item?.node
          const width = item?.width ?? 0
          const boxHeight = item?.height ?? 0
          if (!node || width === 0 || boxHeight === 0) {
            if (++tries < 10) timer = setTimeout(tryInit, 100)
            else console.warn('[EcChart] init give up: node not laid out', cid)
            return
          }

          const dpr = Taro.getSystemInfoSync().pixelRatio
          const ctx = node.getContext('2d')
          const canvas = new WxCanvas(ctx, cid, node)

          ;(echarts as unknown as { setPlatformAPI: (api: Record<string, unknown>) => void })
            .setPlatformAPI({
              createCanvas: () => canvas,
              loadImage: (src: string, onload: () => void, onerror: () => void) => {
                if (node.createImage) {
                  const img = node.createImage()
                  img.onload = onload
                  img.onerror = onerror
                  img.src = src
                  return img
                }
                onerror?.()
              },
            })

          const chart = echarts.init(canvas as unknown as HTMLElement, undefined, {
            width, height: boxHeight, devicePixelRatio: dpr,
            // 触屏判定放大（±12px）：便于点按小尺寸标记（如生长曲线数据点）；
            // 仅影响元素级命中（item 触发），不影响坐标轴触发（axis）逻辑
            useCoarsePointer: true, pointerSize: 24,
          })
          canvas.setChart(chart)
          chart.setOption({ ...optionRef.current, animation: false }, true)
          chartRef.current = chart
        })
    }

    if (process.env.TARO_ENV === 'h5') {
      // H5：echarts 直接初始化在真实 <canvas> 上（Taro H5 的 Canvas 组件
      // 会渲染 <taro-canvas> 宿主元素，内含原生 canvas 节点）
      timer = setTimeout(() => {
        const host = document.getElementById(cid)
        const canvasEl =
          (host?.tagName === 'CANVAS' ? host : host?.querySelector('canvas')) as HTMLCanvasElement | null
        if (disposed || !canvasEl || canvasEl.clientWidth === 0) return
        const dpr = Taro.getSystemInfoSync().pixelRatio || window.devicePixelRatio || 1
        const chart = echarts.init(canvasEl, undefined, { devicePixelRatio: dpr })
        chart.setOption({ ...optionRef.current, animation: false }, true)
        chartRef.current = chart
      }, 250)
    } else {
      timer = setTimeout(tryInit, 0)
    }

    return () => {
      if (timer) clearTimeout(timer)
      disposed = true
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── option 更新 → 直接重绘（无截图、无延时）──
  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.setOption({ ...option, animation: false }, true)
  }, [option])

  // ── 触摸转发 zrender（weapp；H5 由 zrender 原生事件接管）──

  const getHandler = (): ZrHandler | null => chartRef.current?.getZr().handler ?? null

  const toZrPoint = (t: { x: number; y: number }) => ({
    zrX: t.x, zrY: t.y, preventDefault: () => {},
  })

  const handleTouchStart = useCallback((e: CanvasTouchEvent) => {
    if (process.env.TARO_ENV === 'h5') return
    const t = e.touches?.[0]
    const h = getHandler()
    if (!t || !h || e.touches.length > 1) return
    touchStateRef.current = { startX: t.x, startY: t.y, scrolling: false }
    h.dispatch('mousedown', toZrPoint(t))
    h.dispatch('mousemove', toZrPoint(t))
  }, [])

  const handleTouchMove = useCallback((e: CanvasTouchEvent) => {
    if (process.env.TARO_ENV === 'h5') return
    const t = e.touches?.[0]
    const state = touchStateRef.current
    const h = getHandler()
    if (!t || !state || !h) return
    const dx = Math.abs(t.x - state.startX)
    const dy = Math.abs(t.y - state.startY)
    if (!state.scrolling && dy > 8 && dy > dx) {
      // 判为垂直滚动页面：收起提示框，不再转发（不拦截页面滚动）
      state.scrolling = true
      chartRef.current?.dispatchAction({ type: 'hideTip' })
      return
    }
    if (!state.scrolling) h.dispatch('mousemove', toZrPoint(t))
  }, [])

  const handleTouchEnd = useCallback((e: CanvasTouchEvent) => {
    if (process.env.TARO_ENV === 'h5') return
    const state = touchStateRef.current
    touchStateRef.current = null
    const h = getHandler()
    if (!state || !h || state.scrolling) return
    const t = e.changedTouches?.[0] ?? e.touches?.[0]
    if (t) h.dispatch('mouseup', toZrPoint(t))
  }, [])

  // ── 渲染 ──

  return (
    <View style={{ width: '100%', height }}>
      <Canvas
        id={cid}
        canvasId={cid}
        type='2d'
        style={{ width: '100%', height, display: 'block' }}
        onTouchStart={interactive ? handleTouchStart : undefined}
        onTouchMove={interactive ? handleTouchMove : undefined}
        onTouchEnd={interactive ? handleTouchEnd : undefined}
        onTouchCancel={interactive ? handleTouchEnd : undefined}
      />
    </View>
  )
}
