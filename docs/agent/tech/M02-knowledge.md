# M2 · 知识问答（技术方案）

> 模块：M2 ｜ 状态：**P1 已落地** ｜ 优先级：P1
> **2026-08-23 P1 完成**：minicare-agent `search-knowledge.js` 重写为 hybridSearch（FULLTEXT ngram + 向量余弦 + RRF），数据 1586 条入 dev 库，**精确 Recall@10 = 97.8%（44/45）通过上线闸门**（minicare-agent/scripts/eval-recall-exact.mjs）；生产库建表+导入待部署时执行。
> **2026-08-22 更新**：文档解析层切换为 **MinerU 云端 pipeline 引擎**（vlm 丢数字问题），切块改用 **LlamaIndex NodeParser 家族**（行业最佳），新增图片三层处理策略与数字校验门禁。检索链路（表/hybridSearch/工具）不变。

## 1. 技术设计概览

```
公众号文章/MinerU 解析产物(md+content_list.json) ──导入脚本──▶ knowledge_base(017) ──▶ search_knowledge 工具
                                                          │
  混合检索：FULLTEXT(ngram) + 内存余弦(embedding) ──RRF──▶ topK=5
                                                          ▼
                                    模型（检索先行）→ 回答 + sources 事件
```

## 2. 数据模型（迁移 017_knowledge_base.sql）

```sql
-- ⚠️ 编号说明：014/015 已被医疗记录迁移占用，知识库迁移为 017（016 已被 timeline_backfill 占用）
CREATE TABLE IF NOT EXISTS `knowledge_base` (
  `id`             CHAR(36)      NOT NULL,
  `kb_id`          VARCHAR(32)   NOT NULL COMMENT '条目ID，如 KB-A1-001',
  `module`         VARCHAR(8)    NOT NULL COMMENT 'A-H 模块',
  `title`          VARCHAR(200)  NOT NULL,
  `category`       VARCHAR(50)   NOT NULL COMMENT '过敏常识/配方选择/辅食等',
  `content`        MEDIUMTEXT    NOT NULL,
  `keywords`       VARCHAR(500)  NULL COMMENT '逗号分隔关键词（FULLTEXT 用，不用 JSON）',
  `source`         VARCHAR(200)  NOT NULL COMMENT '公众号文章标题/指南名',
  `source_url`     VARCHAR(500)  NULL,
  `evidence_level` VARCHAR(20)   NULL COMMENT 'guideline/consensus/RCT/policy/edu',
  `region`         VARCHAR(8)    NULL COMMENT 'cn/intl/both',
  `risk_level`     VARCHAR(10)   NOT NULL DEFAULT 'low' COMMENT 'low/caution/emergency',
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

- FULLTEXT ngram（token 2）中文免分词器；keywords 用逗号分隔 VARCHAR（FULLTEXT 不能索引 JSON 列）。

## 3. 条目化导入脚本（scripts/）

| 脚本 | 输入 | 输出 |
|---|---|---|
| `sync-kb-articles.mjs` | docs/wechat-articles/*.md（8 篇） | 解析 YAML frontmatter（title/tags/category/disclaimer）→ 按小节切条目 → 入库（kb_id=Wx-NN-N，evidence_level=edu，risk_level 按内容） |
| `import-kb-guidelines.mjs` | docs/knowledge/source/mineru-parsed/国内\|国际/&lt;文档名&gt;/*.md + *_content_list.json（P1 核心 3-4 份，P4 全量） | 清洗→切块→页码锚定→数字校验→元数据标注（evidence_level/region/age）→ 入库 |
| `gen-embeddings.mjs` | 全量 active 条目 | 混元 hunyuan-embedding 生成 → 写回 `embedding` BLOB（离线，仅此脚本调用 embedding API） |

- 幂等：按 kb_id upsert；status=2 归档停用，不物理删除。

### 3.1 文档解析层（MinerU 云端 pipeline，2026-08-22 定案）

- **引擎**：MinerU 云端精准解析 API（`POST /api/v4/file-urls/batch` 本地上传 → 轮询 → 下载 zip），**`model_version=pipeline` + `language=ch`**；
  - ⚠️ **不要用 vlm**：实测 vlm 引擎对双栏医学期刊的剂量数字识别不稳定（严重过敏共识 9 处数字丢失，含 0.5mg/次、25% 等关键值）；pipeline 文字层保真，同文档仅 1 处真缺失。符合 MinerU 官方"医疗/法律文档建议 pipeline（低幻觉）"建议。
- **存储**：`docs/knowledge/source/mineru-parsed/{国内,国际}/<文档名>/`，每份保留：
  - `<文档名>.md`（full.md 重命名：标题层级 + `<table>` HTML 表格 + `<sup>` 引用标记 + `![]()` 图片引用）
  - `*_content_list.json`（元素级 bbox + page_idx，页码溯源锚点；v2/layout/model/origin.pdf 为中间产物不保留）
  - `images/`（表格/图片裁剪，P1 图注生成用）
- **已知缺陷**：pipeline 也非 100% 保真（实测丢 1 处剂量 + 1 处数字）；原 PDF 文字层（pypdf 提取）数字 100% 完整 → 数字校验门禁 + 人工复核兜底（见 3.3）。

### 3.2 切块方案（自研实现，2026-08-23 定稿）

> **实现说明**：架构评审时选定 LlamaIndex NodeParser 家族，实际实现后确认 **MinerU 产物的单行 HTML 表格与 LlamaIndex 的 ElementNodeParser 不兼容**（它只认标准 md 表格语法），且标题层级需先修复（MinerU 全输出 `##`）。因此采用**自研等价的轻量实现**（`minicare-platform/api/src/kb_pipeline/chunking/pipeline.py`，约 170 行），行为对齐 LlamaIndex 思路，测试锁定（31 个 pytest 全绿）。

```
① 预处理：去 <sup>/LaTeX/页眉页脚 + 标题扁平化修复（## 一、→h2，## （一）→h3，## 1.→h4）
          + HTML 无前缀标题推断（卫健委/广东/FDA 等 MinerU-HTML 产物）
② 表格抽取：<table>…</table> 抽出 → 占位符 [[TABLE_n]] → 表格独立成块（HTML 全文，不受 size 限制）
③ 标题层级切块：章节/子节 = 一个块，header_path 继承（如 九、治疗/（二）药物）
④ 超长章节降级：> max_section_chars(1200) 按空行段落聚合切分（_split_long）
```

- **当前参数**：`chunk_size=600 / chunk_overlap=100` 已配置但**未接入**（切块按章节/段落边界，非 token 级）；`parent_kb_id` 恒 None（父子树未实现，靠 header_path 派生）；
- **与 LlamaIndex 方案的差距（已记录，后续按效果决定是否补齐）**：① 无 overlap（大块边界内容可能丢）② 无父子树（命中子块时拿不到父块上下文）③ 表格无 LLM 摘要（表格块 embedding 质量打折）；
- **依赖**：切块不依赖 llama-index-core（已装但未使用于切块），零运行时依赖，pytest 31 个测试锁定行为；
- **评测基准**：精确 Recall@10 = 97.8%（45 题），见 `minicare-platform/api/docs/RECALL-REPORT.md`。

### 3.3 消费管线（导入脚本内顺序执行）

```
读 md + content_list.json
  → 清洗（去 <sup>/LaTeX/页眉页脚/空白 + HTML 无前缀标题推断）
  → 标题层级修复（编号正则恢复层级）
  → 自研切块（表格抽取 → 标题层级切块 → 超长段落降级，见 3.2）
  → 页码锚定：content_list.json 的 page_idx 按文本对齐标注到每个块
  → 数字校验：正则扫描（为 次/最大剂量 /（ 岁）/仅有 X% 等 9 类模式）
     命中 → 条目标记 review（status 不变但不入检索），输出复核清单
  → 元数据标注（source/evidence_level/region/risk_level/applicable_age）
  → 入库 knowledge_base
```

### 3.4 图片三层处理策略

| 层级 | 内容 | 阶段 |
|---|---|---|
| **P0** | 图注文本化：content_list.json 的 image 元素（img_path/caption/page_idx）→ caption 写入所在块内容（如"图2 严重过敏反应初始治疗流程"），md 保留 `![]()` 引用；图片本体存 `images/` 备展示 | **本期做** |
| **P1** | 关键流程图用视觉模型（deepseek-v4-flash-vision-exp，复用 M6 视觉链路）生成结构化描述 → 作为图块文本入库，语义可检索 | 二期 |
| **P2** | 多模态向量检索（CLIP 类图 embedding） | **不做**（问答场景图注+描述文本已够） |

- 表格不走图片通道：MinerU 已输出 `table_body` HTML，当文本消费；

## 4. search_knowledge 工具

```ts
// lib/tools/search-knowledge.js
import { z } from 'zod'
export const SEARCH_KNOWLEDGE_TOOL = {
  name: 'search_knowledge',
  description: '检索宝宝护理知识库（牛奶蛋白过敏、辅食、便血、深度水解配方等主题）。回答家长问题时必须先检索此知识库，基于检索结果作答。',
  parameters: z.object({
    query: z.string().describe('检索关键词/自然问题'),
    riskLevel: z.enum(['low','caution','emergency']).optional(),
    category: z.string().optional(),
  }),
  execute: async ({ query, riskLevel, category }) => {
    const items = await hybridSearch(query, 5, { riskLevel, category })
    return items.length ? JSON.stringify({ found: true, items, topK: 5 })
                         : JSON.stringify({ found: false, message: '知识库未找到相关内容' })
  },
}
```

## 5. 混合检索实现（hybridSearch）

```js
async function hybridSearch(query, topK = 5, filters = {}) {
  // 1) 关键词路：FULLTEXT NATURAL LANGUAGE MODE，top 20
  const fts = await db.query(
    `SELECT id,kb_id,title,category,content,source,risk_level,
            MATCH(title,content,keywords) AGAINST(? IN NATURAL LANGUAGE MODE) AS score
     FROM knowledge_base WHERE status=1 AND MATCH(title,content,keywords) AGAINST(? IN NATURAL LANGUAGE MODE)
     ORDER BY score DESC LIMIT 20`, [query, query])

  // 2) 向量路：进程启动加载全部 active embedding（<500 条 <2MB 内存），
  //    query 现算 embedding（混元，~100ms，LRU 缓存）→ 余弦相似度 top 20
  const vec = await cosineTopK(embed(query), loadedEmbeddings, 20)

  // 3) RRF 融合（k=60）→ 4) filters 过滤（risk_level/category）→ 5) topK
  return rrfFuse(fts, vec, { k: 60, filters, topK })
}
```

- 阈值演进：<500 条内存余弦；500-5000 条向量落 BLOB 批量余弦；>5000 条迁 pgvector/VectorDB（仅改本文件实现）。

## 6. systemPrompt 检索先行规则（prompts/system.js）

```
1. 检索先行：涉及知识/护理问题，必须先调用 search_knowledge；
2. 工具返回后必须把结果当作已到手的资料，立即基于结果写出完整回答，
   绝不回复"正在检索/请稍候/等待结果"；
3. 返回"未找到"→ 明确说"知识库未收录，建议咨询医生"；
4. 医疗判断附"本回答仅供参考，不能替代专业医疗建议"。
```

## 7. 测试与验证

- 召回评测：`minicare-platform/api/scripts/eval-recall-exact.py`（精确 Recall@10，gold 条目经 `var/kb_mapping.json` 映射判定）跑 `docs/knowledge/召回测试集-种子50题.md`，Recall@10 ≥ 90% 为上线闸门；基线见 `minicare-platform/api/docs/RECALL-REPORT.md`（97.8% 达标）。⚠️ 勿用"关键信息字面命中率"口径评估质量（指标失真，已弃用）。
- 空库降级：knowledge_base 空 → search_knowledge 返回未找到 → 回答"未收录建议就医"；
- 来源完整性：回答的 sources 事件条目与检索结果一一对应。

## 8. 方案对比与可替换性设计

> 本模块采用**轻量自建**而非全托管知识库，理由与可替换路径如下。**迁移决策未定**，量级增长或需求变化时按本节触发条件再评估。

### 8.1 自建范围盘点（"完全自建"的错觉从哪来）

| 环节 | 状态 | 说明 |
|---|---|---|
| 文档解析（PDF→md+json） | ✅ **已完成**（前置） | MinerU 云端 pipeline（`minerU解析版本/`，15 份 PDF 已解析/待重跑），RAG 管线最重环节无需重做 |
| 文档切块（md→章节/表格块） | ✅ **自研完成** | `minicare-platform/api/chunking/pipeline.py`（170 行：标题层级修复→表格抽取→章节切块→超长降级），行为对齐 LlamaIndex 思路但零依赖；31 个 pytest 锁定 |
| 知识条目 Schema（evidence_level/region/age/risk_level/review_status） | ✅ **已设计**（前置） | 《Agent知识库建设方案.md》，医疗 KB 区别于通用 RAG 的核心 |
| 表结构 + FULLTEXT ngram | 自建（一个表） | 017 迁移 |
| 向量检索 | 自建（<500 条内存余弦，<2MB） | 不引向量库 |
| embedding 生成 | 外部调用（离线） | 混元 hunyuan-embedding，复用现有 TCB 凭证 |
| 召回评测 | 自建（一个脚本） | 50 题测试集已存在 |

→ 真正需要从零写的只有"一个表 + 一个 hybridSearch 函数 + 一个 embedding 脚本 + 一个评测脚本 + 导入脚本的预处理/校验小函数 + 一个自研切块（对齐 LlamaIndex 思路）"，其余是业务治理（元数据/来源锚定/风险分级）与行业成熟组件（解析），**任何托管方案都不提供**。

### 8.2 复用路径对比（评估过，暂不采用）

| 路径 | 复用点 | 不采用原因 |
|---|---|---|
| CloudBase 知识库 MCP（docs.cloudbase.net/ai/agent/knowledgebase） | MCP 协议 + 托管向量底座（pgvector/COS Vector） | 本质仍是自建管线（解析/切片/embedding/检索照做），仅换存储；主环境无 PostgreSQL 需另开且扩展可用性待控制台确认（TECH-004）；<500 条收益为零 |
| 腾讯云知识引擎 API | 解析/切片/embedding/检索全托管 | 文档上传出域，违背数据主权；检索黑盒无法支撑 risk_level 过滤、来源锚定、国内共识>国际指南冲突特判；凭证卡点（POC 成长计划教训） |
| 开源 RAG 平台（RAGFlow/FastGPT/Dify） | 全链路，可私有部署 | 引入整套新基建（PG+向量库+对象存储+Web 服务），运维重，与 agent 独立轻量服务架构冲突；通用知识库对逐条医疗元数据+风险分级支持弱 |
| 向量库底座（VectorDB/ES/pgvector） | 托管存储/检索 | 仅底座，其余环节仍自建；<500 条规模内存余弦已够 |

### 8.3 可替换性设计（保持轻量 + 未来可迁）

```js
// lib/tools/search-knowledge.js — 对外只暴露 hybridSearch 一个接口
// 未来迁移只改本文件的检索实现，工具定义/zod/execute 签名不变：
//   <500 条    内存余弦（当前）
//   500-5000  向量落 knowledge_base.embedding BLOB + 批量余弦
//   >5000     迁 CloudBase 知识库 MCP（pgvector/COS Vector）或 VectorDB，改 hybridSearch 内部
export async function hybridSearch(query, topK, filters) { /* 当前实现 */ }

// lib/embeddings.js — embedding 服务抽象，离线脚本唯一调用点
// 混元 → 可替换为 bge-m3 自托管 / 其他，仅改本文件
export async function embed(text) { /* 混元 hunyuan-embedding */ }
```

**迁移触发条件**（满足任一再决策，当前 <500 条均不满足）：
1. 知识量 >5000 条或需在线更新（新增文章即时可检索）；
2. 检索质量不达标且内存方案无法调优（如需要混合评分权重精细调参）；
3. 需要多租户知识库隔离（当前单库单家庭场景无此需求）。

