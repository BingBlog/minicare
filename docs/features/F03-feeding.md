# F03 · 饮食记录

> 功能 ID：P0-004 ~ P0-006  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-10-12（PRD-018：营养素「每日补充计划」——记录页配置区 + 首页计划对账，替换「昨日反推」；喂养条单行化——喂奶/辅食仅展示最近一项；营养素 key 表校准）
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

### 首页喂养间隔提醒 Bar（2026-10-12 单行化）

首页提醒区（`HeroSection` 的 `banners` 插槽）里，「距上次喂奶」与「距上次辅食」**只展示最近的一项**（`FeedingBanner`）——家长主要关注「距上一次进食多久」（原为一张卡片两行并列，2026-10-12 因信息密度大改版）：

| 项 | 说明 |
|---|---|
| 标题 | `距上次喂奶` 或 `距上次辅食`（随最近项） |
| 副标题 | `上次 {HH:mm} · 已过去 X 小时 Y 分钟`（**不展示食物名**） |
| 选择口径 | 比较两类的**绝对时间**（ISO 含日期，跨天比较正确），仅展示更近的一项（`index.tsx::lastIntake`） |
| 数据口径 | 喂奶 = `feed_type` 为 `formula` / `breast`；辅食 = `feed_type='complementary'` 且 `complementary_food !== '营养素'` |
| 点击 | 随展示项跳喂奶表单 `/records/form/feeding?tab=formula` 或辅食表单 `?tab=food` |

- **营养素不重置任何计时**：`feed_type='supplement'`（及旧数据 `complementary_food='营养素'`）**既不算辅食、也不算喂奶**，也不参与"最近一项"的竞争。
- **昨日回落**：某类今日无记录时回落到昨日（时间前缀 `昨天 HH:mm`）；两类都无数据 → 整个 Bar 不渲染。
- **刷新**：组件内 60s 定时器刷新「已过去」时长。
- 颜色：卡片沿用喂奶橙 `#f8a070` 左边框；圆点与强调色随展示项（喂奶橙 `#f8a070` / 辅食深橙 `#d4780a`）。

## 营养补充记录

### 8 种预设营养素

| key | 中文标签 | 分组 |
|-----|----------|------|
| `vitD` | 维生素 D | must |
| `iron` | 铁 | must |
| `calcium` | 钙 | optional |
| `dha` | DHA | optional |
| `vitAD` | 维生素 AD | optional |
| `zinc` | 锌 | optional |
| `probiotic` | 益生菌 | optional |
| `vitC` | 维生素 C | optional |

每种营养素记录：名称 + 剂量 + 单位；另支持「其他」自定义项（key 恒为 `other`，展示名存 `label`）。

> key 为**落库口径**（`supplement_items[].key`，与 `records/feeding/types.ts::suppItems` 一致）；
> ⚠️ 服务端 `app-config.data.ts::SUPPLEMENT_ITEMS` 另有一份 13 项清单（key 形如 `vitD3`），与本体清单存在既存差异（技术债，PRD-018 §4 已记录，本期不统一）。

### 每日补充计划与首页提醒对账（PRD-018，2026-10-12）

**每日补充计划**：宝宝每天要补的营养素清单（宝宝级、服务端存储）。
- 存储：`baby_profile.supplement_plan`（JSON key 数组，如 `["vitD","iron"]`；migration 028；`NULL`/`[]` = 未配置）；
- 配置入口：营养素记录页（`feeding?tab=supplement`）顶部折叠配置区（`SupplementPlanSection`，**仅新建模式**）——勾选 8 项预设 → 「保存计划」（`PATCH /family/:fid/baby/:babyId { supplement_plan }`，成员角色可写）；清空 = 未配置；
- 自定义「其他」项**不进计划**（对账匹配不可靠，PRD-018 §7）。

**首页 Bar 口径**（`SupplementBar`，替换原「昨日反推」）：

| 计划 / 记录情况 | 展示 |
|---|---|
| 未配置（`[]` / NULL） | 引导条「还没有每日补充计划 → 去设置」（与日程 setup 引导同构） |
| 计划内全部已吃 | 整条不渲染 |
| 存在未吃项 | `今天还没吃：维生素 D、铁剂`（最多 3 项，超出追加 `，另有 N 项`） |

- 对账 = 计划 − 今日已吃；已吃 key 经 `lib/supplements.ts::normalizeSupplementKey()` **归一化**后比较（历史脏变体 `probiotics → probiotic`，实测驱动）；
- 补剂项口径：`feed_type='supplement'`（兼容旧数据 `complementary_food='营养素'`），按 `key` 去重；吃**计划外**项不影响对账；
- 点击整条 → 补剂记录表单（`feeding?tab=supplement`，配置区同页）。

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
- `minicare-mp/src/pages/home/FeedingBanner.tsx`（**单行展示最近一次进食**：喂奶/辅食取更近者，标题/按钮随项）
- `minicare-mp/src/pages/home/SupplementBar.tsx`（补剂&营养素 Bar：**计划对账**——未配置引导条 / 全吃完隐藏 / 未吃差集「另有 N 项」；归一化见 `lib/supplements.ts`）
- `minicare-mp/src/pages/home/SleepBanner.tsx` / `NextFollowUpBanner.tsx` / `AllergyProgressBar.tsx`
- 样式：`minicare-mp/src/pages/home/index.scss`（`.home-inline-banner*` + `.home-inline-banner--plan-setup*`）、`minicare-mp/src/styles/_ipad-adapt-mixins.scss`（title/desc 字号）

**表单页 / 组件**
- 表单页：`minicare-mp/src/pages/records/feeding/index.tsx`（`tab=formula|breast|food|supplement`；supplement tab 顶部挂载 PRD-018 配置区）
- 区块组件：`FormulaSection` / `BreastSection` / `FoodSection`（`feed-food-chips` 等）/ `SupplementSection` / `SupplementPlanSection`（每日补充计划配置区）
- 补剂清单真源：`minicare-mp/src/pages/records/feeding/types.ts`（`suppItems`——表单、配置区、dashboard 快捷录入共用）

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
- `minicare-server/src/baby/`（每日补充计划读写：`baby.service.ts` 4 处读出口透出 `supplement_plan`、`updateBaby` 写入；`dto/update-baby.dto.ts::SUPPLEMENT_PLAN_KEYS` 白名单）

**数据层**
- `feeding_breast_record` / `feeding_formula_record`(+`feeding_formula_mix`) / `feeding_food_record`(+`feeding_food_item`) / `feeding_supplement_record`，Migration 008
- `baby_profile.supplement_plan`（每日补充计划：JSON key 数组），**Migration 028**

> ⚠️ **`feed_type` 口径陷阱**：`CreateFeedingDto` 只允许 `breast | formula | complementary`，但**读取侧**（timeline / today）把营养素出口为 `feed_type='supplement'`。
> 任何"哪些记录算辅食"的判断都必须以**读取侧**为准：`feed_type === 'complementary'`，并对历史数据额外排除 `complementary_food === '营养素'`。

## 验收标准（AC）

- [x] 4 种喂养类型 Tab 切换
- [x] 母乳：哺乳侧选择 + 时长
- [x] 配方奶：5 种奶粉类型多选 + 勺数（含分数选择器）+ 总奶量步进器
- [x] 配方奶：上次配方缓存与复用
- [x] 辅食：多种食物添加
- [x] 首页喂养条：单行展示**最近一次进食**（喂奶/辅食取更近者；不展示食物名；营养素不重置计时）
- [x] 营养素：8 种预设 + 剂量/单位输入
- [x] 每日补充计划（PRD-018）：记录页配置区（仅新建模式）+ 首页对账（未配置引导条 / 全吃完隐藏 / 未吃差集「另有 N 项」）
- [x] 提交后 Toast "记录已保存" 并 navigateBack
- [x] 支持编辑和删除已有记录

## 相关文件

- 饮食表单：`minicare-mp/src/pages/records/feeding/index.tsx`
- 类型定义：`minicare-mp/src/pages/records/feeding/types.ts`
- API 模块：`minicare-mp/src/api/records/feeding.ts`
- 服务端：`minicare-server/src/records/feeding/`
- 数据库：`minicare-server/migrations/008_schema_redesign.sql`（4 表定义）
