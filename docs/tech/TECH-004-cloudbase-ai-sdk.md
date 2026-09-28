# TECH-004 · @cloudbase AI SDK 技术架构与生态调研

> 调研时间：2026-08-20
> 调研范围：`@cloudbase/*` AI 相关 SDK 的技术架构、开源代码、生态活跃度
> 关联文档：[INFRA-cloudbase.md](INFRA-cloudbase.md)（minicare CloudBase 基建）

---

## 一、结论速览

| 问题 | 结论 |
|------|------|
| 技术架构 | 两代并存：**老路线 AG-UI（`@cloudbase/agent-server` 系列，2025-12 起，已停更）** vs **新路线 OAK（`@cloudbase/open-agent-kernel`，2026-06 起，官方主推）** |
| 是否有开源代码 | **有**。OAK 为 Apache-2.0 全开源（GitHub: `TencentCloudBase/OpenAgentKernel`）；老路线 agent-server **闭源**（npm 无 repository 字段） |
| 生态活跃度 | **OAK 极活跃**（2 个月 22 个版本、~160 commits、每周发版）；底层生态（Claude Agent SDK / AG-UI / MCP）全球活跃；老路线 agent-server 已 5 个月无新版本 |
| 对 minicare 的意义 | 智能体应选 **OAK 新路线**，不要基于 agent-server 旧路线开发；OAK 满足多用户会话隔离、MCP/Skill 继承、数据主权硬约束 |

---

## 二、@cloudbase AI SDK 家族图谱

### 2.1 两代技术路线

```
┌─ 老路线：AG-UI 协议（2025-12 ~ 2026-03，已停更）────────────────┐
│  @cloudbase/agent-server          # Agent HTTP 服务（Express）   │
│  @cloudbase/agent-adapter-langgraph / -langchain                │
│  @cloudbase/agent-ui-miniprogram  # 小程序 UI（behavior mixin） │
│  协议：AG-UI（@ag-ui/client）     # 闭源，无 GitHub 仓库        │
└──────────────────────────────────────────────────────────────────┘
┌─ 新路线：OAK / ACP 协议（2026-06 起，官方主推）─────────────────┐
│  @cloudbase/open-agent-kernel     # 服务端 Agent SDK（Apache-2.0）│
│  基于 @anthropic-ai/claude-agent-sdk（Claude 生态）             │
│  协议：ACP（@agentclientprotocol/sdk）                          │
│  内置：会话持久化 / MCP / HITL / Sandbox / userMemory / Skills  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 包清单与 npm 数据（2026-08-20 实测）

| npm 包 | 版本 | License | 版本数 | 首版 | 最近发版 | 月下载量 | 开源 |
|--------|------|---------|--------|------|----------|----------|------|
| `@cloudbase/open-agent-kernel` | 0.1.1 | Apache-2.0 | 22 | 2026-06-15 (beta) | 2026-08-13 | 1,522 | ✅ GitHub |
| `@cloudbase/agent-server` | 0.0.24 | ISC | 46 | 2025-12-22 | **2026-03-11（停更）** | 942 | ❌ 闭源 |
| `@cloudbase/agent-ui-miniprogram` | 0.0.24 | MIT | 46 | 2025-12 | 2026-03（停更） | 568 | ❌ 闭源 |
| `@cloudbase/agent-adapter-langgraph` | 0.0.24 | ISC | 46 | 2025-12 | 2026-03（停更） | 729 | ❌ 闭源 |
| `@cloudbase/agent-adapter-langchain` | 0.0.24 | ISC | 46 | 2025-12 | 2026-03（停更） | 1,310 | ❌ 闭源 |
| `@ag-ui/client` | 0.0.58 | MIT | 73 | 2025-04 | 2026-08-20（今天） | **4,269,939** | ✅ ag-ui-protocol/ag-ui |
| `@cloudbase/cloudbase-mcp` | 2.30.1 | MIT | 167 | — | 2026-08-20（今天） | 50,953 | ✅ CloudBase-AI-Toolkit |
| `@cloudbase/node-sdk` | 3.18.3 | MIT | 113 | — | 2026-07-31 | 100,716 | ✅（旧 repo 已归档） |
| `@cloudbase/agent-adapter-crewai` | — | — | — | — | — | — | ❌ **npm 不存在** |

> ⚠️ 关键发现：
> 1. **`agent-adapter-crewai` 在 npm 上不存在**（官方文档提及 CrewAI 适配，但从未发布），说明老路线适配器不全。
> 2. **老路线 agent-server 系列已停更 5 个月**（2026-03-11 后无新版本），且闭源无仓库。官方战略已整体转向 OAK。
> 3. **@ag-ui/client 月下载 426 万**——AG-UI 协议本身是独立的全球开源项目（15.4k stars），与 CloudBase 是否维护无关，协议本身非常健康。

---

## 三、OAK（OpenAgentKernel）技术架构详解

### 3.1 定位

> "CloudBase Open Agent Kernel (OAK) — server-side agent SDK with built-in CloudBase session persistence, sandbox, HITL approval and user memory"

OAK 是 CloudBase 官方的**服务端 Agent SDK**，把每个 Agent 项目都要重复造的基础设施（会话持久化、多轮上下文、MCP 工具、人工审批、沙箱、用户记忆）内置化，业务只需写 Agent 逻辑。**它直接基于 Anthropic 的 Claude Agent SDK 构建，兼容 Claude 生态（skills、MCP、memory 约定）。**

### 3.2 核心依赖（0.1.1 实测 package.json）

```
@anthropic-ai/claude-agent-sdk  ^0.3.146   # Claude Agent SDK（核心引擎）
@anthropic-ai/sdk               ^0.93.0    # Claude API
@agentclientprotocol/sdk        ^1.0.0     # ACP 协议（输出事件流）
@modelcontextprotocol/sdk       ^1.29.0    # MCP 工具协议
@cloudbase/node-sdk             ^3.18.1    # CloudBase 资源访问
@cloudbase/manager-node         ^4.10.6    # 管理面（临时凭证等）
zod / tar                                  # 校验 / 沙箱归档
peer: @cloudbase/cloudbase-mcp  ^2.26.0    # 沙箱内 CloudBase 工具（可选）
```

### 3.3 使用模型

```typescript
const agent = createAgent({
  envId: "minicare-cloud-xxx",        // 资源锚点
  model: "deepseek-v4-pro",           // 或 ModelSpec（自带 apiKey/apiBaseUrl）
  systemPrompt: "...",
  mcpServers: { kb: { type: "http", url: "..." } },  // MCP 工具
  permissions: { requireApproval: ["*"] },            // HITL
  userMemory: true,                                   // 长期记忆
  skills: { enabled: "all" },                         // Skill 继承
  sandbox: { enabled: true, cloudbaseTools: true },   // 沙箱执行
});
const session = await agent.startSession({ userId: "user-1" });
for await (const msg of session.send("...")) { ... }
// 跨进程恢复：
const resumed = await agent.resumeSession(conversationId);
```

### 3.4 内置模块

| 模块 | 实现 | 说明 |
|------|------|------|
| **会话持久化** | CloudBase FlexDB（默认集合 `oak_sessions` / `oak_session_entries` / `oak_session_summaries` / `oak_session_messages`） | 传 `credentials` 后默认启用；`projectKey`（默认 envId）多租户隔离；`resumeSession()` 跨进程恢复；`getHistory()` 返回前端可直接渲染的消息 |
| **MCP 工具** | 进程内 SDK Server / stdio / 远程 HTTP 三种形态 | 工具名 `mcp__{serverName}__{toolName}`；配置直接透传 Claude Agent SDK |
| **HITL 审批** | `permissions.requireApproval`（`'*'` / 数组 / 函数） | 命中暂停并发出 `tool_confirm`；`respondApproval()` 注入决策；有 credentials 时状态落 FlexDB，支持分布式审批；默认超时 30 分钟 |
| **Sandbox** | 默认 local（宿主 FS + Claude 内置工具 Bash/Read/Write/Edit/Glob/Grep）；cwd 自动 tar.gz 同步 COS | `cloudbaseTools: true` 自动暴露 `mcp__cloudbase__*`（DB/COS/云函数等）；多租户支持 `userCredentials` 注入用户凭证 |
| **userMemory** | 同步 `<CLAUDE_CONFIG_DIR>/CLAUDE.md`、`projects/*/memory/`、`agent-memory/` 到 COS | 按 userId 隔离；提供 `writeUserMemoryFiles()` API 可预置记忆 |
| **Skills** | 扫描 `cwd/.claude/skills/` 下 SKILL.md | 与 Claude 生态 skills 约定一致（minicare 已有 skills 目录结构可复用） |
| **多模态附件** | CloudBase Storage（`agent-attachments/{envId}/{sessionId}/...`，签名 URL 1h） | 传 credentials 后默认启用 |

### 3.5 输出协议：ACP（Agent Client Protocol）

- OAK 输出 **ACP `session/update` 语义**（`AsyncIterable<AcpSessionUpdate>`），事件类型：`agent_message_chunk` / `tool_call` / `tool_call_update` / `tool_confirm` / `ask_user` / `agent_phase` / `log`
- ACP 是 **Anthropic 主导的开源协议**（`agentclientprotocol/typescript-sdk`，Apache-2.0，234 stars），与 AG-UI 并列的 Agent 交互协议
- 注意：ACP 原始定位是"编辑器 ↔ 编码 Agent"，OAK 用它作为内部事件语义，上层可再适配 AG-UI / SSE / JSON-RPC

### 3.6 已知限制（beta → 0.1.x 阶段）

| 限制 | 影响 |
|------|------|
| `agent.sessions.get()` 恒返回 `null`（未实现） | 会话查询需绕道 DB |
| `sessions.list()` 的 userId/cursor 过滤未实现 | 多用户会话列表需自建 |
| `SessionConfig.database` 仅 flexdb 实现（mongo/mysql/pgsql 预留） | 会话存 FlexDB（文档库），不可直接入 CynosDB |
| `handoffs`（多 Agent 交接）预留未接入 | 多智能体协作暂不可用 |
| `registerSession` 预留未落库 | — |
| 要求 Node.js >= 20.19 | CloudRun 需注意运行时版本 |

---

## 四、GitHub 开源仓库活跃度

| 仓库 | Stars | Forks | 最近提交 | License | 活跃度评估 |
|------|-------|-------|----------|---------|-----------|
| `TencentCloudBase/OpenAgentKernel` | 25 | 2 | 2026-08-13 | Apache-2.0 | 创建 2026-07-30，~160 commits，贡献者 7 人（主开发者 Lukejyhuang 112 commits），**密集开发中** |
| `ag-ui-protocol/ag-ui` | **15,420** | 1,390 | **2026-08-20（今天）** | MIT | AG-UI 协议官方仓，全球活跃 |
| `TencentCloudBase/CloudBase-AI-Toolkit` | 1,073 | 134 | 2026-08-20（今天） | MIT | cloudbase-mcp 源码仓，活跃 |
| `TencentCloudBase/cloudbase-agent-ui` | 91 | 9 | 2026-01-29（停更） | — | 老路线 UI 仓库，已停更 7 个月 |
| `TencentCloudBase/OpenVibeCoding` | 171 | 36 | 2026-08-05 | — | 模板仓，OAK npm 指向的 repo |
| `TencentCloudBase/skills` | 74 | 5 | 2026-08-20（今天） | — | CloudBase Skills 仓，活跃 |
| `agentclientprotocol/typescript-sdk` | 234 | 39 | 2026-08-16 | Apache-2.0 | ACP 协议 SDK，活跃 |

> ⚠️ 注意：`TencentCloudBase/node-sdk` 旧 GitHub 仓库**已归档**（2022 年停更），但 npm 上的 `@cloudbase/node-sdk` 仍保持 3.18.3 活跃更新（2026-07-31）——代码已迁移至内部仓库，**GitHub stars 不能代表 node-sdk 的真实活跃度**。

---

## 五、小程序端接入路径

### 5.1 官方免鉴权通道：`wx.cloud.extend.AI.bot.sendMessage`

- 前置：基础库 ≥ 3.7.1 + 已开通云开发 + 控制台已创建 Agent
- 控制台「AI+ → Agent」创建 Agent（选官方 cloudbase-agent 模板 = OAK 工程），复制 botId
- 调用即得流式事件（`type: text / thinking / search / knowledge`），**免鉴权**（云调用自动带 OPENID）

```javascript
const ai = wx.cloud.extend.AI;
const res = await ai.bot.sendMessage({
  data: { botId: "botId-xxx", threadId: "thread_xxx", runId: "run_xxx",
          messages: [{ id: "m1", role: "user", content: "..." }] },
});
for await (const event of res.eventStream) { ... }
```

### 5.2 自建 Agent 服务（OAK 部署为 CloudRun / 云函数）

- 场景：需要自定义工具、知识库、HITL、数据主权时走此路径
- 部署形态：OAK 包装为 HTTP 服务（Express），SSE / AG-UI / JSON-RPC 输出，CloudRun 部署
- 小程序端可自绘对话页（Taro），或复用 `@cloudbase/agent-ui-miniprogram`（老路线组件，注意已停更）

### 5.3 控制台 Agent 与知识库

- 知识库官方以 **MCP server 形式接入**：检索服务暴露 MCP（`@modelcontextprotocol/sdk`），在 `agent.yaml` 中声明
- 向量底座：CloudBase PostgreSQL + pgvector（需控制台确认扩展可用）或 COS Vector

---

## 六、对 minicare 的结论与建议

1. **选 OAK，不选 agent-server**：老路线已停更且闭源；OAK 开源（Apache-2.0）、官方主推、兼容 Claude 生态，无代码层 vendor lock-in。
2. **多用户/多孩子隔离**：`projectKey`（envId）+ `startSession({ userId })` 双层；业务上 userId = family member，threadId = baby。
3. **Skill & MCP 继承**：skills 扫 `cwd/.claude/skills/`（与 minicare 既有 skills 约定一致）；MCP 支持 stdio/HTTP/进程内，可挂知识库、业务工具、第三方工具。
4. **风险**：OAK 处于 0.1.x 早期（sessions.get() 等未实现、Node>=20.19）；依赖 CloudBase FlexDB 做会话存储（CynosDB MySQL 不可用于会话表）；体验版套餐 2026-09-29 到期需评估升级。生产落地前建议在 staging 环境跑 POC 验证。
5. **跟进**：OAK 发版频率高（每周），持续关注 `0.1.x → 0.2+` 的 handoffs / sessions API 补齐。

---

## 附录：调研方法

- npm registry API：`npm view` / `registry.npmjs.org`（版本、license、发布时间、下载量）
- GitHub API：`gh api repos/*`（stars、forks、commits、releases、contributors）
- 官方文档：docs.cloudbase.net/ai/agent-development（OAK）、docs.cloudbase.net/ai/agent/knowledgebase（知识库 MCP）
- 仓库 README：TencentCloudBase/OpenAgentKernel（架构、参数表、examples）
