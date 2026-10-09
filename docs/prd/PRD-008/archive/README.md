# 归档说明：知识库解析入库流水线 v3 系列（已被 PRD-008 取代）

> 归档日期：2026-10-02
> 归档原因：PRD-008《知识库平台化》以**代码现状**为基线重写，本目录文档的设计骨架被沿用，但其**前置假设被核实为不成立**，不再作为实施依据。

---

## 1. 归档文件清单

| 文件 | 原编号 | 原日期 | 处置 |
|---|---|---|---|
| `PRD-知识库解析入库流水线-v3.md` | PRD-KB-003 v3.2 | 2026-09-30 | 骨架沿用，假设推翻 |
| `技术方案-知识库解析入库流水线-v1.md` | DES-KB-004 v1.0 | 2026-09-30 | 整体不采用（技术栈假设全错） |
| `PRD-知识库解析入库流水线-v3-审查报告.md` | — | 2026-09-30 | 保留（审查方法论仍有参考价值） |
| `assets/flow-swimlane.svg` `assets/flow-swimlane.png` | — | 2026-09-30 | 保留（泳道图画法可参考） |

**原件来源**：`/Users/bing/Study/minicare-kb/`（仓库外草稿目录），2026-10-02 移入本目录。

---

## 2. 被推翻的前置假设（PRD-008 §3 详述）

| # | v3 文档的假设 | 核实结果 | 证据 |
|---|---|---|---|
| A1 | kb 后端是 **FastAPI**，检索链路基于 **llama-index**，向量库为 **Chroma** | **全部不存在**。真实实现是 click CLI + 自研切块 + pymysql + MySQL BLOB 向量 | `minicare-kb/src/kb_pipeline/cli.py`、`chunking/pipeline.py`、`store/knowledge_base.py` |
| A2 | 语料是**医学论文**，需 DOI/PMID/Crossref/PubMed 补全、研究类型字段 | 真实语料是**中文指南与共识 + 国际指南**，专门决策「不做 JATS 优先路径」 | `minicare-kb/src/kb_pipeline/config.py:65-89`（20 条指南映射，无一篇论文） |
| A3 | MinerU 版本 2.5.x，后端名为 `pipeline / vlm-transformers / vlm-sglang` | MinerU 已到 **4.0.10**，后端名废弃，改为档位制 `flash/basic/standard/advanced` | `open-source/MinerU/mineru/version.py:1`、`docs/next/tiers.md:15-20` |
| A4 | 存在「文档上传页 / 检索测试页」等已有实现（"已有实现，保持"） | `minicare-server` **无任何知识库模块或路由**；`minicare-web` 无知识库页面 | `minicare-server/src/` 目录无 knowledge 相关文件 |
| A5 | 切块可改用 LlamaIndex NodeParser 家族 | 已实测否决：MinerU 单行 HTML 表格与 `ElementNodeParser` 不兼容，自研切块 Recall 64.4% vs LlamaIndex 31.1% | `minicare-kb/docs/CHUNKING-COMPARE-REPORT.md` |
| A6 | `knowledge_base` 可用 `risk_level=caution` + `content` 前缀表达 review，**不加列** | 该 hack 支撑不了 PRD-008 需要的四态，**决定加字段（迁移 021）** | PRD-008 §7.4、§19 D-06 |

---

## 3. 被 PRD-008 沿用的设计骨架（这部分是有效的）

- **Step 化**：单文档处理拆为可独立执行、产物可寻址的步骤（PRD-008 §6 落为 6 步）
- **`run_id` 含引擎版本与参数 hash**（PRD-008 §7.3）
- **失效传播**：上游重跑 → 下游标 `stale`，产物文件不删
- **两个人工暂停点的位置论证**：元信息确认早于切片（因为元信息要冗余进切片）、切片校对晚于切分（因为只有切出来才能判断切得对不对）
- **LLM 触点的成本意识与预算约束**（PRD-008 §18 R-03）
- **审查报告的分级方法论**（P0/P1/P2 + 证据引用）

---

## 4. 为什么另起 PRD-008 而不是修订 v3

v3 的范围是「**单文档**的解析入库全流程」（其 §12 明确"不在范围：知识库 CRUD、多用户与权限"）。而本次要解决的是**平台化**——语料台账、切片生命周期、产物版本与发布回滚、召回回归闸门、Agent 消费契约，这些在 v3 里被显式排除。

叠加 A1–A4 的假设推翻，修订成本高于重写，故另起编号并归档。
