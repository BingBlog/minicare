import type { ReactNode } from 'react'

/**
 * 内联 SVG 图标（Lucide 线条风格：stroke + round cap/join）。
 *
 * 为什么不引图标库：这是内网维护工具，10 个导航图标不值得拉一个 icon 包（也省掉一次
 * 依赖升级与 tree-shaking 风险）。方向与 `.agents/rules/frontend-coding.mdc` 一致 ——
 * **不用 emoji**、用 SVG 组件、按语义命名。
 *
 * 尺寸与颜色**全部交给 CSS**：颜色走 `currentColor`（继承 `.nav-item` 的颜色，
 * 所以激活态／折叠态不用传 props），尺寸由 `.ico` 类控制。
 */
const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** 侧栏导航图标：key = `nav.ts` 里的页面 id。新增页面时要同步补一条。 */
export const NAV_ICONS: Record<string, ReactNode> = {
  /** 信号图谱 —— 节点连线（信号间的关系图） */
  signals: (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <path d="M7.6 7.6 10.7 16.2M16.4 7.6 13.3 16.2M8.2 6h7.6" />
    </>
  ),
  /** 配置清单 —— 滑杆（参数调节） */
  signalsconfig: (
    <>
      <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />
      <circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="17" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  /** 词表维护 —— 标签（食物名归类） */
  signalswords: (
    <>
      <path d="M12.6 3.5H19a1.5 1.5 0 0 1 1.5 1.5v6.4a2 2 0 0 1-.6 1.4l-7.5 7.5a2 2 0 0 1-2.8 0L4.2 14a2 2 0 0 1 0-2.8l7.5-7.5a2 2 0 0 1 .9-.2z" />
      <circle cx="16" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  /** 变更发布 —— 向上发布（写回随部署） */
  signalspublish: (
    <>
      <path d="M12 16V4" />
      <path d="m6.5 9.5 5.5-5.5 5.5 5.5" />
      <path d="M4.5 20h15" />
    </>
  ),
  /** 版本与审计 —— 时钟回转（历史与回滚） */
  signalshistory: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.6v4.2h4.2" />
      <path d="M12 8v4l2.8 1.9" />
    </>
  ),
  /** 文档管理 —— 带文字行的文档 */
  corpus: (
    <>
      <path d="M6 3.5h7.5L18.5 8v12.5H6z" />
      <path d="M13.5 3.5V8h5" />
      <path d="M9 12.5h6M9 16h4" />
    </>
  ),
  /** 元信息总览 —— 标签（文档的属性/来源标注） */
  metadata: (
    <>
      <path d="M11.6 3H4.5A1.5 1.5 0 0 0 3 4.5v7.1a1.5 1.5 0 0 0 .44 1.06l8 8a1.5 1.5 0 0 0 2.12 0l7.1-7.1a1.5 1.5 0 0 0 0-2.12l-8-8A1.5 1.5 0 0 0 11.6 3z" />
      <circle cx="7.6" cy="7.6" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  /** 原文对照 —— 左右分栏（也正是本页的形态） */
  source: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M12 4.5v15" />
    </>
  ),
  /** 入库结果 —— 数据库 */
  indexresult: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6" />
      <path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
    </>
  ),
  /** 发布上线 —— 上传 */
  publish: (
    <>
      <path d="M12 16.5V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4.5 15.5V18a2.5 2.5 0 0 0 2.5 2.5h10A2.5 2.5 0 0 0 19.5 18v-2.5" />
    </>
  ),
  /** 检索质检 —— 放大镜 */
  quality: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.4 15.4 5.1 5.1" />
    </>
  ),
  /** 用例集（检索质检）—— 带勾的清单（三态标注的题目库） */
  qualitycases: (
    <>
      <path d="M9.5 5.5H20M9.5 12H20M9.5 18.5H20" />
      <path d="m3.5 5.5 1.2 1.2L7.2 4.4" />
      <path d="m3.5 12 1.2 1.2 2.5-2.3" />
      <path d="m3.5 18.5 1.2 1.2 2.5-2.3" />
    </>
  ),
  /** 执行记录（检索质检）—— 柱状（指标随轮次） */
  qualityruns: (
    <>
      <path d="M4.5 19.5V11" />
      <path d="M9.8 19.5V4.5" />
      <path d="M15.1 19.5v-6" />
      <path d="M20.4 19.5V8" />
    </>
  ),
  /** 检索测试 —— 放大镜 + 勾（搜到之后验证召回是否正确） */
  retrievaltest: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.4 15.4 5.1 5.1" />
      <path d="m7.6 10.6 2 2 3.6-3.8" />
    </>
  ),
  /** 知识缺口 —— 警示三角 */
  gaps: (
    <>
      <path d="M12 3.6 21 20H3z" />
      <path d="M12 9.8v4.4" />
      <path d="M12 17.4h.01" />
    </>
  ),
  /** 生效阈值 —— 滑块（三段滑轨 + 三个手柄） */
  config: (
    <>
      <path d="M21 6H14M10 6H3M21 12H16M12 12H3M21 18H18M14 18H3" />
      <path d="M12 4v4M14 10v4M16 16v4" />
    </>
  ),
  /** Agent 测评 —— 评审清单（clipboard-check；与顶部导航的 eval 域图标同源） */
  agenteval: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
  /** 测评用例 —— 实验瓶（一条条"试"出来的用例） */
  agentevalcases: (
    <>
      <path d="M10 3v6l-5.2 9.1A2 2 0 0 0 6.6 21h10.8a2 2 0 0 0 1.7-2.9L14 9V3z" />
      <path d="M8.5 3h7" />
      <path d="M7.7 15h8.6" />
    </>
  ),
  /** 测评任务 —— 播放圆钮（一键发起一轮运行） */
  agentevaltasks: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10.2 8.8 15.4 12l-5.2 3.2z" />
    </>
  ),
  /** 测评裁判 —— 天平（谁判、按什么口径判） */
  agentevaljudges: (
    <>
      <path d="M12 4v17" />
      <path d="M8.5 21h7" />
      <path d="M4 7h16" />
      <path d="M6.8 7 4.2 12.4a3 3 0 0 0 5.2 0z" />
      <path d="M17.2 7l2.6 5.4a3 3 0 0 1-5.2 0z" />
    </>
  ),
  /** 观测总览 —— 监控屏上的脉冲（执行过程可视） */
  observability: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="M6 12h2.4l1.7-3.4 2.7 6.8 1.7-3.4H18" />
    </>
  ),
}

/** 侧栏导航图标。未知 id 回退为一个中性圆点，避免"新增页面忘了配图标"时整项空掉。 */
export function NavIcon({ id }: { id: string }) {
  const node = NAV_ICONS[id]
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden {...STROKE}>
      {node ?? <circle cx="12" cy="12" r="4" />}
    </svg>
  )
}

/**
 * 顶部导航的领域图标：key = `nav.ts` 里 `DOMAINS` 的 id。
 * 知识库 = 摊开的书；Agent 测评 = 评审清单（与侧栏 `agenteval` 图标同形，强化"这就是那个域"）。
 */
export const DOMAIN_ICONS: Record<string, ReactNode> = {
  kb: (
    <>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </>
  ),
  eval: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
  /** 信号管理 = 脉冲波形（信号语义） */
  signal: (
    <>
      <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
    </>
  ),
  /** 观测 = 雷达扫描（扫描执行轨迹） */
  obs: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v2.4M20.5 12h-2.4" />
      <path d="M12 12l5.6-3.9" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
}

/** 领域图标（顶部导航）。与 `NavIcon` 同策略：未知 id 回退中性圆点。 */
export function DomainIcon({ id }: { id: string }) {
  const node = DOMAIN_ICONS[id]
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden {...STROKE}>
      {node ?? <circle cx="12" cy="12" r="4" />}
    </svg>
  )
}

/** 顶栏的「收起/展开侧栏」图标（左侧面板） */
export function IconPanelLeft() {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden {...STROKE}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
    </svg>
  )
}
