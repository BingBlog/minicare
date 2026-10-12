# F03 · 饮食记录

> 功能 ID：P0-004 ~ P0-006  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-10-12（补剂&营养素 Bar 状态化：「今天已吃 / 今天还没吃」文案；补登 SupplementBar 至影响面清单）
>
> **数据库架构**（Migration 008）：feeding_record 已拆分为 4 张独立表：
> `breast_feeding` / `formula_feeding`（含 `formula_mix` 配比子表）/ `food_feeding`（含 `food_item` 明细子表）/ `supplement_feeding`
> 字段类型全部使用 VARCHAR 枚举，废弃 TINYINT。

## 功能描述

记录宝宝的饮食情况，覆盖 4 种喂养方式。通过 TabBar 中央 FAB 或首页快捷入口进入饮食表单页，根据 `feed_type` 选择对应 Tab。

**平台实现**：微信小程序（主平台），数据通过 REST API 存入远程 MySQL。

## 四种喂养类型

| feed_type | 中文标签 | 对应数据库表 |
|-----------|----------|-------------|
| `breast` | 母乳 | breast_feeding |
| `formula` | 配方奶 | formula_feeding + formula_mix |
| `complementary` (food) | 辅食 | food_feeding + food_item |
| `complementary` (supplement) | 营养补充 | supplement_feeding |

> 注：辅食和营养素在 API 层共用 `feed_type: 'complementary'`，通过 Tab UI 区分。

## 母乳记录

**必填**：record_time（记录时间）  
**可选**：breast_side（left/right/both）、duration_min（喂奶时长分钟）、note

## 配方奶记录

### 5 种奶粉类型

| 枚举值 | 中文标签 |
|--------|----------|
| `aa` | 氨基酸配方 |
| `eh_no_lactose` | 深度水解（无乳糖） |
| `eh_lactose` | 深度水解（含乳糖） |
| `ph` | 适度水解 |
| `std` | 普通奶粉 |

### 配比功能

- 支持多种奶粉混合配比（formula_mix 子表）
- 每种奶粉记录：类型 + 勺数（支持分数选择：1/4, 1/3, 1/2, 2/3, 3/4 勺）
- 总奶量：步进器 10-400ml，步长 10ml
- **上次配方缓存**：保存时将本次配方缓存到 Taro Storage，下次默认复用上次配方

**可选字段**：formula_end_time（喂奶结束时间）、note

## 辅食记录

- food_item 子表记录每种辅食的名称和份量
- 支持多种辅食同时记录
- 小程序表单提供按分组的常见辅食快捷清单（谷薯主食/蔬菜/水果/优质蛋白/组合辅食），支持一键添加到本次记录
- note 备注字段

### 首页喂养间隔提醒 Bar（2026-10-08 新增）

首页提醒区（`HeroSection` 的 `banners` 插槽）里，**「距上次喂奶」与「距上次辅食」合并为同一张卡片**（`FeedingBanner`），
卡内上下两行，行间用 1px 分隔线（`.home-feed-row--divided`），不再各占一张 bar：

| 项 | 喂奶行 | 辅食行 |
|---|---|---|
| 标题 | `距上次喂奶` | `距上次辅食` |
| 副标题 | `上次 {HH:mm} · 已过去 X 小时 Y 分钟` | 同左（**不展示食物名**） |
| 数据口径 | `feed_type` 为 `formula` / `breast` | `feed_type='complementary'` 且 `complementary_food !== '营养素'` |
| 点击 | 喂奶表单 `/records/form/feeding?tab=formula` | 辅食表单 `/records/form/feeding?tab=food` |

- **不展示食物名**（2026-10-08 定稿）：辅食行只用「时间 + 已过时长」，与喂奶行文案对称；`detail.complementary_food` 仅参与过滤，不上屏。
- **营养素不重置任何计时**：`feed_type='supplement'`（及旧数据 `complementary_food='营养素'`）**既不算辅食、也不算喂奶**，两行计时都不受其影响。
- **昨日回落**：今日无该行记录时回落到昨日，时间前缀显示 `昨天 HH:mm`（两行各自独立判断）。
- **行级条件渲染**：某行无数据则只渲染另一行（此时无分隔线）；两行都无数据时整个 Bar 由首页不渲染。
- **热区**：整行可点（行级热区），右侧 `记录喂奶` / `记录辅食` 胶囊为同目标的视觉提示。
- **刷新**：组件内单个 60s 定时器同时刷新两行「已过去」时长；数据随 `records` / `yesterdayRecords` 状态更新。

> 颜色：卡片沿用喂奶橙 `#f8a070` 左边框；两行圆点分别用喂奶橙 `#f8a070` 与辅食色 `#d4780a` 区分。

## 营养补充记录

### 8 种预设营养素

| 枚举值 | 中文标签 |
|--------|----------|
| `vitamin_d` | 维生素D |
| `iron` | 铁 |
| `calcium` | 钙 |
| `dha` | DHA |
| `vitamin_ad` | 维生素AD |
| `zinc` | 锌 |
| `probiotics` | 益生菌 |
| `vitamin_c` | 维生素C |

每种营养素记录：名称 + 剂量 + 单位

### 首页「补剂&营养素」Bar 状态显示（2026-10-12）

首页提醒区（`pages/home/SupplementBar.tsx`）以「今天是否已吃」为状态行口径，不再仅罗列已吃条目：

| 今昨记录情况 | 状态行展示 |
|---|---|
| 今日有补剂记录 | `今天已吃：维生素 D 400IU、维生素 AD`（最多 2 项，多则追加 `，另有 n 项`） |
| 今日无记录、昨日有 | `今天还没吃 · 昨日：维生素 AD`（提醒态） |
| 今昨两天都无记录 | 整条不渲染 |

- 补剂项口径：`feed_type='supplement'`（兼容旧数据 `complementary_food='营养素'`），按 `key` 去重；
- 剂量为空时仅展示名称；点击整条 → 补剂记录表单（`feeding?tab=supplement`）。

## 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/family/:familyId/records/feeding` | POST | 创建饮食记录 |
| `/api/family/:familyId/records/feeding` | GET | 查询饮食记录列表 |
| `/api/family/:familyId/records/feeding/:id` | GET | 查询单条记录 |
| `/api/family/:familyId/records/feeding/:id` | PATCH | 更新记录 |
| `/api/family/:familyId/records/feeding/:id` | DELETE | 删除记录 |

## 编辑模式

通过 URL 参数 `recordId` 进入编辑模式，加载已有记录数据进行修改。

## 影响面清单（消费方）

> **改动 F03 任何逻辑前必读**：运行 `node .agents/scripts/impact-scan.mjs feeding formula breast food supplement`
> 核对以下消费点（大小写不敏感匹配，需人工确认），改动后同步更新本清单。
> 本清单 2026-10-08 建立（参照 F07-health.md 样板）。

**入口层**
- 快捷入口 / 路由映射：`minicare-mp/src/lib/constants.ts`（`RECORD_TYPE_CFG` / `ALWAYS_VISIBLE_KEYS` / `AGE_QUICK_KEYS` / `FAB_*` / `HOME_RECORD_ROUTES` / `HOME_RECORD_MP_ROUTES`）
- 路由分发：`minicare-mp/src/lib/navigation.ts`、`minicare-mp/src/pages/records/index.tsx`（`MP_ROUTE_MAP`）
- 语音入口：`minicare-mp/src/components/VoiceResultSheet/index.tsx`（`VOICE_QUICK_TYPES`）
- 看板添加：`minicare-mp/src/pages/dashboard/index.tsx`、`RemindersColumn.tsx`、`FeedingColumn.tsx`、`SupplementColumn.tsx`

**首页提醒区（banners 插槽，`pages/home/index.tsx`）**
- `minicare-mp/src/pages/home/FeedingBanner.tsx`（**一张卡片两行**：距上次喂奶 + 距离上一次辅食；行级热区分别进喂奶/辅食表单）
- `minicare-mp/src/pages/home/SupplementBar.tsx`（补剂&营养素 Bar：状态行「今天已吃：xxx / 今天还没吃 · 昨日：xxx」；今昨均无记录时整条不渲染）
- `minicare-mp/src/pages/home/SleepBanner.tsx` / `NextFollowUpBanner.tsx` / `AllergyProgressBar.tsx`
- 样式：`minicare-mp/src/pages/home/index.scss`（`.home-inline-banner*` + `.home-feed-row*`）、`minicare-mp/src/styles/_ipad-adapt-mixins.scss`（title/desc 字号）

**表单页 / 组件**
- 表单页：`minicare-mp/src/pages/records/feeding/index.tsx`（`tab=formula|breast|food|supplement`）
- 区块组件：`FormulaSection` / `BreastSection` / `FoodSection`（`feed-food-chips` 等）

**展示层**
- 首页时间线：`minicare-mp/src/pages/home/homeRecords.ts`（`getTimelineRecordDisplay` / `getTimelineIconType` 按 `feed_type` 分流 food/supplement/formula/breast）
- 记录列表：`minicare-mp/src/pages/records/list/recordListDisplay.ts`、`index.tsx`（编辑分流）
- 报告：`minicare-mp/src/pagesReport/FeedingTab`（`FeedingStats.complementaryCount`）
- 排敏关联：`minicare-mp/src/api/foodObservation.ts`（辅食保存联动建/复用观察任务）

**API 层**
- `minicare-mp/src/api/feeding.ts`（`FeedType` / `FeedingRecord` / `CreateFeedingDto`）
- `minicare-mp/src/api/records.ts`（`recordsApi.feeding` 聚合、`recordsApi.today`）

**后端**
- `minicare-server/src/records/feed/`（controller / service / `dto/feed-query.dto.ts`；四张子表 UNION 出口处的 `feed_type` 口径：breast / formula / **complementary** / **supplement**）
- `minicare-server/src/family/family.service.ts`（`getTodayRecords`：`detail.feed_type` 与 `complementary_food`）
- `minicare-server/src/records/timeline/timeline.service.ts`（`loadFeedingPayload`）
- `minicare-server/src/records/food-observation/food-observation.service.ts`（辅食联动排敏）

**数据层**
- `feeding_breast_record` / `feeding_formula_record`(+`feeding_formula_mix`) / `feeding_food_record`(+`feeding_food_item`) / `feeding_supplement_record`，Migration 008

> ⚠️ **`feed_type` 口径陷阱**：`CreateFeedingDto` 只允许 `breast | formula | complementary`，但**读取侧**（timeline / today）把营养素出口为 `feed_type='supplement'`。
> 任何"哪些记录算辅食"的判断都必须以**读取侧**为准：`feed_type === 'complementary'`，并对历史数据额外排除 `complementary_food === '营养素'`。

## 验收标准（AC）

- [x] 4 种喂养类型 Tab 切换
- [x] 母乳：哺乳侧选择 + 时长
- [x] 配方奶：5 种奶粉类型多选 + 勺数（含分数选择器）+ 总奶量步进器
- [x] 配方奶：上次配方缓存与复用
- [x] 辅食：多种食物添加
- [x] 首页提醒区「距上次喂奶」与「距上次辅食」**合并为一张卡片两行**（行级热区分别进喂奶/辅食表单；不展示食物名；营养素不重置计时）
- [x] 营养素：8 种预设 + 剂量/单位输入
- [x] 提交后 Toast "记录已保存" 并 navigateBack
- [x] 支持编辑和删除已有记录

## 相关文件

- 饮食表单：`minicare-mp/src/pages/records/feeding/index.tsx`
- 类型定义：`minicare-mp/src/pages/records/feeding/types.ts`
- API 模块：`minicare-mp/src/api/records/feeding.ts`
- 服务端：`minicare-server/src/records/feeding/`
- 数据库：`minicare-server/migrations/008_schema_redesign.sql`（4 表定义）
