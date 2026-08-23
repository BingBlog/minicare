# M5 · 每日日记（技术方案）

> 模块：M5 ｜ 状态：规划中 ｜ 优先级：P2（生成）/ P3（页面）

## 1. 技术设计概览

```
用户触发"写日记" ──▶ agent：generate_diary 工具聚合素材
   ├─ 当天记录概览（queryMetric 各维度 days=1）
   ├─ 当天图片（记录图片 fileID + 对话图片 fileID，宿主从会话素材缓存取）
   └─ 当天生活事件（模型从会话上下文中已捕捉的事件）
   └─▶ 模型写日记正文（温情叙事）──event: diary──▶ 前端草稿
   ──▶ 用户编辑/补图 ──▶ POST /api/agent/diary/save（upsert，每天一篇）
```

## 2. 数据模型（迁移 017_baby_diary.sql）

```sql
-- ⚠️ 迁移编号：017（016 为 knowledge_base）
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

- 永久保留：无清理任务；删除宝宝档案时应用层级联删除（by baby_id）。

## 3. generate_diary 工具（素材聚合）

```ts
// lib/tools/generate-diary.js
export const GENERATE_DIARY_TOOL = {
  name: 'generate_diary',
  description: '聚合宝宝某一天的记录概览、图片与生活事件素材，用于生成每日日记。用户要求写日记/今天的日记时调用。',
  parameters: z.object({ date: z.string().describe('YYYY-MM-DD，默认今天') }),
  execute: async ({ date }, ctx) => {
    const babyId = ctx.babyId
    const records = await Promise.all(ALL_METRICS.map(m => queryMetric(babyId, m, 1)))  // 当天各维概览
    const photos  = await collectDayPhotos(babyId, date)   // 当天记录图片 + 当天对话图片（会话素材缓存）
    const events  = extractChatEvents(ctx)                 // 会话中已捕捉的生活事件（见 3.2）
    return JSON.stringify({ ok: true, date, records: records.filter(r => r.hasData),
      photos, chatEvents: events })
  },
}
```

### 3.1 当天图片素材（collectDayPhotos）

- 来源 1：当天健康记录 `photo_ids`（如 medical_record 的图片）；
- 来源 2：当天对话中上传的图片 —— 宿主在 chat 请求处理时把 `{ fileId, userId, date }` 写入**会话素材缓存**（MVP：进程内存 Map<userId, Map<date, fileId[]>>，重启丢失可接受；P4 可迁 FlexDB 集合 `agent_day_photos`）；
- 输出：`[{ fileId, source: 'record'|'chat' }]`。

### 3.2 生活事件捕捉（extractChatEvents）

- **触发方式**：模型在对话中自主识别生活事件（含地点/活动动词的家长陈述，如"今天带旺仔去露营了""下午游了泳"），按约定写入回答尾部不可见标记或宿主侧拦截 `event: chat_event`；
- **MVP 简化**：不单独建事件表——生成日记时模型直接从会话上下文（FlexDB transcript）总结当天事件；可靠性靠 prompt 约束（"只写用户明确提过的生活事件，不得编造"）+ 用户编辑兜底；
- 若事件提及但当天无照片 → 模型在草稿末尾附一句"今天提到露营，可以补充一张照片，日记会更有纪念意义"。

## 4. 日记 REST API（agent 内部，minicare-server 代理）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/agent/diary/save` | POST | `{ babyId, diaryDate, content, photoIds? }` upsert（UNIQUE 冲突即覆盖，前端已确认） |
| `/api/agent/diary/detail?babyId=&date=` | GET | 单天日记（无 → 404/空） |
| `/api/agent/diary/list?babyId=&month=` | GET | 按月列表（倒序，含首句摘要 + 首图缩略） |
| `/api/agent/diary/:id` | PUT | 编辑 content/photoIds（author_id 更新） |
| `/api/agent/diary/:id/photos` | POST | 追加 photoIds（去重） |

- 所有请求经 M8 代理层鉴权（JWT → 成员 → baby 归属）；
- 覆盖：save 时 `INSERT ... ON DUPLICATE KEY UPDATE content=VALUES(content), photo_ids=..., updated_at=NOW()`；前端在重复生成场景先弹确认。

## 5. 配图链路

- 完全复用 COS 直传（storage/upload-url：ArrayBuffer PUT + 5 签名 header，2026-08-22 已验证）；
- 前端压缩（quality 80 / width 1280）→ 直传 → 拿 fileID → 随 save/update 提交 photoIds；
- 展示：download-urls 批量取临时 URL（失效自动刷新）；
- 图片权限：fileID 归属校验（拉取时确认属该家庭，防越权引用）。

## 6. 测试与验证

- 生成闭环：造当天记录 + 对话事件 → generate_diary 素材正确 → 模型草稿 → save → detail 回读一致；
- 覆盖：同日期第二次 save → 内容更新、id 不变（upsert）；
- 编辑：PUT 后 updated_at 更新、author_id 为编辑人；
- 配图：photos 追加去重；download-urls 可展示；
- 永久保留：无清理逻辑（回归验证）。
