# 技术方案：统一 Record Feed API

> 目标：将记录列表从“前端多接口 fan-out + 拼接分页”升级为“后端统一 Feed + 单游标分页”，提升性能与可维护性。

## 1. 背景与问题

当前小程序 `records/list` 页面在 `all` 模式下会并发请求多种记录类型接口，并在前端进行合并、排序、分页循环。这种方案在功能早期可行，但在分页与筛选复杂度上升后出现明显问题：

- 单次加载请求数大，弱网场景下失败概率上升。
- 首屏和下拉加载都存在循环查询，时延抖动明显。
- 前端分页状态与边界条件复杂，维护成本高。
- 多类型分页游标耦合，正确性风险增加。

## 2. 方案目标

- 列表页（全部/单类型）统一走一个查询接口。
- 每页只发起一次请求，支持稳定下拉分页。
- 将多类型合并、排序、分页边界判断统一下沉到后端。
- 保留现有各类型创建/编辑/删除接口，不影响业务录入链路。

## 3. 架构总览

```
┌──────────────────────────────────────────────────────┐
│ minicare-mp                                          │
│                                                      │
│ records/list 页面                                    │
│   ├─ 首屏: GET /api/family/:familyId/records/feed   │
│   ├─ 下拉: GET ...?cursor=xxx                        │
│   └─ 筛选: GET ...?type=feeding                      │
└──────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────┐
│ minicare-server                                      │
│ records/feed 模块                                   │
│   ├─ FeedController                                  │
│   ├─ FeedService                                     │
│   ├─ Keyset Cursor (event_time + id)                │
│   └─ Feed Mapper (summary 标准化)                   │
└──────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────┐
│ MySQL                                                │
│ feeding/sleep/diaper/activity/health/...            │
│ 通过 UNION ALL 或单表查询生成统一时间线              │
└──────────────────────────────────────────────────────┘
```

## 4. API 设计

### 4.1 Endpoint

`GET /api/family/:familyId/records/feed`

### 4.2 Query 参数

- `baby_id`（必填）
- `limit`（可选，默认 `20`，建议范围 `1~50`）
- `cursor`（可选，首屏不传）
- `type`（可选，默认 `all`）
  - 枚举：`all | feeding | sleep | diaper | activity | health | growth | medical | symptom`
- `date`（可选）
  - 格式：`YYYY-MM-DD`，按 `event_time` 自然日过滤（左闭右开）；不传表示不限日期

### 4.3 响应结构

```ts
type FeedType =
  | 'feeding' | 'sleep' | 'diaper' | 'activity'
  | 'health' | 'growth' | 'medical' | 'symptom'

type SummaryTheme = 'pink' | 'warm' | 'purple' | 'fever'

interface FeedItem {
  id: string
  type: FeedType
  event_time: string
  note?: string | null
  summary: {
    title: string
    tags?: string[]
    value?: string
    unit?: string
    theme?: SummaryTheme
    active?: boolean
  }
  detail?: Record<string, unknown>
}

interface FeedListResponse {
  items: FeedItem[]
  nextCursor: string | null
  hasMore: boolean
}
```

说明：

- 响应保持“裸对象”风格（不包 `data`），符合项目 API 约定。
- `summary` 为列表渲染最小必需字段，前端无需再重复解析多类型业务字段。

## 5. 分页与排序规范（Keyset）

### 5.1 统一排序

- `ORDER BY event_time DESC, id DESC`

### 5.2 Cursor 结构

cursor 原始内容（JSON）：

```json
{ "t": "2026-05-23T14:20:00", "id": "uuid" }
```

编码方式：

- Base64URL 编码后作为 `cursor` 参数传递。

### 5.3 下一页条件

```sql
WHERE (event_time < :cursor_time)
   OR (event_time = :cursor_time AND id < :cursor_id)
```

### 5.4 hasMore 判定

- 查询 `limit + 1` 条。
- 返回前 `limit` 条。
- 如果结果条数大于 `limit`，则 `hasMore = true`，并生成 `nextCursor`。

## 6. 后端实现方案

### 6.1 模块结构

新增目录：

```
minicare-server/src/records/feed/
├── feed.module.ts
├── feed.controller.ts
├── feed.service.ts
├── feed.mapper.ts
└── dto/
    └── feed-query.dto.ts
```

并在 `app.module.ts` 注册 `FeedModule`。

### 6.2 Controller 设计

- 路由：`@Controller('family/:familyId/records/feed')`
- 鉴权：复用 `JwtGuard + FamilyMemberGuard + RoleGuard`
- 入参：`familyId + FeedQueryDto`
- 返回：`FeedListResponse`

### 6.3 DTO 设计（示例）

```ts
export class FeedQueryDto {
  @IsUUID()
  baby_id: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number

  @IsOptional()
  @IsString()
  cursor?: string

  @IsOptional()
  @IsIn(['all', 'feeding', 'sleep', 'diaper', 'activity', 'health', 'growth', 'medical', 'symptom'])
  type?: string
}
```

### 6.4 Service 实现职责

- 解码/校验 cursor。
- 根据 `type` 选择“all 联合查询”或“单类型查询”。
- 注入 keyset 条件。
- 执行 `limit + 1` 查询并组装 `hasMore/nextCursor`。
- 使用 `feed.mapper.ts` 输出统一 `FeedItem`。

### 6.5 SQL 策略

#### `type=all`

- 使用 `UNION ALL` 拉平多类型数据，统一字段：
  - `id`
  - `type`
  - `event_time`
  - `note`
  - `payload`（JSON 原始字段）

#### `type=<single>`

- 直接查询对应单表，减少不必要联合开销。

## 7. Feed 映射规范（summary 标准化）

后端统一输出 `summary`，建议按当前列表展示语义映射：

- `feeding`
  - `formula`：`title=配方奶`, `value=formula_ml`, `unit=ml`
  - `breast`：`title=母乳`, `value=duration_min`（格式化）
  - `complementary`：`title=辅食` 或 `营养素`
- `sleep`
  - `title=睡眠/睡眠中`, `active=status=ongoing`
- `diaper`
  - `title=换尿布`, `tags=[嘘嘘/臭臭/干净/... ]`
- `activity`
  - `title=活动类型`, `value=duration`
- `health`
  - `title=健康`, `value=temperature`, 发热时 `theme=fever`
- `growth`
  - `title=生长`, `tags=[身高/体重/头围]`
- `medical`
  - `title=医疗`, `tags=[就诊类型/医院]`
- `symptom`
  - `title=表现`, `tags=[情绪/精神]`

原则：

- Mapper 是唯一权威映射层，避免前端散落重复判断。
- 与 web/mp 现有展示语义保持一致，降低迁移风险。

## 8. 数据库索引建议

为保障 keyset 分页性能，建议补齐以下复合索引：

- `feeding_*`：`(baby_id, record_time, id)`
- `sleep_record`：`(baby_id, start_time, id)`
- `diaper_record`：`(baby_id, record_time, id)`
- `activity_record`：`(baby_id, record_time, id)`
- `health_record`：`(baby_id, record_time, id)`
- `symptom_record`：`(baby_id, record_time, id)`
- `growth_record`：`(baby_id, record_date, id)`
- `medical_record`：`(baby_id, visit_date, id)`

注意：

- 避免列表查询中使用 `DATE(column)=...`，以免破坏索引利用。

## 9. 前端改造方案（minicare-mp）

### 9.1 API 层

- 在 `src/api/records.ts` 新增：
  - `recordsApi.feed.list(familyId, params)`

### 9.2 页面层（records/list）

替换现有 fan-out 逻辑：

- 删除 `Promise.allSettled + ALL_TYPE_KEYS` 并发聚合路径。
- 删除 `nextBeforeDateRef/singleNextDateRef` 双游标机制。
- 改为：
  - `nextCursorRef`
  - `loadFirstPage()`
  - `loadMorePage()`

### 9.3 渲染层

- 优先渲染后端返回的 `summary`。
- 编辑和删除继续使用 `type + id` 路径，无需改动业务接口。

## 10. 渐进迁移与上线策略

### Phase 0：后端就绪

- 新增 `records/feed`，不改旧接口。
- 联调验证分页正确性。

### Phase 1：小程序灰度切换

- `records/list` 引入特性开关（如 `USE_UNIFIED_FEED_API`）。
- 小流量/内部账号优先使用新接口。

### Phase 2：全量切换

- 观察稳定后全量启用新接口。
- 保留旧 `before_date` 接口一段时间用于回退。

### Phase 3：收敛

- 删除前端 fan-out 分页代码。
- 视兼容窗口下线旧列表分页接口。

## 11. 可观测性与指标

建议新增日志埋点字段：

- `feed.query.type`
- `feed.query.limit`
- `feed.query.has_cursor`
- `feed.query.rows`
- `feed.query.db_ms`
- `feed.query.total_ms`
- `feed.query.has_more`

重点监控：

- P95/P99 响应时间
- 首屏加载成功率
- 下拉翻页成功率
- cursor 解析失败率

## 12. 测试计划

### 12.1 单元测试

- cursor 编解码。
- keyset 边界（同时间不同 id，翻页不重不漏）。
- mapper summary 输出正确性。

### 12.2 集成测试

- `type=all` 首屏 + 连续翻页。
- `type=single` 首屏 + 连续翻页。
- 删除后刷新列表结果一致。

### 12.3 回归测试（MP）

- 筛选切换、按类型/按时间切换。
- 触底加载状态（加载中/有更多/已到底）。
- 弱网重试与错误提示。

## 13. 风险与对策

- 风险：`UNION ALL` 在数据量大时性能下降  
  对策：先补索引；必要时演进到 `record_timeline` 物化表（V2）。

- 风险：summary 协议频繁调整  
  对策：固定 mapper 输出契约，前端只消费稳定字段。

- 风险：历史版本依赖旧接口  
  对策：保留兼容窗口 + 开关回退。

## 14. V2 演进方向（可选）

当数据规模提升后，可引入 `record_timeline`：

- 各记录写入时同步写 timeline。
- feed 查询只扫 timeline，必要时按需回表。
- 查询成本更稳定，扩展新类型更低风险。

### 14.1 Timeline 最终形态实施细则

目标是将 Feed 查询复杂度固定在单表上，核心结构如下：

- 物化表：`record_timeline`
- 排序键：`event_time DESC, timeline_id DESC`
- 唯一约束：`(source_type, source_id)`，确保一条业务记录对应一条 timeline
- 双索引：
  - `idx_timeline_baby_time_id`（all）
  - `idx_timeline_baby_type_time_id`（single type）

关键字段：

- `baby_id`、`source_type`、`source_id`、`event_time`、`note`
- `summary_*`（列表卡片快照）
- `detail_json`（轻量详情快照）

读路径策略：

- `FEED_READ_SOURCE=timeline`（默认）优先读 timeline
- 当 timeline 表不存在或尚无数据时，自动回退 union 路径（保证兼容）
- `FEED_READ_SOURCE=union` 可强制回退（应急开关）

分页策略：

- 保持 keyset 分页语义
- 保持“limit 为最小条数，页尾补齐整天”

### 14.2 已执行落地（本次）

- 已新增 migration：`minicare-server/migrations/009_record_timeline.sql`
  - 创建 `record_timeline`
  - 回填现有 feeding/sleep/diaper/activity/health/symptom/growth/medical 数据
  - 采用 `ON DUPLICATE KEY UPDATE` 保证幂等
- 已改造 `feed` 服务：
  - 优先读取 timeline
  - 不可用时自动回退 union
  - 两条路径均支持“页尾补齐整天”

## 15. 性能专项优化路线（详细版）

按以下顺序执行，避免一次性大改导致风险叠加：

1. 先做索引体检（确保每张表 `baby_id + 时间列 + id` 复合索引齐全）。  
2. 再去掉行级相关子查询（改为预聚合/批量 join）。  
3. 最后在数据规模继续增长时引入 `record_timeline` 物化表。  

### 15.1 Phase A：索引体检与补齐（必须先做）

#### A-1. 体检目标

- `EXPLAIN` 不出现全表扫描（`type=ALL`）作为主路径。
- 关键查询命中目标复合索引。
- `ORDER BY event_time DESC, id DESC` 在单表阶段可利用索引有序性。

#### A-2. 索引清单（必须齐）

| 表 | 时间列 | 目标索引 |
|---|---|---|
| `feeding_breast_record` | `record_time` | `(baby_id, record_time, id)` |
| `feeding_formula_record` | `record_time` | `(baby_id, record_time, id)` |
| `feeding_food_record` | `record_time` | `(baby_id, record_time, id)` |
| `feeding_supplement_record` | `record_time` | `(baby_id, record_time, id)` |
| `sleep_record` | `start_time` | `(baby_id, start_time, id)` |
| `diaper_record` | `record_time` | `(baby_id, record_time, id)` |
| `activity_record` | `record_time` | `(baby_id, record_time, id)` |
| `health_record` | `record_time` | `(baby_id, record_time, id)` |
| `symptom_record` | `record_time` | `(baby_id, record_time, id)` |
| `growth_record` | `record_date` | `(baby_id, record_date, id)` |
| `medical_record` | `visit_date` | `(baby_id, visit_date, id)` |

#### A-3. 体检 SQL（可直接执行）

```sql
-- 1) 查看索引现状
SHOW INDEX FROM feeding_breast_record;
SHOW INDEX FROM feeding_formula_record;
SHOW INDEX FROM feeding_food_record;
SHOW INDEX FROM feeding_supplement_record;
SHOW INDEX FROM sleep_record;
SHOW INDEX FROM diaper_record;
SHOW INDEX FROM activity_record;
SHOW INDEX FROM health_record;
SHOW INDEX FROM symptom_record;
SHOW INDEX FROM growth_record;
SHOW INDEX FROM medical_record;

-- 2) 关键路径 EXPLAIN（替换 baby_id）
EXPLAIN SELECT * FROM feeding_formula_record
WHERE baby_id = 'xxx'
ORDER BY record_time DESC, id DESC
LIMIT 21;
```

#### A-4. 补齐策略

- 若缺索引，先在低峰时段新增（避免高峰 DDL 抖动）。
- 统一命名：`idx_<table>_baby_time_id`。
- 先加索引再改 SQL，确保后续优化有基础。

#### A-5. 验收门禁

- `type=all` 请求 P95 比改造前下降或持平；不允许明显退化。
- 无慢查询告警（阈值可设 `>500ms`）。

---

### 15.2 Phase B：去掉行级相关子查询（UNION 保留）

当前 `feeding_formula` / `feeding_food` 存在按行执行的相关子查询，数据增大后会放大成本。目标是改成“先分页拿主键，再批量聚合 join”。

#### B-1. 现状问题

- 典型反模式：`SELECT ..., (SELECT ... WHERE record_id = ff.id) AS x ...`
- 每一行都会触发额外子查询，形成隐性 N+1。

#### B-2. 改造思路（两段式）

第一段（主查询）：
- 只返回统一流最小字段：`id/type/event_time/note`（不带复杂 detail）。
- 先完成 keyset + 补齐整天分页，拿到“本页 record id 集合”。

第二段（批量 detail）：
- 按本页 `type+id` 分组批量查 detail：
  - `formula`：`feeding_formula_mix` 按 `record_id IN (...)` 聚合
  - `food`：`feeding_food_item` 按 `record_id IN (...)` 聚合
  - 其他类型：按主键批量查对应字段
- 在应用层合并到 `FeedItem.detail/summary`。

#### B-3. 示例 SQL 模式

```sql
-- 示例：批量聚合 formula mix
SELECT record_id,
       JSON_ARRAYAGG(milk_type) AS milk_types,
       JSON_OBJECTAGG(milk_type, scoops) AS milk_scoops
FROM feeding_formula_mix
WHERE record_id IN ( ... )
GROUP BY record_id;
```

#### B-4. 预期收益

- 降低 SQL 执行复杂度，减少 DB CPU 峰值。
- 查询耗时对记录条数增长更平滑。
- 保持现有 API 契约，不影响前端。

#### B-5. 验收门禁

- `type=all` P95 至少优化 20%（目标值，可按线上基线调整）。
- 与改造前响应字段一致（契约回归测试通过）。

---

### 15.3 Phase C：`record_timeline` 物化表（最终形态）

当 `UNION ALL + 两段式 detail` 仍接近性能瓶颈时，进入此阶段。

#### C-1. 建模目标

- 把跨表时间线查询收敛到一张表，避免每次请求做多表 union。
- timeline 记录只存“列表必要字段”，详情按需回源。

#### C-2. 表结构建议

```sql
CREATE TABLE record_timeline (
  id CHAR(36) PRIMARY KEY,
  baby_id CHAR(36) NOT NULL,
  source_type VARCHAR(20) NOT NULL,     -- feeding/sleep/...
  source_id CHAR(36) NOT NULL,          -- 原记录主键
  event_time DATETIME NOT NULL,
  note TEXT NULL,
  summary_json JSON NULL,               -- 列表必需摘要快照
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_baby_source (baby_id, source_type, source_id),
  KEY idx_timeline_baby_time_id (baby_id, event_time, id)
);
```

#### C-3. 写入一致性策略

- 创建记录：同事务写业务表 + timeline。
- 更新记录：同步更新 timeline 的 `event_time/note/summary_json`。
- 删除记录：软删或删 timeline 对应行。

#### C-4. 迁移策略

1) 先上线双写（业务表 + timeline）。  
2) 后台回填历史数据（分批、可断点）。  
3) Feed 查询切换到 timeline（灰度）。  
4) 稳定后保留回退开关一段时间。  

#### C-5. 风险控制

- 双写失败必须可告警和补偿。
- 回填任务要限流，避免冲击线上 DB。
- 切换时保留回退到 `UNION ALL` 的能力。

---

## 16. 执行顺序与里程碑（建议）

- **M1（1~2 天）**：完成索引体检 + 缺失索引补齐 + EXPLAIN 基线报告。  
- **M2（2~4 天）**：完成两段式查询改造，去掉行级相关子查询，完成回归。  
- **M3（按容量压力触发）**：落地 timeline 表、双写、回填、灰度切流。  

触发 M3 的建议阈值（示例）：

- `type=all` P95 持续 > 400ms 且无法通过 M2 继续优化；
- 或单宝宝记录规模 > 1万条后体验明显下降。

## 17. 验收与回滚预案

### 17.1 验收指标

- 正确性：分页不重不漏，单日完整性满足预期。
- 性能：`type=all` P95/P99 达标（按基线对比）。
- 稳定性：错误率、超时率不升高。

### 17.2 回滚策略

- Phase A/B：保留旧 SQL 分支，通过开关快速回退。
- Phase C：保留 timeline 查询开关，异常时切回 `UNION ALL` 路径。
- 回滚后保留日志与样本请求，支持复盘定位。

---

## 附录 A：实施任务拆解（建议）

1. 完成索引体检报告（现状索引、缺失索引、EXPLAIN 结果）。  
2. 在 migration 中补齐 `baby_id + 时间列 + id` 复合索引。  
3. 把 Feed 查询改为“两段式”：主查询分页 + 批量 detail 聚合。  
4. 增加性能埋点（db_ms、total_ms、rows、has_more）。  
5. 完成性能回归测试（all/single、首屏/加载更多）。  
6. 评估是否触发 timeline 阶段；若触发则执行双写+回填+灰度切流。  

