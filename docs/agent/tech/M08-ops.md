# M8 · 接入层与部署（技术方案）

> 模块：M8 ｜ 状态：规划中 ｜ 优先级：P0（接入通道是全部模块的前置）

## 1. 目标与范围

- minicare-server 新增 `src/agent/` 薄代理模块（SSE 对话透传 + 日记 REST 透传 + health）；
- minicare-agent 内部 token 中间件 + ctx 注入 + /health /diag；
- env 清单、Dockerfile、CloudRun 部署、监控打点。

## 2. minicare-server 代理模块（src/agent/）

```
minicare-server/src/agent/
├── agent.module.ts      # 注册 AgentController + AgentService
├── agent.controller.ts  # POST /api/agent/chat(SSE) / /api/agent/diary/* / GET /api/agent/health
└── agent.service.ts     # fetch 转发（SSE 帧级透传 / REST JSON 透传）
```

### 2.1 鉴权链（复用现有，零新增）

```
JwtGuard → FamilyMemberGuard → baby 归属校验（body.babyId ∈ family 的 baby_profile）
→ 参数校验（class-validator：familyId/babyId UUID、message 非空、images 数组、model 枚举）
→ 注入 x-agent-ctx: base64({ userId, familyId, babyId }) 转发
```

- 归属校验：`SELECT id FROM baby_profile WHERE id=? AND family_id=?`（family 层已有方法复用）；
- 权限最小化：RoleGuard 不额外收紧（家庭成员均可问，与 US-05 一致）。

### 2.2 SSE 帧级透传（/chat）

```ts
// agent.service.ts（核心）
async proxyChat(res, body, ctx) {
  const upstream = await fetch(`${AGENT_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agent-token': AGENT_INTERNAL_TOKEN, 'x-agent-ctx': ctx },
    body: JSON.stringify({ conversationId: body.conversationId ?? randomUUID(), message: body.message, images: body.images, model: body.model }),
  })
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.flushHeaders()
  const reader = upstream.body.getReader()      // 字节流转发，不解析不缓存
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(decoder.decode(value, { stream: true }))
    }
  } catch (e) { res.write(`event: error\ndata: ${JSON.stringify({ message: 'upstream closed' })}\n\n`) }
  finally { res.end() }
}
```

- 客户端断连：`res.on('close', () => reader.cancel())` abort 上游；
- conversationId 未传时由 **NestJS 生成**（randomUUID，UUID 严格校验见 TECH-006 风险 5）；
- 超时：上游 60s 无数据则 abort（防止模型卡死悬挂）。

### 2.3 REST 透传（/api/agent/diary/*）

- `POST /save` `GET /detail?babyId=&date=` `GET /list?babyId=&month=` `PUT /:id` `POST /:id/photos`；
- 与 /chat 相同的鉴权链；body 校验后原样转发，响应 JSON 原样回传；
- 不做业务解析（日记业务在 agent 侧，见 M5 tech）。

### 2.4 语音转写复用

- 对话页语音转写沿用现有记录场景的语音接口（TECH-001），**不经过 agent 代理**，由小程序直接调现有接口转文字后走文本对话（见 M1 tech 4）。

## 3. minicare-agent 内部接入

### 3.1 internal-token 中间件

```js
// middleware/internal-token.js
export function internalToken(req, res, next) {
  const ok = req.get('x-agent-token') && timingSafeEqual(req.get('x-agent-token'), process.env.AGENT_INTERNAL_TOKEN)
  if (!ok) return res.status(401).json({ error: 'unauthorized' })
  try {
    req.ctx = JSON.parse(Buffer.from(req.get('x-agent-ctx'), 'base64').toString())
    // ctx 结构校验：userId/familyId/babyId 均为 UUID 格式
    next()
  } catch { res.status(400).json({ error: 'bad ctx' }) }
}
```

- 所有路由（/chat /diary*）前置该中间件；/health 放行（探活），/diag 仅允许内部或加 token。

### 3.2 ctx 注入会话与工具

- `startSession({ userId: ctx.userId, conversationId })`；
- 工具执行时从 `req.ctx` 取 babyId 注入（模型不可见，见 M3 tech）。

> ⚠️ **2026-08-23 P0 修正**：OAK 0.1.1 `resume` 在此环境不可用，
> agent **按请求构建**（`buildAgent(config, history)`，历史注入 systemPrompt），
> 每次请求 `startSession({ conversationId: randomUUID() })`（新 session 规避 resume bug）；
> 会话上下文由 `lib/history.js`（FlexDB `agent_chat_history`）自管。
> `/chat` 的 `conversationId` 仍为线程标识（历史存取键）。

## 4. 环境变量清单

**minicare-agent**（CloudRun 控制台，部署不重置）：

| 变量 | 必填 | 说明 |
|---|---|---|
| DEEPSEEK_API_KEY | 是 | DeepSeek API Key |
| AGENT_INTERNAL_TOKEN | 是 | 与 minicare-server 同值强随机串 |
| DB_HOST / DB_PORT / DB_NAME | 是 | CynosDB |
| DB_USER / DB_PASS | 是 | 只读账号（GRANT SELECT） |
| TCB_SECRET_ID / TCB_SECRET_KEY | 是 | FlexDB 会话（client-tool 硬依赖） |
| TCB_ENV_ID | 是 | minicare-cloud-6gqledlle0132cbe |
| MODEL_DEFAULT / MODEL_VISION | 否 | flash / deepseek-v4-flash-vision-exp |
| KNOWLEDGE_TOP_K / EMBEDDING_MODEL | 否 | 5 / hunyuan-embedding |
| PORT / OAK_DEBUG | 否 | 3000 / 调试 |

**minicare-server**（追加）：`AGENT_BASE_URL`（agent 内网地址）、`AGENT_INTERNAL_TOKEN`（同值）。
⚠️ 部署 minicare-server 时**不得**在 serverConfig.EnvParams 传入 env（会整体替换已有配置致 JWT_SECRET 失效，见 AGENTS.md）。

## 5. Dockerfile 与部署

- 沿用 TECH-006 v2.0 2.7：node:20-slim（非 alpine）、多阶段、`USER oak`（非 root，CLI 硬性要求）、`TZ=Asia/Shanghai`、`CLAUDE_CONFIG_DIR=/tmp/oak-claude`；
- 部署：`echo "n" | tcb cloudrun deploy -s minicare-agent --port 3000 --force -e minicare-cloud-6gqledlle0132cbe`；
- P4 起用 TCR 镜像方案 A（秒级部署/回滚）。

## 6. 可观测性

- `/health`：`{ status, service:'minicare-agent', ready, model, vision, flexdb, db }`（DB/FlexDB 联通探活，缺 key 时 ready=false 不崩溃）；
- `/diag`：CLI 二进制/ldd/写目录/env 诊断（DEEPSEEK_API_KEY masked）；
- chat 打点：stdout JSON `{ ts, userId, events, ms, lastEventType, tokens }`；
- 业务计数：diary_save / diary_generate / vision_ok / vision_fail（供对账与质量观察）。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 代理断流/悬挂 | 上游 60s 无数据 abort；客户端断连 cancel；done/error 事件透传 |
| 内部 token 泄露 | 强随机 + 定期轮换；CloudRun 内网服务发现，仅 /health 可公网探测 |
| ctx 篡改 | HTTPS 内网 + token 校验 + ctx 结构 UUID 格式校验（middleware 内） |
| env 误配 | 部署脚本不传 EnvParams；env 变更走控制台滚动更新 |
