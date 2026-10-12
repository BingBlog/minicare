/**
 * 导航定义 —— 单一数据源（顶部导航、侧栏、页面元数据、工作台页签都由它生成）。
 *
 * **顶部导航 = 领域切换 + 平台级入口**（2026-10-09 新增；2026-10-11 补平台级）：
 *   · 平台外壳统称「敏宝管理平台」，域为 `kb`（知识库）/ `eval`（Agent 测评）/
 *     `signal`（信号管理）/ `obs`（观测）；
 *   · 顶条由 `DOMAINS` 渲染（品牌 + 域页签）；切域 → 落到该域 `defaultPage`；
 *   · **平台级页面**（`domain: 'platform'`，如「全局配置」）不属任何域 ——
 *     入口挂在顶栏**右侧**平台区（`Topnav`），不做成域页签；
 *   · 当前归属由页面 id 反推（`domainOfPage`，不存状态）—— 深链接直接进来也对得上。
 *
 * **侧栏 = 领域内的两级菜单**（2026-10-09 二次收敛，用户要求移除阶段分组标题）：
 *   · 只渲染**当前域**的一级项（`navFor(domain)`）；域归属标在一级项的 `domain` 上，
 *     二级随父项继承（`domainOfPage` 沿树解析）；
 *   · 一级 = 独立功能入口（可点击导航）；二级 = 附属于它的视图（`children`，缩进渲染）；
 *   · **不再有「① 语料入库」式的阶段分组** —— 那条旅程线的入口已全部收敛进
 *     文档下钻与功能菜单，阶段标签失去承载对象；层级改为表达**功能隶属**。
 *
 * **文档工作台**（`source`）是「文档管理」的**二级子导航**（2026-10-09 用户指定）：
 * 打开当前上下文文档的七步产物视图；没有「当前文档」时**默认打开第一份文档**（2026-10-09 用户要求，
 * 见 `Workbench.tsx` 的自动选中 effect），一份都没有时才落引导态。
 * 其内部再由工作台页签（`WORKBENCH_TABS`，含第 ⑦ 步「入库结果」）承载各步产物。
 * `hidden: true` 的项（如挂在 `source` 下的 `indexresult`）**不渲染**，只保留元数据：
 * Topbar 标题兜底、旧深链接翻译、以及"这个页面去哪了"的考古线索。
 *
 * ⚠️ 后端 `kb_pipeline/web/ui.py` 是**回退页**（React 为主实现），自带一份独立 NAV 与
 * 逐页渲染；本文件与它**仅在页面 id 命名上保持可对话**，不再强求结构一致。
 */

/** 领域（平台一级分区）：顶部导航按它切换，侧栏按它过滤。 */
export type DomainId = 'kb' | 'eval' | 'signal' | 'obs'

/**
 * 页面的归属层：四个领域之一，或**平台级**（`platform`）。
 *
 * `platform` 不是域 —— 不属于任何业务分区，顶栏不设页签，入口挂在顶栏**右侧**的平台区
 * （见 `Topnav`），侧栏只渲染平台级菜单。2026-10-11 用户要求：「全局配置」从知识库域
 * 移出、升为平台级（它是全平台的配置，不归知识库）。
 */
export type PageScope = DomainId | 'platform'

export interface Domain {
  id: DomainId
  label: string
  /** 点击域页签时的落地页（该域的默认入口） */
  defaultPage: string
  /** 域页签的悬停提示（一句话概括本域能做什么） */
  desc: string
}

/** 领域清单（顶部导航按此顺序渲染页签） */
export const DOMAINS: Domain[] = [
  {
    id: 'kb',
    label: '知识库',
    defaultPage: 'corpus',
    desc: '语料入库 · 检索质检 · 发布上线',
  },
  {
    id: 'eval',
    label: 'Agent 测评',
    defaultPage: 'agentevaltasks',
    desc: '用例 · 任务 · 报告 · 记录 · 裁判',
  },
  {
    id: 'signal',
    label: '信号管理',
    defaultPage: 'signals',
    desc: '信号台账 · 配置治理 · 发布审计',
  },
  {
    id: 'obs',
    label: '观测',
    defaultPage: 'observability',
    desc: '服务状态 · 数据同步 · 同步历史',
  },
]

export interface NavItem {
  id: string
  label: string
  /** 所属层级（**仅一级项标注**；二级/隐藏项随父项继承，见 `domainOfPage`）。`platform` = 平台级。 */
  domain?: PageScope
  impl: boolean
  phase: number
  story: string
  desc: string
  /** 不在侧栏渲染（文档级页面已收进工作台）。元数据仍供 Topbar / 深链接翻译 / 别名兜底消费。 */
  hidden?: boolean
  /** 二级菜单：附属于本功能的视图（缩进渲染在父项下方）。层级 = 功能隶属，不是流程顺序。 */
  children?: NavItem[]
}

/**
 * （2026-10-09 晚，用户要求「去说明化」第二批）**顶栏副标题全面停用** ——
 * 此前 `Topbar` 会把 `desc · story` 渲染成页面副标题（如「发布前 4 项检查… · US-10」），
 * 读起来像交互稿（功能清单 + 内部编号）。口径与「文档管理」（corpus）对齐后推广到
 * 余下全部页面（发布上线 / 检索质检及其子页 / 全局配置 / Agent 测评及其子页）：**全部导航项与
 * 工作台页签的 `desc` 一律置空**（字段保留，供未实现页面兜底与未来复用）；仅顶部两枚域页签的悬停提示保留。
 * · `Topbar`：`desc` 为空 → 副标题整行不渲染（只留标题），`story` 也不再拼出；
 * · `Sidebar`：悬停提示回退为纯标签（空值兜底见其注释）；
 * · `story` 单独保留：仅未实现页面（`impl: false`）的「计划于第 N 期（story）」提示消费。
 * ⚠️ 别再往 `desc` 里写功能说明 / 验收口径 —— 用户要的是产品，不是 PRD 投影。
 */
export const NAV: NavItem[] = [
  {
    id: 'corpus',
    label: '文档管理',
    domain: 'kb',
    impl: true,
    phase: 1,
    story: 'US-01 / US-02',
    // 刻意留空：顶栏副标题会渲染 `desc · story`，而这一段在页面上表现为
    // 「功能说明 + 内部故事编号」，读起来像交互稿。本页功能已足够自明
    // （KPI + 表格 + 行内操作），**不设副标题**；`story` 仅供未实现页面的
    // 「计划于第 N 期」提示使用。侧栏悬停提示见 Sidebar 的空值兜底。
    // （2026-10-09 晚：「去说明化」第二批已把同口径推广到其余全部页面，见 NAV 顶部注。）
    desc: '',
    children: [
      {
        id: 'source',
        label: '文档工作台',
        impl: true,
        phase: 1,
        story: 'US-14 / US-03~07',
        desc: '',
        // 「文档管理」的二级子导航（2026-10-09 用户指定）：打开当前上下文文档的工作台，
        // 没有「当前文档」时**默认打开第一份文档**（与列表同序）；从卡片点进来同样是此页（默认落对照页签）。
        children: [
          {
            id: 'indexresult',
            label: '入库结果',
            impl: true,
            phase: 5,
            story: 'US-09',
            desc: '',
            // 工作台第 ⑦ 步页签；`?page=indexresult` 由 `app-context` 翻译成 `page=source&tab=indexresult`。
            hidden: true,
          },
        ],
      },
      // （2026-10-09 删除）二级项「处理进度」（`progress`）已按用户要求移除 ——
      // 文档按篇处理（同步跑），跨文档队列页无实际使用场景；队列本体保留为 CLI
      // （`kb-pipeline run --enqueue` / `queue` / `drain`）。旧深链接 `?page=progress` 落默认页「文档管理」。
    ],
  },
  {
    id: 'publish',
    label: '发布上线',
    domain: 'kb',
    impl: true,
    phase: 4,
    story: 'US-10',
    desc: '',
    // （2026-10-09 删除）二级项「发布记录」（`publishlog`）已按用户要求移除 —— 发布留档与
    // 快照回滚由本页「快照」卡片承接；留档表（`kb_publish`）与 CLI `publish records` 保留。
    // 旧深链接 `?page=publishlog` 由 `PUBLISH_LOG_ALIAS` 翻译回本页（见下方别名区）。
  },
  {
    id: 'quality',
    label: '检索质检',
    domain: 'kb',
    impl: true,
    phase: 4,
    story: 'US-11 / PRD-011',
    desc: '',
    children: [
      {
        id: 'qualitycases',
        label: '用例集',
        impl: true,
        phase: 4,
        story: 'PRD-011',
        desc: '',
      },
      {
        id: 'qualityruns',
        label: '执行记录',
        impl: true,
        phase: 4,
        story: 'PRD-011',
        desc: '',
      },
      {
        id: 'retrievaltest',
        label: '检索测试',
        impl: true,
        phase: 4,
        story: 'US-11',
        desc: '',
      },
      {
        id: 'gaps',
        label: '知识缺口',
        impl: true,
        phase: 5,
        story: 'US-12',
        desc: '',
      },
    ],
  },
  /* （2026-10-09 删除）旧侧栏页 `contract`（智能体对接）—— 用户要求移除：
     知识库对接 Agent 的测评已由「Agent 测评」域覆盖，KB 侧不再单设此页。
     后端 `/api/contract` 系列端点与回退页（ui.py）同删；契约校验能力保留为
     CLI（`kb-pipeline contract show/validate/observe`，KB-CONTRACT.md 引用的即它）。
     `?page=contract` 不再翻译（落默认页「文档管理」）。 */
  /* Agent 测评域（2026-10-11 用户评审调整）：
     · 去掉一级「Agent 测评」入口（与顶部域页签重复）；
     · **测评任务 = 发起与执行的唯一入口**，其二级挂「测评报告」（原 Agent 测评页：只查看不发起）；
       「测评记录」已并入测评任务页（2026-10-11 二次评审，见 `EVAL_HISTORY_ALIAS`）；
     · 测评用例 / 测评裁判 保持一级。 */
  {
    id: 'agentevalcases',
    label: '测评用例',
    domain: 'eval',
    impl: true,
    phase: 1,
    story: 'TECH-021',
    desc: '',
    children: [
      {
        id: 'agentevaltraces',
        label: '线上沉淀',
        impl: true,
        phase: 1,
        story: 'PRD-015',
        desc: '',
      },
    ],
  },
  {
    id: 'agentevaltasks',
    label: '测评任务',
    domain: 'eval',
    impl: true,
    phase: 1,
    story: 'PRD-012',
    desc: '',
    children: [
      {
        id: 'agenteval',
        label: '测评报告',
        impl: true,
        phase: 1,
        story: 'PRD-010',
        desc: '',
      },
    ],
  },
  {
    id: 'agentevaljudges',
    label: '测评裁判',
    domain: 'eval',
    impl: true,
    phase: 1,
    story: 'TECH-026',
    desc: '',
  },
  /* 观测域（TECH-030，2026-10-11 用户拍板独立成域）：
     · 平台 = 观测服务控制面 —— 随平台启动自动拉起 Langfuse 栈，退出默认停容器（留数据卷）；
     · 单页三卡：服务状态（启停 + 打开 Langfuse）/ 数据同步（FlexDB → 本地）/ 同步历史；
     · 不做 trace 原生重渲染、不做 iframe 内嵌（PRD-010 D5「Langfuse 保持旁路」口径延续）。 */
  {
    id: 'observability',
    label: '观测总览',
    domain: 'obs',
    impl: true,
    phase: 1,
    story: 'TECH-030',
    desc: '',
  },
  /* 全局配置（2026-10-11 用户要求：从知识库域移出，升为**平台级**页面）：
     入口在顶栏**右侧**的平台区（`Topnav`，与域页签之间用分隔线隔开，不做成第五个域页签）；
     `domain: 'platform'` ⇒ 不属于任何域 —— 顶栏域页签全部不亮，侧栏只渲染平台级菜单。
     页面内部按 知识库 / Agent 测评 / 观测 / 平台 分类展示全部配置（见 `Config.tsx`）。 */
  {
    id: 'config',
    label: '全局配置',
    domain: 'platform',
    impl: true,
    phase: 1,
    story: 'TECH-015 S-10',
    desc: '',
  },
  {
    id: 'signals',
    label: '信号总览',
    domain: 'signal',
    impl: true,
    phase: 1,
    story: 'TECH-029 S4',
    desc: '',
  },
  {
    id: 'signalsconfig',
    label: '配置清单',
    domain: 'signal',
    impl: true,
    phase: 1,
    story: 'TECH-029 S4',
    desc: '',
  },
  {
    id: 'signalswords',
    label: '词表维护',
    domain: 'signal',
    impl: true,
    phase: 1,
    story: 'TECH-029 S5',
    desc: '',
  },
  {
    id: 'signalspublish',
    label: '变更发布',
    domain: 'signal',
    impl: true,
    phase: 1,
    story: 'TECH-029 S6',
    desc: '',
  },
  {
    id: 'signalshistory',
    label: '版本与审计',
    domain: 'signal',
    impl: true,
    phase: 1,
    story: 'TECH-029 S7',
    desc: '',
  },
]

/**
 * 按 id 找页面元数据 —— **递归遍历**两级树。
 *
 * `hidden` 项也在这棵树里（如 `source`/`indexresult` 挂在 `corpus` 下），
 * 供 Topbar 标题兜底、深链接翻译与别名兜底消费。
 */
export function pageMeta(id: string): NavItem | null {
  const walk = (items: NavItem[]): NavItem | null => {
    for (const it of items) {
      if (it.id === id) return it
      if (it.children) {
        const hit = walk(it.children)
        if (hit) return hit
      }
    }
    return null
  }
  return walk(NAV)
}

/* ── 归属层解析（顶部导航 + 侧栏的唯一口径）────────────────────────────
   平台外壳 =「敏宝管理平台」，内含域与平台级两种归属：
   · 域（`DOMAINS`）：知识库 / Agent 测评 / 信号管理 / 观测 —— 顶栏页签切换；
   · 平台级（`platform`）：不属任何域（当前仅「全局配置」）—— 顶栏右侧入口。
   域/层级归属只标在一级项上；二级/隐藏项沿树继承 —— 消费点两处：
   · `Topnav`：由当前页反推归属 → 高亮域页签或右侧平台入口；
   · `Sidebar`：只渲染当前归属的一级项与其二级视图。 */

/** 兜底领域：未知 id 与默认落地页（`DEFAULT_PAGE`）同域 */
export const DEFAULT_DOMAIN: DomainId = 'kb'

/**
 * 页面 id → 所属层（领域或 `platform`）。**递归沿树解析**：二级/隐藏项继承其一级父项的 `domain`
 * （如 `indexresult` → `source` → `corpus` → kb）。
 * 未知 id 回退 `DEFAULT_DOMAIN`，保证顶部导航永远有高亮项（域页签或平台入口）。
 */
export function domainOfPage(pageId: string): PageScope {
  const walk = (items: NavItem[], inherited: PageScope): PageScope | null => {
    for (const it of items) {
      const dom = it.domain ?? inherited
      if (it.id === pageId) return dom
      if (it.children) {
        const hit = walk(it.children, dom)
        if (hit) return hit
      }
    }
    return null
  }
  return walk(NAV, DEFAULT_DOMAIN) ?? DEFAULT_DOMAIN
}

/** 当前归属层的一级导航项（侧栏渲染它；域切换在顶部导航，不在侧栏）。 */
export function navFor(scope: PageScope): NavItem[] {
  return NAV.filter((it) => (it.domain ?? DEFAULT_DOMAIN) === scope)
}

/* ── 文档工作台（`source`）的内页签 ──────────────────────────────────────
   文档级页面全部收敛在这里（不在侧栏，从「文档管理」点选文档进入）：
   · 解析与切片阶段原本是 7 个并列的侧栏页；按用户要求收敛成「文档管理点进来即工作台」；
   · 「处理详情」与「处理记录」合并成一个弹框移到「文档管理」
     （见 `PROCESSING_MODAL_ID`），不再占工作台页签；
   · 「入库结果」（第 ⑦ 步「索引」产物）由侧栏并入（旧深链接 `?page=indexresult` 自动翻译）。 */

/** 圈码徽标：与步骤条上的序号一致（供工作台页签展示「第 N 步产物」） */
export const STEP_BADGE: Record<number, string> = { 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤', 6: '⑥', 7: '⑦' }

/**
 * 工作台页签。
 *
 * 排序与「第 N 步产物」徽标（`step`）严格对应七步流水线的顺序，让「步骤条上的第 N 步」
 * 和「页签上的第 N 步」一眼对得上；`step: null` 的页签属于辅助线（元信息），不标编号。
 * 命名与步骤名同根：步骤 `normalize`=「正文清洗」→ 页签「清洗对比」、
 * 步骤 `validate`=「解析高危敏感信息复核」→ 页签同名（见 labels.ts 的 STEP_LABEL）。
 *
 * 两个"找得到但不占号"的页签：⑥ 翻译的对照视图在「切片对照」内（不单设页签）；
 * ⑦ 索引 = 「入库结果」，由侧栏并入，排在 ⑤ 之后让带圈码的页签保持连号。
 *
 * 「元信息解析」与「信息确认」已**合并为一个页签「元信息解析与确认」**（2026-10-09 用户指定：
 * 机器解析的结果本来就以"候选值"形式回灌给人工表单，拆两页反而要多切一次）；
 * id 保留 `meta`，旧 id `metaextract` / 旧深链接由 app-context 翻译到本页。
 * ⚠️ 本页是**文档级子页面、只服务当前文档**：原「单文档 / 全库」切换与跨文档的
 * 「元信息总览 / 抽取覆盖率」视图已按用户要求**整体删除**（2026-10-09，含后端 `/api/metadata`）。
 *
 * 「处理记录」（`runlog`）是**元层记录**（每次执行的完整历史），不标号、排在辅助线之后；
 * 2026-10-09 从「处理详情」弹框拆出 —— 弹框只留"操作 + 人话摘要"，完整历史归工作台。
 * ⚠️ id 故意不叫 `records`：那个词被 `PROCESSING_ALIASES` 占用（旧深链接翻成处理弹框），撞名会被先拦截。
 *
 * （2026-10-09 晚「去说明化」第二批）各页签的 `desc` 已**全部置空**：顶栏副标题与页签行尾
 * 的说明小字不再出现；悬停提示只保留「第 N 步产物」这一结构信息。原文案曾是
 * 「左源 PDF（可滚动翻页）｜右 Markdown / JSON」一类的版式说明 —— 用户明确不要。
 */
export const WORKBENCH_TABS = [
  { id: 'preflight', label: '预检', step: 1, desc: '' },
  { id: 'compare', label: '解析结果对照', step: 2, desc: '' },
  { id: 'normalize', label: '清洗对比', step: 3, desc: '' },
  { id: 'chunks', label: '切片对照译文确认', step: 4, desc: '' },
  { id: 'excluded', label: '已屏蔽内容', step: 4, desc: '' },
  { id: 'numbers', label: '解析高危敏感信息复核', step: 5, desc: '' },
  { id: 'indexresult', label: '入库结果', step: 7, desc: '' },
  { id: 'meta', label: '元信息解析与确认', step: null, desc: '' },
  { id: 'runlog', label: '处理记录', step: null, desc: '' },
] as const

/**
 * 「切片校对」**已并入「切片对照」**：选中切片即出现操作面板
 * （标记问题 / 编辑 / 拆分 / 禁用 / 删除）。
 * 保留别名是为了让既有的 `go('review')` 与深链接 `?tab=review` 仍然落到正确位置。
 */
export const REVIEW_TAB_ALIAS = 'review'
export const REVIEW_TAB_TARGET = 'chunks'

/**
 * 「元信息解析」页签已并入「元信息解析与确认」（id `meta`，2026-10-09 用户指定合并）。
 * 保留别名，让既有的 `?tab=metaextract` / `?page=metaextract` 深链接仍然落到正确位置。
 */
export const META_EXTRACT_TAB_ALIAS = 'metaextract'
export const META_EXTRACT_TAB_TARGET = 'meta'

export type WorkbenchTabId = (typeof WORKBENCH_TABS)[number]['id']

/** 这些 id 不再出现在侧栏，但仍可作为工作台页签被路由到 */
export const WORKBENCH_TAB_IDS: ReadonlySet<string> = new Set(WORKBENCH_TABS.map((t) => t.id))

/** 承载工作台的路由 id */
export const WORKBENCH_PAGE = 'source'

/**
 * 工作台当前页签（非法 / 缺失时回退「解析结果对照」）。
 *
 * **Workbench 与 Topbar 共用这一份推导** —— 顶栏标题跟随页签后，两处必须同口径，
 * 否则会出现"顶栏说入库结果、内容却是对照"的错位。
 */
export function workbenchTabOf(tab: string | null | undefined): (typeof WORKBENCH_TABS)[number] {
  const hit = WORKBENCH_TABS.find((t) => t.id === tab)
  if (hit) return hit
  return WORKBENCH_TABS.find((t) => t.id === 'compare')!
}

/** 「处理详情」+「处理记录」合并后的弹框 id；挂在「文档管理」页上 */
export const PROCESSING_MODAL_ID = 'processing'

/** 「上传新文档」弹框 id；同样挂在「文档管理」页上（`?modal=upload`） */
export const UPLOAD_MODAL_ID = 'upload'

/**
 * 这两个旧页 id 现在都指向「文档管理」里的处理弹框。
 * 页面里既有的 `go('detail')`（"去处理详情跑七步"）因此无需改动即可跳到正确位置。
 */
export const PROCESSING_ALIASES: ReadonlySet<string> = new Set(['detail', 'records'])

/**
 * （2026-10-09 删除）「发布记录」（`publishlog`）独立页已移除 —— 发布留档与快照回滚由
 * 「发布上线」页承接（`Publish.tsx` 的「快照」卡片）。保留别名翻译：
 * 既有深链接 `?page=publishlog` 落回 `publish`，不静默掉到默认页。
 */
export const PUBLISH_LOG_ALIAS = 'publishlog'

/**
 * 「测评记录」页已并入「测评任务」（2026-10-11 二次评审：两页合并 + UI 优化）：
 * 记录表作为任务页的第二张卡片；旧深链接 `?page=agentevalhistory` 翻译回 `agentevaltasks`。
 */
export const EVAL_HISTORY_ALIAS = 'agentevalhistory'
export const EVAL_HISTORY_TARGET = 'agentevaltasks'

/* （2026-10-09 删除）旧侧栏页 `metadata`（元信息总览）曾并入工作台页签的全库视图；
   该视图及后端 `/api/metadata` 已按用户要求整体删除，`?page=metadata` 不再翻译（落默认页「文档管理」）。 */

export function isWorkbenchTab(id: string): boolean {
  return WORKBENCH_TAB_IDS.has(id)
}

export function isProcessingAlias(id: string): boolean {
  return PROCESSING_ALIASES.has(id)
}

/** 七步在列表里的短标签（全称见 labels.ts 的 STEP_LABEL） */
export const STEP_SHORT: Record<string, string> = {
  preflight: '预检',
  parse: '解析',
  normalize: '清洗',
  segment: '切块',
  validate: '复核',
  translate: '翻译',
  index: '索引',
}

export const DEFAULT_PAGE = 'corpus'

/** 顶栏带「刷新」按钮的页面（工作台内的刷新由工作台自己提供） */
export const RELOADABLE_PAGES = new Set([
  'corpus',
  'source',
  'publish',
  'quality',
  'gaps',
  'config',
  'agenteval',
  'agentevalcases',
  'agentevaltraces',
  'agentevaltasks',
  'agentevaljudges',
  'observability',
  'signals',
  'signalsconfig',
  'signalswords',
  'signalspublish',
  'signalshistory',
])
