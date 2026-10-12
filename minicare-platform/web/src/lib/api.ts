/**
 * API client —— 后端 `web/api.py` + `web/routers.py` 的完整封装。
 *
 * 与旧版内嵌单页（ui.py 的 `req()`）语义一致：
 *   · 一律走 `fetch`，`Content-Type: application/json`
 *   · 非 2xx 时按 `{detail}`（FastAPI HTTPException）或 `{error:{message}}` 取错误文案
 *
 * ⚠️ 开发期由 Vite 代理 `/api` → 8787（见 vite.config.ts）；生产期 FastAPI 同端口托管，
 * 因此这里**只写相对路径**，不拼接任何 origin。
 */
import type {
  ChunksGet,
  ConfigDetail,
  ConfigRaw,
  ConfigSaveResult,
  CorpusUploadResult,
  DocDetail,
  ExcerptsGet,
  ExcludedGet,
  GapsGet,
  Health,
  IndexResult,
  LlmStatus,
  MetaExtractGet,
  MetaExtractResult,
  MetaGet,
  MetaSchema,
  NormalizeDiffGet,
  ObsStackSnapshot,
  ObsStatus,
  ObsSyncRun,
  ObsSyncSnapshot,
  Overview,
  ParsedDoc,
  PreflightGet,
  PublishPlan,
  PublishRunResult,
  PublishState,
  QualityRunResult,
  QualitySearchResponse,
  QualityState,
  ReviewsGet,
  RunProgress,
  RunResult,
  SegmentsGet,
  SignalConfigData,
  SignalAuditData,
  SignalDraftGet,
  SignalDraftItem,
  SignalDraftSaveResult,
  SignalDryRunResult,
  SignalHealth,
  SignalPublishResult,
  SignalRegistryData,
  SignalReviewConfig,
  SignalValueAllResult,
  SignalValueResult,
  SignalVersionDetail,
  SignalVersionsData,
  SignalWordlistTryResult,
  SignalWordlists,
  StepRunResultDto,
  TranslationGet,
  TranslationItem,
} from './types'

export async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const body = await r.json().catch(() => ({}) as Record<string, unknown>)
  if (!r.ok) {
    const b = body as {
      detail?: string | { message?: string; errors?: unknown[] }
      error?: { message?: string }
    }
    // detail 为对象（如 /api/signals/draft 的校验明细）→ 提取 message 并保留结构化 detail（调用方可读 e.detail.errors）
    if (b.detail && typeof b.detail === 'object' && b.detail.message) {
      const err = new Error(b.detail.message) as Error & { detail?: unknown }
      err.detail = b.detail
      throw err
    }
    throw new Error(b.error?.message || (b.detail as string) || `HTTP ${r.status}`)
  }
  return body as T
}

const post = <T>(path: string, payload?: unknown) =>
  req<T>(path, { method: 'POST', body: JSON.stringify(payload ?? {}) })

const put = <T>(path: string, payload?: unknown) =>
  req<T>(path, { method: 'PUT', body: JSON.stringify(payload ?? {}) })

const patch = <T>(path: string, payload?: unknown) =>
  req<T>(path, { method: 'PATCH', body: JSON.stringify(payload ?? {}) })

const d = encodeURIComponent

/**
 * 上传新文档（US-01）。请求体是**原始文件字节**，参数走 query —— 与后端约定一致
 * （见 `kb_pipeline/web/routers.py` 的 `corpus_upload`）。
 *
 * 这里刻意不走 `post()` 那个 JSON 助手：`FormData` / multipart 都要额外依赖，
 * 而单文件 100MB 的上限之内、本机 localhost 场景下，`body: file` 最直接。
 */
const uploadCorpus = (
  file: File,
  opts: { region: string; dry?: boolean; onConflict?: 'skip' | 'overwrite' | 'keep_both' },
) => {
  const q = new URLSearchParams({ filename: file.name, region: opts.region })
  if (opts.dry) q.set('dry', '1')
  if (opts.onConflict) q.set('on_conflict', opts.onConflict)
  return req<CorpusUploadResult>(`/api/corpus/upload?${q.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  })
}

/* ── 状态 / 文档 ────────────────────────────────────────────── */

export const api = {
  health: () => req<Health>('/health'),
  overview: () => req<Overview>('/api/overview'),
  /** 正文清洗前后的逐行对照（「清洗对比」页签） */
  normalizeDiff: (docId: string) =>
    req<NormalizeDiffGet>(`/api/docs/${d(docId)}/normalize-diff`),
  /** 切块产物 + 与原文块的精确对齐（「切片对照」页） */
  segments: (docId: string) => req<SegmentsGet>(`/api/docs/${d(docId)}/segments`),
  /** 预检产物 + 检查项清单 + 逐页文字层明细 */
  preflight: (docId: string) => req<PreflightGet>(`/api/docs/${d(docId)}/preflight`),
  /** 语料级元信息 schema + LLM 可用性 */
  metadataSchema: () => req<{ schema: MetaSchema; llm: LlmStatus }>('/api/metadata/schema'),
  /** 用 LLM 重新归纳 schema（写平台数据目录，不碰知识库） */
  induceMetadataSchema: (samples?: number) =>
    post<{ ok: boolean; path: string; schema: MetaSchema }>('/api/metadata/schema/induce', { samples }),
  /** 单文档元信息抽取结果（可能还没跑过）+ schema + LLM 状态 */
  metaExtract: (docId: string) => req<MetaExtractGet>(`/api/docs/${d(docId)}/meta-extract`),
  runMetaExtract: (docId: string, force = true) =>
    post<{ ok: boolean; result: MetaExtractResult }>(`/api/docs/${d(docId)}/meta-extract`, { force }),
  docDetail: (docId: string) => req<DocDetail>(`/api/docs/${d(docId)}`),

  runDoc: (
    docId: string,
    body: { until?: string | null; force?: boolean },
  ) => post<RunResult>(`/api/docs/${d(docId)}/run`, body),

  /**
   * 该文档的运行进度快照（前端 1s 轮询；见 `app-context` 的 `trackRun`）。
   * 纯内存读取，不触发任何计算 —— 运行期间高频调用是设计预期。
   */
  runProgress: (docId: string) => req<RunProgress>(`/api/docs/${d(docId)}/run-progress`),

  runStep: (docId: string, step: string, body: Record<string, unknown>) =>
    post<StepRunResultDto>(`/api/docs/${d(docId)}/steps/${d(step)}/run`, body),

  invalidate: (docId: string, fromStep = 'segment') =>
    post<{ doc_id: string; marked: string[] }>(`/api/docs/${d(docId)}/invalidate`, {
      from_step: fromStep,
    }),

  /* ── 已屏蔽内容（US-07）── */
  excluded: (docId: string) => req<ExcludedGet>(`/api/docs/${d(docId)}/excluded`),
  restoreExcluded: (docId: string, kbId: string) =>
    post<{ status: string }>(`/api/docs/${d(docId)}/excluded/${d(kbId)}/restore`),
  excludeChunk: (docId: string, kbId: string) =>
    post<{ status: string }>(`/api/docs/${d(docId)}/excluded/${d(kbId)}/exclude`),

  /* ── 信息确认（US-04）── */
  metaGet: (docId: string) => req<MetaGet>(`/api/docs/${d(docId)}/meta`),
  metaPut: (docId: string, payload: Record<string, unknown>) =>
    put<{ ok: boolean; derived_status: string }>(`/api/docs/${d(docId)}/meta`, payload),

  /* ── 内容校对（US-05）── */
  chunks: (docId: string, include: 'all' | 'review' | 'excluded' = 'all') =>
    req<ChunksGet>(`/api/docs/${d(docId)}/chunks?include=${include}`),
  chunkEdit: (docId: string, kbId: string, text: string) =>
    post<{ ok: boolean }>(`/api/docs/${d(docId)}/chunks/${d(kbId)}/edit`, { text }),
  chunkDisable: (docId: string, kbId: string) =>
    post<{ ok: boolean }>(`/api/docs/${d(docId)}/chunks/${d(kbId)}/disable`),
  chunkDelete: (docId: string, kbId: string) =>
    post<{ ok: boolean }>(`/api/docs/${d(docId)}/chunks/${d(kbId)}/delete`),
  chunkSplit: (docId: string, kbId: string, positions: string[]) =>
    post<{ ok: boolean; parts: number }>(`/api/docs/${d(docId)}/chunks/${d(kbId)}/split`, {
      positions,
    }),
  chunkMerge: (docId: string, kbIds: string[]) =>
    post<{ ok: boolean; merged: number }>(`/api/docs/${d(docId)}/chunks/merge`, { kb_ids: kbIds }),
  /** 打「错误标记」（标注：不改内容、不影响检索；要排除请再用禁用/删除） */
  chunkMark: (docId: string, kbId: string, reason: string, note = '') =>
    post<{ ok: boolean; mark: { reason: string; note: string; at: string } }>(
      `/api/docs/${d(docId)}/chunks/${d(kbId)}/mark`,
      { reason, note },
    ),
  chunkUnmark: (docId: string, kbId: string) =>
    post<{ ok: boolean; cleared: boolean }>(`/api/docs/${d(docId)}/chunks/${d(kbId)}/unmark`),

  /* ── 译文对照（TECH-019，「切片对照」页）── */
  /** 翻译产物 + 人工修正合并（未就绪时 ready=false，不报错） */
  translation: (docId: string) => req<TranslationGet>(`/api/docs/${d(docId)}/translation`),
  /** 保存人工修正译文（覆盖层最高优先；不触发管线重跑） */
  chunkTranslation: (docId: string, kbId: string, zh: string) =>
    post<{ ok: boolean; entry: TranslationItem }>(
      `/api/docs/${d(docId)}/chunks/${d(kbId)}/translation`,
      { zh },
    ),
  /** 恢复机翻译文（删除覆盖层条目） */
  chunkTranslationReset: (docId: string, kbId: string) =>
    post<{ ok: boolean; cleared: boolean }>(
      `/api/docs/${d(docId)}/chunks/${d(kbId)}/translation/reset`,
    ),

  /* ── 解析高危敏感信息复核（US-06，原「内容复核」）── */
  reviews: (docId: string) => req<ReviewsGet>(`/api/docs/${d(docId)}/reviews`),
  resolveReview: (docId: string, kbId: string, state: string, value = '') =>
    post<{ ok: boolean }>(`/api/docs/${d(docId)}/reviews/${d(kbId)}/resolve`, { state, value }),

  /* ── 入库结果（US-09）── */
  indexResult: (docId: string) => req<IndexResult>(`/api/docs/${d(docId)}/index-result`),

  /* ── 检索质检（US-11）── */
  quality: () => req<QualityState>('/api/quality'),
  qualityRun: (k = 10) => post<QualityRunResult>('/api/quality/run', { k }),
  /** 检索测试：单条问题直跑检索实现，看 top-k 召回明细（只读，不落基线） */
  qualitySearch: (body: {
    query: string
    k?: number
    risk_level?: string
    category?: string
    /** 实验参数（仅本页）：hybrid / fts / vector，不传 = 线上口径 */
    mode?: string
    /** 实验参数：0~1，混合模式下全文路权重（0.5 = 均衡 = 线上等权） */
    keyword_weight?: number
  }) => post<QualitySearchResponse>('/api/quality/search', body),

  /* ── 知识缺口（US-12）── */
  gaps: () => req<GapsGet>('/api/gaps'),
  gapsCollect: () => post<{ ok: boolean; added: string[]; message?: string }>('/api/gaps/collect'),
  gapClose: (gapId: string, reason?: string) =>
    post<{ ok: boolean }>(`/api/gaps/${d(gapId)}/close`, { reason }),
  gapDefer: (gapId: string, reason: string) =>
    post<{ ok: boolean }>(`/api/gaps/${d(gapId)}/defer`, { reason }),

  /* ── 发布（US-10）── */
  publishState: () => req<PublishState>('/api/publish/state'),
  /** 发布计划：可发布（已就绪）文档 + 暂不可发布清单（含原因）+ 针对发布范围的检查 */
  publishPlan: () => post<PublishPlan>('/api/publish/plan', {}),
  publishRun: (docIds: string[], force = false) =>
    post<PublishRunResult>('/api/publish/run', { doc_ids: docIds, target_env: 'dev', force }),
  publishSnapshot: (note = '手动快照') =>
    post<{ name: string; chunks: number }>('/api/publish/snapshot', { note }),
  publishRollback: (snapshot: string) =>
    post<{ ok: boolean; restored_chunks?: number; match?: boolean; message?: string }>(
      '/api/publish/rollback',
      { snapshot },
    ),

  /* ── 解析对照（US-14）── */
  parsed: (docId: string) => req<ParsedDoc>(`/api/docs/${d(docId)}/parsed`),
  /** 纯文本取回（MinerU markdown 全文） */
  plain: async (path: string) => {
    const r = await fetch(path)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.text()
  },

  /* ── 语料档案（US-01/02）── */
  corpus: () =>
    req<{
      items: Record<string, unknown>[]
      completeness: Record<string, unknown>
      missing: unknown[]
    }>('/api/corpus'),
  corpusSync: () =>
    post<{ added: number; updated: number; items: string[] }>('/api/corpus/sync'),
  corpusExport: () => req<{ markdown: string }>('/api/corpus/export'),
  /**
   * 列表页卡片用的**批量原文摘要**（`{doc_id: 摘要 | null}`）。
   * `null` = 这份抽不出像样的摘要（前置件全是版权/作者名单，或还没解析）→ 卡片不显示摘要行。
   * 走批量端点而不是逐个 `parsed/md`：后者会把每份**全文**都传一遍（有几份上百 KB）。
   */
  corpusExcerpts: (limit = 150) =>
    req<ExcerptsGet>(`/api/corpus/excerpts?limit=${limit}`),
  corpusUpdate: (docId: string, payload: Record<string, unknown>) =>
    patch<{ ok: boolean; row: Record<string, unknown> }>(`/api/corpus/${d(docId)}`, payload),
  corpusSupersede: (docId: string, newDocId: string) =>
    post<{ ok: boolean; row: Record<string, unknown> }>(`/api/corpus/${d(docId)}/supersede`, {
      new_doc_id: newDocId,
    }),

  /* ── 全局配置（「全局配置」页）── */
  /** 全量配置明细：管线条数分组 × 字段 + .env 密钥/环境变量 */
  configDetail: () => req<ConfigDetail>('/api/config/detail'),
  /** 批量保存（yaml + env）；后端先全量校验、备份，再写回并热重载 */
  configSave: (body: {
    yaml: { group: string; key: string; value: unknown }[]
    env: { key: string; value: string }[]
  }) => put<ConfigSaveResult>('/api/config/save', body),
  /** 重新读取磁盘上的 pipeline.yaml / .env（热重载），返回最新明细 */
  configReload: () => post<ConfigDetail>('/api/config/reload'),
  /** 原始文件预览（只读；目前仅 pipeline.yaml） */
  configRaw: (name = 'pipeline') => req<ConfigRaw>(`/api/config/raw?name=${name}`),

  /**
   * 上传新文档（US-01）。
   * `dry: true` 只做格式校验 + 判重 + 来源预填，**不落盘、不登记** —— 用来渲染登记预填表单；
   * 用户核对后再发一次同内容的正式请求（`dry` 省略）。
   * 命中判重时必须给出 `onConflict`，否则后端按 `skip` 处理（不产生任何新记录）。
   */
  corpusUpload: uploadCorpus,

  /* ── 信号管理（TECH-029 / PRD-014）── */
  /** 信号图谱：组/信号/flag/参数 + 反向索引 + 统计 */
  signalRegistry: () => req<SignalRegistryData>('/api/signals/registry'),
  /** 配置清单：58 行视图（34 参数 + 12 flag × 开关/强度） */
  signalConfig: () => req<SignalConfigData>('/api/signals/config'),
  /** 文件健康：存在性 / 指纹 / schema 兼容 */
  signalHealth: () => req<SignalHealth>('/api/signals/health'),
  /** 单信号实测（「跑一遍」）；prod 为只读数据源 */
  signalValue: (baby: string, key: string, datasource = 'dev', configFile?: string) => {
    const q = new URLSearchParams({ baby, key, datasource })
    if (configFile) q.set('configFile', configFile)
    return req<SignalValueResult>(`/api/signals/value?${q.toString()}`)
  },
  /** 全量信号实测（总览表格「实测值」列）：46 信号 + 12 flag 触发状态 */
  signalValueAll: (baby: string, datasource = 'dev') => {
    const q = new URLSearchParams({ baby, datasource })
    return req<SignalValueAllResult>(`/api/signals/value-all?${q.toString()}`)
  },
  /** 改前/改后对比（干跑；服务端自动物化当前草稿为临时配置） */
  signalDryRun: (body: { baby: string; datasource?: string }) =>
    post<SignalDryRunResult>('/api/signals/dry-run', body),
  /** 断言集（发布步骤②） */
  signalAssert: (configFile?: string) =>
    post<Record<string, unknown>>('/api/signals/assert', configFile ? { configFile } : {}),
  /** 发布（S6）：断言失败默认阻断（error.detail.errors 为明细）；force + 理由可放行 */
  signalPublish: (force = false, forceReason = '') =>
    post<SignalPublishResult>('/api/signals/publish', force ? { force, forceReason } : {}),
  /** 读取草稿 + 基线指纹（drift = signals.yaml 被平台外改动） */
  signalDraft: () => req<SignalDraftGet>('/api/signals/draft'),
  /** 保存草稿（全量替换）；校验不过抛错，`error.detail.errors` 为逐项明细 [{key,error}] */
  signalDraftSave: (items: SignalDraftItem[]) =>
    put<SignalDraftSaveResult>('/api/signals/draft', { items }),
  /** 丢弃草稿 */
  signalDraftDiscard: () =>
    req<{ ok: boolean }>('/api/signals/draft', { method: 'DELETE' }),
  /** 词表试跑器；wordlists 传了 = 用「当前值 ⊕ 编辑中词表」临时覆盖试跑（不落盘） */
  signalWordlistTry: (foods: string[], wordlists?: SignalWordlists) =>
    post<SignalWordlistTryResult>('/api/signals/wordlist-try', wordlists ? { foods, wordlists } : { foods }),

  /* ── S7：版本 / 回滚 / 审计 / 复审 ─────────────────────────── */

  /** 版本列表 + 部署状态 + 外部变更检测 */
  signalVersions: () => req<SignalVersionsData>('/api/signals/versions'),
  signalVersionDetail: (version: string) =>
    req<SignalVersionDetail>(`/api/signals/versions/${encodeURIComponent(version)}`),
  signalRollback: (version: string, reason = '', force = false, forceReason = '') =>
    post<SignalPublishResult>(
      '/api/signals/rollback',
      force ? { version, reason, force, forceReason } : { version, reason },
    ),
  signalExternalRegister: () =>
    post<{ ok: boolean; version: string; diff: { key: string; before: unknown; after: unknown }[] }>(
      '/api/signals/external-register',
      {},
    ),
  signalDeployConfirm: () =>
    post<{ ok: boolean; already: boolean; version: string; confirmedAt: string }>(
      '/api/signals/deploy-confirm',
      {},
    ),
  signalAudit: (limit = 100, offset = 0) =>
    req<SignalAuditData>(`/api/signals/audit?limit=${limit}&offset=${offset}`),
  signalReview: (key: string, note = '') =>
    post<{ ok: boolean; key: string; lastReviewedAt: string }>('/api/signals/review', { key, note }),
  signalReviewConfig: () => req<SignalReviewConfig>('/api/signals/review-config'),
  signalReviewConfigSet: (cycleDays: number) =>
    put<SignalReviewConfig & { ok: boolean }>('/api/signals/review-config', { cycleDays }),

  /* ── 观测（TECH-030）：Langfuse 服务编排 + 数据同步 ─────────────── */

  /** 观测域全量状态（栈状态机 / 密钥配置 / 同步快照；页面 4s 轮询，后端自带节流） */
  obsStatus: () => req<ObsStatus>('/api/obs/status'),
  /** 启动观测栈（异步：docker/colima 探测拉起 + compose up；返回当时快照，靠轮询收敛） */
  obsStackStart: () => post<ObsStackSnapshot>('/api/obs/stack/start'),
  /** 停止观测栈（compose stop；保留数据卷） */
  obsStackStop: () => post<ObsStackSnapshot>('/api/obs/stack/stop'),
  /** 发起数据同步（FlexDB → 本地 Langfuse）；dry_run=true 为试跑预览（不导入不回填） */
  obsSyncStart: (body: {
    mode: 'all' | 'range' | 'trace'
    limit?: number
    from?: string
    to?: string
    trace_id?: string
    dry_run?: boolean
  }) => post<ObsSyncSnapshot>('/api/obs/sync/start', body),
  /** 同步运行态 + 实时日志行（运行中 1.2s 轮询） */
  obsSyncStatus: () => req<ObsSyncSnapshot>('/api/obs/sync/status'),
  /** 取消进行中的同步（终止子进程；已完成的回填不丢） */
  obsSyncCancel: () => post<ObsSyncSnapshot>('/api/obs/sync/cancel'),
  /** 同步历史（obs_sync_run 台账，倒序） */
  obsSyncRuns: (limit = 50) => req<{ items: ObsSyncRun[] }>(`/api/obs/sync/runs?limit=${limit}`),
}
