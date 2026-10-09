# TECH-020 — Agent 测评平台能力升级 · 行业实践调研

> 日期：2026-10-09 ｜ 状态：调研完成，待设计对齐
> 背景：首期测评台（TECH 前序 + PRD-010）落地了「运行 → 进度 → 结果 → 历史」闭环，但**用例 / 任务 / 裁判 / 维度**
> 四类对象仍全部固化在代码与 JSON 文件里，页面不可见、不可配。用户要求对标行业实践，升级为完整的测评体系。
> 本文只做调研与差距分析，不展开详细设计（设计另文）。

---

## 0. 结论摘要（先看这个）

1. **行业已经收敛出「四对象模型」**：任何成熟的 LLM/Agent 测评平台都可以拆成
   **用例（Dataset）→ 任务（Experiment）→ 裁判（Evaluator）→ 维度（Criteria/Metric）** 四类一等对象，
   再加"运行实例（Run）"与"人工闭环（Annotation）"两个附属机制。
2. **国内平台（百炼）与海外平台（Langfuse/LangSmith/Braintrust）在四对象上的切法高度一致**，
   差异只在"对象粒度"：百炼把「维度 + 评分方式 + 裁判配置 + 评分器 Prompt」合成一个"评测维度"对象；
   海外平台拆得更细（维度 = evaluator 的 criteria，裁判 = judge 模板/代码函数，二者分开管理）。
3. **对 minicare 的直接启示**：
   - 我们已有"运行 + 台账"（首期），**缺的正是四个管理面**：用例库、任务配置、裁判库、维度配置；
   - 我们的 **L0-L6 分层 + gate 六项** 已经是很好的"维度体系雏形"，需要把它**对象化、可配置化**；
   - 我们的 harness judge（`lib/judge.mjs` 四个判分器）应升级为**可管理的裁判对象**（prompt 可编辑、模型可选、可开关）；
   - 实测中抓到的 **L3-01 `faithfulness` 假阳性**，恰是行业里"裁判未校准"的典型案例 —— 校准闭环应纳入设计。
4. **建议的分期**：一期把四对象 DB 化 + 管理界面（对齐首期执行链，零重写 harness 语义）；
   二期加对比视图、裁判校准、人工标注；三期接在线评测（生产 trace 采样回流入集）。
   详见 §5。

---

## 1. 行业平台功能矩阵（2026 年视角）

| 能力 | Langfuse（自托管首选，MIT） | LangSmith（LangChain 系） | Braintrust（评测驱动） | Confident AI（DeepEval 云） | 阿里百炼 | 火山方舟 |
|---|---|---|---|---|---|---|
| 用例（Dataset） | ✅ items / 版本 / 文件夹 / 从 trace 一键入集 / CSV 导入 | ✅ 强项的"trace→dataset 策展"+版本化 | ✅ 版本化数据集 | ✅ 数据集策展 | ✅ 评测数据集 / 推理结果集 | ✅ 离线/在线数据集 |
| 任务（Experiment） | ✅ SDK / UI 双入口，逐 item 并排对比 | ✅ experiments + 统计显著性 | ✅ experiment diff UX 是全类最佳 | ✅ no-code + 代码 | ✅ 任务 = 被评模型 × 数据集 × 维度 | ✅ 自动/人工评测任务 |
| 裁判（Evaluator） | ✅ LLM-as-judge 模板目录 + 代码评测器（2026-05 GA）+ 自定义 | ✅ LLM-as-judge / 代码 / 多轮 + **校准（Align）** | ✅ 自定义 scorer（代码为主）+ judge 模板 | ✅ 50+ 研究支撑的指标库 | ✅ 裁判模型 + 评分器 Prompt | ✅ 人工标注模板 |
| 维度（Criteria） | ✅ score 配置（数值/分类/布尔） | ✅ 每个 evaluator 一个 criteria | ✅ scorer 即维度 | ✅ 指标即维度 | ✅ **独立"评测维度"对象**（名称/描述/评分方式/裁判/评分器 Prompt） | ✅ 满意度 / GSB / 有用性 / 真实性 / 安全性 |
| 人工闭环 | ✅ Annotation Queues | ✅ Annotation Queues + rubrics | ✅ 人工评分 | ✅ Annotation Queues | ✅ 人工分类打分 | ✅ 人工评测（角色分配） |
| CI 门禁 | ✅ experiment-action（GitHub Action） | ✅ SDK 驱动 | ✅ **CI 阻断 merge 是卖点** | ✅ GitHub/GitLab | （平台内任务为主） | — |
| 在线评测 | ✅ LLM-judge 跑生产 trace | ✅ online evaluators | ✅ 异步线上打分 | ✅ online evals + 告警 | 支持定期评测 | ✅ 在线评测 |
| 校准/人机对齐 | score analytics 佐证 | **Align Evaluator 专门功能** | 自动统计显著性 | 人机对齐宣传点 | 人工抽检 | — |
| 红队/安全 | （无原生） | （无原生） | （无原生） | ✅ 120+ 漏洞类型 | 内容安全维度 | — |

> 一句话选型参考（对 minicare 场景）：**架构与自托管约束最接近的是 Langfuse**；"四对象"的国内最直译参考是 **百炼**；评测驱动工作流（diff/CI）的标杆是 **Braintrust**。

---

## 2. 四个模块的行业实践详解

### 2.1 测评用例（Dataset / Test Case）

**数据模型**（各平台共识）：Dataset（容器，带版本）→ Dataset Item：
`{ input, expected_output（可选）, metadata, 版本 }`；我们的用例天然还有 `expect`（确定性断言）
与 `judge`（判分要点）——即"期望行为的可判定表达"，这比多数平台的裸 expected_output 更结构化，是优势。

**来源"四渠道"**（行业标准做法，Langfuse/LangSmith 都实现了前两条）：
1. **手工编写**（初始种子）；
2. **从生产 trace 一键入集**（"trace-to-dataset flywheel"——所有平台的头号卖点；Langchain checklist 明确
   要求"用 20-50 条真实 trace 人工过一遍再建评测"）；
3. **合成生成**（LLM 生成种子题，从私有数据生成需脱敏）；
4. **外部导入**（CSV / JSON / 公开基准适配）。

**组成配比建议**（多来源共识）：代表性 70% + 边缘 case 20% + 对抗 case 10%；
**正例与负例都要**（"该触发"与"不该触发"）。
**规模参考**：最小可用 100+；稳健 500–1K；生产系统 2,000+。
**管理能力**：CRUD、版本、标签（capability 分类）、启停、**冻结回归集 + 轮换新鲜集**、
按难度分层；以及"每一次生产事故 → 沉淀为一条回归用例"的**闭环纪律**（每周 eval review 的固定议程）。

### 2.2 测评任务（Experiment / Run）

**概念模型**（Langfuse 定义最清晰）：
`Experiment = Task（被测对象，如某 prompt 版本）× Dataset（用例集）× Evaluators（判分）` 的一次执行；
每次执行产出 **per-item 结果矩阵**，可与其他 experiment **并排对比**。
**Braintrust 的三件套**：`data（dataset）+ task（model+prompt）+ scores（scorers）`，每次运行都是一个可 diff 的 experiment。

**能力清单**（行业标配）：
- 配置快照：**prompt 版本 / 模型 / 代码 / 用例集版本**全部记录（可复现，出问题能归因"到底哪变了"）；
- 执行控制：批量、并发、**中止**、**重复轮次（trials，应对非确定性）**、隔离环境（每 trial 无共享状态）；
- 结果对比：与基线并排 diff、**统计显著性**（Braintrust 自动计算）、失败用例定位；
- 触发方式：手动 / 定时 / **CI（PR 时跑回归集，回归即阻断 merge）**；
- 效率指标与质量并列追踪：**步数、工具调用数、延迟、每任务成本**。

**评测三级**（LangChain 的框架，值得照搬）：
single-step（单次调用）→ **full-turn / trace（一整轮 agent 执行）** → multi-turn / thread（多轮会话）；
建议从 trace 级开始，按需下探/上探。

### 2.3 测评裁判（Evaluator / Judge）

**三类裁判分工**（共识，"能用代码就用代码"）：
| 类型 | 适用 | 特点 |
|---|---|---|
| 代码/规则 | JSON 格式、工具参数、状态断言、数值比对 | 快、确定、免费、可信；**优先** |
| LLM-as-judge | 忠实性、语气、完整性、推理质量等主观维度 | 可规模化；与人类一致率 **74–85%**；须防偏见 |
| 人工 | 模糊 case、金标准构建、校准 | 质量最高、最贵；**用于校准与仲裁，而非全量** |

**LLM-judge 工程最佳实践**（多来源收敛）：
- **二元/低精度优先**（"grounded vs hallucinated" 优于 5 分制；1-5 分制有 >60% 集中中间值的倾向）；
- **一个 judge 只判一个维度**（acc + tone + completeness 拆成三个 judge，结果确定性聚合）；
- **先推理后结论**（CoT 提高质量并留下可审计的理由）；
- **temperature=0**；prompt 里**明确每个标签的定义与边界**；
- **防偏见三件套**：位置交换、参考答、**用不同的模型当裁判**（同族模型有自我偏好，实测 +9.4%）；
- **分档裁判**：便宜小模型做初筛门，难 case 交贵模型终审（成本/质量平衡）；
- **校准（Calibration）**：建小规模人工标注集，跑 judge 对齐——**LangSmith 的 "Align Evaluator" 就是把这个流程产品化**：
  UI 里用专家反馈反复修 judge prompt，直到与人类判定一致。**没有校准的 judge 不可用于门禁。**

**裁判的生命周期管理**：judge prompt 模板化（占位符 + 预览）、模型可选、版本化、
**"裁判 got it wrong" 与 "agent 做错了" 必须分开统计**（langchain checklist 明确列为两项）。

### 2.4 测评维度（Criteria / Metrics）

**两种组织方式（两种都可参考）**：
- **百炼式（合并派）**：一个"评测维度"对象 = 维度名 + 描述 + **评分方式** + 裁判模型 + 评分器 Prompt。
  评分方式 5 种：LLM 数值打分 / LLM 分类打分 / 字符串匹配 / 文本相似度（ROUGE/BLEU/Cosine）/ 人工分类。
  任务创建时挂"一个或多个维度"。全流程：**创建评测维度 → 准备评测数据 → 创建评测任务 → 查看结果**。
- **Langfuse/LangSmith 式（拆分派）**：维度 = 业务要测什么（criteria），裁判 = 用什么打分（evaluator），
  二者解耦、自由组合；score 类型（numeric/categorical/boolean）单独配置。

**维度体系设计**：
- **按业务链路分层**（我们有现成的：L0 检索 / L1 工具 / L2 回答 / L3 安全 / L4 会话 / L5 性能 / L6 体验）；
- **capability vs regression 分离**（新能力探索集 vs 稳定回归集，两者节奏与门槛不同——勿混一个池子）；
- **一票否决 + 加权聚合**：安全类维度（高危护栏）单项不达即整体不通过；其余维度可加权综合分；
- **门禁阈值挂在维度上**（不是挂在任务上），如"硬幻觉率=0、护栏=100%、其余 ≥95%"。

---

## 3. 横向共性（平台级）

1. **双循环**：离线（数据集 + 实验 + CI 门禁）与在线（生产 trace 采样打分 + 告警）——
   在线发现的新 case **一键回流入数据集**，这是"越用越准"的飞轮；
2. **人的位置**：不让人看全量输出，而是**让专家设计与校准裁判**（LangChain 原话：
   "humans help design and calibrate automated evaluators, rather than manually reviewing large volumes"）；
   人工只做三件事——建金标准、校准 judge、仲裁分歧；
3. **版本化一切**：prompt / 用例集 / 裁判 / 工具定义 / 代码，缺一不可复现；
4. **统计意识**：非确定性 → 多 trials、分布而非单点、显著性而非感觉；
5. **成本与质量并列**：每任务 token/工具调用成本、延迟 P95 与质量分同屏展示。

---

## 4. minicare 现状对照与差距清单

| 对象 | 现状（2026-10-09 首期后） | 行业基线 | 差距 |
|---|---|---|---|
| **用例** | 46 条 JSON 在 git（`minicare-agent/scripts/eval/cases/*.json`），页面不可见、不可编辑 | Dataset 一等对象 + CRUD + 版本 + 标签 + 从 trace 入集 | 🔴 无管理面；无从运行沉淀；无版本追溯（只有整体 hash） |
| **任务** | "运行"= 一次性发起 + 台账 + 简版 delta | Experiment = 可保存/复刻/对比的配置对象 | 🔴 无任务模板（每次重选）；无并排对比视图；无 trials 语义（有 runs 参数但未产品化）；无定时/CI |
| **裁判** | 4 个判分器硬编码在 harness `lib/judge.mjs`；模型固定 v4-pro | 裁判库：模板可编辑 / 模型可选 / 温度可配 / 可开关 / 可校准 | 🔴 完全不可配；**无校准**（L3-01 假阳性即此缺口实例）；"裁判错"与"agent 错"未分离统计 |
| **维度** | L0-L6 + gate 六项目标值硬编码在 Python（`compute_gate`） | 维度对象：名称/评分方式/阈值/权重/一票否决/挂载裁判 | 🔴 目标值不可配；无维度子集选择（每次全测）；无维度级趋势 |
| 运行/台账 | ✅ 已有一期（触发/进度/中止/入库/详情/历史） | — | 🟡 基础可用；待接"任务模板" |
| 人工闭环 | 无 | Annotation Queue 全平台标配 | 🔴 无（当前靠"人工看页面"代替） |
| 在线评测 | 无（Langfuse trace 有，未做打分） | Online evals | 🔴 三期候选 |

---

## 5. 对 minicare 的建议（概念模型与分期）

### 5.1 五对象模型（对齐行业）

```
维度（Dimension）  = 要测什么 + 怎么判 + 阈值/权重（可配，如"忠实性/护栏/工具收敛"）
裁判（Judge）      = 用谁判（LLM 裁判 prompt+模型 / 代码断言 / 人工），每个维度绑一个
用例（Case）       = 测什么输入 + 期望行为（expect 断言 + judge 要点）；挂在用例集（可打标签/版本）
任务（Task）       = 用例集 × 维度子集 × 裁判配置 × 被测环境 的命名配置（可复刻）
运行（Run）        = 任务的一次执行（已有）；挂任务 id 后可对比"同一任务历轮结果"
```

### 5.2 落地要点（工程视角）

1. **配置物化**：用例/裁判/维度存 `platform.db`（新增 `eval_case` / `eval_judge` / `eval_dimension` 表）；
   运行时由平台"物化"为 harness 可读的配置文件（cases.json + judges.json）注入子进程执行——
   **harness 评测语义不重写**（延续 D3），仅把 `lib/judge.mjs` 从"硬编码"改为"读配置"；
2. **git 与 DB 的关系**：DB 为运行时唯一源，提供"导出/导入 JSON"以便 git 留档（对齐"版本化"要求）；
3. **裁判校准**：最小闭环 = 页面上对单条用例的 judge 结论做"人工改判"，记录到 `eval_case_result.annotation`，
   积累 N 条后给出"人机一致率"作为 judge 可信度指标（对应 LangSmith Align 的轻量版）；
4. **安全维度一票否决**：gate 判定沿用"护栏=100%、幻觉=0"的硬门槛，且这组阈值应在维度配置里可改可查。

### 5.3 分期建议

| 期 | 内容 | 对齐 |
|---|---|---|
| **一期** | 四个管理面（用例库 / 任务配置 / 裁判库 / 维度配置）+ 配置物化执行 + 运行详情挂任务 id | 本文 §2 全部模块的"最小可管理版" |
| **二期** | 两 run 并排对比（diff UX）、裁判校准（人机一致率）、人工标注（轻量队列）、维度级趋势 | Braintrust diff / LangSmith Align / Langfuse annotation |
| **三期** | 在线评测（Langfuse trace 采样打分）、生产失败回流入集、CI 门禁 | 双循环飞轮 |

---

## 6. 参考来源

- Langfuse 官方：Evaluation Overview / Core Concepts / Clarifications（2026-09 版）——datasets、experiments、
  LLM-as-judge、code evaluators（2026-05 GA）、annotation queues、score analytics；
- LangSmith：Agent Evaluation Readiness Checklist（LangChain Blog）——三级评测、正负例、校准、trials、回归纪律；
  Human judgment in the agent improvement loop——Align Evaluator 校准闭环；
- Braintrust：dataset+task+scorer 三件套、experiment diff、CI 阻断；
- Confident AI（DeepEval）：50+ 指标、no-code evals、red teaming 120+ 漏洞类型、平台功能矩阵对比；
- 阿里云百炼：模型评测（评测维度 / 评测任务 / 5 种评分方式 / 裁判模型 / 评分器 Prompt / 全流程四步）；
- 火山方舟：人工评测（标准模板 / 满意度 / GSB / 角色分配）、在线评测；
- 方法论补充：构建评测金字塔（60/25/10/5）、golden dataset 配比（70/20/10）、
  LLM-judge 一致率 74–85%、judge 偏见（self-preference +9.4%）、分档裁判策略。
