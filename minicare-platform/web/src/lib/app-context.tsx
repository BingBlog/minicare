import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './api'
import type { Overview, RunProgress } from './types'
import { fmtElapsed } from './run-progress'
import { DEFAULT_PAGE, EVAL_HISTORY_ALIAS, EVAL_HISTORY_TARGET, META_EXTRACT_TAB_ALIAS, META_EXTRACT_TAB_TARGET, PROCESSING_MODAL_ID, PUBLISH_LOG_ALIAS, REVIEW_TAB_ALIAS, REVIEW_TAB_TARGET, WORKBENCH_PAGE, isProcessingAlias, isWorkbenchTab, pageMeta } from '../nav'

/**
 * 全局视图状态。
 *
 * 路由沿用**查询参数**契约：`?page=<nav id>&doc=<上下文对象 id>&tab=<工作台页签>&modal=<弹框 id>`。
 * 页面还可自带**私有参数**（如检索测试的 `q`、切片对照的 `chunk`）——只在进入时被目标页
 * 消费一次（挂载时读 `window.location.search`，只读不回写）；`go()` 重建 URL 时默认清掉，
 * 唯显式传 `query` 才写入（如「用例集 → 检索测试」带题面跳转）。
 * 之所以不用路径路由：① 与本平台既有的深链接（可收藏、可直接贴出来排障）保持兼容；
 * ② 生产期由 FastAPI 以静态文件托管，无需为 history 路由配置 SPA fallback。
 *
 * ⚠️ `doc` 是**作用域上下文**（语义与归属见 `DOC_FAMILY`），不是全局参数：只在语义一致的
 * 页面之间延续，流向不消费它的页面时一律清掉 —— 页面内导航（`go`）与首屏深链接（`parseUrl`）
 * 同一个口径，保证 URL 里不会留下无意义的 `doc`。
 *
 * **三处 id 翻译**（让各页面里既有的内部跳转无需改动）：
 *   · 任意工作台页签 id（`meta`/`review`/`numbers`/`excluded`/`indexresult`…）→ `page=source&tab=<原 id>`；
 *     旧页签 id `metaextract`（已并入 `meta`）也在这层翻译；
 *   · `detail`/`records` → `page=corpus&modal=processing`（已合并成「文档管理」里的一个弹框）；
 *   · `publishlog`（已移除的「发布记录」页）→ `page=publish`（留档与回滚由发布页承接）。
 */
interface AppContextValue {
  page: string
  doc: string | null
  /** 工作台内的当前页签；非工作台页面时为空 */
  tab: string | null
  /** 当前打开的弹框 id（如 `processing`）；无则空 */
  modal: string | null
  /** 自增计数：变化即强制当前页重新拉数据（对应顶栏「刷新」与动作后的重载） */
  nonce: number
  go: (
    page: string,
    opts?: {
      doc?: string | null
      tab?: string
      modal?: string | null
      /**
       * 页面私有查询参数（如「检索测试」的 `q=题面`）——随本次导航写入 URL，
       * 供目标页在挂载时作「进入上下文」消费一次；不参与跨页延续（不传即清掉）。
       */
      query?: Record<string, string>
      refresh?: boolean
    },
  ) => void
  refresh: () => void
  toast: (msg: ReactNode, ms?: number) => void
  overview: Overview | null
  ensureOverview: (force?: boolean) => Promise<Overview>
  /**
   * 正在运行的文档进度（doc_id → RunProgress），驱动两处界面：
   *   · 右下角常驻「运行进度」浮标（RunDock）—— 替代早期那条 60s 后凭空消失的
   *     「运行中（dry-run）…」toast，运行多久就显示多久、每秒刷新；
   *   · 「文档管理」卡片的七步管线实时高亮与步骤文本。
   */
  activeRuns: Record<string, RunProgress>
  /**
   * 开始跟踪一份文档的运行进度（1s 轮询 `/run-progress`，直到跑完自动收尾）。
   * 幂等：同一文档重复调用不会重复开轮询。页面刷新后的恢复由 `ensureOverview` 自动完成。
   */
  trackRun: (docId: string) => void
  /** 侧栏是否收起（仅图标）。跨会话记忆，存在 localStorage。 */
  sidebarCollapsed: boolean
  toggleSidebar: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

/**
 * UI 偏好的持久化 key。**只存"怎么看"的偏好，不存路由**——路由已经在 URL 查询参数里，
 * 两处存同一份状态必然打架。localStorage 在隐私模式下会抛异常，所以全部 try/catch 吞掉。
 */
const SIDEBAR_KEY = 'kb.sidebar.collapsed'

function readBool(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeBool(key: string, v: boolean): void {
  try {
    window.localStorage.setItem(key, v ? '1' : '0')
  } catch {
    /* 隐私模式 / 存储被禁：偏好不持久化，不影响使用 */
  }
}

export interface ToastState {
  id: number
  msg: ReactNode
}

interface Route {
  page: string
  doc: string | null
  tab: string | null
  modal: string | null
}

/**
 * `doc` 参数的**作用域族** —— 两类页面语义不同（沿用既有深链接惯例，共用一个参数名）：
 *   · **文档族**（值是 `doc_id`）：文档工作台 `source`（含全部页签）、文档管理 `corpus`
 *     （处理弹框指向哪份文档）；
 *   · **运行族**（值是 `run_id`）：Agent 测评 `agenteval`（查看指定轮）、质检执行记录
 *     `qualityruns`（打开运行详情）。
 *
 * 其余页面（发布 / 全局配置 / 质检与测评的列表页…）**不消费 `doc`**。踩过的坑：从文档工作台
 * 点侧栏「执行记录」，`doc_id` 被带进 `qualityruns`，而该页把 `doc` 当 `run_id` 解读，
 * 直接渲染成一个不存在的运行详情 —— 所以 `doc` 只能**同族延续**，其余场景一律清掉。
 */
const DOC_FAMILY: Record<string, 'doc' | 'run'> = {
  source: 'doc',
  corpus: 'doc',
  agenteval: 'run',
  qualityruns: 'run',
}

function docFamilyOf(page: string): 'doc' | 'run' | null {
  return DOC_FAMILY[page] ?? null
}

/** `doc` 只在其语义一致的页面之间延续（如 文档管理 ↔ 文档工作台）；跨族 / 非消费页清掉 */
function sameDocFamily(from: string, to: string): boolean {
  const fam = docFamilyOf(from)
  return fam !== null && fam === docFamilyOf(to)
}

function parseUrl(): Route {
  const r = parseUrlRaw()
  // 非消费页不保留 `doc` —— 让 `?page=publish&doc=X` 这类历史深链接自愈；
  // 页面内导航不会再生出这种 URL（见 go()）。
  return r.doc && !docFamilyOf(r.page) ? { ...r, doc: null } : r
}

function parseUrlRaw(): Route {
  const q = new URLSearchParams(window.location.search)
  const raw = q.get('page')
  const doc = q.get('doc')
  const modal = q.get('modal')

  // 旧深链接翻译：`?page=detail` / `?page=records` → 文档管理的处理弹框
  if (raw && isProcessingAlias(raw)) {
    return { page: 'corpus', doc, tab: null, modal: PROCESSING_MODAL_ID }
  }
  // 旧深链接翻译：`?page=metaextract`（元信息解析已并入「元信息解析与确认」）→ tab=meta
  if (raw === META_EXTRACT_TAB_ALIAS) {
    return { page: WORKBENCH_PAGE, doc, tab: META_EXTRACT_TAB_TARGET, modal }
  }
  // 旧深链接翻译：`?page=review` / `?tab=review`（内容校对已并入切片对照）
  if (raw === REVIEW_TAB_ALIAS) {
    return { page: WORKBENCH_PAGE, doc, tab: REVIEW_TAB_TARGET, modal }
  }
  // 旧深链接翻译：`?page=publishlog`（发布记录页已移除 —— 留档与回滚由「发布上线」承接）→ 发布上线
  if (raw === PUBLISH_LOG_ALIAS) {
    return { page: 'publish', doc, tab: null, modal }
  }
  // 旧深链接翻译：`?page=agentevalhistory`（测评记录已并入「测评任务」页）→ 测评任务
  if (raw === EVAL_HISTORY_ALIAS) {
    return { page: EVAL_HISTORY_TARGET, doc, tab: null, modal }
  }
  // 工作台页签的通用翻译：`?page=indexresult`（入库结果已并入）等旧页面 id 也走这一支
  if (raw && isWorkbenchTab(raw)) {
    return { page: WORKBENCH_PAGE, doc, tab: raw, modal }
  }
  return {
    page: raw && pageMeta(raw) ? raw : DEFAULT_PAGE,
    doc,
    tab:
      q.get('tab') === REVIEW_TAB_ALIAS ? REVIEW_TAB_TARGET
      : q.get('tab') === META_EXTRACT_TAB_ALIAS ? META_EXTRACT_TAB_TARGET
      : q.get('tab'),
    modal,
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(parseUrl, [])
  const [page, setPage] = useState(initial.page)
  const [doc, setDoc] = useState<string | null>(initial.doc)
  const [tab, setTab] = useState<string | null>(initial.tab)
  const [modal, setModal] = useState<string | null>(initial.modal)
  const [nonce, setNonce] = useState(0)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [toasts, setToasts] = useState<ToastState[]>([])
  const toastId = useRef(0)

  // 首屏自愈：解析阶段被丢弃的 `doc`（页面不消费它，如 `?page=publish&doc=X`）同步从地址栏擦掉。
  // 只删这一个参数 —— `chunk` 等页面私有参数原样保留，不整体重建查询串。
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (!q.has('doc') || initial.doc) return
    q.delete('doc')
    window.history.replaceState(null, '', `?${q.toString()}`)
  }, [initial])

  const toast = useCallback((msg: ReactNode, ms = 4200) => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, msg }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms)
  }, [])

  const go = useCallback<AppContextValue['go']>(
    (next, opts) => {
      const asTab = isWorkbenchTab(next)
      const asReview = next === REVIEW_TAB_ALIAS
      const asMetaExtract = next === META_EXTRACT_TAB_ALIAS
      const asProcessing = isProcessingAlias(next)
      const nextPage = asProcessing ? 'corpus' : asTab || asReview || asMetaExtract ? WORKBENCH_PAGE : next
      // `doc` 是作用域上下文（见 DOC_FAMILY），不是"当前文档"全局记忆：
      //   · 显式传入（含 `doc: null`）→ 以调用方为准（列表点行打开详情 / 「返回列表」）；
      //   · 未传 → **仅同族延续**：文档管理 ↔ 文档工作台（保留这份文档，页面里可继续钻取）；
      //     导航到不消费 doc 的页面（发布 / 配置 / 执行记录…）或跨族（doc_id ↔ run_id）时清掉。
      const nextDoc =
        opts && 'doc' in opts ? (opts.doc ?? null) : sameDocFamily(page, nextPage) ? doc : null

      let nextTab: string | null
      if (asReview) nextTab = REVIEW_TAB_TARGET
      else if (asMetaExtract) nextTab = META_EXTRACT_TAB_TARGET
      else if (asTab) nextTab = next
      else if (asProcessing) nextTab = null
      else if (opts && 'tab' in opts)
        nextTab = opts.tab === META_EXTRACT_TAB_ALIAS ? META_EXTRACT_TAB_TARGET : opts.tab ?? null
      else nextTab = nextPage === WORKBENCH_PAGE ? tab : null

      // 弹框：别名 → 处理弹框；显式传 modal → 用它；换页 → 关闭；同页刷新 → 保留（弹框内刷新不闪退）
      let nextModal: string | null
      if (asProcessing) nextModal = PROCESSING_MODAL_ID
      else if (opts && 'modal' in opts) nextModal = opts.modal ?? null
      else nextModal = nextPage === page ? modal : null

      setPage(nextPage)
      setDoc(nextDoc)
      setTab(nextTab)
      setModal(nextModal)

      const q = new URLSearchParams()
      q.set('page', nextPage)
      if (nextDoc) q.set('doc', nextDoc)
      if (nextTab && nextTab !== 'compare') q.set('tab', nextTab)
      if (nextModal) q.set('modal', nextModal)
      // 页面私有参数：仅显式传入才写入（如用例集 → 检索测试带 `q=题面&case=A-04`）。
      // URL 是整体重建 ⇒ 不传即清掉——私有参数属于「进入时的一次性上下文」，不是路由状态。
      if (opts?.query) {
        for (const [k, v] of Object.entries(opts.query)) {
          if (v !== '') q.set(k, v)
        }
      }
      window.history.replaceState(null, '', `?${q.toString()}`)
      if (opts?.refresh) setNonce((n) => n + 1)
    },
    [doc, tab, modal, page],
  )

  const refresh = useCallback(() => {
    setNonce((n) => n + 1)
    // 刷新数据的同时做一次「运行恢复检查」：若此刻有文档在跑（比如从别处触发的运行），
    // 自动接上进度跟踪 —— 否则仅点「刷新」按钮时浮标不会出现，只有整页 F5 才会。
    void ensureOverviewRef.current?.(true).catch(() => {})
  }, [])

  /* ── 运行进度跟踪（RunDock + 卡片七步管线的实时数据源）────────────── */

  const [activeRuns, setActiveRuns] = useState<Record<string, RunProgress>>({})
  /** doc_id → 轮询定时器 id。存在即代表「正在跟踪这份文档」 */
  const runPollers = useRef<Map<string, number>>(new Map())
  /** 断循环引用：trackRun 收尾时要刷新总览，而 ensureOverview 里又要调 trackRun（恢复场景） */
  const ensureOverviewRef = useRef<((force?: boolean) => Promise<Overview>) | null>(null)

  const trackRun = useCallback((docId: string) => {
    if (runPollers.current.has(docId)) return // 幂等：已在跟踪就不重复开
    /** 点击与后端登记之间可能有短暂延迟（POST 还在路上）——允许这段窗口内重试等待 */
    let misses = 0
    const drop = () => {
      runPollers.current.delete(docId)
      setActiveRuns((m) => {
        if (!(docId in m)) return m
        const next = { ...m }
        delete next[docId]
        return next
      })
    }
    const tick = async () => {
      let p: RunProgress | null = null
      try {
        p = await api.runProgress(docId)
      } catch {
        /* 后端重启窗口 / 偶发抖动：退避重试，不放弃跟踪 */
      }
      if (!p) {
        runPollers.current.set(docId, window.setTimeout(tick, 1500))
        return
      }
      if (p.running) {
        misses = 0
        setActiveRuns((m) => ({ ...m, [docId]: p as RunProgress }))
        runPollers.current.set(docId, window.setTimeout(tick, 1000))
        return
      }
      if (p.mode) {
        // 有运行记录但已结束（含 30s 保留窗口内的 finished 快照）→ 收尾：
        // 撤下浮标 + 刷新总览（卡片状态变新）。结果反馈由发起页面自己的 toast 承担。
        drop()
        ensureOverviewRef.current?.(true).catch(() => {})
        return
      }
      // 完全没有运行记录：POST 可能还没到达后端 → 500ms×12 内重试等待
      if (misses < 12) {
        misses += 1
        runPollers.current.set(docId, window.setTimeout(tick, 500))
        return
      }
      drop()
    }
    runPollers.current.set(docId, window.setTimeout(tick, 250))
  }, [])

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readBool(SIDEBAR_KEY))
  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), [])
  useEffect(() => {
    writeBool(SIDEBAR_KEY, sidebarCollapsed)
  }, [sidebarCollapsed])

  const ensureOverview = useCallback(
    async (force = false) => {
      if (overview && !force) return overview
      const ov = await api.overview()
      setOverview(ov)
      // 恢复：总览里带 `running` 的文档正在跑（常见于"点了运行 → 等太久 → 刷新页面"），
      // 自动接回进度跟踪 —— 否则刷新后浮标与卡片进度会静默消失，只剩干等。
      for (const d of ov.docs) {
        if (d.running) trackRun(d.doc_id)
      }
      return ov
    },
    [overview, trackRun],
  )
  useEffect(() => {
    ensureOverviewRef.current = ensureOverview
  }, [ensureOverview])

  // 首屏预热 overview（侧栏底部版本号与多数页面的 KPI 都依赖它）
  useEffect(() => {
    ensureOverview().catch(() => {
      /* 首屏预热失败不阻塞导航；具体页面会各自报错 */
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value: AppContextValue = {
    page,
    doc,
    tab,
    modal,
    nonce,
    go,
    refresh,
    toast,
    overview,
    ensureOverview,
    activeRuns,
    trackRun,
    sidebarCollapsed,
    toggleSidebar,
  }

  return (
    <AppContext.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} />
      <RunDock
        runs={Object.values(activeRuns)}
        onOpen={(docId) => go('corpus', { doc: docId, modal: null })}
      />
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用')
  return ctx
}

function ToastHost({ toasts }: { toasts: ToastState[] }) {
  return (
    <>
      {toasts.map((t) => (
        <div key={t.id} className="toast" style={{ opacity: 1, pointerEvents: 'none' }}>
          {t.msg}
        </div>
      ))}
    </>
  )
}

/**
 * 右下角常驻「运行进度」浮标（替代早期的静态「运行中（dry-run）…」提示）。
 *
 * 早期实现是一条 60 秒就消失的 toast：运行若超过 60s（parse 调 MinerU 动辄几分钟），
 * 提示凭空消失，用户既不知道跑到哪一步、也不知道结束了没有。浮标则**运行多久显示多久**，
 * 每秒随轮询刷新「第 N/6 步 · 步骤名 · 已耗时」，点击可跳回该文档；
 * 跑完即撤（结果反馈由发起页面的 toast 与卡片状态承担）。
 */
function RunDock({ runs, onOpen }: { runs: RunProgress[]; onOpen: (docId: string) => void }) {
  if (!runs.length) return null
  return (
    <div className="rundock">
      {runs.map((p) => (
        <button
          key={p.doc_id}
          type="button"
          className="runitem"
          title={`${p.doc_id} —— 点击回到「文档管理」`}
          onClick={() => onOpen(p.doc_id)}
        >
          <span className="spin" />
          <span className="rname">{p.doc_id}</span>
          <span className="rstep">
            {p.step_label ? `第 ${p.step_index}/${p.total_steps} 步 · ${p.step_label}` : '准备中…'}
            {p.substep ? ` · ${p.substep}` : ''}
            {p.elapsed_ms != null ? ` · 已 ${fmtElapsed(p.elapsed_ms)}` : ''}
          </span>
        </button>
      ))}
    </div>
  )
}
