import { DOMAINS, domainOfPage } from '../nav'
import { useApp } from '../lib/app-context'
import { DomainIcon, NavIcon } from './icons'

/**
 * 顶部导航 —— 品牌 + 领域切换（知识库 / Agent 测评 / 信号管理 / 观测）+ 右侧平台级入口。
 *
 * 2026-10-09 新增（用户要求"增加顶部导航，区分知识库和 Agent 测评"）：
 *   · 品牌从侧栏移到这条全宽顶条上（「敏宝管理平台」），侧栏因此纯化为"域内菜单"；
 *   · 域页签 = `DOMAINS`（`nav.ts` 单一数据源）；点击切域 → 落到该域 `defaultPage`；
 *   · 当前域由 `domainOfPage(page)` **反推**、不存状态 —— 深链接 / 别名翻译后的页面
 *     进来也能对上正确页签（如 `?page=indexresult` → `source` → 知识库）。
 *
 * 2026-10-11 新增**平台级平台区**（用户要求：「全局配置」从知识库域移出、放到平台层级）：
 *   · 位置 = 顶条**右侧**（`margin-left: auto` + 分隔线），与域页签刻意分开 ——
 *     平台级页面不属任何域，不该混进域页签里充当"第五个域"；
 *   · 当前在平台级页面（`domainOfPage(page) === 'platform'`）时：全部域页签不亮，
 *     本入口高亮；反之入口不亮、域页签正常高亮。
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
      <div className="topnav-right">
        <span className="topnav-sep" aria-hidden />
        {/* 平台级入口（不属任何域）：图标复用侧栏 `config` 的滑块图标，强化"还是那个页面" */}
        <button
          type="button"
          className={`domain-tab topnav-util ${active === 'platform' ? 'active' : ''}`}
          aria-current={active === 'platform' ? 'page' : undefined}
          title="平台级设置：管线条数 · 密钥与环境变量（按域分类）"
          onClick={() => {
            if (active !== 'platform') go('config')
          }}
        >
          <NavIcon id="config" />
          <span>全局配置</span>
        </button>
      </div>
    </header>
  )
}
