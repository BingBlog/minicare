# DB-02 · 数据库 Schema 说明

> **权威来源（唯一）**：`minicare-server/migrations/*.sql`
>
> 本文档**不再维护独立 DDL 副本**。所有字段定义、类型约束、索引以 migration 文件为准。
> 如需查看完整建表语句，直接阅读 migration 文件。
>
> ⚠️ **本文档的"表清单"是历史遗留的局部清单，不等于全库表数。**
> 截至 migration `024`，实际业务表共 **30 张**（`grep -h "CREATE TABLE" migrations/*.sql`）。
> 修复该清单属于独立的文档债，见 `TODO.md`；本次仅补记 PRD-009 新增的 `schedule_template_item`（023 `sort_order` 只加列、不建表）。

---

## 数据库环境

| 环境 | 数据库 | 版本 |
|------|--------|------|
| 本地开发 | MySQL（Docker） | 5.7 |
| 线上生产 | CloudBase MySQL | 8.0 |

两个环境均通过执行相同的 migration 文件初始化，结构完全一致。

---

## 表清单

> ⚠️ 下表为**历史局部清单**（仅覆盖 `001` / `002` 及后续按 PRD 逐个补记的表），**不是全量索引**。
> 全量清单以 migration 目录为准。

| # | 表名 | 说明 | 来自 |
|---|------|------|------|
| 1 | `user_account` | 用户账户（手机号注册） | `001_init_schema.sql` |
| 2 | `family_group` | 家庭群组 | `001_init_schema.sql` |
| 3 | `family_member` | 家庭成员 + 权限 | `001_init_schema.sql` |
| 4 | `baby_profile` | 宝宝档案 | `001_init_schema.sql` + `002_baby_allergy_fields.sql` |
| 5 | `feeding_record` | 喂养记录 | `001_init_schema.sql` |
| 6 | `sleep_record` | 睡眠记录 | `001_init_schema.sql` |
| 7 | `diaper_record` | 尿布记录 | `001_init_schema.sql` |
| 8 | `health_record` | 健康记录（体温/情绪） | `001_init_schema.sql` |
| 9 | `symptom_record` | 症状记录 | `001_init_schema.sql` |
| 10 | `activity_record` | 活动记录 | `001_init_schema.sql` |
| 11 | `growth_record` | 生长数据 | `001_init_schema.sql` |
| 12 | `medical_record` | 病历记录 | `001_init_schema.sql` |
| 13 | `food_observation` | 辅食新食物观察期 | `001_init_schema.sql` |
| 14 | `schedule_template_item` | 宝宝作息计划模板项（PRD-009） | `022_schedule_template.sql` + `023_schedule_sort_order.sql` |

### `schedule_template_item`（migration 022，`sort_order` 由 023 追加，PRD-009）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | CHAR(36) | 主键，UUID 由应用层生成 |
| `baby_id` | CHAR(36) | 关联 `baby_profile.id`，按宝宝隔离（多孩子各自一份作息） |
| `item_type` | VARCHAR(24) | 日程项类型字符串枚举，**共 14 个取值**（6 喂养/3 作息/6 活动/1 其他）。权威清单见 `minicare-server/src/schedule/schedule-item-type.meta.ts`，判定函数见 `schedule-item-type.registry.ts`；新增类型**无需数据迁移** |
| `title` | VARCHAR(50) | 展示名（可自定义，为空时按 `item_type` 推导） |
| `execute_time` | TIME | 执行时间，`HH:mm` |
| `prepare_time` | TIME NULL | 准备时间（可空）；必须严格早于 `execute_time`，不支持跨零点 |
| `prepare_offset_min` | SMALLINT UNSIGNED NULL | 提前准备分钟数（仅 UI 联动推导用；**判定不依赖此列**） |
| `enabled` | TINYINT | `1` 启用 / `0` 停用。停用项不参与 Bar、判定与进度分母 |
| `sort_order` | INT | **展示顺序**（拖拽调整，`0..n-1`；migration 023）。查询为 `ORDER BY sort_order, execute_time, created_at`，故历史行（默认 0）自动退化为"按时间升序" |
| `note` | VARCHAR(200) NULL | 备注 |
| `created_at` / `updated_at` | DATETIME | 时间戳 |
| `deleted_at` | DATETIME NULL | 软删除（migration 012 约定） |

索引：`PRIMARY KEY(id)`、`KEY idx_sched_baby_time(baby_id, execute_time)`、`KEY idx_sched_baby_sort(baby_id, sort_order)`。

> 🔑 **今日状态不落库**：`schedule_template_item` 只存"计划"，当日完成与否由
> `ScheduleService.getToday()` 实时派生（PRD-009 决策 D3）——**两遍配对**：
> ① 判定窗口 `[执行−60, 执行+90]` 内命中；② 同类「未配对且执行时间已到」的项与
> 「未消费记录」各按时间升序**一一顺序配对**（不设偏差上限，口径见 PRD-009 §1.4.2）。
> 判定窗口 60/90 与"同类项间隔 ≥150 分钟"是同一整体，常量唯一定义在
> `minicare-server/src/schedule/schedule.constants.ts`。
>
> ⚠️ `sort_order` 与判定**无关**：顿次判定基准是 `execute_time` 升序，用户怎么拖都不影响"第 N 顿"。保存时按提交数组下标**整体重写** `sort_order`（不做增量 diff，故不建唯一索引）。

---

## 关键字段约定

### 主键
所有表主键均为 `CHAR(36) NOT NULL`，存储 UUID v4 字符串。  
**MySQL 5.7 不支持 `DEFAULT (UUID())`，UUID 必须由应用层生成后传入。**

### 时间字段
- 类型：`DATETIME`（UTC 存储，服务层负责时区转换）
- `created_at` / `updated_at` 使用 `DEFAULT CURRENT_TIMESTAMP` + `ON UPDATE CURRENT_TIMESTAMP`

### TINYINT 枚举字段（重要）

> ⚠️ 所有 `TINYINT` 类型的枚举字段在数据库中存储**整数**，Service 层必须进行双向映射，禁止直接传入字符串。

| 表 | 字段 | 值域 |
|----|------|------|
| `family_member` | `role` | `1=owner 2=member` |
| `family_member` | `status` | `1=pending 2=active 3=left` |
| `baby_profile` | `gender` | `0=unknown 1=male 2=female` |
| `feeding_record` | `feed_type` | `1=breast 2=formula 3=complementary` |
| `feeding_record` | `breast_side` | `1=left 2=right 3=both` |
| `sleep_record` | `status` | `1=ongoing 2=ended` |
| `diaper_record` | `diaper_type` | `1=wet 2=dirty 3=mixed 4=dry` |
| `health_record` | `mood` | `1=happy 2=neutral 3=fussy 4=crying` |
| `activity_record` | `activity_type` | ⚠️ **已废弃此口径** —— `006_activity_type_varchar.sql` 已把它改为 `VARCHAR(20)` 字符串枚举，取值 `gross_motor` / `fine_motor` / `edu_play` / `outdoor` / `bath` / `daily_care` / `other`（`bath` 由 PRD-009 US-06 新增）。新增类型只需扩展枚举，**无需数据迁移** |
| `food_observation` | `status` | `1=observing 2=safe 3=allergic` |

### _openid 字段
所有表均包含 `_openid VARCHAR(256) NULL`，用于 CloudBase 权限管理，**不可删除**。

---

## Migration 执行顺序

执行时需按外键依赖顺序，参见各 migration 文件头部注释。

```
1. user_account
2. family_group
3. family_member
4. baby_profile
5. feeding_record / sleep_record / diaper_record /
   health_record / symptom_record / activity_record /
   growth_record / medical_record（均依赖 baby_profile）
6. food_observation（依赖 baby_profile）
7. schema_migrations（追踪表）
```

本地执行方式：
```bash
cd minicare-server && npm run migrate
```

---

## 客户端缓存表（iOS / Android）

> **Web H5 无本地缓存**：不使用 IndexedDB，所有数据实时从云端请求。本章节仅适用于 iOS 和 Android。

客户端本地缓存表字段与云端表**完全一致**（结构以 migration 文件为准）。

### 缓存策略

| # | 表名 | 缓存类型 | 最大行数 | 更新时机 |
|---|------|---------|---------|---------|
| 1 | `baby_profile` | 永久元数据（全量） | 1 | App 启动、档案编辑成功后 |
| 2 | `family_group` | 永久元数据（全量） | 1 | App 启动、家庭信息变更后 |
| 3 | `family_member` | 永久元数据（全量） | ≤ 10 | App 启动、成员变更后 |
| 4 | `food_observation` | 永久业务状态（全量） | ≤ 200 | 写入/状态变更成功后即时追加 |
| 5 | `growth_record` | 永久历史（全量） | ≤ 365 | 写入成功后即时追加 |
| 6 | `feeding_record` | 当日全量 + 7天摘要 | 当日≤50 + 7天≤350 | 写入成功后追加 |
| 7 | `sleep_record` | 当日全量 + 7天摘要 | 当日≤20 + 7天≤140 | 同上 |
| 8 | `activity_record` | 当日全量 + 7天摘要 | 当日≤30 + 7天≤210 | 同上 |
| 9 | `diaper_record` | 当日全量 + 7天摘要 | 当日≤30 + 7天≤210 | 同上 |
| 10 | `health_record` | 当日全量 + 7天摘要 | 当日≤10 + 7天≤70 | 同上 |
| 11 | `symptom_record` | 当日全量 + 7天摘要 | 当日≤10 + 7天≤70 | 同上 |
| 12 | `medical_record` | **不缓存** | 0 | 按需实时请求 |

> `user_account` 不单独缓存：当前用户信息随 Session Token 存储在系统安全存储中。

### 7天摘要缓存字段

| 表名 | 摘要缓存字段 |
|------|------------|
| `feeding_record` | `id`, `record_time`, `feed_type`, `formula_ml`, `duration_min`, `complementary_food` |
| `sleep_record` | `id`, `start_time`, `end_time`, `duration_min`, `status` |
| `activity_record` | `id`, `record_time`, `activity_type`, `duration_min` |
| `diaper_record` | `id`, `record_time`, `diaper_type` |
| `health_record` | `id`, `record_time`, `temperature`, `mood` |
| `symptom_record` | `id`, `record_time`, `symptoms` |

> `photo_ids` / `photo_urls` 字段均**不缓存**，由图片库（Kingfisher/Coil）按需缓存原始图片文件。

---

## 图片缓存方案

- **iOS**：`Kingfisher`（KFImage）→ 自动缓存到 `~/Library/Caches/`
- **Android**：`Coil`（AsyncImage）→ 自动缓存到 `/cache/`
- 磁盘上限：50 MB；内存上限：20 MB；有效期：7 天
- CDN 需配置：`Cache-Control: public, max-age=31536000, immutable`
