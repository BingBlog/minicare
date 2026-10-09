import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { DiffPart, NormalizeDiffGet, NormalizeDiffLine, ParsedBlock, ParsedDoc } from '../lib/types'
import { renderRich } from '../lib/md-render'
import { Card, CardBody, CardHead, Empty, ErrorBox, Loading, NoDoc } from '../components/ui'
import { PdfDocument } from '../components/PdfDocument'
import { SplitPane } from '../components/SplitPane'

/** 源文档叠层配色：红 = 被删字符的精确位置；灰虚线 = 有改动但无法逐字标注的块 */
const HIT_DEL = '#A82E2E'
const HIT_FB = '#98928C'

/** 行文里带 `<table>` 原文（MinerU 的表格以整段 HTML 内联在 md 里）→ 走富渲染，不裸奔源码 */
const isTableText = (s: string) => /<table[\s>]/i.test(s)

function boxStyle(bbox: number[] | undefined | null, space: number): CSSProperties | null {
  if (!bbox || bbox.length !== 4) return null
  const [x1, y1, x2, y2] = bbox
  const k = 100 / (space || 1000)
  return {
    left: `${x1 * k}%`,
    top: `${y1 * k}%`,
    width: `${Math.max(0, x2 - x1) * k}%`,
    height: `${Math.max(0, y2 - y1) * k}%`,
  }
}

/**
 * 清洗对比（工作台页签 ③）—— 原始解析正文 ↔ 清洗后正文的逐行对照。
 *
 * 数据推导走后端 `line_map`（行号链，与切片精确对齐同一套口径），**不是**文本 diff。
 *
 * ## 阅读层（2026-10-09 两轮迭代定型）
 * 1. **行内差段**：被清洗掉的字在原文里标红（划掉）、清洗新增的标蓝；
 * 2. **源文档定位**：左栏 = 源 PDF —— `del_boxes` 是**被删字符的精确小框**（文字层词级定位，
 *    不是整块！），落不到的地方退化为该块的灰虚线框；行 ↔ 框双向联动；
 * 3. **表格富渲染**：行文里内联的 `<table>`（MinerU 表格）按表格渲染（排版复用
 *    「解析结果对照」的 `.md-chunk-body` 规则）；改动行给「查看源码对照」开关回看原始差异；
 * 4. **字级双口径**：统计栏「行级 + 字级」（上标 / 公式 / 空白 分类计数）。
 *
 * 拿不到块映射（HTML 来源 / 旧产物）时**自动退回单栏**；表格富渲染与统计不受影响。
 */
export function NormalizeDiffView() {
  const { doc, go, nonce, toast } = useApp()
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [current, setCurrent] = useState(0)
  const [pageCount, setPageCount] = useState(0)
  /** hover（临时高亮）与 pinned（点击后钉住）分开：hover 只亮框，不抢滚动 */
  const [hoverSrc, setHoverSrc] = useState<number | null>(null)
  const [pinnedSrc, setPinnedSrc] = useState<number | null>(null)

  const gotoRef = useRef<((i: number) => void) | null>(null)
  const rowRefs = useRef(new Map<number, HTMLDivElement>())
  const listRef = useRef<HTMLDivElement | null>(null)

  const { data, error, loading } = useAsync<NormalizeDiffGet | null>(
    () => (doc ? api.normalizeDiff(doc) : Promise.resolve(null)),
    [doc, nonce],
  )
  /** 源文档数据（块/页面）；失败静默降级为单栏，不打扰主功能 */
  const parsed = useAsync<ParsedDoc | null>(
    () => (doc ? api.parsed(doc).catch(() => null) : Promise.resolve(null)),
    [doc, nonce],
  )

  useEffect(() => {
    setHoverSrc(null)
    setPinnedSrc(null)
    setZoom(1)
    setCurrent(0)
  }, [doc])

  const lines = data?.lines ?? []
  const st = data?.stats
  const rows = onlyChanged ? lines.filter((l) => l.type !== 'keep') : lines

  const blocksById = useMemo(() => {
    const m = new Map<number, ParsedBlock>()
    for (const b of parsed.data?.blocks ?? []) m.set(b.i, b)
    return m
  }, [parsed.data])

  /* ── 行 ↔ 块 / 精确框的派生数据（源文档定位的底座）───────────────── */
  const blockOfRow = useMemo(() => {
    const m = new Map<number, number>()
    for (const l of lines) {
      if ((l.type === 'changed' || l.type === 'removed') && typeof l.block_i === 'number') {
        m.set(l.src, l.block_i)
      }
    }
    return m
  }, [lines])

  /** 块 → 受影响的原始行号（升序）；键集合即"被清洗波及的块" */
  const rowsOfBlock = useMemo(() => {
    const m = new Map<number, number[]>()
    for (const [src, bi] of blockOfRow) {
      const arr = m.get(bi)
      if (arr) arr.push(src)
      else m.set(bi, [src])
    }
    for (const arr of m.values()) arr.sort((a, b) => a - b)
    return m
  }, [blockOfRow])

  /** 精确小框：按页聚合（行 → 被删字符的印刷位置）；同一行内的重复矩形去重 */
  const boxesByPage = useMemo(() => {
    const m = new Map<number, Array<{ src: number; bbox: number[]; text: string }>>()
    for (const l of lines) {
      if ((l.type !== 'changed' && l.type !== 'removed') || !l.del_boxes?.length) continue
      const seen = new Set<string>()
      for (const b of l.del_boxes) {
        const k = `${b.page_idx}:${b.bbox.map((v) => Math.round(v)).join(',')}`
        if (seen.has(k)) continue
        seen.add(k)
        const item = { src: l.src, bbox: b.bbox, text: b.text }
        const arr = m.get(b.page_idx)
        if (arr) arr.push(item)
        else m.set(b.page_idx, [item])
      }
    }
    return m
  }, [lines])

  /** 已经落了精确框的块 */
  const boxedBlocks = useMemo(() => {
    const s = new Set<number>()
    for (const l of lines) {
      if (
        (l.type === 'changed' || l.type === 'removed') &&
        l.del_boxes?.length &&
        typeof l.block_i === 'number'
      ) {
        s.add(l.block_i)
      }
    }
    return s
  }, [lines])

  /** 回退虚线框：有改动、但一个精确框都没落上的块（仅新增 / 定位未命中）→ 按页聚合 */
  const fallbackByPage = useMemo(() => {
    const m = new Map<number, ParsedBlock[]>()
    for (const bi of rowsOfBlock.keys()) {
      if (boxedBlocks.has(bi)) continue
      const b = blocksById.get(bi)
      if (!b || b.page_idx == null) continue
      const arr = m.get(b.page_idx)
      if (arr) arr.push(b)
      else m.set(b.page_idx, [b])
    }
    return m
  }, [rowsOfBlock, boxedBlocks, blocksById])

  /** 涉及页（精确框 ∪ 回退框） */
  const hitPages = useMemo(() => {
    const s = new Set<number>()
    for (const k of boxesByPage.keys()) s.add(k)
    for (const k of fallbackByPage.keys()) s.add(k)
    return s
  }, [boxesByPage, fallbackByPage])

  /** 精确框总数（卡片头展示） */
  const boxCount = useMemo(() => {
    let n = 0
    for (const arr of boxesByPage.values()) n += arr.length
    return n
  }, [boxesByPage])

  const canLink = !!parsed.data?.has_pdf && rowsOfBlock.size > 0 && blocksById.size > 0

  const activeSrc = hoverSrc ?? pinnedSrc
  const activeBlock = activeSrc != null ? blockOfRow.get(activeSrc) : undefined
  const activeRowSet = activeBlock != null ? new Set(rowsOfBlock.get(activeBlock) ?? []) : null

  /** 选中一行：`from=list` 时把左侧 PDF 翻到对应块所在页；`from=pdf` 时右侧滚到该行 */
  const selectRow = useCallback(
    (src: number, from: 'list' | 'pdf') => {
      setPinnedSrc((p) => (p === src && from === 'list' ? null : src))
      const bi = blockOfRow.get(src)
      if (bi == null) return
      if (from === 'pdf') {
        // 只滚**列表面板自身**（用容器内坐标算），不调用 scrollIntoView ——
        // 后者会连带把整页窗口也滚走，左侧 PDF 的位置跟着跳，很晃。
        const el = rowRefs.current.get(src)
        const box = listRef.current
        if (el && box) {
          const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
          box.scrollTo({ top: Math.max(0, top - box.clientHeight / 2), behavior: 'smooth' })
        } else {
          el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
        }
      } else {
        const b = blocksById.get(bi)
        if (b?.page_idx != null && b.page_idx !== current) gotoRef.current?.(b.page_idx)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blockOfRow, blocksById, current],
  )

  /** 左栏每页的叠层：① 被删字符的精确红框 ② 无法逐字标注块的回退虚线框 */
  const renderOverlay = useCallback(
    (pageIdx: number) => {
      const out: ReactNode[] = []
      for (const it of boxesByPage.get(pageIdx) ?? []) {
        const st2 = boxStyle(it.bbox, parsed.data?.bbox_space ?? 1000)
        if (!st2) continue
        const isActive = activeRowSet?.has(it.src) ?? false
        out.push(
          <div
            key={`d${it.src}-${Math.round(it.bbox[0])}-${Math.round(it.bbox[1])}`}
            className={`pdfbox nd-hitbox ${isActive ? 'active' : ''}`}
            style={{
              ...st2,
              borderColor: HIT_DEL,
              background: `${HIT_DEL}${isActive ? '55' : '22'}`,
            }}
            title={`被清洗：${it.text} · 第 ${it.src} 行（点击回到右侧行）`}
            onMouseEnter={() => setHoverSrc(it.src)}
            onMouseLeave={() => setHoverSrc((a) => (a === it.src ? null : a))}
            onClick={() => selectRow(it.src, 'pdf')}
          />,
        )
      }
      for (const b of fallbackByPage.get(pageIdx) ?? []) {
        const st2 = boxStyle(b.bbox, parsed.data?.bbox_space ?? 1000)
        if (!st2) continue
        const srcs = rowsOfBlock.get(b.i) ?? []
        const first = srcs[0]
        const isActive = activeRowSet != null && srcs.some((s) => activeRowSet.has(s))
        out.push(
          <div
            key={`f${b.i}`}
            className={`pdfbox nd-fallback ${isActive ? 'active' : ''}`}
            style={{ ...st2, borderColor: HIT_FB, background: 'rgba(152, 146, 140, 0.08)' }}
            title={`该块有清洗改动、未能逐字标注（第 ${srcs.join('、')} 行）；点击回到右侧行`}
            onMouseEnter={() => first != null && setHoverSrc(first)}
            onMouseLeave={() => setHoverSrc((a) => (a === first ? null : a))}
            onClick={() => first != null && selectRow(first, 'pdf')}
          />,
        )
      }
      return out
    },
    [boxesByPage, fallbackByPage, activeRowSet, rowsOfBlock, parsed.data?.bbox_space, selectRow],
  )

  if (!doc) return <NoDoc />
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  if (!data.ready) {
    return (
      <Card>
        <Empty title="还不能做清洗对比">
          {data.reason || '未知原因'}
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => go('detail')}>
              去处理详情
            </button>
          </div>
        </Empty>
      </Card>
    )
  }

  const delta = (data.raw_chars || 0) - (data.md_chars || 0)
  const imgBase = parsed.data?.img_url_base || ''
  const pageBoxCount =
    (boxesByPage.get(current)?.length ?? 0) + (fallbackByPage.get(current)?.length ?? 0)

  /** 右侧：逐行对照（单栏/双栏共用的同一份内容） */
  const diffCard = (
    <Card>
      <CardHead
        title={`${data.doc_id} · 清洗对比`}
        meta={`原始 ${fmt(data.raw_chars)} 字 → 清洗后 ${fmt(data.md_chars)} 字（${delta >= 0 ? '-' : '+'}${fmt(Math.abs(delta))}）`}
      />
      <CardBody>
        <div className="nd-bar">
          <span className="hint">
            行号 = <b>原始 md 行号</b>；<b className="nd-k-del">红 = 被清洗掉的字符</b>（行内标出）、
            <b className="nd-k-ins">蓝 = 清洗新增</b>、<b className="nd-k-rm">灰行 = 整行被清洗</b>
            （页眉页脚 / 页码行等）。
            {canLink ? ' 点改动行 → 左侧源文档定位（再点取消）。' : ''}
          </span>
          {st ? <span className="hint">{statsText(st)}</span> : null}
          <label className="nd-check">
            <input
              type="checkbox"
              checked={onlyChanged}
              onChange={(e) => setOnlyChanged(e.target.checked)}
            />
            仅看变化
          </label>
        </div>
      </CardBody>
      <CardBody flush>
        {rows.length === 0 ? (
          <div className="hint" style={{ padding: '14px 16px' }}>
            {onlyChanged ? '这份文档没有变化行 —— 清洗未改动任何内容。' : '没有可展示的行。'}
          </div>
        ) : (
          <div className="nd-list" ref={listRef}>
            {rows.map((l, i) => {
              const src = 'src' in l ? l.src : null
              const linkable = canLink && src != null && blockOfRow.has(src)
              const active = linkable && src != null && (activeRowSet?.has(src) ?? false)
              return (
                <DiffRow
                  key={src != null ? `l${src}` : `b${i}`}
                  line={l}
                  imgBase={imgBase}
                  linkable={linkable}
                  active={active}
                  onEnter={linkable ? () => setHoverSrc(src) : undefined}
                  onLeave={linkable ? () => setHoverSrc((a) => (a === src ? null : a)) : undefined}
                  onClick={linkable ? () => selectRow(src as number, 'list') : undefined}
                  registerRef={
                    src != null
                      ? (el) => {
                          if (el) rowRefs.current.set(src, el)
                          else rowRefs.current.delete(src)
                        }
                      : undefined
                  }
                />
              )
            })}
          </div>
        )}
      </CardBody>
    </Card>
  )

  if (!canLink) return diffCard

  return (
    <SplitPane storageKey="kb.nd.ratio">
      {/* ── 左：源文档（被删字符的精确位置）──────────────────────────── */}
      <div className="cmp-pane">
        <Card>
          {/* 「PDF.js 连续滚动」实现态徽标已移除（2026-10-09 晚，用户点名）；保留统计 */}
          <CardHead
            title="源文档"
            meta={`被清洗 ${rowsOfBlock.size} 块 / ${hitPages.size} 页 · 精确定位 ${boxCount} 处`}
          />
          <CardBody flush>
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
              <a className="btn" href={parsed.data?.source_url} target="_blank" rel="noreferrer">
                新标签打开
              </a>
              <span className="hint" style={{ marginLeft: 'auto' }}>
                本页 {pageBoxCount} 框
              </span>
            </div>
            <div className="cmp-toolbar">
              <span className="hint">
                红框 = <b style={{ color: HIT_DEL }}>被删掉的字</b>在原文中的位置（点击回右侧行）；
                <b style={{ color: HIT_FB }}>灰虚线</b> = 无法逐字标注的块。
              </span>
            </div>
            <PdfDocument
              fileUrl={parsed.data?.source_url ?? ''}
              zoom={zoom}
              onPageCount={setPageCount}
              onCurrentPageChange={setCurrent}
              onReady={(api2) => {
                gotoRef.current = api2.gotoPage
              }}
              onError={(e) => toast(`源 PDF 载入失败：${e.message}`, 8000)}
              renderOverlay={renderOverlay}
            />
          </CardBody>
        </Card>
      </div>

      {/* ── 右：逐行对照 ───────────────────────────────────────────── */}
      <div className="cmp-pane">{diffCard}</div>
    </SplitPane>
  )
}

/** 「行级 + 字级」双口径文案；字级只列非零分类（旧产物无字级字段时自动跳过） */
function statsText(st: NonNullable<NormalizeDiffGet['stats']>): string {
  const line = `行级：修改 ${st.changed}（标题 ${st.headings}）· 删除 ${st.removed} · 空行压缩 ${st.blank_compressed} · 保留 ${st.keep}`
  const dc = st.del_chars ?? 0
  const ic = st.ins_chars ?? 0
  if (!dc && !ic) return line
  const named = (pairs: Array<[number, string]>) =>
    pairs
      .filter(([n]) => n > 0)
      .map(([n, label]) => `${label} ${n} 处`)
      .join(' · ')
  const delKinds = named([
    [st.del_sup ?? 0, '上标'],
    [st.del_formula ?? 0, '公式'],
    [st.del_space ?? 0, '空白'],
    [st.del_other ?? 0, '其他'],
  ])
  const insKinds = named([
    [st.ins_alt ?? 0, '图注'],
    [st.ins_heading ?? 0, '标题层级'],
    [st.ins_other ?? 0, '其他'],
  ])
  const delPart = `被清洗 ${fmt(dc)} 字${delKinds ? `（${delKinds}）` : ''}`
  const insPart = ic ? ` · 新增 ${fmt(ic)} 字${insKinds ? `（${insKinds}）` : ''}` : ''
  return `${line} ｜ 字级：${delPart}${insPart}`
}

/** 行内差段渲染：`m=1` 的段按侧别着色（before=红删 / after=蓝增）；旧数据缺差段时整体降级 */
function Segs({ parts, fallback, kind }: { parts?: DiffPart[]; fallback: string; kind: 'del' | 'ins' }) {
  if (!parts || parts.length === 0) {
    return kind === 'del' ? <span className="nd-del">{fallback}</span> : <>{fallback}</>
  }
  return (
    <>
      {parts.map((p, i) =>
        p.m === 1 ? (
          <span key={i} className={kind === 'del' ? 'nd-del' : 'nd-ins'}>
            {p.t}
          </span>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </>
  )
}

/** 差段 → 小徽条（表格行摘要用；最多 5 个，余量折叠成计数） */
function Chips({ parts, kind }: { parts: DiffPart[]; kind: 'del' | 'ins' }) {
  const shown = parts.slice(0, 5)
  return (
    <>
      {shown.map((p, i) => {
        const t = p.t.trim()
        return (
          <span key={i} className={kind === 'del' ? 'nd-chip nd-chip-del' : 'nd-chip nd-chip-ins'}>
            {t.length > 24 ? `${t.slice(0, 24)}…` : t}
          </span>
        )
      })}
      {parts.length > shown.length ? (
        <span className="nd-chip-more">…另 {parts.length - shown.length} 处</span>
      ) : null}
    </>
  )
}

function DiffRow({
  line,
  imgBase,
  linkable = false,
  active = false,
  onEnter,
  onLeave,
  onClick,
  registerRef,
}: {
  line: NormalizeDiffLine
  imgBase: string
  linkable?: boolean
  active?: boolean
  onEnter?: () => void
  onLeave?: () => void
  onClick?: () => void
  registerRef?: (el: HTMLDivElement | null) => void
}) {
  /** 表格改动行的「源码对照」开关（默认关：看渲染结果；开：看带红/蓝标记的原始差异） */
  const [rawMode, setRawMode] = useState(false)

  const extra = `${linkable ? ' nd-clickable' : ''}${active ? ' nd-active' : ''}`
  const attrs = {
    ref: registerRef,
    onMouseEnter: onEnter,
    onMouseLeave: onLeave,
    onClick,
    title: linkable ? '点击在左侧源文档中定位' : undefined,
  }

  if (line.type === 'blank') {
    return (
      <div className="nd-row nd-blank">
        <span className="nd-ln" />
        <span className="nd-mark" />
        <span className="nd-blank-text">⋯ 此处压缩 {line.count} 个空行 ⋯</span>
      </div>
    )
  }
  if (line.type === 'removed') {
    return (
      <div className={`nd-row nd-removed${extra}`} {...attrs}>
        <span className="nd-ln">{line.src}</span>
        <span className="nd-mark">−</span>
        <span className="nd-text">{line.text}</span>
      </div>
    )
  }

  if (line.type === 'changed') {
    const rawBefore = (
      <div className="nd-before">
        <span className="nd-mark">−</span>
        <span className="nd-text">
          <Segs parts={line.before_parts} fallback={line.before} kind="del" />
        </span>
        <span className="nd-tag">{line.kind}</span>
      </div>
    )
    const rawAfter = (
      <div className="nd-after">
        <span className="nd-mark">+</span>
        <span className="nd-text">
          <Segs parts={line.after_parts} fallback={line.after} kind="ins" />
        </span>
      </div>
    )

    const tableRow = isTableText(line.before) || isTableText(line.after)
    if (tableRow && !rawMode) {
      const delAll = (line.before_parts ?? []).filter((p) => p.m === 1)
      const dels = delAll.filter((p) => p.t.trim())
      const inss = (line.after_parts ?? []).filter((p) => p.m === 1 && p.t.trim())
      return (
        <div className={`nd-row nd-changed nd-richrow${extra}`} {...attrs}>
          <span className="nd-ln">{line.src}</span>
          <div className="nd-pair">
            <div className="nd-before nd-tablesum">
              <span className="nd-mark">−</span>
              <span className="nd-text">
                表格源码
                {dels.length ? (
                  <>
                    {' '}
                    · 被清洗 {dels.length} 处：<Chips parts={dels} kind="del" />
                  </>
                ) : delAll.length ? (
                  ' · 仅空白 / 格式变化'
                ) : (
                  '（无删除）'
                )}
                {inss.length ? (
                  <>
                    {' '}
                    · 新增 {inss.length} 处：<Chips parts={inss} kind="ins" />
                  </>
                ) : null}
              </span>
              <span className="nd-tag">{line.kind}</span>
            </div>
            <div className="nd-after nd-richwrap">
              <span className="nd-mark">+</span>
              <div
                className="nd-rich md-chunk-body"
                dangerouslySetInnerHTML={{ __html: renderRich(line.after, imgBase) }}
              />
            </div>
            <button
              type="button"
              className="nd-srcbtn"
              onClick={(e) => {
                e.stopPropagation()
                setRawMode((v) => !v)
              }}
            >
              查看源码对照
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className={`nd-row nd-changed${tableRow ? ' nd-richrow' : ''}${extra}`} {...attrs}>
        <span className="nd-ln">{line.src}</span>
        <div className="nd-pair">
          {rawBefore}
          {rawAfter}
          {tableRow ? (
            <button
              type="button"
              className="nd-srcbtn"
              onClick={(e) => {
                e.stopPropagation()
                setRawMode((v) => !v)
              }}
            >
              收起源码，看渲染
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  // keep：表格按表格渲染（其余行保持原始文本）
  if (isTableText(line.text)) {
    return (
      <div className={`nd-row nd-richrow${extra}`} {...attrs}>
        <span className="nd-ln">{line.src}</span>
        <span className="nd-mark" />
        <div
          className="nd-rich md-chunk-body"
          dangerouslySetInnerHTML={{ __html: renderRich(line.text, imgBase) }}
        />
      </div>
    )
  }
  return (
    <div className={`nd-row${extra}`} {...attrs}>
      <span className="nd-ln">{line.src}</span>
      <span className="nd-mark" />
      <span className="nd-text">{line.text}</span>
    </div>
  )
}

/** 千分位（大文档字数读起来更直观）；缺失值显示 — */
function fmt(n: number | undefined): string {
  if (n == null) return '—'
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
