# TECH-007 · 时间线展示统一与类型扩展机制

> 技术方案系列文档
> - 关联：[TECH-002-unified-record-feed-api.md](TECH-002-unified-record-feed-api.md)（Feed API 蓝图，本方案是其收尾与演进）
> - 最后更新：2026-08-22
>
> 状态：**P0 已落地并验证**（Phase 1/2 待实施）

> **P0 执行记录（2026-08-22）**
> - ✅ 修复 `timeline.service.ts` `loadMedicalPayload`/`loadGrowthPayload` 日期拼接 bug（DATE 列改 `formatSqlDate` 转换，`detail_json` 同步输出 `YYYY-MM-DD` 字符串）
> - ✅ 新增迁移 `016_timeline_backfill.sql`：全量重刷物化表（幂等），medical event_time 统一 visit_time 语义、summary_tags 补全「就诊类型/医院/诊断」展示文案（对齐 VISIT_TYPE_LABELS），medication 历史回填 + 孤儿行清理
> - ✅ 端到端验证（dev 环境）：新建带 visit_time 的 medical/growth 记录 → feed type=medical/all、/records/today 均可见；summary tags 完整；删除后物化行同步清除；后端日志无 best_effort warn
>
> **部署记录（2026-08-23）**
> - ✅ 迁移 016 已在 staging（minicare_staging）与生产库（minicare-cloud-6gqledlle0132cbe）执行；production 物化表 medical 3→5、growth 10→14、sleep 431→459 补齐（009 历史遗漏一并修正）
> - ✅ CloudRun 部署 minicare-api（staging）、minicare-api-production 均 normal，/health OK（staging auth_test_mode=true / production=false）
> - ✅ 线上功能验证（staging 域名 + 测试账号）：feed type=medical 返回 5 条，summary tags 含就诊类型 label，问题彻底解决
> - ⚠️ 遗留：staging 服务连的是生产库（既有配置，与 deploy skill §1.3 描述不符）；migrations/ 存在未跟踪的 016_knowledge_base.sql（其他任务遗留）

---

## 一、问题背景

用户反馈三个关联问题：

1. **记录列表页未展示医疗记录项**，但今日时间线中有展示；
2. 今日时间线与记录列表的**时间线基础组件不统一**，展示存在不一致，近期多次改动都在打补丁；
3. 时间线展示项**缺少统一的数据结构定义和扩展机制**，后端数据一变，小程序就要改动+发版（审核成本高）。

本方案基于代码调研 + 开发库数据实证，给出根因、目标架构与分阶段实施路径。

---

## 二、现状调研

### 2.1 两条数据链（后端）

| 链路 | 接口 | 实现 | 读取源 | 消费方 |
|---|---|---|---|---|
| 今日时间线 | `GET /api/family/:fid/records/today` | `family.service.ts getTodayRecords()`（~110 行 UNION ALL SQL） | **直接查 9 张业务表** | 首页 `TodayTimeline.tsx` |
| 记录列表 | `GET /api/family/:fid/records/feed` | `records/feed/feed.service.ts` | **`record_timeline` 物化表**（union 兜底） | 记录列表页 `records/list` |

两条链各自维护 SQL、各自生成 detail、各自计算 event_time 口径，**summary 生成逻辑重复两套**（物化 loader 一套、feed union builder 一套，`/records/today` 则完全不产出 summary）。

### 2.2 三套前端渲染（展示层）

| 位置 | 文件 | 逻辑 |
|---|---|---|
| MP 今日时间线 | `minicare-mp/src/pages/home/homeRecords.ts` | `getTimelineRecordDisplay()` + `getTimelineIconType()`（switch-case 硬编码 9 类） |
| MP 记录列表 | `minicare-mp/src/pages/records/list/recordListDisplay.ts` | `getRecordListParts()` + `getRecordSummary()`（switch-case 硬编码，还反向 import 首页的 `getTimelineIconType`） |
| Web 记录列表 | `minicare-web/src/components/record/RecordContent.tsx` | `getRecordListCompactParts()` + `getRecordSummary()`（第三套，注释称"与 MP 语义一致"） |

三套逻辑靠注释约定"语义一致"，实际**已经不一致**（见 3.3 实证）。

### 2.3 物化链路现状

- `record_timeline` 物化表（迁移 009 创建 + 回填 8 类记录，`ON DUPLICATE KEY UPDATE` 幂等）；
- 写入：各记录模块 create/update/delete 时调 `timeline.service.ts upsertFromSource/removeBySource`；
- 读取：feed 默认 `FEED_READ_SOURCE=timeline`，表缺失/全空时回退 union；
- **但 `/records/today` 不读物化表**——这是"今日有、列表无"的根源之一。

---

## 三、根因分析（含数据实证）

### 3.1 【P0 Bug】物化写入日期拼接错误 → 新医疗记录不进物化表（直接导致问题 1）

**实证**（minicare_dev 开发库，2026-08-22）：

```
medical_record 共 6 条；record_timeline 中 medical 仅 4 条
→ 缺失的 2 条恰好是今天新增（visit_time=11:33 / 10:08）
→ 其余 4 条是 009 迁移回填的历史数据
```

**根因**：`timeline.service.ts loadMedicalPayload()` 中：

```ts
const eventTime = r.visit_time
  ? `${r.visit_date} ${r.visit_time}:00`   // ❌ r.visit_date 是 mysql2 返回的 JS Date 对象
  : `${r.visit_date} 00:00:00`;
```

mysql2 将 DATE/DATETIME 列解析为 JS `Date`，模板字符串拼接产出：

```
"Sat Aug 22 2026 00:00:00 GMT+0800 (China Standard Time) 11:33:00"
```

实测 `CAST(? AS DATETIME)` 该串返回 **NULL** → 插入违反 `event_time NOT NULL` → 抛错 → 默认 `TIMELINE_WRITE_MODE=best_effort` **静默吞掉** → 物化行缺失。

**同款隐患**：`loadGrowthPayload()` 的 `${r.record_date} 00:00:00`（growth 近期无新增，尚未暴露）。其余类型 event_time 直接传 Date 对象，mysql2 可正确序列化，不受影响。

**展示结果**：今日时间线查业务表 → 能看到；列表页查物化表 → 缺失；且物化表有其他类型数据（非空）时，feed 的 `tryListFromTimeline` 空结果回退逻辑**不会触发**，union 兜底救不了。

### 3.2 【架构】双数据源 + 双 event_time 口径

- `/records/today` 与 `/records/feed` 各自计算 event_time：medical 三处口径不一致：
  - today：`CONCAT(visit_date,' ',COALESCE(visit_time,'00:00'),':00')`
  - feed union：`CONCAT(visit_date,' 00:00:00')`（不带 visit_time！）
  - 物化：`visit_time` 有则用，无则 `00:00:00`
- 后续任一类型加时间字段，都要同步改三处。

### 3.3 【架构】三套渲染逻辑已实际分叉

以 medical 为例（2026-08-22 实测）：

| 消费点 | 实际展示 | 原因 |
|---|---|---|
| 今日时间线 | label「医疗」+ tags=[就诊类型 label]（如「儿保检查」） | homeRecords.ts 读 detail.visit_type |
| 记录列表 | label「医疗」+ tags=[hospital]（**无就诊类型、无诊断**） | RecordListItem 优先用后端 `summary.tags`，而物化 summary_tags_json 只有 hospital |
| 文档宣称 | "列表页展示类型/医院/诊断 tags"（F10-medical.md） | **与实现不符** |

TECH-002 蓝图明确要求 `medical → tags=[就诊类型/医院]`，但物化实现只存了 hospital——**设计与实现偏差**。字段级改动（8-22 visit_time）需要同步改 3 个前端文件 + 3 个后端位置，改完仍不一致。

### 3.4 【机制】扩展无注册表、无降级链

新增类型/字段的改动链（当前）：

```
后端 timeline.service(loader) → feed.service(union SQL+builder) → family.service(today UNION)
→ MP homeRecords.ts → MP recordListDisplay.ts → Web RecordContent.tsx → MP/Web constants.ts
```

7+ 处同步改，任一遗漏即产生展示不一致；小程序侧任何展示改动都要走审核发版。

---

## 四、目标架构

**核心原则：后端是展示契约的唯一生产方（summary 物化），前端是契约的通用消费方（统一渲染器 + 类型注册表）。** 这正是 TECH-002 §7 "Mapper 是唯一权威映射层" 蓝图的补完。

```
┌─ 后端（契约生产方）────────────────────────────────────┐
│ 业务表 ──▶ SummaryBuilder(唯一映射层,按类型注册)         │
│              │                                         │
│              ├─▶ record_timeline 物化（summary_* 快照）  │
│              └─▶ /records/today 对齐 FeedItem 契约      │
│ 统一输出: FeedItem { id,type,event_time,note,           │
│                    summary{title,tags,value,unit,       │
│                            theme,active}, detail }      │
└─────────────────────────────────────────────────────────┘
                          │
┌─ 前端（契约消费方）────────────────────────────────────┐
│ TimelineItemView（统一条目组件，卡片/列表两变体）         │
│   ├─ 渲染链: 后端 summary → 默认渲染器 → 类型注册表      │
│   │          专用渲染器 → RECORD_TYPE_CFG 兜底           │
│   └─ RecordTypeMeta registry（type→label/icon/路由/      │
│        renderer），新类型=加一行配置                      │
│ 首页 TodayTimeline 与 列表 RecordListItem 共用同一组件    │
└─────────────────────────────────────────────────────────┘
```

关键契约（与 TECH-002 §4.3 一致，**不再扩展**）：

```ts
interface FeedSummary {
  title: string          // 主标题（后端翻译好的最终文案）
  tags?: string[]        // 标签（后端翻译好的最终文案，扩展字段优先塞这里）
  value?: string         // 右侧数值（如 "120"）
  unit?: string          // 单位（如 "ml"）
  theme?: 'pink'|'warm'|'purple'|'fever'
  active?: boolean       // 高亮态（进行中睡眠/发热）
}
```

**约定**：`summary` 字段一律存**最终展示文案**（后端负责枚举翻译），前端零映射、零 switch-case。

---

## 五、分阶段实施方案

### Phase 0 — 止血（纯后端热修，小程序零发版）

**0.1 修复日期拼接 Bug**（`timeline.service.ts`）

- `loadMedicalPayload`：`const visitDate = formatSqlDate(r.visit_date)`（复用 `medical.service.ts` 已用的 `common/utils/date.util`），再拼接 `${visitDate} ${r.visit_time ?? '00:00'}:00`；
- `loadGrowthPayload`：`const dateStr = formatSqlDate(r.record_date)`，拼接 `${dateStr} 00:00:00`；
- 全局排查 `timeline.service.ts` 是否还有其他模板字符串拼 DATE 列（当前仅上述两处）。

**0.2 物化表回填迁移（Migration 016）**

新增 `016_timeline_backfill.sql`，按业务表**全量重刷**物化行（数据量万级，`ON DUPLICATE KEY UPDATE` 幂等，可重复执行）：

- 复用 009 的 9 段 INSERT...SELECT 模板；
- medical 段 event_time 修正为 `visit_time` 语义（与修复后的 loader 一致）；
- **medical 段 summary_tags_json 补全**：`[就诊类型 label, hospital, diagnosis]`（对齐 TECH-002 §7 蓝图）；
- 补 medication 段（009 时尚未建表）。

> 部署提醒（沿用既有约定）：CloudRun 部署只更新代码不执行迁移，需在目标库手动执行 016 并核对 `schema_migrations`。

**0.3 验证**

- 新增/更新/删除 medical、growth 记录 → 物化行正确增删改（看后端日志不再有 best_effort warn）；
- 小程序列表页（全部 + 医疗 tab）出现今日医疗记录。

### Phase 1 — 统一（契约对齐 + 渲染收敛）

**1.1 后端：SummaryBuilder 单点化**

- 新建 `records/summary/summary.builder.ts`：把 `timeline.service` 各 `loadXxxPayload` 的 summary 计算与 `feed.service.buildXxxSummary` **合并为一份按类型注册的 builder**（medical 的枚举翻译、milk 短名、时长格式化等全部收敛于此）；
- `timeline.service` 与 `feed.service` 都只调用 builder，删除各自重复实现；
- `feed.service` 的 union 回退路径与物化路径输出**同一契约**（union 路径 medical event_time 补 visit_time 语义）。

**1.2 后端：`/records/today` 对齐 FeedItem 契约**

- `getTodayRecords()` 响应改为 `FeedItem[]`（**新增 summary 字段，兼容旧版前端**——旧版忽略 summary 走本地逻辑）；
- 每类 detail 提取后过 SummaryBuilder 产出 summary；
- 保持 UNION 读业务表（**不切物化**），原因：ongoing 睡眠跨天展示（`DATE(start_time) <= today`）在物化表按 event_time 过滤会丢，物化改造放到 Phase 2 后置评估；
- 同步统一三处 medical event_time 口径。

**1.3 前端：统一时间线条目契约与组件**

- 新增 `minicare-mp/src/lib/timeline.ts`：
  - `TimelineItem` 类型（对齐 FeedItem）；
  - `RecordTypeMeta` 注册表：`{ type → { label, icon, editRoute?, renderer? } }`；
  - `resolveTimelineDisplay(item)`：**summary 优先**，缺失时降级到注册表渲染器，再兜底 `RECORD_TYPE_CFG`；
  - `getTimelineIconType` 并入注册表（health→temperature/allergy 等子类型分流保留，作为 icon 解析规则）；
- 新增 `minicare-mp/src/components/TimelineItemView.tsx`：统一条目（icon/label/tags/summary-badge/note/arrow），`variant: 'card' | 'row'` 两个布局变体；
- `TodayTimeline.tsx` 与 `RecordListItem.tsx` 改用 TimelineItemView；删除 `homeRecords.ts getTimelineRecordDisplay()` 的 switch-case（保留 `toHomeRecord` 适配器）、删除 `recordListDisplay.ts getRecordListParts/getRecordSummary()`（fallback 由注册表渲染器承担）；
- 首页 `records/today` 消费方迁移到 TimelineItem（detail 结构不变，编辑路由逻辑不受影响）。

**1.4 Web 端（维护模式，可后置）**

- `RecordContent.tsx` 的 `getRecordListCompactParts/getRecordSummary` 同样切到 summary 优先 + 注册表兜底（若接入后端 summary 字段）。

### Phase 2 — 扩展机制固化

**2.1 类型注册表 + 降级渲染（核心交付）**

- 新增类型接入 = **后端注册 SummaryBuilder + 前端 registry 加一行**（label/icon/editRoute），两处配置，无其他代码；
- **字段级变化（如 medical 加"检查时间"）→ 只改后端 summary.tags**，前端零发版；
- 未知类型降级链：后端 summary → 默认渲染器（title+tags+value 通用渲染，不白屏）→ 编辑入口按 registry 缺失提示"暂不支持编辑"；
- 契约冻结：`summary` 五字段永不拆改，扩展信息一律进 tags（文案由后端翻译）。

**2.2 物化演进（后置评估项）**

- `/records/today` 切物化表：需先解决 ongoing 睡眠跨天（物化行按 start_time 落库，查询按"当天开始 OR 进行中"补齐）与 feed 单日筛选的一致性；数据量大或 today 性能告警时再执行。

**2.3 契约文档化**

- 本方案落为 `docs/tech/TECH-007`（本文）+ 在 F10/F14 等 feature 文档更新"展示层影响面"表格，注明展示数据源为后端 summary 快照。

---

## 六、影响面与回归清单

| 改动 | 影响范围 | 回归点 |
|---|---|---|
| 0.1 日期修复 | timeline.service（后端） | 各类型新增/更新/删除后物化行正确；无 best_effort warn |
| 0.2 迁移 016 | record_timeline 全量重刷 | medical/growth/medication 新旧数据都在；summary_tags 文案正确 |
| 1.1 SummaryBuilder | feed/timeline 两模块 | type=all / 单类型、首屏/翻页、单日筛选输出一致 |
| 1.2 today 契约对齐 | 首页接口 | 今日时间线 9 类展示与列表页一致（含 ongoing 睡眠跨天） |
| 1.3 前端统一组件 | 首页 + 列表页 | 按类型/按时间排序、筛选切换、编辑/删除跳转、空态 |
| 1.4 Web | Web 列表页 | 同上（Web） |

**回归对照表**（统一后各类型在两处的展示应逐项一致）：

| 类型 | 期望展示 |
|---|---|
| feeding-formula | 配方奶 + 勺数 tags + ml |
| feeding-breast | 母乳 + 左/右/双侧 + 时长 |
| feeding-food / supplement | 辅食/营养素 + 食物名 + g |
| sleep | 睡眠(中) + 进行中/质量 + 时长，进行中高亮 |
| diaper | 换尿布 + 嘘嘘/臭臭/干净 + 便便性状 |
| activity | 活动类型 + 时长 |
| health | 体温/过敏表现 + 发热高亮 + ℃ |
| growth | 生长 + 身高/体重/头围 |
| medical | 医疗 + 就诊类型/医院/诊断 |
| medication | 用药 + 药名 + 剂量 |
| symptom | 表现 + 情绪/精神 |

---

## 七、风险与对策

| 风险 | 对策 |
|---|---|
| best_effort 吞错掩盖物化失败 | 修复后临时开 `TIMELINE_WRITE_MODE=strict` 跑一遍回归，观察无 warn 后恢复 |
| 回填迁移覆盖手工修正的物化行 | 全量重刷以业务表为准（业务表是权威源），语义已对齐 loader |
| today 接口响应变更影响旧版小程序 | 仅**新增** summary 字段，旧字段不动；旧版忽略未知字段 |
| 前端删 switch-case 后旧数据展示差异 | 注册表渲染器逐类型对照回归表验证；summary 缺失时降级链保证兜底 |
| 枚举文案改版（如就诊类型改名） | 后端翻译层改一处 + 重刷物化 summary_tags；前端零改动 |

---

## 八、任务拆解（建议顺序）

1. [P0] 修复 timeline.service 日期拼接（medical/growth）
2. [P0] 编写并执行 Migration 016（全量重刷 + medical tags 补全），验证列表页出现医疗记录
3. [P1] 后端 SummaryBuilder 收敛 + today 契约对齐（含 union medical event_time 修正）
4. [P1] 前端 timeline.ts 注册表 + TimelineItemView 组件 + 两页改造
5. [P2] Web 端收敛 + 契约文档更新 + 物化演进评估
