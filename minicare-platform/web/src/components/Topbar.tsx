import { RELOADABLE_PAGES, WORKBENCH_PAGE, pageMeta, workbenchTabOf } from '../nav'
import { useApp } from '../lib/app-context'
import { IconPanelLeft } from './icons'

export function Topbar() {
  const { page, tab, refresh, sidebarCollapsed, toggleSidebar } = useApp()
  const m = pageMeta(page)
  // 文档工作台：标题与副标题**跟随当前页签** —— 页签（预检 / 切片对照 / 入库结果…）
  // 才是用户当下在看的产物视图；否则「入库结果」这类页面收进工作台后就没有标题位了。
  const wb = page === WORKBENCH_PAGE ? workbenchTabOf(tab) : null

  const label = wb?.label ?? m?.label ?? '—'
  // 副标题只在真有内容时才拼：`desc` 为空时不再退化成「` · US-01`」这种只剩内部编号的样子
  // （那是"交互稿"最典型的痕迹）。为空则整行不渲染，顶栏只留标题。
  // ⚠️（2026-10-09 晚「去说明化」第二批）`nav.ts` 全部 `desc` 已置空 —— 本页副标题现无输出；
  //   逻辑保留供未实现页面（「计划于第 N 期」提示）与未来复用。别把功能说明写回 `desc`：
  //   内部编号 + 功能清单读起来像交互稿，用户已明确不要。
  let sub = wb?.desc ?? m?.desc ?? ''
  if (!wb && m && !m.impl) sub = `尚未实现 · 计划于第 ${m.phase} 期（${m.story}）`
  else if (!wb && m?.story && sub) sub = `${sub} · ${m.story}`

  return (
    <header className="topbar">
      <div className="topbar-left">
        {/* 侧栏开关放顶栏而不是侧栏里：侧栏收起后自身只剩 56px，开关留在里面会跟着变窄、失去位置记忆 */}
        <button
          type="button"
          className="btn icon-btn"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          aria-expanded={!sidebarCollapsed}
        >
          <IconPanelLeft />
        </button>
        <div className="topbar-title">
          <h1>{label}</h1>
          {sub ? <p className="sub">{sub}</p> : null}
        </div>
      </div>
      <div className="topbar-actions">
        {RELOADABLE_PAGES.has(page) ? (
          <button type="button" className="btn" onClick={refresh}>
            刷新
          </button>
        ) : null}
      </div>
    </header>
  )
}
