# TECH-012: 用腾讯云 ADP（Claw 模式）替换 miniCare Agent 运行时 — 可行性评估

> 日期：2026-09-18 ｜ 状态：评估完成，待 P0 验证后决策
> 评估对象：https://cloud.tencent.com/document/product/1759/133868 （腾讯云智能体开发平台 ADP，Claw 模式，API 版本 2026-05-20）
> 被替换对象：`agent-poc`（claude-agent-sdk 0.3.237 直连 + wire-proxy → DeepSeek，CloudRun `minicare-agent`）

---

## 0. 结论摘要

**有条件可行，推荐走「运行时托管 + 工具服务化」形态，不建议做纯平台低代码替换。**

| 维度 | 结论 |
|---|---|
| 功能匹配度 | 核心四工具（KB 检索 / 数据查询 / 总结分析 / 日记）全部可通过「自定义 API 插件」外挂；模型可用平台内置 DeepSeek-V4-Flash，**不再自持 DeepSeek Key**（密钥安全改善） |
| 最大收益 | 去掉每请求 3-5s 的 CLI spawn、去掉 wire-proxy（CLI 请求行 bug 那类脆弱性）、不再自维护 agent runtime |
| 最大风险 | ① 数据隔离从「服务端 ctx 硬注入」退化为「模型填参数」，需 sessionToken 签名校验补回（方案见 §4.3）② 图片问诊的视觉模型在 Claw 场景是否可用 **未确认** ③ 可观测性自建链路（transcript→Langfuse）退役，降级为平台 TraceId + 工具侧打点 |
| 迁移成本 | 约 1-1.5 周（P0 验证 0.5-1d + 工具服务化 2-3d + 代理切换 1-2d + 验收 1-2d） |
| 成本 | token 单价与直连持平（≈¥1/1M 输入、¥2/1M 输出，全时段无峰谷）；新增 PU 订阅（免费版 15,000 PU/月，专业版 188 元/月）；省下 minicare-agent CloudRun 实例 |
| 建议 | 先做 §6 的 P0 验证清单（半天），三个硬性项通过再拍板迁移；agent-poc 保留一个观察期作为回退 |

---

## 1. ADP Claw 模式是什么

腾讯对标 Claude Managed Agents / OpenClaw 形态的托管 Agent 平台（与 8 月「国内对标调研」方向完全吻合）。核心机制（均已从官方文档确认）：

- **沙箱工作空间**：每个会话绑定独立沙箱，Agent 可执行代码、生成文件，产出走 COS（`message.done` 事件带 `File.FileUrl`）
- **全流程 API**：`CreateSpace → CreateApp(AppMode=4) → CreateAgent（指令/模型/Skill）→ CreateRelease（发布+版本快照）→ CreateConversation → POST /adp/v2/chat（SSE）→ DescribeConversationMessageList（历史）`
- **自定义工具**：`CreatePlugin` 注册插件，工具支持「基于 API」（OpenAPI/Swagger YAML/JSON，APIKey/OAuth2 鉴权）或「基于代码」（Python 函数，跑在平台侧 → **访问不了 VPC 内 CynosDB，minicare 必须走 API 形态**）
- **用户级 Agent**：`CopyAgentFromApp(Kind=1)` 为每个用户复制独立实例，运行时可换模型/装卸 Skill/绑工具，无需重新发布
- **运行时变量**：对话请求 `Contents` 中追加 `custom_variables` 块即可透传自定义上下文（需开「允许在对话中动态修改配置」开关；对象值须 JSON 序列化）
- **请求级提示词**：chat 请求支持 `SystemRole` 覆盖应用默认提示词（有 `RoleLenLimit` 限制）
- **SSE 事件**：`request_ack / response.created / message.added / text.delta / text.replace / message.done / response.completed / quote_info / reference / error`；**tool_call 过程在 `response.completed` 的 `Messages`（Type=tool_call，含 Status、Contents json_text）与 `Procedures` 中可见**；`StatInfo` 带 InputTokens/OutputTokens/TotalCost；`ExtraInfo` 带 TraceId/Elapsed
- 双入口：腾讯云（`adp.tencentcloudapi.com`，CAM 密钥 V3 签名）或独立站（`capi.adp.tencent.com` + `adp.tencent.com/adp/v2/chat`）

## 2. 现状盘点：替换什么、保留什么

| 层 | 现状（agent-poc v0.2.0） | 处置 |
|---|---|---|
| Agent 运行时 | claude-agent-sdk + CLI spawn + wire-proxy（thinking 注入、请求行归一化、DNS 缓存重试） | **替换**（ADP 托管，连带消灭 CLI spawn 3-5s 与该 bug 类） |
| 模型接入 | DeepSeek 官方 API Anthropic 端点，自持 API Key | **替换**（ADP 内置 DeepSeek-V4-Flash，Key 不再自持） |
| 4 个工具 | 进程内函数：search_knowledge（RRF 混合检索，Recall@10=97.8%）、query_baby_data、analyze_baby_data（含生长曲线）、generate_diary | **保留逻辑，形态改造**：搬入 minicare-server 新模块，暴露为 REST + OpenAPI → 注册为 ADP 自定义插件 |
| 数据访问 | agent 容器直连 CynosDB 只读账号；FlexDB 会话自管（最近 20 条） | 保留 CynosDB 只读账号；**FlexDB 会话存储退役**（平台按 ConversationId 托管历史，有拉取接口） |
| 鉴权 | NestJS JwtGuard + FamilyMemberGuard + baby 归属校验 → x-agent-ctx 硬注入 | 保留 JWT 层；baby 隔离改为 §4.3 sessionToken 方案 |
| 可观测 | FlexDB telemetry + transcript JSONL + transcript-enrich + Langfuse | **降级重建**：ADP TraceId/StatInfo + 工具服务端打点 FlexDB（业务索引可延续） |
| 评测 | eval harness（在线）+ deepeval（离线） | 基本零改动——harness 打的是 `/api/agent/chat` 对外协议（见 §4.4） |
| 日记 REST | minicare-server `/api/agent/diary/*` | **不动**（与 agent 运行时无关） |

## 3. 能力逐项对照

| miniCare 需求 | ADP Claw 模式 | 匹配 |
|---|---|---|
| 模型 deepseek-v4-flash | 平台价目含 DeepSeek-V4-Flash；Claw 场景实际可用清单需 `DescribeModelList(ModelScene=18)` 确认 | ✅ 待 P0 确认 |
| 视觉（图片问诊） | chat `Contents` 支持 `Type:image`（URL 传入，minicare 图片已在 COS，`download-urls` 出临时 URL 即可）；但 Claw 场景是否有视觉模型 **未确认** | ⚠️ P0 硬性验证项 |
| 多宝宝会话隔离 | 会话=独立沙箱+上下文；建议不同用户端会话用不同 ConversationId（与现状「切宝宝=新会话」一致）；越权防护需自建（§4.3） | ✅ 有方案 |
| 自定义工具 | 自定义插件（API 形态，APIKey 鉴权），显式绑定 ToolList/PluginList | ✅ |
| KB / RAG | 平台有知识库，但 minicare 自建 KB 已达 97.8% Recall 且带来源/风险级字段 → **保留自建检索作为 API 工具**，不迁平台 KB | ✅ 保留自建 |
| 持久记忆 | 应用级记忆配置 + 会话历史托管；跨会话长期记忆机制需验证 | ⚠️ 二期再评 |
| 动态换模型 | 用户级 Agent 运行时 `ModifyAgent(["Model"])`，可做「数据问题 flash / 复杂问题 pro」动态路由 | ✅ 超出现状能力 |
| 多 Agent 协作 | 主 Agent 调度子 Agent | ✅ 未来扩展项 |
| 版本管理 | CreateRelease 版本快照，配置改动须发布才生效（systemPrompt 走请求级 SystemRole 则不受此约束） | ✅ |

## 4. 目标架构与迁移方案

### 4.1 架构变化

- 退役：`agent-poc`（runtime/wire-proxy/CLI/FlexDB 会话）+ CloudRun `minicare-agent` 服务
- 保留：小程序对话页（**对外 SSE 协议不变**）、minicare-server（JWT 层不变，新增工具 API + ADP 代理）、CynosDB、COS 直传、日记 REST
- 新增：ADP 空间/应用/Agent/插件（可全 API 创建）；conversationId 映射表；sessionToken 签发与验签

### 4.2 SSE 事件映射（服务端帧转换，前端基本无感）

| 现有对外事件 | ADP 来源 |
|---|---|
| `meta` | `request_ack` + 本地会话映射 |
| `text` (delta) | `text.delta`（`Incremental:true`） |
| `tool_call` / `tool_result` | `message.done` / `response.completed` 中 Type=tool_call 的消息（含 json_text 结果）。**注意：处理过程中的实时工具状态可能拿不到，前端「正在查询…」状态条需实测后决定降级方案** |
| `sources` | search_knowledge 工具结果（tool_call json_text）由服务端解析合成 |
| `diary` | generate_diary 工具结果由服务端识别合成 |
| `done` (usage) | `response.completed` 的 `StatInfo`（token/cost 现成） |

### 4.3 数据隔离方案（关键补丁）

现状：babyId 由服务端注入 ctx，模型无从越权。ADP 下模型自己填工具参数，存在提示注入让模型改 babyId 的理论风险。补回硬约束：

1. minicare-server 每次 chat 请求签发**短 TTL 签名 sessionToken**（HMAC，payload=familyId/babyId/会话映射，≤5min）；
2. token 放入 `custom_variables` 与 SystemRole，约定模型调用工具时**必须透传 sessionToken 参数**；
3. 工具 API 验签后**以 token 内的 babyId 为准**，忽略模型传入的任何其他身份参数；
4. 注入攻击的上界=模型用自己的 token 查自己的宝宝——与现状安全等价。

工具端点挂在 minicare-server 已有公网服务上（新增 APIKey + sessionToken 双重校验），不需要新的暴露面。

### 4.4 评测与观测

- eval harness 打 `/api/agent/chat`，对外协议不变 → 基本零改动重跑 R1/R2；
- 观测三层替换为：ADP TraceId + StatInfo（token 对账）→ 工具服务打点 FlexDB telemetry（沿用业务索引）；Langfuse 链路（transcript-enrich 等）退役。逐轮 prompt 级观测能力损失，靠 tool_call Contents 回填部分弥补。

## 5. 成本对比（量级估算）

| 项 | 现状 | ADP |
|---|---|---|
| 模型单价 | flash 直连：输入空闲 1.5 / 高峰 3 元每百万；输出 4.5-9 元；缓存命中 0.05-0.1 元 | 平台 DeepSeek-V4-Flash：输入 ≈¥1、输出 ≈¥2 每百万（$0.14/$0.28），缓存 ≈¥0.2；**全时段无峰谷，输出价更低，但单轮总成本与直连同量级** |
| 订阅 | 无 | 免费版 15,000 PU/月；超后专业版 188 元/月（credit↔PU 换算需开通确认） |
| 基础设施 | minicare-agent CloudRun 实例 1-2 个 | 可下线（工具并入 minicare-server） |
| 人力 | 自维护 runtime（SDK 升级/wire-proxy/CLI bug 跟踪） | 转为平台跟随 |

参考量级：单轮数据问答约 4-8k tokens → 两边均为 ¥0.01-0.03/次，MVP 家庭量下模型费都是月均个位数到几十元；**决定性成本是 188/月订阅是否必要 + 沙箱/文件产出的计费口径**（P0 确认）。

## 6. P0 验证清单（先做这个，半天）

1. `DescribeModelList(ModelScene=18)`：Claw 场景是否含 DeepSeek-V4-Flash；是否有可用视觉模型（**图片问诊硬依赖，不通过则整个迁移重新评估**）
2. 注册一个 echo HTTP 工具（OpenAPI + APIKey），跑通 `CreateApp→Release→Conversation→chat`，确认 SSE 中 tool_call 的实时性与 `custom_variables` 是否进入模型上下文、可用于工具参数
3. SystemRole 长度限制（flash 的 RoleLenLimit）能否容纳现有 systemPrompt（角色+8 条纪律+宝宝档案）
4. 图文混合请求（`Type:image` 传 COS 临时 URL）在 Claw 模式实测
5. 计费口径：credit↔PU 换算、沙箱执行/文件产出是否单独计费、免费额度够不够 MVP

## 7. 迁移计划（P0 通过后，1-1.5 周）

| 阶段 | 内容 | 工时 |
|---|---|---|
| P1 工具服务化 | 4 工具搬入 minicare-server 新模块（lib/db.js、search-knowledge.js、growth.js 逻辑原样迁移），REST + OpenAPI schema + APIKey/sessionToken 验签 | 2-3d |
| P2 代理切换 | `/api/agent/chat` 内部实现换 ADP：会话映射表、sessionToken 签发、SSE 事件映射（§4.2） | 1-2d |
| P3 验收 | eval 重跑（Recall@10、R1 基线对比）、延迟实测（SSE 首字 <3s 目标）、双写观察期（ADP 与 agent-poc 可切换） | 1-2d |
| P4 退役 | agent-poc 归档、minicare-agent CloudRun 下线、FlexDB agent_chat_history 停写（数据保留） | 0.5d |

## 8. 风险清单

| # | 风险 | 等级 | 对策 |
|---|---|---|---|
| 1 | 视觉模型在 Claw 场景不可用 | 高（一票否决项） | P0 第 1 项先验；不通过则维持自建或混合（图片走旧链路） |
| 2 | 数据经腾讯 ADP 平台及其模型供应商 | 中 | 与现状流经 DeepSeek API 相比隐私面变化有限，但需明确接受；不可接受则不自建转托管 |
| 3 | 工具过程 SSE 实时性不足，前端工具状态降级 | 中 | P0 第 2 项实测；降级为「思考中」统一态 |
| 4 | 越权风险（模型填参数） | 中（有方案） | §4.3 sessionToken 签名校验 |
| 5 | 平台锁定（SSE 协议、插件格式、发布流程耦合） | 中 | 对外协议由 minicare-server 隔离，前端/评测无感知；agent-poc 保留回退 |
| 6 | 会话历史数据主权（平台托管，留存/删除策略未知） | 中 | P0 确认导出与删除接口；本地会话映射表双记录 |
| 7 | 平台限流/可用性（管理 API 20 qps；对话接口限流未知） | 低-中 | minicare-server 侧连接复用与重试 |
| 8 | 订阅费用超预期（PU 消耗、沙箱计费） | 低-中 | P0 第 5 项确认后再拍板 |
| 9 | KB 迁移诱惑（平台知识库） | 低 | 明确不迁：自建检索质量已达门槛且有来源/风险级字段 |

## 9. 与既有调研结论的衔接

- 8 月 OAK 替代调研的结论「CloudBase Agent SDK 是部署/UI 协议层补充而非运行时替代」**仍然成立**；ADP Claw 模式才是真正的运行时替代，且正好命中此前收敛的「国内对标 Claude Managed Agent 平台」方向。
- 若 P0 验证不通过或不愿接受平台耦合，备选仍是 OAK-alternatives-research.md 的中期方向：Vercel AI SDK v5 自持 agent loop（全控制、维护成本自担）。
