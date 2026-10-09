import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { chunkTypeLabel } from '../lib/labels'
import { RISK_LABEL } from '../lib/quality'
import type { QualitySearchItem, QualitySearchResponse } from '../lib/types'
import { Card, CardBody, CardHead, Empty, Pill, Table } from '../components/ui'

/**
 * 页面：检索测试（US-11 配套工具，2026-10-09 从「检索质检」页抽出独立成页）。
 *
 * 定位 = **仅做即席测试交互**（用户 2026-10-09 确认的页面边界）；批量评测一律归「检索质检」台（PRD-011），
 * 不进入本页。页面按行业「召回测试/命中测试」的五件套组织（Dify / FastGPT / RAGFlow / Coze，调研见 TECH-023）：
 *   ① 问题输入（多行框，Enter 检索 / Shift+Enter 换行）
 *   ② 参数区（模式 / 关键词权重 / 条数 / 风险 / 类别）——模式与权重为**实验参数**，
 *      非默认时页面显式标注「与线上口径不同」；默认态与质检/智能体同口径
 *   ③ 召回明细（综合得分 + 全文/向量各路分 + 标题/内容/区块/来源，**默认完整内容**）
 *   ④ 最近查询（localStorage，含参数，点击复跑）
 *   ⑤ 测试-配置分离（本页零配置写入；链路参数以生效配置为准）
 *   ⑥ 进入上下文（`?q=<题面>&case=<题号>`）：从「用例集」行内「检索测试」按钮跳入时，
 *      题面预填并自动跑一次（单题排查的直达入口）；只读回显，不写回 URL。
 *
 * 融合口径：综合得分 = 全文系数 × 1/(60+全文名次) + 向量系数 × 1/(60+向量名次)（RRF，k=60）。
 * 系数默认 1.0/1.0（= 线上等权口径）；关键词权重滑杆按「2w / 2(1-w)」连续映射，均衡 0.5 时不产生偏差。
 */

/* ── 最近查询（本机 localStorage；对标 Dify 召回测试的「最近查询」）────────── */

const HISTORY_KEY = 'kb.retrieval-test.history.v1'
const HISTORY_MAX = 12

interface HistoryItem {
  query: string
  k: number
  risk: string
  category: string
  /** 实验参数：检索模式（hybrid/fts/vector）；旧记录缺省 hybrid */
  mode: string
  /** 实验参数：关键词权重（0~1）；旧记录缺省 0.5 */
  weight: number
  /** HH:MM（本地时间） */
  at: string
  count: number
}

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as Partial<HistoryItem>[]
    return Array.isArray(arr)
      ? arr
          .filter((x) => x && typeof x.query === 'string')
          .map((x) => ({
            query: x.query as string,
            k: typeof x.k === 'number' ? x.k : 10,
            risk: typeof x.risk === 'string' ? x.risk : '',
            category: typeof x.category === 'string' ? x.category : '',
            mode: typeof x.mode === 'string' ? x.mode : 'hybrid',
            weight: typeof x.weight === 'number' ? x.weight : 0.5,
            at: typeof x.at === 'string' ? x.at : '',
            count: typeof x.count === 'number' ? x.count : 0,
          }))
          .slice(0, HISTORY_MAX)
      : []
  } catch {
    return []
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)))
  } catch {
    /* 存储不可用时静默（不影响检索本身） */
  }
}

/** 文本截断（历史 chip 展示用） */
function excerpt(s: string, n: number) {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/** 示例问题：首屏空态引导（覆盖语料里的高频主题） */
const EXAMPLES = ['深度水解配方怎么选', '宝宝便血和牛奶蛋白过敏', '辅食什么时候开始添加', '怎么从深度水解转普通奶粉']

/* ── 融合口径的展示辅助 ─────────────────────────────────────────────── */

function fusionOf(r: QualitySearchResponse) {
  return (
    r.fusion ?? { mode: 'hybrid', keyword_weight: null as number | null, coeff_fts: 1, coeff_vec: 1 }
  )
}

function fmtCoeff(n: number) {
  return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(2)
}

/** 综合得分计算公式（按本次实际口径生成） */
function formulaText(f: { mode: string; coeff_fts: number; coeff_vec: number }) {
  if (f.mode === 'fts') return '综合得分 = 1 × 1/(60 + 全文名次)'
  if (f.mode === 'vector') return '综合得分 = 1 × 1/(60 + 向量名次)'
  return `综合得分 = ${fmtCoeff(f.coeff_fts)} × 1/(60 + 全文名次) + ${fmtCoeff(f.coeff_vec)} × 1/(60 + 向量名次)`
}

/** 链路状态（当前模式 + 向量路是否参与） */
function RouteStatus({ r }: { r: QualitySearchResponse }) {
  const m = r.fusion?.mode ?? 'hybrid'
  if (m === 'fts') return <span className="hint">仅全文路（实验参数）</span>
  if (m === 'vector') {
    return r.vector_used ? (
      <span className="hint">仅向量路（实验参数）</span>
    ) : (
      <span style={{ color: 'var(--warn)' }}>
        向量路不可用{r.vector_degraded ? `（${r.vector_degraded}）` : ''}
      </span>
    )
  }
  return r.vector_used ? (
    <span style={{ color: 'var(--ok)' }}>向量路已参与</span>
  ) : (
    <span style={{ color: 'var(--warn)' }}>
      向量路未参与，本次仅全文{r.vector_degraded ? `（${r.vector_degraded}）` : ''}
    </span>
  )
}

/* ── 结果区（子组件：在 JSX 里稳定拿到融合口径常量）────────────────── */

function ResultsBody({ r, onCopy }: { r: QualitySearchResponse; onCopy: (x: QualitySearchItem) => void }) {
  const f = fusionOf(r)
  const balanced = f.mode === 'hybrid' && Math.abs((f.keyword_weight ?? 0.5) - 0.5) < 1e-9
  const wPct = Math.round((f.keyword_weight ?? 0.5) * 100)
  return (
    <CardBody>
      <div className="hint" style={{ marginBottom: 6 }}>
        召回 {r.count} 条（请求 {r.k}） · 全文候选 {r.fts_count} · 向量候选 {r.vec_count} · 耗时{' '}
        {r.elapsed_ms} ms · <RouteStatus r={r} />
      </div>
      <div className="mono hint" style={{ marginBottom: 10, fontSize: 11 }}>
        {formulaText(f)}
        {f.mode === 'hybrid'
          ? `（RRF 融合 · k=60；关键词权重 ${wPct}:${100 - wPct}${balanced ? '，均衡=与线上一致' : ''}）`
          : '（RRF 融合 · k=60）'}
      </div>
      {/* # 列 44：两位数位次（如「10」）在 36px 列里差几像素被截 */}
      {r.count ? (
        <Table cols={[44, 186, 0, 190]}>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>综合得分</th>
              <th>标题 / 内容 / 区块</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {r.results.map((x, i) => (
              <tr key={x.kb_id}>
                <td className="num">{i + 1}</td>
                <td>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
                    {x.rrf.toFixed(4)}
                  </div>
                  {/* 各路标签纵向排列（每路一行）——横排会被列宽裁掉 */}
                  <div
                    style={{
                      marginTop: 3,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                      alignItems: 'flex-start',
                    }}
                  >
                    {x.routes?.fts ? (
                      <span
                        className="tag"
                        style={{ marginLeft: 0 }}
                        title={`全文路第 ${x.routes.fts.rank} 名 · 相关度 ${x.routes.fts.score}；折算贡献 ${(
                          f.coeff_fts / (60 + x.routes.fts.rank)
                        ).toFixed(4)}`}
                      >
                        全文 第{x.routes.fts.rank}名 · {x.routes.fts.score.toFixed(1)}
                      </span>
                    ) : null}
                    {x.routes?.vec ? (
                      <span
                        className="tag"
                        style={{ marginLeft: 0 }}
                        title={`向量路第 ${x.routes.vec.rank} 名 · 余弦 ${x.routes.vec.score}；折算贡献 ${(
                          f.coeff_vec / (60 + x.routes.vec.rank)
                        ).toFixed(4)}`}
                      >
                        向量 第{x.routes.vec.rank}名 · {x.routes.vec.score.toFixed(3)}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="wrap">
                  <div style={{ fontWeight: 500 }}>{x.title || '（无标题）'}</div>
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: 'var(--text-2)',
                      margin: '4px 0 6px',
                    }}
                  >
                    {x.content}
                  </div>
                  <div
                    className="mono hint"
                    style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span>{x.kb_id}</span>
                    {x.content_truncated ? <span>（截断至 800 字）</span> : null}
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: 10, padding: '1px 6px' }}
                      title="复制该条召回 JSON（含得分与命中路径）"
                      onClick={() => onCopy(x)}
                    >
                      复制
                    </button>
                  </div>
                </td>
                <td className="wrap">
                  <div>{x.source}</div>
                  <div className="hint" style={{ marginTop: 2 }}>
                    {chunkTypeLabel(x.category)}
                    {x.risk_level && x.risk_level !== 'low' ? (
                      <>
                        {' · '}
                        <Pill kind={x.risk_level === 'emergency' ? 'danger' : 'warn'}>
                          风险 {RISK_LABEL[x.risk_level] || x.risk_level}
                        </Pill>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty title="未召回任何条目">换个说法再试；若刚调整过切片或屏蔽，确认已重新入库。</Empty>
      )}
    </CardBody>
  )
}

/* ── 页面 ──────────────────────────────────────────────────────────── */

/**
 * 从「用例集」跳转进来的进入上下文（`?q=<题面>&case=<题号>`）。
 *
 * 用例集行内「检索测试」按钮带着题面跳过来（单题排查直达入口）：
 *   · `q` 预填输入框并**自动跑一次**（省去手抄题面再回车）；
 *   · `case` 仅用于顶部「来自用例集 A-04」的来源提示，不参与检索；
 *   · 只读消费、不回写 URL（与切片对照的 `?chunk=` 深链接同一惯例）——
 *     刷新 / 把链接贴给别人打开都能复现本次检索。
 */
function readJumpIn(): { q: string; caseId: string | null } {
  try {
    const sp = new URLSearchParams(window.location.search)
    const text = (sp.get('q') || '').trim()
    return text ? { q: text, caseId: sp.get('case') || null } : { q: '', caseId: null }
  } catch {
    return { q: '', caseId: null }
  }
}

export function RetrievalTestPage() {
  const { toast } = useApp()
  /** 进入上下文（读一次即定：本页自身不回写 URL） */
  const [jumpIn] = useState(readJumpIn)
  const [q, setQ] = useState(jumpIn.q)
  const [k, setK] = useState(10)
  const [risk, setRisk] = useState('')
  const [category, setCategory] = useState('')
  const [mode, setMode] = useState('hybrid')
  const [weight, setWeight] = useState(0.5)
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const [searchRes, setSearchRes] = useState<QualitySearchResponse | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory)

  /** 实验参数是否偏离线上口径（模式非混合，或权重偏离均衡 0.5） */
  const dirty = mode !== 'hybrid' || Math.abs(weight - 0.5) > 1e-9

  /** 执行一次检索。参数**显式传入**（不依赖 state 更新时序；历史/示例 chip 点击可即刻复跑） */
  async function run(payload: {
    query: string
    k: number
    risk: string
    category: string
    mode: string
    weight: number
  }) {
    if (searching) return
    setSearching(true)
    setSearchErr('')
    try {
      const r = await api.qualitySearch({
        query: payload.query,
        k: payload.k,
        risk_level: payload.risk || undefined,
        category: payload.category || undefined,
        mode: payload.mode,
        keyword_weight: payload.weight,
      })
      setSearchRes(r)
      setHistory((h) => {
        const at = new Date().toTimeString().slice(0, 5)
        const next = [
          {
            query: payload.query,
            k: payload.k,
            risk: payload.risk,
            category: payload.category,
            mode: payload.mode,
            weight: payload.weight,
            at,
            count: r.count,
          },
          ...h.filter(
            (x) =>
              !(
                x.query === payload.query &&
                x.k === payload.k &&
                x.risk === payload.risk &&
                x.category === payload.category &&
                x.mode === payload.mode &&
                x.weight === payload.weight
              ),
          ),
        ].slice(0, HISTORY_MAX)
        saveHistory(next)
        return next
      })
    } catch (err) {
      setSearchErr((err as Error).message)
      setSearchRes(null)
    } finally {
      setSearching(false)
    }
  }

  /**
   * 带题面进入时自动检索一次（用例集「检索测试」按钮的直达体验）。
   * 用**挂载时的初始参数**（10 条 / 全风险 / 混合检索 / 均衡权重）——与质检同口径；
   * StrictMode 下 effect 双执行，由 `autoRan` 守卫保证只跑一次；依赖故意留空：
   * 只在进入时跑一次，之后的参数调整由表单提交 / 历史 chip 触发。
   */
  const autoRan = useRef(false)
  useEffect(() => {
    if (!jumpIn.q || autoRan.current) return
    autoRan.current = true
    void run({ query: jumpIn.q, k, risk, category, mode, weight })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function doSubmit() {
    const query = q.trim().replace(/\s+/g, ' ')
    if (!query) return
    void run({ query, k, risk, category, mode, weight })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    doSubmit()
  }

  /** 历史 / 示例 chip：回填表单并立即复跑 */
  function replay(item: { query: string; k: number; risk: string; category: string; mode: string; weight: number }) {
    setQ(item.query)
    setK(item.k)
    setRisk(item.risk)
    setCategory(item.category)
    setMode(item.mode)
    setWeight(item.weight)
    void run(item)
  }

  function resetParams() {
    setMode('hybrid')
    setWeight(0.5)
  }

  function clearHistory() {
    setHistory([])
    saveHistory([])
  }

  /** 复制单条召回为 JSON（粘给智能体/文档做调试最顺手） */
  function copyItem(x: QualitySearchItem) {
    const text = JSON.stringify(
      {
        kb_id: x.kb_id,
        title: x.title,
        source: x.source,
        category: x.category,
        risk_level: x.risk_level,
        rrf: x.rrf,
        routes: x.routes,
        content: x.content,
      },
      null,
      2,
    )
    navigator.clipboard
      .writeText(text)
      .then(() => toast('已复制该条召回（JSON）'))
      .catch(() => toast('复制失败：浏览器未授权剪贴板'))
  }

  return (
    <Card>
      <CardHead
        title="检索测试"
        meta={
          dirty ? (
            <span style={{ color: 'var(--warn)' }}>实验参数 · 与线上口径不同</span>
          ) : (
            '与质检同口径（同一份检索实现）· 只读'
          )
        }
      />
      <CardBody>
        {jumpIn.q ? (
          <div className="hint" style={{ marginBottom: 8 }}>
            来自用例集{jumpIn.caseId ? ` ${jumpIn.caseId}` : ''} · 题面已带入并自动检索一次（调整上方参数可重跑）
          </div>
        ) : null}
        <form onSubmit={submit}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              className="inp"
              style={{
                flex: 1,
                minHeight: 64,
                padding: '8px 10px',
                lineHeight: 1.6,
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  doSubmit()
                }
              }}
              placeholder="输入问题，如：深度水解配方怎么选"
              autoFocus
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={searching || !q.trim()}
              style={{ minWidth: 78 }}
            >
              {searching ? '检索中…' : '检索'}
            </button>
          </div>

          <div className="toolbar" style={{ margin: '8px 0 0' }}>
            <select
              className="inp"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              title="检索模式（仅全文 / 仅向量为实验参数）"
            >
              <option value="hybrid">混合检索（同口径）</option>
              <option value="fts">仅全文</option>
              <option value="vector">仅向量</option>
            </select>
            {mode === 'hybrid' ? (
              <span className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                关键词权重
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(weight * 100)}
                  onChange={(e) => setWeight(Number(e.target.value) / 100)}
                  style={{ width: 120 }}
                  title="全文 : 向量；50:50 均衡档 = 与线上等权口径完全一致"
                />
                <span className="mono" style={{ fontSize: 11 }}>
                  {Math.round(weight * 100)}% : {100 - Math.round(weight * 100)}%
                </span>
              </span>
            ) : null}
            <select className="inp" value={k} onChange={(e) => setK(Number(e.target.value))} title="返回条数">
              <option value={5}>5 条</option>
              <option value={10}>10 条</option>
              <option value={20}>20 条</option>
            </select>
            <select className="inp" value={risk} onChange={(e) => setRisk(e.target.value)} title="按风险等级过滤">
              <option value="">全部风险</option>
              <option value="low">{RISK_LABEL.low}</option>
              <option value="caution">{RISK_LABEL.caution}</option>
              <option value="emergency">{RISK_LABEL.emergency}</option>
            </select>
            <select className="inp" value={category} onChange={(e) => setCategory(e.target.value)} title="按条目类别过滤">
              <option value="">全部类别</option>
              <option value="section">{chunkTypeLabel('section')}</option>
              <option value="table">{chunkTypeLabel('table')}</option>
            </select>
            {dirty ? (
              <button type="button" className="btn" onClick={resetParams}>
                恢复同口径
              </button>
            ) : null}
          </div>
        </form>

        {history.length ? (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span className="hint">最近：</span>
            {history.map((h, i) => (
              <button
                key={`${h.query}-${h.k}-${h.risk}-${h.category}-${h.mode}-${h.weight}-${i}`}
                type="button"
                className="btn"
                style={{ fontSize: 11, padding: '2px 8px' }}
                title={`${h.at} · ${h.k} 条 · 命中 ${h.count}${
                  h.mode !== 'hybrid'
                    ? ` · ${h.mode === 'fts' ? '仅全文' : '仅向量'}`
                    : Math.abs(h.weight - 0.5) > 1e-9
                      ? ` · 权重 ${Math.round(h.weight * 100)}:${100 - Math.round(h.weight * 100)}`
                      : ''
                }${h.risk ? ` · ${RISK_LABEL[h.risk] || h.risk}` : ''}${
                  h.category ? ` · ${chunkTypeLabel(h.category)}` : ''
                }`}
                onClick={() => replay(h)}
              >
                {excerpt(h.query, 24)}
              </button>
            ))}
            <span className="link hint" onClick={clearHistory}>
              清除
            </span>
          </div>
        ) : null}

        {searchErr ? (
          <div
            className="notice"
            style={{
              margin: '10px 0 0',
              background: 'var(--danger-bg)',
              borderColor: 'var(--danger)',
              color: 'var(--danger)',
            }}
          >
            检索失败：{searchErr}
          </div>
        ) : null}
      </CardBody>

      {searchRes ? (
        <ResultsBody r={searchRes} onCopy={copyItem} />
      ) : (
        <CardBody>
          <div className="hint">
            试试：{' '}
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="btn"
                style={{ fontSize: 11, padding: '2px 8px', marginRight: 6 }}
                onClick={() => replay({ query: ex, k, risk, category, mode, weight })}
              >
                {ex}
              </button>
            ))}
          </div>
        </CardBody>
      )}
    </Card>
  )
}
