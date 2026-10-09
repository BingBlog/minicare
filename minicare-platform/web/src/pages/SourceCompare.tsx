import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { ParsedBlock, ParsedDoc } from '../lib/types'
import { FURNITURE_TYPES, blockTypeLabel } from '../lib/labels'
import { renderMarkdown } from '../lib/md-render'
import { Card, CardBody, CardHead, Empty, ErrorBox, Loading, Notice, Pill } from '../components/ui'
import { HtmlSourceView } from '../components/HtmlSourceView'
import { PdfDocument } from '../components/PdfDocument'
import { SplitPane } from '../components/SplitPane'

type Mode = 'markdown' | 'json'

/** 块类型配色（左侧框线与右侧标签呼应） */
const TYPE_COLOR: Record<string, string> = {
  text: '#2F6FB0',
  list: '#3F6E15',
  table: '#8A540B',
  image: '#7A4FA8',
  equation: '#0F766E',
  aside_text: '#9A7E82',
  table_title: '#8A540B',
  figure_title: '#7A4FA8',
  header: '#98928C',
  footer: '#98928C',
  page_number: '#98928C',
  page_footnote: '#B08968',
}

function typeColor(t: string): string {
  return TYPE_COLOR[t] || '#2F6FB0'
}

/**
 * bbox → 百分比。`space` 是后端的归一化上限（`bbox_space`，当前 1000）——**不写死**：
 * MinerU 侧 `content_list` 就是 `MiddleJson` 的 0~1 bbox × 1000（源码原话），
 * 一旦上游改口径，后端改字段即可，前端不用动，也不会静默错位。
 */
function boxStyle(b: ParsedBlock, space: number): CSSProperties | null {
  if (!b.bbox || b.bbox.length !== 4) return null
  const [x1, y1, x2, y2] = b.bbox
  const k = 100 / (space || 1000)
  return {
    left: `${x1 * k}%`,
    top: `${y1 * k}%`,
    width: `${Math.max(0, x2 - x1) * k}%`,
    height: `${Math.max(0, y2 - y1) * k}%`,
  }
}

/**
 * 解析结果对照（US-14）—— 左：可滚动翻页的源 PDF（区块高亮）；右：Markdown / JSON 两个页签
 *
 * ## 与 mineru.net Extractor 的对齐（源码调研结论）
 * · 左栏 = **pdf.js 连续滚动**（MinerU 用的是它本地 vendor 的同一版本 6.3.289），
 *   工具条同样是 上/下一页 + 页码 + 总页数 + 缩放 −/+ + 适配栏宽。
 * · 右栏 = **只有 Markdown 与 JSON 两个页签**（MinerU 的 Gradio 套件即如此：
 *   `gr.Tabs` 下 `Markdown`（渲染后的 HTML）+ `JSON`），没有"按页块列表"。
 *
 * ## 我们的增量：联动高亮
 * MinerU 开源版**没有**"选中原文 → Markdown 对应高亮"（左栏其实是把框烧进 PDF 的静态结果，
 * 见 `docvortex.visualization.render_layout_pdf`，且其前端 JS 无任何窗格联动逻辑）。
 * 这里用 DOM 叠层实现：左栏框与右栏 Markdown 片段通过 `block_i` 双向绑定，
 * 点击即高亮并互相滚动定位。
 */
export function CompareView() {
  const { doc, nonce, toast } = useApp()
  const [mode, setMode] = useState<Mode>('markdown')
  const [zoom, setZoom] = useState(1)
  const [showBoxes, setShowBoxes] = useState(true)
  const [hideFurniture, setHideFurniture] = useState(false)
  const [showBboxText, setShowBboxText] = useState(false)
  /** hover（临时）与 pinned（点击后固定）分开：hover 只高亮，不抢滚动 */
  const [hoverI, setHoverI] = useState<number | null>(null)
  const [pinnedI, setPinnedI] = useState<number | null>(null)
  const [current, setCurrent] = useState(0)
  const [pageCount, setPageCount] = useState(0)

  const gotoRef = useRef<((i: number) => void) | null>(null)
  const chunkRefs = useRef(new Map<number, HTMLDivElement>())
  const rightRef = useRef<HTMLDivElement | null>(null)

  const { data, error, loading } = useAsync<ParsedDoc | null>(
    () => (doc ? api.parsed(doc) : Promise.resolve(null)),
    [doc, nonce],
  )

  useEffect(() => {
    setPinnedI(null)
    setHoverI(null)
    setZoom(1)
    setCurrent(0)
    setMode('markdown')
  }, [doc])

  const activeI = hoverI ?? pinnedI

  const blocksByI = useMemo(() => {
    const m = new Map<number, ParsedBlock>()
    for (const b of data?.blocks ?? []) m.set(b.i, b)
    return m
  }, [data])

  const byPage = useMemo(() => {
    const m = new Map<number, ParsedBlock[]>()
    for (const b of data?.blocks ?? []) {
      const k = b.page_idx ?? -1
      const arr = m.get(k)
      if (arr) arr.push(b)
      else m.set(k, [b])
    }
    return m
  }, [data])

  /**
   * **续排区域** → 它所属的块。
   *
   * MinerU 对跨栏 / 跨页段落只给一个落点的 bbox，其余落点记成**空文本块**（没有 md 片段）。
   * 后端已经用 PDF 文字层核对了归属，这里据此把它们当作所属块的一部分 ——
   * 否则点那一块会得到"该块不在 Markdown 中"，而**那些字其实就在 markdown 里**
   * （被记在了同段的前一个块上）。
   */
  const regionOf = useMemo(() => {
    const m = new Map<number, number>()
    for (const [k, v] of Object.entries(data?.region_of ?? {})) m.set(Number(k), v)
    return m
  }, [data])

  /**
   * 有 markdown 片段的块集合（页眉/页脚/页码类没有）。
   * **续排区域也算**（它们的 md 记在所属块上），这样 `selectBlock` 会去滚动而不是弹提示。
   */
  const mdSet = useMemo(
    () => new Set<number>([...(data?.md_chunks ?? []).map((c) => c.block_i), ...regionOf.keys()]),
    [data, regionOf],
  )

  /** 把右栏滚到某个块 */
  const scrollRightTo = useCallback((i: number) => {
    const el = chunkRefs.current.get(i)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [])

  const selectBlock = useCallback(
    (i: number, from: 'pdf' | 'md') => {
      setPinnedI(i)
      const b = blocksByI.get(i)
      if (!b) return
      if (from === 'pdf') {
        // 续排区域没有自己的 md 片段 —— 滚到**所属块**的片段去（那才是这一段的正文）
        if (mdSet.has(i)) scrollRightTo(regionOf.get(i) ?? i)
        else toast('该块不在 Markdown 中：MinerU 不把页眉/页脚/页码写入 markdown', 5000)
      } else if (b.page_idx != null && b.page_idx !== current) {
        gotoRef.current?.(b.page_idx)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocksByI, mdSet, regionOf, current, scrollRightTo, toast],
  )

  /** 左栏每页的高亮叠层 */
  const renderOverlay = useCallback(
    (pageIdx: number) => {
      let bs = byPage.get(pageIdx) ?? []
      if (hideFurniture) bs = bs.filter((b) => !FURNITURE_TYPES.has(b.type))
      return bs.flatMap((b) => {
        const st = boxStyle(b, data?.bbox_space ?? 1000)
        if (!st) return []
        const isActive = activeI === b.i
        if (!showBoxes && !isActive) return []
        const c = typeColor(b.type)
        const boxes = [
          <div
            key={b.i}
            className={`pdfbox ${isActive ? 'active' : ''} ${FURNITURE_TYPES.has(b.type) ? 'furniture' : ''}`}
            style={{ ...st, borderColor: c, background: isActive ? `${c}40` : `${c}14` }}
            title={`${blockTypeLabel(b.type)}：${b.text.slice(0, 40)}`}
            onMouseEnter={() => setHoverI(b.i)}
            onMouseLeave={() => setHoverI((a) => (a === b.i ? null : a))}
            onClick={() => selectBlock(b.i, 'pdf')}
          >
            {isActive ? (
              <span className="pdfbox-tag" style={{ background: c }}>
                {blockTypeLabel(b.type)}
              </span>
            ) : null}
          </div>,
        ]
        // 该块的**其余落点**：MinerU 的 bbox 只覆盖一部分（`list` 只给第一条、跨栏段落只给一栏）。
        // 按 MinerU 自己的粒度逐条/逐栏画出来 —— 粒度更细，定位也更完整。
        for (const [k, r] of (b.regions ?? []).entries()) {
          const rst = boxStyle({ ...b, bbox: r.bbox }, data?.bbox_space ?? 1000)
          if (!rst) continue
          const itemText = r.item != null ? (b.text.split('\n')[r.item] ?? '') : ''
          boxes.push(
            <div
              key={`${b.i}-r${k}`}
              className={`pdfbox region ${isActive ? 'active' : ''}`}
              style={{ ...rst, borderColor: c, background: isActive ? `${c}40` : `${c}14` }}
              title={`${blockTypeLabel(b.type)}（落点 ${k + 1}/${b.regions!.length}）：${
                itemText.slice(0, 40) || b.text.slice(0, 40)
              }`}
              onMouseEnter={() => setHoverI(b.i)}
              onMouseLeave={() => setHoverI((a) => (a === b.i ? null : a))}
              onClick={() => selectBlock(b.i, 'pdf')}
            />
          )
        }
        return boxes
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byPage, hideFurniture, showBoxes, activeI, data?.bbox_space, selectBlock],
  )

  if (!doc) {
    return (
      <Card>
        <Empty title="尚未选择文档">请到「文档管理」点选一份文档。</Empty>
      </Card>
    )
  }
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  if (!data.ready) {
    return (
      <Card>
        <Empty title="还没有解析产物">先去「处理详情」页签跑一次六步（至少要跑 `parse`）。</Empty>
      </Card>
    )
  }

  const activeReq = pinnedI != null || hoverI != null
  const activeBlock = activeReq ? (blocksByI.get(activeI as number) ?? undefined) : undefined

  return (
    <>
      <SplitPane storageKey="kb.cmp.ratio">
        {/* ── 左：可滚动翻页的源 PDF（区块高亮）/ HTML 渲染预览 ─────── */}
        <div className="cmp-pane">
          <Card>
            {/* 「PDF.js 连续滚动 / HTML 静态渲染」实现态徽标已移除（2026-10-09 晚，用户点名） */}
            <CardHead title="源文档" meta={data.source_name || data.doc_id} />
            <CardBody flush>
              {data.has_pdf ? (
                <>
                  <div className="cmp-toolbar">
                    <button
                      type="button"
                      className="btn"
                      disabled={current <= 0}
                      onClick={() => gotoRef.current?.(Math.max(0, current - 1))}
                    >
                      ‹ 上一页
                    </button>
                    <span className="hint">
                      <input
                        className="inp cmp-pageinput"
                        value={pageCount ? current + 1 : ''}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/\D/g, ''))
                          if (n) gotoRef.current?.(Math.max(0, Math.min(pageCount - 1, n - 1)))
                        }}
                      />{' '}
                      / {pageCount || '—'}
                    </span>
                    <button
                      type="button"
                      className="btn"
                      disabled={!pageCount || current >= pageCount - 1}
                      onClick={() => gotoRef.current?.(Math.min(pageCount - 1, current + 1))}
                    >
                      下一页 ›
                    </button>
                    <span className="sep" />
                    <button type="button" className="btn" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>
                      −
                    </button>
                    <span className="hint" style={{ minWidth: 42, textAlign: 'center' }}>
                      {Math.round(zoom * 100)}%
                    </span>
                    <button type="button" className="btn" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}>
                      +
                    </button>
                    <button type="button" className="btn" onClick={() => setZoom(1)}>
                      适配栏宽
                    </button>
                    <a className="btn" href={data.source_url} target="_blank" rel="noreferrer">
                      新标签打开
                    </a>
                  </div>

                  <div className="cmp-toolbar">
                    <label className="chk">
                      <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> 显示区块框
                    </label>
                    <label className="chk">
                      <input
                        type="checkbox"
                        checked={hideFurniture}
                        onChange={(e) => setHideFurniture(e.target.checked)}
                      />{' '}
                      隐藏页眉页脚/页码
                    </label>
                    <label className="chk">
                      <input type="checkbox" checked={showBboxText} onChange={(e) => setShowBboxText(e.target.checked)} />{' '}
                      显示坐标
                    </label>
                    <span className="hint" style={{ marginLeft: 'auto' }}>
                      本页 {hideFurniture ? (byPage.get(current) ?? []).filter((b) => !FURNITURE_TYPES.has(b.type)).length : (byPage.get(current) ?? []).length} 块
                    </span>
                  </div>
                </>
              ) : null}

              {data.has_pdf ? (
                <PdfDocument
                  fileUrl={data.source_url}
                  zoom={zoom}
                  onPageCount={setPageCount}
                  onCurrentPageChange={setCurrent}
                  onReady={(api2) => {
                    gotoRef.current = api2.gotoPage
                  }}
                  onError={(e) => toast(`源 PDF 载入失败：${e.message}`, 8000)}
                  renderOverlay={renderOverlay}
                />
              ) : (
                // 下载页来源：以沙箱 iframe 静态渲染源 HTML（脚本与外链资源全禁，见组件注释）
                <HtmlSourceView url={data.source_url} />
              )}
            </CardBody>
          </Card>
        </div>

        {/* ── 右：Markdown / JSON ───────────────────────────────── */}
        <div className="cmp-pane">
          <Card>
            <CardHead
              title="解析产物"
              meta={
                <>
                  {data.stats.blocks} 块 · {data.stats.pages} 页 · 已对齐 {data.md_aligned} 段
                </>
              }
            />
            <CardBody flush>
              <div className="cmp-toolbar">
                <span className="cmp-tabs">
                  <button
                    type="button"
                    className={`cmp-tab ${mode === 'markdown' ? 'active' : ''}`}
                    onClick={() => setMode('markdown')}
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    className={`cmp-tab ${mode === 'json' ? 'active' : ''}`}
                    onClick={() => setMode('json')}
                  >
                    JSON
                  </button>
                </span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const text =
                      mode === 'json'
                        ? JSON.stringify(data.blocks, null, 2)
                        : // 无块对齐时（HTML 来源）没有 chunks，整份文本在 md_full 里
                          data.md_full || data.md_preamble + data.md_chunks.map((c) => c.md).join('')
                    navigator.clipboard
                      .writeText(text)
                      .then(() => toast('已复制到剪贴板'))
                      .catch(() => toast('复制失败：浏览器拒绝了剪贴板访问', 6000))
                  }}
                >
                  复制
                </button>
              </div>

              {activeBlock ? (
                <div className="cmp-activebar">
                  <Pill kind="accent">{blockTypeLabel(activeBlock.type)}</Pill>
                  <span className="hint">
                    #{activeBlock.i} · p.{activeBlock.page_idx != null ? activeBlock.page_idx + 1 : '—'}
                    {showBboxText && activeBlock.bbox ? ` · bbox [${activeBlock.bbox.join(', ')}]` : ''}
                    {regionOf.has(activeBlock.i)
                      ? ` · 续排区域 → #${regionOf.get(activeBlock.i)}`
                      : mdSet.has(activeBlock.i)
                        ? ''
                        : ' · 不在 Markdown 中'}
                  </span>
                  <span className="cmp-activetext">
                    {activeBlock.text.slice(0, 60) ||
                      (regionOf.has(activeBlock.i)
                        ? `（本处无文字：这一段的字在 #${regionOf.get(activeBlock.i)}）`
                        : '(无文本)')}
                  </span>
                  <button type="button" className="btn" style={{ marginLeft: 'auto' }} onClick={() => setPinnedI(null)}>
                    取消选中
                  </button>
                </div>
              ) : (
                <Notice tone="accent">
                  {data.has_pdf ? (
                    <>
                      左栏已换成 <b>pdf.js 连续滚动</b>（与 MinerU 同一版本），点击左侧任一区块框即可让右侧
                      Markdown 滚到对应段落并高亮；hover 只高亮不抢滚动。页眉/页脚/页码不写入 markdown，
                      点它们会给出提示。
                    </>
                  ) : (
                    <>
                      源文档是<b>下载页（HTML）</b>：左栏按静态渲染展示网页内容（脚本已禁用，可切「源码」
                      页签看原始 HTML）。这类文档没有 content_list，右侧直接展示整份 Markdown，不做区块联动。
                    </>
                  )}
                </Notice>
              )}

              <div className="mdraw-body" ref={rightRef}>
                {mode === 'markdown' ? (
                  <>
                    {data.md_preamble ? (
                      <div
                        className="md-chunk"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(data.md_preamble) }}
                      />
                    ) : null}
                    {data.md_chunks.length ? (
                      data.md_chunks.map((c) => {
                        const b = blocksByI.get(c.block_i)
                        // 选中的是"续排区域"时，也把它所属块的片段一起点亮（那才是这一段的正文）
                        const isActive =
                          activeI === c.block_i || (activeI != null && regionOf.get(activeI) === c.block_i)
                        const col = b ? typeColor(b.type) : '#2F6FB0'
                        return (
                          <div
                            key={c.block_i}
                            ref={(el) => {
                              if (el) chunkRefs.current.set(c.block_i, el)
                              else chunkRefs.current.delete(c.block_i)
                            }}
                            className={`md-chunk ${isActive ? 'active' : ''} ${
                              b && FURNITURE_TYPES.has(b.type) ? 'furniture' : ''
                            }`}
                            style={isActive ? { borderLeftColor: col, background: `${col}12` } : undefined}
                            onMouseEnter={() => setHoverI(c.block_i)}
                            onMouseLeave={() => setHoverI((a) => (a === c.block_i ? null : a))}
                            onClick={() => selectBlock(c.block_i, 'md')}
                            title={`#${c.block_i} · ${b ? blockTypeLabel(b.type) : ''} · p.${
                              b?.page_idx != null ? b.page_idx + 1 : '—'
                            }`}
                          >
                            <div className="md-chunk-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.md) }} />
                          </div>
                        )
                      })
                    ) : data.md_full ? (
                      // 无块对齐（HTML 下载页来源，或一个块都没挂上）：直接展示整份 Markdown。
                      // 没有块可联动 —— `.whole` 覆掉 .md-chunk 的 pointer 手感（不假装可点）。
                      <div className="md-chunk whole">
                        <div
                          className="md-chunk-body"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(data.md_full) }}
                        />
                      </div>
                    ) : (
                      <Empty title="没有可展示的 Markdown">
                        这份文档还没有解析出的 Markdown 产物；源文档请看左栏。
                      </Empty>
                    )}
                  </>
                ) : (
                  <div className="mdjson-body">
                    {data.blocks.map((b) => {
                      const isActive = activeI === b.i
                      const col = typeColor(b.type)
                      return (
                        <div
                          key={b.i}
                          ref={(el) => {
                            if (el) chunkRefs.current.set(b.i, el)
                            else chunkRefs.current.delete(b.i)
                          }}
                          className={`mdjson-item ${isActive ? 'active' : ''}`}
                          style={isActive ? { borderLeftColor: col } : undefined}
                          onMouseEnter={() => setHoverI(b.i)}
                          onMouseLeave={() => setHoverI((a) => (a === b.i ? null : a))}
                          onClick={() => selectBlock(b.i, 'md')}
                        >
                          <div className="mdjson-head">
                            <span style={{ color: col }}>#{b.i}</span> · {blockTypeLabel(b.type)} · p.
                            {b.page_idx != null ? b.page_idx + 1 : '—'}
                            {regionOf.has(b.i)
                              ? ` · 续排区域 → #${regionOf.get(b.i)}`
                              : mdSet.has(b.i)
                                ? ''
                                : ' · 不在 Markdown 中'}
                          </div>
                          <pre className="mdjson-pre">{JSON.stringify(b, null, 2)}</pre>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      </SplitPane>
    </>
  )
}
