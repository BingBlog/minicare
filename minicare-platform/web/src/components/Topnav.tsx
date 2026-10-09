import { DOMAINS, domainOfPage } from '../nav'
import { useApp } from '../lib/app-context'
import { DomainIcon } from './icons'

/**
 * 顶部导航 —— 品牌 + 领域切换（知识库 / Agent 测评）。
 *
 * 2026-10-09 新增（用户要求"增加顶部导航，区分知识库和 Agent 测评"）：
 *   · 品牌从侧栏移到这条全宽顶条上（「敏宝管理平台」），侧栏因此纯化为"域内菜单"；
 *   · 域页签 = `DOMAINS`（`nav.ts` 单一数据源）；点击切域 → 落到该域 `defaultPage`；
 *   · 当前域由 `domainOfPage(page)` **反推**、不存状态 —— 深链接 / 别名翻译后的页面
 *     进来也能对上正确页签（如 `?page=indexresult` → `source` → 知识库）。
 *
 * 版式（styles.css `.topnav`）：`position: sticky; top/left: 0`，横竖都钉住；
 * 侧栏与右区内容顶栏的 sticky 起点都从它下沿开始（`--topnav-h`），z-index 压在两者之上。
 */
export function Topnav() {
  const { page, go } = useApp()
  const active = domainOfPage(page)

  return (
    <header className="topnav">
      <div className="topnav-brand">
        <span className="topnav-mark" aria-hidden>
          敏
        </span>
        <b>敏宝管理平台</b>
      </div>
      <nav className="topnav-domains" aria-label="平台分区">
        {DOMAINS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`domain-tab ${active === d.id ? 'active' : ''}`}
            aria-current={active === d.id ? 'page' : undefined}
            title={d.desc}
            // 已在目标域内时不动（页签是"切换器"而不是"重置器"）：避免点一下把
            // 用户从「测评用例」这类深位置弹回总览页。
            onClick={() => {
              if (d.id !== active) go(d.defaultPage)
            }}
          >
            <DomainIcon id={d.id} />
            <span>{d.label}</span>
          </button>
        ))}
      </nav>
    </header>
  )
}
