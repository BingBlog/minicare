# TECH-015 — 知识库平台化技术方案（PRD-008 落地设计）

> 文档编号：TECH-015 ｜ 版本：**v1.1** ｜ 日期：**2026-10-09**（v1.0：2026-10-03）｜ 状态：**已实施，待真实路径验收**
> 上游 PRD：[`docs/prd/PRD-008/`](../prd/PRD-008/README.md)（v1.0，2026-10-02；实施进展以 `06-开发进展与交接.md` 为准）
> 代码基线：`minicare-platform/api/`（Python 包 `kb_pipeline` + `web/` 后端）、`minicare-platform/web/`（React 前端）、`agent-poc/src/lib/tools/search-knowledge.js`、`minicare-server/migrations/{017_knowledge_base,021_knowledge_retrieval_status}.sql`
> 本文性质：**实现级设计**。现状描述一律以代码为准；所有选型结论附证据与反面论证（什么情况下会被推翻）。
>
> **v1.1 变更**：新增 **[§0.4 实施落地实况](#04-实施落地实况2026-10-09-重核)**（权威现状快照，与 §0.3 并列）；
> 修正 §6.3 的 `doc_id` 语义、§5.1/§17 的代码落点、§7.1 的端点清单、§9.1 的迁移执行进度；
> 补 §14/§16 的实施状态列。**§1–§17 的选型评估与反面论证未变**（结论仍成立）。
> 运维速查与踩坑：[`TECH-015-kb-platform-gotchas.md`](TECH-015-kb-platform-gotchas.md)（11 节）；
> 「原文 ↔ 解析」源码调研：[`TECH-015-kb-source-research.md`](TECH-015-kb-source-research.md)。

---

## 0. 结论摘要

### 0.1 一句话方案

在 `minicare-platform/api/` 现有 Python 管线之上，加一层**本机运行的平台进程**（FastAPI + React），把「脚本顺序执行」改为「6 步产物可寻址 + 失效传播 + ~~人工暂停点~~ + 发布快照」，数据契约扩两个字段（迁移 021）以支撑「可检索 / 已屏蔽 / 待复核」三态。

> 🚫 **2026-10-09 变更**：**人工暂停点机制已整体移除**（前后端 + 文档）。本文中凡提到「暂停点 1/2」
> 「闸门」「`gate_open`」「`blocked_gate`」「`awaiting_meta`/`awaiting_review`」的段落均为**历史设计**，
> 现已不存在；六步一路跑到底，「信息确认」「切片校对」降级为**可选操作**。
> 现状见 PRD-008 `02-能力设计.md` §6.5 与 [`gotchas §3`](TECH-015-kb-platform-gotchas.md)。

### 0.2 选型结论总表（详见 §4）

| # | 选型点 | 结论 | 是否变更现状 | 关键证据 |
|---|---|---|---|---|
| S-1 | 解析引擎 | **MinerU `pipeline` 档（云端 API）** | 不变 | OmniDocBench 90.7%（vs Marker 74% / Docling 72%）；**实测 vlm 引擎丢剂量数字，故不因 95.39 高分改档** |
| S-2 | 切块策略 | **自研章节切块（表格独立成块）** | 不变 | 2×2 实测：自研 64.4% vs LlamaIndex 31.1%（同 embedding 条件） |
| S-3 | 向量模型 | **TokenHub `kinfra-text-embedding-0.6b`（1024 维）** | 不变 | 实测 0.6b 86.7% > 4b 64.4%；4b 高维多语言能力在 95% 中文小语料上是负收益 |
| S-4 | 向量存储与检索 | **MySQL BLOB + 内存余弦 + FULLTEXT ngram（RRF 融合）** | 不变 | 1584 条 ≈ 6.5MB；纯向量 86.7% < 混合 97.8% |
| S-5 | 关键词抽取 | **云端 LLM（DeepSeek）**，不可用时降级规则增强 | **变更** | PRD D-10；现状只从 title 抽词，而 FULLTEXT 单独救回 6 题中的 5 题 |
| S-6 | 编排与任务队列 | **自研（DB 表即队列 + 单调度循环）** | **新增** | 单用户单机，引入 Celery/Redis 不划算 |
| S-7 | 产物存储 | **本地文件系统 + `manifest.json` + 按 `run_id` 分目录** | **变更** | 现为固定目录 + 追加式 `chunks.jsonl`（存在累积缺陷） |
| S-8 | 后端框架 | **FastAPI + uvicorn** | **新增** | 与管线同语言，可直接 import 现有模块，零跨语言适配 |
| S-9 | 前端栈 | **React 18 + Vite 6 + Tailwind** | **新增** | 复用 `minicare-web` 既有栈；重交互（双栏校对/虚拟滚动）有成熟方案 |
| S-10 | 配置与阈值 | **`config/pipeline.yaml` + pydantic 校验 + 启动打印生效值** | **修正** | ⚠️ 现有 `config/` 目录**不存在**，YAML 从未生效（见 §2.3 F-1） |

**十个选型点中六个不变** —— 这不是保守，而是因为该项目已经用**可复现的实测**否决过若干"看起来更好"的方案（LlamaIndex 切块、4b 向量模型、MinerU vlm 档）。本方案的首要价值在于**把这些结论固化为可校验的工程约束**，而不是重新选一遍。

### 0.3 与 PRD-008 的三处偏差（本文新发现，需回写 PRD）

| # | 偏差 | 说明 | 处理 |
|---|---|---|---|
| **X-1** | PRD §11.5 的数据库改动清单**漏了发布记录表** | US-10 要求「每次发布留档：增量内容、切片数、快照编号、验证结果」，但 §11.5 的六张新表里没有承载它的表 | 本文补 `kb_publish`（§6.2）；同时更新 PRD §11.5 |
| **X-2** | PRD §12.2 要求「阈值收敛为单一配置文件」，但**现有 `config/` 目录不存在** | `config.py:11` 指向 `config/default.yaml`，靠 `CONFIG_FILE.exists()` 才加载 → 从未生效；所有阈值实际写在 `config.py` 代码默认值里 | 本文 §4.10 S-10 落地为真实文件，并加测试锁定"改 YAML 即生效" |
| **X-3** | PRD §12.3 要求 prompt 版本化落盘，但**未定义目录位置与校验方式** | 现有仓库无 `prompts/` 目录 | 本文 §8.9 定义 `prompts/<touchpoint>/v<N>.md` + 启动校验版本号可从文件名解析 |

### 0.4 实施落地实况（2026-10-09 重核）

> 本节回答"**现在到底是什么样**"，与 §0.3（规划期的偏差）并列。所有事实**以代码、目录与 dev 库实测为准**。
> 上游同源快照：[PRD-008 `06-开发进展与交接.md`](../prd/PRD-008/06-开发进展与交接.md) §0.0。

#### A. 功能面：五期代码全部落地，界面全量实现

平台侧**没有未实现的页面**。**2026-10-09 起，外壳 = 顶部导航（品牌「敏宝管理平台」＋「知识库 / Agent 测评」两域切换）＋ 域内两级侧栏**：
知识库域 5 个一级入口（含 4 个二级视图）、Agent 测评域 1 个一级入口（下挂 5 个二级管理面），另有工作台页签 + **2 个弹框**。
但交付口径只是「模块可导入 + CLI 可运行 + 页面可渲染」；**真实路径（入库/发布/质检/关键词 A/B）尚未验收**。

#### B. 规划 vs 实况的六处硬偏差

| # | 本文规划 | 实际落地 | 受影响章节（已就地修正） |
|---|---|---|---|
| **T-1 代码落点** | 平台 = 独立 `minicare-platform/app/`（FastAPI 应用包，含 `api/` `orchestrator/` `steps/` `engines/` `store/` 子包） | 后端落在 **`minicare-platform/api/src/kb_pipeline/web/{api,routers,ui}.py`**（`api.py` 建应用 + 13 端点、`routers.py` 45 端点）；编排在 `kb_pipeline/orchestrator.py` + `platform_db.py` + `steps/`。**2026-10-09 目录重组**：原 `minicare-kb/` 整体迁入 `minicare-platform/api/`（规划中 `app/` 的实定名）；`minicare-platform/` 下现为 `api/` + `web/` 双子工程 | §5.1、§17.1、§17.4 |
| **T-2 `doc_id` 语义** | `doc_id` = **内容 sha256**（"稳定 ID，判重依据"，见 §6.3 DDL 注释与 PRD §7.1） | `doc_id` = **源文件名 stem**（`_safe_doc_id(filename)`）。理由：预检/解析要按 `{source_dir}/{国内\|国际}/{doc_id}{后缀}` **定位源文件**。内容 sha256 **退化为临时判重值**（`same_content` 判据，改名重发也能命中），**不入主键、不入表**（`kb_corpus` 无 `sha256` 列） | §6.3、PRD §7.1、PRD 04 §11.5 |
| **T-3 本机表数** | 6 张（`kb_corpus` / `kb_task` / `kb_recall_case` / `kb_recall_gold` / `kb_gap` / `kb_publish`） | **8 张**：多 `kb_doc_state`（存"信息确认"表单，即 Q-11 的落点）与 `kb_keyword_cache`（关键词按**块内容 hash** 缓存）。另 `kb_corpus` 多了 `note` 列、少了 `sha256` 列 | §6.3 |
| **T-4 产物布局** | `01_preflight/run__*/`（序号前缀）+ `file/` + `export/` | `pipeline/{step}/{cache_key[:16]}/`（**无序号前缀**）+ `raw/` + `edits/` + `llm/metadata.json` + `manifest.json`；**无 `file/`、无 `export/`**；源文件在 `docs/knowledge/source/raw/{国内,国际}/` | §8.1、附录 B |
| **T-5 进度推送** | 长任务用 **SSE**（`/api/tasks/{id}/stream`），降级轮询 | **没有 SSE**（前端无 `EventSource`、后端无 `StreamingResponse`）；实际是轮询 `GET /api/queue` | §4.8、§7.1、§8.4 |
| **T-6 端点清单** | §7.1 为示意分组路径 | 实际 **`routers.py` 45 + `api.py` 13 ≈ 58 个端点**，路径不同（清单见下表 C） | §7.1 |

#### C. 实际 REST 端点分组（≈58 个）

| 分组 | 端点 |
|---|---|
| 文档管理 / 台账 | `GET /corpus`、`GET /corpus/excerpts`（批量原文摘要）、`POST /corpus/upload`（dry→登记）、`POST /corpus/sync`、`PATCH /corpus/{doc_id}`、`POST /corpus/{doc_id}/supersede`、`GET /corpus/export` |
| 六步编排 | `GET /overview`、`GET /docs/{doc_id}`、`POST /docs/{doc_id}/run`、`POST /docs/{doc_id}/steps/{step}/run`、`POST /docs/{doc_id}/invalidate`、`GET /queue`、`POST /queue/{resume,cancel-all}` |
| 工作台（只读） | `GET /docs/{doc_id}/parsed`、`/parsed/md`、`/segments`、`/preflight`、`/source`、`/img/{name}`、`/page/{page_idx}.png` |
| 元信息 | `GET /metadata`（全库总览）、`GET /metadata/schema`、`POST /metadata/schema/induce`、`GET|POST /docs/{doc_id}/meta-extract`、`GET|PUT /docs/{doc_id}/meta` |
| 切片 / 复核 / 屏蔽 | `GET /docs/{doc_id}/chunks`、`POST .../chunks/{kb_id}/{edit,disable,delete,split,mark,unmark}`、`POST .../chunks/merge`、`GET .../reviews`、`POST .../reviews/{kb_id}/resolve`、`GET .../excluded`、`POST .../excluded/{kb_id}/{restore,exclude}` |
| 索引结果 | `GET /docs/{doc_id}/index-result` |
| 质检 / 缺口 | `GET /quality`、`POST /quality/run`、`POST /quality/search`（检索测试：单题直查召回明细，只读）、`GET /gaps`、`POST /gaps/collect`、`POST /gaps/{id}/{defer,close}` |
| 契约 | `GET /contract`、`POST /contract/validate` |
| 发布 | `GET /publish/state`、`POST /publish/{plan,checks,run,snapshot,rollback}` |

> ⚠️ 与 §7.1 的示意路径差异，**以本表为准**（前端 `lib/api.ts` 即按此实现）。

#### D. 数据面（dev 库实测，2026-10-09）

| 项 | 实测值 |
|---|---|
| `knowledge_base` 列 | 含 `retrieval_status` / `review_state` → **迁移 021 阶段 1（加列）已完成** |
| 全库 1586 行状态分布 | `enabled / NULL` × **1586** → **阶段 3（回填）未执行** |
| `content LIKE '%[待复核]%'` | **2 行**（前缀仍在 → 检索端仍靠旧 REGEXP 过滤，双写兜底生效） |
| `embedding IS NULL` | **2 行**（与上面同一批） |
| `kb_search_log` | **不存在**（US-13 线上观察无数据源） |
| staging / 正式库 | 仍停在 **019** |

> 🔴 **阶段 1 做了、阶段 3 没做，是当前最危险的状态**：字段可读写但不是真相源。
> 此时若推进 §9.1 阶段 4（agent-poc 切换），那 2 条 review **会直接进检索**。**阶段 4 前必须先跑阶段 3。**

#### E. 界面形态

侧栏 5 组 10 项（① 语料入库 ② 解析与切片 ③ 索引与发布 ④ 消费与验证 ⑤ 系统）；
「文档管理」= **卡片矩阵**（PDF 首页缩略图 + 原文摘要 + 六步管线）；「解析详情」= 工作台（7 页签）；
上传与处理详情/记录走弹框。前端 `src/` 54 个文件、`pages/` 31 个 `.tsx`（含 2026-10-09 抽出的「检索测试」独立页）。
🔴 **`--content-min-w: 1270px` 是硬约束** —— 改表格/卡片列宽必须同步改（见 gotchas §2）。

---

## 1. 背景与目标

### 1.1 要解决什么

知识库**已经可用且达标**：20 份语料（16 PDF + 4 HTML）→ MinerU 解析 → 自研切块 → 数字校验 → `knowledge_base` 1586 条 → TokenHub 1024 维向量 → `agent-poc` 混合检索，**精确 Recall@10 = 97.8%（44/45），已过上线闸门**。

问题不在效果，在**这套东西无法被人维护**：不可分步、产物无版本、质量闭环是断的、噪声块进了检索、发布与回归游离在流程外。完整缺陷清单见 PRD §2.1 与 §4（T1–T11）。

本技术方案要把这条链路改造成**可反复维护的平台**，且严格满足以下运行环境约束（见 §3）。

### 1.2 目标与技术指标

| # | 目标 | 技术指标 | 验证方式 |
|---|---|---|---|
| G-1 | 单步可重跑 | 改切块参数只跑 `segment/validate/index`，`preflight/parse/normalize` 命中缓存 | 日志可见上游 `skipped_cached`；缓存命中 < 1s |
| G-2 | 产物可追溯 | 每个 `run_id` 可复现：记录引擎版本 + 参数 hash + 平台代码版本 | 同参数重跑产物字节级一致（除时间戳） |
| G-3 | 质量门禁生效 | `retrieval_status != 'enabled'` 的条目在检索结果中**永不出现** | agent-poc 侧集成测试 |
| G-4 | 发布可退 | 任意一次发布可在 1 步操作内回滚，回滚后库内切片数 = 快照记录值 | 发布/回滚演练 |
| G-5 | 零命令行 | 登记 → 可检索全程只通过浏览器完成 | 端到端手工验收 |
| G-6 | 断点可恢复 | 进程重启后已完成步骤产物不丢失、不重算 | 中断演练 |

### 1.3 非目标（沿用 PRD §17）

不做多用户/权限/多租户、多模态向量检索、RAPTOR、rerank、多格式（Office/EPUB/OFD）、MinerU 本地部署、平台对外提供服务、`minicare-server` 增加知识库模块、家长端任何形态改动。

---

## 2. 现状基线（代码事实，勿凭记忆开发）

> PRD-008 的最大教训是"旧 v3 文档描述了一个不存在的平台"。因此本节**只写能在代码里指到的**。

### 2.1 现有管线（可复用部分）

| 模块 | 路径 | 职责 | 复用方式 |
|---|---|---|---|
| 解析客户端 | `minicare-platform/api/src/kb_pipeline/mineru/{client,uploader,result}.py` | MinerU 云端 API 提交/轮询/下载/产物整理 | **直接复用**。⚠️ 上传须显式带 `Content-Length`（chunked 被拒 `-10002`） |
| 清洗 | `preprocess/clean.py` `headings.py` `tables.py` | 去 `<sup>`/LaTeX/页眉页脚、标题扁平化修复、表格抽取 | **直接复用** |
| 切块 | `chunking/pipeline.py`（约 180 行） | 章节切块 + 表格独立成块 + 超长降级 | **直接复用**，逻辑不动 |
| 切块备选 | `chunking/llama.py` | LlamaIndex `MarkdownNodeParser` 备选路径 | 保留但**标注"不作为生产路径"**（§4.2） |
| 页码锚定 | `anchors/page_anchor.py` | `content_list.json` 文本对齐 → `page_idx` | **直接复用** |
| 数字校验 | `validate/numbers.py` `pdf_layer.py` | 9 条正则 + pypdf 交叉校验 | **直接复用**，新增回填入口 |
| 元数据标注 | `metadata/annotate.py` | 关键词 + 风险分级 | **改造**（关键词升级，§4.5） |
| 向量化客户端 | `embed/hunyuan.py` `runner.py` | TokenHub OpenAI 兼容客户端 + 增量批量 | **直接复用**，新增维度一致性校验 |
| 入库 | `store/knowledge_base.py` | pymysql 事务 upsert | **改造**（去前缀 hack、加两字段） |
| CLI 入口 | `cli.py` | click 四步命令 | **改造**为 6 步注册表；CLI 保留可用（底层执行器 + 排障入口） |
| 单测 | `tests/`（31 个 pytest） | 切块/清洗/标题/校验/锚定/元数据 | **直接复用**，作为回归基线 |

### 2.2 消费侧（唯一消费方）

`agent-poc/src/lib/tools/search-knowledge.js` 直读 `knowledge_base`：

| 项 | 事实 |
|---|---|
| 检索方式 | FULLTEXT ngram（`title`+`content`+`keywords`）top20 + 内存全表余弦 top20 → RRF（k=60）→ top5 |
| 向量缓存 | 进程级全表缓存，10 分钟 TTL + stale-while-revalidate + 启动预热（`:58-114`） |
| 过滤条件 | `status=1` **且** `content NOT REGEXP '^\\[待复核\\]'`（`:27`）← **本方案要改的那一行** |
| 查询向量 | `agent-poc/src/lib/embeddings.js`，模型 `kinfra-text-embedding-0.6b` / 1024 维（与离线同空间） |
| 输出契约 | `{ found, items[{ id, kb_id, title, content, content_truncated, source, risk_level }], topK }`；单条 `content` 截断 800 字 |

### 2.3 现状中的三处"文档与代码不符"（本文新核出）

| # | 事实 | 证据 | 影响 |
|---|---|---|---|
| **F-1** | **`minicare-platform/api/config/` 目录不存在**，`config.py` 的 YAML 覆盖逻辑从未执行 | `config.py:11` 定义 `CONFIG_FILE`；`:138` `if CONFIG_FILE.exists()`；`ls minicare-platform/api/` 无 `config/` | `ARCHITECTURE.md` §12「阈值集中配置」是纸面声明；PRD §12.2 的 NFR 需先补文件才成立 |
| **F-2** | **`llama-index-core>=0.12` 是声明依赖且被实际使用**，但两处文档说法矛盾 | `pyproject.toml:9` 声明；`chunking/llama.py:14-15` 导入；`chunking/pipeline.py:3` docstring 说"依赖 llama-index-core"；`ARCHITECTURE.md` §1.2 说"切块不依赖" | 依赖体积与版本冲突面被低估；方案须明确"默认路径不依赖、可选路径依赖" |
| **F-3** | **无 `.venv`、无 `.env.local`、无 `var/`** | `ls -a minicare-platform/api/` 仅 `.env.example .gitignore docs pyproject.toml scripts src tests` | 现状是"在我这台机器上能跑"；方案须给出可复现的环境定义（§17.3） |

> F-1/F-2/F-3 不会阻塞平台化，但**必须在第 1 期一并收口**，否则"阈值集中"与"环境可复现"这两条 NFR 无法验收。

### 2.4 数据现状

| 项 | 值 |
|---|---|
| 源语料 | 20 份（国内 7 + 国际 13）＝ 16 PDF + 4 HTML |
| 入库条目 | 1586 条（1530 `section` + 218 `table`，另含少量 `paragraph`/`image`） |
| review 条目 | 2 条（`[待复核]` 前缀，检索端过滤） |
| 向量 | 1584 条 × 1024 维 float32 = 每条 4096B ≈ **6.5MB 全量** |
| 风险分级 | caution 26 / emergency 12 / low 1548 |
| 召回基线 | 精确 Recall@10 **97.8%（44/45）**；纯向量 86.7%；有害召回口径失真（见 PRD §4 T5） |

---

## 3. 运行环境与外部依赖边界 ★

> 本节回应需求中的"运行环境问题"：**除最终数据写入远程数据库外，其余环节均在本机执行**。

### 3.1 部署形态

```
┌────────────── 本机（macOS / Apple Silicon）──────────────┐
│                                                          │
│  平台进程（单进程）                                       │
│  ├─ FastAPI + uvicorn   :8787   ← 浏览器访问             │
│  ├─ 前端静态资源（Vite 构建产物，同端口托管）              │
│  ├─ 调度循环（单 worker，解析步骤并发 N=2）               │
│  └─ 步骤实现层（import minicare-platform/api 现有模块）             │
│                                                          │
│  本地文件系统                                             │
│  ├─ data/corpus/{doc_id}/…  产物 + edits + manifest       │
│  ├─ data/snapshots/…        发布快照                      │
│  └─ data/logs/…             JSON Lines 日志               │
│                                                          │
│  浏览器（React SPA）                                      │
└──────────────┬───────────────────────────────────────────┘
               │ 仅出向调用，不对外监听
   ┌───────────┼────────────────┬──────────────────┐
   ▼           ▼                ▼                  ▼
mineru.net  api.deepseek.com  tokenhub…   远程 MySQL（CynoSDB）
（解析）    （关键词）        （向量化）  （**唯一写入**）
```

**硬约束**：
- 平台进程**只监听 `127.0.0.1`**，不绑定 `0.0.0.0`，不做任何端口映射
- **无云端组件**：不部署 CloudRun / 云函数 / 云队列 / 对象存储
- 无鉴权（单用户本机）；若未来要局域网访问需先补鉴权（PRD 非目标）

### 3.2 执行位置与数据出域（逐环节）

| # | 环节 | 执行位置 | 外部依赖 | 出域内容 | 出域判断 |
|---|---|---|---|---|---|
| 1 | 界面与浏览器交互 | 本机 | — | — | — |
| 2 | 编排 / 任务队列 / 状态派生 | 本机 | — | — | — |
| 3 | `preflight` 预检（逐页扫描判定） | 本机 | — | — | — |
| 4 | **`parse` 解析** | 本机发起 → **MinerU 云端** | `mineru.net` | **PDF / HTML 全文** | 语料是**公开发表的指南与共识**，非患者数据；2 份"用户提供"PDF 需单独确认版权与出域意愿 |
| 5 | `normalize` 正文清洗 | 本机 | — | — | — |
| 6 | `segment` 切块 | 本机 | — | — | — |
| 7 | `validate` 数字校验 + 页码锚定 | 本机 | — | — | — |
| 8 | **关键词抽取** | 本机发起 → **DeepSeek** | `api.deepseek.com` | **切片标题 + 正文**（不含 PDF、不含元数据表） | 内容本就来自公开文献 |
| 9 | **`index` 向量化** | 本机发起 → **TokenHub** | TokenHub | **切片文本** | 同上 |
| 10 | **`index` 入库** | 本机发起 → **远程 MySQL** | CynoSDB | **最终切片数据** | 唯一写入我们自己的基础设施 |
| 11 | 发布 / 回滚 | 本机发起 → 远程 MySQL | CynoSDB | 发布数据 / 快照恢复数据 | 同上 |
| 12 | 检索质检 | 本机（读远程库） | CynoSDB | 仅读 | — |
| 13 | 线上检索日志回流 | 本机读远程库 | CynoSDB | 仅读 | 只记查询文本与命中统计，**不记用户身份/家庭数据** |

**结论：约束成立。** 平台自身的**计算与状态全部在本机**；对外的三类调用（解析/关键词/向量化）是**只读性质的外发**，不写回我们的任何基础设施；**唯一写远程的确实是最终入库与发布**。

### 3.3 "本机执行"的严格读法：已评估、不采纳

若把约束收紧为「**除入库外不允许任何外部调用**」，则需付三项代价。这三项均已评估，本期**不采纳**，但保留切换路径：

| 外部依赖 | 本机替代方案 | 切换代价 | 切换触发条件 | 详见 |
|---|---|---|---|---|
| MinerU 云端 | 本机 MinerU `pipeline` + MPS | 首装 1–3GB 模型 + **20GB 磁盘**；含扫描件时 CPU 逐页 OCR **单页可能数十秒**（这是旧 v3 PRD 评为"本期最高风险 R4"的原因） | ① 语料出现敏感未公开材料，不可出域；② 云端配额/网络成为瓶颈 | §4.1 |
| DeepSeek 关键词 | 本机小模型（Qwen2.5-1.5B 级）或规则增强 | 装 1–3GB 模型；质量与吞吐需实测；小模型的关键词质量大概率不如云端 | ① LLM 成本超预算；② 需要离线可用 | §4.5 |
| TokenHub 向量化 | 本机自托管 `bge-small-zh-v1.5`(512d) 或 `bge-m3`(1024d) | **必须全量重嵌入 1584 条并重建召回基线**；维度可能变化（512 vs 1024） | ① 免费额度耗尽且按量计费不可接受；② 要求完全离线 | §4.3 |

> **设计上的准备**：现有代码已把这三处做成可替换抽象（`MineruClient` 三种模式、`embed/` 单出口、关键词走独立网关），**切换只需改配置 + 重跑对应步骤**，不需要改业务逻辑。这是本方案"不锁死"的关键保障。

### 3.4 网络与故障假设

| 假设 | 影响 | 对策 |
|---|---|---|
| Clash 代理下系统 DNS 偶发 `ENOTFOUND api.deepseek.com` | 关键词步骤失败 | 步骤级失败 + 单步重试（§8.4）；关键词降级为规则增强并告警 |
| MinerU 云端 8s 轮询、600s 超时（现状） | 大文档解析失败 | 保持可重试；`parse` 失败不中断整批（US-03） |
| 远程 MySQL 网络抖动 | 入库/发布失败 | 入库走事务；发布走"快照 + 事务 + 发布后验证 + 可回滚"（§8.7） |
| 本机磁盘 | 产物 + 快照 + 日志增长 | 产物保留策略（§11.3）；快照保留最近 N 个 |

---

## 4. 技术选型评估 ★★

> 本节是需求方指定的重点。每个选型给出：**候选 → 评估维度打分 → 结论 → 反面论证（什么条件下会被推翻）→ 证据来源**。
> 所有"实测"数据均可复现，脚本路径见附录 B。

### 4.0 评估口径

| 维度 | 含义 | 权重 |
|---|---|---|
| **质量** | 对最终召回率/回答正确性的实际贡献（**必须实测，不接受基准分数替代**） | 高 |
| **主权** | 数据出域程度、依赖锁定程度、许可证约束 | 高 |
| **成本** | 直接费用 + 本机资源占用 | 中 |
| **运维** | 安装、升级、故障排查负担 | 中 |
| **可替换** | 换掉它需要改多少代码、重跑多少数据 | 中 |

评分：**3 = 优 / 2 = 中 / 1 = 差**。

**一条贯穿全文的方法论**：本项目已经有两次"基准分数与实测结论相反"的经验（MinerU vlm 95.39 分却丢剂量数字；kinfra 4b 高维却召回更差）。因此**任何选型变更都必须以本项目 45 题测试集上的实测为准**，基准榜单只用于筛掉明显不合格的候选。

---

### 4.1 解析引擎

**候选与既有证据**

| 候选 | 中文能力 | 表格 | 公式 | 阅读顺序 | OmniDocBench 综合 | 本机可跑 | 备注 |
|---|---|---|---|---|---|---|---|
| **MinerU `pipeline`** | ⭐⭐⭐⭐⭐（中文 TED-Struct 1.000） | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 97.5 mAP（第一） | **90.7** | ✅ MPS/CPU | 自动去页眉页脚；**低幻觉，官方推荐用于医疗/法律** |
| MinerU `vlm-engine` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 高 | **95.39** | 需 8GB+ 显存 | ⚠️ **本项目实测丢剂量数字** |
| MinerU `hybrid-engine` | 同上 | 同上 | 同上 | 同上 | 95.39 / 95.26 | 需 GPU | 复杂版式专用 |
| Marker | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 好 | ~74 | ✅ | 速度快 4×；跨页表格易断 |
| Docling | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 好 | ~72 | ✅ | 公式弱 |
| Unstructured | 中 | 中 | **弱（22%）** | 中 | ~68 | ✅ | 公式能力不可接受 |
| GROBID | **弱** | 中 | 中 | 学术结构最强 | — | 重 | 中文弱；擅长参考文献结构 |
| Nougat | **弱** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 学术专用 | — | ✅ | 中文学术排版不适用；可能幻觉 |
| PyMuPDF 兜底 | 中 | ❌ | ❌ | 简单双栏可解 | — | ✅ | 无表格/公式，仅作降级 |

**打分**

| 候选 | 质量 | 主权 | 成本 | 运维 | 可替换 | 合计 |
|---|---|---|---|---|---|---|
| **MinerU pipeline（云端 API）** | **3** | 2（PDF 出域） | 3（免费额度内） | **3**（零模型运维） | **3**（已抽象三模式） | **14** |
| MinerU pipeline（本机 MPS） | 3 | **3** | 2（20GB 磁盘 + 长耗时） | 2（模型下载/升级） | 3 | 13 |
| Marker | 2（质量降 16pt） | 2 | 3 | 3 | 2 | 12 |
| Docling | 2 | 2 | 3 | 3 | 2 | 12 |
| vlm-engine | 3（基准）/ **1（本项目实测）** | 2 | 2 | 2 | 2 | 10 |

**结论：维持 MinerU `pipeline` 档，走云端 API（S-1，不变更现状）。**

理由三条：
1. 医疗文档的失败模式不是"平均准确率低"，而是"关键数值静默丢失"。官方 `vlm-engine` 基准高 8.9 分，但本项目实测它在严重过敏共识中**丢了 9 处数字**（含 `0.5mg/次`、`25%`），而 `pipeline` 同文档仅 1 处真缺失 —— **这正是"基准分数不能替代场景验证"的实证**。
2. 云端 API 让我们零模型运维，而解析是六步里最重的环节（本机 CPU 含扫描件时可能数分钟/篇）。
3. 引擎已在 `MineruClient` 里抽象为 http/cli/cloud 三模式，本机部署是**改配置**而非改代码。

**反面论证（何时推翻）**：
- ① 语料出现**不可出域**的敏感材料 → 切本机 `pipeline` + MPS（装 1–3GB 模型、20GB 磁盘）；含扫描件需接受"页级数秒~数十秒"
- ② 出现**劣质扫描件或极端版式**导致 `pipeline` 的 86.47 分不够 → 局部切 `hybrid-engine`，但**必须先过一道数字保真校验**（用 pypdf 文字层比对），不得因基准高分直接切 vlm
- ③ **MinerU 许可证附加条款触发**（见 §12.1）→ 需履行署名义务或改自建

---

### 4.2 切块策略

**候选与既有证据**

| 候选 | 原理 | 本项目实测 | 状态 |
|---|---|---|---|
| **自研章节切块**（标题层级 + 表格独立成块 + 超长降级） | MinerU 全输出 `##`，先按中文编号正则恢复层级，再按标题路径切块 | **纯向量 Recall 64.4%**（同 4b 条件） | 现状唯一生产路径，31 个 pytest 锁定 |
| LlamaIndex `MarkdownNodeParser` | 按 markdown 标题语法切 | **纯向量 Recall 31.1%**（系统性偏低，见下） | `--splitter llama` 可选路径 |
| 定长 token 切块（`chunk_size=600`/`overlap=100`） | 按 token 数硬切 | 未接入（参数已配但代码未用） | — |
| `SemanticSplitterNodeParser` | 按相邻句向量距离找语义边界 | 未测 | — |
| `HierarchicalNodeParser`（父子块） | 生成父块 + 子块，命中子块时回填父块上下文 | 未实现（`parent_kb_id` 恒 `None`） | **已知缺口** |
| Late Chunking | 先整篇过嵌入再按边界切 | 未测 | PRD 非目标 |

**关于 31.1% 这个数字的严谨性**：该数字**不可与原值直接比较** —— 召回评测的 gold 映射表是按自研切块的 `kb_id` 体系生成的，换成 LlamaIndex 的块 id 体系后系统性偏低（`CHUNKING-COMPARE-REPORT.md` 自己标注了 `*` 号）。但两个**独立于该偏差的旁证**支持同样结论：
1. **表格被混进长正文块**：自研产出 218 个独立表格块，LlamaIndex 把表格并进正文 → 表格内容语义被稀释，而本项目语料里配方阶梯表、剂量表正是高频提问对象；
2. **MinerU 产物表格是单行 HTML**，LlamaIndex 的 `ElementNodeParser` 只认标准 md 表格语法 → **结构性不兼容**，不是参数调优能解决的。

**打分**

| 候选 | 质量 | 主权 | 成本 | 运维 | 可替换 | 合计 |
|---|---|---|---|---|---|---|
| **自研章节切块** | **3** | 3 | 3 | 3（零运行时依赖） | 2（需自己维护） | **14** |
| LlamaIndex 切块 | 1 | **3** | 2（引入重依赖） | 2 | 3 | 11 |
| 定长切块 | 1（把表格切碎） | 3 | 3 | 3 | 3 | 13（但质量不可接受） |
| 语义切块 | 2（未验证） | 3 | 2 | 2 | 3 | 12 |

**结论：维持自研为唯一生产路径；LlamaIndex 路径保留但降级为"仅用于对齐官方生态"（S-2，不变更现状）。**

**具体处置**：
- `--splitter` 参数的 `llama` 选项**保留**（便于未来对比与生态对接），但在 CLI help 与文档中明确标注"**不作生产路径**"
- `pyproject.toml` 的 `llama-index-core` 改为 **optional extra**（`[project.optional-dependencies] splitter-llama = [...]`），使默认安装不引入该依赖 → 顺带收口 §2.3 的 F-2
- `chunking/pipeline.py:3` 的 docstring 修正为"**不依赖** llama-index-core"

**反面论证（何时推翻）**：
- ① **长文档无标题场景**：自研按标题切，遇到无章节结构的文档会产出超大块（现有 `max_section_chars=1200` 只做降级不做兜底）。触发条件：出现单块 > 3000 字的文档。对策：引入定长兜底（**叠加**在章节切块之后，不替代）
  > ⚠️ **触发条件已满足（2026-10-03 实测）**：严重过敏共识存在 **16,741 字符的巨型块**。根因不止"无标题"——`_split_long` 只按空行分段，**单段落长文无法被切分**。已记为 PRD **T15**。修它会改变切块结果并使召回基线失效，**需单独决策，不在第 1 期改动**。
- ② **命中子块但缺少上下文导致回答不完整**：这是 `parent_kb_id` 恒 `None` 的直接后果。触发条件：检索质检发现"命中正确块但回答缺上文"的案例 ≥ 3 例。对策：自研实现父子块（借鉴 `HierarchicalNodeParser` 的两层结构，或直接引依赖到可选 extra）
- ③ **表格块 embedding 质量不足**：现状表格块直接嵌 HTML 全文，HTML 标签噪声会稀释语义。触发条件：表格类提问（配方阶梯/剂量表）的召回率明显低于正文类。对策：落地 PRD FR-5.4 的"双表示"——`摘要文本 + HTML`，摘要走 LLM（复用 §4.5 的网关）

---

### 4.3 向量模型

**候选与量化对比**

| 候选 | 维度 | 每条存储 | 全库(1584条) | 中文能力 | 出域 | 本机可跑 | 本项目实测 |
|---|---|---|---|---|---|---|---|
| **TokenHub `kinfra-text-embedding-0.6b`** | 1024 | 4096B | **6.5MB** | 优（单语中文优化） | 切片文本 | ❌（API） | **纯向量 Recall 86.7%** ★ |
| TokenHub `kinfra-text-embedding-4b` | 2560 | 10240B | 16.2MB | 优（多语言优化） | 切片文本 | ❌ | 纯向量 Recall **64.4%** |
| `bge-small-zh-v1.5` | 512 | 2048B | 3.2MB | 良 | 无 | ✅ 95MB 模型 | 未测 |
| `bge-base-zh-v1.5` | 768 | 3072B | 4.9MB | 良 | 无 | ✅ 400MB | 未测 |
| `bge-large-zh-v1.5` | 1024 | 4096B | 6.5MB | 良 | 无 | ✅ 1.3GB | 未测 |
| `bge-m3` | 1024 | 4096B | 6.5MB | 优（多语言） | 无 | ✅ 2.2GB（CPU 慢） | 未测 |
| `text-embedding-3-small` | 1536 | 6144B | 9.7MB | 良 | **切片文本 → OpenAI** | ❌ | 出域不可接受，直接排除 |

**关键洞察（已实测，违反直觉）**：**0.6b 全面优于 4b**（86.7% vs 64.4%，关键信息命中 13.0% vs 11.7%）。根因分析：
- 4b 是**多语言/跨语言对齐**优化的模型（CMTEB 高分主要来自多语言对齐能力），而本项目语料 **95% 中文 + 45 题均为中文问法** → 跨语言能力无用武之地
- 0.6b 轻量模型在**单语种召回**上更聚焦；4b 的 2560 维在 **1586 条的小语料**上更可能过拟合噪声
- 附带成本：4b 的存储与内存余弦计算量是 0.6b 的 **2.5 倍**（2560/1024）

**打分**

| 候选 | 质量 | 主权 | 成本 | 运维 | 可替换 | 合计 |
|---|---|---|---|---|---|---|
| **kinfra 0.6b（云端）** | **3**（实测最优） | 2（切片文本出域） | 3（免费额度内） | **3** | **3**（`embed()` 单出口） | **14** |
| kinfra 4b（云端） | 1（实测更差） | 2 | 2 | 3 | 3 | 11 |
| bge-m3（本机） | 2（未测，多语言优） | **3** | 3 | 2（2.2GB，CPU 慢） | 3 | 13 |
| bge-small-zh（本机） | 2（未测，512 维可能损失表达） | **3** | 3 | **3**（95MB） | 3 | 14（并列） |

**结论：维持 TokenHub `kinfra-text-embedding-0.6b`（S-3，不变更现状）。**

理由：① **本项目实测最优**；② 换模型 = **全量重嵌入 1584 条 + 重建召回基线**，而换来的收益未知（候选都未在 45 题上测过）；③ 现有 `embed/runner.py` 与 `agent-poc/src/lib/embeddings.js` **必须同模型同维度**，换模型要同步改两处 —— 这是最容易出隐蔽 bug 的地方（向量空间不一致会静默降质，不报错）。

**成本量级（用于判断免费额度是否够）**：
- 全库重嵌入一次：1584 条 × 平均约 600 字 ≈ 95 万字符。按中文约 0.7–1 token/字估算 ≈ **60–95 万 token**（**估算值，需实测**）。TokenHub 免费体验包 100 万 token/90 天，量级刚好覆盖一次全量 + 日常增量。
- 日常增量（每月 1–3 份新指南，约 60–180 条）≈ 4–11 万 token/月。

**反面论证（何时推翻）**：
- ① **英文语料占比显著上升**：当前只有 4 份国际指南（HTML），若未来国际文献成为主力，`bge-m3` 的多语言对齐才有价值 → 需在 45 题基础上**扩充英文题**重测
- ② **TokenHub 免费额度耗尽且按量计费不可接受**（现价约 0.7 元/百万 token 量级）→ 切 `bge-small-zh-v1.5`（95MB、512 维、纯本机），但**必须重跑召回基线**并在 PRD 记录口径变更
- ③ **知识量 > 5000 条**：不是换模型的理由，但要重算内存余弦成本（触发 §4.4 的迁移条件）
- ④ ⚠️ **换模型的隐含风险**：`knowledge_base.embedding` 里 1584 条旧向量与新向量**不可混用**。切换必须"全库重嵌入 + 校验无残留旧向量"，且 PRD D-11 已把模型版本纳入 cache key，换模型自动使全部 `index` 失效 —— 这一层保护必须在实现中落实

---

### 4.4 向量存储与检索

**候选**

| 候选 | 适用规模 | 本机部署 | 本项目成本 | 备注 |
|---|---|---|---|---|
| **MySQL BLOB + 内存余弦 + FULLTEXT ngram** | < 5000 条 | 无新增组件 | **0**（6.5MB 常驻） | 现状；RRF(k=60) 融合 |
| Chroma | 万级 | 需嵌入库/服务 | 新增组件 + 数据搬迁 | 旧 v3 文档假设使用（实际不存在） |
| pgvector | 万级 | 需 PostgreSQL | **需在远程库换引擎**，成本极高 | — |
| sqlite-vec | <10 万 | 单文件 | 需新增本地文件 + 双写 | 本机方案，但引入第二份真相 |
| Milvus / Elasticsearch | 百万级 | 重 | 与"单机单用户"完全不匹配 | PRD §5.1 已排除 |

**现状性能事实**：`agent-poc` 实测全表向量加载**冷启动约 6s**（1584 行 / 6.5MB BLOB），已用三层优化：启动预热 `preheatVectors()` + 进程级缓存 + 10 分钟 TTL + stale-while-revalidate（先返回旧数据、后台刷新）。**首个知识库问题不再付 6s 成本。**

**打分**

| 候选 | 质量 | 主权 | 成本 | 运维 | 可替换 | 合计 |
|---|---|---|---|---|---|---|
| **MySQL BLOB + 内存余弦** | 3（混合链路 97.8%） | 3 | **3** | **3** | 2（规模上限） | **14** |
| Chroma | 3 | 3 | 2 | 2 | 3 | 13 |
| sqlite-vec | 3 | 3 | 2 | 2 | 3 | 13 |
| pgvector | 3 | 3 | 1（远程换引擎） | 1 | 2 | 10 |

**结论：维持 MySQL BLOB + 内存余弦 + FULLTEXT ngram 混合检索（S-4，不变更现状）。**

**关键约束（不可省）**：**必须保持混合检索**。实测纯向量 86.7%，混合链路 97.8% —— FULLTEXT 单独救回了 6 道未命中题里的 5 道。任何"简化成纯向量"的想法都要用这组数据驳回。

**反面论证（何时推翻）**：触发条件见 PRD §5.1 与 M02 §8.3，**满足任一**即重评估：
1. 知识量 **> 5000 条**（内存余弦的 O(n) 扫描成本与全表加载时间将不可接受）
2. 需要**在线更新**（新增文章即时可检索，不允许 10 分钟 TTL）
3. 检索质量不达标且**需要精细调参权重**（内存方案只能调 RRF 的 k）

---

### 4.5 关键词抽取

**候选**

| 候选 | 质量 | 成本（全库 1586 块） | 出域 | 本机可跑 | 备注 |
|---|---|---|---|---|---|
| **云端 LLM（DeepSeek）** | 高（语义相关术语） | 约 60–130 万 token（估） | 切片标题+正文 | ❌ | 可复用 agent-poc 已有通道与 key |
| 规则增强（标题 + 正文 + 医学词典） | 中（词典覆盖决定上限） | **0** | 无 | ✅ | 现引擎已有正则能力 |
| 现状（仅标题抽 2–6 字词） | 低 | 0 | 无 | ✅ | `metadata/annotate.py:14` |
| 本机小模型（Qwen2.5-1.5B 级） | 中（需实测） | 0（一次性模型体积） | 无 | ✅ 1–3GB | 吞吐与质量都需实测 |

**现状问题的量化**：`annotate.py:14` 只扫 `chunk.title`。而 FULLTEXT 索引的正是 `(title, content, keywords)`，且评测确认 **FULLTEXT 单独救回 6 题中的 5 题** —— 即这条贡献最大的链路，喂给它的关键词只来自标题。这是 S-5 变更的直接动机。

**结论：云端 LLM（DeepSeek）为主，不可用时降级"规则增强"（不是退回"仅标题"）（S-5，变更）。**

**成本与缓存的硬约束（三条）**：
1. **结果必须落产物 + 按内容 hash 缓存**：同一块内容未变则复用，绝不重复调用（否则每次重索引都重新烧钱）
2. **降级出口**：LLM 不可用（含 §3.4 的 DNS 抖动）时降级为"标题 + 正文 + 医学词典"规则抽取并**明确告警**，索引不中断；关键词来源（`llm` / `rule`）写入 manifest
3. **预算上限**：单文档调用量与 token 量可配，超限按"跳过关键词 → 用规则结果"降级

**⚠️ 本方案新增的一条建议（回应"选型合理性"）**：**上线前先做一次 A/B 实测**。在 45 题测试集上分别用「规则增强」与「LLM 关键词」跑召回，用数据决定 LLM 是否值得。理由：
- 这是唯一一个"新增外部依赖 + 新增成本"的变更（其余九项都不变），**必须有实测支撑**
- 该项目已有两次"想当然更优、实测更差"的教训（vlm 引擎、4b 向量）
- A/B 成本极低（一次全库关键词生成 + 一次召回评测），但能避免长期成本

**反面论证（何时推翻）**：
- ① A/B 显示 LLM 与规则增强的召回差 < 1 个百分点 → **切回规则增强**（该步骤已设计为可替换，改配置即可）
- ② 成本超出预期 → 降级规则增强（**不是退回仅标题**）
- ③ 与 `M02-knowledge.md` D8 原则（"LLM 是兜底与增强，不是主路径"）的张力 → 已记录为 PRD §18 R-03，A/B 结果就是这条风险的关闭依据

---

### 4.6 编排与任务队列

**候选**

| 候选 | 本机部署 | 持久化 | 取消语义 | 与现有代码契合 | 备注 |
|---|---|---|---|---|---|
| **自研（DB 表即队列 + 单调度循环）** | 无新增组件 | ✅ DB 表 | 协作式（步骤边界检查） | **高**（同语言同进程） | PRD D-12/D-13 语义天然支持 |
| Celery + Redis | 需 Redis + worker | ✅ | 支持 | 中（需拆分任务边界） | 单用户单机严重过度设计 |
| RQ | 需 Redis | ✅ | 支持 | 中 | 同上 |
| APScheduler | 无新增组件 | ❌（内存） | ❌ | 低（面向定时而非任务编排） | 不支持"断点恢复" |
| 同步执行（现状） | 无 | ❌ | ❌ | — | 就是现在的问题 |

**结论：自研（S-6，新增）。** 队列即表 → 天然满足"进程重启后恢复"（G-6）。并发模型按 PRD D-12：**解析步骤并发（IO 密集，默认 N=2 可配）、本地步骤串行（CPU 密集）**。

**反面论证**：若引入多用户/分布式/多机 worker（PRD 非目标），才值得 Celery。当前不引入。

---

### 4.7 产物存储与缓存

**候选**

| 候选 | 可寻址 | 历史对比 | 人工编辑存续 | 备注 |
|---|---|---|---|---|
| **文件系统 + `manifest.json` + 按 `run_id` 分目录** | ✅ 路径即 hash | ✅ 目录并存 | ✅ `edits/` 跨 run | 方案选择 |
| SQLite 单文件 | ✅ | ✅ | ✅ | 需事务与并发控制；产物是 JSON/MD/图片，二进制混存不便 |
| 对象存储（COS/MinIO） | ✅ | ✅ | ✅ | 与"单机单用户"不匹配，且引入云依赖 |
| 直接存 MySQL | ✅ | 中 | 中 | 大文本与图片存 DB 是反模式；且会把产物体积压到远程库 |

**结论：文件系统 + `manifest.json`（S-7，变更）。**

**必须落实的语义**：
- 目录名 = `cache_key` 前 16 位 → 同参数重跑**命中即目录存在**，O(1) 查找
- `manifest.json` 是**执行事实的唯一来源**；DB 里的 steps 表只是物化视图，不一致时**以 manifest 为准重建**
- **顺带修掉现状缺陷 T1**：`store/knowledge_base.py:22` 的 `open(path, "a")` 追加模式改为按 `run_id` 分目录写

**反面论证**：若产物总规模 > 50GB 或需要多机共享产物 → 才引入对象存储。当前不引入。

---

### 4.8 Web 框架与前端栈

**后端候选**

| 候选 | 与 Python 管线的契合 | 异步/长任务 | 本机部署 | 合计 |
|---|---|---|---|---|
| **FastAPI + uvicorn** | **高**（可直接 import 现有模块，零跨语言） | ✅ 原生 async + SSE | 单进程 | **优** |
| Flask | 高 | 需 threading/gevent | 单进程 | 中（无原生 async） |
| Django | 中（需 ORM 迁移，与现有 pymysql 冲突） | 需 ASGI | 重 | 差 |
| 复用 `minicare-server`（NestJS） | **低**（跨语言，且该服务端无知识库模块） | — | — | 差 |

**前端候选**

| 候选 | 重交互支持（双栏校对/虚拟滚动/队列） | 复用既有 | 工具链 | 合计 |
|---|---|---|---|---|
| **React 18 + Vite 6 + Tailwind** | **强** | **复用 `minicare-web`** | 需 Node | **优** |
| 后端渲染 HTML + htmx/Alpine | 中（双栏同步滚动/切片卡片操作要手写） | 无 | 无 Node | 中 |
| Streamlit / Gradio | **弱**（交互会整页重跑，切片校对体验差） | 无 | 无 Node | 差（不适合本场景） |

**结论：FastAPI + uvicorn（后端）+ React 18 + Vite 6 + Tailwind（前端）（S-8/S-9，新增）。**

**关键设计点**：
- 前端构建产物由 FastAPI 同端口托管（`StaticFiles`），**开发期 Vite dev server 代理 `/api` 到 8787**，生产期单端口 → 无 CORS、无反向代理
- 无鉴权（单用户本机）；仅监听 `127.0.0.1`
- 长任务进度：~~用 **SSE**（`/api/tasks/{id}/stream`）而非 WebSocket（单向推送足够，实现更简单）；降级为轮询~~
  ⚠️ **实现调整（v1.1）：实际就是轮询** —— 前端无 `EventSource`、后端无 `StreamingResponse`，
  进度靠 `GET /api/queue` 轮询。SSE 作为**将来可选优化**保留在此（不阻塞当前验收）。

**反面论证**：若前端页面数 ≤ 3 且交互简单，htmx 更省；本项目有 ~~15 个页面~~ **10 个侧栏页 + 7 个工作台页签 + 2 个弹框** + 多个重交互页（内容校对、处理记录、检索质检），React 更合适。

---

### 4.9 配置与阈值管理（含 §2.3 F-1 的收口）

**问题**：`ARCHITECTURE.md` §12 声称"阈值集中配置"，但 `config/` 目录**不存在**，`config.py:138` 的 `if CONFIG_FILE.exists()` 永远为假 → 阈值实际散落在 `config.py` 的代码默认值里（`:30-60` 切块/校验、`:63-89` 来源映射、`embed` 维度等）。

**结论**（S-10）：
1. **新增 `minicare-platform/api/config/pipeline.yaml`**，把 PRD §12.2 列出的全部阈值落成实文件
2. `config.py` 加载后**启动时打印生效阈值表**，并把"来源于 YAML"还是"代码默认"标注出来 → 防止再次出现"以为改了 YAML 其实没生效"
3. **加一个测试**：修改 YAML 中某个阈值 → 断言 `get_settings()` 反映新值（锁定 F-1 不再复发）
4. 来源映射表（`doc_mapping`，20 条）**迁出到 DB**（`kb_corpus`），YAML 不再承担业务数据

**反面论证**：若阈值数量 < 10 且极少变动，留在代码里也合理。但 PRD §12.2 列了 8 类约 30 个阈值，且"调参一处生效"是明写的 NFR，必须落文件。

---

### 4.10 选型结论汇总与全局反面论证

| # | 选型点 | 结论 | 质量 | 主权 | 成本 | 运维 | 可替换 | 合计 |
|---|---|---|---|---|---|---|---|---|
| S-1 | 解析引擎 | MinerU `pipeline`（云端 API） | 3 | 2 | 3 | 3 | 3 | **14** |
| S-2 | 切块策略 | 自研章节切块 | 3 | 3 | 3 | 3 | 2 | **14** |
| S-3 | 向量模型 | TokenHub kinfra 0.6b（1024d） | 3 | 2 | 3 | 3 | 3 | **14** |
| S-4 | 向量存储与检索 | MySQL BLOB + 内存余弦 + FULLTEXT（RRF） | 3 | 3 | 3 | 3 | 2 | **14** |
| S-5 | 关键词抽取 | 云端 DeepSeek（降级规则增强） | 3 | 2 | 2 | 3 | 3 | **13** |
| S-6 | 编排与队列 | 自研 DB 表队列 | 3 | 3 | 3 | 3 | 2 | **14** |
| S-7 | 产物存储 | 文件系统 + manifest | 3 | 3 | 3 | 3 | 3 | **15** |
| S-8 | 后端框架 | FastAPI + uvicorn | 3 | 3 | 3 | 3 | 2 | **14** |
| S-9 | 前端栈 | React 18 + Vite 6 + Tailwind | 3 | 3 | 3 | 2 | 3 | **14** |
| S-10 | 配置与阈值 | `config/pipeline.yaml` + 启动打印生效值 | 3 | 3 | 3 | 3 | 3 | **15** |

**全局反面论证 —— 什么情况下整套选型需要重议**

| 触发事件 | 受影响选型 | 重议范围 |
|---|---|---|
| 语料出现**不可出域**的敏感材料 | S-1、S-3、S-5 | 三个外部依赖同时需要本机替代 → 成本与周期显著上升，需重排期 |
| 知识量 **> 5000 条** | S-3、S-4 | 内存余弦需迁向量库；维度成本需重算 |
| **多用户 / 需对外开放** | S-6、S-8、S-9 + 鉴权 | 全套需要权限体系；MinerU 许可证署名义务触发 |
| 国际文献成为语料主力 | S-3、S-2 | 需重跑含英文题的召回基线；多语言模型与分档切块纳入评估 |
| LLM 关键词 A/B 未通过 | S-5 | 切回规则增强（**其余九项不受影响**） |

---

## 5. 总体设计

### 5.1 分层与模块

> ⚠️ **实现调整（v1.1）**：下图是**分层概念**；实际目录落点 —— 后端全部在
> `minicare-platform/api/src/kb_pipeline/`（编排 = `orchestrator.py` + `platform_db.py` + `steps/`，
> 存储 = `artifact/store.py` + `platform_db.py`，API = `web/{api,routers}.py`），前端在 `minicare-platform/web/`。
> **2026-10-09 目录重组**后，`minicare-platform/` 下为 `api/` + `web/` 双子工程（原 `minicare-kb/` 整体迁入 `api/`）。详见 §0.4 B 与 §17.4。

```
┌───────────────────────── 平台进程（本机，FastAPI）─────────────────────────┐
│                                                                            │
│  界面层  web/（React SPA，Vite 构建，同端口托管）                            │
│    └─ ~~15 个页面（PRD §8.1）~~ → 实际 10 项侧栏 + 7 工作台页签 + 2 弹框      │
│                                                                            │
│  API 层  api/（REST ~~+ SSE~~ → 实际无 SSE，进度靠轮询）                     │
│    ├─ /api/corpus/*      文档库、登记、判重、版本                            │
│    ├─ /api/docs/*        处理详情、步骤、产物、队列                          │
│    ├─ /api/review/*      信息确认、内容校对、内容复核、已屏蔽内容             │
│    ├─ /api/publish/*     发布上线、发布记录、回滚                            │
│    ├─ /api/quality/*     检索质检、知识缺口                                  │
│    ├─ /api/contract/*    智能体对接、契约校验                                │
│    └─ ~~/api/tasks/{id}/stream   SSE 进度推送~~ → 实际：`GET /api/queue` 轮询 │
│                                                                            │
│  编排层  orchestrator/                                                      │
│    ├─ scheduler.py       单调度循环（解析并发 N=2，本地步骤串行）             │
│    ├─ stepper.py         步骤注册表 + 依赖解析 + 缓存判定 + 失效传播          │
│    ├─ ~~gates.py~~          ~~暂停点闸门（信息确认 / 内容校对）~~ 已移除（2026-10-09）   │
│    └─ derive.py          文档状态派生（PRD §6.4）                            │
│                                                                            │
│  步骤实现层  steps/（**薄封装，内部 import minicare-platform/api 现有模块**）           │
│    preflight · parse · normalize · segment · validate · index               │
│                                                                            │
│  引擎抽象  engines/                                                         │
│    ├─ MineruClient      http / cli / cloud 三模式（复用现有实现）            │
│    ├─ KeywordGateway    llm / rule 两模式（§8.9）                           │
│    └─ EmbeddingProvider TokenHub（复用 embed/hunyuan.py）                    │
│                                                                            │
│  存储层  store/                                                             │
│    ├─ artifacts.py      ArtifactStore（文件系统 + manifest）                 │
│    ├─ local_db.py       本机 SQLite（平台运行态，§6.3）                      │
│    └─ remote_db.py      远程 MySQL（检索面：knowledge_base + search_log）    │
└────────────────────────────────────────────────────────────────────────────┘
                    │                                    │
        data/corpus/**（产物 + edits + manifest）   远程 CynoSDB
```

### 5.2 与现有代码的接驳原则

| 原则 | 说明 |
|---|---|
| **不重写** | `mineru/` `preprocess/` `chunking/pipeline.py` `anchors/` `validate/` `embed/` **原样复用**，平台只做编排与界面 |
| **不引入新解析/切块实现** | 引擎抽象只做"调用方式"的统一，不改算法 |
| **CLI 保留可用** | `kb-pipeline` 仍可跑六步（作为底层执行器与排障入口）；平台调用同一批函数，**不复制逻辑** |
| **产物即事实** | 界面显示的一切（步骤状态、统计、成本）都从产物与 manifest 派生，DB 只做加速索引 |
| **人工决定跨 run 存续** | `edits/` 目录与 manifest 分离，重跑不覆盖（PRD U-09） |

### 5.3 六步注册表

| # | `step_id` | 输入 | 输出产物 | 引擎 | 外部调用 |
|---|---|---|---|---|---|
| 1 | `preflight` | 源文件 | `pipeline/preflight.json`（页数、扫描页清单、推荐档位、预计耗时） | pypdf 逐页 | — |
| 2 | `parse` | 源文件 + preflight | `pipeline/parse/`（md + content_list.json + images/）+ `raw/` | MinerU 云端 | ✅ mineru.net |
| 3 | `normalize` | parse | `pipeline/normalize.json`（章节树 + 块列表，含 page/bbox/type） | 规则 | — |
| 4 | `segment` | normalize + 台账元数据 | `pipeline/segment/chunks.json` + 噪声标记 | 规则 | — |
| 5 | `validate` | segment | `pipeline/validate/{review.json,chunks.tagged.json}`（复核项 + 风险分级 + 关键词） | 规则 + pypdf + **LLM** | ✅ api.deepseek.com |
| 6 | `index` | segment + validate + edits | `pipeline/index/{result.json}`（向量版本、全文统计、目标库写入记录） | TokenHub | ✅ tokenhub + 远程库 |

**依赖与闸门**：`preflight → parse → normalize → [segment, validate] → index`。
~~暂停点 1 在 `normalize` 完成与 `segment` 开始之间（元数据须在切块前确定）；暂停点 2 在 `validate` 完成与 `index` 开始之间。~~
**（2026-10-09）六步之间已无任何人工闸门**，「信息确认 / 切片校对」随时可做、不影响流程能否继续。

---

## 6. 数据设计

### 6.1 存储分布 ★（PRD §11.5 未区分，本文定义）

> **PRD §11.5 列了 6 张新表，但没说它们该放本机还是远程库。** 这不是笔误级问题——它直接决定 §3 的运行环境约束成不成立，因此本文补充定义。

**分配原则**：**只有"必须被远端组件读写"或"就是最终检索数据"的表放远程库；平台自身的运行态一律放本机。**

| 数据 | 存放位置 | 理由 |
|---|---|---|
| `knowledge_base`（+ 迁移 021 两字段） | **远程 MySQL** | 被 `agent-poc`（生产跑在 CloudRun）读取，是最终检索数据 |
| `kb_search_log`（线上检索日志） | **远程 MySQL** | ⚠️ **写入方是生产环境的 agent-poc（CloudRun）**，它无法写本机文件 —— 这决定了它必须在远程库 |
| `kb_corpus`（文档档案 / 台账） | **本机 SQLite** | 纯平台运行态；登记、台账编辑不产生远程写 |
| `kb_task`（任务队列） | **本机 SQLite** | 队列是本机调度器的工作台 |
| `kb_doc_state`（**实现新增**） | **本机 SQLite** | 文档级人工产物：只存"信息确认"表单取值（`meta_json`），无闸门标记 |
| `kb_keyword_cache`（**实现新增**） | **本机 SQLite** | 关键词按块内容 hash 缓存，避免重复调 LLM（§8.9 的硬约束） |
| `kb_recall_case` + `kb_recall_gold`（评测集与 gold） | **本机 SQLite** | 只在平台内使用 |
| `kb_publish`（发布记录） | **本机 SQLite** | 发布动作由平台发起；记录供平台展示 |
| `kb_gap`（知识缺口） | **本机 SQLite** | 由平台聚合（输入是远程的 search_log + 回归结果） |
| `manifest.json` / 产物 / `edits/` | **本机文件系统** | §4.7 |
| 页图缓存 `data/pages/{doc_id}/{scale}/` | **本机文件系统** | 工作台与文档管理缩略图共用（`_pdfium_lock` 串行渲染） |
| 发布快照 | **本机文件系统** `data/snapshots/` | §8.7 |

> 📌 **本机 SQLite 实际共 8 张表**（上表 8 行本机表）。`kb_search_log` 仍未建（见 §0.4 D）。

**这样分配的效果**（正是 §3 约束的落点）：
- 平台**除入库/发布/读检索日志外，与远程库无交互**；断网也能完成登记 → 解析 → 切块 → 校验 → 评测的全流程（只有最后入库需要连库）
- 平台运行态数据的备份 = **拷贝 `data/` 目录**，与远程库解耦
- 远程库只承担"检索面"职责，schema 极简（2 张表）

**与 PRD 的偏差**：PRD §11.5 把 6 张新表并列列出，读者会自然理解为同一库。**建议回写 PRD** 明确本机/远程分布（记入 §0.3 的偏差清单，编号 X-4）。

### 6.2 远程库改动

**迁移 021**（`minicare-server/migrations/021_knowledge_retrieval_status.sql`）—— **只加列，不回填**：

> ⚠️ **回填与清理必须独立成脚本，不能写进迁移文件。** 原因见 §9.1：它们的执行时机被五阶段序列严格约束（加列 → 平台双写 → 回填 → agent 切换 → 清理），若混在迁移里自动执行，会导致"前缀被提前删除而 agent 还在用前缀过滤"→ **2 条 review 条目直接进检索**。

```sql
-- 021_knowledge_retrieval_status.sql  —— 仅结构变更，幂等
-- 目标：MySQL 8 / CynosDB
ALTER TABLE `knowledge_base`
  ADD COLUMN `retrieval_status` VARCHAR(10) NOT NULL DEFAULT 'enabled'
      COMMENT 'enabled=可检索 / excluded=噪声块已屏蔽 / review=数字待复核' AFTER `risk_level`,
  ADD COLUMN `review_state` VARCHAR(12) NULL
      COMMENT 'pending/accepted/rejected/edited；仅 retrieval_status=review 时有值'
      AFTER `retrieval_status`,
  ADD KEY `idx_kb_retrieval_status` (`retrieval_status`);
```

**回填脚本**（`scripts/backfill-retrieval-status.py`，§9.1 阶段 3 执行）—— **只改字段，保留前缀**：

```sql
-- 回填：仅 2 条。'[待复核]' 为 5 个字符：[ 待 复 核 ]  →  清理阶段用 SUBSTRING(content, 6)
-- ⚠️ 不能用 TRIM(LEADING '[待复核]' FROM content)
--    TRIM 按"字符集"删除而非按子串，会误伤正文中以这些字开头的合法内容
UPDATE `knowledge_base`
   SET `retrieval_status` = 'review',
       `review_state`     = 'pending'
 WHERE `content` LIKE '[待复核]%';   -- LIKE 中 '[' 是字面量，非字符类
```

**清理脚本**（`scripts/clean-review-prefix.py`，§9.1 阶段 5 执行，**不可逆**）—— 字段已就位、agent 已切换后才执行：

```sql
UPDATE `knowledge_base`
   SET `content` = SUBSTRING(`content`, 6)
 WHERE `content` LIKE '[待复核]%';
```

**新增表 `kb_search_log`**（远程，写入方为生产 agent-poc）：

```sql
CREATE TABLE IF NOT EXISTS `kb_search_log` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT,
  `queried_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `query_text`      VARCHAR(500) NOT NULL COMMENT '查询文本（不记用户身份/家庭数据）',
  `env`             VARCHAR(16)  NOT NULL COMMENT 'dev/prod',
  `hit_count`       SMALLINT     NOT NULL DEFAULT 0,
  `top1_score`      DECIMAL(6,4) NULL COMMENT 'top1 相似度，用于「低分」判定',
  `found`           TINYINT(1)   NOT NULL DEFAULT 0,
  `latency_ms`      INT          NULL,
  PRIMARY KEY (`id`),
  KEY `idx_kb_search_log_time` (`queried_at`),
  KEY `idx_kb_search_log_found` (`found`, `queried_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='知识库检索日志（缺口分析的输入；不含任何用户身份信息）';
```

### 6.3 本机库 `data/platform.db`（SQLite，WAL 模式）

> ⚠️ **实现调整（v1.1）**：本机库实际是 **8 张表** —— 下表 6 张之外还有
> **`kb_doc_state`**（`doc_id` / `region` / `meta_json` / `updated_at`，存"信息确认"表单取值，即原 Q-11 的落点；
> `meta_confirmed` / `chunks_approved` 两列已随暂停点移除）与
> **`kb_keyword_cache`**（关键词按块内容 hash 缓存）。
> 另：`kb_corpus` 实际**没有 `sha256` 列**、多一个 `note` 列；`doc_id` 语义见下。

**`kb_corpus` — 文档档案**

```sql
CREATE TABLE kb_corpus (
  doc_id         TEXT PRIMARY KEY,             -- ⚠️ 实际 = 源文件名 stem（_safe_doc_id），
                                               --    不是内容 sha256：预检/解析要按
                                               --    {source_dir}/{国内|国际}/{doc_id}{后缀} 定位源文件。
                                               --    内容 sha256 只作临时判重值（same_content），不入表。
  filename       TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL DEFAULT 0,
  kind           TEXT NOT NULL,                -- pdf / html
  source_name    TEXT NOT NULL,                -- 必填（业务层校验）
  publisher      TEXT,
  year           INTEGER,                      -- 必填
  region         TEXT,                         -- cn / intl（必填）
  evidence_level TEXT,                         -- guideline/consensus/RCT/policy/edu（必填）
  applicable_age TEXT,
  license        TEXT,                         -- 空表示未标注（台账标 ⚠）
  source_url     TEXT,
  obtained_at    TEXT,                         -- YYYY-MM-DD
  version        INTEGER NOT NULL DEFAULT 1,
  supersedes     TEXT REFERENCES kb_corpus(doc_id),
  superseded_by  TEXT REFERENCES kb_corpus(doc_id),
  kb_domain      TEXT NOT NULL DEFAULT 'default',   -- 预留（PRD D-03）
  status         TEXT NOT NULL DEFAULT 'pending',   -- ⚠️ 实际取值见下注
  field_source   TEXT,                          -- JSON：各字段来源 + 置信度
  note           TEXT,                          -- 实现新增：人工备注
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX uk_corpus_domain_source ON kb_corpus(kb_domain, source_name, version);
CREATE INDEX idx_corpus_status ON kb_corpus(status);
```

> ⚠️ **`status` 取值已收窄（2026-10-09）**：原设计的
> `pending/processing/awaiting_meta/awaiting_review/ready/published/stale/archived` 中，
> **`awaiting_meta` / `awaiting_review` 已随暂停点移除** —— 派生状态只剩
> **失败 > 待更新(`stale`) > 已就绪(`ready`) > 处理中(`processing`) > 待处理(`pending`)** 五档（见 §8.5）。

**`kb_task` — 任务队列**

```sql
CREATE TABLE kb_task (
  task_id       TEXT PRIMARY KEY,
  doc_id        TEXT NOT NULL REFERENCES kb_corpus(doc_id),
  kind          TEXT NOT NULL,              -- pipeline / step_run
  step_id       TEXT,                       -- step_run 时指定
  params_json   TEXT,                       -- 步骤参数覆盖
  force         INTEGER NOT NULL DEFAULT 0, -- 绕过缓存
  state         TEXT NOT NULL DEFAULT 'queued',  -- queued/running/done/failed/cancelled
  progress_hint TEXT,                       -- 阶段级描述，如「解析中 · 已等待 1m42s」
  error         TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  enqueued_at   TEXT NOT NULL DEFAULT (datetime('now')),
  started_at    TEXT,
  finished_at   TEXT
);
CREATE INDEX idx_task_state ON kb_task(state, enqueued_at);
CREATE INDEX idx_task_doc ON kb_task(doc_id);
```

**`kb_recall_case` / `kb_recall_gold` — 评测集与 gold 映射**（PRD D-19 的口径落地）

```sql
CREATE TABLE kb_recall_case (
  case_id    TEXT PRIMARY KEY,        -- 如 A-04
  module     TEXT NOT NULL,           -- A–H 模块
  question   TEXT NOT NULL,
  theme      TEXT,                    -- 主题（缺口聚合用）
  enabled    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE kb_recall_gold (
  case_id       TEXT NOT NULL REFERENCES kb_recall_case(case_id),
  kb_id         TEXT NOT NULL,        -- 主块（每条目 1–2 个）
  is_primary    INTEGER NOT NULL DEFAULT 1,
  gold_version  TEXT NOT NULL DEFAULT 'v2-manual',  -- 口径版本（PRD R-09：口径变更须留痕）
  mapped_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (case_id, kb_id)
);
```

**`kb_gap` — 知识缺口**

```sql
CREATE TABLE kb_gap (
  gap_id        TEXT PRIMARY KEY,
  theme         TEXT NOT NULL,
  attribution   TEXT NOT NULL,      -- coverage_gap / slice_excluded / gold_stale （§8.10 归因）
  occurrences   INTEGER NOT NULL DEFAULT 1,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL,
  suggestion    TEXT,
  state         TEXT NOT NULL DEFAULT 'open',   -- open / closed / deferred
  close_reason  TEXT,               -- deferred 时必填
  linked_doc_id TEXT REFERENCES kb_corpus(doc_id)  -- 关联的补录语料
);
CREATE UNIQUE INDEX uk_gap_theme_attr ON kb_gap(theme, attribution);
```

**`kb_publish` — 发布记录**（本文新增，补 PRD §11.5 缺口 X-1）

```sql
CREATE TABLE kb_publish (
  publish_id    TEXT PRIMARY KEY,
  published_at  TEXT NOT NULL DEFAULT (datetime('now')),
  target_env    TEXT NOT NULL,      -- dev / prod
  snapshot_name TEXT NOT NULL,      -- data/snapshots/snapshot__<ts>
  docs_added    INTEGER NOT NULL DEFAULT 0,
  docs_updated  INTEGER NOT NULL DEFAULT 0,
  chunks_written INTEGER NOT NULL DEFAULT 0,
  vectors_written INTEGER NOT NULL DEFAULT 0,
  check_result  TEXT,               -- JSON：发布前 4 项检查的逐项结果
  verify_result TEXT,               -- JSON：发布后 4 项验证的逐项结果
  forced        INTEGER NOT NULL DEFAULT 0,  -- 是否经「仍然发布」二次确认放行
  rolled_back_at TEXT
);
```

### 6.4 索引设计要点

| 表 | 索引 | 服务的查询 |
|---|---|---|
| `knowledge_base`（远程） | `idx_kb_retrieval_status`（新增） | 检索端 `WHERE retrieval_status='enabled'`（**替代原 REGEXP 前缀反查**） |
| `knowledge_base`（远程） | 保留 `ft_kb_ngram`、`idx_kb_category`、`idx_kb_risk` | 混合检索与过滤 |
| `kb_search_log`（远程） | `idx_kb_search_log_found (found, queried_at)` | 「近 7 天未命中 TOP」聚合 |
| `kb_corpus`（本机） | `idx_corpus_status` | 文档库按状态筛选 |
| `kb_task`（本机） | `idx_task_state (state, enqueued_at)` | 调度器取下一个任务、队列位置展示 |
| `kb_gap`（本机） | `uk_gap_theme_attr` | 缺口聚合去重（同主题同归因只留一条，occurrences 累加） |

### 6.5 回填与双写过渡

见 §9.1（跨项目一致性是本文风险最高的一处改动，单独成节）。

---

## 7. 接口与契约

### 7.1 REST 分组

> ⚠️ **实现调整（v1.1）**：下表是**规划期的分组示意**。实际实现是 **`routers.py` 45 个 + `api.py` 13 个 ≈ 58 个端点**，
> 路径与下表有差异（例如发布实为 `/api/publish/{state,plan,checks,run,snapshot,rollback}`，
> 新增 `/api/corpus/excerpts`、~~`/api/metadata`~~（2026-10-09 随全库视图删除）、`/api/docs/{id}/meta-extract`、`/api/docs/{id}/segments` 等）。
> **权威清单见 §0.4 C**；**没有 SSE**（进度靠轮询 `/api/queue`）。

| 分组 | 端点（示例） | 对应故事 |
|---|---|---|
| 文档库 | `GET/POST /api/corpus`、`GET /api/corpus/{doc_id}`、`POST /api/corpus/{doc_id}/supersede` | US-01、US-02 |
| 处理 | `POST /api/docs/{doc_id}/run`、`GET /api/docs/{doc_id}/manifest`、`POST /api/docs/{doc_id}/steps/{step}/run`、`POST /api/tasks/{task_id}/cancel` | US-03、US-08 |
| 产物 | `GET /api/docs/{doc_id}/steps/{step}/artifact`、`GET /api/docs/{doc_id}/steps/{step}/runs`、`POST .../runs/{run_id}/set-current` | US-08 |
| 信息确认 | `GET/PUT /api/docs/{doc_id}/meta`、`POST /api/docs/{doc_id}/meta/confirm` | US-04 |
| 内容校对 | `GET /api/docs/{doc_id}/chunks`、`PATCH /api/chunks/{chunk_id}`、`POST /api/chunks/{chunk_id}/{split,merge}`、`POST /api/docs/{doc_id}/approve` | US-05 |
| 内容复核 | `GET /api/docs/{doc_id}/review`、`POST /api/review/{item_id}/{accept,reject,manual,unresolvable}` | US-06 |
| 已屏蔽内容 | `GET /api/docs/{doc_id}/excluded`、`POST /api/excluded/{kb_id}/restore` | US-07 |
| 入库结果 | `GET /api/docs/{doc_id}/index-result` | US-09 |
| 发布上线 | `POST /api/docs/{ids}/publish`、`GET /api/publish`、`POST /api/publish/{id}/rollback` | US-10 |
| 检索质检 | `POST /api/quality/run`、`GET /api/quality/latest`、`GET /api/quality/compare` | US-11 |
| 知识缺口 | `GET /api/gaps`、`POST /api/gaps/{id}/{link,defer}` | US-12 |
| 智能体对接 | `GET /api/contract`、`POST /api/contract/validate`、`GET /api/contract/observe` | US-13 |
| 进度 | ~~`GET /api/tasks/{task_id}/stream`（SSE）~~ → **实际：`GET /api/queue` 轮询** | 全部 |

### 7.2 统一响应与错误模型

沿用项目既有约定（`AGENTS.md`：**无全局响应包裹**，API 直接返回数据）：

```jsonc
// 成功
{ "doc_id": "...", "status": "ready" }      // ⚠️ 原示例为 awaiting_meta，该状态已随暂停点移除

// 失败
{ "error": { "code": "STEP_FAILED", "message": "解析失败：MinerU 返回 -10002",
             "detail": { "step": "parse", "retryable": true } } }
```

错误码（枚举，前端按码映射文案）：`VALIDATION_FAILED` / `STEP_FAILED` / ~~`GATE_BLOCKED`~~（已随暂停点移除） / `CONFLICT_DUPLICATE` / `EXTERNAL_UNAVAILABLE` / `DB_UNAVAILABLE` / `CONTRACT_VIOLATION` / `NOT_FOUND`。

### 7.3 检索契约（对齐 agent-poc 现状，PRD §9.1）

| 类别 | 内容 |
|---|---|
| 响应结构 | `found` · `items[]` · `topK` |
| 条目字段 | `id` · `kb_id` · `title` · `content` · `content_truncated` · `source` · `risk_level` |
| 过滤参数 | `query` · `riskLevel` · `category` |
| 语义约束 | ① `retrieval_status != 'enabled'` 永不出现 ② `content` 超 800 字截断并置 `content_truncated=true` ③ 未命中返回 `{found:false,message:'知识库未找到相关内容'}` |

**契约校验器**（§8.11）在发布前执行，校验项：
1. 语义约束①在检索实现中确实生效（**用一条 `excluded` 的测试数据实测**，不是读代码）
2. 响应结构与字段集未被删减（对字段集做集合比较）
3. 向量维度与库内已有向量一致（抽样校验 BLOB 长度）

### 7.4 与 `minicare-server` 的边界

**零接口**。`minicare-server` 没有也没有必要有知识库模块（PRD §2.3）。平台不经服务端，`agent-poc` 也不用服务端。

---

## 8. 详细设计

### 8.1 产物布局与 `run_id`

> ⚠️ **实现调整（v1.1）**：实际**没有 `file/`**（源文件在 `docs/knowledge/source/raw/{国内,国际}/<doc_id>.<ext>`，
> `doc_id` = 文件名 stem），多了一个 **`llm/metadata.json`**（元信息 LLM 抽取的落点）；
> `pipeline/` 下还有 `.tmp/`（原子写的中间态）。`edits/` 实际存 `chunks.edited.json` / `excludes.json` / `review_resolutions.json` / `marks.json`。

```
data/corpus/{doc_id}/
  file/                     # ❌ 实际不存在（源文件在 docs/knowledge/source/raw/）
  raw/                      # parse 原始产物，永不清理（PRD FR-1.6 思路）
  pipeline/
    preflight/{cache16}/preflight.json
    parse/{cache16}/        # md + content_list.json + images/
    normalize/{cache16}/normalize.json
    segment/{cache16}/chunks.json
    validate/{cache16}/{review.json, chunks.tagged.json}
    index/{cache16}/result.json
    .tmp/                   # 原子写中间态（写全 → rename 进最终目录）
  llm/metadata.json         # 元信息 LLM 抽取结果（实现新增）
  edits/                    # 人工产物，跨 run 存续
    chunks.edited.json
    excludes.json
    review_resolutions.json
    marks.json              # 切片问题标记（实现新增）
  manifest.json             # 执行事实唯一来源
```

```
cache_key = sha256(
    step_id,
    ⨁ 上游产物内容 hash,
    params_hash,
    engine_version,          # 如 mineru@4.0.10-pipeline / self-chunker@v1
    platform_version         # 平台代码版本（PRD D-11）
)
目录名 = cache_key[:16]
run_id = "run__{engine}@{engine_version}__{params_hash[:8]}"
```

> 目录名即 `cache_key[:16]` → **同参数重跑命中即"目录已存在"**，O(1) 判定，不需要查索引。

### 8.2 失效传播

```
invalidate(preflight) → parse → normalize → segment → validate → index   （全部 stale）
invalidate(parse)     → normalize → segment → validate → index
invalidate(normalize) → segment → validate → index
invalidate(segment)   → validate → index
invalidate(validate)  → index
invalidate(index)     → （无下游）
```

**参数级失效**（上游未变但自身或环境变了，也要显式标 `stale`，不能静默 miss）：

| 变更 | 失效范围 |
|---|---|
| 换向量模型 | **全部文档**的 `index` |
| 换关键词 prompt 版本 | 全部文档的 `validate` + `index` |
| 改切块阈值（`max_section_chars` 等） | 该文档 `segment` 及下游 |
| 改噪声规则 | 该文档 `segment` 及下游 |
| 升级平台代码 | 该文档全部步骤（cache key 含 `platform_version`） |

### 8.3 步骤执行流程

```
run(doc_id, step_id, params, force):
  1. 读 manifest 取上游 current_run → 收集输入产物引用
     └ 任一上游 failed / 无产物 → 报错退出（不允许盲跑）
  2. ~~闸门检查：step 需要 gate 且闸门未开 → 置 waiting_gate 挂起~~
     已移除（2026-10-09）：六步之间无任何人工关卡，直接进入第 3 步
  3. 计算 cache_key → 目录存在且非 force：
     └ schema 校验产物 → 标 skipped_cached 返回（< 1s）
  4. 能力短路：输入产物 capabilities 不满足本步所需 → 产出空集 + skipped_no_capability（计成功）
  5. 写 kb_task.state=running → 调步骤函数（工作目录 = 本次产物目录）
     └ 步骤内周期性检查 cancel_requested（协作式取消）
  6. schema 校验产物 → 追加 manifest run 记录、更新 current_run
  7. 失效传播：下游标 stale（**产物文件不删**）
  8. 派生器刷新 kb_corpus.status
```

### 8.4 队列、并发与取消

| 项 | 设计 |
|---|---|
| 队列 | `kb_task` 表即队列；调度循环每 500ms 取 `state='queued'` 最早一条 |
| 并发 | **解析步骤**用线程池 `N=2`（可配）；**本地步骤**（normalize/segment/validate/index）走单线程串行，避免 CPU 争抢 |
| 原子性 | 产物先写 `.tmp/{run_id}` → 全部写出后 `os.rename` 到最终目录 → **保证目录不出现半成品** |
| 取消 | `cancel_requested=1`；执行中的任务在**步骤边界**或解析轮询间隙检查并退出；已完成步骤产物保留 |
| 断点恢复 | 启动时扫 `state='running'` 的孤儿任务 → 检查产物目录：完整性校验通过则置 done，否则删 `.tmp` 残留并置 `queued` |
| 进度 | 阶段级字符串写入 `kb_task.progress_hint`；~~SSE 每 1s 推一次~~ → **实际实现为轮询**（`GET /api/queue`，无 SSE/`StreamingResponse`）；**不做百分比**（PRD D-14） |

### 8.5 状态派生

```python
def derive_status(steps) -> str:
    # 2026-10-09：人工暂停点已移除，不再有 awaiting_meta / awaiting_review 两级
    if any(s == 'failed'  for s in steps.values()):        return 'failed'
    if any(s == 'stale'   for s in steps.values()):        return 'stale'
    if steps.index.ok:                                     return 'ready'
    if any(s == 'running' for s in steps.values()):        return 'processing'
    return 'pending'
```

派生器在每次 manifest 变更后同步执行，结果写 `kb_corpus.status`（文档库列表直查）。

### 8.6 噪声块规则引擎（PRD §7.5）

| 规则 | 判定（全在 `config/pipeline.yaml` 可调） | 默认 |
|---|---|---|
| `reference_list` | 块标题匹配 `^(参考文献\|引用文献\|References?\|Bibliography)$`（忽略大小写）**且** 块位置在文档后 20% | 屏蔽 |
| `empty_table` | `chunk_type='table'` 且去标签后字符数 < 20，或只有表头行无数据行 | 屏蔽 |
| `page_furniture` | 块文本 < 40 字 **且** 匹配页码模式 **且** 在 `content_list` 中跨页重复出现 | 屏蔽 |
| `figure_no_caption` | `chunk_type='image'` 且无配对题注且无描述文本 | 屏蔽 |

**两条硬约束**：
1. 屏蔽 = **不参与向量化与全文索引**（`retrieval_status='excluded'`），但数据保留、清单可见
2. **人工决定优先于规则**：`edits/excludes.json` 记录 `{kb_id: 'restore'}`，规则重算时先应用人工决定 → 恢复过的块不会被规则再次屏蔽

### 8.7 发布快照与回滚

```
发布前：
  0. 先算「发布计划」（`publish.py::plan()` / `POST /api/publish/plan`，2026-10-09 新增）：
     只把**已就绪**的文档（索引完成、无失败/无待重跑、必填元数据完整、无未决复核项）
     纳入发布范围；未就绪文档逐份给出原因与修复入口，**不拦发布**
  1. 跑发布前 4 项检查（元数据完整 / 无未处理红色标记 / 屏蔽块已确认 / 检索质检达标）
     —— **只对发布范围内的文档计算**
  2. 生成快照 data/snapshots/snapshot__{ts}/
       ├─ chunks.jsonl      目标库当前全部切片（kb_id + content + 元数据字段 + retrieval_status）
       ├─ vectors.jsonl     向量（BLOB → hex）
       └─ meta.json         切片数、向量数、涉及 doc_id 集合、时间戳
  3. 开启事务 → 按文档增量 upsert knowledge_base → 写 kb_search_log 归属不变
  4. 提交 → 跑发布后 4 项验证（切片数一致 / 无 NULL 向量 / 抽样检索命中 / Agent 连通）
  5. 写 kb_publish 记录

回滚：
  1. 读快照 → 事务内：删除本次新增的 kb_id、恢复被修改的 kb_id、恢复 retrieval_status
  2. 跑发布后验证（切片数须等于快照记录值）
  3. kb_publish.rolled_back_at 置位
```

> **快照为什么存切片全集而非 diff**：回滚的可靠性优先于存储（PRD D-16）。当前库 1586 条、content 全文约 6–10MB，单快照成本可接受；保留最近 N 个（N 可配，默认 5）。

### 8.8 内容复核四态流转

```
validate 步骤产出（初态）
  hit_regex → retrieval_status='review', review_state='pending'
                    │
        ┌───────────┼────────────┬──────────────┐
        ▼           ▼            ▼              ▼
   accept(补全)  manual(填值)  reject(误报)  unresolvable(无法补全)
   补值+去前缀   补值+去前缀   → enabled     保持 review
   → enabled      → enabled    记入规则例外   review_state 保留
   review_state='accepted'  ='edited'  ='rejected'  =NULL
        │
        └─► 内容被修改的条目**强制重算该块向量**（PRD US-06 场景 4）
```

**规则例外**：`reject` 的条目把 `(doc_id, kb_id, rule_id)` 写入 `edits/review_resolutions.json`，下次 `validate` 跳过 → "不再重复提醒同一条"（PRD US-06 场景 2/3）。

### 8.9 关键词网关（§4.5 落地）

```
KeywordGateway.extract(chunks) →
  if llm_enabled and budget_ok and api_reachable:
      prompt = prompts/keyword_extraction/v1.md
      按块调用（并发 4）→ 解析 JSON {keywords[], confidence}
      source = 'llm'
  else:                                    # 降级：LLM 不可用 / 超预算 / 用户关闭
      keywords = 标题词 ∪ 正文医学词典命中词 ∪ 高频 2–6 字词（jieba/正则）
      source = 'rule'
      warnings.append('关键词降级为规则抽取')
  写回产物（含 source），并**按块内容 hash 缓存**：同 hash 不重复调用
```

**缓存数据结构**（`pipeline/validate/{cache16}/keyword_cache.json`）：
```jsonc
{ "sha256:块内容": { "keywords": ["肾上腺素","急救处理"], "source": "llm", "prompt_version": "v1" } }
```

**Prompt 版本化**：`prompts/keyword_extraction/v1.md`；启动校验"目录内每个 prompt 文件名含版本号"，版本号进 manifest 与 cache key。

### 8.10 缺口归因

```
未命中题 → 判定归因：
  1. gold 块存在但 retrieval_status != 'enabled'   → slice_excluded  （给「内容校对」入口）
  2. gold 映射指向的 kb_id 在当前切块产物中不存在     → gold_stale       （给「重映射」入口）
  3. 库里相关块存在，但 top1 相似度 < 该主题均值      → coverage_gap     （给「补录语料」入口）
```

**gold 失效识别**（PRD US-11 场景 3 的关键）：跑回归前先比对 `kb_recall_gold.kb_id` 与当前 `segment` 产物的 `kb_id` 集合。若有缺失 → **报「gold 映射已失效，需重映射」并中止评测**，绝不把失效静默算成未命中。

### 8.11 契约校验器

```python
def validate_contract(db, impl) -> list[Violation]:
    v = []
    # 1. 语义约束①：插一条 retrieval_status='excluded' 的样本 → 实测检索不会返回
    if impl.search("__contract_probe__").contains(probe_id): v.append(...)
    # 2. 字段集：实现返回的 key 集合 ⊇ 契约声明的字段集
    v += diff(REQUIRED_FIELDS, impl.search("x").items[0].keys())
    # 3. 向量维度：抽样 5 条，len(embedding) == 4 * 声明维度
    v += dim_check(db)
    return v
```

**校验时机**：发布前自动执行（US-13 场景 7）；**校验失败 → 阻断发布**。

---

## 9. 上线、迁移与回滚

### 9.1 H1：迁移 021 的 expand-contract 执行序 ★★

> 这是本方案**风险最高**的一处改动：同时动生产库结构、1586 条存量数据、以及另一个独立项目（`agent-poc`）。顺序错了会导致**要么被屏蔽的参考文献块重新进检索，要么检索直接报错**。

**必须严格按此序执行**（每步含验收断言）：

| 阶段 | 动作 | 为什么这个顺序 | 验收断言 |
|---|---|---|---|
| **1. 加列** | 上迁移 021 的 `ALTER TABLE`（只加列 + 索引，**不含回填 UPDATE**） | 新列默认 `enabled`，此时 2 条 review 在字段上是 `enabled`，但 **`content` 前缀还在** → agent-poc 的旧 REGEXP 过滤仍然挡得住 | 列存在；`SELECT COUNT(*) WHERE content LIKE '[待复核]%'` = 2 |
| **2. 平台写入** | 平台代码开始写 `retrieval_status`/`review_state`；**同时保留 `content` 前缀**（双写） | 双写窗口内两条过滤条件**都能**正确工作 → 任一侧未完成都不出错 | 新入库的 review 条目字段正确 **且** 前缀仍在 |
| **3. 回填状态** | 执行迁移 021 的 `UPDATE`：把 2 条置 `review/pending`，**前缀不动** | 只改字段不动前缀 → 旧过滤继续有效 | 字段位为 `review/pending`；前缀仍存在 |
| **4. agent-poc 切换** | `search-knowledge.js:27` 过滤条件改为 `retrieval_status='enabled'`；向量缓存加载条件（`:64-66`）同步 | 此时字段已是准确的真相源 → 可以安全切换 | 集成测试：插入一条 `excluded` 样本，**检索不返回**（这是 §8.11 的契约校验第 1 项） |
| **5. 清理前缀** | 执行清理脚本 `UPDATE ... SET content = SUBSTRING(content, 6) WHERE content LIKE '[待复核]%'`；平台去掉双写 | 旧过滤已不生效，前缀成为冗余脏数据 | 全库 `content LIKE '[待复核]%'` = 0；检索语义与第 4 步一致 |

**📌 实施进度（2026-10-09 实测）**

| 阶段 | 状态 | 证据 |
|---|---|---|
| 1. 加列 | ✅ **已在 dev 完成** | `SHOW COLUMNS knowledge_base` 含 `retrieval_status` / `review_state` |
| 2. 平台写入 | 🟡 代码就位（`store/knowledge_base.py` 会写两字段），**未跑过真实入库**（`ALLOW_WRITE=False`） | — |
| 3. 回填状态 | ❌ **未执行** | 全库 1586 行均为 `enabled/NULL`，2 条 `[待复核]` 前缀仍在 ⇒ 字段还不是真相源 |
| 4. agent-poc 切换 | ❌ 未做 | `search-knowledge.js` 仍用 `content NOT REGEXP` 前缀过滤（双写兜底**正在**起作用） |
| 5. 清理前缀 | ❌ 未做（不可逆，必须最后） | — |

> 🔴 **当前处于"阶段 1 已做、阶段 3 未做"的中间态，这是本迁移最危险的窗口**：字段可读写但不是真相源。
> 若此时推进阶段 4，**那 2 条 review 会直接进检索**（违反契约语义约束①）。
> **推进顺序不可跳步：先跑 `scripts/backfill-retrieval-status.py`（阶段 3），再谈阶段 4。**
>
> ⚠️ 另：`kb_search_log`（远程新表，§6.2）**尚未建**，US-13 的"线上检索观察"暂无数据源。

**回滚设计**：阶段 1–3 可回滚（删列 / 恢复字段）；阶段 4 回滚需同时回退 agent-poc 与平台；阶段 5 **不可逆**（前缀已删）→ 但此时系统已在新语义上稳定运行，回滚价值低。

**分期约束（PRD §14.4 硬约束 3 的落地）**：阶段 1–3 在 **dev 库**完成并演练；阶段 4–5 才上生产。**第 1 期只在 dev 演练，不碰生产**。

### 9.2 灰度与回滚

| 项 | 设计 |
|---|---|
| 灰度 | 平台是本机单用户工具，**无灰度概念**；"灰度"等价于"先在 dev 库跑通再切生产库" |
| 数据回滚 | 发布回滚走快照（§8.7）；迁移回滚见 §9.1 |
| 代码回滚 | 平台与 CLI 同仓；回滚 = 切回上一个 git tag；产物按 `run_id` 保留，旧版本可复现 |
| 降级开关 | 三处：解析档位（`fast`/`standard`）、关键词（`llm`/`rule`）、关键词触点数（预算） |

### 9.3 环境定义（收口 §2.3 F-3）

```bash
# 唯一受支持的环境定义（Python 版本与 pyproject 的 requires-python 对齐）
cd minicare-platform/api
python3.13 -m venv .venv
.venv/bin/pip install -e ".[dev,web]"          # 默认不含 llama-index（§4.2 收口 F-2）；web 起服务必需
.venv/bin/pip install -e ".[splitter-llama]"   # 仅当需要对比 LlamaIndex 切块时
.venv/bin/pip install -e ".[render]"           # 仅当需要页面栅格化（工作台 bbox 高亮）时

# 平台（实况：后端在 minicare-platform/api 内，前端独立）
cd ../minicare-platform/web && npm ci && npm run build   # 前端构建 → dist/ 由后端同端口托管
cd ../../minicare-platform/api && .venv/bin/kb-pipeline serve       # 监听 127.0.0.1:8787
# ⚠️ 不再有 `uvicorn app.main:app` —— `minicare-platform/app/` 从未创建（§0.4 T-1 / §17.4）
```

**`.env` 必填项**：`MINERU_API_TOKEN` / `TOKENHUB_API_KEY` / `DEEPSEEK_API_KEY` / 远程库三项（`REMOTE_DB_HOST/PORT/USER/PASSWORD/NAME`）。全部只存本机 `.env`（`.gitignore` 保护），**不进 git、不进任何日志**。

---

## 10. 可观测性与指标

| 层 | 记录内容 | 落点 |
|---|---|---|
| 步骤级 | 每次 run 的 `duration_ms` / `stats` / `cached` / `engine_version` / `platform_version` | `manifest.json` |
| 外部调用级 | 调用方（parse/keyword/embed）、耗时、token 数（关键词）、成功与否 | `manifest.json` + `data/logs/` |
| 检索级 | 查询文本、命中数、top1 相似度（**不含用户身份**） | 远程 `kb_search_log` |
| 质量级 | 每次质检的 Recall@10 / 有害召回 / 页码溯源 + 口径版本 | `kb_recall_*` + 快照目录 |
| 平台级 | 任务状态变更、缓存命中/失效、~~闸门开合~~（已移除）、降级触发 | `data/logs/platform-YYYY-MM-DD.jsonl`（JSON Lines，按天滚动） |

**关键指标（用于验收与容量规划）**：单文档六步总耗时、关键词步骤耗时占比、缓存命中率、召回 Recall@10 趋势、LLM token 消耗/月。

---

## 11. 性能与容量

### 11.1 实测与估算

| 环节 | 量级 | 来源 |
|---|---|---|
| `preflight` | ~0.9s/文档 | 现有实现观察 |
| `parse` | **1–2 分钟/文档**（云端，六步里最重） | 现有实现观察；**含扫描件时显著更长且不做承诺** |
| `normalize` | ~3s | 同上 |
| `segment` | ~2.4s | 同上 |
| `validate`（规则部分） | ~2s | 同上 |
| `validate`（关键词 LLM） | **约 40 块 × 2s ≈ 80s/文档**（首次；**估算，需实测**） | §4.5；有缓存后趋近 0 |
| `index`（向量化） | 约 40 块 × ~100ms ≈ 4s | 现有 `embed()` 延迟观察 |
| `index`（入库） | < 1s（批量 upsert） | — |
| 向量全表加载（检索端） | **冷启动 ~6s**，已有预热 + TTL 优化 | `search-knowledge.js` 注释实测 |
| 向量内存占用 | 1584 条 × 4096B ≈ **6.5MB** | 计算值 |

> ⚠️ **单文档六步总耗时将从现状的约 2 分钟上升到约 3.5–4 分钟**，增量主要来自关键词步骤。这是 S-5 的直接代价，**必须用 A/B 实测来判断是否值得**（§4.5）。

### 11.2 容量边界

| 指标 | 当前 | 需重评估的阈值 | 触发后动作 |
|---|---|---|---|
| 条目数 | 1586 | **5000** | 迁向量库（§4.4） |
| 向量内存 | 6.5MB | 5000 条 ≈ 20MB | 仍可接受，但全表扫描 O(n) 成本需测 |
| 产物磁盘 | — | 50GB | 引入保留策略 / 对象存储（§4.7） |
| 快照磁盘 | 单快照 ≈ 6–10MB | 保留 5 个 ≈ 50MB | 可调 N（§8.7） |
| 日志 | 按天滚动 | — | 保留 90 天 |

### 11.3 保留策略

| 类别 | 策略 |
|---|---|
| `raw/` 解析原始产物 | **永不清理** |
| 非 current 的 run 产物 | 超过 N 个后清理（默认 N=3，**可配**） |
| `edits/` 人工产物 | 永不清理 |
| 快照 | 保留最近 5 个 |
| 日志 | 保留 90 天 |

---

## 12. 安全与合规边界

### 12.1 许可证义务

| 组件 | 许可证 | 义务 | 本项目现状 |
|---|---|---|---|
| MinerU | **Apache-2.0 + 附加条款** | ① MAU > 1 亿或月收入 > 2000 万美元需商业授权；② **对外提供在线服务须显著标注"使用了 MinerU"**，否则授权自动终止 | **本期不触发**（单用户本机、不对外服务）。台账的合规区块已内置署名义务记录（PRD US-02） |
| llama-index-core | MIT | 无 | 仅 optional extra |
| FastAPI / React / Vite / Tailwind | MIT | 无 | — |
| PyMuPDF | **AGPL** | ⚠️ 现有 `validate/pdf_layer.py` 用 pypdf；若历史代码曾用 PyMuPDF 需确认 | ✅ **已核查（2026-10-09）：未使用** —— `grep -riE 'pymupdf\|import fitz'` 零命中；依赖只有 `pypdf` 与 `pypdfium2`。**AGPL 风险不存在** |
| pypdfium2（`render` extra） | Apache-2.0 / BSD-3（pdfium） | 无 | 在用（页面栅格化，与 MinerU 同源 pdfium） |

> ⚠️ **PyMuPDF 是 AGPL**，与闭源/商用服务共存的合规风险高于 MinerU。本文第 13 章新增一条核查项；若实际使用，建议替换为 pypdf 或 pdfminer.six。
> 📌 **该核查项已于 2026-10-09 关闭：未使用**（原 Q-05）。

### 12.2 数据出域口径

| 出域对象 | 出域内容 | 判断 |
|---|---|---|
| mineru.net | **PDF / HTML 全文** | 语料为公开发表的指南与共识，非患者隐私数据；**2 份"用户提供"文档需单独确认**（§16 Q-04） |
| api.deepseek.com | 切片标题 + 正文 | 内容来自公开文献；**不含**元数据表、不含 `kb_corpus` 台账字段 |
| TokenHub | 切片文本 | 同上 |
| 远程 CynoSDB | 最终切片数据 | 自家基础设施 |

**明确不出域**：家庭与宝宝健康数据、用户身份、会话内容、检索日志中的任何身份信息。

### 12.3 密钥与日志

- 全部密钥仅存本机 `.env`（`.gitignore` 保护），**不进 git、不写入日志、不在错误消息中回显**
- 日志脱敏：外部调用失败只记状态码与截断后的响应片段（沿用现有 `embeddings.js` 的做法）
- 平台仅监听 `127.0.0.1`，无鉴权是**在"单用户本机"前提下的自觉选择**；若未来需局域网访问，必须先补鉴权（PRD 非目标 N1/N8）

---

## 13. 测试与验收

| 层 | 方法 | 覆盖 |
|---|---|---|
| 单元 | 沿用现有 31 个 pytest；新增噪声规则、`cache_key`、失效传播闭包、`derive_status`、缺口归因、契约校验器 | §1.2 G-1~G-6 |
| 编排 | 缓存命中（二次 run < 1s）、失效闭包、~~闸门挂起/放行~~（已移除）、取消边界、断点恢复（杀进程重启） | G-1、G-6 |
| 发布 | 快照生成与恢复、写入中途失败回退、发布后 4 项验证各自能独立失败 | G-4 |
| 迁移 | §9.1 五个阶段的**逐步断言**；在 dev 库演练含"插入 `excluded` 样本后检索不返回" | G-3、§9.1 |
| 回归 | 45 题测试集全量跑；**口径版本变更时同时输出新旧两套结果**（PRD R-09） | 召回基线不回退 |
| 契约 | 契约校验器对三类破坏的拦截（删字段 / 语义约束失效 / 维度不一致） | G-3 |
| 端到端 | 新增一份指南 → 到可被检索，**全程只通过浏览器** | G-5 |

**上线闸门**：① 45 题 Recall@10 ≥ 95%；② 契约校验通过；③ §9.1 阶段 1–3 在 dev 演练通过。

---

## 14. 实施计划

**与 PRD §14.3 分期严格对齐**（每期可独立发版、独立验收）：

| 期 | 本方案交付模块 | 技术收口项 | 独立验收 | 实施状态（2026-10-09 重核） |
|---|---|---|---|---|
| **第 1 期 · 地基** | `artifact/`（ArtifactStore + manifest）+ `orchestrator/`（队列/调度/失效/派生）+ 6 步注册表 + `api/` 骨架 + 处理详情/处理进度页 | **F-1 配置 YAML 落文件**、**F-2 llama-index 降为 optional**、F-3 环境定义；迁移 021 **仅 dev 演练** | 改切块参数只重跑 ④⑤⑥；杀进程重启能续跑 | ✅ 代码 + 实测完成（§14.5） |
| **第 2 期 · 安全底线** | `quality/`（噪声规则引擎 + 内容复核四态 + 编辑存续）+ **§9.1 阶段 1–4 上生产** | `agent-poc` 过滤条件切换；双写过渡 | 参考文献块不进检索；回填一条数字后再检索能命中 | 🟡 代码完成；**021 仅 dev 加列，阶段 3 未跑；agent-poc 未同步** |
| **第 3 期 · 接入与把关** | `corpus/`（登记 + 判重 + 台账）+ 信息确认页 + 内容校对页 | `doc_mapping` 20 条迁入 `kb_corpus`；**§9.1 阶段 5 清理** | 新增语料零改代码；重切后旧编辑可找回 | 🟡 代码完成；US-01 上传已实测；**「文档详情」无独立页面**（§0.4 E） |
| **第 4 期 · 发布闭环** | `publish/`（快照 + 增量写入 + 发布后验证 + 回滚）+ `regression/`（质检 + gold 维护） | `kb_publish` 表；gold 迁移到 `kb_recall_gold`（口径 v2） | 发布前 4 项检查各自能拦；一键回滚不重解析 | 🟡 代码完成；**未对真实库实跑** |
| **第 5 期 · 自我改进** | `index/` 关键词网关升级 + `gap/`（缺口归因）+ `contract/`（契约校验器） | **关键词 A/B 实测**（§4.5）；prompt 版本化目录 | 关键词含正文词；未命中能归因；删契约字段被拦下 | 🟡 代码完成；**A/B 未做；`kb_search_log` 未建** |
| **并行轨 A** | 契约文档冻结 + 校验器 | **零依赖，可立即开工** | 契约校验能拦下删字段 | ✅ `KB-CONTRACT.md` v1 已冻结；校验器代码完成 |

**关键路径与依赖**：
- 第 1 期是所有后续期的前置（无产物版本则"只重跑下游"不成立）
- 第 2 期必须在第 3 期之前（先有安全底线，再有更快的接入）
- §9.1 的阶段 5（清理前缀）**不可逆**，必须在阶段 4 稳定运行 ≥ 1 周后执行

---

### 14.5 第 1 期实施进度（2026-10-03）

| 交付项 | 状态 | 落点 |
|---|---|---|
| `config/pipeline.yaml` 真实落地（收口 T12） | ✅ | `minicare-platform/api/config/pipeline.yaml`（11 个分组） |
| 启动打印生效阈值 + **每项来源标注**（yaml / code-default） | ✅ | `config.format_effective_table()`、`kb-pipeline config` |
| YAML 合并改用 `model_validate` | ✅ | 原 `model_copy` 不做类型转换，会把 `Path` 静默变成 `str` |
| 默认源/产物路径修正（原指向不存在的 `docs/敏宝知识库/*`） | ✅ | 改为 `docs/knowledge/source/{raw,mineru-parsed}` |
| llama-index 降为 optional extra（收口 T13）+ docstring 矛盾修正 | ✅ | `pyproject.toml` 的 `[splitter-llama]` |
| 产物仓库：按 `run_id` 分目录 + manifest + **原子写**（`.tmp`→rename） | ✅ | `artifact/store.py` |
| `cache_key` = 步骤 + 上游产物 hash + 参数 hash + 引擎版本 + **平台代码版本** | ✅ | 目录名 = `cache_key[:16]` |
| 失效传播（下游标 `stale`、产物不删） | ✅ | `ArtifactStore.invalidate` |
| 六步注册表 + 启动拓扑自检 | ✅ | `registry.py` |
| 六步实现（薄封装，复用现有模块，不重写算法） | ✅ | `steps/{preflight,parse,normalize,segment,validate,index}.py` |
| 任务队列（SQLite：入队/位置/取消/断点恢复/持久化） | ✅ | `platform_db.py` |
| 文档状态派生（PRD §6.4） | ✅ | `orchestrator.derive_status` |
| CLI：`steps` / `config` / `run` / `step` / `show` / `invalidate` / `queue` / `drain`（旧命令保留可用） | ✅ | `cli.py` |
| 修 T1（`chunks.jsonl` 追加累积） | ✅ | 产物改按 run 分目录 |
| 本地测试 | ✅ **94 passed** | 原有 37 + 新增 57 |

**第 1 期有意未做**：
- **Web 界面**（FastAPI + React）—— 骨架已能被 CLI 完整驱动，界面属第 1 期后半段
- **迁移 021 的任何写操作**（含 dev 演练）—— 按 §9.1 严格留到第 2 期
- 噪声块规则 / LLM 关键词 / 发布快照 / 检索质检 / 缺口台账 —— 属第 2·4·5 期
- `index` 的**真实入库路径（`--write`）未在本地验证**（需 DB 与 `TOKENHUB_API_KEY`）；默认 dry-run 只产出计划

**实测确认的行为等价性**：对 `严重过敏反应诊断和临床管理专家共识_2025` 跑六步，得到 **59 块（56 章节 + 3 表格）**、**2 条 review** —— 与库内该文档的 59 条、已知 2 条 review 完全一致，说明切块与校验行为与现有管线等价（不是"新写了一套"）。

---

### 14.6 第 2~5 期与界面：全量落地（2026-10-09 重核）

> 与 §14.5 不同，本节**不是"逐步验证过"的进度表**，而是"**代码全写完了、但没真跑过**"的清单。
> 交付口径：`模块可导入 + CLI 可运行 + 页面可渲染`。

| 交付项 | 状态 | 落点 |
|---|---|---|
| 噪声块规则引擎 + 人工决定优先（US-07） | ✅ 代码 | `quality/noise.py`、`steps/segment.py`、`edits/excludes.json`、工作台「已屏蔽内容」 |
| 内容复核四态流转（US-06） | ✅ 代码 | `quality/review.py`、工作台「内容复核」、CLI `review resolve` |
| 台账 / 两级来源预填 / 判重（US-01、US-02） | ✅ 代码 | `corpus/ledger.py`、`POST /api/corpus/upload`（dry→登记）、`docs/prd` 同款台账字段 |
| 切片校对（US-05） | ✅ 代码 | `edits/store.py`（含相似度找回）、`edits/marks.py`、工作台「切片对照」、CLI `chunks *` |
| 发布快照 / 检查 / 回滚（US-10） | ✅ 代码 | `publish.py`、`/api/publish/*`、CLI `publish *` |
| 召回回归 + gold 失效识别（US-11） | ✅ 代码 | `regression.py`、`retrieval.py`（含 trace 诊断出参）、`/api/quality/*`（含**检索测试** `/quality/search`）、CLI `quality *`、`Quality.tsx`、`RetrievalTest.tsx`（检索测试独立页，2026-10-09 抽出；调研见 TECH-023） |
| 缺口三类归因（US-12） | ✅ 代码 | `gaps.py`、`/api/gaps/*`、CLI `gaps *` |
| 契约校验器（US-13） | ✅ 代码 | `contract.py`、`/api/contract/*`、CLI `contract *`、`KB-CONTRACT.md` |
| 关键词网关（LLM + 规则降级 + 内容级缓存） | ✅ 代码 | `keywords.py`、`kb_keyword_cache`（78 行有数据） |
| LLM 元信息抽取（实现新增，PRD 未列） | ✅ 代码 | `metadata/llm_extract.py` + `schema.py`、`/api/metadata/*`、`/api/docs/{id}/meta-extract` |
| 文档工作台 + 双向联动（US-14） | ✅ 代码 | `anchors/chunk_align.py`（行号链）、`md_align.py`、`block_regions.py`、`render_pages.py`、`Workbench.tsx` + `SourceCompare.tsx` |
| 「文档管理」卡片矩阵 + PDF 缩略图 + 原文摘要 | ✅ 代码 | `Corpus.tsx`、`GET /api/corpus/excerpts`、`/api/overview.has_pdf` |
| React 前端全量（10 侧栏项 + 7 工作台页签 + 2 弹框） | ✅ 代码 | `minicare-platform/web/`（42 文件 / 23 `.tsx`） |
| CLI 命令组（8 组 / 30 子命令） | ✅ 代码 | `cli_extra.py` |
| **以上全部的真实路径验收** | ❌ **未做** | 需真库 + gold 数据 + `TOKENHUB_API_KEY` / `MINERU_API_TOKEN` —— 见 PRD-008 `06` §3 的未验证清单 |

---

## 15. 风险与对策

| # | 风险 | 等级 | 对策 |
|---|---|---|---|
| R-01 | **§9.1 顺序执行错误**导致屏蔽块重新进检索或检索报错 | **高** | 严格按五阶段执行，每阶段带断言；阶段 1–3 先在 dev 演练 |
| R-02 | **关键词 LLM 性价比不足**（耗时 +80s/文档、成本 +60–130 万 token） | **高** | 上线前 A/B 实测（§4.5）；不达标即切规则增强（改配置，不改代码） |
| R-03 | LLM/向量服务不可用（含 §3.4 的 DNS 抖动） | 中 | 关键词降级规则 + 告警；向量降级"仅全文索引" + **明确告警**（不静默降级） |
| R-04 | MinerU 云端网络/配额阻塞解析 | 中 | 单份失败不中断整批 + 单步重试；引擎抽象保留本机切换路径 |
| R-05 | 换向量模型时新旧向量混用（静默降质，不报错） | 中 | 模型版本进 cache key（PRD D-11）+ 入库前维度一致性校验 + 全库重嵌入后校验无残留旧向量 |
| R-06 | 产物磁盘膨胀 | 低 | §11.3 保留策略；`raw/` 与 `edits/` 除外 |
| R-07 | 自研平台范围蔓延（加权限/协作/多库/定时） | 中 | 以 PRD §17 非目标 + §14.4 分期硬约束为边界 |
| R-08 | ~~**PyMuPDF 的 AGPL 许可证**（若实际在用）~~ | ~~中~~ **已关闭** | ✅ **2026-10-09 核查：未使用**（依赖为 `pypdf` + `pypdfium2`，无 AGPL 组件） |
| R-09 | 质检口径变更（gold v2）导致历史指标不可比 | 低 | 口径版本字段 + 变更时同时输出新旧两套结果（PRD R-09） |

---

## 16. 遗留待确认

| # | 待确认 | 影响 | 建议关闭时机 | 状态（2026-10-09） |
|---|---|---|---|---|
| Q-01 | 平台服务端口（本文暂定 `8787`）与实际占用 | 仅配置 | 第 1 期开工前 | ✅ **已定：8787**（`cli.py` 默认值，只监听 127.0.0.1） |
| Q-02 | 解析步骤并发度上限（本文暂定 `N=2`） | 云端配额与 MPS/CPU 负载 | 第 1 期结束前实测 | ⏳ 未实测 |
| Q-03 | **关键词 A/B 实测方案**（用哪 45 题、判定阈值） | 决定 S-5 是否落地 | **第 5 期开工前，越早越好** | ⏳ **仍未做** —— 代码已就位（`keywords.py` + CLI `keywords`），A/B 未见结果 |
| Q-04 | 2 份"用户提供"PDF 的**版权与出域许可** | 决定它们能否走 MinerU 云端与 LLM | 第 2 期开工前 | ⏳ 未确认 |
| ~~Q-05~~ | ~~**PyMuPDF 是否实际在使用**（AGPL 核查）~~ | 合规 | 第 1 期结束前 | ✅ **已关闭：未使用**（依赖仅 `pypdf` + `pypdfium2`，无 AGPL 组件） |
| Q-06 | 快照保留个数 N（本文默认 5）与产物保留个数（默认 3） | 磁盘 | 第 4 期开工前 | ⏳ 未定 |
| Q-07 | 本机 SQLite 与远程库的**台账一致性对账频率**（PRD US-02 场景 4） | 数据准确性 | 第 3 期开工前 | ⏳ 未定 |
| Q-08 | 检索日志保留时长与清理策略 | 磁盘与隐私 | 第 5 期开工前 | ⏳ 未定（**表本身也还没建**） |
| Q-09 | 前端重交互页的虚拟滚动阈值（内容校对单篇最大 60+ 块） | 性能体验 | 第 3 期开工前 | ⏳ 未定（工作台已用懒加载 + 分页缓解） |
| Q-10 | **`_split_long` 单段落失效（PRD T15）的修复时机与范围** —— 已实测存在 16,741 字符巨型块，触发条件已满足 | 修它会改变切块结果 → 召回基线 97.8% 失效、必须重新评测 | **第 2 期评审时专门决策** | ⏳ **仍未决**，排在与迁移 021 阶段 3 之后 |
| ~~Q-11~~ | ~~`meta_confirmed`（暂停点 1）与 `chunks_approved`（暂停点 2）的**持久化位置**~~ | **作废（2026-10-09）**：人工暂停点机制整体移除，该问题不再存在 | — | ✅ 已由 `kb_doc_state` 承接（只剩 `meta_json`） |
| Q-12 | 产物保留策略的实际取值（`artifact_keep_runs` 默认 3）是否够用 | 磁盘与"历史对比"能力的权衡 | 第 2 期实测后 | ⏳ 未实测 |
| **Q-13（新增）** | **`kb_search_log` 何时建表**（远程库） | US-13「线上检索观察」无数据源；缺口归因缺线上输入 | 第 5 期验收前 | ⏳ 未建 |

---

## 17. 涉及文件清单

### 17.1 新增（平台）

> ⚠️ **实现调整（v1.1）**：下面是**规划树**，**实际没有 `minicare-platform/app/`** ——
> 后端全部落在 `minicare-platform/api/src/kb_pipeline/`（**2026-10-09 目录重组**：原 `minicare-kb/` 整体迁入
> `api/`，即规划中 `app/` 的实定名；`minicare-platform/` 下现为 `api/` + `web/`）。
> 规划中的 `engines/` 也未成包（关键字在 `keywords.py`、向量在复用 `embed/`、解析在复用 `mineru/`）。
> **实际清单见 §17.4a。**

```
minicare-platform/                  # ← 规划容器；实际为 api/ + web/（原 minicare-kb 迁入 api/）
├── app/                            # ← 规划名；实际定名为 api/（含全部后端 + data/）
│   ├── main.py                     FastAPI 入口 + StaticFiles 托管前端
│   ├── api/                        REST 分组（§7.1 / 实际见 §0.4 C）
│   ├── orchestrator/{scheduler,stepper,gates,derive}.py
│   ├── steps/{preflight,parse,normalize,segment,validate,index}.py
│   ├── engines/{mineru_client,keyword_gateway,embedding_provider}.py
│   ├── store/{artifacts,local_db,remote_db}.py
│   └── prompts/keyword_extraction/v1.md
├── web/                            React 18 + Vite 6 + Tailwind（~~15 个页面~~ → 10 侧栏 + 7 页签 + 2 弹框）
└── data/{platform.db,corpus/,snapshots/,logs/}   # ← 实际数据根在 minicare-platform/api/data/
```

### 17.2 改造（现有）

| 文件 | 改动 | 风险 |
|---|---|---|
| `minicare-platform/api/pyproject.toml` | `llama-index-core` → optional extra `splitter-llama`（已落地，另增 `web` / `render` 两个 extra） | 低 |
| `minicare-platform/api/config/pipeline.yaml` | **新增**（收口 F-1，§4.9） | 低 |
| `minicare-platform/api/src/kb_pipeline/config.py` | 阈值来源标注 + 启动打印生效值 | 低 |
| `minicare-platform/api/src/kb_pipeline/cli.py` | 4 步 → 6 步注册表（CLI 保留）；新增 `serve`；**删除 `pause` 命令组与 `--meta-confirmed`** | 低 |
| `minicare-platform/api/src/kb_pipeline/store/knowledge_base.py` | 去掉 `[待复核]` 前缀 hack；`open(path,"a")` → 按 `run_id` 分目录；写入两字段 | **高**（生产库 + 存量回填） |
| `minicare-platform/api/src/kb_pipeline/metadata/annotate.py` | 关键词抽取升级为网关调用 | 中 |
| `minicare-platform/api/src/kb_pipeline/chunking/pipeline.py` | 增加噪声判定调用；docstring 修正 F-2；**切片落盘改按 `doc_order_key`（文档阅读顺序）排序** | 低 |
| `minicare-platform/api/src/kb_pipeline/embed/runner.py` | 维度一致性校验 + 仅全文降级路径 | 低 |
| `minicare-platform/api/src/kb_pipeline/mineru/{result,uploader}.py` | 保留 `middle.json`（供 span 级 bbox）；`ensure_dir` | 低 |
| `minicare-platform/api/src/kb_pipeline/web/{api,ui}.py` | **实际承载后端 Web 层**（`api.py` 建应用 + 13 端点 + StaticFiles 托管；`ui.py` 内嵌回退页） | 中 |
| `minicare-server/migrations/021_knowledge_retrieval_status.sql` | **新增**（**dev 已应用，回填未跑**） | **高** |
| `agent-poc/src/lib/tools/search-knowledge.js` | 过滤条件改字段（`:27`、`:64-66`）；旁路写检索日志 —— **尚未改动** | **高**（跨项目） |

### 17.3 脚本

| 脚本 | 用途 | 状态（2026-10-09） |
|---|---|---|
| `scripts/backfill-retrieval-status.py` | 迁移 021 回填（§9.1 阶段 3） | ⏳ **未执行** |
| `scripts/clean-review-prefix.py` | 清理 `[待复核]` 前缀（§9.1 阶段 5，**不可逆**） | ⏳ 未执行 |
| `scripts/migrate-gold-v2.py` | `var/kb_mapping.json` → `kb_recall_gold`（人工精修） | ⏳ 未执行（`kb_recall_case/gold` 实测 0 行） |
| `scripts/ab-keyword.py` | 关键词 A/B 实测（§4.5 Q-03） | ⏳ 未见结果 |
| `scripts/snapshot-verify.py` | 快照与目标库一致性校验 | ⏳ 未执行 |
| `scripts/audit_continuations.py` | **实现新增**：审计跨栏/跨页段落续排的认领结果 | ✅ |
| `scripts/copy-pdfjs.mjs` | **实现新增**（前端）：pdf.js 资源同源拷贝 | ✅ |
| `scripts/eval-recall-exact.py` / `eval-chunking-compare.py` | 选型证据脚本（保留） | ✅ |

### 17.4 实际落点（与 §17.1 计划的偏差说明，2026-10-09 重核）

**偏差一**：计划把平台建在独立的 `minicare-platform/app/` 目录；实现期后端长期留在原 `minicare-kb/` 工程内。
**2026-10-09 目录重组**已把 `minicare-kb/` 整体迁入 `minicare-platform/api/`（`app/` 规划名实定为 `api/`），
至此**目录结构与 §17.1 规划对齐**（差异仅剩命名与子包粒度）。
**偏差二**：~~Web 层（FastAPI + React）仍按原计划独立成 `minicare-platform/`~~ ——
前端按计划独立为 `minicare-platform/web/`；**后端未按子包拆分**（`orchestrator/` `steps/` `engines/` 仍平铺在 `kb_pipeline/` 包内，见下方"理由"）。

**理由**：交付物（六步编排、产物仓库、队列、状态派生、REST）都要直接 import
`mineru/` / `preprocess/` / `chunking/` / `validate/` / `embed/` / `store/`，同包可零跨包边界复用，
也不必先做包拆分重构。**这是有意的取舍，不是遗留问题**；若未来要拆，`web/routers.py` 已是被 HTTP 隔离的边界。

**第 1 期实际新增文件**（`minicare-platform/api/src/kb_pipeline/`）：

| 文件 | 职责 |
|---|---|
| `config/pipeline.yaml` | 阈值唯一来源（仓库根 `config/`，首次真实存在） |
| `fsutil.py` | `ensure_dir` 幂等建目录（见 §17.5） |
| `registry.py` | 六步定义、依赖拓扑、下游闭包、拓扑自检 |
| `artifact/store.py` | `ArtifactStore`：cache_key / run 目录 / manifest / 失效传播 / 保留策略 |
| `artifact/__init__.py` | 对外出口 |
| `steps/__init__.py` | `StepContext` + 步骤函数分发 |
| `steps/{preflight,parse,normalize,segment,validate,index}.py` | 六步实现（薄封装） |
| `platform_db.py` | SQLite（`kb_task` 队列 + 台账 + 评测 + 缺口 + 发布 + 关键词缓存 + 文档状态，共 8 张表） |
| `orchestrator.py` | 执行、缓存、~~闸门~~（已移除）、状态派生、队列消费 |

**实际改造文件**：`config.py`（YAML 加载与来源标注）、`cli.py`（六步命令 + 旧命令保留 + `serve`）、`pyproject.toml`（optional extra）、`store/knowledge_base.py`（去追加语义 + `ensure_dir`）、`mineru/uploader.py`（`ensure_dir` + 显式目标路径）、`chunking/pipeline.py`（docstring 修正）、`.gitignore`（加 `data/`）。

**测试**：新增 `tests/{test_config,test_registry,test_artifact,test_steps,test_orchestrator}.py` + `conftest.py` 增补 4 个 fixture。

### 17.4a 第 2~5 期实际新增文件（`minicare-platform/api/src/kb_pipeline/`）

> 这些是**计划外新增或计划中未点名**的落点。模块职责见 PRD-008 `06` §2。

| 文件 | 职责 |
|---|---|
| `corpus/ledger.py` | 台账 CRUD + 两级来源预填 + 判重（`same_content` / `same_name`） |
| `quality/{noise,review}.py` | 噪声块规则引擎 / 内容复核四态流转 |
| `edits/{store,marks}.py` | 人工产物（编辑 / 排除 / 复核结论）+ 相似度找回 / 切片问题标记 |
| `keywords.py` | 关键词网关（LLM + 规则降级 + 内容级缓存） |
| `retrieval.py` | 平台侧参考检索（质检独立评测用） |
| `regression.py` | 召回回归 + gold 失效识别 |
| `gaps.py` | 缺口三类归因 |
| `publish.py` | 发布前检查 + 快照 + 增量写入 + 发布后验证 + 回滚 |
| `contract.py` | 检索契约三类校验 |
| `block_regions.py` | 块级 bbox 反推（无 `middle.json` 时的回落路径） |
| `anchors/chunk_align.py` | **切片 ↔ 原文行号链对齐**（命中 100%；`find_continuations()` 处理跨栏/跨页） |
| `md_align.py` | md 按块切段（工作台双向联动） |
| `render_pages.py` | pypdfium2 页图栅格化（`_pdfium_lock` 串行） |
| `metadata/{llm_extract,schema}.py` | LLM 按语料级共享 schema 抽取元信息 |
| `web/{api,routers}.py` | REST（13 + 45 端点）；`routers.py` 是新前端契约的载体 |
| `cli_extra.py` | 8 个命令组 / 30 个子命令 |

**前端新增**：`minicare-platform/web/`（`src/` 42 文件 / `pages/` 23 `.tsx` / `components/` 7 个 / `lib/` 8 个）+ `scripts/copy-pdfjs.mjs`。

> 📌 **`doc_id` 命名铁律（实现后确立，见 §0.4 T-2）**：`doc_id` **= 源文件名 stem**。
> 预检/解析按 `{source_dir}/{国内|国际}/{doc_id}{后缀}` 定位源文件，MinerU 产物目录名也是它；
> 判重才用内容 sha256（源目录现算，36MB≈0.8s）。**改这个口径会同时打断预检、解析与产物寻址。**

### 17.5 环境与沙箱注意（踩坑记录）

| # | 现象 | 根因 | 处置 |
|---|---|---|---|
| **E-1** | 第二次运行任何涉及"确保目录存在"的代码即报 `PermissionError: EEXIST ... mkdir` | 某些 IDE 的 **`mkdir` 拦截 shim**（`sitecustomize.py`）对**已存在**路径即使 `exist_ok=True` 也抛错 | 新增 `fsutil.ensure_dir()`：先 `exists()` 再 `mkdir`；全项目 9 处 `mkdir` 收敛到它 |
| **E-2** | 第二次跑 `pytest` 时 `tmp_path` fixture 出错（`EEXIST`），首次正常 | 同上：pytest 的 `basetemp` 目录已存在 | 运行方式改为 **每次指定全新 `--basetemp`**：`T=$(mktemp -d) && pytest --basetemp="$T"` |
| **E-3** | pypdf 输出 `fontTools is required to fully parse the encoding of a CFF Type1 font` 警告 | pypdf 的可选依赖缺失（仅影响个别字体编码解析） | 不影响文本提取；已确认预检/交叉校验结果正确。如需静默可装 `fontTools` |

### 17.6 实施中发现并修掉的三个真实缺陷

| # | 缺陷 | 表现 | 修法 |
|---|---|---|---|
| **B-1** | `mark_cached` 按 `cache_key` 匹配时**匹配到了失败记录** | `current_run` 被指向 `status=failed` 的 run → 下游报"上游未就绪"，而上游状态显示 `succeeded` | `current_run()` 与 `mark_cached()` 都增加"必须指向成功状态"的不变量；已加回归测试 |
| **B-2** | `mark_failed` 用 `run_id` 的 `engine@?` 占位且不去重 | 反复重试把 manifest 撑大；占位串与成功记录难以区分 | 用真实 `engine@engine_version` 生成 run_id，并按 `(run_id, status=failed)` 去重 |
| **B-3** | 默认源/产物目录指向**不存在的** `docs/敏宝知识库/{源文件,minerU解析版本}` | 走默认路径时 `source_dir/region/{doc_id}.pdf` 找不到 → pypdf 交叉校验**静默跳过** | 改为真实路径 `docs/knowledge/source/{raw,mineru-parsed}`；加测试断言目录存在 |

---

## 附录 A：与 PRD-008 的追溯矩阵

| PRD 章节 | 本文对应 |
|---|---|
| §1.2 用户旅程地图 | §5.1 分层与模块 |
| §5 平台形态与技术边界 | §3 运行环境、§4.8/§4.9、§5.2 |
| §6 步骤与状态模型 | §5.3、§8.1–§8.5 |
| §7 数据契约 | §6 数据设计 |
| §7.4 `retrieval_status`/`review_state` | §6.2、§9.1 |
| §8 页面清单 | §5.1（界面层）、§14 实施计划 |
| §9 检索契约 | §7.3、§8.11 |
| §10 用户故事（13 个） | §5.3 步骤映射 + 各节设计 |
| §11 改动清单 | §17 涉及文件清单 |
| §12 支撑性需求 | §4.9（阈值）、§8.9（prompt）、§9.3（环境）、§13（测试） |
| §13 影响面清单 H1 | **§9.1（展开为五阶段执行序）** |
| §14 优先级与分期 | §14 实施计划 |
| §15 验收 | §13 测试与验收 |
| §18 约束与风险 | §12 安全合规、§15 风险 |
| §19 决策记录 D-01~D-21 | 逐条落到 §4 选型评估与 §8 详细设计 |

**本文对 PRD 的补充/偏差**：§0.3 的 X-1（漏发布记录表）、X-2（config 目录不存在）、X-3（prompt 目录未定义）、§6.1 的 X-4（新表未区分本机/远程）。
**X-1 ~ X-4 已回写 PRD-008**（见 PRD-008 `04` §11.5 / `02` §5.3 / `04` §12.2）。
另有两组"实现与规划"的偏差见 **§0.4 B（T-1 ~ T-6）**，是 v1.1 新增、**已在本文就地修正但不改 PRD 的冻结口径**。

---

## 附录 B：环境搭建与命令速查

```bash
# ── 环境（§9.3）─────────────────────────────────────────
cd minicare-platform/api && python3.13 -m venv .venv
.venv/bin/pip install -e ".[dev,web]"          # 默认不含 llama-index；web extra 起服务必需
                                               # 需要页面栅格化再加 ,render（pypdfium2）
cp .env.example .env                           # 填密钥（当前只有 DEEPSEEK_API_KEY 配了）

# ── 现有 CLI（保留可用）────────────────────────────────
.venv/bin/kb-pipeline parse   --source <dir> --out <dir>
.venv/bin/kb-pipeline chunk   --doc <doc_id>
.venv/bin/kb-pipeline import  --chunks var/chunks.jsonl
.venv/bin/kb-pipeline embed

# ── 平台（与实况一致：后端在 minicare-platform/api 内，前端独立）──
.venv/bin/kb-pipeline serve                    # ← 推荐入口，默认 127.0.0.1:8787
# 开发前端：cd minicare-platform/web && npm run dev   # Vite 5173，/api 代理 → 8787
# 生产前端：cd minicare-platform/web && npm run build # dist/ 由 FastAPI 同端口托管
# ⚠️ 不再有 `uvicorn app.main:app`（app/ 包从未创建）；改完前端要 build，
#    否则 8787 托管的仍是旧版式（gotchas §1/§9）
open http://127.0.0.1:8787

# ── 选型评估的可复现证据 ────────────────────────────────
minicare-platform/api/scripts/eval-recall-exact.py           # 45 题精确 Recall@10（基线 97.8%）
minicare-platform/api/scripts/eval-chunking-compare.py       # 切块 × embedding 2×2 对比
minicare-platform/api/docs/CHUNKING-COMPARE-REPORT.md        # 对比结论
minicare-platform/api/docs/RECALL-REPORT.md                  # 召回基线与伪有害口径分析
docs/knowledge/research/PDF解析最佳实践与升级方案.md  # 解析引擎横向对比
docs/knowledge/research/MinerU功能深入调研.md        # MinerU 引擎/部署/许可证

# ── 迁移（§9.1，严格按序）──────────────────────────────
# 阶段 1：加列        mysql < minicare-server/migrations/021_knowledge_retrieval_status.sql   ✅ dev 已完成
# 阶段 2：平台双写    （部署平台代码）                                                          🟡 代码就位
# 阶段 3：回填状态    .venv/bin/python scripts/backfill-retrieval-status.py                     ❌ 未执行 ← 下一步
# 阶段 4：agent 切换  （部署 agent-poc）                                                        ❌ 未做
# 阶段 5：清理前缀    .venv/bin/python scripts/clean-review-prefix.py   # 不可逆                  ❌ 未做
```
