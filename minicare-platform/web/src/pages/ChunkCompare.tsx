import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { ParsedBlock, ParsedDoc, SegmentChunk, SegmentsGet, TranslationGet, TranslationItem } from '../lib/types'
import { FURNITURE_TYPES, blockTypeLabel, chunkTypeLabel } from '../lib/labels'
import { Card, CardBody, CardHead, Empty, ErrorBox, Loading, Notice, Pill } from '../components/ui'
import { HtmlSourceView } from '../components/HtmlSourceView'
import { PdfDocument } from '../components/PdfDocument'
import { SplitPane } from '../components/SplitPane'
import { renderRich } from '../lib/md-render'

/** 块类型配色 —— 与「解析结果对照」同一张表，两侧的视觉语言要一致 */
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
const typeColor = (t: string) => TYPE_COLOR[t] || '#2F6FB0'

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
 * 切片对照（「解析与切片」工作台的第 2 个视图）
 *
 * 与「解析结果对照」的关系：左侧**完全同构**（同一个 `PdfDocument` + bbox 叠层 + 分栏条），
 * 差别只在对什么：那边右边是 Markdown（解析产物），这边右边是**切块产物**（切片列表）。
 * 联动键也因此从 `block_i ↔ md 片段` 换成 `block_i ↔ 切片`。
 *
 * ## 联动是怎么成立的
 * 后端 `/api/docs/{id}/segments` 给出每个切片覆盖的 `block_is`。它不是猜的：切块现在会记录
 * 源行号（`Chunk.line_start/line_end`），沿 normalize 的 `line_map` 换算回原始 md 的字符区间，
 * 再与 `md_align` 的块区间求交 —— 实测 **100%** 命中（纯文本匹配只能到 88.5%）。
 * 旧产物没有行号时后端会置 `aligned: false` 并给出原因，本页按 `page_idx` 退化为页码定位。
 */
export function ChunkCompareView() {
  const { doc, nonce, toast } = useApp()
  const [zoom, setZoom] = useState(1)
  const [showAllBoxes, setShowAllBoxes] = useState(true)
  /**
   * 选中态**支持 `?chunk=<kb_id>` 深链接**（只读，不回写）：
   * 把一个"这块切坏了"的切片直接发给同事，打开就落在它上面、操作面板也是展开的。
   */
  const [pinned, setPinned] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('chunk')
    } catch {
      return null
    }
  })
  const [hover, setHover] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [pageCount, setPageCount] = useState(0)

  /* ── 切片操作（US-05 内容校对，已并入本视图）──────────────────────────
     选中一个切片后展示它可做的操作。表单全部内联 —— 不用 `window.prompt()`
     （那是旧版兜底，且违反「禁止浏览器原生对话框」的项目约定），
     也不再需要来回跳页面：操作对象就在眼前。 */
  type Op = '' | 'mark' | 'edit' | 'split' | 'danger' | 'zh'
  const [op, setOp] = useState<Op>('')
  const [busy, setBusy] = useState(false)
  const [markReason, setMarkReason] = useState('')
  const [markNote, setMarkNote] = useState('')
  const [editText, setEditText] = useState('')
  const [splitText, setSplitText] = useState('')
  const [splitAt, setSplitAt] = useState<number[]>([])
  /** 译文显示模式：原文 | 对照 | 译文（英文文档默认「对照」，TECH-019） */
  const [zhView, setZhView] = useState<'orig' | 'dual' | 'zh'>('dual')
  const [zhDraft, setZhDraft] = useState('')
  /** 刚保存/恢复过的译文（本地覆盖，免整页重取）；null = 已恢复机翻 */
  const [zhOverride, setZhOverride] = useState<Record<string, TranslationItem | null>>({})
  /** 刚打过/取消过标记的切片（本地覆盖，免整页重取） */
  const [markOverride, setMarkOverride] = useState<
    Record<string, { reason: string; note: string; at: string } | null>
  >({})
  /** 本次会话提交过人工产物 → 切块及下游已标待重跑，界面要提醒 */
  const [pendingRerun, setPendingRerun] = useState(false)
  const splitRef = useRef<HTMLTextAreaElement | null>(null)

  const gotoRef = useRef<((i: number) => void) | null>(null)
  const itemRefs = useRef(new Map<string, HTMLDivElement>())

  const parsed = useAsync<ParsedDoc | null>(
    () => (doc ? api.parsed(doc) : Promise.resolve(null)),
    [doc, nonce],
  )
  const seg = useAsync<SegmentsGet | null>(
    () => (doc ? api.segments(doc) : Promise.resolve(null)),
    [doc, nonce],
  )
  /** 译文数据（TECH-019）：未就绪/失败时静默降级为 null，不影响本页既有功能 */
  const trans = useAsync<TranslationGet | null>(
    () => (doc ? api.translation(doc).catch(() => null) : Promise.resolve(null)),
    [doc, nonce],
  )

  /**
   * 用来区分「首次挂载」与「真的换了文档」。
   *
   * ⚠️ **不能用布尔 ref**：`main.tsx` 开了 `<StrictMode>`，它会把挂载时的 effect 跑两遍
   * （模拟卸载 + 重挂），而 ref 在两遍之间是保留的 —— 第二遍布尔标记就已经是 true，
   * 于是首挂也会执行 reset，把 `?chunk=` 带来的选中态清掉（表现为"链接对了但没选中"）。
   * 换成记住"上一次的 doc"，两遍都得到 changed=false，才稳。
   */
  const lastDocRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const changed = lastDocRef.current !== undefined && lastDocRef.current !== doc
    lastDocRef.current = doc
    if (changed) setPinned(null)
    setHover(null)
    setZoom(1)
    setCurrent(0)
    setOp('')
    setPendingRerun(false)
    setMarkOverride({})
    setZhOverride({})
    setZhView('dual')
  }, [doc])

  const chunks = seg.data?.chunks ?? []
  /**
   * 切片正文的**富渲染**结果（md + MinerU 内联的 `<table>` HTML），按 kb_id 缓存。
   *
   * 为什么不再直接输出纯文本：MinerU 的正文里表格是**原始 `<table>` HTML**、图片是
   * `![](images/<sha>.jpg)`，当文本显示就是"一串 HTML 代码 + 一行图:无题"
   * （2026-10-05 用户报障：表格要能预览、图片要能显示）。
   * 为什么要缓存：hover 会让整个列表重渲染，不缓存等于每次鼠标移动都把上百个切片
   * 重新 markdown 一遍。
   */
  const bodyHtml = useMemo(() => {
    const m = new Map<string, string>()
    const base = seg.data?.img_url_base || ''
    for (const c of chunks) m.set(c.kb_id, renderRich(c.content, base))
    return m
  }, [chunks, seg.data?.img_url_base])

  const activeKey = hover ?? pinned
  const activeChunk = useMemo(
    () => chunks.find((c) => c.kb_id === activeKey) ?? null,
    [chunks, activeKey],
  )
  /**
   * 选中切片覆盖的块 —— **含续排区域**（跨栏/跨页段落落在别处的部分）。
   * 后端已把它们并进 `block_is`，因为它们同样属于这个切片（文字层核对过），
   * 所以这里一视同仁地高亮，不再有"实线 / 虚线续接"的区分。
   */
  const activeBlocks = useMemo(() => new Set(activeChunk?.block_is ?? []), [activeChunk])

  /** 块 → 切片（点左侧框时反查切片） */
  const chunkByBlock = useMemo(() => {
    const m = new Map<number, SegmentChunk>()
    for (const c of chunks) for (const bi of c.block_is) m.set(bi, c)
    return m
  }, [chunks])

  const byPage = useMemo(() => {
    const m = new Map<number, ParsedBlock[]>()
    for (const b of parsed.data?.blocks ?? []) {
      const k = b.page_idx ?? -1
      const arr = m.get(k)
      if (arr) arr.push(b)
      else m.set(k, [b])
    }
    return m
  }, [parsed.data])

  /** 跳到某切片：滚右栏 + 左栏翻到它的第一个块所在页 */
  const selectChunk = useCallback(
    (key: string, from: 'list' | 'pdf') => {
      setPinned(key)
      setOp('')          // 换切片就收起上一个切片展开的操作表单，避免误操作到别的切片
      const c = chunks.find((x) => x.kb_id === key)
      if (!c) return
      if (from === 'pdf') {
        const el = itemRefs.current.get(key)
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      } else {
        const first = c.block_is[0]
        const b = (parsed.data?.blocks ?? []).find((x) => x.i === first)
        if (b?.page_idx != null && b.page_idx !== current) gotoRef.current?.(b.page_idx)
        else if (!c.block_is.length) {
          if (c.page_idx != null) gotoRef.current?.(c.page_idx)
          else toast('该切片未记录行号也未锚定页码，无法定位到原文', 6000)
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chunks, parsed.data, current, toast],
  )

  /** 点左栏的框 → 反查它属于哪个切片 */
  const onBlockClick = useCallback(
    (bi: number) => {
      const c = chunkByBlock.get(bi)
      if (c) selectChunk(c.kb_id, 'pdf')
      else toast('该区块没有对应的切片：切块按「标题章节」组织，标题前的内容会成为孤立块', 6000)
    },
    [chunkByBlock, selectChunk, toast],
  )

  /** 取某切片当前的标记（本地覆盖优先，免整页重取） */
  const markOf = useCallback(
    (c: SegmentChunk) =>
      c.kb_id in markOverride ? markOverride[c.kb_id] : (c.mark ?? null),
    [markOverride],
  )

  /** 取切片的译文条目（本地覆盖优先；`null` 覆盖 = 已恢复机翻，回落到产物值，TECH-019） */
  const trOf = useCallback(
    (kbId: string): TranslationItem | null => {
      if (kbId in zhOverride) {
        const local = zhOverride[kbId]
        if (local) return local
      }
      return trans.data?.items?.[kbId] ?? null
    },
    [zhOverride, trans.data],
  )

  /** 译文富渲染缓存（同 bodyHtml 的考虑：hover 会让整个列表重渲染，不能让上百块重排 markdown） */
  const zhHtml = useMemo(() => {
    const m = new Map<string, string>()
    const base = seg.data?.img_url_base || ''
    for (const c of chunks) {
      const t = trOf(c.kb_id)
      if (t?.zh) m.set(c.kb_id, renderRich(t.zh, base))
    }
    return m
  }, [chunks, seg.data?.img_url_base, trOf])

  /** 结构类操作（编辑/拆分/禁用/删除）提交后：人工产物落盘，切块及下游被标记待重跑 */
  const afterStructural = useCallback(
    async (what: string, run: () => Promise<unknown>) => {
      setBusy(true)
      try {
        await run()
        setPendingRerun(true)
        toast(`${what} 已提交；切块及下游已标记「待重跑」，需到「文档管理」重跑后才生效`, 12000)
        setOp('')
      } catch (e) {
        toast(`失败：${(e as Error).message}`, 9000)
      } finally {
        setBusy(false)
      }
    },
    [toast],
  )

  const doMark = useCallback(async () => {
    if (!doc || !pinned || !markReason) return
    setBusy(true)
    try {
      const r = await api.chunkMark(doc, pinned, markReason, markNote)
      setMarkOverride((m) => ({ ...m, [pinned]: r.mark }))
      toast(`已标记：${r.mark.reason}（标注不改内容、也不影响检索；要排除请再用「禁用/删除」）`, 9000)
      setOp('')
      setMarkNote('')
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 9000)
    } finally {
      setBusy(false)
    }
  }, [doc, pinned, markReason, markNote, toast])

  const doUnmark = useCallback(async () => {
    if (!doc || !pinned) return
    setBusy(true)
    try {
      await api.chunkUnmark(doc, pinned)
      setMarkOverride((m) => ({ ...m, [pinned]: null }))
      toast('已取消标记')
      setOp('')
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 9000)
    } finally {
      setBusy(false)
    }
  }, [doc, pinned, toast])

  /** 保存人工修正译文（覆盖层；与「编辑正文」不同 —— 不触发管线重跑） */
  const doSaveZh = useCallback(async () => {
    if (!doc || !pinned || !zhDraft.trim()) return
    const kb = pinned
    setBusy(true)
    try {
      await api.chunkTranslation(doc, kb, zhDraft)
      const base = trans.data?.items?.[kb]
      setZhOverride((m) => ({
        ...m,
        [kb]: {
          ...(base || { status: 'translated' as const }),
          zh: zhDraft,
          quality: 'reviewed',
          stale: false,
        },
      }))
      toast('译文修正已保存（覆盖层优先；只影响展示与后续消费，不触发管线重跑）', 9000)
      setOp('')
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 9000)
    } finally {
      setBusy(false)
    }
  }, [doc, pinned, zhDraft, trans.data, toast])

  /** 恢复机翻译文（删除覆盖层条目） */
  const doResetZh = useCallback(async () => {
    if (!doc || !pinned) return
    const kb = pinned
    setBusy(true)
    try {
      await api.chunkTranslationReset(doc, kb)
      setZhOverride((m) => ({ ...m, [kb]: null }))
      toast('已恢复机翻译文')
      setOp('')
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 9000)
    } finally {
      setBusy(false)
    }
  }, [doc, pinned, toast])

  /** 左栏每页的叠层：选中切片时，只有它的块高亮，其余压暗（保留上下文但不抢注意力） */
  const renderOverlay = useCallback(
    (pageIdx: number) => {
      const bs = byPage.get(pageIdx) ?? []
      return bs.flatMap((b) => {
        const st = boxStyle(b, parsed.data?.bbox_space ?? 1000)
        if (!st) return []
        const inChunk = activeBlocks.has(b.i)
        const furniture = FURNITURE_TYPES.has(b.type)
        if (!showAllBoxes && !inChunk) return []
        if (!activeChunk && furniture) return [] // 无选中时别把页眉页脚也画出来，太花
        const c = typeColor(b.type)
        const dim = activeChunk && !inChunk ? 0.25 : 1
        const boxes = [
          <div
            key={b.i}
            className={`pdfbox ${inChunk ? 'active' : ''} ${furniture ? 'furniture' : ''}`}
            style={{
              ...st,
              borderColor: c,
              background: inChunk ? `${c}40` : `${c}14`,
              opacity: dim,
              borderWidth: inChunk ? 2 : undefined,
            }}
            title={`${blockTypeLabel(b.type)}：${b.text.slice(0, 40)}${
              chunkByBlock.has(b.i) ? '' : '（无对应切片）'
            }`}
            onClick={() => onBlockClick(b.i)}
          >
            {inChunk ? (
              <span className="pdfbox-tag" style={{ background: c }}>
                {blockTypeLabel(b.type)}
              </span>
            ) : null}
          </div>,
        ]
        // 该块的**其余落点**（`list` 每条一个、跨栏段落每栏一个）—— 见 types.ts 的说明
        for (const [k, r] of (b.regions ?? []).entries()) {
          const rst = boxStyle({ ...b, bbox: r.bbox }, parsed.data?.bbox_space ?? 1000)
          if (!rst) continue
          const itemText = r.item != null ? (b.text.split('\n')[r.item] ?? '') : ''
          boxes.push(
            <div
              key={`${b.i}-r${k}`}
              className={`pdfbox region ${inChunk ? 'active' : ''}`}
              style={{
                ...rst,
                borderColor: c,
                background: inChunk ? `${c}40` : `${c}14`,
                opacity: dim,
                borderWidth: inChunk ? 2 : undefined,
              }}
              title={`${blockTypeLabel(b.type)}（落点 ${k + 1}/${b.regions!.length}）：${
                itemText.slice(0, 40) || b.text.slice(0, 40)
              }`}
              onClick={() => onBlockClick(b.i)}
            />
          )
        }
        return boxes
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byPage, activeBlocks, activeChunk, showAllBoxes, parsed.data?.bbox_space, chunkByBlock, onBlockClick],
  )

  if (!doc) {
    return (
      <Card>
        <Empty title="尚未选择文档">请到「文档管理」点选一份文档。</Empty>
      </Card>
    )
  }
  if ((parsed.loading && !parsed.data) || (seg.loading && !seg.data)) return <Loading />
  if (parsed.error) return <ErrorBox error={parsed.error} />
  if (seg.error) return <ErrorBox error={seg.error} />
  if (!parsed.data) return null

  if (seg.data && !seg.data.ready) {
    return (
      <Card>
        <Empty title="还没有切块产物">{seg.data.reason || '请先跑一次「进行切块」。'}</Empty>
      </Card>
    )
  }

  const st = seg.data?.stats
  const p = parsed.data

  return (
    <>
      {seg.data?.note ? <Notice>{seg.data.note}</Notice> : null}

      {/* 早期这里还有「暂停点 2」的通过/撤销（人工确认切片后才允许建索引）。
          人工闸门机制已整体移除（2026-10-09）—— 切片校对仍可做，但不再拦流程。 */}
      <div className="hint" style={{ marginBottom: 10 }}>
        人工产物与机器产物并存；index 优先读人工产物
      </div>

      {pendingRerun ? (
        <Notice>
          <b>本次已提交人工产物</b> —— 切块及下游已标记「待重跑」，
          到「文档管理」对这份文档点「跑六步」后才会生效。
        </Notice>
      ) : null}

      <SplitPane storageKey="kb.chunkcmp.ratio">
        {/* ── 左：源 PDF（框 = content_list 块；选中切片时只亮它的块）/ HTML 渲染 ─── */}
        <div className="cmp-pane">
          <Card>
            {/* 「PDF.js 连续滚动 / HTML 静态渲染」实现态徽标已移除（2026-10-09 晚，用户点名） */}
            <CardHead title="源文档" meta={p.source_name || p.doc_id} />
            <CardBody flush>
              {p.has_pdf ? (
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
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                    >
                      −
                    </button>
                    <span className="hint" style={{ minWidth: 42, textAlign: 'center' }}>
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                    >
                      +
                    </button>
                    <button type="button" className="btn" onClick={() => setZoom(1)}>
                      适配栏宽
                    </button>
                  </div>

                  <div className="cmp-toolbar">
                    <label className="chk">
                      <input
                        type="checkbox"
                        checked={showAllBoxes}
                        onChange={(e) => setShowAllBoxes(e.target.checked)}
                      />{' '}
                      显示全部区块框
                    </label>
                    <span className="hint" style={{ marginLeft: 'auto' }}>
                      {activeChunk
                        ? `已选中 ${activeChunk.kb_id} · 覆盖 ${activeChunk.block_is.length} 块`
                        : '在右侧点一个切片，或在左侧点一个区块框'}
                    </span>
                  </div>
                </>
              ) : null}

              {p.has_pdf ? (
                <PdfDocument
                  fileUrl={p.source_url}
                  zoom={zoom}
                  onPageCount={setPageCount}
                  onCurrentPageChange={setCurrent}
                  onReady={(a) => {
                    gotoRef.current = a.gotoPage
                  }}
                  onError={(e) => toast(`源 PDF 载入失败：${e.message}`, 8000)}
                  renderOverlay={renderOverlay}
                />
              ) : (
                // 下载页来源：以沙箱 iframe 静态渲染源 HTML（脚本与外链资源全禁，见组件注释）
                <HtmlSourceView url={p.source_url} />
              )}
            </CardBody>
          </Card>
        </div>

        {/* ── 右：切块产物 ─────────────────────────────────────────── */}
        <div className="cmp-pane">
          <Card>
            <CardHead
              title="切块产物"
              meta={
                st ? (
                  <>
                    {st.chunks} 片 · {st.total_chars.toLocaleString()} 字 · 对齐{' '}
                    <b style={{ color: st.aligned === st.chunks ? 'var(--ok)' : 'var(--warn)' }}>
                      {st.aligned}/{st.chunks}
                    </b>{' '}
                    · {Object.entries(st.by_type).map(([k, v]) => `${chunkTypeLabel(k)} ${v}`).join(' / ')}
                  </>
                ) : null
              }
            />
            <CardBody flush>
              {trans.data?.ready || (st && (st.excluded || st.review || st.disabled || st.edited)) ? (
                <div className="cmp-toolbar">
                  {trans.data?.ready ? (
                    <div className="ck-zh-switch" role="group" aria-label="译文显示模式">
                      {([
                        ['orig', '原文'],
                        ['dual', '对照'],
                        ['zh', '译文'],
                      ] as const).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          className={`btn ${zhView === v ? 'btn-primary' : ''}`}
                          onClick={() => setZhView(v)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {trans.data?.ready ? (
                    <span className="hint">
                      译文 {trans.data.stats?.counts?.translated ?? 0}/
                      {trans.data.stats?.counts?.total ?? 0}
                      {trans.data.stats?.counts?.failed
                        ? ` · 失败 ${trans.data.stats.counts.failed}`
                        : ''}
                    </span>
                  ) : null}
                  <span className="hint" style={{ marginLeft: 'auto' }}>
                    {st?.excluded ? `已屏蔽 ${st.excluded} · ` : ''}
                    {st?.review ? `待复核 ${st.review} · ` : ''}
                    {st?.disabled ? `已禁用 ${st.disabled} · ` : ''}
                    {st?.edited ? `已编辑 ${st.edited}` : ''}
                  </span>
                </div>
              ) : null}

              {activeChunk ? (
                <div className="cmp-activebar">
                  <Pill kind="accent">{chunkTypeLabel(activeChunk.chunk_type)}</Pill>
                  <span className="hint">
                    {activeChunk.kb_id} · {activeChunk.chars} 字 ·{' '}
                    {activeChunk.block_is.length
                      ? `对齐 ${activeChunk.block_is.length} 块`
                      : '未对齐（按页码定位）'}
                  </span>
                  <span className="cmp-activetext">{activeChunk.title}</span>
                  <button
                    type="button"
                    className="btn"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => setPinned(null)}
                  >
                    取消选中
                  </button>
                </div>
              ) : null}

              {/* ── 操作面板：本切片可做的动作（原「内容校对」页的功能，移到选中即见）── */}
              {activeChunk ? (
                <div className="ck-ops">
                  <div className="ck-ops-bar">
                    <button
                      type="button"
                      className={`btn ${op === 'mark' ? 'btn-primary' : ''}`}
                      disabled={busy}
                      onClick={() => {
                        setOp(op === 'mark' ? '' : 'mark')
                        setMarkReason(markOf(activeChunk)?.reason || '')
                        setMarkNote(markOf(activeChunk)?.note || '')
                      }}
                    >
                      {markOf(activeChunk) ? '改标记' : '标记问题'}
                    </button>
                    <button
                      type="button"
                      className={`btn ${op === 'edit' ? 'btn-primary' : ''}`}
                      disabled={busy}
                      onClick={() => {
                        setEditText(activeChunk.content)
                        setOp(op === 'edit' ? '' : 'edit')
                      }}
                    >
                      编辑正文
                    </button>
                    {trOf(activeChunk.kb_id)?.zh ? (
                      <button
                        type="button"
                        className={`btn ${op === 'zh' ? 'btn-primary' : ''}`}
                        disabled={busy}
                        title="修正该切片的译文（写入人工覆盖层；不改原文、不触发管线重跑）"
                        onClick={() => {
                          setZhDraft(trOf(activeChunk.kb_id)?.zh || '')
                          setOp(op === 'zh' ? '' : 'zh')
                        }}
                      >
                        修正译文
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`btn ${op === 'split' ? 'btn-primary' : ''}`}
                      disabled={busy}
                      onClick={() => {
                        setSplitText(activeChunk.content)
                        setSplitAt([])
                        setOp(op === 'split' ? '' : 'split')
                      }}
                    >
                      拆分
                    </button>
                    <button
                      type="button"
                      className={`btn ${op === 'danger' ? 'btn-warn' : ''}`}
                      disabled={busy}
                      onClick={() => setOp(op === 'danger' ? '' : 'danger')}
                    >
                      禁用 / 删除
                    </button>
                    {markOf(activeChunk) ? (
                      <Pill kind="warn">已标记：{markOf(activeChunk)!.reason}</Pill>
                    ) : null}
                    {activeChunk.edited ? <Pill kind="accent">已编辑</Pill> : null}
                    {activeChunk.disabled ? <Pill kind="danger">已禁用</Pill> : null}
                  </div>

                  {op === 'mark' ? (
                    <div className="ck-op-form">
                      <div className="hint">
                        标记是<b>标注</b>：不改内容、不影响检索 —— 它只是把问题摊出来，供后续处理。
                        要真正让这块退出检索，标完之后请用「禁用 / 删除」。
                      </div>
                      <div className="toolbar" style={{ margin: '8px 0 0' }}>
                        {(seg.data?.mark_reasons || []).map((r) => (
                          <button
                            key={r}
                            type="button"
                            className={`btn ${markReason === r ? 'btn-primary' : ''}`}
                            onClick={() => setMarkReason(r)}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <div className="toolbar" style={{ margin: '8px 0 0' }}>
                        <input
                          className="inp"
                          style={{ flex: 1, minWidth: 180 }}
                          placeholder="补充说明（可选）"
                          value={markNote}
                          onChange={(e) => setMarkNote(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy || !markReason}
                          onClick={doMark}
                        >
                          提交标记
                        </button>
                        {markOf(activeChunk) ? (
                          <button type="button" className="btn" disabled={busy} onClick={doUnmark}>
                            取消标记
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {op === 'edit' ? (
                    <div className="ck-op-form">
                      <div className="hint">
                        改后正文落<b>人工产物</b>（不覆盖机器产物，index 优先读人工产物）。
                      </div>
                      <textarea
                        className="inp ck-op-text"
                        rows={8}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                      />
                      <div className="toolbar" style={{ margin: 0 }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy || !editText.trim()}
                          onClick={() =>
                            afterStructural('编辑', () =>
                              api.chunkEdit(doc, activeChunk.kb_id, editText),
                            )
                          }
                        >
                          保存正文
                        </button>
                        <span className="hint">
                          原 {activeChunk.chars} 字 → 改后 {editText.length} 字
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {op === 'zh' && trOf(activeChunk.kb_id)?.zh ? (
                    <div className="ck-op-form">
                      <div className="hint">
                        修正只落地到<b>译文覆盖层</b>（不覆盖机翻产物、不触发管线重跑）；
                        「恢复机翻」可回到 AI 翻译。当前：
                        {trOf(activeChunk.kb_id)?.stale
                          ? '译文过期（正文已更新，建议重校）'
                          : trOf(activeChunk.kb_id)?.quality === 'reviewed'
                            ? '人工修正'
                            : 'AI 翻译'}
                      </div>
                      <textarea
                        className="inp ck-op-text"
                        rows={8}
                        value={zhDraft}
                        onChange={(e) => setZhDraft(e.target.value)}
                      />
                      <div className="toolbar" style={{ margin: 0 }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy || !zhDraft.trim()}
                          onClick={doSaveZh}
                        >
                          保存译文
                        </button>
                        <button type="button" className="btn" disabled={busy} onClick={doResetZh}>
                          恢复机翻
                        </button>
                        <span className="hint">
                          {(trOf(activeChunk.kb_id)?.zh || '').length} 字 → 改后 {zhDraft.length} 字
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {op === 'split' ? (
                    <div className="ck-op-form">
                      <div className="hint">
                        把光标放到要切开的位置再点按钮 —— 比手填字符偏移直观得多。
                        {splitAt.length ? (
                          <>
                            {' '}
                            已选 <b>{splitAt.length}</b> 刀：{splitAt.join(', ')}
                          </>
                        ) : null}
                      </div>
                      <textarea
                        ref={splitRef}
                        className="inp ck-op-text"
                        rows={8}
                        value={splitText}
                        onChange={(e) => setSplitText(e.target.value)}
                      />
                      <div className="toolbar" style={{ margin: 0 }}>
                        <button
                          type="button"
                          className="btn"
                          disabled={busy}
                          onClick={() => {
                            const pos = splitRef.current?.selectionStart ?? 0
                            if (!pos || pos >= splitText.length) {
                              toast('请先把光标放到要切开的位置（末尾不算）', 6000)
                              return
                            }
                            setSplitAt((a) => (a.includes(pos) ? a : [...a, pos].sort((x, y) => x - y)))
                          }}
                        >
                          在光标处加拆分点
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={!splitAt.length}
                          onClick={() => setSplitAt([])}
                        >
                          清空拆分点
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy || !splitAt.length}
                          onClick={() =>
                            afterStructural('拆分', () =>
                              api.chunkSplit(doc, activeChunk.kb_id, splitAt.map(String)),
                            )
                          }
                        >
                          执行拆分（{splitAt.length} 刀 → {splitAt.length + 1} 块）
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {op === 'danger' ? (
                    <div className="ck-op-form">
                      <div className="hint">
                        ⚠️ <b>禁用</b>＝保留切片但不参与检索；<b>删除</b>＝从切块产物里移除。
                        两者都会让下游「待重跑」，且**界面没有撤销入口**（要恢复得重跑切块，
                        再依赖「历史编辑找回」按相似度匹配）。按钮上已写「确认」，点一下即执行。
                      </div>
                      <div className="toolbar" style={{ margin: 0 }}>
                        <button
                          type="button"
                          className="btn btn-warn"
                          disabled={busy}
                          onClick={() =>
                            afterStructural('禁用', () => api.chunkDisable(doc, activeChunk.kb_id))
                          }
                        >
                          确认禁用 {activeChunk.kb_id}
                        </button>
                        <button
                          type="button"
                          className="btn btn-warn"
                          disabled={busy}
                          onClick={() =>
                            afterStructural('删除', () => api.chunkDelete(doc, activeChunk.kb_id))
                          }
                        >
                          确认删除 {activeChunk.kb_id}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Notice tone="accent">
                  右侧是<b>切块产物</b>：点一个切片，左侧原文里属于它的区块会亮起、其余压暗；
                  反过来点左侧的框，右栏会滚到对应的切片。选中后会出现**该切片的操作面板**
                  （标记问题 / 编辑 / 拆分 / 禁用 / 删除）。标题前的内容（摘要区）不成切片，所以那些块点了会提示。
                </Notice>
              )}

              <div className="mdraw-body">
                {chunks.length ? (
                  chunks.map((c, idx) => {
                    const isActive = activeKey === c.kb_id
                    const prevPath = idx > 0 ? chunks[idx - 1].header_path : null
                    const newGroup = c.header_path !== prevPath
                    const t = trOf(c.kb_id)
                    const zh = t?.zh || ''
                    const showZh = !!zh && zhView !== 'orig'
                    const showOrig = !(zhView === 'zh' && zh)
                    return (
                      <div key={c.kb_id}>
                        {newGroup ? (
                          <div className="ck-group" title={c.header_path}>
                            {c.header_path || '（无标题路径）'}
                          </div>
                        ) : null}
                        <div
                          ref={(el) => {
                            if (el) itemRefs.current.set(c.kb_id, el)
                            else itemRefs.current.delete(c.kb_id)
                          }}
                          className={`ck-item ${isActive ? 'active' : ''}`}
                          onMouseEnter={() => setHover(c.kb_id)}
                          onMouseLeave={() => setHover((a) => (a === c.kb_id ? null : a))}
                          onClick={() => selectChunk(c.kb_id, 'list')}
                        >
                          <div className="ck-head">
                            {/* 标题单行截断是设计（避免卡片高度膨胀），补 title 兜底让完整标题可悬停查看 */}
                            <b title={c.title || undefined}>{c.title || '（无标题）'}</b>
                            <Pill kind={c.chunk_type === 'table' ? 'warn' : 'plain'}>
                              {chunkTypeLabel(c.chunk_type)}
                            </Pill>
                            {c.excluded ? <Pill kind="danger">已屏蔽</Pill> : null}
                            {c.disabled ? <Pill kind="danger">已禁用</Pill> : null}
                            {c.review ? <Pill kind="warn">待复核</Pill> : null}
                            {c.edited ? <Pill kind="accent">已编辑</Pill> : null}
                            {markOf(c) ? <Pill kind="warn">标记·{markOf(c)!.reason}</Pill> : null}
                          </div>
                          <div className="ck-meta">
                            <span>{c.kb_id}</span>
                            <span>{c.chars} 字</span>
                            <span>{c.page_idx != null ? `p.${c.page_idx + 1}` : '页码未知'}</span>
                            <span style={{ color: c.block_is.length ? 'var(--ok)' : 'var(--warn)' }}>
                              {c.block_is.length ? `对齐 ${c.block_is.length} 块` : '未对齐'}
                            </span>
                            {c.risk_level && c.risk_level !== 'low' ? (
                              <span>风险 {c.risk_level}</span>
                            ) : null}
                          </div>
                          {/* 富渲染（表格→真表格、图片→真图）。⚠️ 「编辑正文」用的是**原始**
                              `c.content` —— 绝不能把改写后的图片 URL 写回产物。 */}
                          {showOrig ? (
                            <div
                              className="ck-body md-chunk-body"
                              dangerouslySetInnerHTML={{ __html: bodyHtml.get(c.kb_id) || '' }}
                            />
                          ) : null}
                          {/* 译文区块（TECH-019）：默认「对照」模式在原文下方堆叠展示 */}
                          {showZh ? (
                            <div className="ck-zh">
                              <div className="ck-zh-tagrow">
                                <span
                                  className={`ck-zh-tag ${t?.quality === 'reviewed' ? 'reviewed' : ''} ${
                                    t?.stale ? 'stale' : ''
                                  }`}
                                >
                                  {t?.stale
                                    ? '译文过期'
                                    : t?.quality === 'reviewed'
                                      ? '人工修正'
                                      : 'AI 翻译'}
                                </span>
                                {t?.glossary_hit?.length ? (
                                  <span className="ck-zh-gloss">
                                    术语 {t.glossary_hit.slice(0, 4).join(' · ')}
                                  </span>
                                ) : null}
                              </div>
                              <div
                                className="ck-body md-chunk-body ck-zh-body"
                                dangerouslySetInnerHTML={{ __html: zhHtml.get(c.kb_id) || '' }}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <Empty title="没有切片">这份文档的切块产物是空的。</Empty>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      </SplitPane>
    </>
  )
}
