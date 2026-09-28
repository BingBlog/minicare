# minicare-kb · 敏宝知识库管线技术架构方案

> 版本：v0.1 ｜ 日期：2026-08-22 ｜ 状态：待评审
> 上游方案：docs/agent/tech/M02-knowledge.md（M2 知识问答）、docs/tech/TECH-006-minicare-agent-plan.md
> 背景：知识库建设已从"散装脚本"升级为独立工程子目录 `minicare-kb/`，本文定义其技术架构、模块边界与工程规范。

---

## 1. 目标与范围

### 1.1 解决什么

把"源文件 → 可检索知识条目"这条管线工程化，包含四个阶段：

```
源文件 PDF/HTML ──① 解析(MinerU 云端)──▶ MinerU 产物 ──② 清洗+切块(自研)──▶ Chunk 数据
                    │                       │                              │
                    └── 本地缓存(幂等)       └── 页码锚定/数字校验/元数据      ▼
                                                                  ③ 入库(knowledge_base)
                                                                        │
                                                                  ④ embedding(TokenHub Kinfra)
```

### 1.2 非目标（明确不做）

- 不做检索服务（检索是 minicare-server 的 `search_knowledge` / `hybridSearch`，本工程只管"造数据"）
- 不引入向量数据库（<500 条规模，内存余弦已够；超过由 M02 8.3 触发迁移）
- 切块自研（~170 行，行为对齐 LlamaIndex NodeParser 思路；llama-index-core 已装但切块不依赖）
- P2 多模态向量检索不做（图片走 P0 图注文本化 + P1 视觉描述）

### 1.3 设计原则

| 原则 | 含义 |
|---|---|
| **工程级** | 不是脚本堆叠：src 包结构、配置化、CLI、单测、日志、幂等、可重跑 |
| **模块解耦** | 解析/切块/校验/入库各自独立，可单独运行、单独测试、单独替换 |
| **行业最佳复用** | 解析用 MinerU 云端 API；切块自研（对齐 LlamaIndex 思路，规避 HTML 表格不兼容），31 个 pytest 锁定 |
| **医疗安全门禁** | 数字缺失检测 + review 标记是硬性关卡，命中条目不进检索 |
| **数据主权** | 产物落本地仓库（git 可追溯），密钥只存 .env（gitignore） |

---

## 2. 总体架构

```
┌────────────────────────────── minicare-kb/ ──────────────────────────────┐
│                                                                            │
│  CLI 入口 (kb-pipeline)                                                    │
│  ├─ parse    → 调 MinerU 云端 API 解析源文件 → 产物落 minerU解析版本/        │
│  ├─ chunk    → 清洗→切块→锚定→校验→chunks.jsonl                            │
│  ├─ import   → chunks.jsonl → knowledge_base 表                            │
│  ├─ embed    → 全量 active 条目生成 embedding 写回                          │
│  └─ pipeline → parse→chunk→import→embed 串联（带断点续跑）                   │
│                                                                            │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────┐ ┌──────────────┐       │
│  │ mineru/     │ │ preprocess/  │ │ chunking/   │ │ anchors/     │       │
│  │ API 客户端   │ │ 清洗/标题修复 │ │ 自研切块   │ │ 页码锚定      │       │
│  └─────────────┘ └──────────────┘ └─────────────┘ └──────────────┘       │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────┐ ┌──────────────┐       │
│  │ validate/   │ │ metadata/    │ │ embed/      │ │ store/       │       │
│  │ 数字校验     │ │ 元数据标注    │ │ TokenHub 向量│ │ MySQL 入库    │       │
│  └─────────────┘ └──────────────┘ └─────────────┘ └──────────────┘       │
│                                                                            │
│  config/ (.yaml + .env)   tests/ (pytest + fixtures)   scripts/ (编排)     │
└────────────────────────────────────────────────────────────────────────────┘
                                      │ 产出
                              knowledge_base 表（016 迁移）
                                      │ 消费
                    minicare-server search_knowledge / hybridSearch
```

**技术选型**：

| 项 | 选型 | 理由 |
|---|---|---|
| 语言 | Python 3.13（隔离 venv） | 生态成熟，数据管线友好 |
| 解析 | MinerU 云端 API（pipeline + ch） | 已实测：vlm 丢数字，pipeline 保真 |
| 切块 | **自研**（chunking/pipeline.py，~170 行） | 对齐 LlamaIndex NodeParser 思路；MinerU HTML 表格与其不兼容，自研可完全掌控且零运行时依赖 |
| 向量化 | TokenHub Kinfra（OpenAI 兼容） | 混元老平台停止新购，TokenHub 是腾讯云统一大模型入口，kinfra-text-embedding-0.6b 1024 维 |
| 校验 | pypdf（文字层交叉校验）+ 正则模式库 | pypdf 提取数字 100% 完整，可自动补全/标记 |
| 配置 | pydantic-settings（yaml + env） | 类型安全，密钥走 env |
| 入库 | pymysql（事务 upsert） | 轻量直连，对齐 minicare-server 用 mysql2 |
| 测试 | pytest + 本地 fixtures | 切块/校验逻辑纯函数化，无需真实 API |
| CLI | click | 子命令天然适合 parse/chunk/import/embed |

---

## 3. 目录结构与模块职责

```
minicare-kb/
├── pyproject.toml                # 项目元数据 + 依赖（pip install -e .）
├── README.md                     # 快速上手
├── .env.example                  # MINERU_API_TOKEN / DB_* / HUNYUAN_* 模板（真密钥进 .env，gitignore）
├── config/
│   └── default.yaml              # 引擎/路径/chunk 参数/校验模式开关
├── docs/
│   └── ARCHITECTURE.md           # 本文
├── src/kb_pipeline/
│   ├── __init__.py               # 版本号
│   ├── cli.py                    # click 子命令入口（parse/chunk/import/embed/pipeline）
│   ├── config.py                 # pydantic-settings 加载 default.yaml + .env
│   ├── models.py                 # 核心数据模型（见 §4）
│   ├── logger.py                 # 统一日志（控制台 + 文件，阶段统计）
│   ├── mineru/
│   │   ├── client.py             # 云端 API 封装：submit_batch / poll / download_zip
│   │   ├── uploader.py           # 本地上传：file-urls/batch → PUT（Content-Length 必带）
│   │   └── result.py             # zip 解压 → 产物目录整理（md/json/images，清理中间态）
│   ├── preprocess/
│   │   ├── clean.py              # 清洗：去 <sup> 引用、页眉页脚、空白压缩、图片引用归一
│   │   └── headings.py           # 标题层级修复：## 一、→h2 ｜ ## （一）→h3 ｜ ## 1.→h4
│   ├── chunking/
│   │   ├── pipeline.py           # 自研切块：标题修复→表格抽取→章节切块→超长降级
│   │   └── table_summary.py      # 表格 LLM 摘要（prompt 模板 + 调用抽象，可注入模型）
│   ├── anchors/
│   │   └── page_anchor.py        # content_list.json 文本对齐 → 块级 page_idx 标注
│   ├── validate/
│   │   ├── numbers.py            # 9 类数字缺失模式扫描（为 次/最大剂量/（ 岁）…）
│   │   └── pdf_layer.py          # pypdf 提取原 PDF 文字层 → 交叉校验/自动补全候选
│   ├── metadata/
│   │   └── annotate.py           # source/evidence_level/region/risk_level/applicable_age 映射
│   ├── embed/
│   │   └── hunyuan.py            # 混元 embedding 客户端（离线批量，抽象可替换）
│   └── store/
│       ├── db.py                 # 连接池/事务/幂等 upsert
│       └── knowledge_base.py     # 016 表映射 + review 状态处理
├── tests/
│   ├── conftest.py               # fixtures：样例 md + content_list.json + 期望 chunk
│   ├── fixtures/                 # 小型合成样本（不依赖真实 PDF/API）
│   ├── test_headings.py          # 标题层级修复
│   ├── test_clean.py             # 清洗规则
│   ├── test_chunking.py          # 切块（表格独立/标题路径/父子树）
│   ├── test_numbers.py           # 数字缺失检测（含真实文档 9 处样本）
│   ├── test_anchor.py            # 页码锚定
│   └── test_metadata.py          # 元数据标注
└── scripts/
    └── run_pipeline.sh           # 一键编排（激活 venv → kb-pipeline pipeline）
```

---

## 4. 数据模型（models.py）

```python
# 文档层
@dataclass
class Document:
    doc_id: str            # 稳定 ID：文件名 hash（幂等依据）
    title: str             # md 一级标题
    source: str            # 指南/文章名
    source_url: str | None
    region: str            # cn / intl / both
    md_path: Path          # <文档名>.md
    content_list_path: Path  # *_content_list.json
    pdf_path: Path | None  # 原 PDF（数字交叉校验用，源文件目录）

# 块层（chunk 输出，JSONL 一行一条）
@dataclass
class Chunk:
    kb_id: str             # 稳定 ID：{doc_id}-{章节序号}（upsert 幂等键）
    doc_id: str
    title: str             # 块标题
    header_path: str       # 标题路径，如 "九、严重过敏反应治疗/（二）主要治疗药物"
    parent_kb_id: str | None   # 父块（当前恒 None，父子树未实现，靠 header_path 派生）
    content: str           # 清洗后文本（表格块 = LLM 摘要 + 表格 HTML）
    chunk_type: str        # section / table / image / paragraph
    page_idx: int | None   # 页码锚定结果（content_list 对齐）
    source: str
    evidence_level: str    # guideline/consensus/RCT/policy/edu
    risk_level: str        # low/caution/emergency
    applicable_age: str | None
    review: bool           # True = 数字校验未过，入库但不进检索
    review_reason: str | None
    embedding: bytes | None  # 生成后回填（float32）
```

**kb_id 生成规则**：`{doc_id}-{seq}`，doc_id = 文件名去掉扩展名（已唯一），seq = 章节序号（1, 2, 3… 子块用 1-1, 1-2）。**重跑同文件 → 同 kb_id → upsert 覆盖**，实现幂等。

---

## 5. 各阶段详细设计

### 5.1 解析（mineru/）

```
输入：源文件目录（docs/knowledge/source/raw/{国内,国际}）
流程：
  1. 扫描目录：.pdf（pipeline 引擎）/ .html（MinerU-HTML 引擎）分组
  2. POST /api/v4/file-urls/batch（≤50 个/批，language=ch）
     ⚠️ 必须显式 Content-Length（chunked 会被拒：-10002 type mismatch）
  3. PUT 上传（无 Content-Type，返回 200）
  4. GET /api/v4/extract-results/batch/{batch_id} 轮询（8s 间隔，超时 10min）
  5. done → 下载 zip → 解压整理到 minerU解析版本/{国内,国际}/<文档名>/
     保留：<文档名>.md、*_content_list.json、images/
     清理：*_origin.pdf / layout.json / *_model.json / *_content_list_v2.json
失败处理：单文件 failed 记日志不中断；整体失败可重跑（幂等：已存在产物目录则跳过）
```

**产物目录规范**（消费契约）：

```
minerU解析版本/{国内,国际}/<文档名>/
├── <文档名>.md                  # full.md 重命名
├── {uuid}_content_list.json     # 元素级 bbox + page_idx
└── images/                      # 表格/图片裁剪
```

### 5.2 清洗 + 标题修复（preprocess/）

| 处理 | 规则 |
|---|---|
| 去引用 | `<sup>[...]</sup>` → 删除（引用信息已不需要，溯源靠页码） |
| 去噪声 | 页眉/页脚/卷期行（content_list 中 header/footer/page_number 类型同源判定或正则） |
| 空白 | 全角/半角空格归一、行尾空白删除、连续空行压缩 |
| 图片引用 | `![...](...)` 保留文本描述部分，路径归一为 `images/<file>` |
| **标题扁平化修复** | MinerU 全输出 `##`：`^##\s+[一二三四五六七八九十]+、`→h2；`^##\s+（[一二三四五六七八九十]+）`→h3；`^##\s+\d+[\.．]`→h4；`^##\s+\d+[\.．]\d+`→h5；异常编号（如"2.特殊人群"）按上下文修正 |

### 5.3 切块（chunking/，自研实现，2026-08-23 定稿）

> **实现说明**：初版架构选定 LlamaIndex NodeParser 家族，实测后发现 **MinerU 产物表格是单行 HTML，LlamaIndex ElementNodeParser 不兼容**（只认标准 md 表格），且标题层级需先修复。故切块为**自研等价实现**（pipeline.py，~170 行），行为对齐 LlamaIndex 思路，31 个 pytest 锁定，零切块运行时依赖。

```
① 预处理：标题层级修复（## 一、→h2，## （一）→h3，## 1.→h4/h5）
          + HTML 无前缀标题推断（MinerU-HTML 产物，卫健委/广东/FDA）
② 表格抽取：<table>…</table> → 占位符 [[TABLE_n]] → 表格独立成块（HTML 全文）
③ 标题层级切块：章节/子节 = 一个块，header_path 继承（章节锚点）
④ 超长章节降级：> max_section_chars(1200) 按空行段落聚合切分
```

- **当前参数**：`chunk_size=600 / chunk_overlap=100` 已配置但**未接入**（按章节/段落边界切，非 token 级）；`parent_kb_id` 恒 None（父子树未实现，靠 header_path 派生）
- **与 LlamaIndex 方案差距（已记录，后续按效果决定补齐）**：① 无 overlap ② 无父子树 ③ 表格无 LLM 摘要（table_summary.py 为 M3 预留接口，当前返回空）
- **表格块**：HTML 全文独立成块，不受 size 限制（LLM 摘要 M3 接入后改为 `摘要 + HTML`）
- **评测基准**：精确 Recall@10 = 97.8%（45 题，`docs/RECALL-REPORT.md`）

### 5.4 页码锚定（anchors/）

- 从 `content_list.json` 构建"文本片段 → page_idx"索引（按 text 内容前 20 字对齐，容忍 OCR 差异用模糊匹配）
- 每个 Chunk 取起始文本在索引中的 page_idx；找不到的块标 `page_idx=None`（不阻塞入库）
- 输出：Chunk.page_idx（溯源用，回答可显示"来源：XX 共识 第 9 页"）

### 5.5 数字校验（validate/）—— 医疗安全门禁

| 模式 | 正则 | 处置 |
|---|---|---|
| 剂量缺值 | `为\s*次`、`最大剂量\s*[，。]`、`每次\s*[，,]` | review=True |
| 百分比缺值 | `仅有\s*[^0-9%]{0,4}严重过敏反应`（扩展：`{0,4}` 后任意上下文） | review=True |
| 年龄范围缺值 | `（\s*岁）` | review=True |
| 次数缺值 | `重复注射\s*次`、`需要\s*剂以上` | review=True |
| （可扩展） | config/default.yaml 维护模式库 | — |

**pypdf 交叉校验**（增强）：对命中 review 的块，用 pypdf 提取原 PDF 文字层，在同一上下文窗口搜索缺失数字 → 能定位到具体值则输出"建议补全值"到 review 清单，供人工确认后回填（二期自动回填）。

**review 语义**：`review=true` 的条目 `status` 正常入库但 `risk_level` 强制 `caution` 且检索端（search_knowledge）过滤——**缺失剂量绝不进回答**。

### 5.6 元数据标注（metadata/）

| 字段 | 来源 |
|---|---|
| source / source_url | 文档映射表（config 或 yaml，维护"文件名→指南名/出处"） |
| evidence_level | 国内共识→consensus；国际指南→guideline；卫健委→policy |
| region | 目录名（国内→cn，国际→intl） |
| risk_level | 默认 low；命中"急救/肾上腺素/剂量"等关键词→caution；含"休克/死亡/禁用"→emergency（规则库可配） |
| applicable_age | 文档声明（如 0-3 岁），缺省 NULL |

### 5.7 入库（store/）

- 连接：pymysql + 事务批量 upsert（`INSERT ... ON DUPLICATE KEY UPDATE`，按 kb_id）
- 表：`knowledge_base`（016 迁移，schema 见 M02 §2，**零改动**）
- 失败重试：单条失败记录日志，批次结束汇总；整批可重跑（幂等）
- review 条目：同表入库，`risk_level=caution` + `review=1` 由导入日志标记（schema 若加 review 列需迁移 018，或先用 risk_level 表达——**默认不加列**，用 risk_level=caution + content 前缀 `[待复核]` 标记，避免迁移）

> 决策点（评审时确认）：是否给 knowledge_base 加 `review_status` 列（迁移 018）？默认方案不加，用 risk_level 表达。

### 5.8 embedding（embed/）

- TokenHub Kinfra-Text-Embedding-0.6b（OpenAI 兼容接口），离线批量，仅 `kb-pipeline embed` 调用
- 只对 `status=1 AND embedding IS NULL` 且非 review 的条目生成（增量，可断点续跑）；写回 `embedding` BLOB（float32，1024 维 = 4096B）
- 抽象：`hunyuan.py`（TokenHub 客户端）接口固定，可替换阿里百炼/本地 bge-m3（M02 8.3 可替换性设计）

---

## 6. CLI 与运行

```bash
# 激活隔离 venv（Python 3.13）
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"

# 一键全流程（断点续跑：已解析/已切块的自动跳过）
.venv/bin/kb-pipeline pipeline \
  --source docs/knowledge/source/raw \
  --out docs/knowledge/source/mineru-parsed \
  --chunks var/chunks.jsonl

# 分步
kb-pipeline parse  --source ... --out ...          # 只解析
kb-pipeline chunk  --in ... --out var/chunks.jsonl # 只切块（输出 review 清单）
kb-pipeline import --chunks var/chunks.jsonl       # 只入库
kb-pipeline embed                                  # 只生成向量
```

- 所有命令支持 `--dry-run`（打印将执行的动作，不落盘/不入库）
- `--doc <文件名>` 单文档调试模式
- 退出码：0=成功，1=有失败项（日志汇总），2=配置错误

## 7. 工程规范

| 规范 | 要求 |
|---|---|
| 幂等 | 一切可重跑：产物目录存在跳过、kb_id upsert、chunks.jsonl 按 doc 追加不重复 |
| 日志 | 统一 logger：`[阶段][文档] 消息`；pipeline 结束输出统计（解析 n/n、chunk n、review n、入库 n） |
| 密钥 | 仅 `.env`（gitignore）；`.env.example` 提交模板；代码中任何位置不硬编码 token |
| 测试 | pytest：纯函数（清洗/标题/校验/锚定/元数据）100% 覆盖核心规则；切块用合成 fixtures，不依赖真实 API |
| 质量 | ruff lint + mypy（可选）；CI 阶段可挂（本期不做 CI，先本地跑通） |
| 文档 | 本方案评审通过后，README 补快速上手；模块 docstring 写明输入/输出/边界 |

## 8. 风险与决策点

| # | 风险/决策点 | 说明 | 建议 |
|---|---|---|---|
| 1 | 切块自研 vs LlamaIndex | 初版选 LlamaIndex，实测 ElementNodeParser 不兼容 MinerU HTML 表格 → 自研（170 行） | 已定稿自研，31 pytest 锁定；如后续要父子树/overlap 可再评估引入 NodeParser（2026-08-23） |
| 2 | review 表达方式 | 是否加 `review_status` 列（迁移 018） | 默认不加，用 risk_level=caution + content 前缀标记；正式上线前再评估 |
| 3 | 表格 LLM 摘要成本 | ~40 个表格 × 1 次调用 | 一次性成本可忽略；摘要模型与 M6 视觉链路共用配置（M3 接入） |
| 4 | 页码锚定准确率 | content_list 文本与 md 有 OCR 差异 | 模糊匹配 + page_idx=None 兜底；评测时抽查 ≥95% |
| 5 | pipeline 引擎非 100% 保真 | 实测 1 处真缺失/文档 | 数字校验门禁兜底 + review 人工复核，可接受 |
| 6 | 国际文档 OCR | 部分扫描件需 is_ocr=true | parse 阶段按文件配置 is_ocr（yaml 维护清单），默认 false |
| 7 | TokenHub 依赖 | 混元老平台停止新购，新服务走 TokenHub（Kinfra 向量） | 已接入 TokenHub OpenAI 兼容接口；免费体验包 100 万 token/90 天，超出按量计费（0.7 元/百万级） |

## 9. 里程碑

| 阶段 | 内容 | 产出 |
|---|---|---|
| M1（本期） | 工程骨架 + parse + chunk + validate + 单测 | 跑通 1 份文档端到端（严重过敏共识） |
| M2 | anchors + metadata + import + embed | 全量 15 份入库 + 50 题召回评测基线 |
| M3 | review 工作流 + 表格摘要 + pypdf 交叉校验 | 复核清单闭环 + 摘要块 |
| M4（二期） | 图片 P1 视觉描述、增量重解析（指南更新触发） | 图块语义化 |
