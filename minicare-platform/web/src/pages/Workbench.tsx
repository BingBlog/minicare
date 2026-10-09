import { useEffect, useState } from 'react'
import { useApp } from '../lib/app-context'
import { STEP_BADGE, WORKBENCH_TABS, workbenchTabOf } from '../nav'
import { Card, DocPill, Dots, Empty, ErrorBox, Loading } from '../components/ui'
import { CompareView } from './SourceCompare'
import { ChunkCompareView } from './ChunkCompare'
import { NormalizeDiffView } from './NormalizeDiff'
import { PreflightPage } from './Preflight'
import { MetaPage } from './Meta'
import { NumbersPage } from './Numbers'
import { ExcludedPage } from './Excluded'
import { IndexResultPage } from './IndexResult'
import { RecordsPage } from './Records'

/**
 * 文档工作台（`page=source`）—— **文档级视图的唯一入口**（二层导航的承载页）。
 *
 * 背景：这一层原本是并列的侧栏页，用户要求「文档管理点进来即工作台」，因此改为
 * **工作台外壳 + 页签**，默认落在「解析结果对照」。七步流水线的产物都在这九个页签里。
 * · 未指定文档时（侧栏「文档工作台」进来 / 不带 `doc` 的深链接）**默认打开第一份文档**
 *   （2026-10-09 用户要求；「第一份」与「文档管理」列表同序），一份都没有时才落引导态。
 *
 * · 「处理详情」是「文档管理」里的**纯查看弹框**（七步状态 + 各步产物 + 警告/错误，无操作项）；
 *   「处理记录」则是本页的 `runlog` 页签（完整执行历史）——两处各司其职。
 *   ⚠️ 页头**不再设**「处理详情」按钮（2026-10-09 用户要求移除：页签已覆盖其内容，弹框仅从「文档管理」侧打开）。
 * · 「入库结果」（第 ⑦ 步「索引」产物）由侧栏并入，旧深链接 `?page=indexresult` 自动翻译到这里。
 *
 * 实现上刻意**复用原有页面组件**（`MetaPage` / `IndexResultPage` 等）而不是重写 ——
 * 它们本来就只依赖 `useApp().doc`，作为页签内容直接可用，既省事也不会引入行为差异。
 * （2026-10-09 删除）「处理进度」页曾因**跨文档**的全局队列职责独立成页、刻意不并入本工作台；
 * 该页已随「文档按篇处理、无队列场景」的结论整体移除（队列本体保留为 CLI）。
 */
export function WorkbenchPage() {
  const { doc, tab, go, nonce, overview, ensureOverview } = useApp()
  /** overview 拉取失败（只在 overview 一直为空时用于报错兜底；之后任何一次成功刷新都会盖过它） */
  const [overviewError, setOverviewError] = useState<Error | null>(null)

  // 当前页签与 Topbar 共用同一份推导（`workbenchTabOf`），保证「顶栏标题 = 页签内容」
  const activeTabMeta = workbenchTabOf(tab)
  const activeTab = activeTabMeta.id

  useEffect(() => {
    ensureOverview().catch((e: unknown) => {
      /* 顶栏状态条拿不到 overview 时降级为不显示，不阻塞工作台；
         但本页还要用它「自动选中第一份文档」，所以记下错误以便给出可见反馈 */
      setOverviewError(e as Error)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 未指定文档时**默认落到第一份文档**（2026-10-09 用户要求）：
   * 覆盖两个入口 —— 侧栏「文档工作台」（不带 doc 进来）与直接访问 `?page=source` 的深链接。
   * · 「第一份」= `/api/overview` 的 `docs[0]`，与「文档管理」卡片矩阵的展示顺序严格一致
   *   （后端按 doc_id 排序下发，两边消费同一份 `ov.docs`）；
   * · 选中走 `go`：URL 同步为 `?page=source&doc=<id>`（replaceState），保持"URL 即深链接"惯例；
   *   当前页签等参数由 `go` 沿用，不会因自动选中而丢；
   * · 已有 doc（从卡片点入 / 深链接带 doc）时**不动** —— 显式上下文优先。
   */
  useEffect(() => {
    if (doc || !overview) return
    const first = overview.docs[0]
    if (first) go('source', { doc: first.doc_id })
  }, [doc, overview, go])

  if (!doc) {
    // 无文档上下文时的三个落点（选中动作由上方 effect 完成，这里只负责过渡态与兜底）：
    // ① overview 就绪但列表为空 → 引导去「文档管理」上传/登记；
    // ② overview 拉不到 → 报错（顶栏「刷新」或切页回来均可重试）；
    // ③ 其余（overview 加载中 / 就绪后即将自动选中的一帧）→ 加载态，
    //    避免闪出误导性的"尚未选择文档"（其实马上就会自动选上）。
    if (overview && overview.docs.length === 0) {
      return (
        <Card>
          <Empty title="还没有文档">
            先去
            <button className="btn" style={{ margin: '0 4px' }} onClick={() => go('corpus')}>
              文档管理
            </button>
            上传或登记一份，再回到工作台看产物。
          </Empty>
        </Card>
      )
    }
    if (!overview && overviewError) return <ErrorBox error={overviewError} />
    return <Loading />
  }

  const meta = overview?.docs.find((d) => d.doc_id === doc)

  return (
    <>
      {/* ── 文档头：状态与七步进度 ── */}
      {doc ? (
      <div className="wb-head">
        <div className="wb-title">
          <b title={doc}>{doc}</b>
          <span className="hint">
            {meta ? (
              <>
                <DocPill status={meta.status} />
                <span style={{ marginLeft: 8 }}>{meta.region === 'cn' ? '国内' : '国际'}</span>
              </>
            ) : (
              '未在产物目录中扫描到（可能已被移除）'
            )}
          </span>
        </div>
        <div className="wb-head-right">
          {meta ? <Dots steps={meta.steps} /> : null}
          <button type="button" className="btn" onClick={() => go('corpus')}>
            换文档
          </button>
          <button type="button" className="btn" onClick={() => go('source', { refresh: true })}>
            刷新
          </button>
        </div>
      </div>
      ) : null}

      {/* ── 页签 ──
          有 `step` 的页签带「第 N 步产物」圈码徽标：数据来自哪一步一眼可见，
          与列表页步骤条上的第 N 个节点直接对应。
          （2026-10-09 晚「去说明化」第二批）页签 `desc` 已全部置空：页签行尾的说明小字
          与顶栏副标题不再出现；悬停提示只保留「第 N 步产物」这一结构信息。 */}
      <div className="wb-tabs">
        {WORKBENCH_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`wb-tab ${activeTab === t.id ? 'active' : ''}`}
            title={t.step ? `第 ${t.step} 步产物${t.desc ? ` · ${t.desc}` : ''}` : t.desc || t.label}
            onClick={() => go('source', { tab: t.id })}
          >
            {t.step ? <span className="wb-tab-step">{STEP_BADGE[t.step]}</span> : null}
            {t.label}
          </button>
        ))}
      </div>

      {/* key 绑定页签 + nonce：切换页签或点「刷新」即重挂载，强制重新拉数据 */}
      <div key={`${activeTab}-${nonce}`}>
        {activeTab === 'compare' ? <CompareView /> : null}
        {activeTab === 'normalize' ? <NormalizeDiffView /> : null}
        {activeTab === 'chunks' ? <ChunkCompareView /> : null}
        {activeTab === 'preflight' ? <PreflightPage /> : null}
        {activeTab === 'meta' ? <MetaPage /> : null}
        {activeTab === 'numbers' ? <NumbersPage /> : null}
        {activeTab === 'excluded' ? <ExcludedPage /> : null}
        {activeTab === 'indexresult' ? <IndexResultPage /> : null}
        {activeTab === 'runlog' ? <RecordsPage /> : null}
      </div>
    </>
  )
}
