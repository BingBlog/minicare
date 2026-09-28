# TECH-005 · OpenAgentKernel (OAK) 源码分析：阻塞点与风险

> 调研时间：2026-08-20
> 分析对象：`TencentCloudBase/OpenAgentKernel` @ v0.1.1（GitHub main 分支，2026-08-13 最新提交）
> 方法：克隆源码（123 个 TS 文件）逐模块审读 + npm 依赖实证
> 关联：[TECH-004-cloudbase-ai-sdk.md](TECH-004-cloudbase-ai-sdk.md)（生态概览）、[INFRA-cloudbase.md](INFRA-cloudbase.md)（minicare 基建）

---

## 一、结论摘要

**OAK 可用，但"开箱即用"是错觉**。源码审读发现 3 个结构性约束（FlexDB 绑定、Claude CLI 二进制、CloudBase AI gateway 依赖）+ 1 个生产级硬伤（AGS 远程沙箱指向腾讯内部开发镜像）。对 minicare 的落地路径：**只用 local 沙箱 + 自实现会话存储（落 CynosDB）+ 薄适配层**，可规避大部分风险；直接套默认配置不可行。

---

## 二、运行时架构实证（源码级）

```
┌─────────────────────────────────────────────────────────────┐
│ 你的业务代码（NestJS CloudRun / 独立服务）                    │
│   createAgent({ envId, model, mcpServers, ... })             │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ OAK kernel（@cloudbase/open-agent-kernel 0.1.1）             │
│  src/public/create-agent.ts  →  src/runtime/agent-builder.ts │
│    • session 生命周期 / HITL / client-tool / getHistory      │
│    • 把 AgentConfig 翻译成 Claude SDK query() options        │
└──────────────────────────┬──────────────────────────────────┘
                           ▼  claudeQuery({ prompt, options })
┌─────────────────────────────────────────────────────────────┐
│ @anthropic-ai/claude-agent-sdk ^0.3.146                     │
│    • **spawn Claude CLI 原生二进制子进程**                    │
│    • 8 个平台包：@anthropic-ai/claude-agent-sdk-{linux-x64,  │
│      linux-arm64, linux-x64-musl, darwin-*, win32-*...}     │
└──────────────────────────┬──────────────────────────────────┘
                           ▼  ANTHROPIC_BASE_URL / AUTH_TOKEN
┌─────────────────────────────────────────────────────────────┐
│ CloudBase AI gateway                                        │
│  https://{envId}.api.tcloudbasegateway.com/v1/ai/cloudbase  │
│  认证：CLOUDBASE_APIKEY（环境服务端 APIKey）                 │
└─────────────────────────────────────────────────────────────┘
```

### 关键事实

| # | 事实 | 证据 |
|---|------|------|
| 1 | **模型调用不是直连大模型，而是 spawn Claude CLI 子进程**，由 CLI 以 Anthropic 协议访问 CloudBase AI gateway | `agent-builder.ts:410` env 注入 `ANTHROPIC_BASE_URL/ANTHROPIC_AUTH_TOKEN`；`create-agent.ts:1160` `claudeQuery({ prompt, options })` |
| 2 | **会话持久化绑定 CloudBase FlexDB（NoSQL 文档库）**，`session.database` 仅支持 `'flexdb'`，mongo/mysql/pgsql 为预留（传了直接抛 `InvalidConfigError`） | `create-agent.ts:311-317`；`cloudbase-db-driver.ts` |
| 3 | **凭证分两层**：模型走 `CLOUDBASE_APIKEY`；CloudBase 资源（DB/COS/审批）走 `credentials`（accessKey 优先，或 secretId/secretKey）。**非云函数环境必须显式传 credentials** | `credential-provider.ts`；HANDOVER.md:743-749 |
| 4 | **CLAUDE_CONFIG_DIR 必须指向可写目录**，否则 CLI 在云函数/CloudRun 只读 $HOME 下 EROFS 崩溃、静默零输出 | `agent-builder.ts:240-262` |
| 5 | **AGS 远程沙箱默认镜像指向腾讯内部 dev 仓库**（`royhuang-test-cbe88d/tcb-sandbox-ags`），且默认 ToolRoleArn 是硬编码内部账号 | `ags-stateful-sandbox.ts` `getDefaultSandboxImage()` / `getDefaultToolRoleArn()` |
| 6 | **本地沙箱（local）模式**：宿主进程本地 FS + SDK 内置工具（Bash/Read/Write/Edit/Glob/Grep），cwd 以 tar.gz 同步 COS 实现跨请求恢复 | `local-runtime-sandbox.ts`；`agent-builder.ts:400-408` |

---

## 三、阻塞点（不解决无法用）

### 🔴 B-1：会话存储硬绑定 FlexDB —— 与 minicare 的 CynosDB 冲突

- OAK 默认（且有 credentials 时自动启用）把会话写入 CloudBase **NoSQL 文档库**（`oak_sessions` / `oak_session_entries` / `oak_session_summaries` / `oak_session_messages` 四集合）
- minicare 现有数据全在 **CynosDB MySQL**，且 `SessionConfig.database` 枚举里的 `mysql` 是**预留未实现**（传了就抛错）
- **后果**：会话数据与业务数据分离在两种数据库；FlexDB 是否在当前体验版套餐可用需确认
- **出路**（两条）：
  1. 启用 CloudBase FlexDB（简单，但多一个数据源）
  2. **自实现 `SessionStoreDriver` 落 CynosDB**——接口公开（`append/load/loadRecent` 等），在 minicare-server 里基于 mysql2 连接池实现，把会话和业务放同一套库、同一隔离模型（推荐，符合数据主权）

### 🔴 B-2：CloudBase AI gateway 依赖 —— 需开通 + 模型启用

- 模型路由写死走 `https://{envId}.api.tcloudbasegateway.com/v1/ai/cloudbase`，认证用 `CLOUDBASE_APIKEY`
- 调用未启用模型返回 403 `AI_MODEL_NOT_SUPPORTED`；需先在控制台开通 AI 能力 / Token Credits / 成长计划并启用模型
- minicare 体验版套餐 2026-09-29 到期，AI 资源包是否覆盖需在控制台确认（`DescribeEnvPostpayPackage` / `DescribeActivityInfo` 资格检查）
- **可绕过**：`ModelSpec` 支持 `apiBaseUrl` + `apiKey` 自备端点（走 Anthropic 兼容协议），不依赖 CloudBase gateway——但失去托管模型生态

### 🔴 B-3：Claude CLI 二进制必须进部署镜像

- `@anthropic-ai/claude-agent-sdk` 依赖 8 个平台包，CloudRun（linux-x64 或 musl）需把对应二进制打进 Docker 镜像
- 或通过 `OAK_CLAUDE_CODE_EXECUTABLE_PATH` 指向运行时下载的二进制（SCF 场景官方建议）
- **影响**：Dockerfile 复杂化、镜像体积增加（CLI 二进制 + node_modules，约 100-200MB 级）；冷启动时若走下载路径有额外延迟

### 🔴 B-4：凭证面扩大 —— 密钥安全约束

- minicare 现有密钥管理：`JWT_SECRET` 等放 CloudRun 控制台 env
- OAK 需要：`CLOUDBASE_APIKEY`（模型网关）+ `credentials.secretId/secretKey`（资源操作）——**与"密钥不能泄露"的硬约束直接相关**，必须走环境变量注入，不能落代码
- `@cloudbase/manager-node` 在非云函数环境**必须显式传凭证**（HANDOVER 明确），CloudRun 里不能依赖隐式注入

---

## 四、风险清单（能用，但需规避/接受）

| # | 风险 | 等级 | 说明与规避 |
|---|------|------|-----------|
| R-1 | **API 不稳定（0.1.x）** | 高 | 周更、无 GitHub releases、`sessions.get()` 恒 null、`list()` 无 userId 过滤、`handoffs` 预留未实现。**规避**：薄适配层隔离 OAK API；只用 `startSession/resumeSession/send/respondApproval` 稳定子集 |
| R-2 | **AGS 远程沙箱生产不可用** | 高 | 默认镜像/roleArn 指向腾讯内部 dev 资源。**规避**：不用 `ags-stateful`，用 `provider: 'local'`（对话+知识库场景足够）；远程沙箱等官方公共镜像 |
| R-3 | **CLAUDE_CONFIG_DIR / HOME 只读** | 中 | 云函数/CloudRun $HOME 只读会导致 CLI 静默崩溃（零输出）。**规避**：显式设置 `CLAUDE_CONFIG_DIR` 到 /tmp 可写目录（OAK 已内置兜底 `deriveAgentConfigDir()`，但要确认容器 /tmp 可写） |
| R-4 | **本地沙箱 = 模型可执行宿主 Shell** | 中 | local 模式注入 Bash/Read/Write 等内置工具，模型可操作宿主 FS。**规避**：把 `cwd` 指向专用工作目录；或 `tools: []` 关闭内置工具（纯对话场景） |
| R-5 | **cwd 持久化依赖 COS** | 中 | local 模式跨请求恢复 cwd 靠 tar.gz 同步 COS；storage 未开通则静默降级（跨节点会话丢失工作区）。**规避**：确认 COS 可用；或不用工作区持久化（纯问答不需要） |
| R-6 | **FlexDB 查询限额** | 中 | `get()` 默认 100 条上限、`in` 查询 20 条上限、`limit(1000)` 硬顶。长会话 history 需分页；**规避**：自实现 driver 落 CynosDB 后无此问题 |
| R-7 | **userMemory 并发限制** | 低 | README 明确"不建议并发处理同一 userId 多请求"。**规避**：用户级记忆按 userId 串行化（或先不用） |
| R-8 | **Skills 依赖 cwd 目录** | 低 | 启用 skills 需传 `cwd` 且目录下有 `.claude/skills/`，否则静默无效（有 warning）。**规避**：镜像内置 skills bundle 目录 |
| R-9 | **Claude SDK 依赖版本漂移** | 中 | OAK 锁 `^0.3.146`，最新 0.3.237，周更；OAK 与底层 SDK 同步节奏需跟踪。**规避**：锁版本 + 升级时回归 |
| R-10 | **HITL 审批的 FlexDB 最终一致性** | 低 | `patchSentinelToolResult` 用轮询（50ms×20）+ `setTimeout 200ms` 等传播；分布式审批有延迟窗口。**规避**：接受毫秒级延迟，或单实例部署 |

---

## 四·五、P0 实测验证结果（2026-08-20，minicare 环境实测）

> 方法：用 CLI 扫码凭证初始化 `@cloudbase/node-sdk`（3.18.1），经 `auth().getClientCredential()` 换取 access_token，直连 AI gateway 与 FlexDB 实测。

### ✅ 验证通过项

| 项 | 结果 |
|----|------|
| **FlexDB（NoSQL 文档库）可用** | 实例 `tnt-hop2ymd92` RUNNING；`listCollections` 正常；**实测创建 `__oak_probe__` 集合成功（ok:1.0）**，已清理。→ **B-1 的 FlexDB 路径可行**（OAK 默认会话存储可直接用，无需自实现 driver 也能跑通） |
| **AI gateway 可达 + 凭证通道正常** | `auth().getClientCredential()` 成功换取 access_token（1034 字符）；gateway 域名 `{envId}.api.tcloudbasegateway.com` 可访问 |
| **小程序成长计划通道可用** | `hunyuan-exp` 分组 HTTP 200，返回 `model: hy3`，实测 5 个混元模型 ID（hunyuan-2.0-instruct-20251111 / hy3-preview / hunyuan-turbo / hunyuan-lite / hunyuan-standard）全部可用 |
| **环境套餐** | **个人版（prepayment）**，到期 **2027-04-02**（⚠️ 注意：INFRA-cloudbase.md 记录的"体验版 2026-09-29 到期"已过时，用户已升级） |

### ❌ 验证失败项（= OAK 落地的第一道坎）

| 项 | 结果 | 影响 |
|----|------|------|
| **`cloudbase` 模型分组（Token Credits）未开通** | `createModel('cloudbase')` 全模型 403 `AI_MODEL_NOT_SUPPORTED`；HTTP 直连 `/v1/ai/cloudbase/chat/completions` 同错 | **OAK 默认配置直接 403**——`agent-builder.ts:47` 写死 baseURL 为 `/v1/ai/cloudbase` 分组，当前环境该分组无任何启用模型 |
| **`custom-*` 分组未创建** | `/v1/ai/custom-test` 返回 404 `AI_MODEL_NOT_FOUND` | OAK 的 `custom-<name>` 分组需先在控制台 `CreateAIModel` 创建 |

### 🔑 关键结论：OAK 在当前环境的三条模型通路

```
路径 A（OAK 默认，❌ 当前不可用）:
  createAgent({ model: 'deepseek-v4-flash' })
  → ANTHROPIC_BASE_URL = .../v1/ai/cloudbase   ← 分组未开通，403
  需要：控制台开通 Token Credits 资源包并启用模型

路径 B（✅ 当前可用，推荐 POC）:
  createAgent({ model: {
    id: 'hunyuan-2.0-instruct-20251111',
    apiBaseUrl: 'https://minicare-cloud-6gqledlle0132cbe.api.tcloudbasegateway.com/v1/ai/hunyuan-exp',
    apiKey: <access_token 或 CLOUDBASE_APIKEY>,
  }})
  → 走小程序成长计划分组（实测 200），无需额外开通
  注意：access_token 有有效期，需服务端换发；或确认 CLOUDBASE_APIKEY 是否可直接用

路径 C（自备端点，数据出域）:
  createAgent({ model: { id, apiBaseUrl: 'https://<你的模型网关>', apiKey } })
  → 任意 Anthropic 兼容端点（DeepSeek 官方 / SiliconFlow / 自建 vLLM）
```

### P0 后的行动项

1. 决定模型通道：**先用路径 B（成长计划 hunyuan-exp）跑 POC**，零开通成本；若需要 DeepSeek 等更多模型，再评估开通 Token Credits 或走路径 C
2. 验证 `CLOUDBASE_APIKEY`（环境已有 API Key `GO2kJoGvTOiDGsjohFutvg`）是否可直接作为 gateway Bearer——若可，服务端无需走 getClientCredential 换 token（OAK 的 `CLOUDBASE_APIKEY` 设计即为此）
3. 会话存储：FlexDB 已实测可用，POC 直接用 OAK 默认 FlexDB 存储即可，CynosDB 自实现 driver 可延后决策

---

## 五、对 minicare 的落地建议（结合 INFRA-cloudbase.md）

### 推荐配置（可跑通 POC 的最小组合）

```typescript
const agent = createAgent({
  envId: 'minicare-cloud-6gqledlle0132cbe',
  model: 'deepseek-v4-flash',            // 需控制台确认已启用
  credentials: {                         // 从 CloudRun env 注入，不落代码
    accessKey: process.env.CLOUDBASE_APIKEY,  // 或 secretId/secretKey
  },
  systemPrompt: '你是敏宝护理助手……',
  mcpServers: {
    knowledge: { type: 'http', url: 'https://kb-server/mcp' },  // 知识库 MCP
    business: { type: 'sdk', name: 'business', instance: createSdkMcpServer({...}) },  // 业务工具
  },
  sandbox: {                             // ⚠️ 不用默认 remote
    provider: 'local',
    cloudbaseTools: false,               // 不用 cloudbase MCP（业务 MCP 自己写更可控）
    workspaceSnapshot: 'disabled',
  },
  tools: [],                             // 关闭宿主 Shell 类内置工具，纯对话+工具
  session: {
    // ⚠️ 方案一：FlexDB（需确认开通）
    // 方案二（推荐）：自实现 SessionStoreDriver 落 CynosDB
  },
  permissions: { requireApproval: ['mcp__business__*'] },  // 高危工具 HITL
});
```

### 分阶段路线

| 阶段 | 内容 | 验证点 |
|------|------|--------|
| P0 | 控制台确认：AI gateway 开通 + 模型启用 + FlexDB 可用性 + 体验版资源包 | `DescribeEnvPostpayPackage` / 控制台 AI+ 页面 |
| P1 | 独立 POC 服务（不在现有 NestJS 里）：OAK + local sandbox + 一个知识库 MCP，跑通"提问→检索→回答" | 流式事件完整、无 CLI 崩溃 |
| P2 | 会话存储决策：FlexDB vs 自实现 CynosDB driver（建议后者） | 多用户隔离实测（userId + threadId） |
| P3 | 集成 minicare：业务 MCP（查喂养/生长记录，按 userId 过滤）+ 小程序对话页 | 全链路 |

### 必须绕开的坑（一句话版）

1. **不要用默认 sandbox 配置**（会走 AGS 内部镜像）→ 显式 `provider: 'local'`
2. **不要依赖 `session.database='mysql'`**（未实现）→ 自实现 driver 或 FlexDB
3. **Dockerfile 要带 Claude CLI 二进制**，且确保 `/tmp` 可写（CLAUDE_CONFIG_DIR）
4. **体验版套餐 2026-09-29 到期**——POC 前先确认 AI 资源包在套餐内，否则直接升级或自备模型端点

---

## 附录：源码审读清单

| 文件 | 审读结论 |
|------|---------|
| `src/public/create-agent.ts`（1834 行） | 核心：session 生命周期、HITL、client-tool、getHistory 聚合 |
| `src/runtime/agent-builder.ts`（853 行） | AgentConfig→Claude SDK options 翻译；env 注入、MCP 合并、权限模式 |
| `src/runtime/credential-factory.ts` | 网关 URL/APIKey 派生（硬编码 tcloudbasegateway.com） |
| `src/session-store/drivers/cloudbase-db-driver.ts` | FlexDB 4 集合实现；分页/限额逻辑 |
| `src/sandbox/local-runtime-sandbox.ts` | local 工作目录派生（tmpdir/envId/userId/conversationId） |
| `src/sandbox/ags-stateful-sandbox.ts` | **内部 dev 镜像 + 硬编码 roleArn（生产不可用证据）** |
| `src/adapters/acp-stream-adapter.ts` | SDK 消息→ACP session/update 翻译（前端对接协议） |
| `HANDOVER.md`（45KB） | 凭证规范、已知限制、分布式 HITL 设计 |
| `SANDBOX-STATUS.md` | 沙箱现状：无快照、shared 模式无物理隔离 |
