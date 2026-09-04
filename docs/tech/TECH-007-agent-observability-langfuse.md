# TECH-007 — Agent 观测能力方案（Langfuse + FlexDB）

> 状态：已实施并验收通过（2026-08-30）
> 背景：agent 链路（agent-poc，OAK + DeepSeek）已跑通，但数据查询类问题回答准确率不高，
> 缺乏对执行过程的可观测性：无法看到模型实际调了哪些工具、工具返回了什么、每轮 LLM 输出了什么。
> 目标：构建 agent 观测能力，记录 **用户问题 / LLM 调用与返回 / tools 调用** 全链路。

## 0. 实施踩坑（Docker Desktop 代理注入）

- **Docker Desktop 会向所有容器注入 `HTTP_PROXY=http://127.0.0.1:7890`**（宿主 Clash 代理），
  容器内 127.0.0.1 不可达 → minio-init 的 `mc alias set` 失败、bucket 实际没建成，
  Langfuse ingestion 报 "Region is missing" / "bucket does not exist"，且报错与真实原因相去甚远。
  修复：init 容器显式清空代理变量（见 compose `langfuse-minio-init.environment`）。
- **`langfuse/langfuse:3` 新版镜像没有 `packages/worker/dist/index.js`**，worker 的
  command 覆盖会崩；应改用独立镜像 `langfuse/langfuse-worker:3`（无 command 覆盖）。
- 本地部署必须显式配置 `LANGFUSE_S3_EVENT_UPLOAD_REGION: auto`（MinIO 场景）。
- 导入脚本靠事件 ID 幂等：重复导入不会产生重复数据，仅会覆盖同名字段。

## 1. 总体架构

```
小程序 → minicare-server → agent-poc（CloudRun / 本地 :3000）
                              │
                              ├─ lib/telemetry.js 埋点（Langfuse 数据模型兼容，纯内存组装）
                              │        │  异步写（不阻塞对话）
                              │        ▼
                              └─ FlexDB 集合 agent_traces  ← 线上持久层（唯一事实源）
                                       │  本地导入脚本 scripts/langfuse-import.mjs（手动/可定期跑）
                                       ▼
                              本地 Langfuse（docker-compose v3，web 映射 127.0.0.1:3100）
                                       └─ Traces UI：trace → generations（LLM 轮次）+ spans（工具调用）
```

设计要点：

- **为什么经 FlexDB 中转，而不直连 Langfuse**：本地 Langfuse 在家庭网络内，CloudRun 无法回推；
  FlexDB 已是 agent 会话的存储层，复用凭证与连接方式，零新增基础设施。
- **agent 服务零新增依赖**：埋点不引入 langfuse SDK，只是把 Langfuse 数据模型
  （trace / generation / span）以 JSON 形态写入 FlexDB；导入端再做协议转换。
- **数据主权**：对话内容（含宝宝健康数据）只落在自有 FlexDB 与本地 Langfuse，不出域。

## 2. 埋点数据模型（Langfuse 兼容）

一次 `/chat` 请求 = 一条 trace，FlexDB `agent_traces` 集合文档结构：

```jsonc
{
  "traceId": "uuid",                // = 请求级随机 UUID，Langfuse trace id
  "sessionId": "uuid",              // = conversationId，Langfuse 中按会话聚合
  "userId": "13146989718",
  "name": "agent-chat",
  "input":  { "message": "...", "images": 1 },
  "output": "最终回答文本",
  "metadata": {
    "model": "deepseek-v4-flash",
    "familyId": "...", "babyId": "...",
    "historyCount": 12,             // 注入 systemPrompt 的历史条数
    "totalMs": 8421, "eventCount": 47,
    "forceFinished": false,         // 是否被看门狗强制收尾（idle 30s / 总 55s）
    "toolCalls": [{ "name": "query_baby_data", "count": 1 }],
    "error": null
  },
  "tags": ["agent-chat", "deepseek-v4-flash"],
  "status": "completed",            // running | completed | error | timeout
  "observations": [                 // 时间序：LLM 轮次 + 工具调用
    {
      "id": "uuid",
      "type": "generation",         // LLM 轮次（主流一轮 / 每次 tool resume 一轮）
      "name": "llm-turn-1",
      "startTime": 0, "endTime": 3200,
      "model": "deepseek-v4-flash",
      "output": "该轮累积输出的文本",
      "usage": { "total_tokens": 1830 },   // OAK usage_update（input+output 合计）
      "level": "DEFAULT"
    },
    {
      "id": "uuid",
      "type": "span",               // 工具调用：tool_call → tool_result
      "name": "query_baby_data",
      "startTime": 3200, "endTime": 3500,
      "input":  { /* 模型传入的工具参数 */ },
      "output": "{ /* 工具返回 JSON */ }",
      "level": "DEFAULT",           // 超限未执行=WARNING，异常=ERROR + statusMessage
      "statusMessage": null
    }
  ],
  "startedAt": 1756..., "endedAt": 1756...,
  "importedAt": null                // 导入 Langfuse 后回填，防止重复导入
}
```

### 埋点点位（`routes/chat.js`，SSE 协议不变）

| # | 时机 | 动作 |
|---|------|------|
| 1 | 请求进入、历史读取后 | 创建 recorder，**立即写 `status=running`**（进程崩溃也留有部分数据） |
| 2 | `session.send` 主流开始 | `startGeneration('llm-turn-N')` |
| 3 | 流内 `usage_update` 事件 | 记入当前 generation 的 token 用量 |
| 4 | `client/<tool>` JSON-RPC 请求 | 结束当前 generation → `startSpan(toolName, params)` |
| 5 | 工具执行完成 | `endSpan(output)`；超限未执行 level=WARNING；执行异常 level=ERROR |
| 6 | `respondToolUse` resume 流开始 | 新的 `startGeneration`（正式回答所在轮次） |
| 7 | done / error / finally | `finish()`：回填 output / error / status，最终写 FlexDB |

工具循环防护、pendingText 缓存等既有修复逻辑**不受影响**——埋点只旁路记录，不参与答案组装。

### 已知约束（接受）

- OAK `usage_update` 只提供 input+output token **合计**，无拆分（OAK 0.1.x 限制）。
- **client-tool 模式下主流首轮（llm-turn-1）无独立 usage**：usage 随 resume 流（正式回答轮）
  汇总产出（实测 2026-08-30，turn-2 tokens≈22k 为全轮累计），turn-1 的 usage 字段为空属协议特性。
- LLM 的原始请求 prompt 不落库：prompt 由 systemPrompt（含历史）+ 用户消息组成，trace.metadata
  已记录 historyCount，且 systemPrompt 在代码中版本化；记录原始 prompt 收益低、体积大。
  如后续需要，可加 `TRACE_INCLUDE_PROMPT=1` 开关。
- 工具执行中间态（如 SQL）由工具自身返回 JSON 承载，一并记录在 span.output 中。

## 3. 本地 Langfuse 部署

- 位置：`agent-poc/langfuse/docker-compose.yml`（基于官方 v3 compose，本地评估用途）
- 组件：langfuse-web + langfuse-worker + Postgres + ClickHouse + Redis + MinIO
- **web 端口映射 `127.0.0.1:3100`**（避开 agent-poc 本地服务的 :3000）
- 密钥（NEXTAUTH_SECRET / SALT / ENCRYPTION_KEY）本地随机生成，不入库
- 首次启动：浏览器打开 http://localhost:3100 注册账号 → 建 Organization/Project →
  Project Settings 创建 API Key（pk-lf-… / sk-lf-…）→ 写入 `agent-poc/.env.local`：

```
LANGFUSE_HOST=http://localhost:3100
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

## 4. 导入脚本（`scripts/langfuse-import.mjs`）

- 读取 FlexDB `agent_traces`：默认 `importedAt == null`，支持 `--from/--to`、`--limit`、`--dry-run`
- 转换为 Langfuse **legacy ingestion batch**（`POST /api/public/ingestion`，
  Basic Auth = pk:sk）：每条 trace 拆 `trace-create` + N 个 `span-create`/`generation-create`，
  observations 时间戳由相对 ms 换算为 ISO 绝对时间
- 成功后回填 `importedAt`；单 trace 一次 POST（远小于 3.5MB 批量上限）
- 说明：legacy ingestion 端点在自托管 v3 稳定可用（Langfuse Cloud 将于 2026-11 移除、
  自托管升级 v4 时移除）；届时切换为 OTel 端点或官方 SDK，转换逻辑集中在此脚本，改动面可控

## 5. 降级与开关

- FlexDB 写入失败仅 `console.warn`，**绝不影响对话链路**（与 history.js 同策略）
- 环境开关 `TRACE_TELEMETRY=off` 时 recorder 为 no-op（完全关闭埋点）
- 查询/清理：FlexDB 按需脚本处理，Langfuse UI 支持 trace 级删除

## 6. 验收标准

1. 本地起服务，用测试账号（13146989718）发一条数据查询问题（会触发工具调用）
2. FlexDB `agent_traces` 出现完整 trace：input=message、output=回答、
   generation 含 token 用量、span 含工具 input/output
3. 启动本地 Langfuse，跑导入脚本，UI 中可见该 trace 及 observation 树，时间线/耗时正确
4. 断网/关闭 FlexDB 凭证场景：对话功能不受影响（仅日志告警）

## 7. 涉及文件

| 文件 | 动作 |
|------|------|
| `agent-poc/src/lib/telemetry.js` | 新增：trace recorder（内存组装 + FlexDB 落库） |
| `agent-poc/src/routes/chat.js` | 修改：按 §2 点位接入 recorder（SSE 协议不变） |
| `agent-poc/scripts/langfuse-import.mjs` | 新增：FlexDB → Langfuse 导入 |
| `agent-poc/langfuse/docker-compose.yml` | 新增：本地 Langfuse v3 栈（web :3100） |
| `agent-poc/.env.local` | 追加 LANGFUSE_* （首次部署后手工填入） |
