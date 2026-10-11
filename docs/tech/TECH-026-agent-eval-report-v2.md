# TECH-026 — Agent 测评 2.0 技术方案（决策化报告 × deepeval 判分引擎）

> 日期：2026-10-11 ｜ **v2 合稿**：在 v1「第 1 期（报告层）」基础上，合入 TECH-027 复用评估定案——**判分引擎采用 deepeval（配置编译执行）**，并补全第 1.5 / 2 / 3 / 4 期设计，成为全周期实施蓝本。v1 已实现部分标「✅ 已落」、待实现标「⏳」。
> 关联：`docs/prd/PRD-012.md`（需求）｜`docs/tech/TECH-027-agent-eval-framework-reuse-assessment.md`（框架选型依据）｜`TECH-021/TECH-022`（平台基线）｜`minicare-agent/evals/README.md`（deepeval 层既有设计）
> 目标读者：实施者（含 AI coding）——"照着本文可以直接开工"。

---

## 0. 结论摘要

**一句话**：**执行 / 判分 / 聚合 三层解耦**——Node harness 只做"执行 + 确定性断言"（平台链路一律 `--no-judge`）；Python **deepeval 判分引擎**做"主观判分"（配置编译执行，LLM 调用/重试/解析复用框架基建）；平台做"聚合与管理"（五指标 / 归因 / 样本分 / 决策四态 / 台账 / 报告）。

**全周期路线**：

| 阶段 | 内容 | 状态 |
|---|---|---|
| **第 1 期** 决策化报告（PRD US-09~14） | 采集补强 + 归因体系 + 报告三区（决策/五指标/成本） | 后端已落 ✅；harness Token 透出 + 前端 ⏳ |
| **第 1.5 期** 判分引擎 deepeval 化（原 TECH-010 P1b，TECH-027 定案） | 环境重建 + 引擎脚本 + 双跑对照 + 平台接线 | 设计定稿（§3、§6） |
| **第 2 期** Rubric 两级（PRD US-15~17） | 指标/维度配置 + 编译执行 + 样本分聚合 + 变量系统 | 设计定稿（§3.3、§5.2、§7.3） |
| **第 3 期** 飞轮（PRD US-18~19） | 用例沉淀 / 失败重跑 / 历轮趋势 | 按 PRD 设计（不涉引擎细节） |
| **第 4 期** 门禁（PRD US-20） | 发布闸门任务 + 发布检查卡 | 按 PRD 设计 |

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

输入 scoring-input.json（平台由台账导出；快照进 run 目录）:
{
  "run_id": "20261011-140312",
  "judge_model": {"name": "deepseek-v4-pro", "temperature": 0},
  "dimensions": [ {"key": "guardrail", "name": "高危护栏", "metric_type": "ternary",
                   "criteria": "…", "schema": {"seekCare": "bool", "dangerousAdvice": "bool"},
                   "threshold": 0.5, "reverse": false} ],
  "cases": [ {"case_id": "L3-01", "input": "…", "actual_output": "…",
              "retrieval_context": ["…"], "tools_called": [{"name": "…", "input": {}}],
              "expected": {"…": "…"}, "history": []} ]
}

输出 scores.json:
{
  "results": { "L3-01": { "guardrail": {"pass": true, "verdict": "pass", "score": 1.0,
                                        "reason": "…", "seekCare": true, "dangerousAdvice": false} } },
  "meta": { "deepeval": "4.2.2", "model": "deepseek-v4-pro", "elapsed_ms": 12345,
            "failed": 0, "errors": {"L1-07": {"completeness": "timeout…"}} }
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
ALTER TABLE eval_judge ADD COLUMN metric_type TEXT NOT NULL DEFAULT 'ternary';  -- ternary/geval/builtin:xxx
ALTER TABLE eval_judge ADD COLUMN params_json TEXT;           -- 变量引用列表

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

### 5.2 样本分 / 指标分（第 2 期，⏳）

- 维度值：通过 1.0 / 中性 0.5 / 失败 0.0；**反向维度取 1−分值**；"未测"维度剔除（不按失败算）。
- 指标分 = Σ(权重×可用维度分) / Σ(可用权重)；无可用维度的指标不计入。
- 样本分 = 各可用指标算术平均；样本分 ≥ **样本分阈值**（默认 0.50，任务级可覆盖，压线算通过）→ 样本 PASS。
- 落点：`ledger.compute_sample_scores()`；写回 `sample_score` / `indicator_scores`；run 级新增"样本分通过率"检查项（第 7 项，可配阈值）。
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

### 7.3 第 2 期（⏳）

- 「指标与维度」编辑器（US-15 线框）：指标卡列表 + 维度卡片（权重/反向/判分类型）+ 判分说明公式卡（US-16）。
- 变量面板（US-17）：系统变量（只读）+ 自定义变量 + prompt 引用校验。
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
| B1 | 环境重建（evals/.venv + requirements.txt + README 更新） | `test_agent_eval.py` 复跑通过（5 case / 8 指标） |
| B2 | `score_run.py` + `TernaryJudgeMetric` + 四维度重实现 | 对存量 run 产 scores.json；单点失败不中断 |
| B3 | 双跑对照（20~30 存量样本） | 方向一致率 ≥ 90%；差异 case 复核记录 |
| B4 | 平台接线（`scoring.py` / 两阶段 worker / `POST /score` / 前端判分态） | 端到端：发起 → 执行 → 判分 → 报告 |
| B5 | 切换默认（平台 run 自动判分）；Node judge 标 deprecated | 新一轮全链路过；CLI 老路径行为不变 |

### 第 2 期（Rubric）

| # | 动作 | 验收 |
|---|---|---|
| C1 | 数据迁移（indicator/dimension/judge/case_result 四组列）+ 种子映射 | 旧数据零破坏；默认 3 指标可见 |
| C2 | 编译器 + 样本分聚合 + gate 增强（样本分通过率） | PRD US-16 场景 1 演算（0.83 / 0.0 → 0.42 FAIL）复算通过 |
| C3 | 前端编辑器/变量面板/样本分列 | 线框一致；保存校验生效 |
| C4 | 试跑切换 deepeval 单维度 | 与旧试跑响应兼容 |
| C5 | 一致性对照（物化 vs 编译执行，同数据同结果） | 判分方向一致 |

### 第 3 期（飞轮）/ 第 4 期（门禁）

按 PRD-012 US-18~20 原有验收执行；复用 §6.4 接口，无引擎新增改动。

---

## 9. 影响面清单（合并）

| 层 | 文件 | 改动 |
|---|---|---|
| 平台后端 | `platform_db.py` | 第 1 期 4 列 ✅；第 1.5/2 期列（§4.2/4.3）⏳ |
| 平台后端 | `agent_eval/attribution.py`（新）✅ | 归因分类器（五类 + 关键词表） |
| 平台后端 | `agent_eval/ledger.py` | compute_report ✅ / update_attribution ✅ / 第 2 期 compute_sample_scores ⏳ |
| 平台后端 | `agent_eval/runner.py` | 归因+tokens（norm/insert）✅；第 1.5 期两阶段 worker ⏳ |
| 平台后端 | `agent_eval/scoring.py`（新·第 1.5 期） | 输入导出 / 子进程调度 / 回写 / shim |
| 平台后端 | `agent_eval/catalog.py` + `web/router_agent_eval.py` | 第 1 期端点 ✅；第 1.5/2 期端点（§6）⏳ |
| harness | `eval-agent.mjs`、`lib/agent-runner.mjs` | Token 透出 + judge try/catch ⏳；平台链路弃 judge（第 1.5 期） |
| harness | `src/lib/runtime.js` | usage 明细透出 ⏳ |
| evals | `score_run.py`（新）、`metrics/ternary.py`（新）、`judges/deepseek_judge.py`（沿用）、`requirements.txt`（新）、`README.md`（更新） | 第 1.5 期 |
| 前端 | `AgentEval.tsx`、`components/eval/*`、`lib/agentEval.ts`、`styles.css` | 第 1/1.5/2 期（§7） |
| 文档 | `docs/PRD_REGISTRY.md`（已）、TECH-026/027（本文）、`scripts/eval/README.md` | 持续 |

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
