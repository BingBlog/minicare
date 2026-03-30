# DB-02 · 数据库 Schema 说明

> **权威来源（唯一）**：`minicare-server/migrations/001_init_schema.sql`（初始表结构）  
>                         `minicare-server/migrations/002_baby_allergy_fields.sql`（baby_profile 过敏/出生数据字段）
>
> 本文档**不再维护独立 DDL 副本**。所有字段定义、类型约束、索引以上述 migration 文件为准。  
> 如需查看完整建表语句，直接阅读 migration 文件。

---

## 数据库环境

| 环境 | 数据库 | 版本 |
|------|--------|------|
| 本地开发 | MySQL（Docker） | 5.7 |
| 线上生产 | CloudBase MySQL | 8.0 |

两个环境均通过执行相同的 migration 文件初始化，结构完全一致。

---

## 表清单

共 **13 张业务表** + `schema_migrations` 追踪表：

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
| `activity_record` | `activity_type` | `1=bath 2=outdoor 3=play 4=tummy_time 5=other` |
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
