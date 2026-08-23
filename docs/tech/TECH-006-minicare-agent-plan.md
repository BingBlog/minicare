# 养娃智能体服务（minicare-agent）设计方案 v2.0

> 版本：v2.0 ｜ 日期：2026-08-22 ｜ 作者：方案架构
> 对齐：PRD-003《养娃智能体「敏宝助手」V1.0》（12 个用户故事 / 5 阶段）
> 基础：POC 已验证技术栈（oak-agent-demo 009）+ minicare-server + minicare-mp + 敏宝知识库调研成果
> **v2.0 变更摘要**：新增每日日记（baby_diary 表 + 生成/编辑/配图）、图片问诊（视觉模型 deepseek-v4-flash-vision-exp）、语音输入（复用 TECH-001 链路）、一键周报/月报（analyze 工具）、会话保留策略（最近 20 条）、生长曲线解读（中国 2023 参考数据）；知识库迁移编号修正 014→**017**（014/015 被医疗记录占用、016 被 timeline_backfill 占用）。
> **v2.0 增补（2026-08-22）**：知识库解析层切换 MinerU 云端 pipeline（vlm 丢数字实测结论），新增数字校验门禁与图片三层策略；详情见 docs/agent/tech/M02-knowledge.md。
> **v2.0 增补（2026-08-23）**：切块定稿为**自研实现**（LlamaIndex ElementNodeParser 不兼容 MinerU HTML 表格），向量化接入 **TokenHub Kinfra**（混元老平台停止新购），20 份源文件全部入库，精确 Recall@10 = 97.8% 达标；详情见 minicare-kb/docs/ARCHITECTURE.md。

---

## 0. 决策摘要

| 决策点 | 结论 | 理由 |
|---|---|---|
| 承载形态 | 独立 CloudRun 服务 `minicare-agent`（agent-poc 演进） | 用户已拍板，不集成进 NestJS |
| Agent 框架 | 继续 OAK @cloudbase/open-agent-kernel 0.1.1 | POC 已验证全链路 |
| 文本模型 | DeepSeek 官方 API（Anthropic 兼容端点），默认 deepseek-v4-flash | 零平台依赖，已验证 |
| 视觉模型 | **deepseek-v4-flash-vision-exp**（图片问诊，用户拍板） | Anthropic 端点 image block 支持 + CLI 白名单映射需 P0 实测（风险 13） |
| 语音输入 | **复用现有语音录入链路**（TECH-001：RecorderManager 录音 + 后端腾讯云 ASR 转文字），仅输入，回复为文字 | 用户拍板；TTS 二期 |
| 对外入口 | minicare-server 薄代理 `/api/agent/chat`（SSE）+ `/api/agent/diary/*`（REST），复用现有域名与 JWT | 不新增小程序 request 域名；鉴权集中 NestJS |
| 内部鉴权 | agent 服务不暴露公网，仅接受 minicare-server 内部调用，共享 `AGENT_INTERNAL_TOKEN` | 上下文由 NestJS 校验后注入 |
| 健康数据读取 | 直连 CynosDB MySQL 只读账号 | 工具执行需 <1s，避免 HTTP 依赖与冷启动 |
| 知识库存储 | CynosDB MySQL 新增 `knowledge_base` 表（迁移 **017**）+ FULLTEXT ngram | 主环境无 PostgreSQL；<500 条规模 |
| 日记存储 | CynosDB MySQL 新增 `baby_diary` 表（迁移 **018**），每天一篇、永久保留 | 日记需持久化回看与编辑 |
| 向量检索 | 离线 embedding（混元 hunyuan-embedding），运行时内存余弦 | <500 条内存足够 |
| 混合检索 | FULLTEXT 关键词 + 内存余弦，RRF 融合，top-k=5 | 医疗术语精确命中 + 语义召回 |
| 对话入口 | 小程序 `pages/chat` 分包（SSE enableChunked）+ `pages/diary` 分包 | 微信小程序无 EventSource |
| 会话保留 | FlexDB 持久化；历史永久保留，会话列表/恢复仅取**最近 20 条** | 用户拍板；FlexDB get 上限兜底 |
| 周报/月报 | 对话页「一键周报/月报」按钮 → 预置消息触发 analyze 工具（7/30 天窗口） | 用户拍板；无需新接口 |
| 生长曲线 | analyze 工具内置中国 2023 儿科生长参考（P3-P97，与小程序同源）输出百分位 | 用户拍板；复用已有数据 |
| 知识库 P1 范围 | 公众号 CMPA 8 篇 + 项目知识库权威材料（先核心 3-4 份再全量） | 用户已拍板 |

---

## 一、产品方案（对齐 PRD-003）

### 1.1 产品定位与目标用户

**定位**：「敏宝助手」——面向 0-3 岁食物过敏（尤其 CMPA）宝宝家庭的 AI 健康助理。四大核心能力：
1. **CMPA 知识问答**：检索增强回答，标注来源；
2. **自家宝宝数据查询与总结**：喂养/睡眠/生长等实时查询、趋势解读、跨维度总结（含生长曲线百分位），支持一键周报/月报；
3. **图片问诊**：上传宝宝照片（皮疹/大便等），AI 看图 + 知识库分级判断；
4. **每日日记**：基于当天记录（含图片）+ 对话内容 + 捕捉的生活事件，生成温情日记，可编辑、配图、永久回看。

**定位边界**：数据私域 + 健康教育助理，**不是**医疗诊断工具。不替代医生、不开处方、不诊断。

**目标用户**：公众号 CMPA 读者家庭 + minicare 现有注册家庭。

### 1.2 MVP 功能清单（对齐 PRD-003 12 故事）

| 阶段 | 故事 | 能力 |
|---|---|---|
| 一 进入对话 | US-01 | 对话页（文字/语音输入、宝宝上下文、切换=新会话） |
| 二 知识问答与图片问诊 | US-02 / US-03 | 检索增强问答（来源标注）/ 图片问诊（视觉模型 + 分级） |
| 三 健康数据查询 | US-04 / US-05 | 自然语言数据查询（时间窗解析）/ 多成员家庭共享与隔离 |
| 四 总结分析与每日日记 | US-06 / US-07 / US-08 / US-09 | 趋势解读 / 跨维总结（一键周报/月报 + 生长曲线）/ 日记生成 / 日记编辑配图 |
| 五 会话与护栏 | US-10 / US-11 / US-12 | 多轮会话与恢复（最近 20 条）/ 风险分级护栏 / 回答反馈 |

### 1.3 会话与记忆模型

- **userId** = `family_member.user_id`（JWT sub）；**conversationId** = UUID 线程（服务端生成）；
- **宝宝维度**：每个 conversationId 绑定 (familyId, babyId)，切换宝宝 = 开新线程；
- **上下文注入**：startSession 时把 familyId/babyId/宝宝档案（出生日期/过敏史）注入 systemPrompt；
- **记忆载体**：FlexDB（OAK 托管 4 集合）；数据问题实时取，不建业务记忆表；
- **会话保留**：历史永久保留；会话列表/恢复仅取最近 20 条（服务端查询 limit 20）。

### 1.4 非功能需求（对齐 PRD-003 第 5 节）

安全：三层隔离（userId/familyId/babyId）+ babyId 服务端注入；密钥环境变量；MySQL 只读账号。
合规：免责声明固定；不诊断；emergency 强制就医引导；日记（含照片）仅家庭成员可见。
性能：SSE 首字 <3s；知识检索 <500ms；图片问诊首字 <5s（含图片传输）。
并发：MVP 进程级单例串行；CloudRun 1-2 实例。
可观测：/health + /diag；chat 打点；token 日志对账。

---

## 二、技术方案

### 2.1 系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  minicare-mp（Taro 4.2.0 微信小程序）                                │
│  pages/chat（对话页）pages/diary（日记页）                            │
│  · chatApi：POST /api/agent/chat（SSE, enableChunked）                │
│  · diaryApi：/api/agent/diary/*（REST）                               │
│  · 语音：RecorderManager 录音 → 转写（复用 TECH-001 链路）            │
│  · 图片：压缩 → COS 直传（复用 storage/upload-url）                   │
│  · 携带 Authorization: Bearer <JWT>（域名零新增）                     │
└───────────────┬──────────────────────────────────────────────┬──────┘
                │ SSE 流式 / REST JSON                          │
                ▼                                              │
┌──────────────────────────────────────────┐                   │
│  minicare-server（NestJS 10，www.minicare.top）               │
│  src/agent/（薄代理模块）                 │                   │
│  · JwtGuard + FamilyMemberGuard + 宝宝校验（复用）             │
│  · POST /api/agent/chat → SSE 帧级透传（含图片 fileID）        │
│  · /api/agent/diary/* → REST 透传（日记 CRUD/配图）            │
│  · 语音转写接口（现有，TECH-001）          │                   │
└───────────────┬──────────────────────────┘                   │
                │ 内部调用（AGENT_INTERNAL_TOKEN，不暴露公网）    │
                ▼                                              │
┌──────────────────────────────────────────┐   ┌────────────────────┐
│  minicare-agent（CloudRun，独立服务）      │   │ DeepSeek API        │
│  OAK + DeepSeek（文本 + vision）          │──▶│ api.deepseek.com/   │
│  · 无鉴权（信任 NestJS 注入的上下文）       │   │ anthropic           │
│  · search_knowledge / query_baby_data     │   │ (flash / pro /      │
│  · analyze_baby_data / generate_diary     │   │  vision-exp)        │
│  · 日记 REST：POST/GET/PUT /diary         │   └────────────────────┘
│  · 图片素材缓存（会话内当天 fileID 列表）   │
└──────┬────────────┬──────────────────────┘
       │            │
       ▼            ▼
┌─────────────┐ ┌──────────────────────┐
│ FlexDB NoSQL │ │ CynosDB MySQL         │
│ OAK 会话存储  │ │ · knowledge_base 表   │
│（硬依赖）    │ │ · baby_diary 表(018)  │
│             │ │ · 健康记录 11 类表     │
└─────────────┘ │ · record_timeline      │
                └──────────────────────┘
```

**鉴权设计（双层，不变）**：对外层 minicare-server 复用 JwtGuard + FamilyMemberGuard + baby 归属校验，注入 `{ userId, familyId, babyId }` 为可信上下文；内层 agent 服务仅校验 `AGENT_INTERNAL_TOKEN`，零业务鉴权。

**健康数据读取**：直连 CynosDB 只读账号（GRANT SELECT），工具按 ctx.babyId 查询，<1s 返回。

### 2.2 agent 服务设计

#### 2.2.1 目录结构（minicare-agent/）

```
minicare-agent/
├── package.json / Dockerfile / cloudbaserc.json / .npmrc
├── src/
│   ├── server.js                    # Express 入口：路由注册 + SSE 基础设施
│   ├── agent.js                     # createAgent 工厂（模型/工具/systemPrompt 组装）
│   ├── config.js                    # env 读取 + 启动校验（缺 key 告警不崩溃）
│   ├── middleware/internal-token.js # 校验 AGENT_INTERNAL_TOKEN 头
│   ├── routes/
│   │   ├── chat.js                  # POST /chat（内部接口，SSE，含图片）
│   │   ├── diary.js                 # POST/GET/PUT /diary（日记 CRUD + 配图）
│   │   ├── health.js / diag.js      # 探活与诊断
│   ├── lib/
│   │   ├── db.js                    # mysql2 只读连接池（单例，预热）
│   │   ├── deepseek.js              # ModelSpec（真实模型名 + Anthropic 端点 + vision 支持）
│   │   ├── flexdb.js                # TCB credentials 封装
│   │   ├── history.js               # 自管会话历史（FlexDB agent_chat_history，绕过 OAK resume bug）
│   │   ├── vision.js                # 图片 → OAK attachment（file 类型，base64）
│   │   ├── growth.js                # 中国 2023 生长参考（P3-P97）百分位查询
│   │   ├── diary-store.js           # baby_diary 表读写
│   │   └── tools/
│   │       ├── search-knowledge.js  # 混合检索工具
│   │       ├── query-baby-data.js   # 健康数据查询工具
│   │       ├── analyze-baby-data.js # 趋势/总结/生长曲线工具
│   │       └── generate-diary.js    # 日记素材聚合工具
│   └── prompts/system.js            # systemPrompt 构造（角色/检索先行/引用/免责/日记/图片规则）
├── scripts/
│   ├── sync-kb-articles.mjs / import-kb-guidelines.mjs / gen-embeddings.mjs
│   └── eval-recall.mjs
└── test/  (knowledge.recall.test.mjs / e2e.http)
```

#### 2.2.2 API 设计

**对外（minicare-server 代理，小程序唯一入口）**：

```
POST /api/agent/chat          SSE 对话（body: familyId/babyId/conversationId?/message/images?/model?）
GET  /api/agent/health        健康透传
GET  /api/agent/diary/list?babyId=&month=&page=   日记列表（按日期倒序）
GET  /api/agent/diary/detail?babyId=&date=        某天日记
POST /api/agent/diary/save    { babyId, diaryDate, content, photoIds? }  保存/覆盖（每天一篇，覆盖前前端确认）
PUT  /api/agent/diary/:id     { content?, photoIds? }  编辑（文字/图片）
POST /api/agent/diary/:id/photos  { photoIds }  补图（配图上传复用 COS 直传，仅传 fileID 列表）
```

- 校验顺序（NestJS）：JWT → FamilyMemberGuard → baby 归属 → 参数校验 → 注入 `x-agent-ctx`（base64{userId,familyId,babyId}）转发；
- SSE 帧级透传（不解析不缓存）；REST 透传 JSON；
- `images`: 图片直传 COS 后携带 `[{ fileId, mimeType }]`（服务端拉取/转码组装 image block，见 2.8）。

**对内（minicare-agent，仅内部 token）**：

```
POST /chat   body: { conversationId?, message, images? , model? } + x-agent-token + x-agent-ctx
GET  /health  { status, ready, model, vision, flexdb, db }
GET  /diag
POST /diary/save  / GET /diary  / PUT /diary/:id  / POST /diary/:id/photos
```

SSE 事件协议（v1.0 基础上补充 `diary` 事件）：
```
event: meta        data: { conversationId, familyId, babyId, model }
event: session     data: { started: true, t_ms }
event: tool_call   data: { name, input }
event: tool_result data: { name, output }
event: text        data: { delta }
event: sources     data: { sources: [...] }
event: diary       data: { draft: string, date }   // 日记草稿（生成完成事件）
event: done        data: { events, ms, model }
event: error       data: { message }
```

**会话列表（二期 UI，本期接口预留）**：GET /conversations?limit=20 —— FlexDB 会话索引按 userId 查最近 20 条。

#### 2.2.3 工具集设计（4 个工具）

**工具 1：search_knowledge**（不变，v1.0）
```ts
z.object({ query: string, riskLevel?: 'low'|'caution'|'emergency', category?: string })
// 返回 { found, items: [{ id, kbId, title, category, content, source, score }], topK }
```

**工具 2：query_baby_data**（不变，v1.0）
```ts
z.object({ metric: enum(feeding|sleep|diaper|growth|health|symptom|activity),
           days: int 1-90 默认7, aggregate: enum(list|sum|avg|count|trend) 默认list })
// babyId 由服务端从 x-agent-ctx 注入，模型无从越权；全部 SELECT 只读
```

**工具 3：analyze_baby_data**（新增：趋势/跨维总结/生长曲线，服务周报月报）
```ts
z.object({
  scope: z.enum(['trend','summary','growth']),       // 趋势 / 跨维总结 / 生长曲线
  days: z.number().int().min(1).max(90).optional().default(7),
  metrics: z.array(z.enum([...7类])).optional(),      // 缺省全部维度
})
// 返回 { ok, scope, days, dimensions: [{ metric, summary, keyNumbers }],
//        anomalies: [{ date, metric, desc }],        // 异常点（含疑似误录标注）
//        growth: { weight: {p50,p75,...}, height: {...} } | null,  // growth 时
//        note: '数据来自 xx 记录' }
```
- 生长曲线：`lib/growth.js` 内置中国 2023 儿科生长参考（P3-P97，与小程序 `growth-standards` 同源），按宝宝月龄输出体重/身高百分位区间；
- 周报/月报按钮 = 前端预置消息"生成最近 7/30 天总结"，模型据此调用 analyze（scope=summary）。

**工具 4：generate_diary**（新增：日记素材聚合）
```ts
z.object({ date: z.string().describe('YYYY-MM-DD，默认今天') })
// 宿主侧聚合返回（模型不可见 babyId）：
// { ok, date, records: { metric, summary, keyNumbers }[],        // 当天记录概览
//   photos: [{ fileId, source: 'record'|'chat' }],               // 当天记录图片 + 当天对话图片
//   chatEvents: string[] }                                       // 当天对话捕捉的生活事件（宿主从会话上下文提取）
// 模型基于素材输出日记正文（温情叙事），不编造数据；事件缺失可引导用户补充
```
- **生活事件捕捉**：会话上下文中模型自主识别（地点/活动类描述），生成日记时引用；误记风险由"素材中不含 → 模型不编造"约束 + 用户编辑兜底；
- **持久化**：模型输出草稿 → `event: diary` 返回前端 → 用户预览/编辑 → 前端调 `POST /api/agent/diary/save`（覆盖当天旧日记需二次确认）。

#### 2.2.4 systemPrompt 设计要点（v2.0 扩展）

```
你是「敏宝助手」……（角色）
【当前上下文】familyId/babyId/宝宝档案（出生日期/过敏史）
1. 检索先行：知识/护理问题必须先 search_knowledge，结果到手直接完整作答，禁止"正在检索"话术；
2. 数据引用：涉及自家数据先 query_baby_data，回答说明数据来源；
3. 来源标注：知识回答标来源；未收录 → "知识库未收录，建议咨询医生"；
4. 免责：医疗判断附免责；emergency 强制就医引导（高护栏）；
5. 图片问诊规则：收到图片必须解读（视觉模型已注入），图片无法判断 → 明示并引导文字描述，不编造；
6. 总结分析：周报/月报/趋势用 analyze_baby_data，输出含数据依据；生长维度给百分位区间；
7. 日记规则：用户要求写日记时调用 generate_diary 取素材，输出温情叙事正文（口语化、像家长写的日记）；
   数据部分严格来自素材；生活事件只写素材中出现或对话中用户提过的；当天素材不足可提示；
8. 边界：不诊断、不开处方、不输出绝对结论；简体中文，亲切专业。
```

#### 2.2.5 会话持久化（FlexDB，v2.0 补充）

- 沿用 OAK 托管 4 集合；`createAgent({ envId, credentials })` 硬依赖（client-tool 回传需要）；
- `startSession({ userId, conversationId })`；userId=JWT sub；
- **保留策略**：历史永久保留；会话列表/恢复查询 `limit 20`（FlexDB get 上限兜底）；更早会话不可恢复，前端提示开新会话；
- 多家庭/多宝宝隔离：ctx 注入 + babyId 服务端注入（不变）。

### 2.3 知识库设计（迁移号修正 014→017）

#### 2.3.1 表结构（017_knowledge_base.sql）

```sql
-- ⚠️ 编号修正：014/015 被医疗记录占用、016 被 timeline_backfill 占用，知识库迁移为 017
CREATE TABLE IF NOT EXISTS `knowledge_base` (
  `id`             CHAR(36)      NOT NULL,
  `kb_id`          VARCHAR(32)   NOT NULL COMMENT '条目ID，如 KB-A1-001',
  `module`         VARCHAR(8)    NOT NULL COMMENT 'A-H 模块',
  `title`          VARCHAR(200)  NOT NULL,
  `category`       VARCHAR(50)   NOT NULL COMMENT '过敏常识/配方选择/辅食等',
  `content`        MEDIUMTEXT    NOT NULL,
  `keywords`       VARCHAR(500)  NULL COMMENT '逗号分隔关键词（FULLTEXT 用）',
  `source`         VARCHAR(200)  NOT NULL,
  `source_url`     VARCHAR(500)  NULL,
  `evidence_level` VARCHAR(20)   NULL COMMENT 'guideline/consensus/RCT/policy/edu',
  `region`         VARCHAR(8)    NULL COMMENT 'cn/intl/both',
  `risk_level`     VARCHAR(10)   NOT NULL DEFAULT 'low',
  `applicable_age` VARCHAR(16)   NULL,
  `embedding`      BLOB          NULL COMMENT 'float32 向量（离线生成）',
  `status`         TINYINT       NOT NULL DEFAULT 1 COMMENT '1=active 2=archived',
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_kb_id` (`kb_id`),
  KEY `idx_kb_category` (`category`), KEY `idx_kb_risk` (`risk_level`),
  FULLTEXT KEY `ft_kb_ngram` (`title`,`content`,`keywords`) WITH PARSER ngram
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='敏宝知识条目库';
```

#### 2.3.2 数据来源与条目化（2026-08-23 更新：MinerU 云端 pipeline + 自研切块 + TokenHub 向量）

**解析层（已完成前置）**：MinerU 云端精准解析 API（`file-urls/batch` 本地上传，`model_version=pipeline` + `language=ch`），产物存 `docs/敏宝知识库/minerU解析版本/{国内,国际}/<文档名>/`（每份：`<文档名>.md` + `*_content_list.json`[bbox+page_idx] + `images/`）。
- ⚠️ **引擎必须用 pipeline 而非 vlm**：实测 vlm 对双栏医学期刊剂量数字识别不稳定（严重过敏共识 9 处数字丢失）；pipeline 文字层保真（仅 1 处真缺失）。

**切块层（自研，2026-08-23 定稿）**：`minicare-kb/chunking/pipeline.py`（~170 行）——标题层级修复（`## 一、`→h2 / `## （一）`→h3，含 HTML 无前缀标题推断）→ 表格抽取独立成块（`<table>` HTML 全文，占位符 `[[TABLE_n]]`）→ 章节/子节切块（header_path 继承）→ 超长章节（>1200 字符）按段落降级。行为对齐 LlamaIndex NodeParser 思路；初版曾选 LlamaIndex，实测其 ElementNodeParser 不兼容 MinerU 单行 HTML 表格故自研；31 个 pytest 锁定。差距（后续按效果补齐）：无 overlap / 无父子树 / 表格无 LLM 摘要。

**向量化（TokenHub）**：混元老平台已停止新购 → 腾讯大模型服务统一走 **TokenHub**（OpenAI 兼容），向量模型 `kinfra-text-embedding-0.6b`（1024 维）。已全量生成 1584 条 embedding。

**导入管线 `kb-pipeline`（minicare-kb 工程）**：chunk（清洗→切块→页码锚定→数字校验→chunks.jsonl）→ import-kb（016→**017** 迁移，knowledge_base 表）→ embed（TokenHub 增量向量化）。数字校验门禁：9 类缺失模式扫描，命中标 review（`[待复核]` 前缀 + risk=caution，不入检索）。

**评测基线**：精确 Recall@10 = **97.8%（45 题）** ≥ 90% 上线门槛；报告 `minicare-kb/docs/RECALL-REPORT.md`。

**图片三层策略**：P0 图注文本化（caption 写入所在块，本期）；P1 视觉模型补描述（deepseek-v4-flash-vision-exp，二期）；P2 多模态向量（不做）。表格走 `table_body` HTML 文本通道，不走图片。

来源范围：公众号 8 篇 P1 + 权威指南核心 3-4 份 P1、全量 19 份 P4（已完成国内 7 + 国际 13 = 20 份解析入库）。

#### 2.3.3 混合检索实现（不变：FULLTEXT + 内存余弦 + RRF，topK=5）

#### 2.3.4 生长曲线数据（新增）

- 来源：中国 2023 儿科生长参考（P3-P97），与小程序内置 growth-standards 同源；
- 形态：`lib/growth.js` 内置常量（按月龄的体重/身高百分位表，约几十 KB），运行时查询，不建表；
- 输出：analyze_baby_data(scope=growth) 返回宝宝当前百分位区间与变化（如 P50→P75）。

### 2.4 每日日记设计（新增，018_baby_diary.sql）

```sql
CREATE TABLE IF NOT EXISTS `baby_diary` (
  `id`          CHAR(36)      NOT NULL,
  `baby_id`     CHAR(36)      NOT NULL,
  `family_id`   CHAR(36)      NOT NULL,
  `diary_date`  DATE          NOT NULL COMMENT '日记归属日期',
  `author_id`   CHAR(36)      NOT NULL COMMENT '最后保存人（family_member.user_id）',
  `content`     TEXT          NOT NULL COMMENT '日记正文（温情叙事）',
  `photo_ids`   VARCHAR(1000) NULL COMMENT '逗号分隔 COS fileID 列表',
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_baby_date` (`baby_id`, `diary_date`),   -- 每天一篇
  KEY `idx_diary_family` (`family_id`, `diary_date`),
  KEY `idx_diary_baby_list` (`baby_id`, `diary_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='宝宝每日日记';
```

**生成流程**：
1. 用户触发"写今天的日记"（对话内或日记页按钮）；
2. agent 调 generate_diary 聚合素材：当天记录概览（query_baby_data 各维度 days=1）+ 当天记录图片 fileID + 当天对话图片 fileID + 当天对话生活事件；
3. 模型输出日记草稿（`event: diary` 流式返回前端）；
4. 前端展示草稿 → 用户可编辑文字/补生活事件/补照片 → `POST /api/agent/diary/save`；
5. 同一天已存在日记 → 返回提示"当天已有日记，覆盖将替换旧内容"→ 用户确认后覆盖（UNIQUE 键 upsert）；
6. 永久保留；删除宝宝档案时级联清理（应用层处理）。

**配图链路**：完全复用现有 COS 直传（storage/upload-url，2026-08-22 已验证：ArrayBuffer + PUT + 5 个签名 header），前端压缩（quality 80 / width 1280）后直传，仅存 fileID；展示时 download-urls 批量取临时 URL。

### 2.5 图片问诊视觉链路（P0 已实测通过）

```
用户拍照/相册 → Taro.compressImage（quality80/1280，≤10MB/张、每轮≤3张）
  → COS 直传（storage/upload-url，复用）→ 得到 fileID
  → chat 请求 images: [{ fileId, mimeType }] + message 文字
  → minicare-server 透传 → minicare-agent
  → lib/vision.js：按 fileID 拉取（getTempFileURL → fetch）→ OAK attachment（file 类型，base64）
  → ModelSpec 使用 deepseek-v4-flash-vision-exp（直接传真实模型名）→ 模型解读
  → 回答走风险分级（US-11）与免责
```

> ✅ **2026-08-23 P0 实测结论**：
> - OAK `session.send({ type:'message', content, attachments:[{type:'file', source:Uint8Array, mimeType}] })`
>   → DeepSeek 端点直接接受 base64 图片并正确解读（无需自组 Anthropic image block）；
> - **模型名白名单映射已废弃**——当前 SDK 直接传 `deepseek-v4-flash-vision-exp` 即可路由；
> - 解读质量高（测试图准确定位 UI 元素）；首字 4-7s（含思考），UI 层加载态缓解；
> - 测试脚本：`agent-poc/scripts/test-vision.mjs`。

### 2.6 语音输入链路（新增，复用 TECH-001）

- 链路（与记录场景语音录入一致）：前端 `Taro.getRecorderManager()` 录音（aac，30s 上限）→ 上传后端 → 腾讯云 ASR 转文字 → 文字回填输入框（可编辑）→ 按文本消息发送；
- 对话页复用 `useVoiceInput` 思路（录音态/波形/超时/取消），不做 NLU 结构化（对话不需要）；
- 权限：麦克风授权失败 → 提示并允许手动输入；
- 转写质量：医疗术语/方言误转由"发送前可编辑"兜底；不引入新后端服务。

### 2.7 部署与运维

#### 2.7.1 CloudRun 服务拓扑（不变：minicare-agent + staging 可选）

#### 2.7.2 Dockerfile（不变：node:20-slim 非 alpine + USER oak + TZ + 多阶段，见 v1.0）

#### 2.7.3 生产环境变量清单（v2.0 更新）

**minicare-agent**：

| 变量 | 必填 | 说明 |
|---|---|---|
| DEEPSEEK_API_KEY | 是 | DeepSeek API Key |
| AGENT_INTERNAL_TOKEN | 是 | 内部调用令牌（与 minicare-server 共享） |
| DB_HOST / DB_PORT / DB_NAME | 是 | CynosDB（同 minicare-server 实例） |
| DB_USER / DB_PASS | 是 | **只读账号**（GRANT SELECT，含 knowledge_base/baby_diary 读） |
| TCB_SECRET_ID / TCB_SECRET_KEY | 是 | FlexDB 会话（client-tool 硬依赖） |
| TCB_ENV_ID | 是 | minicare-cloud-6gqledlle0132cbe |
| MODEL_VISION | 否 | 默认 deepseek-v4-flash-vision-exp（直接传真实模型名，P0 已实测） |
| MODEL_DEFAULT | 否 | 默认 flash |
| KNOWLEDGE_TOP_K / EMBEDDING_MODEL | 否 | 默认 5 / hunyuan-embedding |
| PORT / OAK_DEBUG | 否 | 默认 3000 / 调试 |

**minicare-server（追加）**：AGENT_BASE_URL、AGENT_INTERNAL_TOKEN（不变）；语音转写接口沿用现有配置。

#### 2.7.4 TCR 镜像方案 A（不变，P4 落地）；2.7.5 监控（不变 + 日记/图片打点：diary_save/diary_generate/vision_ok/vision_fail 计数）

### 2.8 小程序端设计（对话页 + 日记页）

#### 2.8.1 分包结构

```
minicare-mp/src/pages/chat/index.tsx    # 对话页（气泡/流式/语音/图片/来源卡片/护栏卡片/周报按钮）
minicare-mp/src/pages/diary/index.tsx   # 日记列表（按日期倒序）
minicare-mp/src/pages/diary/detail.tsx  # 日记详情/编辑（配图上传）
```
`app.config.ts` subPackages 追加两个分包；入口：TabBar FAB 菜单「问敏宝助手」+ 首页 QuickActions「宝宝日记」。

#### 2.8.2 SSE 消费（不变：enableChunked + onChunkReceived 手写解析，同一解析器处理 chunk 流与完整响应降级）

#### 2.8.3 对话页 UI 要点（v2.0 新增）

- 输入区：[图片] [输入消息] [语音] [发送]；
- 语音：长按录音 → 转写回填输入框；
- 图片：压缩直传 COS → 随消息发送（气泡内缩略图，点击放大）；发送中显示上传进度；
- 「一键周报/月报」：输入区上方快捷按钮（周/月），点击预置消息"生成最近 7/30 天总结"；
- 宝宝上下文条、来源卡片、数据来源条、就医引导卡片、固定免责（v1.0 不变）。

#### 2.8.4 日记页 UI 要点

- 列表：按日期倒序卡片（日期 + 首句摘要 + 缩略图），"写日记"按钮；
- 详情：正文 + 图片墙 + 数据摘要条 + [编辑] [重新生成]（覆盖确认弹窗）；
- 编辑：文字编辑 + 生活事件补充 + 相册选图上传（复用 COS）；
- 生成入口：对话页说"写今天的日记" 或 日记页"写日记"按钮。

### 2.9 风险与对策（对齐 PRD-003 14 条）

| # | 风险 | 生产对策 |
|---|---|---|
| 1 | ~~模型名白名单校验~~ **已废弃（2026-08-23 P0 实测）** | 当前 SDK 直接传真实模型名（deepseek-v4-flash / -vision-exp）；config.js 校验必填 key |
| 2 | session 关闭时 client-tool 链路坏 | 启动强制校验 TCB 凭证，缺失 /health ready=false |
| 3 | client-tool 暂停-执行-回传协议 | 统一 routes/chat.js 工具分发 + respondToolUse 回传 |
| 4 | 工具 parameters 必须 zod schema | tools/ 目录集中定义，review 检查 z.object |
| 5 | conversationId 必须 UUID | 服务端 randomUUID() + 请求校验 |
| 6 | 非 root 必须 | Dockerfile USER oak 固化 |
| 7 | npm 源卡死 | .npmrc 固定 npmmirror |
| 8 | 云端构建慢 | TCR 镜像方案 A 秒级部署 |
| 9 | FlexDB userId 并发限制 / get 上限 | 会话列表 limit 20；不用 userMemory；长会话分页预留 |
| 10 | 本地沙箱模型可执行宿主 Shell | tools 白名单关闭内置 Bash/Read/Write；cwd 只读 |
| 11 | DeepSeek 429/配额 | 指数退避重试 + 前端降级提示 |
| 12 | MySQL 冷启动 | 进程启动预热连接池；只读账号 |
| 13 | ~~视觉模型能力（P0 阻塞项）~~ **已解决（2026-08-23 实测）** | attachments 传图 + `deepseek-v4-flash-vision-exp` 直接路由，解读质量高；降级预案保留（混元 vision / 文字引导） |
| 14 | 语音转写准确率 | 转写结果发送前可编辑；复用 TECH-001 链路 |
| 15 | 医疗合规 | emergency 强制就医引导；免责固定；知识条目医学评审（P4） |
| 16 | 日记内容真实性 | 数据严格来自当天记录；事件仅来自对话捕捉/用户编辑；生成规则硬约束 |
| 17 | 日记隐私与图片 | 日记（含照片）仅家庭成员可见；COS 私有存储；删宝宝档案级联清理 |
| 18 | agent 被绕过直连 | token 强随机 + 轮换；内网服务发现；仅 /health 可公网探测 |
| 19 | NestJS 代理断流/超时 | 请求超时 + 断连 abort；首帧 flushHeaders；done/error 透传 |
| 20 | ctx 注入被篡改 | HTTPS 内网 + token 校验 + ctx 结构 UUID 格式校验 |

---

## 三、执行计划（对齐 PRD-003，22-28 人日）

#### P0 基础服务与视觉实测（✅ 2026-08-23 完成，4-5 人日）
1. ~~minicare-agent 目录拆分（config/agent/routes 分层）~~ ✅ `agent-poc/src/` 已完成分层；
2. ~~内部 token + ctx 注入；/chat 增强~~ ✅ 完成（conversationId 服务端生成、meta/session/tool_call/tool_result/text/done/error 事件；sources/diary 事件随 P1/P2 补充）；
3. ~~图片问诊视觉链路实测~~ ✅ 通过：attachments 传图 + `deepseek-v4-flash-vision-exp` 直接路由（白名单映射废弃）；
4. ~~minicare-server `src/agent/` 代理模块~~ ✅ 完成（chat SSE 帧级透传 + health + baby 归属校验 + ctx 注入；diary REST P2）；
5. ~~Dockerfile + env 清单 + 非 root~~ ✅ 完成；**CloudRun 部署待办**（需 AGENT_INTERNAL_TOKEN）。
- 验收：带 JWT 经 /api/agent/chat 流式完整回答 ✅；上传皮疹照片得到分级回答（容器内附件链路待部署后复测）；无 token 直连 401 ✅；非法 familyId 403 ✅。
- ⚠️ **P0 实测新增风险**：OAK 0.1.1 `resume` 机制在此环境不可用（新一轮 send 空流）——已改用自管历史方案（FlexDB `agent_chat_history`，见 M1 tech §2.1 与 lib/history.js）。

#### P1 知识库（5-6 人日，✅ 2026-08-23 完成）
1. ✅ 迁移 017_knowledge_base.sql（dev 库已建表；生产库待部署时执行）
2. ✅ 数据导入：1586 条入 dev 库（MinerU pipeline 解析 + 自研切块 + TokenHub embedding 1584 条），见 minicare-kb/var/chunks.jsonl
3. ✅ search_knowledge RRF 融合 + 向量 + 检索先行规则：agent-poc `search-knowledge.js` 重写（FULLTEXT ngram + BLOB 向量余弦 + RRF k=60，topK=5；review 条目 REGEXP 过滤）
- ✅ 验收：**精确 Recall@10 = 97.8%（44/45）通过闸门**（agent-poc/scripts/eval-recall-exact.mjs）；回答带来源（items.source）；空库降级返回"未找到"
- ⏳ 待部署：生产库建表 + 导入 + embedding 拷贝；云端 EnvParams 补 DB_*/TOKENHUB_API_KEY；重新部署 minicare-agent

#### P2 数据查询、总结分析与日记生成（5-7 人日，✅ 2026-08-23 agent 侧 + 日记 REST 完成；部署待续）
1. ✅ mysql2 只读连接池（lib/db.js，timezone=+08:00 + dateStrings）；只读账号创建（用户侧前置）
2. ✅ query_baby_data（7 metric × list/sum/avg/count/trend，ctx.babyId 注入）
3. ✅ analyze_baby_data（trend/summary/growth 生长曲线 growth.js，中国 2023 参考）
4. ✅ generate_diary 工具 + 素材聚合（记录/图片；对话事件 MVP 由模型从会话总结）+ diary 事件协议
5. ✅ 迁移 018_baby_diary.sql + 日记 REST（minicare-server src/agent/：save/detail/list/update/photos，FamilyMemberGuard 支持 query.family_id）
- ✅ 验收：数据查询准确（端到端实测模型触发 query_baby_data）；越权 403（日记 REST 实测）；"7 月总结"卡片 + 生长百分位 agent 侧可输出；日记 save 覆盖 id 不变、照片去重、detail/list 回读一致
- ⏳ 待续：P2 部署；P3 页面

#### P3 对话页与日记页（5-6 人日）
1. pages/chat 分包：SSE 消费、气泡/流式、**语音输入**（复用 TECH-001 链路）、**图片发送**（压缩直传 + 气泡）、**周报/月报快捷按钮**、来源/数据条/护栏卡片；
2. pages/diary 分包：列表/详情/编辑（含配图上传、覆盖确认弹窗）；
3. 入口（FAB「问敏宝助手」+ 首页「宝宝日记」）。
- 验收：真机端到端文字/语音/图片对话；周报/月报一键生成；日记生成→编辑→保存→回看闭环；模拟器降级可用。

#### P4 打磨上线（3-4 人日）
1. 权威指南 19 份全量条目化 + 医学评审（抽审 10%）；
2. 召回评测全量跑分 + 高危场景演练；
3. 反馈闭环（US-12 反馈回流修订）；日志打点与 token 统计；
4. TCR 镜像方案 A；一键回滚演练。
- 验收：评测达标（关键信息完整率 100%、幻觉率 0、高危护栏 100%）；监控可看。

**里程碑**：M0（P0 4-5d 含视觉实测）→ M1（P1 5-6d）→ M2（P2 5-7d）→ M3（P3 5-6d，可与 P1/P2 并行）→ M4（P4 3-4d）→ 合计 **22-28 人日**，约 4-5 周（0.5 人力）。

**上线前置（用户侧待办）**：TCR 仓库密码；只读 MySQL 账号创建；AGENT_INTERNAL_TOKEN 生成注入；DeepSeek vision-exp 可用性确认（P0 实测项）。
