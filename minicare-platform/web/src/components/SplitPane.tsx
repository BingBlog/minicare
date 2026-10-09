import { Children, useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

/** 与 CSS 的 `--cmp-split-w` 必须一致（算比例时要先扣掉分隔条自身宽度） */
const SPLIT_W = 12
const RATIO_MIN = 0.15
const RATIO_MAX = 0.85

function readRatio(key: string): number {
  try {
    const v = Number(window.localStorage.getItem(key))
    if (Number.isFinite(v) && v >= RATIO_MIN && v <= RATIO_MAX) return v
  } catch {
    /* 隐私模式：用默认值 */
  }
  return 0.5
}

/**
 * 左右分栏容器：左栏 | 可拖动分隔条 | 右栏，默认 5:5，比例跨会话记住。
 *
 * 「原文对照」（`SourceCompare`）与「切片对照」（`ChunkCompare`）共用 —— 两个视图除了内容不同，
 * 分栏行为必须一致，否则用户在两页之间切换时手感会变。
 *
 * ## 为什么拖拽不进 React state
 * 拖动时每帧都改宽度，若走 state 就会重渲整棵子树（`PdfDocument` 里有 100+ 个 `.pdfpage`），必卡。
 * 所以拖动过程**只写 DOM 上的 CSS 变量**，松手时才 commit 一次（同步 state + 落盘 localStorage）。
 * 同理，`dragging`/百分比读数都用 classList / textContent 直接改，不走 state。
 *
 * 用法：传**恰好两个**子元素（左、右），中间的分隔条由本组件插入 ——
 * 这样调用方只需要把原来的 `<div className="cmp">…</div>` 换成 `<SplitPane>…</SplitPane>`，
 * 不必把两块 JSX 拆成 props（那种改法要整段重排缩进，最容易改错）。
 */
export function SplitPane({
  storageKey,
  children,
}: {
  storageKey: string
  children: ReactNode
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const splitRef = useRef<HTMLDivElement | null>(null)
  const pctRef = useRef<HTMLSpanElement | null>(null)
  const [ratio, setRatio] = useState(() => readRatio(storageKey))
  /** 与 state 同步的镜像：供 callback ref 在节点挂载的那一瞬间读到最新值 */
  const ratioRef = useRef(ratio)
  const [left, right] = Children.toArray(children)

  const paint = useCallback((r: number) => {
    boxRef.current?.style.setProperty('--cmp-ratio', String(r))
    if (pctRef.current) pctRef.current.textContent = `${Math.round(r * 100)}%`
  }, [])

  /**
   * 用 callback ref 而不是 `useEffect([ratio])`：调用方在数据到位前往往先渲染 Loading，
   * 那时 `.cmp` 根本不存在，effect 写了个空；等节点真挂载时 `ratio` 又没变、effect 不再跑 ——
   * 比例会永久停在 CSS 默认值上（表现为"改了比例没反应，且恰好看起来像 5:5"）。踩过。
   */
  const attach = useCallback((el: HTMLDivElement | null) => {
    boxRef.current = el
    if (el) el.style.setProperty('--cmp-ratio', String(ratioRef.current))
  }, [])

  useEffect(() => {
    ratioRef.current = ratio
    paint(ratio)
  }, [ratio, paint])

  const commit = useCallback(
    (r: number) => {
      paint(r)
      setRatio(r)
      try {
        window.localStorage.setItem(storageKey, String(r))
      } catch {
        /* 隐私模式：不持久化 */
      }
    },
    [paint, storageKey],
  )

  const onDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const box = boxRef.current
      if (!box) return
      e.preventDefault()
      // rect 在拖拽期间冻结：分栏只改左栏宽度，容器自身尺寸不变，故不会失效
      const rect = box.getBoundingClientRect()
      const usable = rect.width - SPLIT_W
      if (usable <= 0) return
      let latest = ratio
      splitRef.current?.classList.add('dragging')
      document.body.classList.add('col-resizing')
      const move = (ev: PointerEvent) => {
        latest = Math.min(RATIO_MAX, Math.max(RATIO_MIN, (ev.clientX - rect.left) / usable))
        paint(latest)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        splitRef.current?.classList.remove('dragging')
        document.body.classList.remove('col-resizing')
        commit(latest)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [commit, paint, ratio],
  )

  return (
    <div className="cmp" ref={attach}>
      {left}
      <div
        ref={splitRef}
        className="cmp-split"
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整左右宽度，双击复位为 5:5"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(RATIO_MIN * 100)}
        aria-valuemax={Math.round(RATIO_MAX * 100)}
        tabIndex={0}
        title="拖动调整宽度 · 双击复位 5:5"
        onPointerDown={onDown}
        onDoubleClick={() => commit(0.5)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.02
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            commit(Math.max(RATIO_MIN, ratio - step))
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            commit(Math.min(RATIO_MAX, ratio + step))
          }
        }}
      >
        <span className="cmp-split-grip" />
        <span className="cmp-split-pct" ref={pctRef} />
      </div>
      {right}
    </div>
  )
}
