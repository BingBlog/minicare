# minicare-agent · OAK 最小 POC（DeepSeek + 知识库工具 + 多用户会话）

> 状态：**P0~P3 全部完成**（2026-08-23，P0 基础服务 + P1 知识库 + P2 数据/日记 + P3 小程序对话/日记页）
> 模型方案：**DeepSeek 官方 API（Anthropic 兼容端点）**——已实测可用
> 关联调研：[TECH-005-oak-source-analysis.md](../docs/tech/TECH-005-oak-source-analysis.md)
> 生产方案：[TECH-006-minicare-agent-plan.md](../docs/tech/TECH-006-minicare-agent-plan.md)（v2.0）

## 验证结论

| 项 | 结果 |
|----|------|
| OAK + DeepSeek 出流（文本） | ✅ 通过（`deepseek-v4-flash` / `deepseek-v4-pro`，**直接传真实模型名**） |
| **OAK + DeepSeek 出流（视觉）** | ✅ **通过（2026-08-23 P0 实测）**：`deepseek-v4-flash-vision-exp` + attachments 传图，图片解读质量高 |
| client-tool 协议（模型调用→宿主执行→回传→基于结果作答） | ✅ 通过（FlexDB 持久化启用后） |
| 多用户会话隔离（userId + UUID conversationId） | ✅ 通过 |
| 知识库工具注入（zod schema + execute） | ✅ 通过 |
| **跨请求会话恢复** | ✅ **通过（自管历史方案）**——⚠️ OAK 0.1.1 `resume` 机制在此环境**不可用**（新一轮 send 返回空流），改用 FlexDB `agent_chat_history` 自管历史 + systemPrompt 注入（见踩坑 8） |
| 无需 CloudBase AI 资源包 | ✅ **模型调用走 DeepSeek，完全不依赖成长计划/Token Credits** |

## 为什么选 DeepSeek（决策记录）

- 成长计划环境（minicare-hunyuan-d3e7r22b4efc18f）属**微信小程序账号体系**，腾讯云侧（tcb CLI / OAK 部署的 CloudRun）无法获取其服务端凭证（实测 `app id does not match`，api_key 类型暂未开放）
- **放弃成长计划路径**，直接用 DeepSeek API（用户提供 key）——零平台依赖、数据出域可控（DeepSeek 官方直连）
- DeepSeek 提供 **Anthropic 兼容端点** `https://api.deepseek.com/anthropic`，Claude CLI（OAK 底层）无需改造直接对接

## 运行

环境区分（`NODE_ENV`，见 `src/lib/env.js`）：

| 环境 | 命令 | env 来源 | 用途 |
|------|------|----------|------|
| development（默认） | `npm run start` | `.env.local`（连 minicare_dev 库 + 本地 Langfuse） | 本地开发联调 |
| production | `npm run start:prod` | **仅环境变量**（CloudRun 容器为控制台 EnvParams；不读任何本地文件，本地可显式注入模拟生产） | 容器运行 / 本地生产演练 |

```bash
# 1. 配置 key（已写入 .env.local，被 .gitignore 保护；模板见 .env.example）
cp .env.example .env.local   # 填入 DEEPSEEK_API_KEY 等

# 2. 本地开发启动（development：自动读 .env.local；凭证优先环境变量，兜底 tcb CLI 登录态）
#    ⚠️ 本地 tcb CLI 临时凭证会过期（tmp secret key expire）——过期后 FlexDB 会话不可用，
#    建议注入 minicare-server/.env.local 的长期 TCB_SECRET_ID/KEY 本地联调
npm run start                 # 服务 :3000，/health /diag /chat(SSE)；AGENT_INTERNAL_TOKEN 需要时前缀注入

# 3. 本地模拟生产（不读 .env.local，全部变量自行注入）
NODE_ENV=production DEEPSEEK_API_KEY=sk-xxx npm run start:prod

# 4. 演示脚本（双用户隔离演示，development 语义）
npm run demo

# 运维 / 观测脚本（自动加载 .env.local，无需手动 source）
npm run deploy        # 部署 minicare-agent 到 CloudRun
npm run deploy:check  # 查询云端部署详情
npm run traces        # 查看最近 trace
npm run traces:stats  # trace 统计
npm run traces:import # FlexDB trace → 本地 Langfuse 导入
```

## 架构（P0 目录分层，TECH-006 §2.2.1）

```
src/
├── server.js              # Express 入口：路由注册 + 鉴权中间件
├── config.js              # env 读取 + 启动校验（缺 key 不崩溃，/health ready=false）
├── agent.js               # createAgent 工厂（按请求构建，历史注入 systemPrompt）
├── middleware/
│   └── internal-token.js  # x-agent-token 校验（timingSafeEqual）+ ctx base64 解析 + UUID 校验
├── routes/
│   ├── chat.js            # POST /chat（SSE：meta/session/tool_call/tool_result/text/done/error）
│   ├── health.js          # GET /health（探活，放行无需 token）
│   └── diag.js            # GET /diag（容器诊断）
├── lib/
│   ├── deepseek.js        # ModelSpec（真实模型名 + Anthropic 端点）
│   ├── flexdb.js          # TCB 凭证封装（env 优先 + auth.json 兜底）
│   ├── history.js         # ⚠️ 自管对话历史（FlexDB agent_chat_history，绕过 OAK resume bug）
│   ├── storage.js         # CloudBase Storage（fileId → 临时 URL）
│   ├── vision.js          # 图片 → OAK attachment（file 类型，base64）
│   ├── sse.js             # SSE 事件发送
│   └── tools/
│       └── search-knowledge.js  # 知识库工具（zod + execute，P1 换混合检索）
└── prompts/
    └── system.js          # systemPrompt（角色/检索先行/护栏/图片规则/历史块）
```

## 关键配置（agent.js）

```js
const agent = createAgent({
  envId: 'minicare-cloud-6gqledlle0132cbe',
  credentials: { secretId, secretKey, sessionToken },  // FlexDB 必需
  model: {
    id: 'deepseek-v4-flash',           // ✅ 2026-08-23 实测：直接传真实模型名，无需白名单映射
    apiBaseUrl: 'https://api.deepseek.com/anthropic',
    apiKey: process.env.DEEPSEEK_API_KEY,
  },
  systemPrompt,  // 含历史块（手动恢复）
  tools: [{ name, description, parameters: zodSchema, execute }],
  cwd: process.cwd(),
})
```

## ⚠️ POC 实测踩坑（务必记录）

1. ~~**模型名必须是 Claude CLI 白名单内的**~~ —— **2026-08-23 已推翻**：当前 SDK（claude-agent-sdk 0.3.x）直接传 `deepseek-v4-flash`/`deepseek-v4-flash-vision-exp` 即可，无白名单校验。POC 当时的 `unrecognized_model` 应属旧 SDK 行为
2. **`session: { enabled: false }` 时 client-tool 链路是坏的**——工具回传依赖 `patchSentinelToolResult` 读写持久化 transcript，必须启用 FlexDB（传 credentials）
3. **client-tool 是"暂停-执行-回传"协议**：模型调用工具 → turn pause → 发出 `client/<toolName>` JSON-RPC REQUEST → 宿主执行 → `session.respondToolUse({ toolUseId, output })` → turn 恢复
4. **Tools 的 parameters 必须是 zod schema**（OAK `ToolDefinition.parameters` 直接透传 SDK 的 `tool()`），不是 JSON Schema
5. **conversationId 必须是 UUID 格式**——Claude CLI 校验，非 UUID 报 `Invalid session ID`
6. 凭证：模型走 `DEEPSEEK_API_KEY`；FlexDB 会话走 CloudBase 凭证（本地读 CLI 登录态，生产环境变量注入）。⚠️ 本地 CLI 登录态是**临时凭证会过期**，过期后 FlexDB/会话持久化失效（`tmp secret key expire`）——本地联调用长期凭证
7. 安装：npm install 用 `--registry=https://registry.npmmirror.com`（默认源可能卡死）；Claude CLI 二进制 325MB 随平台包安装
8. **⚠️ OAK 0.1.1 `resume` 不可用（2026-08-23 P0 实测，0.1.2-beta.0 亦复现）**：新一轮 `session.send()`（isContinuation → `resume: sessionId`）返回空流，CLI 不 spawn。影响：① 同 session 对象第二次 send；② 跨请求按 conversationId 恢复。**绕行方案**：每次请求新建 session（`startSession({conversationId: randomUUID()})`），历史由 `lib/history.js` 从 FlexDB `agent_chat_history` 读取并注入 systemPrompt（最近 20 条）。单轮内 client-tool resume（respondToolUse）不受影响，已验证
9. **图片输入走 OAK attachments 而非自组 image block**：`session.send({ type:'message', content, attachments:[{type:'file', source:Uint8Array, mimeType}] })`，DeepSeek 端点直接接受 base64 图片并正确解读（P0 实测）

## 生产化待办（按 TECH-006 执行计划）

- [x] **P0 基础服务**：目录分层 / token 鉴权 / ctx 注入 / /chat SSE / /health /diag / 视觉链路实测 / server 代理模块 / 会话恢复（自管历史）
- [x] **P0 部署**：CloudRun `minicare-agent` 已上线（版本 002，100% 流量）；EnvParams 五项（DEEPSEEK_API_KEY/TCB 三件套/AGENT_INTERNAL_TOKEN）；`/health` ready=true（⚠️ MinNum=0 冷启动首次请求可能 503）
- [ ] **P0 剩余**：容器内视觉附件链路复测
- [x] **P1 知识库（2026-08-23）**：`lib/db.js` MySQL 只读连接池 + `lib/embeddings.js` TokenHub query 向量化 + `search-knowledge.js` 重写为 hybridSearch（FULLTEXT ngram + 向量余弦 + RRF k=60，topK=5）+ 工具参数扩展（riskLevel/category）+ review 条目过滤（REGEXP，规避 MySQL LIKE `[..]` 字符类）；**精确 Recall@10 = 97.8%（44/45）闸门通过**（`scripts/eval-recall-exact.mjs`）
  - 数据：1586 条已入 dev 库；⚠️ **生产库（minicare-cloud-6gqledlle0132cbe）尚无 knowledge_base 表**，需执行 017 迁移 + 导入 + embedding 拷贝后，云端 EnvParams 补 DB_*/TOKENHUB_API_KEY 并重新部署
- [x] **P2 数据查询、总结与日记（2026-08-23）**：`lib/query.js`（7 维度 × list/sum/avg/count/trend，ctx.babyId 注入）+ `lib/growth.js`（中国 2023 生长参考，与小程序同源）+ `lib/tools/query-baby-data.js` / `analyze-baby-data.js` / `generate-diary.js` 三工具 + 工具注册表（lib/tools/index.js）+ chat 按名分发；迁移 `018_baby_diary.sql`（dev 已执行）；**日记 REST 完成**（minicare-server src/agent/：save/detail/list/update/photos）；**端到端实测**：模型触发 query_baby_data 基于结果作答、日记 upsert 覆盖 id 不变、照片去重、越权 403
- [x] **P3 小程序（2026-08-23）**：对话页 `pages/chat`（SSE 流式/语音/图片/工具状态/来源卡片/日记草稿）+ 日记页 `pages/diary`（按月列表/编辑/配图/重新生成）+ 首页今日日记卡片 + FAB 双入口 + MarkdownText 组件 + 会话本地恢复；automator 走查通过，端到端可用
- [ ] **P4 打磨**：全量知识库 + 医学评审 + 评测 + 监控 + TCR 秒级部署
