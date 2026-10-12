/**
 * API 响应类型 —— 与后端 `web/api.py` + `web/routers.py` 的返回结构对齐。
 *
 * 后端不做全局响应包装（原始 dict），字段名即这里定义的键。
 * 未在页面上消费的深层字段用 `unknown` / `Record<string, unknown>` 占位，
 * 避免凭空发明字段——需要时按实际返回补。
 */

/** 单个步骤在 manifest.steps 下的记录 */
export interface StepRunEntry {
  status?: string
  current_run?: string
  runs?: StepRun[]
}

export interface StepRun {
  run_id: string
  status?: string
  duration_ms?: number | null
  artifact_hash?: string
  stats?: Record<string, unknown>
  params?: Record<string, unknown>
  finished_at?: string
  started_at?: string
  /** 执行引擎（mineru / self-chunker / rules / tokenhub …）——"这步是谁干的" */
  engine?: string
  engine_version?: string
  /** 失败原因（manifest 原样）。⚠️ 与 `warnings` 都是"人话信息"，界面必须优先露出 */
  error?: string
  /** 执行中的警告（如"已屏蔽 1 块不参与检索：reference_list×1"、"dry_run：未写库"） */
  warnings?: string[]
}

/** 单步「当前 run」的明细（来自 manifest 的 runs[current_run]） */
export interface StepDetail {
  status: string
  duration_ms?: number | null
  run_id?: string
  artifact_hash?: string
  stats?: Record<string, unknown>
  finished_at?: string
  engine?: string
  /** 该步骤累计执行过几次（含历史 run） */
  runs?: number
}

export interface DocStatus {
  doc_id: string
  region: string
  status: string
  steps: Record<string, string>
  /** 七步明细：耗时 / 产物指纹 / 统计。缺失时前端只显示状态 */
  steps_detail?: Record<string, StepDetail>
  /**
   * 是否已有 MinerU 产物目录。`false` = 刚上传登记、还没解析，
   * 列表里要明确标出来，否则用户会以为"上传的文件丢了"。
   */
  has_products?: boolean
  /** 是否已登记进 `kb_corpus` 台账 */
  registered?: boolean
  /**
   * 是否有源 PDF。`false` = HTML 下载页来源 → 卡片显示占位样式而不是首页缩略图
   * （否则会发一次注定 404 的 `/page/0.png` 请求）。
   */
  has_pdf?: boolean
  /**
   * 运行中摘要（无运行时为 `null` / 缺省）：页面刷新后据此恢复进度显示 +
   * 自动接回轮询（见 app-context 的 `trackRun`）。
   */
  running?: RunProgress | null
}

/**
 * 单文档的运行进度 —— `GET /api/docs/{id}/run-progress` 与
 * `/api/overview` 的 `running` 摘要同源（后端 `run_registry`）。
 *
 * 生命周期：`running: true`（运行中）→ `running: false + finished`（完成后 30s
 * 保留窗口，供前端最后一次轮询收尾）→ 无记录（`{running: false}` 不带 `mode`）。
 */
export interface RunProgress {
  doc_id: string
  running: boolean
  /** 无运行记录时整组字段缺席（只返回 `{doc_id, running:false}`） */
  mode?: 'pipeline' | 'step'
  step_id?: string | null
  step_label?: string | null
  /** 当前步骤在七步中的序号（1-based）；尚未进入任何步骤时为 0 */
  step_index?: number
  total_steps?: number
  /** 本次运行总耗时 */
  elapsed_ms?: number
  /** 当前步骤已耗时（步骤间隙为 null） */
  step_elapsed_ms?: number | null
  /**
   * 步骤内部的子进度文本（如「关键词抽取 45/120」「MinerU 云端解析（已解析 32/80 页）…」）。
   * 分钟级长步骤（解析 / 解析高危敏感信息复核）内部推进的可见性靠它，null = 该步骤未上报子进度。
   */
  substep?: string | null
  /** 本次运行中已完成的步骤（sid → succeeded/skipped_cached/failed），实时着色用 */
  done?: Record<string, string>
  /** `true` = 保留窗口内的"刚跑完"快照 */
  finished?: boolean
  error?: string | null
}

/** 列表页卡片的批量原文摘要（`/api/corpus/excerpts`） */
export interface ExcerptsGet {
  /** doc_id → 摘要；`null` = 抽不出像样的（前置件是版权/作者名单，或还没解析） */
  excerpts: Record<string, string | null>
  /** 每条的截断字数上限 */
  limit: number
  count: number
}

export interface ConfigGroup {
  group: string
  source: string
  rows: { key: string; value: unknown }[]
}

/* ── 全局配置（`/api/config/*`，「全局配置」页）────────────────────────── */

/** 单个管线条数配置项（一行明细） */
export interface ConfigField {
  key: string
  /** 中文标签（后端 FIELD_META；缺省兜底为原始 key） */
  label: string
  desc: string
  /** 高危操作警示（保存前会弹确认） */
  warn?: string | null
  /** 编辑控件形态：scalar = 单值控件；list = 每行一项；dict = JSON 文本 */
  kind: 'scalar' | 'list' | 'dict'
  /** 标量细类（决定 input 的 type / step） */
  type: 'bool' | 'int' | 'float' | 'str' | 'path' | 'list' | 'dict'
  /** 生效值（Path 已转字符串） */
  value: unknown
  /** 代码默认值 */
  default: unknown
  /** 是否显式写入 pipeline.yaml（false = 走代码默认） */
  in_yaml: boolean
  source: string
  /** 与代码默认值不同（Path 已解析后比较） */
  customized: boolean
  editable: boolean
}

export interface ConfigGroupDetail {
  id: string
  label: string
  /** 平台域归属（kb / eval / signal / obs / platform）—— 配置页左导航按它分列；旧后端可能缺省（按 kb 处理） */
  domain?: string
  note: string
  fields: ConfigField[]
}

/** `.env` 中的一项（密钥与环境变量） */
export interface ConfigEnvItem {
  key: string
  label: string
  /** 平台域归属（同 ConfigGroupDetail.domain）——观测 9 项与知识库密钥据此分列 */
  domain?: string
  desc: string
  warn?: string | null
  /** 密钥：值掩码显示、不回传明文 */
  secret: boolean
  configured: boolean
  source: 'environment' | 'env-file' | 'unset' | string
  in_file: boolean
  /** 与内置默认（目前仅两个路径项有）不同 */
  overridden: boolean
  editable: boolean
  default?: string
  value: string | null
  masked?: string
}

export interface ConfigDetail {
  config_file: string
  env_file: string
  yaml_loaded: boolean
  groups: ConfigGroupDetail[]
  env: { path: string; exists: boolean; items: ConfigEnvItem[]; configured: number; total: number }
  stats: { fields: number; customized: number; from_yaml: number; env_items: number }
}

export interface ConfigSaveResult {
  ok: boolean
  count: number
  applied: { yaml: string[]; env: string[] }
  backups: string[]
  yaml_loaded: boolean
  detail: ConfigDetail
}

export interface ConfigRaw {
  name: string
  path: string
  exists: boolean
  lines: number
  text: string
}

/** 七步的定义（`/api/overview` 的 `steps[]`） */
export interface OverviewStep {
  step_id: string
  label: string
  requires: string[]
}

export interface Overview {
  pipeline_version: string
  platform_version: string
  yaml_loaded: boolean
  allow_write: boolean
  docs: DocStatus[]
  steps: OverviewStep[]
  config_groups: ConfigGroup[]
}

/** 一次运行"为什么没跑完"的结构化答案（`run_pipeline` 返回的 `blocked`） */
export interface RunBlocked {
  /** error = 某步执行失败（早期的 gate 已随闸门机制移除） */
  kind: 'error'
  step_id: string
  step_label: string
  advice: string
  message: string
}

export interface RunResult {
  status: string
  steps: { step_id: string; status: string; duration_ms?: number; error?: string }[]
  blocked: RunBlocked | null
}

/** 单步重跑的结果 */
export interface StepRunResultDto {
  step_id: string
  status: string
  duration_ms?: number
  error?: string
}

export interface DocDetail {
  doc_id: string
  region: string
  status: string
  manifest: {
    steps?: Record<string, StepRunEntry>
    [k: string]: unknown
  }
}

/* ── 元信息（解析与确认）/ 切片校对 / 解析高危敏感信息复核 ─────────── */

export interface FieldSource {
  origin?: string
  evidence?: string
}

/** 「信息确认」单字段的候选值（可选项）—— `from` 标注来源，点击即填入 */
export interface MetaCandidate {
  value: string
  /** doc_mapping 映射表 / prefill 预填 / llm 抽取 / ledger 台账 / common 常用 */
  from: string
}

export interface MetaGet {
  doc_id: string
  ready: boolean
  row: Record<string, unknown> | null
  suggestion: Record<string, unknown>
  field_source: Record<string, FieldSource>
  /** 逐字段候选值（后端按文档实际情况汇总：映射表 / 预填 / LLM / 台账，可为空） */
  candidates?: Record<string, MetaCandidate[]>
  missing_required: string[]
  state: DocState | null
  derived_status: string
}

/** `kb_doc_state` 行：目前只存「信息确认」表单的人工取值（`meta_json`） */
export interface DocState {
  region?: string
  meta_json?: string | null
  [k: string]: unknown
}

export interface Chunk {
  kb_id: string
  title?: string
  content?: string
  header_path?: string
  page_idx?: number | null
  chunk_type?: string
  review?: boolean
  excluded?: boolean
  disabled?: boolean
  edited?: boolean
  exclude_rule?: string
  exclude_reason?: string
  exclude_by?: string
}

export interface ChunksGet {
  doc_id: string
  ready: boolean
  reason?: string
  chunks: Chunk[]
  edit_stats?: { edited?: number; disabled?: number; [k: string]: unknown }
  edits?: unknown[]
  recoverable?: { candidate_kb_id: string; similarity: number }[]
  state?: DocState | null
  derived_status?: string
  excluded_summary?: Record<string, number>
}

export interface ExcludedRow {
  kb_id: string
  title: string
  header_path?: string
  page_idx?: number | null
  rule?: string | null
  reason?: string | null
  by?: string | null
  chars: number
  chunk_type?: string
}

export interface ExcludedGet {
  doc_id: string
  ready: boolean
  excluded: ExcludedRow[]
  restored: ExcludedRow[]
  summary: Record<string, number>
  overrides: { restore: string[]; exclude: string[] }
}

export interface ReviewItem {
  kb_id: string
  title?: string
  page_idx?: number | null
  patterns?: string[]
  reason?: string
  candidates?: string[]
  resolution?: { state?: string; value?: string; rule?: string }
}

export interface ReviewsGet {
  doc_id: string
  ready: boolean
  reason?: string
  items: ReviewItem[]
  pending?: unknown[]
  rule_exceptions?: unknown[]
}

/* ── 入库结果 / 质检 / 缺口 / 契约 / 发布 ───────────────────────── */

export interface IndexResult {
  doc_id: string
  ready: boolean
  reason?: string
  mode?: string
  counts?: Record<string, number>
  embedding?: { model?: string; dim?: number; available?: boolean }
  keyword_source?: string
  target?: { db_name?: string }
  plan?: {
    kb_id: string
    title?: string
    retrieval_status?: string
    content_chars?: number
    keywords?: string
  }[]
  warnings?: string[]
}

export interface QualityState {
  cases: number
  gold_pairs: number
  gold_version: string
  baseline: QualityBaseline | null
  thresholds: { recall_min: number; harmful_max: number }
}

export interface QualityBaseline {
  k: number
  recall_at_k: number
  harmful_rate: number
  recorded_at?: string
}

export interface QualityRunResult {
  status: string
  message?: string
  broken_cases?: string[]
  passed?: boolean
  metrics?: { k: number; recall_at_k: number; harmful_rate: number }
  delta?: { recall_at_k: number }
  misses?: { case_id: string; question: string; expected?: string[] }[]
}

/** 检索测试的单条召回（与后端 `retrieval.retrieve()` 输出对应） */
export interface QualitySearchItem {
  id: string
  kb_id: string
  title: string
  category: string
  content: string
  content_truncated?: boolean
  source: string
  risk_level: string
  /** 全文相关度（FULLTEXT MATCH 得分）或向量余弦 —— 取先入融合的那条路 */
  score: number
  /** RRF 融合分（排序依据，k=60） */
  rrf: number
  /** 该条目在全文/向量各路的名次与分数（仅检索测试端点返回） */
  routes?: {
    fts?: { rank: number; score: number }
    vec?: { rank: number; score: number }
  }
}

export interface QualitySearchResponse {
  ok: boolean
  query: string
  k: number
  count: number
  /** 服务端检索耗时（毫秒）——全文路 + 向量路 + 融合的总时间 */
  elapsed_ms: number
  /** 向量路是否真的跑了；false 时看 fusion.mode（参数选择）与 vector_degraded（降级原因） */
  vector_used: boolean
  /** 向量路未参与的原因（缺 Key / 调用失败），仅"尝试过但失败"时存在 */
  vector_degraded?: string
  fts_count: number
  vec_count: number
  /**
   * 本次融合口径（实验参数回显）：
   * 综合得分 = coeff_fts × 1/(60+全文名次) + coeff_vec × 1/(60+向量名次)。
   * 默认 coeff 1.0/1.0 = 线上等权口径；仅「检索测试」页会传出别的值。
   */
  fusion?: {
    mode: string
    keyword_weight: number | null
    coeff_fts: number
    coeff_vec: number
  }
  results: QualitySearchItem[]
}

export interface GapRow {
  gap_id: string
  theme: string
  attribution: string
  occurrences: number
  evidence?: string
  state: string
}

export interface GapsGet {
  items: GapRow[]
  stats: { open?: number; closed?: number; deferred?: number }
  online_misses: { count: number; query: string }[]
}

export interface CheckItem {
  /** 检查项标识（发布前检查由后端给出；前端据此选「操作指引」模板） */
  key?: string
  status: string
  label: string
  detail: string
  /**
   * 出问题的文档清单（已截断到后端上限）；`docs_total` = 问题文档总数。
   * 发布前检查专用 —— 界面据此生成「去哪修」的跳转；详情文案不受影响。
   */
  docs?: string[]
  docs_total?: number
}

export interface Snapshot {
  name: string
  created_at: string
  chunks: number
}

export interface PublishRecord {
  published_at: string
  target_env: string
  snapshot_name: string
  chunks_written: number
  vectors_written: number
  verify_result?: string
  rolled_back_at?: string | null
}

export interface PublishState {
  snapshots: Snapshot[]
  records: PublishRecord[]
}

export interface PublishChecks {
  doc_ids: string[]
  checks: CheckItem[]
}

/** 发布计划里的一条「暂不可发布」原因（后端 `/api/publish/plan`） */
export interface PlanReason {
  code: string
  label: string
  /** 修复入口：工作台页签 id（meta/numbers）或页面 id（corpus）；缺省则只说明、不给按钮 */
  page?: string
}

/** 发布计划里的单份文档：可发布组带 `chunks`；暂不可发布组带 `reasons` */
export interface PlanDoc {
  doc_id: string
  region: string
  status: string
  chunks?: number
  reasons?: PlanReason[]
}

/**
 * 发布计划（`POST /api/publish/plan`）—— 发布页的唯一数据源。
 *
 * 语义（2026-10-09）：页面**只把 `ready` 组当作发布范围**；`blocked` 组逐份说明
 * 为什么还不能发（附修复入口），不拦截发布。`checks` 只对 `ready` 组计算。
 */
export interface PublishPlan {
  ready: PlanDoc[]
  blocked: PlanDoc[]
  checks: CheckItem[]
  counts: { ready: number; blocked: number; ready_chunks: number }
  target?: { db_name?: string }
}

export interface PublishRunResult {
  ok: boolean
  blockers?: CheckItem[]
  snapshot?: { name?: string }
  message?: string
}

/* ── 清洗对比（「清洗对比」页）────────────────────────────────────── */

/** 字符级差段：`m=1` = 该段被清洗掉（before）/ 清洗新增（after）；相邻同类段已合并 */
export interface DiffPart {
  t: string
  m: 0 | 1
}

/** 逐行对照的一行；`blank` 是被压缩掉的连续空行（聚合为计数，不逐行刷屏） */
export type NormalizeDiffLine =
  | { type: 'keep'; src: number; text: string }
  | {
      type: 'changed'
      src: number
      before: string
      after: string
      kind: string
      /** 行内差段（normalize@v4 新增；仅"修改"行有） */
      before_parts?: DiffPart[]
      after_parts?: DiffPart[]
      /** 所属 content_list 块下标（源文档定位用；HTML 来源或映射缺失时无此字段） */
      block_i?: number
      /** 被删字符在源 PDF 上的精确小框（文字层词级定位；定位不到时无） */
      del_boxes?: DelBox[]
    }
  | { type: 'removed'; src: number; text: string; block_i?: number; del_boxes?: DelBox[] }
  | { type: 'blank'; count: number }

/** 被删字符在 PDF 页面上的定位框（0~1000 归一化坐标，与 blocks[].bbox 同口径） */
export interface DelBox {
  page_idx: number
  bbox: number[]
  /** 被删段原文（tooltip 用） */
  text: string
}

export interface NormalizeDiffGet {
  doc_id: string
  ready: boolean
  reason?: string
  /** 原始 md 字符数 */
  raw_chars?: number
  /** 清洗后 md 字符数 */
  md_chars?: number
  raw_lines?: number
  out_lines?: number
  heading_count?: number
  stats?: {
    keep: number
    changed: number
    removed: number
    blank_compressed: number
    /** changed 里属于标题层级修复的行数 */
    headings: number
    /* ── 字级口径（normalize@v4）── */
    /** 被清洗掉的字符数 / 新增字符数（仅统计"修改"行行内） */
    del_chars?: number
    ins_chars?: number
    /** 删除段分类计数：引用上标 / 公式残渣 / 纯空白 / 其他 */
    del_sup?: number
    del_formula?: number
    del_space?: number
    del_other?: number
    /** 新增段分类计数：图注补齐 / 标题井号 / 其他 */
    ins_alt?: number
    ins_heading?: number
    ins_other?: number
  }
  /** 按原始 md 行序排列 */
  lines?: NormalizeDiffLine[]
}

/* ── 切块产物（「切片对照」页）────────────────────────────────────── */

export interface SegmentChunk {
  kb_id: string
  title: string
  header_path: string
  /** section / table / … */
  chunk_type: string
  content: string
  chars: number
  page_idx: number | null
  /** 源行号区间（指向归一化 md 的行）；null = 该产物没记行号，只能按页码定位 */
  line_start: number | null
  line_end: number | null
  risk_level?: string | null
  keywords?: string | null
  excluded: boolean
  exclude_rule?: string | null
  exclude_by?: string | null
  review: boolean
  review_reason?: string | null
  edited: boolean
  disabled: boolean
  retrieval_status?: string | null
  /**
   * 该切片覆盖的 content_list 块下标；空数组 = 未对齐（按 page_idx 兜底）。
   *
   * 也包含**续排区域**：MinerU 对跨栏/跨页段落只给一栏的 bbox、其余落点记成"空文本块"
   * （没有 md 片段，文本对齐挂不上），这些落点由后端用 PDF 文字层核对该位置印的确实是
   * 本切片的字之后并进来。所以它们与文本对齐上的块**同等**高亮，不用另外区分样式。
   */
  block_is: number[]
  /**
   * 人工「错误标记」（标注，不改变内容、**也不影响检索**）。
   * 要真正排除该切片，标完之后还得用「禁用 / 删除」。
   */
  mark?: { reason: string; note: string; at: string } | null
}

export interface SegmentsGet {
  doc_id: string
  ready: boolean
  reason?: string
  /** 是否做到了块级精确对齐（三个前提缺一即 false，原因见 note） */
  aligned?: boolean
  note?: string
  stats?: {
    chunks: number
    aligned: number
    aligned_pct: number
    by_type: Record<string, number>
    excluded: number
    review: number
    disabled: number
    edited: number
    /** 打了错误标记的切片数 */
    marked: number
    /** 并入高亮的**续排区域**块数（跨栏/跨页段落落在别处的视觉区域） */
    merged_regions: number
    /** 因 `doc_id` 不属于本文档而被剔除的切片数（正常恒为 0） */
    foreign_dropped: number
    total_chars: number
    block_count: number
  }
  /**
   * 图片地址前缀：切片正文里的图片是 md 的相对路径（`images/<sha>.jpg`），
   * 渲染前用它改写成后端可服务的绝对地址（见 `md-render.rewriteImagePaths`）。
   */
  img_url_base?: string
  /** 「错误标记」的预设原因取值域（由后端给出，前端不自己写死） */
  mark_reasons?: string[]
  /** 按原因统计的标记数（后续改切块规则的依据） */
  marks_summary?: Record<string, number>
  warnings?: string[]
  chunks?: SegmentChunk[]
}

/* ── 翻译对照（TECH-019，「切片对照」页的译文数据源）────────────────── */

export type TranslationStatus =
  | 'translated'
  | 'skipped_zh'
  | 'skipped_excluded'
  | 'skipped_disabled'
  | 'failed'

export interface TranslationItem {
  status: TranslationStatus
  lang?: string
  zh?: string | null
  title_zh?: string | null
  /** mt=AI 翻译；reviewed=人工修正（覆盖层） */
  quality?: 'mt' | 'reviewed'
  /** 译文的 src_hash 与当前块不一致（正文已更新）→ 提示重翻/重校 */
  stale?: boolean
  glossary_hit?: string[]
  error?: string
}

export interface TranslationGet {
  doc_id: string
  ready: boolean
  reason?: string
  stats?: {
    model?: string
    prompt_version?: string
    glossary_version?: string
    counts?: Record<string, number>
    tokens?: { in: number; out: number }
  }
  /** 人工修正覆盖层条目数 */
  overlay_count?: number
  items: Record<string, TranslationItem>
  warnings?: string[]
}

/* ── 预检（「解析详情 → 预检」页签）────────────────────────────── */

/** 一条检查项：预检到底查了什么、结果如何 */
export interface PreflightCheck {
  id: string
  label: string
  /** pass / warn / fail / info */
  status: string
  detail: string
}

/** 逐页文字层统计（现场重算，与预检步骤同一实现） */
export interface PreflightPage {
  i: number
  chars: number
  /** 低于 `min_text_chars_per_page` → 判为扫描页 */
  scanned: boolean
}

export interface PreflightGet {
  doc_id: string
  ready: boolean
  reason?: string
  thresholds?: {
    min_text_chars_per_page: number
    scan_page_ratio_for_ocr: number
  }
  checks?: PreflightCheck[]
  pages?: PreflightPage[]
  pages_error?: string
  /** 步骤实际存下的原始产物（供核对） */
  artifact?: Record<string, unknown>
}

/* ── 元信息 LLM 抽取（工作台页签「元信息解析与确认」）────────────────── */

/** 语料级共享 schema 的一个字段 */
export interface MetaSchemaField {
  key: string
  label: string
  /** string | number | array | enum */
  type: string
  desc: string
  required: boolean
  values: string[]
  hint: string
  /** 是否与台账字段同名（同名才能和「信息确认」逐字段对照） */
  base: boolean
}

export interface MetaSchema {
  version: string
  /** llm = 由 LLM 归纳；builtin = 代码内置默认（LLM 不可用时的降级） */
  source: string
  created_at: string
  model: string
  sample_docs: string[]
  note: string
  fields: MetaSchemaField[]
}

export interface LlmStatus {
  available: boolean
  model: string
  base_url: string
  /** 需要设置的环境变量名（未配置时界面直接告诉用户填哪个） */
  env_var: string
}

/** 单个字段的抽取结果 */
export interface MetaExtractValue {
  value: string | number | string[] | null
  /** 原文片段（≤60 字，逐字引用） */
  evidence: string
  confidence: number
  /** llm | rule */
  source?: string
}

export interface MetaExtractResult {
  doc_id: string
  /** llm / rule —— 本次结果来自哪条路径，界面必须如实显示 */
  source: string
  extracted_at: string
  schema_version?: string
  model?: string
  /** 实际喂给模型的摘要体量（长文档会截断，这个必须显示出来） */
  brief?: { chars: number; headings: number; truncated: boolean; max_chars: number }
  stats?: Record<string, unknown>
  values: Record<string, MetaExtractValue>
}

export interface MetaExtractGet {
  doc_id: string
  schema: MetaSchema
  llm: LlmStatus
  thresholds?: { llm_brief_chars: number }
  /** 还没抽过时为 null */
  result: MetaExtractResult | null
  has_normalized: boolean
  region?: string
}

export interface Health {
  ok: boolean
  pipeline_version: string
  platform_version: string
  yaml_loaded: boolean
  config_file: string
  allow_write: boolean
}

/* ── 解析对照（US-14）────────────────────────────────────────────── */

/** MinerU content_list 的一个块 */
export interface ParsedBlock {
  i: number
  type: string
  /** 0 基页码（MinerU 原生口径）；无 content_list 时为 null */
  page_idx: number | null
  /** 页面坐标系内的 [x1, y1, x2, y2] */
  bbox: number[] | null
  /**
   * 该块**除 bbox 之外**的落点（MinerU 的 `bbox` 有时只覆盖块的一部分）。
   *
   * · `list` 块（参考文献）：**每条一个**矩形 —— MinerU 内部本来就是每条一个块，
   *   合成 `list` 时 bbox 只留了第一条（对照源码 `content_list/common.py: unit_bbox`）；
   * · 跨栏 / 跨页的段落：补出其余栏、其余页的落点。
   *
   * 由后端用 PDF 文字层还原（字在哪儿框在哪儿）；定位不到就不下发，前端按原 bbox 画。
   */
  regions?: { page_idx: number; bbox: number[]; item?: number }[]
  text: string
}

export interface ParsedDoc {
  doc_id: string
  ready: boolean
  source_name?: string
  title?: string
  region?: string
  /** pdf = 有源 PDF 可栅格化；html = 下载页来源，按纯文本对照 */
  kind: 'pdf' | 'html'
  has_pdf: boolean
  has_content_list: boolean
  page_count: number
  md_chars: number
  stats: { blocks: number; by_type: Record<string, number>; pages: number }
  blocks: ParsedBlock[]
  source_url: string
  md_url: string
  /** Markdown 在首个块之前的前导内容（一般是文档标题行） */
  md_preamble: string
  /** 按块切好的 Markdown 片段（顺序即正文顺序）；页眉/页脚/页码类块**没有**片段 */
  md_chunks: MdChunk[]
  /**
   * **无块对齐**时的整份 Markdown（已改写图片路径），供右栏直接展示（不做联动高亮）。
   * 典型场景：HTML 下载页来源没有 content_list。**有块对齐时为 ''**（避免重复下发全文）。
   */
  md_full: string
  /** 成功对齐到 md 的块数 */
  md_aligned: number
  /**
   * **续排区域**：`{"空块 i": 所属块 i}`。
   *
   * MinerU 对**跨栏 / 跨页段落**只给一个落点的 bbox，其余落点记成**空文本块**
   * （`text` 为空、因此没有 md 片段，见 `md_chunks`）。后端用 PDF 文字层核对了
   * "那个位置上印的确实是这一段的字"，才把它记进来。
   *
   * 界面要把它们当成**所属块的一部分**：点它应当跳到那个块的 md 片段，而不是说
   * "该块不在 Markdown 中"（那些字就在 markdown 里，只是被记在了同段的前一个块上）。
   */
  region_of?: Record<string, number>
  /** 文档产物里图片的 URL 前缀（md 内的图片路径已由后端改写为可用绝对地址） */
  img_url_base: string
  /** bbox 的归一化上限（当前恒为 1000）：百分比定位用 x/bbox_space*100 */
  bbox_space: number
  /** 页面图地址前缀；实际地址为 `${page_url_base}/${page_idx}.png?scale=${render_scale}` */
  page_url_base: string
  render_scale: number
  /** 后端是否装了栅格化依赖（pypdfium2）；false 时左侧退化为无页面图 */
  render_available: boolean
}

/** Markdown 片段：`block_i` 与 `ParsedDoc.blocks[].i` 一一对应 */
export interface MdChunk {
  block_i: number
  md: string
}

/* ── 上传新文档（US-01：登记源文件 · 判重 · 来源预填）──────────────── */

/** 判重命中的既有文档（后端 `/api/corpus/upload` 返回的 `conflict`） */
export interface CorpusConflict {
  /** `same_content` = 内容 sha256 已存在（同名或改名重发）；`same_name` = 同名但内容不同 */
  kind: 'same_content' | 'same_name'
  doc_id: string
  region: string
  filename: string
  source_name: string
  status: string
  version: number
  created_at: string
  size_bytes: number
  /** 是否已登记进台账 */
  registered: boolean
  /** 是否已有 MinerU 产物目录 */
  has_products: boolean
  /** 当前切片数（没有切块产物时为 null，界面显示「—」） */
  chunks: number | null
  /** 命中冲突的那份源文件绝对路径 */
  path: string
  hit_region: string
  /** 内容相同但文件名不同（改名重发） */
  renamed: boolean
}

/** 来源预填结果：台账字段 + 每个字段来自哪条规则、判定依据是什么 */
export interface CorpusPrefill {
  doc_id: string | null
  filename: string
  region: string
  source_name: string | null
  publisher: string | null
  year: number | null
  evidence_level: string | null
  applicable_age: string | null
  license: string | null
  source_url: string | null
  obtained_at: string | null
  /** pdf / html */
  kind?: string
  field_source: Record<string, FieldSource>
  /** 必填缺失字段（年份 / 地区 / 证据级别）—— 缺了就不能发布 */
  missing_required: string[]
}

/** `/api/corpus/upload` 的返回（`dry=true` 时不落盘、不登记） */
export interface CorpusUploadResult {
  ok: boolean
  dry: boolean
  doc_id: string
  filename: string
  region: string
  /** pdf / html */
  kind: string
  size_bytes: number
  /** 内容指纹前 16 位（判重凭据，完整值不下发） */
  sha256: string
  prefill: CorpusPrefill
  missing_required: string[]
  conflict: CorpusConflict | null
  registered: boolean
  written: boolean
  skipped: boolean
  /** 因换后缀被清掉的同名旧文件（一个 doc_id 只留一份源文件） */
  replaced: string[]
  path?: string
  row?: Record<string, unknown>
  /** 覆盖登记时被作废（标 stale）的步骤 */
  invalidated?: string[]
  completeness?: { total: number; missing_required: number; license_missing: number }
  message: string
}

/** 单文件上传上限（与后端 `routers.UPLOAD_MAX_BYTES` 对齐，用于前端先行提示） */
export const UPLOAD_MAX_BYTES = 100 * 1024 * 1024
/** 支持的源文件格式（与后端 `routers.UPLOAD_SUFFIXES` 对齐） */
export const UPLOAD_ACCEPT = '.pdf,.html,.htm'

/* ── 信号管理域（TECH-029 / PRD-014）────────────────────────────────── */

export interface SignalDetail {
  id: string
  name: string
  /** fact | inference | meta */
  layer: string
  caliber: string
  source: string
  params: string[]
  evidence: string
  /** active | degraded | gap */
  status: string
  statusNote: string
}

export interface SignalGroup {
  id: string
  name: string
  scope: string
  signalCount: number
  activeCount: number
  note: string | null
  signals: SignalDetail[]
}

export interface SignalFlag {
  key: string
  name: string
  triggerDesc: string
  strength: string
  strengthLabel: string
  enabled: boolean
  origin: string
  evidence: string
}

export interface SignalParam {
  key: string
  name: string
  group: string
  type: string
  unit: string
  range: number[]
  presets: (number | string)[]
  default: unknown
  medical: boolean
  evidence: string
  note: string
}

export interface SignalRegistryData {
  stats: {
    groups: number
    signals: number
    flags: number
    params: number
    configRows: number
    degradedGroups: number
    changedParams: number
  }
  groups: SignalGroup[]
  flags: SignalFlag[]
  params: SignalParam[]
  reverseIndex: Record<
    string,
    {
      signals: { id: string; name: string; group: string }[]
      flags: { key: string; name: string }[]
    }
  >
  groupLabels: Record<string, string>
  errors: string[]
}

export interface SignalConfigItem {
  key: string
  name: string
  group: string
  type: string
  unit: string
  range: number[]
  presets: (number | string)[]
  current: unknown
  default: unknown
  /** null 默认值 = 以代码内置为准（词表类） */
  status: 'default' | 'changed'
  medical: boolean
  evidence: string
  note: string
  isFlag: boolean
  flagKey?: string
  /** 复审状态（S7 / US-09；仅医学参数有意义） */
  lastReviewedAt: string | null
  reviewNote: string
  pendingReview: boolean
  reviewState: 'reviewed' | 'never' | 'na'
}

export interface SignalConfigData {
  items: SignalConfigItem[]
  count: number
  groupLabels: Record<string, string>
  errors: string[]
  reviewSummary?: { cycleDays: number; pendingCount: number; neverReviewedCount: number }
  reviewConfig?: { cycleDays: number }
}

export interface SignalHealth {
  ok: boolean
  files: { path: string; exists: boolean; fingerprint: string | null; error: string | null }[]
  schema: { registry: number | null; signals: number | null; compatible: boolean }
}

export interface SignalValueResult {
  ok: boolean
  baby?: { id: string; name: string }
  datasource?: string
  key?: string
  name?: string
  group?: string
  value?: unknown
  note?: string | null
  generatedAt?: string
  error?: string
  hint?: string
}

/** 全量信号实测（总览表格「实测值」列）：46 信号 + 12 flag 触发状态 */
export interface SignalValueAllResult {
  ok: boolean
  baby?: { id: string; name: string }
  datasource?: string
  values?: Record<string, { value: unknown; note?: string | null; error?: string }>
  flags?: Record<string, { triggered: boolean; strength: string | null; detail: string | null }>
  generatedAt?: string
  error?: string
}

/* ── 草稿与词表试跑（S5）────────────────────────────────────────── */

export interface SignalDraftItem {
  key: string
  newValue: unknown
  reason: string
  evidence?: string
}

export interface SignalDraft {
  items: SignalDraftItem[]
  baseFingerprint: string | null
  updatedAt: string
}

export interface SignalDraftGet {
  draft: SignalDraft | null
  baseline: { fingerprint: string | null; drift: boolean }
}

export interface SignalDraftSaveResult {
  ok: boolean
  draft: SignalDraft
  warnings: string[]
}

export interface SignalWordlists {
  highRiskGroups: { group: string; keys: string[] }[]
  categoryRules: { category: string; keys: string[] }[]
  prefix: string[]
  suffix: string[]
  alias: Record<string, string>
}

export interface SignalWordlistTryResult {
  ok: boolean
  foods: {
    input: string
    normalized: string[]
    categories: string[]
    highRisk: { group: string; matched: { food: string; by: string }[] }[]
  }[]
  configSource: string
  error?: string
}

/* ── 变更发布（S6）──────────────────────────────────────────────── */

export interface SignalDryRunResult {
  ok: boolean
  mode: 'baseline' | 'diff'
  meta?: { at?: string; datasource?: string; baby?: { id: string; name: string } }
  diff?: {
    blockLines: { type: 'same' | 'add' | 'del'; text: string }[]
    flagsAdded: { key: string; label: string; strength: string; detail: string }[]
    flagsRemoved: { key: string; label: string; strength: string; detail: string }[]
    flagsChanged: { key: string; before: { label: string; strength: string }; after: { label: string; strength: string } }[]
    routeChanged: { before: string; after: string } | null
    signalsChanged: { key: string; before: unknown; after: unknown }[]
    configChanged: { key: string; before: unknown; after: unknown }[]
  }
  error?: string
}

export interface SignalPublishResult {
  ok: boolean
  version: string
  diff: { key: string; before: unknown; after: unknown }[]
  forced: boolean
  assert: { totalPasses: number | null; totalFails: number | null }
  gitHint: string
  checklist: string[]
}

/* ── 版本与审计（S7 / US-08 / US-09）────────────────────────────── */

export interface SignalVersion {
  version: string
  createdAt: string
  reason: string
  status: 'current' | 'superseded' | 'rolled_back'
  forced: boolean
  isCurrent: boolean
  diffCount: number
  summary: string
}

export interface SignalVersionsData {
  versions: SignalVersion[]
  deploy: { currentVersion: string | null; confirmed: boolean; confirmedAt: string | null }
  drift: {
    hasDrift: boolean
    currentFingerprint: string | null
    latestFingerprint: string | null
    latestVersion: string | null
  }
  backupDir: string
}

export interface SignalVersionDetail {
  version: string
  createdAt: string
  reason: string
  diff: { key: string; before: unknown; after: unknown }[]
  fingerprint: string | null
  status: 'current' | 'superseded' | 'rolled_back'
  forced: boolean
}

export interface SignalAuditItem {
  id: number
  ts: string
  action: string
  object_key: string | null
  before: string | null
  after: string | null
  reason: string | null
}

export interface SignalAuditData {
  items: SignalAuditItem[]
  total: number
}

export interface SignalReviewConfig {
  cycleDays: number
  defaultDays: number
  updatedAt: string | null
}

/* ── 观测域（TECH-030）：Langfuse 服务状态 + 数据同步 ──────────────────── */

export interface ObsContainer {
  service: string
  name: string
  state: string
  status: string
}

export interface ObsStackSnapshot {
  enabled: boolean
  autostart: boolean
  stop_on_exit: boolean
  /** disabled / unknown / docker_missing / daemon_down / starting / running / degraded / stopped / error */
  state: string
  detail: string
  error: string | null
  busy: boolean
  /** 正在执行的编排操作：start / stop（null=空闲；供按钮文案区分"启动中/停止中"） */
  op: string | null
  updated_at: number
  started_by_platform: boolean
  containers: ObsContainer[]
  health: { reachable: boolean; ready: boolean; version: string | null; error: string | null } | null
  compose_file: string
  compose_exists: boolean
  unit_dir: string
  public_url: string
  port: number
}

export interface ObsSyncSnapshot {
  running: boolean
  kind: 'import' | 'preview' | null
  params: Record<string, unknown>
  candidates: number | null
  processed: number
  ok: number
  fail: number
  /** idle / running / ok / partial / failed / error / cancelled */
  status: string
  error: string | null
  started_at: string | null
  finished_at: string | null
  last_trace: string | null
  lines: string[]
}

export interface ObsStatus {
  enabled: boolean
  stack: ObsStackSnapshot
  config: {
    langfuse_host: string
    public_url: string
    pk_configured: boolean
    sk_configured: boolean
    keys_source: string
  }
  flexdb: { configured: boolean; source: string }
  sync: ObsSyncSnapshot
}

export interface ObsSyncRun {
  id: number
  kind: string
  scope: string
  args_json: string | null
  args?: string[] | null
  candidates: number | null
  ok: number
  fail: number
  status: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  log_tail: string | null
  trigger: string
}
