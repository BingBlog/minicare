# 检索契约 v1（冻结于 2026-10-02）

> 状态：**已冻结** ｜ 校验方式：发布前自动执行 `kb-pipeline contract validate`，不符即阻断发布
> 契约实现：平台侧 `src/kb_pipeline/retrieval.py`；消费侧 `agent-poc/src/lib/tools/search-knowledge.js`
> ⚠️ **两份实现必须保持一致**；改一侧必须同步改另一侧并递增本文版本号。

---

## 1. 响应结构

| 字段 | 类型 | 说明 |
|---|---|---|
| `found` | boolean | 是否命中。`false` 时 `items` 为空数组并给出 `message` |
| `items` | Item[] | 命中条目，按相关性降序 |
| `topK` | number | 本次请求的 topK 值（回显，便于调用方核对） |

## 2. 条目字段（Item）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 条目主键（UUID） |
| `kb_id` | string | 稳定条目 ID，格式 `{doc_id}-{seq}`，**检索与溯源的业务键** |
| `title` | string | 块标题（章节标题；表格块为「表N 章节标题」） |
| `content` | string | 切片正文，**超 800 字截断** |
| `content_truncated` | boolean | 是否被截断（截断时必须为 `true`） |
| `source` | string | 来源名（指南/共识名） |
| `risk_level` | string | `low` / `caution` / `emergency`，供护栏分级使用 |

## 3. 过滤参数

| 参数 | 必填 | 取值 | 说明 |
|---|---|---|---|
| `query` | 是 | string | 检索关键词或自然问题 |
| `riskLevel` | 否 | `low`/`caution`/`emergency` | 按风险等级过滤 |
| `category` | 否 | string | 按条目类别过滤（`section`/`table`/`image`/`paragraph`） |

## 4. 语义约束（校验器逐条实测，不是读代码）

1. **`retrieval_status != 'enabled'` 的条目永不出现**
   - 迁移 021 之前等价于：`content` 不以 `[待复核]` 开头（且被屏蔽的块不写入库）
   - 迁移 021 之后：`retrieval_status = 'enabled'`
   - 校验方式：用库内真实的 review/excluded 条目做**探针**，实测检索不返回它
2. **`content` 超 800 字截断并置 `content_truncated=true`**
3. **未命中返回明确的未找到结构**（不是空数组、不抛异常）
4. **检索方式 = FULLTEXT ngram + 向量余弦 + RRF(k=60) → topK**
   - FULLTEXT 取 top20、向量取 top20，RRF 融合后取 topK
   - 向量模型与入库必须**同模型同维度**（当前 `kinfra-text-embedding-0.6b` / 1024 维）

## 5. 校验器覆盖的三类校验

| 校验 | 说明 | 失败后果 |
|---|---|---|
| 结构完整性 | 必需字段集未被删减 | **阻断发布** |
| 语义约束① | 用真实数据探针实测不泄漏 | **阻断发布** |
| 向量维度一致 | 库内向量维度 == 契约声明 | **阻断发布** |
| 契约文档同步 | 本文含全部必需字段说明 | 未维护时记 `not_executed`（不算通过） |

> 数据不足时校验器一律返回 `not_executed` 并说明原因，**绝不假装通过**
> （同 PRD US-11 场景 4 的口径）。

## 6. 变更记录

| 版本 | 日期 | 变更 | 影响 |
|---|---|---|---|
| v1 | 2026-10-02 | 首次冻结：对齐 `agent-poc` 现存实现 | — |
| v1（增补） | 2026-10-03 | 明确「屏蔽块（`excluded`）在迁移 021 前不写入库」，因此语义约束①在两种状态下都成立；补"两份实现必须一致"的说明 | 无破坏性变更 |

## 7. 相关文件

- 实现（平台侧）：`minicare-platform/api/src/kb_pipeline/retrieval.py`
- 实现（消费侧）：`agent-poc/src/lib/tools/search-knowledge.js`
- 校验器：`minicare-platform/api/src/kb_pipeline/contract.py`
- 命令：`kb-pipeline contract show | validate | observe`
