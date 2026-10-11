# TECH-027 — Agent 测评开源框架复用评估（deepeval / Langfuse / 相邻方案）

> 日期：2026-10-11 ｜ 状态：评估完成，待用户确认方向
> 背景：PRD-012 实施推进中，用户提出「尽量复用 deepeval 等开源框架能力，避免后续维护成本高」——本文复核行业框架现状 + 结合仓库既有调研与资产，给出复用边界与落地路径。
> 上游：TECH-010（测评方案 / deepeval webui 调研）、TECH-020（六平台调研）、`minicare-agent/evals/README.md`（deepeval 指标层设计）、`docs/prd/PRD-012.md`、`TECH-026`（报告 2.0 技术方案）。

---

## 0. 结论摘要

**可以复用；且复用资产早就在仓库里——本次是把"规划过的复用"真正接线落地。**

三层分工（维持既有选型，重点把「判分引擎」从自写迁到 deepeval）：

| 层 | 选型 | 状态 |
|---|---|---|
| 观测层（trace / 回放） | Langfuse（本地已在跑，:3100） | 现状维持（可选：分数回挂） |
| **判分引擎层（指标 / 裁判 / Rubric）** | **deepeval**（Python；配置 → 编译 → measure） | **本次立项（原 TECH-010 P1b 的正式化）** |
| 管理与决策层（用例/任务/台账/报告/决策/归因/门禁） | 自研 minicare-platform | 现状维持（薄层、领域语义、无上游可同步） |

**关键判断（维护成本视角）**：维护成本集中在三个点——① judge prompt 质量与校准；② LLM 判分基础设施（调用/解析/重试/CoT）；③ 指标库演进。**三项全在 deepeval 的成熟领域**（且仓库已有 DeepSeek 适配器 + R1 全链路跑通记录）。而自研保留部分是"数据模型 + 领域语义 + 决策 UI"（图灵理论的口径），任何框架都不提供、代码量小（数百行/期）、无上游同步负担。

**现状缺口（两个）**：
1. **deepeval 运行环境已丢失**——原托管 venv（`.workbuddy/binaries/python/envs/default`）在 10-09 git 历史重写中被重建，deepeval 未恢复；需重装（并吸取教训：装进**项目自有 venv**）。
2. **P1b「收敛两套判分口径」一直未实施**——当前 Node 自写 judge 在跑、deepeval 在仓库里躺着，这是"双套维护"的直接根源。

---

## 1. 复核既有调研（本仓库的结论线索，避免重复造轮子）

| 文档 | 既有结论 | 本次裁定 |
|---|---|---|
| `evals/README.md`（2026-08-30） | deepeval 选为指标层（8 个 Agent 指标 + G-Eval + 多轮）；Langfuse 记 trace、deepeval 消费 trace 判分；**P1b 计划接入 harness judge 层收敛口径** | ✅ 维持；升级为"平台判分引擎"（P1b 正式立项） |
| `TECH-010-deepeval-webui-research.md`（09-03） | deepeval 无本地 Web UI；推荐 Langfuse 挂分；promptfoo self-hosted 为团队 UI 备选 | ✅ 维持（测评台已自建且更贴合领域，不再需要 promptfoo） |
| `TECH-020`（10-09） | 四对象模型；Langfuse 架构最接近；Braintrust 评测驱动工作流标杆；成本/质量并列 | ✅ 维持（报告 2.0 即对齐此方向） |

---

## 2. 行业框架能力盘点（2026-10 现状）

### 2.1 deepeval（主选）

- **版本**：PyPI 最新 **4.2.2**（本仓库用过 4.2.0），活跃维护（近期迭代：DAG top-down 重构、Classifiers、实验性 Jev 等）。
- **指标库**（开源、纯本地）中与本域直接相关：
  - `FaithfulnessMetric`（忠实/幻觉）、`HallucinationMetric`、`AnswerRelevancyMetric`
  - `GEval`（自定义标准 + 推理链；我们已用它承载 style / data_honesty / medical_safety）
  - `ToolCorrectnessMetric`（工具调用正确性，确定性比对）、`TaskCompletionMetric`（Agent 任务完成）
  - `DAGMetric`（**二叉判定树**）——与 PRD-012「指标→多维度、Rubric 二元化」模型天然同构
  - 多轮：`KnowledgeRetentionMetric`、`ConversationCompletenessMetric`
  - 4.2.x 新增：`Classifiers`（分类式判定，闭集标签）✅ 可用；`Jev/System One`（实验性、第三方 key）⏸ 观望
- **运行方式**：pytest（`deepeval test run`，CI 向）**或直接程序化 `metric.measure(test_case)`**（平台集成用，无需 pytest）。
- **自定义 judge**：`DeepEvalBaseLLM` 子类接任意 OpenAI 兼容端点——**仓库已有 DeepSeek 适配器**（`evals/judges/deepseek_judge.py`）。
- **本地 Web UI**：仍无（官方 Web UI = Confident AI 云端/企业自托管）——结论同 TECH-010，不影响本方案（报告/管理仍自研）。
- **成本**：全本地、免注册；判分成本 = judge 模型 token（DeepSeek 同档模型，远小于 agent 执行成本）。

### 2.2 Langfuse（观测层，本地已在跑）

- 开源自托管 v3；datasets / experiments / LLM-judge / code evaluators / annotation queue / score analytics（TECH-020 已对标）。
- 本项目定位**维持**：trace 观测层（已全量入库）+（可选）deepeval 分数回挂为 score，让"trace ↔ 指标"在观测侧联动（TECH-010 路线 A）。
- 不迁入的理由：其评测以 trace 为中心，dataset/experiment 模型与我们的"用例/任务/闸门/领域口径"不匹配，迁移成本 > 收益。

### 2.3 相邻方案（维持不采用 / 观望）

- **promptfoo**（Node 原生、本地 UI、CI 强）：团队级 UI 备选；作为评测引擎全量迁移（用例/断言/执行全迁）不采用。
- **ragas**：RAG-only，deepeval 已覆盖 — 不单列。
- **OpenAI Evals**：生态绑定 — 不采用。
- **inspect_ai**：自带 agent 框架假设（被测对象需按其 solver 模型包装）— 外接成本高，本轮不纳入。
- **Confident AI 云端 / 企业自托管**：数据出域 / 商务门槛 — 不采用（同 TECH-010）。

---

## 3. 复用边界（PRD-012 逐能力对表）

| PRD-012 能力 | deepeval | Langfuse | 结论 |
|---|---|---|---|
| 判分：忠实 / 硬幻觉 | ✅ Faithfulness / Hallucination（成熟实现） | — | **复用** |
| 判分：完整度（golden 要点） | ✅ GEval（criteria 模板） | — | **复用** |
| 判分：安全护栏（医疗） | ✅ GEval（已示范 0.8 一票否决） | — | **复用** |
| 判分：角色风格 | ✅ GEval（已示范） | — | **复用** |
| 判分：工具调用正确性 | ✅ ToolCorrectness | — | **复用** |
| 判分：任务完成度 | ✅ TaskCompletion | — | 复用（P2 接入） |
| 第 2 期：指标→多维度 Rubric | ✅ **DAGMetric**（二叉树）+ GEval | — | **编译式复用**：配置对象 → metric 构造参数 |
| 评分聚合（加权 / 样本分 / 阈值裁决） | ⚠️ 输出连续分；聚合公式是自有口径 | — | 自研薄层（~百行） |
| 变量系统（chat_query 等） | 🔧 映射到 `LLMTestCase` 字段（input / actual_output / retrieval_context / tools_called） | — | 自研配置映射 |
| 重判（不重跑 agent） | ✅ `measure()` 直接对存量结果判分 | — | **复用**（支撑校准 / 试跑 / 补判） |
| 报告：五指标 / 决策四态 / 归因分布 | ❌ | ❌ | 自研（第 1 期已实现大半） |
| 归因（环境 / 裁判 / 被测） | ❌ | ❌ | 自研 |
| 成本 / Token 采集 | ❌（云版有） | trace usage（已有） | 自研（第 1 期已实现） |
| 用例库 / 任务 / 台账 / 进度 / 中止 | ⚠️ Dataset（本地 JSON，弱于我们的 DB 模型） | datasets（迁移成本高） | 自研保留 |
| 发布检查 / 门禁 / 飞轮 | ❌ | ❌ | 自研（第 3/4 期） |
| 人机一致率（校准） | 🔧 重判对比可复用 | annotation | 自研薄层 + deepeval 重判 |

---

## 4. 目标架构（判分引擎接线）

```
        ┌──────────────── minicare-platform（自研·保留） ────────────────┐
        │ 用例/任务/维度配置 → 运行调度（现有 harness 子进程，--no-judge） │
        │ → 台账（eval_run / eval_case_result）                          │
        │ → 报告聚合 compute_report（五指标/归因/决策/成本，第 1 期已建） │
        └───────▲─────────────────────────────────────────┬────────────┘
                │ 判分结果回写（judge 字段：score→{pass,score,reason}）│ 导出台账结果 JSON
                │                                                  ▼
        ┌───────┴─────── minicare-agent/evals 判分引擎（deepeval·复用）──────┐
        │ 配置编译：指标/维度配置 → GEval / DAGMetric / 内置指标 构造参数      │
        │ 执行：metric.measure(LLMTestCase)（逐用例；并发/重试/解析由 deepeval）│
        │ Judge：DeepSeekJudge（已有适配器）｜输入：台账导出的用例结果 JSON     │
        └──────────────────────────────┬───────────────────────────────────┘
                                       │ （可选）分数回挂
                                       ▼
        Langfuse（观测层·现有）：trace + scores
```

1. **执行与判分解耦**：平台发起 run 时 `--no-judge`（只执行 + 确定性断言）；判分是平台侧**独立步骤**（可单独触发 = 天然支持重判 / 补判 / 校准）。
2. **judge 字段兼容**：deepeval 结果写入现有 `eval_case_result.judge` JSON（`{key: {pass, score, reason, ...}}`）——gate 六项、第 1 期报告、证据链渲染**零改动**。
3. **配置编译（第 2 期落点）**：`eval_indicator / eval_dimension` → 编译器生成 deepeval metric（DAG 承载"指标→多维度"，GEval 承载维度要点）。
4. **迁移期双跑对照**：同一轮结果，Node 自写 judge vs deepeval 判分并排对比（沿用 TECH-021 S-06 一致性对照方法论），方向一致后切换默认引擎。

---

## 5. 落地步骤（建议顺序）

| # | 动作 | 产出 / 验收 |
|---|---|---|
| 1 | **重装 deepeval**：项目自有 venv（`minicare-agent/evals/.venv`）；代理用当前 Clash 端口 **7897**（README 的 7890 已失效）；钉版本入 `requirements.txt` | `deepeval --version` 4.2.x；`test_agent_eval.py` P0 套件复跑通过 |
| 2 | **P1b 判分引擎**：新增 `evals/score_run.py`（读台账导出 JSON → deepeval 判分 → 输出 scores JSON）；平台侧"判分步骤"（对已有 run 手动触发） | 对某轮 R1 存量结果重判成功；与 Node judge 双跑对照 |
| 3 | **平台接线**：平台发起 run 默认 `--no-judge`；判分步骤由平台调度；judge 回写；「重判整轮 / 单例」入口 | 完整链路：执行 → 判分 → 报告（五指标/归因/决策）全通 |
| 4 | 第 2 期 Rubric：配置 → deepeval 编译（DAG/GEval）+ 样本分聚合 | 按 PRD-012 US-15~17 验收 |
| 5 | （可选）分数回挂 Langfuse；Node harness judge 标 deprecated | 观测侧联动 |

---

## 6. 风险与对策

| # | 风险 | 对策 |
|---|---|---|
| R1 | deepeval 版本升级行为漂移（指标 prompt 随版本变化） | 锁版本；口径版本随分数入库；升级前跑对照集 |
| R2 | GEval 连续分 vs 二元 pass/fail 的口径差 | 阈值校准用现有"改判/试跑"闭环；关键维度优先 **DAG 二元判定**而非连续分 |
| R3 | 判分迁 Python 后的职责边界模糊 | 明确定义：harness = 执行 + 确定性断言（不判主观）；平台 = 主观判分 |
| R4 | 判分成本 / 时长变化 | 只判"入过评审"的用例（确定性失败不判，现状已如此）；成本 ≪ 执行成本 |
| R5 | 环境再次丢失（托管 venv 覆辙） | 依赖装进**项目自有 venv**（gitignore + README 记录重建命令），不依赖托管环境 |
| R6 | 迁移期双引擎口径漂移 | 双跑对照为准入硬验收；引擎来源记入运行快照（node / deepeval） |

---

## 7. 对既有工作的影响

- **TECH-026 第 1 期（报告层）**：不受影响，继续实施（迁移/归因/聚合/接口已完成；余 harness Token 透出 + 前端）。
- **TECH-026 第 2 期（Rubric）**：执行引擎由"自研评分引擎"改为"**deepeval 编译执行**"（本文 §4）；配置对象、聚合公式、UI 仍自研。
- **TECH-010 P1b**：正式立项为"平台判分引擎（deepeval）"。
- **Node harness judge**：保留兼容（CLI 场景）、不再演进；平台链路默认走 deepeval。

## 8. 参考

- `minicare-agent/evals/README.md`（D1-D6 指标设计 + 踩坑记录 + 运行命令）
- `docs/tech/TECH-010-deepeval-webui-research.md`、`docs/tech/TECH-020-agent-eval-platform-research.md`
- deepeval GitHub Releases（4.2.2；DAG 重构 / Classifiers / Jev）与 PyPI 版本页（本轮实查）
- `docs/prd/PRD-012.md`、`docs/tech/TECH-026-agent-eval-report-v2.md`
