import type { ComponentType } from 'react'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Topnav } from './components/Topnav'
import { useApp } from './lib/app-context'
import { CorpusPage } from './pages/Corpus'
import { WorkbenchPage } from './pages/Workbench'
import { PublishPage } from './pages/Publish'
import { QualityPage } from './pages/Quality'
import { QualityCasesPage } from './pages/QualityCases'
import { QualityRunsPage } from './pages/QualityRuns'
import { RetrievalTestPage } from './pages/RetrievalTest'
import { GapsPage } from './pages/Gaps'
import { ConfigPage } from './pages/Config'
import { AgentEvalPage } from './pages/AgentEval'
import { AgentEvalCasesPage } from './pages/AgentEvalCases'
import { AgentEvalTasksPage } from './pages/AgentEvalTasks'
import { AgentEvalJudgesPage } from './pages/AgentEvalJudges'
import { SignalsPage } from './pages/Signals'
import { SignalsConfigPage } from './pages/SignalsConfig'
import { SignalsWordsPage } from './pages/SignalsWords'
import { SignalsPublishPage } from './pages/SignalsPublish'
import { SignalsHistoryPage } from './pages/SignalsHistory'
import { ObservabilityPage } from './pages/Observability'
import { PlaceholderPage } from './pages/Placeholder'

/**
 * 路由表 —— 与 `nav.ts` 的 NAV 一一对应。
 *
 * 注意：文档级页面**不再是并列页**，全部收敛进 `WorkbenchPage`（`page=source`）：
 *   · 解析与切片阶段的页签（预检/对照/清洗/切片/复核/元信息…）本就住在工作台里；
 *   · 「入库结果」也已并入（第 ⑦ 步「索引」产物）；
 *   · `detail`/`records`/`meta`/`review`/`indexresult` 这些旧 id 由 `app-context` 的
 *     `go()` / `parseUrl()` 翻译成 `page=source&tab=<id>`，所以这里不需要（也不应该）注册它们。
 */
const PAGES: Record<string, ComponentType> = {
  corpus: CorpusPage,
  source: WorkbenchPage,
  publish: PublishPage,
  quality: QualityPage,
  qualitycases: QualityCasesPage,
  qualityruns: QualityRunsPage,
  retrievaltest: RetrievalTestPage,
  gaps: GapsPage,
  config: ConfigPage,
  agenteval: AgentEvalPage,
  agentevalcases: AgentEvalCasesPage,
  agentevaltasks: AgentEvalTasksPage,
  agentevaljudges: AgentEvalJudgesPage,
  /** 旧 URL 兼容（C6 合并页）：指标与维度页已并入测评裁判 */
  agentevaldims: AgentEvalJudgesPage,
  signals: SignalsPage,
  signalsconfig: SignalsConfigPage,
  signalswords: SignalsWordsPage,
  signalspublish: SignalsPublishPage,
  signalshistory: SignalsHistoryPage,
  observability: ObservabilityPage,
}

function PageSwitch() {
  const { page } = useApp()
  const Page = PAGES[page]
  // key 绑定 page：切换页面时卸载旧页，避免上一页的异步状态串到下一页
  return <div key={page}>{Page ? <Page /> : <PlaceholderPage id={page} />}</div>
}

export default function App() {
  const { sidebarCollapsed } = useApp()
  return (
    // 外壳三层：顶部导航（品牌 + 领域切换，全宽）→ 主体两列（侧栏 + 右区）。
    // 收起态只切一个类：侧栏宽度由 CSS 变量在 `.app-collapsed` 里改写，
    // 组件不需要知道具体像素，也不需要在 JS 里做两套 DOM。
    <div className={`app ${sidebarCollapsed ? 'app-collapsed' : ''}`}>
      <Topnav />
      <div className="app-body">
        <Sidebar />
        <div className="main">
          <Topbar />
          <div className="content">
            <PageSwitch />
          </div>
        </div>
      </div>
    </div>
  )
}
