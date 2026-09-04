# TECH-010 · deepeval 本地 Web UI 方案调研

> 最后同步：2026-09-03
> 背景：agent 本地测评闭环已建成（harness + deepeval + Langfuse，见 2026-09-03 日志），
> 当前报告形态是"一次性 HTML + Langfuse trace"。调研目标：能否本地部署 Web 服务
> 实现**测试数据管理、测评操作、报告查看**三位一体。
> 结论先行：**deepeval 生态没有可直接本地部署的成熟 Web UI；推荐"Langfuse 挂分"路线（零新基建），
> 完整管理界面需求则评估 promptfoo self-hosted。**

## 一、官方现状（deepeval 4.2.0 本地实测 + 官方文档）

| 能力 | 现状 | 说明 |
|------|------|------|
| 本地 Web Dashboard | ❌ 无 | `deepeval --help` 全量命令实测：无 server/dashboard 类命令 |
| `deepeval view` | 云端 | 实测：上传 Confident AI 云端（要 API key），非本地 UI |
| `deepeval inspect` | ✅ 本地 TUI | 终端界面查看 test run traces（读 .deepeval/test_run_*.json），非 Web |
| 本地数据 | ✅ JSON 文件 | `.deepeval/test_run_*.json` + `.latest_run_full.json`（rolling 快照）+ `.latest_test_run.json` |
| 官方定位 | 开源本地执行 + 云端商业化 | Web UI（数据集管理/报告/对比）是 Confident AI 的商业功能 |

## 二、Confident AI self-hosted（官方自托管）

- 官网 FAQ 明确"Can I self-host? Yes"——但**仅 Enterprise 商业计划**：私有 VPC/on-prem、
  book demo 商谈、官方口径部署周期 1-2 周（含 IDP 集成）。无公开 Docker 镜像/安装包。
- **Docker Hub 实核（API 搜索 33 个结果）**：不存在官方 `deepeval/server` 镜像；
  网传的 `deepeval/server:1.0.0` + `metrics-syncer` compose 方案出自 AI 生成 SEO 站
  （theneuralbase），属虚构内容，不可信。
- 结论：个人/小团队本地部署官方 Web UI 不可行。

## 三、社区开源方案（GitHub 实搜）

搜索 `deepeval dashboard/ui/viewer/report`，排除官方仓库与 <3 星项目后：

| 项目 | 星数 | 评价 |
|------|------|------|
| lamhotsiagian/llm-ops-observability | 4 | RAG+LLMOps 观测平台带 DeepEval 集成，个人项目 |
| RooseveltAdvisors/deepeval | fork | 官方 fork，本地存储 + Streamlit dashboard 示例（:8501），2025-03 后不活跃 |
| crimsondawn369/deepeval-dashboard 等 | 0 | 个人实验项目 |
| TheTestingAcademy 课程（非开源仓库） | — | FastAPI(:8203) 自建模式：goldens 管理 + 指标运行 + runs 历史，**架构可参考但需自建** |

**结论：社区无可直接部署的成熟方案**（无百星级、无活跃维护的专用 deepeval UI）。

## 四、可行路线对比（结合 minicare 现状）

### 路线 A：Langfuse 挂分（推荐，零新基建）
- Langfuse 本地栈已在跑（:3100，docker compose），agent trace 已全量入库（72+ 条）。
- deepeval 判分结果通过 ingestion API 以 **score 形式挂到对应 trace**
  （traceId ↔ 用例已由 eval harness 关联，langfuse-import.mjs 可扩展）。
- Langfuse 开源版自带 dataset / experiment 功能，测试数据可逐步迁移进去。
- 测试报告 = Langfuse trace（执行过程）+ scores（指标分数），天然联动。
- 成本：扩展 langfuse-import 脚本 + 少量 UI 操作习惯变化。**改造成本最低、与现有观测链路统一。**
- 缺点：deepeval 的 test run 视图（逐用例指标矩阵）需要自己看 score 列表，不如 Confident AI 专门。

### 路线 B：promptfoo self-hosted（完整 Web UI，需桥接）
- promptfoo 是 deepeval 的主要竞品，**本地 Web UI 开箱即用**（`promptfoo view`，:15500），
  官方提供 self-hosting Docker（ghcr.io/promptfoo/promptfoo，SQLite 持久化 + 团队共享 + CI 聚合）。
- 支持 `file://python_provider` 桥接现有 harness（把 R1 用例执行包成 provider），
  指标用其 llm-rubric（自定义 judge 标准）承载。
- 成本：评测体系迁移/双轨（deepeval 的 ToolCorrectness/Faithfulness 等标准指标需在 promptfoo
  侧重建等价物），改造成本中等。
- 适合：如果"团队级 Web 管理界面（多成员看报告、筛失败、对比历史）"是硬需求。

### 路线 C：自建轻量 Web（现有脚本扩展）
- 已有 `scripts/eval/report-html.mjs` + `r1-report-gen.py`（数据驱动 HTML），
  可扩展为 FastAPI/静态服务：历史报告列表 + 用例筛选 + 趋势对比
  （TheTestingAcademy 的 FastAPI 模式可参考，goldens 直接读写 r1-realdata.json）。
- 成本：开发量最大，但完全贴合自己的用例结构与断言体系。

### 不推荐
- Confident AI 云端：数据出域 + 免费档 1000 runs/月 + 生产 ~$200+/月。
- Confident AI Enterprise self-host：商业谈判门槛。
- 社区 0-4 星项目：不可维护。

## 五、建议决策

1. **短期（本周可做）**：路线 A——扩展 langfuse-import.mjs，把每条 trace 的 deepeval
   指标分数（tool_correctness / faithfulness / style / safety）作为 Langfuse score 上报，
   报告查看统一到 Langfuse UI；r1-realdata.json 继续作为测试数据的版本化单一来源。
2. **中期观察**：若多成员协作看报告成为常态，再评估路线 B（promptfoo self-hosted），
   用 python provider 桥接现有 harness，deepeval 保留为指标引擎。
3.deepeval 官方若后续开源本地 dashboard（社区有诉求，可关注 confident-ai/deepeval releases），
   届时直接升级采用。

## 附：信息来源

- 本地实测：deepeval 4.2.0 CLI（`--help` / `view` / `inspect` 实跑）
- Confident AI 官网 FAQ（self-host = Enterprise）：confident-ai.com
- Docker Hub API 实搜（33 结果无官方 server 镜像）
- GitHub API 搜索（deepeval dashboard/ui/viewer，无 ≥5 星专用项目）
- promptfoo 官方文档：self-hosting（Docker/SQLite/团队共享）、`promptfoo view`（:15500 本地 UI）
- 参考架构：TheTestingAcademy FastAPI dashboard 模式（goldens/registry/runner/runs 四件套）
