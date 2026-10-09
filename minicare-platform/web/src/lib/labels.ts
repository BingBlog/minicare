/** 与后端 `ui.py` 的常量字典逐项对齐的展示标签。 */

export const STEP_ORDER = [
  'preflight',
  'parse',
  'normalize',
  'segment',
  'validate',
  'translate',
  'index',
] as const
export type StepId = (typeof STEP_ORDER)[number]

export const STEP_LABEL: Record<string, string> = {
  preflight: '预检',
  parse: '解析',
  normalize: '正文清洗',
  segment: '切块',
  validate: '解析高危敏感信息复核',
  translate: '翻译',
  index: '索引',
}

export const DOC_STATUS: Record<string, string> = {
  pending: '待处理',
  processing: '处理中',
  failed: '失败',
  ready: '已就绪待发布',
  stale: '待更新',
  /** 被新版本取代后的台账状态（`corpus/ledger.py` superseded 时写入） */
  archived: '已归档',
}

export const STEP_STATUS_CLS: Record<string, string> = {
  succeeded: 'ok',
  skipped_cached: 'plain',
  stale: 'warn',
  failed: 'danger',
  pending: 'plain',
}

export const STEP_STATUS_LABEL: Record<string, string> = {
  succeeded: '已完成',
  skipped_cached: '缓存命中',
  stale: '待重跑',
  failed: '失败',
  pending: '未执行',
  /** 仅运行期存在（来自 run_registry 的实时口径，不进产物状态） */
  running: '进行中',
}

export function docPillCls(s: string): string {
  if (s === 'ready') return 'ok'
  if (s === 'failed') return 'danger'
  if (s === 'stale') return 'warn'
  return 'plain'
}

/** 语料地区（与 `corpus/ledger.py` 的 `region` 取值域一致） */
export const REGION_LABEL: Record<string, string> = { cn: '国内', intl: '国际' }

/**
 * 证据级别 —— 取值域来自 `corpus/ledger.py` 的 `EVIDENCE_KEYWORDS`
 * （正文/文件名抽取只可能产出这几个值，界面下拉必须与之一致）。
 */
export const EVIDENCE_LABEL: Record<string, string> = {
  guideline: '指南',
  consensus: '共识',
  RCT: '随机对照研究',
  policy: '政策文件',
  edu: '科普 / 健康教育',
}

/** 登记时的地区下拉（顺序即界面顺序） */
export const REGION_OPTIONS: [string, string][] = [
  ['cn', REGION_LABEL.cn],
  ['intl', REGION_LABEL.intl],
]

/** 噪声块四类规则 + 人工（US-07） */
export const RULE_LABEL: Record<string, string> = {
  reference_list: '参考文献',
  empty_table: '空表',
  page_furniture: '页眉页脚残留',
  figure_no_caption: '纯图无题注',
  manual: '人工屏蔽',
}

/** 解析高危敏感信息复核四态（US-06），页面即同名页签（原「内容复核」，2026-10-09 改名） */
export const REVIEW_STATE: Record<string, string> = {
  pending: '待复核',
  accepted: '已采纳',
  edited: '已编辑',
  rejected: '误报',
  unresolvable: '无法补全',
}

/** 知识缺口归因（US-12；`ranked` 为 PRD-011 新增：内容在库、只是没排上来） */
export const ATTR_LABEL: Record<string, string> = {
  coverage_gap: '覆盖缺口',
  ranked: '排序问题',
  slice_excluded: '切片被屏蔽',
  gold_stale: 'gold 映射失效',
}

/** 知识缺口状态（`gaps.py` 的 `state`） */
export const GAP_STATE_LABEL: Record<string, string> = {
  open: '开放',
  closed: '已关闭',
  deferred: '暂不处理',
}

/** 检查项状态标记（US-10 / US-13） */
export const CHK_MARK: Record<string, string> = { pass: '✔', fail: '✘', not_executed: '·' }

/**
 * 「元信息解析与确认」表单字段（原「信息确认」，US-04）：[字段, 标签, 是否必填]
 *
 * ⚠️ 表单**可选**、不拦流程（早期曾是"暂停点 1"，闸门机制已移除）；
 * 但必填项（年份 / 地区 / 证据级别）机器未识别到时需**人工补充**，保存不拦、缺了卡发布前检查。
 * `required` **以 `corpus/ledger.py` 的 `REQUIRED_FIELDS` 为准**（PRD D-08）。
 * 后端 `/api/metadata` 会下发同一份字段表（含 `reaches_chunks`），两处改动要同步。
 */
export const META_FIELDS: [string, string, boolean][] = [
  ['source_name', '来源名称', false],
  ['publisher', '发布机构', false],
  ['year', '年份', true],
  ['region', '地区', true],
  ['evidence_level', '证据级别', true],
  ['applicable_age', '适用年龄', false],
  ['license', '许可证', false],
]

/** 元信息「生效来源」标签 —— 与后端 `/api/metadata` 的 `values[].from` 取值一一对应 */
export const META_FROM_LABEL: Record<string, string> = {
  ledger: '台账',
  doc_mapping: '代码映射表',
  scan_dir: '产物目录',
  missing: '缺失',
}

/**
 * 元信息表单的候选值来源标签 —— 与后端 `meta_get` 的 `candidates[].from` 对应。
 * `common` 是前端本地补充的常用候选（如许可证）。
 */
export const META_CAND_FROM_LABEL: Record<string, string> = {
  doc_mapping: '映射表',
  prefill: '预填',
  llm: 'LLM',
  ledger: '台账',
  common: '常用',
}

/**
 * 元信息表单的字段来源标注（台账 `field_source[].origin` → 中文）。
 * PRD US-04 口径：文件名规则 / 正文抽取 / 目录推断 / 人工；未知值原样显示。
 */
export const META_ORIGIN_LABEL: Record<string, string> = {
  filename_rule: '文件名规则',
  body_extract: '正文抽取',
  dir_infer: '目录推断',
  scan_dir: '目录推断',
  manual: '人工',
}

/**
 * 「许可证」常用候选（字段本身非枚举，仅作为可选项，仍可自由输入）。
 * PRD US-04 线框图中该字段就是「选择」型。
 */
export const LICENSE_COMMON: string[] = [
  '© 保留所有权利',
  'CC BY 4.0',
  'CC BY-NC 4.0',
  'CC BY-NC-ND 4.0',
  '公共领域 / 可自由使用',
]

/* ── 预检 / 入库结果（US-09 / US-13）────────────────────────────── */

/** 解析档位推荐（`steps/preflight.py`）：standard=常规线路，unknown=待定 */
export const TIER_LABEL: Record<string, string> = {
  standard: '标准档',
  unknown: '待定',
}

/** 入库「检索状态」三态（`steps/index.py` 的 `retrieval_status`） */
export const RETRIEVAL_STATUS_LABEL: Record<string, string> = {
  enabled: '纳入检索',
  review: '待复核',
  excluded: '已屏蔽',
}

/** 入库模式（`steps/index.py`）：dry_run 只演练不写库 */
export const INDEX_MODE_LABEL: Record<string, string> = {
  dry_run: '试运行（不写库）',
  write: '正式写入',
}

/** 关键词来源（`steps/validate.py` 的 `dominant_source`） */
export const KEYWORD_SOURCE_LABEL: Record<string, string> = {
  llm: '模型抽取',
  rule: '规则抽取',
}

/* ── 解析对照（US-14）────────────────────────────────────────────── */

/**
 * MinerU content_list 的块类型标签。
 * ⚠️ 类型集合**不固定**（不同文档/引擎档位会多出 `aside_text`、`equation` 等），
 * 因此这里只是"已知类型的友好名"，未知类型由 `blockTypeLabel()` 原样回退显示。
 */
export const BLOCK_TYPE_LABEL: Record<string, string> = {
  text: '正文',
  list: '列表',
  table: '表格',
  image: '图片',
  equation: '公式',
  aside_text: '侧边文本',
  table_title: '表题',
  figure_title: '图题',
  header: '页眉',
  footer: '页脚',
  page_number: '页码',
  page_footnote: '脚注',
}

/**
 * 「版式噪声」类块 —— 与平台的噪声治理规则（US-07 的 page_furniture）对应。
 * 对照页默认**照实显示**（忠实反映解析结果），但支持一键隐藏，便于聚焦正文。
 *
 * 注：`aside_text`（侧边/页边文字）**不列入**噪声 —— 它可能承载真实内容
 * （如脚注、旁注），误隐藏比多显示代价更大。
 */
export const FURNITURE_TYPES = new Set(['header', 'footer', 'page_number', 'page_footnote'])

export function blockTypeLabel(t: string): string {
  return BLOCK_TYPE_LABEL[t] || t
}

/* ── 切片类型（切块步骤产物，与上方解析块类型是两套值域）───────────── */

/**
 * 切片类型（`chunking/llama.py` 的 `chunk_type`）：section=普通正文段、table=整表块。
 * ⚠️ 与 `BLOCK_TYPE_LABEL`（MinerU content_list 的解析块类型）**不同源**，勿混用。
 */
export const CHUNK_TYPE_LABEL: Record<string, string> = {
  section: '正文',
  table: '表格',
}

export function chunkTypeLabel(t: string): string {
  return CHUNK_TYPE_LABEL[t] || t
}
