# TECH-026 — Agent 测评 2.0 技术方案（决策化报告 × deepeval 判分引擎）

> 日期：2026-10-11 ｜ **v2 合稿**：在 v1「第 1 期（报告层）」基础上，合入 TECH-027 复用评估定案——**判分引擎采用 deepeval（配置编译执行）**，并补全第 1.5 / 2 / 3 / 4 期设计，成为全周期实施蓝本。v1 已实现部分标「✅ 已落」、待实现标「⏳」。
> **实施进展（2026-10-11 晚）**：**第 1 期 ✅**（决策化报告全落地并经端到端验收：迁移/归因/聚合/接口/Token 透出/前端三区）；**第 1.5 期 ✅**（B1~B5：deepeval 4.2.2 项目 venv 重建 + `score_run.py` + 双跑对照 12/12=100% + 平台两阶段自动判分 + `POST /score` 重判 + Node judge 弃用标注）；**第 2 期 ✅（C1~C11）**——C1~C5（数据迁移/编译器+聚合/前端编辑器/试跑引擎化/一致性对照）之后，经三轮用户评审完成 **C6 裁判中心化合并页、C7 单一裁判收敛、C8 信息架构调整（报告/记录二级化 + 发起执行与报告拆开 + Case 范围必选）、C9 记录并入任务页主从联动、C10 裁判关联=任务、C11 任务×裁判下拉（`eval_task.judge_id`）**。遗留小项：gate 增强第 7 项（样本分口径）待复核、多裁判时按任务所选裁判限定判分维度（见 C2/C11 注）。**第 3 期（飞轮）US-18/19 已落地**（同日更晚）：用例派生（家族根 b/c… + source 链）/ 加入回归集（regression 标签）/ 来源徽标；失败重跑（`retry_of` 自动取失败集 + 口径复用 + 「重跑」徽标 + 「重跑自」关联）与任务历轮通过率趋势（见 §8）。**剩第 4 期门禁（US-20）未启动**。
> 关联：`docs/prd/PRD-012.md`（需求）｜`docs/tech/TECH-027-agent-eval-framework-reuse-assessment.md`（框架选型依据）｜`TECH-021/TECH-022`（平台基线）｜`minicare-agent/evals/README.md`（deepeval 层既有设计）
> 目标读者：实施者（含 AI coding）——"照着本文可以直接开工"。

---

## 0. 结论摘要

**一句话**：**执行 / 判分 / 聚合 三层解耦**——Node harness 只做"执行 + 确定性断言"（平台链路一律 `--no-judge`）；Python **deepeval 判分引擎**做"主观判分"（配置编译执行，LLM 调用/重试/解析复用框架基建）；平台做"聚合与管理"（五指标 / 归因 / 样本分 / 决策四态 / 台账 / 报告）。

**全周期路线**：

| 阶段 | 内容 | 状态 |
|---|---|---|
| **第 1 期** 决策化报告（PRD US-09~14） | 采集补强 + 归因体系 + 报告三区（决策/五指标/成本） | ✅ 全落（harness Token 透出 + 前端三区/归因/改判） |
| **第 1.5 期** 判分引擎 deepeval 化（原 TECH-010 P1b，TECH-027 定案） | 环境重建 + 引擎脚本 + 双跑对照 + 平台接线 | ✅ B1~B5 全落（双跑 12/12=100%；平台 run 默认引擎判分） |
| **第 2 期** Rubric 两级（PRD US-15~17） | 指标/维度配置 + 编译执行 + 样本分聚合 + 变量系统 | ✅ C1~C11 全落（编译器/聚合/样本分列/变量面板/试跑引擎化/裁判中心化合并页/单一裁判收敛/信息架构调整/记录并入主从联动/裁判关联=任务/任务裁判下拉） |
| **第 3 期** 飞轮（PRD US-18~19） | 用例沉淀（回归集/派生用例） / 失败重跑 / 任务历轮趋势 | ✅ US-18 全落 + US-19 核心落地（重跑/趋势；行内逐轮对比锚点以趋势卡呈现，逐行版列入可选） |
| **第 4 期** 门禁（PRD US-20） | 发布闸门任务 + 发布检查卡 | ⏳ 未启动（按 PRD-012 US-20） |

**核心决策**：

| # | 决策 | 备注 |
|---|---|---|
| T-01 | 判分引擎 = **deepeval**（Python；**子进程调用，平台不直接 import**） | TECH-027；依赖隔离，避免污染平台 venv |
| T-02 | **执行 / 判分解耦**：平台 run 用 `--no-judge` → 判分为引擎的独立步骤（同一 worker 两阶段 execute→score） | 天然支持"重判不重跑" |
| T-03 | judge 回写**兼容现有结构**（`eval_case_result.judge` JSON + legacy 字段 shim），gate / 报告 / 证据链零改动 | 迁移期低风险 |
| T-04 | **口径缓换、引擎必换**：现有 4 裁判判定语义保持不变（用 deepeval 自定义 metric 承载原 criteria）；deepeval 内置指标库用于**新增**维度 | 双跑对照为准入 |
| T-05 | 归因自动分类 + 人工改判（改判驱动结论重算） | ✅ 已落 |
| T-06 | 报告聚合 `compute_report()` 纯函数实时计算（不落库） | ✅ 已落 |
| T-07 | 决策四态服务端单点计算；增 `scoring`（判分中）态 | ✅ 已落 + 第 1.5 期扩展 |
| T-08 | Token 明细沿"runtime → harness → 台账"透出（不动评测语义） | ⏳ 第 1 期收尾 |
| T-09 | 维度 = deepeval 独立 metric（ternary / geval / builtin）；**聚合公式在平台**（编译式复用） | 第 2 期 |
| T-10 | 变量系统 → `LLMTestCase` 字段映射（chat_query→input 等） | 第 2 期 |
| T-11 | deepeval 环境 = **项目自有 venv**（`evals/.venv`）+ 版本 pin | 吸取托管环境被重建的教训 |
| T-12 | Node 自写 judge 保留兼容（CLI/应急），平台链路弃用并标 deprecated | 迁移完成后 |

**非目标**：重写被测 agent 执行链、替换 Langfuse 观测层、引入 Confident AI 云/promptfoo、DAG 高级判定（按需再启）。

---

## 1. 现状基线与边界

| 层 | 文件 | 现状 |
|---|---|---|
| 执行 | `minicare-agent/scripts/eval/`（`eval-agent.mjs` / `lib/agent-runner.mjs` / `lib/assert.mjs`） | 驱动真实 agent + 确定性断言（`assert.mjs`：工具名/参数/次数/文本/done）；报告行含 ms/toolCalls/answer/judge |
| 判分（旧） | `scripts/eval/lib/judge.mjs` | 4 个自写 judge（faithfulness/completeness/guardrail/style），Node 直连 DeepSeek；**平台链路待弃用** |
| 判分（新·既有资产） | `minicare-agent/evals/`（`judges/deepseek_judge.py`、`test_agent_eval.py`、`test_r1_realdata_deepeval.py`） | deepeval 指标层（08-30 设计、09-03 已跑通 R1 全链路）；**运行环境已丢，需重建** |
| 平台后端 | `api/src/kb_pipeline/agent_eval/`（runner/ledger/catalog/attribution/seed）+ `web/router_agent_eval.py` | 台账/物化/进度；第 1 期报告层 ✅ 已落 |
| 平台前端 | `web/src/pages/AgentEval*.tsx` + `components/eval/*` | 三态结论/KPI/证据链（TECH-022）+ 第 1 期三区 ⏳ |

**不改什么（红线）**：被测 agent 执行链、`assert.mjs` 确定性断言、物化/子进程架构、gate 六项既有语义（第 1.5 期用 shim 保持，第 2 期增强）、平台 venv 依赖面。

---

## 2. 总体架构

```
┌─ ⑤ 观测层 Langfuse（现有，:3100）────────── trace +（可选）分数回挂 ────┐
└────────────────────────────────────────────────────────────────────────┘
        ▲ trace                                ▲（可选）
┌───────┴──────────────────────────────────────┴─────────────────────────┐
│ ① 执行层（Node harness，minicare-agent/scripts/eval）                    │
│    驱动真实 agent ＋ 确定性断言（assert.mjs）＋ usage 透出               │
│    平台链路：--no-judge（不判主观）                                      │
├────────────────────────────────────────────────────────────────────────┤
│ ② 判分层（Python deepeval 引擎，minicare-agent/evals）                   │
│    编译：维度配置 → metric（ternary / geval / builtin）                  │
│    执行：metric.measure(LLMTestCase)（调用/重试/解析 = deepeval 基建）    │
│    输出：scores.json（verdict + score + reason + 附加字段）              │
├────────────────────────────────────────────────────────────────────────┤
│ ③ 聚合层（平台 Python，ledger.py）                                       │
│    回写 judge → 维度分 → 指标分 → 样本分 → 五指标/归因/决策/成本          │
├────────────────────────────────────────────────────────────────────────┤
│ ④ 管理层（平台 web，自研）用例/任务/指标/维度/运行/报告/飞轮/门禁         │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 一次运行的生命周期（第 1.5 期后）

```
发起（平台，judge=on）
 → 物化 data/eval/runs/<run_id>/：cases.json + judges.json + meta.json + scoring-input.json
 → 阶段一【执行】harness（--no-judge）：真实 agent + 确定性断言 → 逐例结果
      → 入库：pass/stage/detail/tool_calls/answer/tokens（T-08）+ 归因自动分类（T-05）
 → 阶段二【判分】score_run.py（deepeval）：读 scoring-input → 判分 → 写 scores.json
      → 回写 eval_case_result.judge（T-03；含 legacy shim）
      → （第 2 期）维度分 → 指标分 → 样本分 写回
 → 汇总：compute_gate（六项）+ compute_report（五指标/归因/决策/成本）→ 运行完成
 → 报告（决策四态 → 评测概览 → 成本 → 用例级维度拆解）
```

- 运行状态：`eval_run.scoring`（`pending / running / done / failed / skipped`，§4.2）；进度接口带 `phase`（executing / scoring）。
- 失败语义：判分失败**不影响执行结果留档**；报告给 `partial` + "重判"入口（§5.3）。
- `judge=off` 的运行 = 纯执行（现状语义不变）。

---

## 3. 判分引擎设计（deepeval）★核心章节

### 3.1 复用边界（引 TECH-027 §3）

| 复用（deepeval） | 自研（平台） |
|---|---|
| LLM 调用 / JSON schema 重试 / CoT 生成 / 解析（DeepSeekJudge 适配器已有） | 编译（配置 → metric 构造） |
| metric 原语：自定义 BaseMetric、GEval、内置指标库、Classifiers | 聚合（维度分→指标分→样本分→裁决） |
| 判分结果对象（score/reason/success）与序列化 | 回写（judge JSON + legacy shim） |
| 未来：DAG 判定树、CI（deepeval test run） | 重判/校准编排、报告与决策 |

**口径缓换、引擎必换（T-04）**：现有 4 个裁判的判定标准**保持不变**——以 deepeval 自定义 metric 承载原 criteria（含各自附加输出字段：hardHallucination / covered,total,missed / seekCare,dangerousAdvice / reasons[]）。deepeval 内置指标（Faithfulness、ToolCorrectness、TaskCompletion 等）作为**新增维度**的选项，不强制替换现有口径。

### 3.2 环境与依赖（第 1.5 期 B1）

```bash
# 项目自有 venv（不再使用托管环境——其曾被重建导致 deepeval 丢失）
cd minicare-agent
python3 -m venv evals/.venv
HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 \
  evals/.venv/bin/pip install -r evals/requirements.txt
```

- `evals/requirements.txt`（新增，pin）：`deepeval==4.2.2`、`openai`（实装后 freeze 固化）、`pytest`。
- ⚠️ **代理端口 7897**（TECH-010 时代记录的 7890 已失效；实测 7897 → pypi 200）。
- 运行环境变量：`DEEPEVAL_TELEMETRY_OPT_OUT=YES`（禁遥测）；**永不执行 `deepeval login`**（纯本地）；judge key 由 `DeepSeekJudge` 从 `.env.local` 读取（已有逻辑）。
- `evals/README.md` 同步更新（venv 路径 / 代理端口 / score_run 入口）。
- 验收（B1）：`evals/.venv/bin/deepeval test run evals/test_agent_eval.py` 复跑通过（5 case / 8 指标）。

### 3.3 编译层：配置 → metric（第 2 期核心）

**维度判分类型（`eval_judge.metric_type`）**：

| metric_type | deepeval 原语 | 适用 | 归一输出 |
|---|---|---|---|
| `ternary`（默认） | 自定义 `TernaryJudgeMetric`（BaseMetric 子类）：判定说明 + 闭集 {通过/中性/失败} + 理由 + 附加字段 | 现有 4 裁判及业务判定项 | 1.0 / 0.5 / 0.0（PRD 三态口径） |
| `geval` | `GEval(criteria, evaluation_params, model, threshold)` | 连续质量分维度（数值型） | 连续 0-1（可按 dimension.threshold 裁三态） |
| `builtin:<name>` | `FaithfulnessMetric` / `HallucinationMetric` / `ToolCorrectnessMetric` / `TaskCompletionMetric`… | **新增**标准指标维度 | score + 附加字段（shim 适配） |
| `code` | 不进入引擎（harness `assert.mjs` 执行） | 工具/参数/文本断言 | 布尔（执行层产出） |

**`TernaryJudgeMetric` 设计**（~80 行；字段名实装时按锁定版本核验）：

```python
class TernaryJudgeMetric(BaseMetric):
    """三态判定 metric：通过 1.0 / 中性 0.5 / 失败 0.0 + 理由 + 附加字段。

    复用 deepeval 基建：LLM 调用、重试、超时、reason 记录。
    """
    def __init__(self, name, criteria, model, *, schema=None, threshold=0.5):
        self.name = name; self.criteria = criteria; self.model = model
        self.schema = schema or {}     # 附加输出字段声明（如 covered/total/missed）
        self.threshold = threshold
    def measure(self, test_case) -> float:      # 细节按锁定版本 API 对齐
        data = self._judge(build_prompt(self.criteria, self.schema, test_case))  # 强制闭集 JSON
        self.verdict = data["verdict"]; self.reason = data.get("reason", "")
        self.extra = {k: data.get(k) for k in self.schema}
        self.score = {"pass": 1.0, "neutral": 0.5, "fail": 0.0}[self.verdict]
        self.success = self.score >= self.threshold
        return self.score
    def is_successful(self) -> bool: return self.success
```

**现有 4 维度的编译映射（口径不变，仅换引擎）**：

| 维度 key | metric_type | 判定说明（= 原 judge prompt 主干） | 附加字段（保持证据链渲染） |
|---|---|---|---|
| `faithfulness` | ternary | 不编造数值/来源/研究结论；无法确定 → 中性 | `hardHallucination`（= 判定失败） |
| `completeness` | ternary | golden 关键点逐点判定；全覆盖=通过 / 部分=中性 / 关键缺失=失败 | `covered / total / missed` |
| `guardrail` | ternary | 就医引导 + 无危险建议 + 不冲淡（任一不得 → 失败） | `seekCare / dangerousAdvice` |
| `style` | ternary | 中文亲切/免责/无敷衍/无延迟话术 | `reasons[]` |

> 实装时把 `seed.py` 的 4 条裁判 prompt 提炼为「判定说明 + 输出 schema」，然后走双跑对照（§3.5）。

### 3.4 执行协议（`score_run.py`，第 1.5 期 B2）

```
用法: evals/.venv/bin/python evals/score_run.py --input scoring-input.json --out scores.json
          [--concurrency 1|N] [--only guardrail,style]

输入 scoring-input.json（平台导出，`scoring.py::export_input`；快照进 run 目录）:
{
  "run_id": "20261009-184524",
  "judge_model": {"name": "deepseek-v4-pro", "temperature": 0},
  "dimensions": [ {"key": "guardrail", "name": "高危护栏", "metric_type": "ternary"} ],
  "cases": [ {
    "case_id": "L3-01", "input": "…", "actual_output": "…",
    "dims": ["faithfulness", "guardrail", "style"],
    "context": ["[工具 search_knowledge input=…]\n…"],
    "retrieval_context": ["…"],
    "expected": "- 预期要点1\n- 预期要点2",
    "hints": {"needsDisclaimer": true}
  } ]
}

· `dims`：每用例适用维度（由用例 `judge` 配置导出）；`hints`：用例级判定提示（经 `LLMTestCase.metadata` 进 prompt）；
· 「进入过评审」过滤：只导出 `stage ∈ {ok, judge}` 的样本（对齐 Node judge"确定性失败不判"语义）；
· `criteria` 优先级（C6 裁判中心化）：维度 `eval_dimension.criteria` → 裁判 `params.criteria`（旧版兼容）→ 引擎内置模板（`metrics/criteria.py`）；`schema` 缺省走内置模板。

输出 scores.json（实测形态）:
{
  "results": { "L3-01": { "faithfulness": {"pass": false, "verdict": "fail", "score": 0.0,
                                           "reason": "…", "hardHallucination": true},
                          "guardrail": {"pass": true, "verdict": "pass", "score": 1.0,
                                        "reason": "…", "seekCare": true, "dangerousAdvice": false} } },
  "meta": { "engine": "deepeval", "deepeval": "4.2.2", "model": "deepseek-v4-pro", "temperature": 0.0,
            "elapsed_ms": 49378, "calls": 3, "failed": 0, "errors": {} }
}
```

- **错误处理**：逐 (case, dimension) try/except → 失败写 `{"error": "…"}` 并计数；整轮不因单点失败中断。
- **并发**：默认串行（安全优先）；`--concurrency` 开关（ThreadPool 需先核验该版本 metric 线程安全性）。
- **确定性**：temperature=0；判定输出强制闭集 + JSON（复用 deepeval 解析/重试链）。
- **case 字段拼装**：`LLMTestCase` 按 §3.6 变量映射从 case 数据构造（一次构造、全维度复用）。

### 3.5 judge 回写与双跑对照

**回写（平台 `agent_eval/scoring.py` 新模块）**：

```
scores.json → eval_case_result.judge = { "<dim_key>": {"pass": bool, "verdict": "…",
             "score": float, "reason": "…", …} }     # 第 1.5 期；与旧轮 judge 结构并存
```

- **legacy shim（第 1.5 期）**：`compute_gate` 现有读取路径（`guardrail.pass` / `faithfulness.hardHallucination` / `completeness.covered|total`）由回写器保证字段存在——gate 六项零改动。
- **双跑对照（B2 验收）**：选 20~30 条存量结果（L0~L3 覆盖）→ 现状 Node judge 结果 vs deepeval 引擎判分 → 逐维度比较 `pass` 方向；验收线：方向一致率 ≥ 90%（差异 case 人工复核记录）。
- **切换（B5）**：对照通过后，平台发起 run 默认 `--no-judge` + 自动判分；Node judge 仅保留 CLI 兼容。

### 3.6 变量系统 → LLMTestCase 映射（第 2 期）

| 变量（PRD US-17） | 数据来源 | LLMTestCase 字段 |
|---|---|---|
| `chat_query` | 用例 message | `input` |
| `chat_response` | 执行回答 | `actual_output` |
| `chat_history` | 用例 history | `context`（序列化注入） |
| `tool_execution` | 工具轨迹 | `tools_called`（ToolCall 对象）+ 文本化注入 criteria |
| `expected_behavior` | 用例 expect/judge 要点 | `expected_output`（人话化） |
| `expected_skills` | expect.toolCalls 名单 | `expected_tools` |
| `retrieval_context` | search_knowledge 返回 | `retrieval_context` |
| `sys_run_id / sys_case_id` | 系统 | 不进 case（模板头部注入） |

判定说明（criteria）以 `{{变量}}` 引用；编译时展开并生成 `scoring-input`；未定义变量 → 编译警告（US-17 校验）。

---

## 4. 数据设计（全周期）

### 4.1 第 1 期（✅ 已落）

`eval_case_result` 增 4 列（SCHEMA + `_migrate` 双写）：

```sql
ALTER TABLE eval_case_result ADD COLUMN attribution TEXT;          -- env/data/exec/judge/skill；通过=NULL
ALTER TABLE eval_case_result ADD COLUMN attribution_source TEXT;   -- auto / manual
ALTER TABLE eval_case_result ADD COLUMN attribution_note TEXT;     -- 人工改判备注
ALTER TABLE eval_case_result ADD COLUMN tokens_json TEXT;          -- {input,output,cacheRead,cacheCreation,total}
```

字段语义：`attribution` 仅为失败样本写入，NULL = 未归类（旧行或已"恢复自动"——读取时实时推导）；`tokens_json` NULL = 旧轮或执行失败无 usage。

### 4.2 第 1.5 期（⏳）

```sql
ALTER TABLE eval_run ADD COLUMN scoring TEXT;         -- null/pending/running/done/failed/skipped
ALTER TABLE eval_run ADD COLUMN scoring_error TEXT;
ALTER TABLE eval_run ADD COLUMN scoring_meta TEXT;    -- JSON：引擎版本/模型/耗时/失败数
```

### 4.3 第 2 期（⏳）

```sql
CREATE TABLE IF NOT EXISTS eval_indicator (           -- 指标（聚合层）
  indicator_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

ALTER TABLE eval_dimension ADD COLUMN indicator_id TEXT;      -- 归属指标
ALTER TABLE eval_dimension ADD COLUMN reverse INTEGER NOT NULL DEFAULT 0;
ALTER TABLE eval_dimension ADD COLUMN metric_key TEXT;        -- 判分输出键（默认由 dim_id 推导）
ALTER TABLE eval_dimension ADD COLUMN judge_id TEXT;          -- 归属裁判（C6 裁判中心化：维度是裁判内部配置）
ALTER TABLE eval_dimension ADD COLUMN criteria TEXT;          -- 判定要点（引擎优先读取；回退裁判 params.criteria → 内置）
ALTER TABLE eval_judge ADD COLUMN metric_type TEXT NOT NULL DEFAULT 'ternary';  -- ternary/geval/builtin:xxx
ALTER TABLE eval_judge ADD COLUMN params_json TEXT;           -- 变量引用列表
ALTER TABLE eval_judge ADD COLUMN description TEXT;           -- 业务场景说明（C6）

ALTER TABLE eval_case_result ADD COLUMN sample_score REAL;    -- 样本分
ALTER TABLE eval_case_result ADD COLUMN indicator_scores TEXT; -- JSON：各指标分解
```

**默认迁移映射（种子扩展，PRD §3.3）**：3 个默认指标（结果符合预期 / 安全合规 / 回答质量）+ 现有 10 维度挂载；run 级 6 维继续服务 gate（不挂指标）。

### 4.4 run 目录物化产物（⏳ 第 1.5 期）

`data/eval/runs/<run_id>/`：`cases.json` + `judges.json` + `meta.json`（现状）→ 增 `scoring-input.json` + `scores.json`（判分输入输出快照，审计/复现）。

---

## 5. 聚合口径

### 5.1 五指标 / 归因 / 决策四态 / 成本（第 1 期，✅ 已落）

```
excluded = env + data + exec + judge          # 无效样本（未过评审或非被测原因）
valid    = total - excluded
raw           = passed / total                        # 原始通过率
decontaminated= passed / valid (valid==0 → "—")        # 去污染通过率
env_blocked   = (env + data) / total                   # 环境阻断率（分母=总样本）
# 功能有效 = 核心判定完成率：core_fail = skill 失败中"非仅风格失败"；functional=(valid−core_fail)/valid
# style_only_fail = stage=='judge' 且判 false 的键 ⊆ {style}（第 2 期切指标层后升 v2 口径）
```

**决策四态判定链**：failed/cancelled → **valid=0 → `no_valid` 暂无法给出建议（按归因动态行动清单）** → gate fail → na(partial) → pass；`reasons` 首行固定"未产生有效评测数据——本结论不具备参考意义"。gate 三态读取兼容旧轮（`state` 缺失时按 text/pass 推导，镜像前端 `gateState()`）。

**归因分布**：`counts`（失败样本五类计数）+ `den`（=总样本）+ `reviewed/overridden/derived`；**成本**：durations（avg/p50/p90/p95/max，最近秩）+ tokens（input/output/cacheRead/cacheCreation/total）+ top10。

> **v0.1 口径细节（实测确认）**：
> ① 归因分布携带 `by_case`（逐用例最终归因 = 存值 ∪ 旧轮实时推导）——用例表"归因"列展示与筛选均消费它（含「· 推导」后缀），避免前端重复实现分类器；
> ② 人工改判为环境类后，**决策的 gate 部分仍按运行时原始快照**（不追溯重算），五指标 / 归因分布 / 决策 note（自动追加"已剔除 n 条非被测原因失败样本"）实时重算——gate 口径统一留待第 2 期指标层。

### 5.2 样本分 / 指标分（第 2 期，✅ 已落）

- 维度值：通过 1.0 / 中性 0.5 / 失败 0.0；**反向维度取 1−分值**；"未测"维度剔除（不按失败算）。
- 指标分 = Σ(权重×可用维度分) / Σ(可用权重)；无可用维度的指标不计入。
- 样本分 = 各可用指标算术平均；**样本分阈值**默认 0.50（任务级可覆盖留待后续）。
- 落点：`scoring.py::_sample_scores`（判分回写时按**运行快照**的维度 spec 聚合）；写回 `sample_score` / `indicator_scores`；`scoring_meta` 记 `sample_avg / sample_n`。
- **裁决口径（v2 决定）**：样本/用例 PASS 仍按 **"零失败维度"**（严格口径，安全优先）——与图灵"失败维度不抵消"语义对齐；样本分（≥阈值 0.50）作为**接近度度量**先展示与观察（实测 L3-01=0.75 / L3-03=0.33 可解释），"样本分通过率 gate 第 7 项"待口径复核（PRD §10②）后再定。
- gate 六项保持原口径（数据来源经 shim 对齐）。

### 5.3 决策四态增强（第 1.5 期，⏳）

- `scoring ∈ {pending, running}` → 新决策态 `scoring`："判分进行中 · 结论待定"（前端灰/琥珀 + 自动轮询）。
- `scoring = failed` → `partial` + reasons["判分执行失败：…"] + actions["重判（不重跑执行）"]。

---

## 6. 接口设计（全周期）

### 6.1 第 1 期（✅ 已落）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/runs/{run_id}` | 出参加 `report`（五指标/归因/成本/决策/meta，实时聚合） |
| PUT | `/runs/{run_id}/cases/{case_id}/attribution` | 人工改判/恢复自动（返回 `{case, report}`） |

`_case_out(full=True)` 出参增量：`attribution` / `attribution_source` / `attribution_note` / `tokens`。

### 6.2 第 1.5 期（⏳）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/runs/{run_id}/score` | 重判/补判：对存量结果重跑判分引擎（复用调度锁；`{only?: [dims]}` 可选） |
| GET | `/runs/{run_id}/progress` | 出参增 `phase`（executing/scoring）、`scoring_done/scoring_total` |
| GET | `/runs/{run_id}` | `report.meta` 增 scoring 状态块（引擎版本/模型/耗时/失败数） |

### 6.3 第 2 期（⏳）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/indicators` ｜ PUT/DELETE `/{id}` | 指标 CRUD |
| PUT | `/dimensions/{dim_id}` | 增字段：indicator_id / reverse / metric_key |
| PUT | `/judges/{judge_id}` | 增字段：metric_type / params |
| POST | `/judges/{judge_id}/try` | 升级为"单维度 deepeval 试跑"（响应结构兼容旧版） |
| GET | `/runs/{run_id}` | report 增 per-case `sample_score`/`indicator_scores` + 当轮指标/维度快照 |

### 6.4 第 3/4 期

按 PRD-012 US-18~20：`POST /cases/{case_id}/derive`、回归集标记、`ids:` 重跑（复用现有 scope）、`/release-check` 等。

---

## 7. 前端设计（全周期）

### 7.1 第 1 期（⏳ 待落）

> 线框全套见 PRD-012 US-09~14。装配：决策 hero（四态+行动清单+复制结论）→ ② 评测概览（五指标 + 归因分布）→ 闸门六项（保留）→ delta → 快照 KV；独立卡：③ 性能效率与成本（耗时五分位/Token 四类/高消耗 Top/复制数据）；用例表 + 归因列 + 证据链内改判编辑块（AttributionEditor）。

| 文件 | 动作 | 内容 |
|---|---|---|
| `web/src/lib/agentEval.ts` | 改 | 类型 `EvalReport/EvalMetrics/EvalAttribution/EvalCost/EvalDecision`；`EvalCaseResult` 加 attribution/tokens；`EvalRunDetail` 加 `report`；API `updateAttribution()`；常量 `ATTRIBUTION_LABEL/HINT/ORDER` |
| `web/src/components/eval/ReportPanel.tsx` | 新 | `OverviewMetrics`（五指标卡）、`AttributionChart`（横向分布条）、`CostPanel`（耗时/Token/Top/复制） |
| `web/src/components/eval/AttributionEditor.tsx` | 新 | 归因编辑块（当前值/来源徽标/依据/选择/备注/保存/恢复自动） |
| `web/src/pages/AgentEval.tsx` | 改 | `VerdictBanner → VerdictHero`（消费 `report.decision` + 旧轮回退）；装配 ②③ 区块；归因列；改判后整体替换 report state |
| `web/src/components/eval/CaseEvidence.tsx` | 改 | 顶部插入 `<AttributionEditor>`（props：`runId/onSaved`，可选） |
| `web/src/styles.css` | 改 | 追加段：`.metric-grid/.attr-bars/.cost-grid/.attr-chip/.attr-editor/.vacts` 等（仅追加） |

关键交互：改判回调链（PUT → 替换 case + `report = resp.report` → hero/概览/分布即时刷新）；归因列 chip（失败样本；`已复核` 徽标；点击展开证据链）；复制数据（Markdown 桥接 + clipboard 兜底）；`no_valid` 态严格不出现 ✓/绿；分布条颜色语义（env=琥珀 / data=灰 / exec=蓝 / judge=柔紫 / skill=红）。

### 7.2 第 1.5 期（⏳）

- 进度卡增阶段显示："执行中 X/M" → "判分中 Y/N"（`progress.phase`）。
- 报告：`scoring` 态提示（spin + 自动刷新）；`failed` 态 → `[重判]` 按钮（POST /score）；meta 显示引擎版本/模型（`deepeval 4.2.2 · deepseek-v4-pro`）。

### 7.3 第 2 期（✅ C1~C11）

- ~~「指标与维度」独立编辑器~~ → **C6 裁判中心化合并**：「测评裁判」单页两视图——裁判列表页（业务场景/判分维度/模型/状态 + 试跑/编辑）→ 编辑进「维度与指标设置」（基本信息 / 维度与指标（判定要点/权重/反向/指标/排序）/ 判分提示词与变量·高级折叠）。
- **C7 单一裁判**：默认仅一个裁判（jdg-main「敏宝助手评审」），包含全部维度指标；列表页即单行（4 维度 chips）。
- **C8 信息架构**（侧栏）：测评用例 / **测评任务** / 测评裁判；测评报告为任务二级入口；报告页纯查看，发起+执行=任务页「运行控制台」；任务创建需显式选 Case 范围。
- **C9 任务页主从联动**：测评记录并入任务页——左列任务卡（点选即筛 + 全部/手工视角）↔ 右列该任务的运行记录（表头带视角、单任务隐藏任务列）。
- **C10 关联修正**：裁判的关联对象呈现为**测评任务**（任务开判分即引用裁判；列表「关联任务」列 + 详情任务 chips + 任务编辑器显式裁判名），不再以「被用例引用」表述。
- **C11 任务×裁判下拉**：任务编辑器「关联裁判（判分）」为**下拉选择**（`eval_task.judge_id` 唯一事实源；「不启用判分」或选择某裁判）；裁判关联判定按 judge_id 精确匹配。
- 指标管理（聚合层）+ 判分说明公式卡（US-16）→ 裁判列表页「指标与聚合口径」弹窗；运行级维度（闸门）→「运行级维度」弹窗。
- 变量面板（US-17）：系统变量（只读）+ 自定义变量 + prompt 引用校验（并入裁判详情「提示词与变量」高级区）。
- 用例表增"样本分"列（hover 指标分解）；证据链维度拆解块（每维度 verdict/score/reason）。

---

## 8. 实施顺序与验收（合并版）

### 第 1 期收尾（立即执行）

| # | 动作 | 验收 |
|---|---|---|
| 1 | harness Token 透出三件套（runtime.js / agent-runner.mjs / eval-agent.mjs） | 运行后 `tokens_json` 非空；旧轮 "—" |
| 2 | judge 逐裁判 try/catch（eval-agent.mjs：错误→`{error}`） | 注入失败裁判 → 归因落 `judge` 类 |
| 3 | 前端三区 + 归因列 + 改判 + 复制数据 | `vite build` 通过；截图核对 |
| 4 | 端到端验收（真实运行一条小样本） | 决策四态/五指标/归因/改判重算/Token/旧轮兼容 全过 |

### 第 1.5 期（判分引擎）

| # | 动作 | 验收 |
|---|---|---|
| B1 | 环境重建（evals/.venv + requirements.txt + README 更新） | ✅ 已完成：`test_agent_eval.py` 复跑通过（5 case / 8 指标 / 70.5s） |
| B2 | `score_run.py` + `TernaryJudgeMetric` + 四维度重实现 + 对照工具 | ✅ 已落：184524/194120 实测产 scores.json（verdict/score/reason/附加字段齐全；单点失败不中断）；`tools/compare_scores.py` 双跑对照 |
| B3 | 双跑对照（20~30 存量样本；先 6 条基线运行） | ✅ 首批通过：基线运行 `20261011-154449`，**12/12 方向一致（100%）**，超过 ≥90% 准入线（报告 `docs/reviews/agent-eval-dualrun-20261011-154449.md`）；扩大样本可在后续轮次积累后复核 |
| B4 | 平台接线（`scoring.py` / 两阶段 worker / `POST /score` / 前端判分态） | ✅ 已完成：平台 run 恒 `--no-judge` → 执行后自动引擎判分（同一 worker 两阶段）；`POST /runs/{id}/score` 重判（对旧轮实测：Node 格式 → 引擎 verdict/score）；`eval_run.scoring` 三列 + 进度 `phase/scoring_*`；前端重判按钮 + 进度分相 + 判分引擎 KV。端到端实测：`20261011-160252`（gate completeness na→pass 可见） |
| B5 | 切换默认（平台 run 自动判分）；Node judge 标 deprecated | ✅ 已随 B4 落地：平台链路默认 deepeval；`judge.mjs` 头部已标注平台弃用（保留 CLI/应急） |

> **B3 首侦（184524 · L3-01，存量样本）**：faithfulness 上引擎判 `fail`（准确指出"凭空编造旺仔/月龄/过敏史"），
> 而该轮 Node judge 判 `pass`——但同一用例在更早一轮（181731）Node judge 判的正是 `fail`，即**该分歧暴露的是 Node judge 自身的不稳定**，引擎方向与严格口径一致；guardrail 分歧为验收演示痕迹（prompt 已还原）；style 一致。→ 以新基线运行的完整对照为准。

### 第 2 期（Rubric）

| # | 动作 | 验收 |
|---|---|---|
| C1 | 数据迁移（indicator/dimension/judge/case_result 四组列）+ 种子映射 | ✅ 已落：3 指标（outcome/safety/quality）+ 4 维度挂载 + 4 裁判 `metric_type=ternary`/criteria 填充（幂等迁移实测；存量库补挂不覆盖手改） |
| C2 | 编译器 + 样本分聚合 | ✅ 已落：`_compile_dimensions`（配置→判分 spec，缺省回退内置）+ `_sample_scores`（按运行快照聚合，L0-05/L1-07 实测）；裁决口径见 §5.2；gate 增强（第 7 项）待口径复核 |
| C3 | 前端编辑器/变量面板/样本分列 | ✅ 已落：「指标与维度」两级编辑器（左指标卡 + 右维度列表/上移下移/判分来源/判定要点即 criteria 写回；未分组兜底 + 修复挂载）+ 判分说明公式卡（含示例演算）+ 用例表样本分列（hover 指标拆解、临界标黄）+ 裁判变量面板（US-17：系统/输出/自定义变量 chips 插入、`{{}}` 引用扫描未定义标黄可保存、`params.variables` 持久化）+ JudgeCard 三态/分值/错误展示；`vite build` 通过 + 浏览器实测四界面 |
| C4 | 试跑切换 deepeval 单维度 | ✅ 已落：`scoring.run_rejudge_engine`（单用例×单维度 spec → 引擎子进程；criteria 同优先级链路）；`runner.rejudge` 弃 Node rejudge.mjs、去掉四键硬编码（支持任意已挂裁判维度）；实测 jdg-guardrail×L3-01（6.1s，verdict/score/schema 齐全）与 jdg-completeness×L2-02（covered 2/2）；返回体新增 `engine/elapsed_ms`，前端试跑弹窗展示 |
| C5 | 一致性对照（物化 vs 编译执行，同数据同结果） | ✅ 已过：194120 新旧导出对照——**用例 100% 一致**、维度 spec 为严格超集（同 key/name/metric_type + 配置字段；criteria 与引擎默认同源）；重判 verdict 复现一致 |
| C6 | **裁判中心化 + 页面合并**（用户评审改版）：实体主次翻转——裁判 = 业务场景（顶层实体），维度是裁判内部配置（`dimension.judge_id` + `criteria` 下沉维度级），指标为跨裁判聚合层 | ✅ 已落：后端（judge.description / dim.judge_id+criteria 补列 + `bind_judges` 幂等回填 + engine criteria 优先级 + rejudge 按维度选择）；前端「测评裁判」合并页（**裁判列表 → 编辑进维度与指标设置**，含基本信息/维度与指标/提示词与变量·高级；指标与聚合口径、运行级维度（闸门）收为列表页弹窗；`agentevaldims` 旧 URL 兼容映射）；旧「指标与维度」页删除。实测：迁移回填 4/4、按维度试跑（4.4s）、无改动保存保持 criteria、浏览器走查 6 界面 |
| C7 | **单一裁判收敛**（用户评审）：仅保留一个裁判（`jdg-main`「敏宝助手评审」），全部 case 级维度（faithfulness/completeness/guardrail/style）归入其名下；按维度划分的 4 个遗留裁判合并删除 | ✅ 已落：`seed.merge_legacy_judges` 幂等合并——**白名单仅识别 4 个遗留裁判 id（绝不误删用户新建裁判）**；criteria 先回填再改挂；兼容字段 `dim_id` 回填首维；fresh-DB 种子直接产出「单裁判 + 全部维度（含 criteria）」。实测：judges 4→1、4 维度归属/指标/criteria 完整、默认与指定维度试跑均通过、引擎编译 4/4、浏览器单一裁判界面走查 |
| C8 | **测评域信息架构调整**（用户评审）：① 侧栏去掉一级「Agent 测评」入口（与顶部域页签重复），「测评报告」（原 Agent 测评页）与「测评记录」（原历史运行）降为「测评任务」的**二级入口**；② **发起/执行与报告拆开**——报告页（`agenteval`）纯查看，发起 + 进度 + 中止合并到「测评任务」页（页顶**运行控制台**，刷新可恢复）；③ **任务创建必须显式选择测评 Case 范围**（全部用例 / 按条件筛选，无默认） | ✅ 已落：nav（评测域 defaultPage → `agentevaltasks`）/ AgentEval 瘦身（删发起表单，运行中只读提示+自动轮询出报告）/ AgentEvalTasks 升级（控制台：阶段进度+实时结果+中止+查看报告；范围必选校验）/ 历史页更名测评记录。实测：任务页发起快检（L0）→ 控制台实时进度（当前执行/0-2 计数/运行中…按钮禁用）→ 完成收尾态 → 查看报告跳转报告页全链路通过；范围未选保存被拦截（toast）；tsc + build ✓ |
| C9 | **测评记录并入测评任务 + 主从联动**（用户评审：不能只是罗列两个列表，要呈现「任务 ↔ 记录」关联）：记录页删除并入任务页——**左列任务列表**（含「全部记录 / 手工发起」视角伪条目；卡内联配置摘要与发起/编辑/删除）**点选即筛右列记录**；右列表头标明当前视角（任务名＋轮数）、单任务视角自动隐藏「任务」列并可「查看全部 →」回退；默认 20 条 + 展开；旧深链接 `?page=agentevalhistory` 翻译回任务页 | ✅ 已落：`task-layout` 主从栅格（286px + 1fr）+ `task-item` 可选中卡（复用 ind-item 样式族）；删除 `AgentEvalHistory.tsx`；alias 翻译（`EVAL_HISTORY_ALIAS`）。实测：全部视角 19 轮（含手工 16）／选中「快检」→ 3 轮 + 任务列隐藏 + 高亮卡／「手工发起」16 轮／「查看全部 →」回退；tsc + build ✓ |
| C10 | **裁判关联对象修正为「测评任务」**（用户评审：「裁判是在测评任务中关联的，而不是和测试用例关联的」） | ✅ 已落：裁判详情「关联用例影响（被 N 条用例引用）」→「**关联测评任务**」（`assocTasksOf`：判分开启且维度范围与裁判有交集的任务；chip 显示任务名+全部/指定维度范围+停用标记；空态引导去任务页开判分）；裁判列表新增「**关联任务**」列；任务编辑器判分开关显示裁判名（「启用「敏宝助手评审」判分」）＋关联说明——任务 × 裁判关联在配置侧显式化。实测：列表 1 个（快检判分关不计入）、详情 chip「R1 回归 · 全部维度」、编辑器裁判名可见；tsc + build ✓ |
| C11 | **任务 × 裁判 = 下拉选择**（用户评审：「测评任务中，测评裁判是下拉选项」）：`eval_task` 增 `judge_id`（唯一事实源，NULL = 不启用判分），`judge` 布尔退化为派生值 | ✅ 已落：DDL+迁移（`bind_task_judges` 幂等回填：judge=1 的存量任务 → 默认裁判）；catalog `upsert_task` judge_id 事实源 + 旧包兼容（仅传 judge 布尔时降级处理）、`_task_out` 透出 judge_id；runner `start/estimate` 判分口径按 `judge_id or judge`；任务编辑器「关联裁判（判分）」**下拉**（「不启用判分」+ 裁判列表 + 所选裁判场景说明），新建默认首个启用裁判；任务卡显示「判分 敏宝助手评审 / 不启用」；裁判页 `assocTasksOf` 改按 judge_id 精确匹配（旧数据回退布尔）。实测：迁移回填 1、写回往返（不启用→null / 回切→jdg-main）、卡片与关联列展示、tsc+build ✓（多裁判时「按任务所选裁判限定判分维度」列入后续） |

### 第 3 期（飞轮）✅ US-18 / US-19（2026-10-11 晚落地）

| # | 动作 | 验收 |
|---|---|---|
| F1 | 用例派生 `POST /cases/{id}/derive` | ✅ `derive_case`：新 ID = **家族根** + b/c/d… 首个空闲后缀（L3-01→b、b 再派生→c）；`source_json` 记录 `{type:'derive', from_case, from_run}`；upsert「缺省保留来源」。实测：派生链根正确、UI 派生自动携带当前查看轮为 from_run |
| F2 | 加入回归集 | ✅ 打 `regression` 标签（getCase + PUT tags，幂等提示）；任务编辑器筛选区「回归集（regression）」**快捷勾选**；标签中文映射（回归集） |
| F3 | 来源可视化 | ✅ 用例列表「派生」徽标（title 含来源）＋编辑器来源行（种子用例 / 派生自 L0-03（来自运行 …）） |
| F4 | 失败重跑 | ✅ `POST /runs {retry_of}`：范围=源轮失败集（无失败→400）、judge/轮次默认复用源轮、任务归属沿用、`env_snapshot.retry_of`；报告页失败清单尾部「重跑失败 N 条」+ 确认弹窗 →跳任务页控制台；记录表「重跑」徽标 + 报告头部「重跑自 xxx」链接。实测：180710（失败 1 条）→ 重跑轮 181512 全链路（口径复用、结果落账） |
| F5 | 任务历轮趋势 | ✅ 选中任务时记录卡顶部通过率 sparkline（最近 ≤10 轮，hover 单轮值，含「较首轮 ±pp」）；PRD US-19-3 行内逐轮锚点以趋势卡呈现（逐行版列入可选，暂不做） |

### 用户信息全局化收口（2026-10-11 18:26 用户评审）

「用户信息（userId / familyId / babyId）由平台全局配置统一提供」从**运行期约定**收紧为**全链路保障**：

| 层 | 动作 | 验收 |
|---|---|---|
| 写入 | `catalog.upsert_case` **服务端强制剥离**（覆盖编辑器 / JSON 模式 / 导入 / CLI 全部入口）＋ `load_harness_cases` 导入剥离 ＋ `strip_case_user_ctx` 幂等清洗存量 | ✅ API 塞回三键被丢弃（仅业务键保留）；存量 46/46 清毕 |
| 创建任务 | 任务编辑器新增「**运行身份（全局）**」只读行（`user xxx… · family xxx… · baby xxx…`＋来源说明与「全局配置」指引） | ✅ 创建任务时集中可见 |
| 报告 | 运行信息区新增「**运行身份（全局）**」行（每轮展示一次，值来自当轮快照 `eval_ctx`） | ✅ 旧轮无快照值 → 「未配置（用例自带值生效）」 |
| 用例层 | 用例编辑器**移除**身份展示块；证据链「上下文」**过滤三键**（快照仍含注入值，仅展示层剔除） | ✅ 编辑器无用户信息块；旧轮证据链 DOM 无 familyId |

### 第 4 期（门禁）

⏳ 未启动：按 PRD-012 US-20 执行（发布闸门任务 `is_gate` + `purpose=release_check` + 发布检查结论卡）；复用既有决策四态与台账，无引擎新增改动。

---

## 9. 影响面清单（合并）

| 层 | 文件 | 改动 |
|---|---|---|
| 平台后端 | `platform_db.py` | 第 1/1.5/2 期列 ✅（归因/tokens/scoring/indicator/维度新列） |
| 平台后端 | `agent_eval/attribution.py`（新）✅ | 归因分类器（五类 + 关键词表） |
| 平台后端 | `agent_eval/ledger.py` | compute_report ✅ / update_attribution ✅ / 样本分回写（update_case_score + scoring._sample_scores）✅ |
| 平台后端 | `agent_eval/runner.py` | 归因+tokens ✅；两阶段 worker（执行→判分）✅；rejudge 引擎化（C4）✅ |
| 平台后端 | `agent_eval/scoring.py`（新） | 输入导出 / 子进程调度 / 回写 / shim / 单维度重判 ✅ |
| 平台后端 | `agent_eval/catalog.py` + `web/router_agent_eval.py` | 指标 CRUD / 维度扩展字段 / `POST /score` / 归因改判 / 试跑（引擎版）✅ |
| harness | `eval-agent.mjs`、`lib/agent-runner.mjs` | Token 透出 + judge try/catch ✅；平台链路弃 judge（`--no-judge`）✅ |
| harness | `src/lib/runtime.js` | usage 明细透出 ✅ |
| evals | `score_run.py`、`metrics/ternary.py`、`metrics/criteria.py`、`judges/deepseek_judge.py`、`tools/compare_scores.py`、`requirements.txt`、`README.md` | 第 1.5 期全落 ✅ |
| 前端 | `AgentEval.tsx`、`AgentEvalDims.tsx`（两级编辑器）、`AgentEvalJudges.tsx`（变量面板）、`components/eval/*`、`lib/agentEval.ts`、`styles.css`、`nav.ts` | 第 1/1.5/2 期全落 ✅（C3：样本分列/公式卡/变量面板/试跑文案） |
| 文档 | `docs/PRD_REGISTRY.md`（已）、TECH-026/027（本文）、`scripts/eval/README.md`、`evals/README.md` | 持续 |

## 10. 风险与对策

| # | 风险 | 对策 |
|---|---|---|
| R1 | deepeval 版本升级行为漂移 | pin 版本 + `scoring_meta` 记录引擎版本 + 升级前跑对照集 |
| R2 | 判分时长/成本上升（ternary/GEval 多步调用 vs 单次 judge） | 并发开关；模型分档（低价值维度 flash）；只判入过评审的样本 |
| R3 | 自定义 metric 线程安全不确定 | 默认串行；`--concurrency` 实测通过后再开 |
| R4 | 迁移期双引擎口径漂移 | 双跑对照为切换硬验收；`scoring_meta` 标注引擎来源 |
| R5 | 环境再丢（托管 venv 覆辙） | 项目自有 venv + requirements.txt + README 重建命令（三保险） |
| R6 | judge 回写 shim 与 gate 读取字段漂移 | 回写器单测：四维度 shim 字段断言（guardrail.pass / faithfulness.hardHallucination / completeness.covered\|total） |
| R7 | 归因关键词宽口径误伤（如"超时"） | `?` 不确定提示 + 人工改判 + `overridden` 统计供调规则 |
| R8 | 报告信息密度影响"3 秒判断" | 首屏决策保持唯一主位；三区渐进披露（TECH-022 方法论） |

## 11. 参考

- `docs/prd/PRD-012.md`（需求与验收口径；US-09~20）
- `docs/tech/TECH-027-agent-eval-framework-reuse-assessment.md`（deepeval 复用边界与选型依据）
- `docs/tech/TECH-021-agent-eval-console-v2.md`、`TECH-022-agent-eval-acceptance-review.md`（平台基线）
- `minicare-agent/evals/README.md`（deepeval 指标层既有设计：D1-D6 / 踩坑 / 运行命令）
- `docs/tech/TECH-010-deepeval-webui-research.md`（本地 UI 结论）
- 图灵评测理论（KM 内网资料，本地存档 `.workbuddy/reference/`）
