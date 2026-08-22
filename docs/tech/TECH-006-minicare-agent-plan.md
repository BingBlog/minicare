# 养娃智能体服务（minicare-agent）设计方案

> 版本：v1.0 ｜ 日期：2026-08-21 ｜ 作者：方案架构
> 基础：POC 已验证技术栈（oak-agent-demo 009）+ minicare-server + minicare-mp + 敏宝知识库调研成果
> 本文档可直接用作方案文档正文。

---

## 0. 决策摘要

| 决策点 | 结论 | 理由 |
|---|---|---|
| 承载形态 | 独立 CloudRun 服务 `minicare-agent`（agent-poc 演进） | 用户已拍板，不集成进 NestJS |
| Agent 框架 | 继续 OAK @cloudbase/open-agent-kernel 0.1.1 | POC 已验证全链路 |
| 模型 | DeepSeek 官方 API（Anthropic 兼容端点），默认 deepseek-v4-flash | 零平台依赖，已验证 |
| 对外入口 | **minicare-server 薄 SSE 代理 `/api/agent/chat`**（复用现有 www.minicare.top 域名与 JWT 体系） | 用户已拍板：不新增小程序 request 域名；鉴权集中在 NestJS 一层 |
| 内部鉴权 | agent 服务**不暴露公网**，仅接受 minicare-server 内部调用，共享 `AGENT_INTERNAL_TOKEN` 验证 | 用户上下文（familyId/babyId/userId）由 NestJS 校验后注入，agent 服务零鉴权逻辑 |
| 健康数据读取 | **直连 CynosDB MySQL 只读账号** | 工具执行需 <1s，避免对 minicare-server 的 HTTP 依赖与冷启动风险 |
| 知识库存储 | CynosDB MySQL 新增 `knowledge_base` 表 + FULLTEXT ngram | 主环境无 PostgreSQL；<500 条规模 |
| 向量检索 | 离线生成 embedding（混元 hunyuan-embedding），运行时内存余弦 | <500 条内存足够；避免引向量库 |
| 混合检索 | FULLTEXT 关键词 + 内存余弦，加权融合，top-k=5 | 医疗术语精确命中 + 语义召回 |
| 对话入口 | 小程序新增 `pages/chat` 分包，SSE 用 `wx.request enableChunked` | 微信小程序无 EventSource |
| 知识库 P1 范围 | 公众号 CMPA 8 篇 + 项目知识库权威材料（源文件解析文本，先核心几份再全量） | 用户已拍板 |

---

## 一、产品方案

### 1.1 产品定位与目标用户

**定位**：「敏宝助手」——面向 0-3 岁食物过敏（尤其牛奶蛋白过敏 CMPA）宝宝家庭的 AI 健康助理。双核心能力：
1. **CMPA 知识问答**：基于公众号科普 + 权威指南条目化知识库，检索增强回答；
2. **自家宝宝数据查询**：按家庭/宝宝维度实时查询喂养、睡眠、生长、尿布、症状等健康记录，回答引用数据来源。

**定位边界**：是"数据私域 + 健康教育助理"，**不是**医疗诊断工具。不替代医生、不开处方、不诊断。

**目标用户**：
- 旺仔爸爸&妈妈公众号读者（CMPA 家庭，已被科普教育过，有强问答需求）；
- minicare 现有注册家庭（已有多维健康数据沉淀，天然可被查询）。

### 1.2 核心功能清单（MVP 范围）

**做：**
- 知识问答（CMPA 相关，检索增强，回答标注来源）
- 健康数据查询（喂养/生长/睡眠/尿布/症状等，按 familyId+babyId 隔离）
- 回答引用来源（知识条目来源 + 数据来源说明）
- 多轮会话（conversationId 线程，FlexDB 持久化，可恢复历史）
- 免责声明（prompt 硬约束 + 前端页脚）

**明确不做（MVP）：**
- 不做 write 类工具（AI 直接写健康记录 → 二期）
- 不做诊断/用药/急救判断输出（只做"建议就医"引导）
- 不做语音对话（沿用现有语音录入路径，不重复造）
- 不做图片/文件/附件
- 不做基于 userMemory 的长期个性化记忆（宝宝画像通过上下文注入）
- 不做会话列表/历史页面（接口预留，UI 二期）

### 1.3 用户故事（典型使用场景）

| # | 用户故事 | 涉及能力 |
|---|---|---|
| US1 | 公众号读者刚知道宝宝确诊 CMPA，问"该喝什么配方奶？深度水解和氨基酸怎么选" | 知识问答 + 来源引用 |
| US2 | 旺仔爸爸问"旺仔上周平均每天喝多少奶？夜奶几次？"，得到基于真实记录的回答 | 健康数据查询 + 数据引用 |
| US3 | 妈妈追问"最近一周大便情况怎么样？有没有血丝"，想确认症状变化 | 健康数据查询（症状/尿布） |
| US4 | 奶奶（家庭成员账号）问"宝宝这两天睡得好吗"，能读到同一家庭宝宝的睡眠记录 | 多成员家庭 + 数据隔离 |
| US5 | 家长描述"宝宝便血、精神不好"，触发 emergency 风险条目 → 强制就医引导 + 免责提示 | 风险分级护栏 |

### 1.4 会话与记忆模型

- **userId** = `family_member.user_id`（JWT `sub`），多用户隔离依据；
- **conversationId** = UUID 线程（Claude CLI 强校验），未传时服务端 `randomUUID()` 生成并在 meta 事件返回；
- **宝宝维度**：每个 conversationId 绑定一个 `(familyId, babyId)`。切换宝宝 = 开新线程。原因：不同宝宝的记录/画像差异大，混合同一线程会污染上下文；
- **上下文注入**：每次会话 `startSession` 时把 familyId/babyId/宝宝档案（出生日期/过敏史）注入 systemPrompt 尾部，模型始终知道自己"在看哪个宝宝"；
- **记忆载体**：FlexDB（OAK 托管，`oak_sessions` 等 4 集合）。不额外建业务记忆表——数据问题实时由 `query_baby_data` 工具取，避免冗余存储。

### 1.5 非功能需求

| 维度 | 要求 |
|---|---|
| 安全-数据隔离 | 会话/数据按 userId+familyId+babyId 三层隔离；agent 服务内重放 FamilyMemberGuard 校验 + baby_profile 归属校验 |
| 安全-密钥 | DEEPSEEK_API_KEY、JWT_SECRET、TCB_SECRET_ID/KEY、DB_PASS 全部 CloudRun 环境变量注入，不落代码/镜像 |
| 安全-最小权限 | MySQL 用**只读账号**（仅 SELECT）；embedding 凭证复用 TCB 主密钥 |
| 合规 | 固定免责声明；不输出诊断性断言；高危词触发就医引导；健康数据按《个保法》最小化留存（会话默认不存业务字段） |
| 性能 | SSE 首字延迟 < 3s（DeepSeek 首 token + 工具 <1s）；知识检索 <500ms；回答完整 |
| 并发 | MVP 进程级单例 agent 串行（OAK 稳定子集）；CloudRun 设 1-2 实例防超卖；FlexDB userId 并发限制已知（暂不用 userMemory） |
| 可观测 | /health + /diag 心跳；chat 请求打点（ms/事件数/token）；stdout JSON 日志 |

---

## 二、技术方案

### 2.1 系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  minicare-mp（Taro 4.2.0 微信小程序）                                │
│  pages/chat（新分包）                                                │
│    ├─ chatApi：POST https://www.minicare.top/api/agent/chat（SSE, enableChunked）│
│    └─ 携带 Authorization: Bearer <JWT>（业务同 token，域名零新增）    │
└───────────────┬──────────────────────────────────────────────┬──────┘
                │ SSE 流式（走现有域名 + JWT）                    │
                ▼                                              │
┌──────────────────────────────────────────┐                   │
│  minicare-server（NestJS 10，www.minicare.top）               │
│  src/agent/（新增薄代理模块）             │                   │
│  · JwtGuard + FamilyMemberGuard + 宝宝校验（现有逻辑复用）     │
│  · POST /api/agent/chat → 校验后注入 userId/familyId/babyId   │
│  · 流式转发到 minicare-agent（内部 token）                    │
│  · 知识库数据管理接口（脚本导入）          │                   │
└───────────────┬──────────────────────────┘                   │
                │ 内部调用（AGENT_INTERNAL_TOKEN，不暴露公网）    │
                ▼                                              │
┌──────────────────────────────────────────┐   ┌────────────────────┐
│  minicare-agent（CloudRun，独立服务）      │   │ DeepSeek API        │
│  OAK + DeepSeek Anthropic                │   │ api.deepseek.com/   │
│  · 无鉴权（信任 NestJS 注入的上下文）       │   │ anthropic           │
│  · search_knowledge 工具（混合检索）        │   └────────────────────┘
│  · query_baby_data 工具（只读 SQL）        │
└──────┬────────────┬──────────────────────┘
       │            │
       ▼            ▼
┌─────────────┐ ┌──────────────────────┐
│ FlexDB NoSQL │ │ CynosDB MySQL         │
│ OAK 会话存储  │ │ · knowledge_base 表   │
│（硬依赖）    │ │ · 健康记录 11 类表     │
└─────────────┘ │ · record_timeline      │
                └──────────────────────┘
```

**鉴权设计（集中式，双层）**：
- **对外层（minicare-server）**：复用现有 `JwtGuard + FamilyMemberGuard + RoleGuard + @CurrentUser()`，在 `agent.controller.ts` 校验 JWT → 成员资格 → 请求体里的 familyId/babyId 归属（`baby_profile.family_id` 匹配），校验通过后把 `{ userId, familyId, babyId }` 作为可信上下文注入转发；
- **内层（minicare-agent）**：不暴露公网（CloudRun 仅内网/或域名但强制 `AGENT_INTERNAL_TOKEN` 头校验），**不做任何业务鉴权**，信任 NestJS 传入的上下文；
- 理由：鉴权单点（NestJS），agent 服务零鉴权逻辑、零 JWT_SECRET 共享；小程序域名/JWT 体系完全不动。

**健康数据读取（直连 MySQL 只读）**：
- 理由：
  1. `query_baby_data` 是"暂停-执行-回传"协议中的同步工具，模型在等结果，要求 <1s 返回；HTTP 调 minicare-server 多一跳且其 CynosDB 有冷启动风险；
  2. 需要的是"按宝宝聚合统计"语义（SUM/AVG/COUNT/趋势），直连 SQL 最自然，不必给 minicare-server 加一堆只读聚合接口；
  3. 隔离校验在 minicare-server 代理层已做（familyId/babyId 已注入），agent 工具按注入的 babyId 查，无越权面。
- 风险与缓解：多一个凭证持有者 → 用**只读 MySQL 账号**（仅 SELECT 权限），DB 凭证走环境变量。

### 2.2 agent 服务设计（agent-poc → minicare-agent）

#### 2.2.1 目录结构

```
minicare-agent/                      # 服务名/目录名（对齐 minicare-server 命名）
├── package.json                     # name: minicare-agent
├── Dockerfile                       # 多阶段 + 非 root + TZ
├── cloudbaserc.json                 # cloudrun.name = "minicare-agent"
├── .npmrc                           # registry=npmmirror
├── src/
│   ├── server.js                    # Express 入口：路由注册 + SSE 基础设施
│   ├── agent.js                     # createAgent 工厂（模型/工具/systemPrompt 组装）
│   ├── config.js                    # env 读取 + 启动校验（缺 key 告警不崩溃）
│   ├── middleware/
│   │   └── internal-token.js        # 校验 AGENT_INTERNAL_TOKEN 头（信任 NestJS 注入）
│   ├── routes/
│   │   ├── chat.js                  # POST /chat（内部接口，SSE）
│   │   ├── health.js                # GET /health
│   │   └── diag.js                  # GET /diag（沿用 POC，去掉凭证明文）
│   ├── lib/
│   │   ├── db.js                    # mysql2 只读连接池（单例）
│   │   ├── deepseek.js              # ModelSpec（白名单模型名 + Anthropic 端点）
│   │   ├── flexdb.js                # TCB credentials 封装
│   │   └── tools/
│   │       ├── search-knowledge.js  # 混合检索工具（zod + execute）
│   │       └── query-baby-data.js   # 健康数据查询工具（zod + execute）
│   └── prompts/
│       └── system.js                # systemPrompt 构造（角色/检索先行/引用/免责/上下文注入）
├── scripts/
│   ├── sync-kb-articles.mjs         # 公众号文章 → knowledge_base 条目化导入
│   ├── import-kb-guidelines.mjs     # 权威指南解析文本 → 条目化导入
│   └── gen-embeddings.mjs           # 混元 embedding 生成/更新
└── test/
    ├── knowledge.recall.test.mjs    # 召回测试集跑分
    └── e2e.http                     # curl 冒烟脚本（带内部 token）
```

**minicare-server 新增 agent 代理模块**（`minicare-server/src/agent/`）：
```
src/agent/
├── agent.module.ts                  # 注册 AgentController + AgentService
├── agent.controller.ts              # POST /api/agent/chat（SSE 代理）+ GET /api/agent/health
└── agent.service.ts                 # fetch 流式转发到 minicare-agent（AGENT_INTERNAL_TOKEN 头）
```
- Controller 复用 `JwtGuard + FamilyMemberGuard`，并校验 body.familyId/babyId 归属（`baby_profile.family_id = familyId`）；
- Service 用 `fetch` 转发到 `AGENT_BASE_URL`（内网地址），流式透传 SSE 帧回小程序（NestJS 用 `res.write` 逐帧转发，不缓存）；
- 说明：agent 服务的 SSE 是"帧级透传"，NestJS 层不解析事件，只做字节流转发，保持低延迟。

#### 2.2.2 API 设计

**对外：POST /api/agent/chat**（minicare-server 代理，小程序唯一入口）
```
Authorization: Bearer <jwt>            // 现有业务 JWT
body: {
  familyId: string(36),                // 必填，成员资格由 NestJS 校验
  babyId:   string(36),                // 必填，归属由 NestJS 校验
  conversationId?: string(36),         // 省略则代理层生成 UUID（服务端统一生成）
  message:   string,                   // 必填
  model?:    'flash' | 'pro'           // 可选，默认 flash
}
```
- 校验顺序（NestJS）：JWT → FamilyMemberGuard → baby 归属 → 参数校验；
- 校验通过后注入 `x-agent-ctx: {userId, familyId, babyId}`（带签名或直接内部 token 通道）转发到 agent 服务；
- **SSE 帧级透传**：NestJS 收到 agent 服务 SSE 后逐帧 `res.write`，不解析不缓存。

**对内：POST /chat**（minicare-agent，仅接受内部 token）
```
x-agent-token: <AGENT_INTERNAL_TOKEN>
x-agent-ctx:   base64({ userId, familyId, babyId })   // NestJS 注入的可信上下文
body: { conversationId?, message, model? }            // 不含 familyId/babyId（来自 ctx）
```
- agent 服务校验 token 后，从 ctx 解出 userId/familyId/babyId 注入会话与工具；
- 工具内部**不再校验归属**（已由 NestJS 保证），但按 ctx 的 babyId 查询，杜绝模型乱传参数越权。

SSE 事件协议（在 POC 基础上补充 meta/sources 事件，两端一致）：
```
event: meta        data: { conversationId, familyId, babyId, model }
event: session     data: { started: true, t_ms }
event: tool_call   data: { name, input }          // 工具开始
event: tool_result data: { name, output }         // 工具结果摘要
event: text        data: { delta }                // 流式增量（可能有多个）
event: sources     data: { sources: [{ type:'knowledge'|'record', title, source, id }] }
event: done        data: { events, ms, model }
event: error       data: { message }
```
- `conversationId` 生成：`randomUUID()`（严格 UUID 格式，Claude CLI 校验）；代理层若未传则在 NestJS 生成并透传。

**GET /health**（agent 服务）：`{ status, service:'minicare-agent', ready, model, flexdb: bool, db: bool }`（DB/FlexDB 联通探活）。minicare-server 的 `/api/agent/health` 做透传。

**GET /diag**：沿用 POC 的 CLI/权限/ldd 诊断；**去除 DEEPSEEK_API_KEY 明文泄漏**（已 masked），新增 `db`/`flexdb` 联通诊断。

**会话列表/历史**（GET /conversations、/conversations/:id/history）：**二期再做**，接口预留。

#### 2.2.3 工具集设计

**工具 1：search_knowledge**（知识库混合检索）
```ts
// zod schema
z.object({
  query: z.string().describe('检索关键词/自然问题，如"深度水解配方选择"'),
  riskLevel: z.enum(['low','caution','emergency']).optional(),  // 可选风险过滤
  category: z.string().optional(),                              // 可选分类过滤
})
// 返回（JSON 字符串）
{ found: true, items: [{ id, kbId, title, category, content, source, score }], topK }
// 或 { found: false, message: '知识库未找到相关内容' }
```

**工具 2：query_baby_data**（健康数据查询，MVP 只读）
```ts
z.object({
  metric: z.enum(['feeding','sleep','diaper','growth','health','symptom','activity']),
  days: z.number().int().min(1).max(90).optional().default(7),  // 时间窗（天）
  aggregate: z.enum(['list','sum','avg','count','trend']).optional().default('list'),
})
// 返回（JSON 字符串）
{ ok: true, metric, days, rows: [...], summary: {...}, note: '数据来自 feeding_record 等表' }
```
SQL 示例（喂养汇总 trend）：
```sql
SELECT DATE(record_time) d,
       SUM(CASE WHEN feed_type='formula' THEN formula_ml ELSE 0 END) total_ml,
       SUM(CASE WHEN feed_type='breast' THEN duration_min ELSE 0 END) total_breast_min,
       COUNT(*) cnt
FROM feeding_record
WHERE baby_id = ? AND record_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
GROUP BY DATE(record_time) ORDER BY d;
```
- **babyId 不暴露给模型**：由服务端从 `x-agent-ctx` 注入（NestJS 已校验归属），工具内部直接使用 ctx 的 babyId 查询，模型无从越权；
- 全部走只读账号 SELECT，拒绝 union/子查询外的写入。

**工具 3（二期）**：`create_record`（write 类），二期按现有 DTO 校验回写。

#### 2.2.4 systemPrompt 设计要点

```
你是「敏宝助手」……（角色）
【当前上下文】familyId=xx babyId=xx 宝宝旺仔 出生2025-12-28 轻度CMPA   ← 来自 x-agent-ctx
1. 检索先行：涉及知识/护理问题，必须先用 search_knowledge，结果到手后直接给出完整回答，
   禁止"正在检索/请稍候"话术；
2. 数据引用：涉及"我家/旺仔/这周奶量/睡眠"等自身数据问题，先 query_baby_data，
   回答必须说明数据来源（如"来自 6/1-6/7 的喂养记录"）；
3. 来源标注：知识类回答末尾标注来源（公众号文章/指南名），未检索到 → "知识库未收录，建议咨询医生"；
4. 免责：涉及医疗判断附"本回答仅供参考，不能替代专业医疗建议"；emergency 风险条目必须给就医引导；
5. 边界：不诊断、不开处方、不输出绝对结论；用简体中文，亲切专业。
```

#### 2.2.5 会话持久化（FlexDB）

- 沿用 OAK 托管集合：`oak_sessions` / `oak_session_entries` / `oak_session_summaries` / `oak_session_messages`（已验证）；
- 硬依赖：`createAgent({ envId, credentials: { secretId, secretKey } })`，**不配 credentials 时 client-tool 回传失效（模型只会"请稍候"）**——启动时显式校验并打印 warning，/health 报 ready=false；
- `startSession({ userId, conversationId })`：userId=JWT sub（来自 ctx），conversationId=UUID；
- 多家庭/多宝宝隔离：隔离在**系统提示注入（ctx）+ 工具参数约束（babyId 服务端注入）**层面完成，不改变 session key 结构（保持 userId 维度即可）。

### 2.3 知识库设计

#### 2.3.1 MySQL 表结构

```sql
-- migration: 014_knowledge_base.sql
CREATE TABLE IF NOT EXISTS `knowledge_base` (
  `id`             CHAR(36)      NOT NULL,
  `kb_id`          VARCHAR(32)   NOT NULL COMMENT '条目ID，如 KB-A1-001',
  `module`         VARCHAR(8)    NOT NULL COMMENT 'A-H 模块',
  `title`          VARCHAR(200)  NOT NULL,
  `category`       VARCHAR(50)   NOT NULL COMMENT '过敏常识/配方选择/辅食等',
  `content`        MEDIUMTEXT    NOT NULL,
  `keywords`       VARCHAR(500)  NULL COMMENT '逗号分隔关键词（FULLTEXT 用，替代 JSON）',
  `source`         VARCHAR(200)  NOT NULL COMMENT '来源（公众号文章标题/指南名）',
  `source_url`     VARCHAR(500)  NULL,
  `evidence_level` VARCHAR(20)   NULL COMMENT 'guideline/consensus/RCT/policy/edu',
  `region`         VARCHAR(8)    NULL COMMENT 'cn/intl/both',
  `risk_level`     VARCHAR(10)   NOT NULL DEFAULT 'low' COMMENT 'low/caution/emergency',
  `applicable_age` VARCHAR(16)   NULL,
  `embedding`      BLOB          NULL COMMENT 'float32 向量（应用层生成，离线）',
  `status`         TINYINT       NOT NULL DEFAULT 1 COMMENT '1=active 2=archived',
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kb_id` (`kb_id`),
  KEY `idx_kb_category` (`category`),
  KEY `idx_kb_risk` (`risk_level`),
  FULLTEXT KEY `ft_kb_ngram` (`title`, `content`, `keywords`) WITH PARSER ngram
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='敏宝知识条目库';
```
- **FULLTEXT ngram**：innodb 默认 token 大小 2，中文分词够用；ngram 中文无需分词器。
- **keywords 用逗号分隔 VARCHAR** 而非 JSON，原因：FULLTEXT 不能直接索引 JSON 列。

#### 2.3.2 数据来源与条目化流程

| 来源 | 位置 | 条目化方式 | 优先级 |
|---|---|---|---|
| 公众号 CMPA 科普 8 篇 | `docs/wechat-articles/*.md` | 解析 YAML frontmatter（title/tags/category/disclaimer）+ 按小节切知识条目，risk_level 大多 low/caution | P1 先做 |
| 权威指南解析文本（19 份） | `docs/敏宝知识库/源文件解析文本/*.txt` | 按《Agent知识库建设方案》P0 流程清洗→条目化→元数据标注（evidence_level/region/age）；**P1 先导入核心 3-4 份（CMPA 诊治/配方选择/辅食添加），其余 P4 全量** | P1 核心 + P4 全量 |

条目化字段映射示例（公众号文章）：
```
frontmatter.title → title
frontmatter.tags  → keywords（join ","）
category 由文章 category 字段 + 章节标题人工归类
source = 文章标题, source_url = 公众号文章链接, evidence_level='edu', risk_level 按内容定
kb_id 暂用 Wx-NN-N（NN=文章序号，N=条目序号），后续与 KB 清单编号对齐
```

#### 2.3.3 混合检索实现

```
hybridSearch(query, topK=5):
  1) 关键词路：SELECT id,kb_id,title,content,source,
        MATCH(title,content,keywords) AGAINST(? IN NATURAL LANGUAGE MODE) AS score
     FROM knowledge_base WHERE status=1
        AND MATCH(title,content,keywords) AGAINST(? IN NATURAL LANGUAGE MODE)
     ORDER BY score DESC LIMIT 20
  2) 向量路：进程启动时一次性加载全部 active 条目的 embedding（<500条，内存 <2MB），
     对 query 现算 embedding（混元，~100ms）→ 余弦相似度 → top 20
  3) 融合：RRF（k=60）两路合并，或 score = 0.5*归一化(fts) + 0.5*cosine
     （推荐 RRF，免调参、稳定）
  4) 元数据过滤：risk_level/category（工具可选参数）
  5) topK 截断返回（含 source/score，供前端渲染来源）
```

**embedding 选型（推荐）**：腾讯云混元 `hunyuan-embedding`（经 tencentcloud-sdk-nodejs，复用 `TCB_SECRET_ID/KEY`）。
- 理由：DeepSeek 无官方 embedding 端点；bge-m3 自托管过重；混元中文医学语义可靠且与现有腾讯云凭证体系一致；
- 只在离线脚本中调用（`scripts/gen-embeddings.mjs`），运行时不做 embedding 推理（查询时对 query 单独 embedding 一次，可缓存）；
- **运行时内存向量**：知识量 <500 条阶段直接用内存余弦，0 额外基础设施；二期平滑迁 CloudBase PostgreSQL+pgvector 或腾讯云 VectorDB（Hybrid Search），仅改 `search-knowledge.js` 的检索实现 + embedding 落库方式。

**阈值与演进**：
- <500 条：内存余弦（当前方案）；
- 500-5000 条：向量落 MySQL BLOB + 应用层批量余弦仍可行，或直接上 pgvector；
- >5000 条 / 需要在线更新：迁移 PostgreSQL+pgvector 或 VectorDB。

### 2.4 部署与运维

#### 2.4.1 CloudRun 服务拓扑

| 服务 | 说明 | 命名 |
|---|---|---|
| minicare-agent | 生产 agent 服务（内网/内部 token，不暴露公网对话） | `minicare-agent`（替代 oak-agent-demo） |
| minicare-agent-staging | 灰度/联调（可选） | `minicare-agent-staging` |
| minicare-api-production | 不动，**新增 src/agent/ 代理模块** | 现状 |
| TCR 镜像 | `ccr.ccs.tencentyun.com/tcb-100000765682-hevn/...` 待密码 | 方案 A |

#### 2.4.2 Dockerfile 优化要点

```
# 关键点（在 agent-poc 基础上增强）
FROM node:20-slim AS build          # ⚠️ 必须 debian-slim，勿换 alpine
                                    #（Claude CLI 平台包为 glibc，musl 不兼容）
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund

FROM node:20-slim                   # runtime 阶段（多阶段，减小体积）
COPY --from=build /app/node_modules ./node_modules
COPY src ./src
RUN useradd -m -u 1001 oak && mkdir -p /tmp/oak-claude && chown -R oak:oak /app /tmp/oak-claude
ENV NODE_ENV=production TZ=Asia/Shanghai CLAUDE_CONFIG_DIR=/tmp/oak-claude \
    PORT=3000 HOME=/home/oak
USER oak
EXPOSE 3000
CMD ["node", "src/server.js"]
```
- 非 root（`USER oak`）是硬性要求：Claude CLI 拒绝 root 下 `--dangerously-skip-permissions`；
- 多阶段构建：runtime 层只拷 node_modules + src，构建层缓存 package-lock 命中率提升；
- `TZ=Asia/Shanghai` + `process.env.TZ` 双保险（对齐 minicare-server main.ts）。

#### 2.4.3 生产环境变量清单

**minicare-agent**（CloudRun）：

| 变量 | 必填 | 说明 |
|---|---|---|
| DEEPSEEK_API_KEY | 是 | DeepSeek API Key |
| AGENT_INTERNAL_TOKEN | 是 | 内部调用令牌（与 minicare-server 共享，任意强随机串） |
| DB_HOST / DB_PORT / DB_NAME | 是 | CynosDB（与 minicare-server 同一实例） |
| DB_USER / DB_PASS | 是 | **只读账号**（GRANT SELECT） |
| TCB_SECRET_ID / TCB_SECRET_KEY | 是 | FlexDB 会话（client-tool 硬依赖） |
| TCB_ENV_ID | 是 | minicare-cloud-6gqledlle0132cbe |
| PORT | 否 | 默认 3000 |
| OAK_DEBUG | 否 | 调试用 |
| KNOWLEDGE_TOP_K | 否 | 默认 5 |
| EMBEDDING_MODEL | 否 | 默认 hunyuan-embedding |
| MODEL_DEFAULT | 否 | flash/pro 路由 |

**minicare-server**（追加，CloudRun 控制台）：

| 变量 | 必填 | 说明 |
|---|---|---|
| AGENT_BASE_URL | 是 | agent 服务内网地址（如 http://minicare-agent:3000 或内网 IP） |
| AGENT_INTERNAL_TOKEN | 是 | 与 agent 服务同值的内部令牌 |

#### 2.4.4 TCR 镜像方案 A 落地

1. `docker build -t ccr.ccs.tencentyun.com/tcb-100000765682-hevn/ca-kuzdngfx_oak-agent-demo:minicare-agent-v0.1 .`
2. `docker login`（待仓库密码就绪）
3. `docker push ...`
4. `tcb cloudrun service update -e <envId> -s minicare-agent --image <镜像>`（或控制台）
- 收益：秒级部署/回滚，绕开云端构建 10-15 分钟；env 变更仍走控制台滚动更新。

#### 2.4.5 监控

- **健康**：CloudRun 探活 GET /health（ready = agent 就绪 + DB/FlexDB 联通）；
- **诊断**：手动 GET /diag（CLI 二进制/ldd/写目录/env），排查启动故障；
- **日志**：chat 请求打印 `userId/events/ms/lastEvent`；工具执行打点；stdout 由 CloudRun 收集；
- **Token 用量**：日志记录每轮 usage（模型侧返回的 token 数，输出到结构化日志），DeepSeek 控制台对账；
- **评测**：`scripts/eval-recall.mjs` 跑 `docs/敏宝知识库/召回测试集-种子50题.md`，上线前必须达标。

### 2.5 小程序对话页设计

#### 2.5.1 分包结构

```
minicare-mp/src/pages/chat/
├── index.tsx           # 对话页（消息列表 + 输入框 + 流式渲染）
├── index.config.ts     # navigationBarTitleText: '敏宝助手'
└── index.scss
```
`app.config.ts` subPackages 追加：
```ts
{ root: 'pages/chat', pages: ['index'] },
```
入口：TabBar FAB 弹出菜单（`GLOBAL_FAB_GROUPS`）新增「问敏宝助手」项，或首页 QuickActions 增加入口。

#### 2.5.2 SSE 消费方案（Taro 4 / 微信小程序）

**结论：用 `wx.request({ enableChunked: true })` + `onChunkReceived` 手写 SSE 解析。**

- 微信小程序**无 EventSource**，`wx.request` 自基础库 2.20.1 支持 `enableChunked`（真机生效，模拟器降级为一次性完整响应）；
- Taro 4.2 的 `Taro.request` 未完整声明 `enableChunked` 类型 → 用类型断言透传：
```ts
// src/api/sse.ts 核心
const task = Taro.request({
  url: `${AGENT_BASE_URL}/chat`,
  method: 'POST',
  data: { familyId, babyId, conversationId, message },
  header: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
  enableChunked: true,          // 透传 wx.request 能力
  responseType: 'text',
  success: (res) => { /* 模拟器/降级路径：整体解析 SSE 文本 */ },
}) as any
task.onChunkReceived?.((res) => {
  // res.data 为 ArrayBuffer → 按 \n\n 分帧解析 event:/data: 行
  parseSSEFrames(bytesToString(res.data), handlers)
})
```
- **同一解析器**同时处理 chunk 流与完整响应（降级路径），保证两端一致；
- 增量事件：`text` 事件 append 到当前气泡；`tool_call` 显示"正在查询知识库/正在读取宝宝数据..."；`sources` 渲染来源卡片；`done` 结束；`error` 提示；
- **域名零新增**：Base URL 沿用现有 `TARO_APP_API_BASE_URL`（dev 127.0.0.1:3001 / prod https://www.minicare.top），路径 `/api/agent/chat`——微信 request 合法域名无需新增配置。

#### 2.5.3 UI 要点

- 消息气泡（用户/助手左右布局）、流式打字效果、加载态；
- 知识来源引用卡片（可点击展开来源详情）与数据来源说明条；
- 固定底部免责声明"AI 回答仅供参考，不能替代专业医疗建议"；
- 顶部上下文条显示当前宝宝（旺仔 出生 2025-12-28）；
- 对话页挂 TabBar（复用现有组件，activeTab 传 chat）保证导航一致。

### 2.6 风险与对策（POC 踩坑 → 生产预防）

| # | 风险/踩坑 | 生产对策 |
|---|---|---|
| 1 | 模型名必须 Claude CLI 白名单 id（claude-sonnet-4-20250514），传 deepseek-v4-flash 报 unrecognized_model | config.js 固定白名单 id + 注释；网关不校验模型名实际路由 DeepSeek（已验证）；pro 路由映射在 P4 验证 |
| 2 | `session:{enabled:false}` 时 client-tool 链路坏（patchSentinelToolResult 依赖持久化 transcript） | 启动强制校验 TCB_SECRET_ID/KEY，缺失打印 ERROR 并让 /health ready=false |
| 3 | client-tool 是暂停-执行-回传协议 | 统一在 routes/chat.js 封装工具分发，所有工具走同一 respondToolUse 回传路径 |
| 4 | 工具 parameters 必须 zod schema | 每个工具定义集中 tools/ 目录，review 时检查 z.object |
| 5 | conversationId 必须 UUID | 服务端统一 randomUUID()，请求体校验 /^[0-9a-f-]{36}$/ |
| 6 | 非 root 必须（CLI 拒绝 root） | Dockerfile USER oak 固化 + CI 检查 |
| 7 | npm 源卡死 | .npmrc 固定 npmmirror |
| 8 | 云端构建慢（10-15min） | TCR 镜像方案 A 秒级部署 |
| 9 | FlexDB userId 并发限制 / get 100 条上限 | 暂不用 userMemory；长会话分页（预留） |
| 10 | 本地沙箱模型可执行宿主 Shell | tools:[] 关闭内置 Bash/Read/Write；cwd 指向专用只读目录 |
| 11 | DeepSeek 429/配额 | 指数退避重试（工具层） + 前端降级提示 |
| 12 | MySQL 冷启动（Serverless） | agent 进程启动时预热连接池（同 database.module.ts 做法），只读账号连接 |
| 13 | embedding 现算延迟 | 离线生成 + 进程缓存；query embedding 结果 LRU 缓存 |
| 14 | 医疗合规 | risk_level=emergency 强制就医引导；输出侧固定免责；评审入库（P4） |
| 15 | agent 服务被绕过直连（内部 token 泄露） | token 强随机 + 定期轮换；CloudRun 走内网服务发现（不暴露公网域名）；仅 /health 可公网探测 |
| 16 | NestJS 代理 SSE 断流/超时 | 代理层设置请求超时 + 客户端断连时 abort 上游；透传 done/error 事件；NestJS 侧 `res.flushHeaders` 保证首帧即时 |
| 17 | ctx 注入被篡改 | x-agent-ctx 走 HTTPS 内网 + token 校验；ctx 结构固定（userId/familyId/babyId 均为 UUID 格式校验） |

---

## 三、执行计划

### 3.1 阶段规划

#### P0 基础服务（目标：agent-poc → 生产骨架 + 代理入口）
- 任务：
  1. 建 `minicare-agent` 目录，按 2.2.1 结构拆分代码（config/agent/routes 分层）
  2. 内部 token 中间件 + ctx 注入（x-agent-token / x-agent-ctx）
  3. /chat 增强：conversationId 服务端生成、meta/sources 事件、模型路由
  4. **minicare-server 新增 `src/agent/` 代理模块**（JwtGuard + 成员/宝宝校验 + SSE 帧级透传）
  5. Dockerfile 多阶段 + env 清单 + TZ + 非 root
  6. CloudRun 部署 `minicare-agent`，/health /diag 验证；minicare-server 部署代理
- 验收：curl 带 JWT 经 `/api/agent/chat` 流式完整回答；非法 familyId 403；断会话可恢复；/health ready；无 token 直连 agent 服务 401
- 工作量：3-4 人日（含代理模块）
- 依赖：无

#### P1 知识库（目标：knowledge_base 表 + 混合检索工具）
- 任务：
  1. 迁移 SQL：014_knowledge_base.sql（FULLTEXT ngram）
  2. `sync-kb-articles.mjs`：解析 8 篇公众号文章 → 条目化入库
  3. `import-kb-guidelines.mjs`：**P1 导入核心权威材料 3-4 份**（CMPA 诊治/配方选择/辅食添加），其余 P4 全量
  4. `gen-embeddings.mjs`：混元 embedding 生成并落库
  5. search_knowledge 工具：RRF 融合 + top-k + 内存向量加载
  6. systemPrompt 检索先行/引用来源规则落地
- 验收：50 题召回测试集 Recall@10 ≥ 90%；问 CMPA 问题回答带来源；空库场景正确降级
- 工作量：5-6 人日（含指南核心份数清洗）
- 依赖：P0

#### P2 健康数据（目标：query_baby_data 工具 + 数据隔离）
- 任务：
  1. mysql2 只读连接池 + 启动预热
  2. 只读 DB 账号创建（控制台/MCP，GRANT SELECT）
  3. query_baby_data 工具（6 类 metric + 聚合 + trend，babyId 从 ctx 注入）
  4. 端到端测试：问"旺仔上周奶量"→ 返回真实聚合 + 数据来源说明
- 验收：数据查询准确；越权（其他家庭 babyId）被拒；回答含来源
- 工作量：2-3 人日
- 依赖：P0

#### P3 小程序对话页（目标：端内可用对话入口）
- 任务：
  1. `pages/chat` 分包 + app.config.ts 注册
  2. `src/api/sse.ts`（enableChunked + SSE 解析 + 降级）
  3. chatApi 封装（JWT + familyId/babyId 上下文，**Base URL 复用现有，无域名新增**）
  4. 对话页 UI（气泡/流式/来源卡片/免责/宝宝上下文条）
  5. TabBar 或首页入口
- 验收：真机端到端对话；流式渲染流畅；模拟器降级可用；来源卡片可点
- 工作量：3-4 人日
- 依赖：P0（可与 P1/P2 并行开发，联调串行）

#### P4 打磨上线（目标：质量达标 + 监控 + 全量内容）
- 任务：
  1. 权威指南 19 份解析文本全量条目化 + 元数据标注（证据级别/风险分级）→ 全量入库
  2. 知识条目医学评审（主治医师抽审 10%）
  3. 召回评测全量跑分（50 题 + 高危场景演练）
  4. 错误处理/超时/退避重试完善；日志打点与 token 统计
  5. TCR 镜像方案 A 落地（秒级部署/回滚）
  6. 公众号文章导流 + 用户反馈闭环（"不准确/不相关"反馈回流修订）
- 验收：评测达标（关键信息完整率 100%、幻觉率 0、高危护栏 100%）；监控可看；一键回滚演练通过
- 工作量：3-4 人日
- 依赖：P1 + P2 + P3

### 3.2 总体里程碑表

| 里程碑 | 内容 | 预估 | 出口标准 |
|---|---|---|---|
| M0（P0） | 基础服务 + 代理入口上线 | 3-4 人日 | 鉴权/SSE/会话全通 |
| M1（P1） | 知识库 + 混合检索 | 5-6 人日 | 召回评测达标 |
| M2（P2） | 健康数据查询 | 2-3 人日 | 数据隔离 + 引用 |
| M3（P3） | 小程序对话页 | 3-4 人日 | 真机可用 |
| M4（P4） | 打磨上线 | 3-4 人日 | 评测通过 + 监控就绪 |
| 合计 | 全量 MVP | 16-21 人日 | 可对外发布 |

关键路径：P0 → P1 → P4（内容全量）；P3 可并行。整体 MVP 约 3-4 周（按 0.5 人力）。

### 3.3 已确认决策点（2026-08-21）

1. **对外入口**：✅ 走现有域名代理（minicare-server `/api/agent/chat` 薄 SSE 代理），不新增小程序 request 域名；
2. **知识库 P1 范围**：✅ 公众号 8 篇 + 项目知识库权威材料（P1 先核心 3-4 份，P4 全量 19 份）；
3. **会话历史**：✅ 二期再做（接口预留，UI 不做）。
4. **上线前置（用户侧待办）**：TCR 个人版登录密码（方案 A 秒级部署）；只读 MySQL 账号创建（或授权 agent 用现有账号读）；AGENT_INTERNAL_TOKEN 生成与注入。
