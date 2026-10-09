# TECH-021 — Agent 测评台 2.0 设计（用例 / 任务 / 裁判 / 维度 四管理面）

> 日期：2026-10-09 ｜ 状态：**一期已实施并验收通过（2026-10-09）**——四管理面 + 配置物化执行全部落地，验收结果见 §8.1a
> 上游：`TECH-020`（行业调研：四对象模型 + 六平台对标）、`PRD-010`（测评台首期，已落地运行链路）
> 目标读者：实施者（含 AI coding）——"照着本文可以直接开工"。

---

## 0. 结论摘要

**一句话方案**：把测评台从"运行工具"升级为"测评体系平台"——**用例 / 任务 / 裁判 / 维度**四类对象在
`platform.db` 中一等存储、在界面上一等管理；运行时由平台把配置**物化**为 harness 可读的文件注入子进程执行，
**评测语义零重写**（延续 PRD-010 D3）。

**核心设计决策（摘要）**：

| # | 决策 | 理由 |
|---|---|---|
| S-01 | **维度与裁判拆分建模**（两张表），一对一首期 | 我们的裁判（4 判分器+断言）与维度（L0-L6/gate）已天然分离；拆分后各自演进（换裁判不改维度） |
| S-02 | 维度分**两级**：`case` 级（逐用例判分）与 `run` 级（从结果聚合） | faithfulness 等是逐用例判的；工具收敛率/done 到达率是整轮聚合的——混在一个口径里会算错 |
| S-03 | **DB 为运行时唯一源**，JSON 退化为导入/导出格式 | 平台可管理才有意义；导出物可人工入 git 留档（兼顾"版本化"） |
| S-04 | **配置物化执行**：平台生成 `cases.json` + `judges.json` + `meta.json` 注入 harness | harness 不动评测逻辑，只把 judge 从"硬编码"改为"读模板"（默认模板=现原文，行为零漂移） |
| S-05 | 任务（Task）= 命名配置（用例选择 × 维度子集 × judge 开关 × 轮次）；运行挂 `task_id` | 对齐行业 Experiment 概念；同一任务的历轮天然可对比 |
| S-06 | 默认值只用**一致性对照**验证迁移：物化配置 vs 现有 JSON，跑同用例结果必须一致 | 防止"配置化"引入静默语义漂移 |
| S-07 | 一票否决（`must_pass`）挂在维度上（安全类默认开） | 对齐行业"安全维度硬门槛"；阈值集中可查可改 |

**非目标（本期）**：在线评测（生产 trace 打分）、CI 门禁自动触发、多 judge 聚合（1:N）、人工标注队列、
用例合成生成、红队——排二期/三期（见 §9）。

---

## 1. 背景与差距

### 1.1 首期已落地（可复用资产）

- **运行链路**：`/api/agent-eval/*` 7 端点（触发/进度/中止/列表/详情/overview/health）；
  `agent_eval/runner.py`（子进程调度 + `@@EVAL@@` 进度解析 + 入库）、`ledger.py`（台账 + gate 汇总 + delta）；
- **台账**：`eval_run` / `eval_case_result` 两表；前端「Agent 测评」总览页 + 「历史运行」页；
- **harness**：`eval-agent.mjs`（`--emit-progress` / `--json` / `--all/--group/--id/--no-judge/--runs`）。

### 1.2 差距（TECH-020 §4 结论）

| 对象 | 现状 | 缺什么 |
|---|---|---|
| 用例 | 46 条 JSON 埋在 `agent-poc/scripts/eval/cases/`（git） | 页面不可见/不可编辑；无标签/启停；无法从运行沉淀 |
| 任务 | "运行"每次临时发起 | 无命名任务模板；运行与任务无关联；无"同任务历轮"视角 |
| 裁判 | 4 个判分器硬编码 `lib/judge.mjs`；模型写死 v4-pro | prompt/模型/温度不可配；无法开关；无校准（L3-01 假阳性为实例） |
| 维度 | gate 六项目标值硬编码 `ledger.compute_gate` | 阈值不可配；不可选子集；无维度级统计 |

### 1.3 目标

1. 四类对象可管理（CRUD + 启停 + 导入导出）；
2. 发起运行可挂"任务"，同任务历轮可回看与对比（对比视图二期做，一期先把 task_id 落进台账）；
3. 裁判可配（prompt/模型/温度/开关），维度可配（阈值/权重/一票否决/子集）；
4. **不改 harness 的评测语义**——执行结果与配置化之前可比。

---

## 2. 概念模型（五对象）

```
维度 Dimension    —— 要测什么（case 级：由裁判逐例判；run 级：由结果聚合）+ 阈值/权重/must_pass
裁判 Judge        —— 怎么判（llm：prompt 模板+模型+温度 / code：内置断言器引用）——绑定到维度（1:1）
用例 Case         —— 测什么（message + ctx + expect 断言 + judge 要点）；可打标签、启停
任务 Task         —— 命名配置：用例选择 × 维度子集 × judge 开关 × 轮次
运行 Run          —— 任务的一次执行（既有）；挂 task_id 后 = "某任务的第 N 轮"
```

**关系与流向**：`维度 ←裁判（1:1）`；`任务 = 用例选择 × 维度子集 × 裁判配置 × 被测环境`；
`运行 = 任务 × 执行`。运行开始前，平台把"当轮实际使用的 用例/裁判/维度阈值"**快照**进
`eval_run.env_snapshot`（可复现：日后改了配置，历史运行的解读不受影响）。

**维度两级口径（S-02 展开）**：

| 级别 | 哪来的数 | 例子 | 配置字段 |
|---|---|---|---|
| `case` | 每个用例由绑定的裁判判分 | faithfulness / guardrail / completeness / style | threshold（数值型时）、must_pass |
| `run` | 从全部用例结果聚合 | 确定性断言通过率 / 工具收敛率 / done 到达率 / 硬幻觉率 / 高危护栏命中率 | threshold、must_pass（如护栏必须 100%） |

> 注：`硬幻觉率`实为 case 级判分的聚合口径（faithfulness.hardHallucination 的占比）——归为 run 级、从 case 结果派生。

---

## 3. 数据设计（platform.db 新增四表 + 一列）

> 全部进 `platform_db.SCHEMA`（`CREATE TABLE IF NOT EXISTS`）；`eval_run.task_id` 需同时
> 在 `_migrate` 里对旧库做 `ALTER TABLE ... ADD COLUMN`（SQLite 支持加列）。

### 3.1 `eval_dimension`（维度）

```sql
CREATE TABLE IF NOT EXISTS eval_dimension (
  dim_id       TEXT PRIMARY KEY,            -- 如 dim-faithfulness（稳定 id，代码可引用）
  name         TEXT NOT NULL,               -- 展示名：忠实度
  level        TEXT NOT NULL,               -- case / run
  grp          TEXT,                        -- 归属组：l0..l4 / gate / custom
  description  TEXT,
  score_type   TEXT NOT NULL DEFAULT 'boolean',  -- boolean / numeric / categorical
  threshold    REAL,                        -- numeric 通过阈值（如 0.95）
  weight       REAL NOT NULL DEFAULT 1,     -- 综合分加权（本期仅记录，二期启用聚合）
  must_pass    INTEGER NOT NULL DEFAULT 0,  -- 一票否决
  enabled      INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
```

### 3.2 `eval_judge`（裁判）

```sql
CREATE TABLE IF NOT EXISTS eval_judge (
  judge_id     TEXT PRIMARY KEY,            -- 如 jdg-faithfulness
  dim_id       TEXT NOT NULL,               -- 绑定维度（首期 1:1；二期可放宽 1:N）
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,               -- llm / code
  model        TEXT,                        -- llm 裁判模型（默认 deepseek-v4-pro）
  temperature  REAL NOT NULL DEFAULT 0,
  prompt       TEXT,                        -- 评分器 Prompt 模板；占位符 {{message}}/{{answer}}/{{tool_outputs}}/{{golden_points}}
  code_ref     TEXT,                        -- code 型：内置断言器引用（首期仅记录，执行仍在 harness）
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
```

### 3.3 `eval_case`（用例）

```sql
CREATE TABLE IF NOT EXISTS eval_case (
  case_id      TEXT PRIMARY KEY,            -- 沿用现有 id（L1-01 / R1-03）
  grp          TEXT NOT NULL,               -- l0..l4 / r1
  priority     TEXT,                        -- P0/P1/P2
  desc         TEXT,
  message      TEXT NOT NULL,
  ctx_json     TEXT,                        -- ctx（babyId/familyId/userId…）
  history_json TEXT,                        -- 多轮历史（L4 用例用）
  expect_json  TEXT NOT NULL,               -- 确定性断言（harness 语义原样保留）
  judge_json   TEXT,                        -- judge 配置（faithfulness/completeness/guardrail/style，原样保留）
  tags         TEXT,                        -- 逗号分隔：capability / regression / safety …
  enabled      INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
```

> **与 harness JSON 的字段对应**：`message/ctx/history/expect/judge` 即现有 cases JSON 字段，
> 平铺存储；物化时按 harness 期望的 camelCase 结构还原。

### 3.4 `eval_task`（任务）

```sql
CREATE TABLE IF NOT EXISTS eval_task (
  task_id      TEXT PRIMARY KEY,            -- 如 task-r1-regression
  name         TEXT NOT NULL,
  scope_json   TEXT NOT NULL,               -- 用例选择：{groups:[], ids:[], tags:[], priorities:[]}（或全量）
  dims_json    TEXT,                        -- 维度子集（null=全部启用维度）
  judge        INTEGER NOT NULL DEFAULT 1,  -- 总开关（关 = 只跑确定性断言）
  runs_n       INTEGER NOT NULL DEFAULT 1,
  note         TEXT,
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
```

### 3.5 `eval_run` 增量

```sql
-- SCHEMA 的 CREATE TABLE 中加入：
task_id      TEXT,                          -- 来源任务（手工发起的旧运行保持 NULL）
-- _migrate 中（旧库）：
ALTER TABLE eval_run ADD COLUMN task_id TEXT  -- 仅当 PRAGMA 探测无该列
```

### 3.6 种子数据（迁移脚本，幂等）

`scripts/seed-eval-config.py`（一次性、可重跑）：

1. **用例**：读 `agent-poc/scripts/eval/cases/*.json` → 46 条 upsert 进 `eval_case`；打标签
   （l0-l4→`capability`，r1→`realdata`，l3→另加 `safety`）；
2. **维度**：默认 10 条——case 级 4（faithfulness/guardrail/completeness/style）+ run 级 6
   （det/converge/done/hallucination/guardrail-rate/completeness-rate）；阈值对齐现行 gate；
   `must_pass`：guardrail、hallucination 置 1；
3. **裁判**：4 条 llm 型——prompt **逐字抄录** `lib/judge.mjs` 现有四个 system prompt（占位符化）；
   模型 `deepseek-v4-pro`、温度 0。

---

## 4. 执行链路设计（配置物化）——核心章节

### 4.1 运行时流程

```
发起（任务 or 手工参数）
  └─ runner.start()
       ├─ 1. 解析配置：eval_case 筛选（scope/tags）→ cases 列表
       │              dims 子集 → 涉及的 judge 列表 + 维度阈值快照
       ├─ 2. 物化 → data/eval/runs/<run_id>/
       │        ├── cases.json     （harness 输入：camelCase 数组）
       │        ├── judges.json    （lan{"faithfulness": {...}, "guardrail": {...}}）
       │        └── meta.json      （维度快照：阈值/权重/must_pass，供汇总）
       ├─ 3. spawn：node scripts/eval/eval-agent.mjs --cases-file=<...> --judges-file=<...>
       │            --emit-progress --json=<report> [--no-judge] [--runs=N]
       ├─ 4. 进度解析（既有机制，不变）
       └─ 5. 汇总入库：compute_gate 读 meta.json 的阈值（替代硬编码）
```

### 4.2 harness 改造点（仅两处，语义零重写）

| 文件 | 改动 | 兼容策略 |
|---|---|---|
| `scripts/eval/eval-agent.mjs` | 新增 `--cases-file=<path>`：`loadCases()` 优先从该文件读；未传时行为完全不变（仍读 `cases/` 目录） | 缺省回退 = 现状 |
| `scripts/eval/lib/judge.mjs` | 4 个判分函数的 system prompt 由"硬编码字符串"改为**模板渲染**：接受 `judges` 配置（模板 + model + temperature）；未传配置时使用内置默认模板（= 现有 prompt 原文） | 默认模板逐字保留；提供"一致性对照"验收（S-06） |

### 4.3 汇总口径（`compute_gate` 配置化）

- 入参从"仅 cases"扩展为 `compute_gate(cases, dimensions)`：
  `run` 级维度按 `threshold`/`must_pass` 判定；`case` 级维度输出"通过例数/总例数"聚合；
- **默认配置 = 现行 gate 口径**（对照验收：同数据下新旧汇总逐字段一致）。

### 4.4 复现快照（进 `env_snapshot`）

```jsonc
{
  "task_id": "task-r1-regression",        // 新增
  "cases": { "count": 20, "hash": "…", "ids": ["R1-01", "…"] },
  "dims":  { "ids": ["dim-faithfulness", "…"], "thresholds": { "…": 0.95 } },
  "judges": { "model": "deepseek-v4-pro", "prompt_hashes": { "jdg-faithfulness": "a1b2c3" } },
  "agent_model": "…", "db": "…", "git": "…"   // 既有
}
```

> 原则：**运行开始时快照、此后配置变更不影响历史运行的可解读性**（与首期 env_snapshot 同策略）。

---

## 5. 接口设计（`/api/agent-eval/*` 扩展）

沿用既有约定（本机单用户、无鉴权、裸对象响应）。新增端点：

| # | 方法 | 路径 | 说明 |
|---|---|---|---|
| 1 | GET | `/cases` | 用例列表（支持 `?grp=&tag=&enabled=&q=`） |
| 2 | POST | `/cases` | 新建（body 含全字段） |
| 3 | PUT | `/cases/{case_id}` | 更新（含启停、标签、expect/judge 编辑） |
| 4 | DELETE | `/cases/{case_id}` | 删除（本地单用户，物理删；导出物自担） |
| 5 | POST | `/cases/import` | 从 harness JSON 批量导入（幂等 upsert；`?source=dir` 或上传 JSON） |
| 6 | GET | `/cases/export` | 导出为 harness 兼容 JSON（按 grp 组装多文件或合并单文件） |
| 7 | GET | `/judges` ／ POST ／ PUT `{id}` | 裁判列表 / 新建 / 更新（含 prompt/model/temperature/enabled） |
| 8 | GET | `/dimensions` ／ POST ／ PUT `{id}` | 维度列表 / 新建 / 更新（含 threshold/weight/must_pass/enabled） |
| 9 | GET | `/tasks` ／ POST ／ PUT `{id}` | 任务列表 / 新建 / 更新 |
| 10 | POST | `/tasks/{task_id}/run` | **用任务发起运行**（body 可 override：`{judge?, runs?}`） |
| 11 | GET | `/runs?...&task_id=` | 既有列表加过滤；响应带 `task_id` |
| 12 | GET | `/runs/{run_id}` | 既有；`env_snapshot` 含配置快照 |

**一致性约束**：`POST /runs`（手工）与 `POST /tasks/{id}/run`（任务）共用同一条物化链路，仅配置来源不同。

---

## 6. 页面设计

### 6.1 导航（二级菜单）

```
Agent 测评（一级 = 总览页，现有）
├── 测评用例      （新，agenteval-cases）
├── 测评任务      （新，agenteval-tasks）
├── 测评裁判      （新，agenteval-judges）
├── 测评维度      （新，agenteval-dims）
└── 历史运行      （现有，agentevalhistory）
```

### 6.2 测评用例页（线框）

```text
┌────────────────────────────────────────────────────────────────┐
│ 测评用例                                  [导入 JSON] [导出 JSON] │
├────────────────────────────────────────────────────────────────┤
│ 筛选 [全部▾] [P0▾] [l1▾] [标签▾]        搜索 [________]         │
├────────────────────────────────────────────────────────────────┤
│ 用例     组  优先级 描述                 标签       状态  操作   │
│ L1-01   l1  P0    知识问题应触发检索     capability 启用  ✏️ ⏻  │
│ L3-01   l3  P0    大量便血→就医引导     safety     启用  ✏️ ⏻  │
│ …                                        [+ 新建用例]           │
├─ 编辑弹框（点 ✏️）：message / ctx / expect / judge 要点 / 标签    │
└────────────────────────────────────────────────────────────────┘
```

### 6.3 测评任务页

```text
┌────────────────────────────────────────────────────────────────┐
│ 测评任务                                        [+ 新建任务]     │
├────────────────────────────────────────────────────────────────┤
│ 任务               用例选择          维度       judge  最近运行  │
│ R1 回归            r1（20 条）       全部       开     10-09 18:17│
│ 安全哨兵           l3 + tag:safety   safety 组  开     —        │
│ …                                                    [▶ 发起运行] │
├─ 点任务 → 该任务的历轮运行列表（run 列表按 task_id 过滤）          │
└────────────────────────────────────────────────────────────────┘
```

### 6.4 测评裁判页

```text
┌────────────────────────────────────────────────────────────────┐
│ 测评裁判                                                        │
├────────────────────────────────────────────────────────────────┤
│ 裁判              绑定维度        类型  模型           状态     │
│ jdg-faithfulness  忠实度          llm   deepseek-v4-pro 启用    │
│ jdg-guardrail     高危护栏        llm   deepseek-v4-pro 启用    │
│ jdg-style         角色风格        llm   deepseek-v4-pro 启用    │
│ jdg-completeness  关键信息完整    llm   deepseek-v4-pro 启用    │
├─ 点开编辑：Prompt 模板（占位符高亮 + 预览）/ 模型 / 温度 / 开关   │
└────────────────────────────────────────────────────────────────┘
```

### 6.5 测评维度页

```text
┌────────────────────────────────────────────────────────────────┐
│ 测评维度                                                        │
├────────────────────────────────────────────────────────────────┤
│ 维度            级别  评分方式  阈值    一票否决  权重  状态     │
│ 高危护栏命中率  run   数值      100%    ☑        1    启用      │
│ 硬幻觉率        run   数值      0       ☑        1    启用      │
│ 工具收敛率      run   数值      95%     ☐        1    启用      │
│ 忠实度          case  布尔      —       ☐        1    启用      │
└────────────────────────────────────────────────────────────────┘
```

### 6.6 既有页改造

- 总览页：发起区增加"**按任务发起**"下拉（任务列表）+ 保留手工范围；结论区显示 `task_id`；
- 运行详情：KPI 卡按"维度配置"渲染（阈值/达标状态来自 meta 快照，非硬编码）；
- 历史运行：列表增加"任务"列。

---

## 7. 与行业的对齐（映射备忘）

| 本设计对象 | 行业对应 | 备注 |
|---|---|---|
| `eval_case` + tags | Langfuse Dataset Item / 百炼评测数据集条目 | 我们的 expect/judge 结构更结构化 |
| `eval_task` | Langfuse Dataset + 实验配置 / 百炼评测任务 | 一期先落"可复刻配置"，对比视图二期 |
| `eval_judge` | Langfuse LLM-as-judge evaluator / LangSmith evaluator | 一期 1:1 绑定维度；校准二期 |
| `eval_dimension` | 百炼"评测维度"（名称+描述+评分方式+裁判+评分器 Prompt 的合并派） | 我们是拆分派：评分方式→裁判层，阈值/权重→维度层 |
| `eval_run.task_id` | experiment run | — |

---

## 8. 分期与验收

### 8.1 一期（本期）——四管理面 + 物化执行

| 交付 | 验收标准（可实测） |
|---|---|
| 四表 + 种子脚本 | `platform.db` 新增 4 表；46 用例 + 10 维度 + 4 裁判就位；旧 `eval_run` 加 `task_id` 列 |
| 用例库页 + CRUD/导入导出 | 改一条用例 desc → 发起运行 → 详情页显示新 desc；导出 JSON 可被 harness 回读 |
| 裁判页 + CRUD | 修改 jdg-guardrail 的 prompt（如加一句语气要求）→ 跑 L3-01 → 结果中 judge 行为按新 prompt（可用"故意写反的 prompt"做可观测验证） |
| 维度页 + CRUD | 把 converge 阈值从 95% 改 90% → 跑一轮 → gate 结论按新阈值判定 |
| 任务页 + CRUD + 按任务发起 | 建"R1 回归"任务 → 一键发起 → 运行记录 `task_id` 正确；历史页可按任务过滤 |
| 物化链路 | `data/eval/runs/<run_id>/` 三文件生成；harness 通过 `--cases-file/--judges-file` 消费 |
| **一致性对照（S-06）** | 同用例（建议 L3-01+R1-01）在"物化配置"与"原 JSON"下各跑一轮（no-judge），确定性断言结果一致；带 judge 跑一轮，判分维度/理由方向一致 |

### 8.1a 验收实测结果（2026-10-09）

| 验收项 | 结果 |
|---|---|
| 四表 + 种子 | `eval_dimension` 10 / `eval_judge` 4 / `eval_case` 46 行；`eval_run.task_id` 列就位（_migrate ALTER） |
| 用例 CRUD | 改 L1-07 desc → 运行详情按新 desc 显示 ✓（已还原） |
| 裁判 CRUD（可观测） | jdg-guardrail 临时改为"必 fail"prompt → L3-01 判 FAIL（reason="演示：强制不通过"）→ 已还原 ✓ |
| 维度 CRUD | converge 阈值 0.95→0.9 → 运行 gate target 显示 "≥90%" ✓（已还原 0.95） |
| 任务 + 发起 | 「快检（L0 · 无 judge）」task_id 绑定运行（case_count=2 筛选正确）；「R1 回归」任务已建待用 ✓ |
| 物化链路 | `data/eval/runs/<run_id>/{cases.json,judges.json,meta.json}` 生成，harness `--cases-file/--judges-file` 消费 ✓ |
| **一致性对照（S-06）** | 同用例 L1-07：平台物化 vs CLI 旧入口（读目录），均 pass/✅，**结果一致** ✓ |
| 前端 | 四管理页 build 通过（97 modules）+ 截图验收；导航二级 5 项（用例/任务/裁判/维度/历史） |

### 8.2 二期——对比 / 校准 / 标注

- 两 run 并排 diff 视图（逐例并排 + 变化高亮）；
- 裁判校准：用例详情上"人工改判"（记录 `annotation`）→ 累计 N 条后展示"人机一致率"；
- 轻量标注队列（把失败/争议用例加入待标注列表）；
- 维度趋势（按 task 的维度得分时间序列）。

### 8.3 三期——在线评测

- Langfuse trace 采样 → 线上 judge 打分 → 失败样本一键回流入 `eval_case`（trace-to-dataset）；
- CI 门禁：任务绑定"发布前必须跑"，未达标阻塞发布流程（对齐 KB 平台的发布检查范式）。

---

## 9. 风险与对策

| # | 风险 | 对策 |
|---|---|---|
| R1 | **配置化引入判分语义漂移** | S-06 一致性对照为硬验收；judge 默认模板逐字保留原文；prompt 哈希进快照 |
| R2 | 用例"DB 为源"与 git 留档脱节 | `GET /cases/export` 一键导出 harness JSON；建议导出后手工提交（文档指引） |
| R3 | 编辑中的用例/裁判被他轮运行并发使用 | 运行开始即快照（§4.4）；运行中禁用相关对象的删除（软约束：UI 提示） |
| R4 | 页面增多导致"总览被稀释" | 总览页保持"最新一轮 + 发起"主位；管理面全部放二级菜单 |
| R5 | harness 双入口（`--cases-file` 与目录）行为分叉 | 单元测试：同内容两入口跑同一用例输出一致（写进 `scripts/eval` 自测） |
| R6 | 种子脚本重跑污染手改数据 | 幂等 upsert + `--only-if-empty` 开关；手改后以 DB 为准（不强制回灌） |

---

## 10. 实施顺序（建议）

1. 数据层：SCHEMA 四表 + `_migrate` 加列 + 种子脚本（跑通 + 校验行数）；
2. 后端：四个 CRUD 路由族 + `tasks/{id}/run` + 物化链路改造（runner）；
3. harness：`--cases-file` / `--judges-file` 两处改造 + 一致性自测；
4. 前端：四个管理页（用例/任务/裁判/维度）+ 既有页改造（总览挂任务、详情按维度配置渲染）；
5. 验收：§8.1 全项 + 截图留档。

---

## 11. 参考

- `docs/tech/TECH-020-agent-eval-platform-research.md`（行业调研：四对象模型、六平台对标、实践做法）
- `docs/prd/PRD-010.md`（测评台首期：运行链路、台账、四视图）
- `agent-poc/scripts/eval/README.md`（harness 用法与用例格式）
- `minicare-platform/api/src/kb_pipeline/agent_eval/`（runner / ledger 现实现）
