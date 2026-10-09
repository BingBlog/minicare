import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

/**
 * 连续滚动的 PDF 页面视图（自研，基于 pdf.js 核心 API）
 *
 * ## 为什么不直接用 `web/pdf_viewer.mjs` 的 PDFViewer 组件
 * 我们要在页面上叠一层「bbox 高亮框」，必须能精确控制每一页的 DOM 结构与坐标。用官方
 * 那套 Viewer 会被它的内部结构绑架；而只用核心 API（getDocument + page.render）自绘
 * 反而更短、更可控。代价是暂不做文字层（不可选中/搜索），见文末说明。
 *
 * ## 与 MinerU 的对应关系（源码调研结论）
 * · MinerU 左栏就是**本地 vendor 的 pdf.js**（同一版本 6.3.289），主体是连续滚动的 `PDFViewer`，
 *   工具条 = 上/下一页 + 页码 + 总页数 + 缩放 −/+ + fit-width，默认 fitWidth。
 * · pdf.js 运行期要按需取 `cmaps/`（CJK 字形）、`standard_fonts/`、`wasm/`（jbig2/openjpeg/qcms），
 *   这些由 `scripts/copy-pdfjs.mjs` 拷到 `public/pdfjs/` 同源提供 —— MinerU 同样是整套 vendor。
 *
 * ## 已知取舍
 * 未做文字层（textLayer）：能显著减少复杂度，但代价是 PDF 文字不可选中/搜索。本页的用途是
 * **比对解析质量**（看框与文字是否对齐），取舍可接受；后续要加就在每页 canvas 上再叠一层
 * textLayer（pdf.js 提供 `renderTextLayer`）。
 */

// pdf.js 主体约 480KB（worker 另有 1.2MB），**全部动态导入**：只有真正要看 PDF 时才加载，
// 不让「打开工作台的其它页签」也背上这个体积。
// 连 worker 的地址也用动态 import（`?url`）取，这样整个 pdf.js 依赖链都不会进主包。
type PdfjsModule = typeof import('pdfjs-dist')
let pdfjsPromise: Promise<PdfjsModule> | null = null

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url').then((m) => (m as { default: string }).default),
    ]).then(([m, workerUrl]) => {
      // worker / 字体 / wasm 全部同源（public/pdfjs，由 scripts/copy-pdfjs.mjs 生成）
      m.GlobalWorkerOptions.workerSrc = workerUrl
      return m
    })
  }
  return pdfjsPromise
}

const CMAP_URL = '/pdfjs/cmaps/'
const STANDARD_FONTS_URL = '/pdfjs/standard_fonts/'
const WASM_URL = '/pdfjs/wasm/'

export interface PdfDocumentProps {
  /** 源 PDF 地址（同源） */
  fileUrl: string
  /** 缩放倍率，1 = 适配栏宽 */
  zoom?: number
  /** 当前页变化（0 基） */
  onCurrentPageChange?: (pageIdx: number) => void
  /** 总页数回调 */
  onPageCount?: (n: number) => void
  onError?: (e: Error) => void
  /** 每页的高亮叠层（坐标用百分比，故与渲染分辨率无关） */
  renderOverlay?: (pageIdx: number) => ReactNode
  /** 把「跳到某页」的能力交给父组件 */
  onReady?: (api: { gotoPage: (i: number) => void }) => void
}

interface PageBox {
  width: number
  height: number
}

export function PdfDocument({
  fileUrl,
  zoom = 1,
  onCurrentPageChange,
  onPageCount,
  onError,
  renderOverlay,
  onReady,
}: PdfDocumentProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  /** 第 1 页在 scale=1 下的尺寸，用于占位（同尺寸文档占多数） */
  const [baseBox, setBaseBox] = useState<PageBox | null>(null)
  /** 适配栏宽的基础缩放 */
  const [fitScale, setFitScale] = useState(1)
  const [current, setCurrent] = useState(0)

  /* ── 1) 载入文档 ─────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false
    let task: { promise: Promise<PDFDocumentProxy>; destroy: () => Promise<void> } | null = null
    setStatus('loading')
    setPdf(null)
    setBaseBox(null)

    loadPdfjs()
      .then((pdfjsLib) => {
        if (cancelled) return
        const t = pdfjsLib.getDocument({
          url: fileUrl,
          cMapUrl: CMAP_URL,
          cMapPacked: true,
          standardFontDataUrl: STANDARD_FONTS_URL,
          wasmUrl: WASM_URL,
        })
        task = t
        return t.promise
      })
      .then((doc) => {
        if (!doc || cancelled) return
        setPdf(doc)
        onPageCount?.(doc.numPages)
        return doc
          .getPage(1)
          .then((page) => {
            if (cancelled) return
            const vp = page.getViewport({ scale: 1 })
            setBaseBox({ width: vp.width, height: vp.height })
            setStatus('ready')
          })
          .catch(() => {
            if (!cancelled) setStatus('ready')
          })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const e = err instanceof Error ? err : new Error(String(err))
        setStatus('error')
        setMessage(e.message || 'PDF 载入失败')
        onError?.(e)
      })

    return () => {
      cancelled = true
      task?.destroy().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl])

  /* ── 2) 适配栏宽：量容器宽度算 fitScale ──────────────────────── */
  useEffect(() => {
    const host = hostRef.current
    if (!host || !baseBox) return
    const measure = () => {
      const w = host.clientWidth
      if (w > 0 && baseBox.width > 0) setFitScale(w / baseBox.width)
    }
    // 尾部防抖：拖动左右分栏时分隔条每帧都在改宽度，而 fitScale 每变一次都会让**所有可见页
    // 重渲 canvas**（单页数十毫秒，135 页的文档尤其明显）。防抖后拖拽过程完全不重渲，
    // 停手 120ms 才对齐一次尺寸 —— 拖起来顺滑，松手即准。
    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(measure, 120)
    }
    measure()
    const ro = new ResizeObserver(schedule)
    ro.observe(host)
    return () => {
      window.clearTimeout(timer)
      ro.disconnect()
    }
  }, [baseBox])

  /* ── 3) 滚动时更新当前页 ─────────────────────────────────────── */
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        const top = host.getBoundingClientRect().top
        let idx = 0
        for (let i = 0; i < pageRefs.current.length; i++) {
          const el = pageRefs.current[i]
          if (!el) continue
          if (el.getBoundingClientRect().bottom > top + 8) {
            idx = i
            break
          }
        }
        setCurrent((c) => (c === idx ? c : idx))
      })
    }
    host.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      host.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [pdf])

  useEffect(() => {
    onCurrentPageChange?.(current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  /* ── 4) 暴露 gotoPage ────────────────────────────────────────── */
  const gotoPage = useCallback((i: number) => {
    const host = hostRef.current
    const el = pageRefs.current[i]
    if (!host || !el) return
    host.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (status === 'ready') onReady?.({ gotoPage })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, gotoPage])

  const renderScale = fitScale * zoom
  const pageW = (baseBox?.width ?? 612) * renderScale
  const pageH = (baseBox?.height ?? 792) * renderScale

  return (
    <div className="pdfdoc" ref={hostRef}>
      {status === 'loading' ? (
        <div className="pdfdoc-status">
          <span className="spin" /> 载入 PDF…
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="pdfdoc-status pdfdoc-error">
          源 PDF 载入失败：{message}
          <br />
          <a className="btn" href={fileUrl} target="_blank" rel="noreferrer">
            在新标签打开原件
          </a>
        </div>
      ) : null}
      {status === 'ready' && pdf
        ? Array.from({ length: pdf.numPages }, (_, i) => (
            <div
              key={i}
              ref={(el) => {
                pageRefs.current[i] = el
              }}
              className="pdfpage"
              data-page-idx={i}
              style={{ width: pageW, height: pageH }}
            >
              <PdfPageCanvas pdf={pdf} pageIdx={i} scale={renderScale} cssWidth={pageW} />
              {renderOverlay ? <div className="pdfpage-overlay">{renderOverlay(i)}</div> : null}
              <div className="pdfpage-no">{i + 1}</div>
            </div>
          ))
        : null}
    </div>
  )
}

/** 单页画布：进入视口附近才渲染（长文档必需） */
function PdfPageCanvas({
  pdf,
  pageIdx,
  scale,
  cssWidth,
}: {
  pdf: PDFDocumentProxy
  pageIdx: number
  scale: number
  cssWidth: number
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [visible, setVisible] = useState(pageIdx < 3)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setVisible(true)
      },
      // 提前一屏多开始渲染，滚动时不容易看到空白
      { root: el.closest('.pdfdoc'), rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let task: { cancel: () => void } | null = null
    pdf.getPage(pageIdx + 1).then((page) => {
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      const vp = page.getViewport({ scale: scale * dpr })
      canvas.width = Math.floor(vp.width)
      canvas.height = Math.floor(vp.height)
      canvas.style.width = `${Math.round(cssWidth)}px`
      canvas.style.height = 'auto'
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      // pdfjs 6 起 RenderParameters 要求同时给 canvas（不再只认 canvasContext）
      const t = page.render({ canvas, canvasContext: ctx, viewport: vp })
      task = t
      t.promise.catch(() => {
        /* 缩放/卸载时会被 cancel，属正常 */
      })
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [visible, pdf, pageIdx, scale, cssWidth])

  return (
    <div className="pdfpage-canvas" ref={wrapRef}>
      <canvas ref={canvasRef} />
      {!visible ? <div className="pdfpage-skeleton" /> : null}
    </div>
  )
}
