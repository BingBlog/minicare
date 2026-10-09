# OAK 替代方案调研（2026-09-04）

> 背景：minicare-agent 当前栈为 OAK 0.1.1 → claude-agent-sdk 0.3.237 → Claude CLI 子进程 →
> DeepSeek anthropic 端点。OAK 薄壳带来一系列已确认的问题（延迟、黑盒、不可配置），
> 本文评估替代/演进路线。前置文档：`docs/tech/OAK-internals-observability.md`（内部
> 机制拆包）、延迟诊断（2026-09-03，`scripts/diag-latency.mjs`）。

## 1. 替换 OAK 要解决的真问题（评估基准）

| # | 痛点 | 量化 |
|---|---|---|
| 1 | thinking 无法关闭（OAK 静默丢弃 ModelSpec.options） | 每轮多 1-7s，占 15-25s/轮的 40%+ |
| 2 | resume 不可用 → 每请求重建 agent + spawn CLI | 每请求 ~3-4s |
| 3 | 26K tokens prefill（CLI 系统提示 + 内置工具 schema） | 每请求固定成本，TTFT 变慢 |
| 4 | 黑盒：prompt 在闭源 CLI 内组装，无 LLM 级钩子 | 观测只能靠外围（transcript/代理） |
| 5 | usage 只有累计值，轮次归因不准 | 影响评测与成本分析 |
| 6 | client-tool 模式 quirks（准备语、pendingText hack） | 已打补丁但脆弱 |

另外保留的需求（不能丢的能力）：流式 SSE 输出、服务端自定义工具（4 个）、
client-tool/HITL 模式、多轮历史注入（history.js 自管）、CloudRun 部署、
DeepSeek（OpenAI 兼容 + anthropic 兼容双端点）。

## 2. 候选方案

### 方案 1：claude-agent-sdk 直连（去掉 OAK 壳）—— 短期增量验证

**核心事实（0.3.237 sdk.d.ts 实测确认）**：SDK 直接暴露 OAK 没透传的全部关键选项——

- `thinking: { type: 'disabled' | 'adaptive' | {enabled, budgetTokens} }` ← **痛点 1 直解**
- `resume: sessionId` + `forkSession` ← 痛点 2 直解
- `systemPrompt: string`（自定义串替换 CLI 默认系统提示）+ `settingSources` 控制文件系统
  来源 ← 痛点 3 可大幅削减（需 POC 验证 prefill 实际降幅）
- `hooks`（PreToolUse/PostToolUse/Stop 等）、`canUseTool`、`includePartialMessages`、
  `extraArgs` ← 观测与控制面大幅增强

- **收益**：改动小（OAK 我们只用了 createAgent/startSession/send/respondToolUse 一小片
  API，重写 stream 适配层约 1-2 天）；transcript JSONL 观测路线继续有效；复用现有
  telemetry 语义。
- **未解决**：仍是 CLI 黑盒 + 每请求 spawn（resume 可省重建但 spawn 本身仍在）；
  Anthropic SDK 耦合。
- **结论**：作为**过渡方案和 POC 验证场**——先单独验证 `thinking:disabled` +
  `resume` + 自定义 systemPrompt 的 prefill 降幅，三项验证的价值无论最终选哪条路
  都成立。**不建议作为终态**。

### 方案 2：Vercel AI SDK v5/v6 + @ai-sdk/deepseek 自持 agent loop —— 中期主推

TS 生态事实标准（周下载 1150 万，OpenCode/Perplexity/Replit 在用）。v5 起内置
Agent 循环、MCP client、流式结构化输出；v6 增加 Workflows（长任务）。

- **痛点全解**：
  - 无子进程、无 CLI：messages 数组完全自持（prompt 就是我们的代码），痛点 3/4/5
    直接消失——每轮 input/output/usage 天然在手上，Langfuse 有官方集成
    （@langfuse/vercel / OpenTelemetry），观测比现在强一个量级
  - `@ai-sdk/deepseek` 官方 provider（走 OpenAI 兼容端点），thinking/reasoning 参数
    直传直控（痛点 1）
  - 无重建问题（痛点 2 不存在，进程内长驻）
- **要自建**：agent 循环细节（工具重试、超时看门狗、client-tool/HITL 交互模式——
  现有 chat.js 的循环骨架可平移，且比 CLI 协议简单）；多轮历史就是 messages 拼接
  （history.js 现成）。
- **风险**：放弃 Claude CLI 的能力面（子代理、skills、文件系统工具）——当前养娃
  智能体只用 4 个服务端工具，用不到这些；未来要用时 AI SDK 有 MCP client。
- **迁移量**：chat.js 的 OAK 适配层重写（~2-3 天），telemetry/Langfuse 对接简化
  （每轮直接埋点），eval harness 的 agent-runner 同步改。
- **结论**：**终态推荐**。全链路可观测是自建智能体服务的核心诉求，AI SDK 是
  控制力/社区/维护成本的最优平衡。

### 方案 3：Mastra —— 备选（需求升级时再看）

TS 全家桶框架（Apache-2.0，Gatsby 团队）：agents + graph 工作流 + 数据库-backed
memory（语义召回、Observational Memory 自动压缩）+ 内置 evals + Studio 本地调试 UI +
observability + 90+ 模型路由（底层即 Vercel AI SDK providers）。

- **何时值得**：出现确定性多步工作流（如"每日成长报告生成流水线"）、跨会话持久
  记忆、内置评测编排需求时——满足 2 条以上再引入（cipherprojects 决策规则）。
- **代价**：依赖面大、opinionated 默认值；当前单 agent + 4 工具的规模用不满。
- **结论**：暂不引入；与方案 2 不冲突（Mastra 底层就是 AI SDK，迁移路径平滑）。

### 方案 4：OpenAI Agents SDK (JS) —— 不推荐

agent+handoffs+guardrails 极简原语。但：OpenAI 生态绑定（DeepSeek 走 wrapper 绕）、
无内置持久化/记忆、tracing 导向 OpenAI 平台（自托管 Langfuse 不好接）、TS SDK 相对
Python 次要。对"多 provider + 自建观测"诉求全不匹配。

### 方案 5：LangGraph.js —— 不推荐（当前）

图编排 + checkpoint 最强，Python 为主 TS 滞后；单 agent 聊天场景完全过重，学习成本
（图模型 + LangChain 消息类型）不划算。若未来做多 agent 编排再评估。

### 方案 6：CloudBase Agent SDK（@cloudbase/agent-server，AG-UI 协议）—— 定位补充而非替代

腾讯官方 agent server SDK：TS/Python 双语言，AG-UI 协议流式 agent-UI 通信，
LangGraph/LangChain/CrewAI 适配器，Web/小程序 UI 客户端，CloudBase 部署。

- **定位澄清**：它是 agent-server/UI 协议层，LLM 循环仍要底层引擎（LangGraph 等），
  不直接替代 OAK。
- **值得关注的点**：AG-UI 协议 + 小程序客户端与 minicare-mp 的流式 UI 标准化契合；
  平台一致性（和 minicare-server 的 CloudBase 生态同源）。
- **结论**：与方案 2 正交——若未来要把小程序端流式协议标准化，可评估 AG-UI 作为
  传输层；智能体内核仍走 AI SDK 自持。

### 方案 7：纯自研（裸 fetch DeepSeek）—— 被 AI SDK 覆盖，不单独考虑

控制力最大但要手搓流式/工具循环/重试的边角。AI SDK 本身就是"这层胶水"的开源实现
且足够薄（core 包 <200KB），没有理由重复造。

### 方案 8：Agent Harness 类（DeepSeek Harness dsh / DeerFlow 2.0）—— 形态错位，列入观察

> 2026-09-04 补充评估。Harness 与 §2 前述"运行时框架"是两类东西：Harness 是
> "整车/底座"（通用任务执行引擎，Model + Harness = Agent），面向开发者交互式长任务；
> 我们要的是**嵌入产品后端的运行时库**（小程序垂直聊天助手，秒级短轮次、多租户
> 隔离、SSE API）。

**DeepSeek Harness（dsh，2026-08-13 开源，MIT，三周 21 万 star）**：

- 事实：基于 Cordis 插件容器，"一切皆插件"（模型接入/文件/终端/会话/UI 全是插件，
  60 官方插件包 + 5100+ 社区插件）；host 半跑 Node、client 半跑浏览器（可自定义 UI）；
  headless 模式可跑 CI；模型无关（官方适配 DeepSeek V4）；四档预设模式
  （标准/PTC 程序化工具调用/极简/创造）；仍处 rc.6-rc.8，官方明示有破坏性变更
- **技术栈匹配度是 harness 里最高的**（Node/TS + MIT + DeepSeek 官方 + 插件化观测钩子
  可解黑盒问题），白皮书的成本工程结论（缓存命中率是账单第一变量、思考占 90% 时间、
  前缀瘦身）与我们 09-03 延迟诊断完全互相印证
- **不适配的点**：会话模型为交互式长任务（50 步工具链、分钟~小时级），我们是
  1-4 轮秒级问答；rc 阶段接生产风险高；为"一个 chat loop + 4 个查库工具"引入整个
  harness 生态过重；prompt 组装仍在 harness 内部（但有插件钩子可观测）
- **结论：不直接用，列入 Watch 名单**。触发条件：dsh 发布 1.0 稳定版 + 我们的
  能力面扩大到文件系统/代码执行/多步长任务时，重新评估替代 AI SDK 自持 loop

**DeerFlow 2.0（字节，2026-02-27 开源，MIT，~40-57K star）**：

- 事实：SuperAgent Harness，LangGraph 1.0 + Python 后端，每任务 Docker 沙箱
  （独立文件系统/bash），Lead Agent 动态编排并行子代理，Markdown 技能系统，
  跨会话长期记忆，多渠道 IM 接入；模型无关（litellm/OpenAI 兼容，官方推荐
  DeepSeek v3.2）
- **不适配的点**：Python 栈（我们 TS/CloudRun）；沙箱执行环境对我们无用（工具是
  FlexDB 查询，不是跑代码）；延迟模型完全错位（研究任务分钟~小时级 vs 秒级问答）；
  多智能体编排远超我们单 agent 规模
- **潜在契合场景**：**离线深度报告**（如"周/月成长报告深度分析"）——如果未来要做
  长周期多源聚合的离线任务，DeerFlow 或其模式值得参考；当前自研足够
- **结论：不采用**；作为离线深度研究场景的候选备忘

**同场竞品**：OpenAI 亦开源了 Codex 底层 Harness（2026-08 下旬），与 dsh 正面竞争——
印证"模型厂开源 Agent 底座"已成 2026 年趋势，此分类需持续跟踪。

## 3. 决策矩阵

| 痛点 | 1 直连 SDK | 2 AI SDK | 3 Mastra | 4 OpenAI AS | 5 LangGraph |
|---|---|---|---|---|---|
| 1 thinking 关闭 | ✅ POC 验证 | ✅ 直控 | ✅ | ⚠️ wrapper | ⚠️ |
| 2 重建/spawn | ⚠️ resume 省重建，spawn 仍在 | ✅ 无 spawn | ✅ | ✅ | ✅ |
| 3 prefill 26K | ⚠️ 自定义 prompt 可削减 | ✅ 无此问题 | ✅ | ✅ | ✅ |
| 4 可观测性 | ⚠️ 仍黑盒+transcript | ✅ 原生+Langfuse | ✅ 内置 | ❌ OpenAI 平台 | ⚠️ LangSmith |
| 5 usage 归因 | ⚠️ 间接 | ✅ 逐调用 | ✅ | ⚠️ | ✅ |
| 迁移成本 | 低（1-2 天） | 中（2-3 天+评测改造） | 高 | 中 | 高 |
| 社区/维护 | Anthropic 单向 | 事实标准，最活跃 | 快速上升 | 大但绑定 | 大（Python 为主） |

## 4. 推荐路线

> **4A. POC 实测结果（2026-09-04，`minicare-agent/scripts/poc-direct-sdk.mjs`，直连 claude-agent-sdk 0.3.237）**

| 假设 | 结果 | 实测数据 |
|---|---|---|
| a. `thinking:{type:'disabled'}` 生效 | ❌ **不生效** | 默认轮与 disabled 轮都产出 thinking 块（95 字 vs 787 字，长度随机噪声）；耗时 5295→4395ms 在噪声内。直接 curl DeepSeek 端点带同参数是生效的（09-03 实测省 60-80%）→ 定位为 **CLI 未向第三方模型端点透传 thinking 参数**（或仅对 Anthropic 模型生效）。**结论：关 thinking 仍只能走 P1 本地反代注入**，代理方案优先级提升（同时服务"抓完整 prompt"+"关 thinking"两个目的） |
| b. `resume` 可用 | ✅ **通过** | 两轮会话 sid 一致；第二轮答出首轮暗号（上下文完整保留）；第二轮 in=110 + cacheR=1024（prefill 几乎全缓存命中）；总耗时 2423ms 无明显额外开销。**每请求重建 agent 可以砍掉** |
| c. prefill 降幅 | ✅ **超预期，降 95%** | preset claude_code + 全量内置工具：in=21361（与 OAK 实测 21585 吻合，验证了 prefill 组成）；自定义 string systemPrompt + `tools:[]`：**in=1090**。端到端单轮 8750ms→3215ms（TTFT 7504→1855ms） |

附带发现：SDK 直连单轮 spawn 首轮仅 1.4-1.5s（含 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1），比 OAK 链路的 3-4s 重建开销低；POC 脚本留存于 `scripts/poc-direct-sdk.mjs`（CLAUDE_CONFIG_DIR 指向 /tmp 独立目录，不污染 ~/.claude）。

**4A+ 内置代理注入 thinking 实测（同日追加，`scripts/poc-wire-proxy.mjs`）**：在 minicare-agent
进程内起 http 反代（`ANTHROPIC_BASE_URL=http://127.0.0.1:<ephemeral>/anthropic`，转发
`api.deepseek.com` 时改写 body 注入 `thinking:{type:'disabled'}`，SSE 逐块透传）：

| 组 | thinking 块 | 耗时 | TTFT |
|---|---|---|---|
| 代理直通（不注入） | 有（161 字） | 4093ms | 3773ms |
| **代理注入 disabled** | **无** ✅ | **1974ms（-52%）** | 1931ms |

→ **内置代理方案验证通过**：无需独立进程，minicare-agent 进程内即可关闭思考；因代理在
localhost，生产 CloudRun 容器内同样可用（思考延迟收益可覆盖生产）。该组件同时承担
wire 级 prompt 抓取（§4B/方案 C），落地时合并为一个 `wire-proxy` 模块
（env 开关：`THINKING_MODE` / `WIRE_LOG`）。

**对路线的修正**：方案 1（直连 SDK）POC 后从"过渡方案"升级为**短期正式路线**——精简配置下单轮 3.2s 已接近无 CLI 状态；剩余 thinking 问题由 P1 反代解决。方案 2（AI SDK）仍是长期终态（彻底消除 spawn 与 CLI 黑盒），但迁移紧迫性下降。

> **4B. 改造已实施（2026-09-04 凌晨）**：方案 1 已落地为生产代码，OAK 从依赖中移除。
>
> 改动清单（minicare-agent）：
> - `src/lib/runtime.js`（新）：核心运行时。直连 `query()`，产出归一化事件流
>   （text/tool_call/tool_result/usage/done/error），chat.js 与 eval/agent-runner 共同消费；
>   工具经 `createSdkMcpServer`（zod raw shape 直喂），循环防护（同工具≤2/总≤3）内置于
>   execute 包装层；`tools:[]` 关全部内置工具；`settingSources:[]` 关文件系统配置；
>   `initAgentRuntime(config)` 幂等初始化（启动 wire-proxy + 设 SDK env），server/eval 共用。
> - `src/lib/wire-proxy.js`（新）：进程内反代（ephemeral 端口），注入
>   `thinking:{type:'disabled'}`（env `THINKING_MODE`，默认 disabled），可选 `WIRE_LOG=on`
>   落盘完整 prompt 到 `.wire-logs/`；回退直连官方端点（仅降级不阻断）。
> - `src/routes/chat.js`：重写为 runtime 事件消费 + SSE 适配；SSE 协议不变
>   （meta/session/tool_call/tool_result/text/done/error）；看门狗保留且新增真实中断手段
>   （AbortController 中断 CLI 子进程）；准备语剔除/兜底话术/历史回写行为对齐。
> - `scripts/eval/lib/agent-runner.mjs`：改用 runAgentTurn（消除与 chat.js 的双份循环拷贝）。
> - `src/lib/vision.js`：OAK attachment 格式 → Anthropic base64 image blocks。
> - `src/agent.js`：变为薄 re-export；`package.json` 移除 OAK、显式声明 claude-agent-sdk
>   ^0.3.237 + zod；`src/demo.js`、`scripts/diag-latency.mjs` 标记遗留（OAK 协议失效）。
> - 会话文件（transcript）落 `~/.minicare-agent/claude-config/`（隔离，不污染 ~/.claude）。
>
> 验收结果（dev，旺仔数据）：
> - 知识库问题（search_knowledge）：17.8s（含 17KB 知识库返回）→ 回答带来源与免责
> - 数据问题（query_baby_data）：**6.8s**（OAK 时代 15-25s）
> - 数据问题（analyze_baby_data）：**4.5s**
> - 无工具闲聊：**2.7s**；多轮历史注入 historyCount 正确递增
> - transcript 验证 thinking blocks = 0（反代注入真实生效）
> - telemetry：trace/generation/tool span/usage 正常落 FlexDB；usage 由 result 汇总，
>   轮次归因比 OAK 时期准确
> - eval 冒烟 L0 2/2 通过（agent-runner 改造后链路可用）
>
> 已知遗留：① generation 的 ms 计时在 SDK 单消息流下退化为近似值（text 事件到 usage
> 事件的间隔），真实耗时看 span 与 totalMs；② resume 会话恢复为后续优化（§4 路线）；
> ③ 建议尽快跑全量 R1 评测对比基线（15/20）。

1. **本周（不动现有代码）**：POC 验证方案 1 的三个关键假设——
   a. 直连 SDK 传 `thinking:{type:'disabled'}` 是否真实生效（CLI 是否透传给 DeepSeek）；
   b. `resume` 是否可用（省每请求重建）；
   c. 自定义 string systemPrompt + 关内置工具后 prefill 降幅。
   这三项结论直接决定短期优化幅度，也为终态迁移提供基线数据。
2. **短期（1-2 周内）**：基于 POC 结果二选一——POC 全过 → 直连 SDK 作为 minicare-agent
   过渡运行时（快速兑现延迟收益）；POC 有坑 → 直接启动方案 2 迁移。
3. **中期**：迁移到 Vercel AI SDK v5 自持 agent loop（终态）；telemetry 直连
   Langfuse（或 @langfuse/vercel），FlexDB 索引层保留；transcript JSONL 方案随
   CLI 退役自然消失（prompt 全自持后不再需要）。
4. **远期观察**：Mastra（工作流/记忆/评测需求 ≥2 条时）；CloudBase Agent SDK 的
   AG-UI（小程序流式协议标准化时）；**DeepSeek Harness（dsh）**（1.0 稳定版发布 +
   能力面扩大到文件/代码执行/长任务时，评估替代自持 loop）；DeerFlow 模式
   （离线深度报告场景）。

## 5. 附录：信息来源

- claude-agent-sdk 0.3.237 sdk.d.ts 实测（thinking/resume/forkSession/hooks/
  includePartialMessages/extraArgs 均为公开选项）
- Vercel AI SDK：most.tw 完整介绍 / juejin 详解 / shiporskip v5 评测 / 2026 指南
  （11.5M 周下载、Agent/MCP/Workflows 现状）
- 框架对比：cipherprojects「Mastra vs OpenAI Agents SDK 2026」、developersdigest
  「TS AI Agent Stack mid-2026」、andrew.ooo 四框架对比（2026-06）
- CloudBase Agent SDK：本地 skill（references/cloudbase-agent，AG-UI 协议 + TS/Python
  server + LangGraph 适配器）
- OAK npm 版本时间线与 0.1.1/0.1.2 diff：本机拆包（见前置文档）
