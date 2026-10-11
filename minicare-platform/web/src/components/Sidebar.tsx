import { domainOfPage, navFor, type NavItem } from '../nav'
import { useApp } from '../lib/app-context'
import { NavIcon } from './icons'
import { Pill } from './ui'

/**
 * 左侧导航 —— **当前归属层内的两级菜单**（2026-10-09 第三次收敛；2026-10-11 适配平台级）。
 *
 * 品牌与域切换（知识库 / Agent 测评 / 信号管理 / 观测）已上移到**顶部导航**（`Topnav`），
 * 本组件只渲染 `navFor(domainOfPage(page))`：当前归属的一级项 + 其二级视图（缩进渲染，见 `.nav-sub`）。
 * 「归属」= 域或平台级（`platform`，如「全局配置」）—— 平台级页面不属于任何域，
 * 此时侧栏只渲染平台级菜单（当前即「全局配置」一项，高亮表示"你在这里"），域页签全部不亮。
 * 域之间的切换不在这里 —— 顶部导航是唯一入口，避免"两个域塞一个侧栏"的混杂。
 *
 * 文档级页面（「文档工作台」「入库结果」）标了 `hidden` 并挂在各自父项下，**不渲染** ——
 * 它们从「文档管理」点选文档进入，由工作台页签承载。
 *
 * 两态：展开（160px，图标 + 文字）与 **收起（56px，仅图标）**。收起态由 `<App>` 上的
 * `.app-collapsed` 类驱动；文字与二级缩进都交给 CSS 处理，不在 JS 里做条件渲染 ——
 * 两态的 DOM 一致，切换时不丢状态（例如 `title` 提示、键盘焦点），
 * 二级项在收起态同样居中显示图标，不丢可达性。
 */
export function Sidebar() {
  const { page, go, overview, sidebarCollapsed } = useApp()

  /** 当前领域的一级项（域 = 由页面 id 反推，顶部导航与这里同口径） */
  const items = navFor(domainOfPage(page))

  /** 导航按钮（一级与二级共用；`sub` 只多一个缩进类） */
  const item = (it: NavItem, sub: boolean) => (
    <button
      key={it.id}
      type="button"
      className={`nav-item ${sub ? 'nav-sub' : ''} ${it.impl ? '' : 'todo'} ${page === it.id ? 'active' : ''}`}
      // 收起态看不到文字，用原生 title 兜住"这个图标是什么"。
      // ⚠️ 页面可以不设 `desc`（见 `nav.ts` 的 corpus）—— 此时退回只显示名称，
      // 别拼出「文档管理 · 」这种带尾分隔符的悬空提示。
      title={!it.desc ? it.label : sidebarCollapsed ? `${it.label} · ${it.desc}` : it.desc}
      onClick={() => go(it.id)}
    >
      <NavIcon id={it.id} />
      <span className="nav-label">{it.label}</span>
      {!it.impl ? <span className="ph">第{it.phase}期</span> : null}
    </button>
  )

  return (
    <aside className="sidebar">
      <nav className="nav">
        {items.map((it) => {
          if (it.hidden) return null
          // 二级只有可见项（hidden 的文档级页面挂在父项下但不渲染）
          const subs = (it.children ?? []).filter((c) => !c.hidden)
          return (
            <div className="nav-node" key={it.id}>
              {item(it, false)}
              {subs.map((c) => item(c, true))}
            </div>
          )
        })}
      </nav>

      <div className="sidebar-foot">
        <div className="foot-full">
          <div className="row">
            <Pill kind="accent">只读环境</Pill>
          </div>
          <div className="row">
            {overview
              ? `管线 v${overview.pipeline_version} · 平台 v${overview.platform_version}`
              : '正在读取版本…'}
          </div>
          <div className="row">
            {overview ? (
              overview.yaml_loaded ? (
                <Pill kind="ok">pipeline.yaml 已生效</Pill>
              ) : (
                <Pill kind="warn">YAML 未生效</Pill>
              )
            ) : null}
          </div>
        </div>

        {/* 收起态：版本行放不下，压成一个状态点，细节交给 title */}
        <div
          className="foot-mini"
          title={`只读环境 · ${
            overview ? `管线 v${overview.pipeline_version} · 平台 v${overview.platform_version}` : '正在读取版本…'
          }${overview && !overview.yaml_loaded ? ' · YAML 未生效' : ''}`}
        >
          <span className={`foot-dot ${overview && !overview.yaml_loaded ? 'warn' : ''}`} />
        </div>
      </div>
    </aside>
  )
}
