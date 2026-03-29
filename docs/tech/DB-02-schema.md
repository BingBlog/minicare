# DB-02 · 完整建表 DDL

> 来源：DB-01-overview.md 架构决策  
> 数据库：**MySQL（腾讯云 CloudBase 托管）**  
> 客户端镜像：iOS Core Data / Android Room（字段一一对应）；Web H5 无本地数据库  
> 最后同步：2026-03-29（云平台已更新为 CloudBase MySQL）

---

## 说明

- 所有主键为 **`CHAR(36)` UUID**（MySQL 语法，默认值 `(UUID())`），替代原自增 INTEGER
- 所有时间字段类型为 **`DATETIME`**（MySQL 不支持 `TIMESTAMPTZ`，服务层统一以 UTC 存储）
- `BOOLEAN` 改为 **`TINYINT(1)`**（`0=FALSE`, `1=TRUE`）
- `SMALLINT` 保持不变（MySQL 支持）
- `FLOAT` 保持不变（MySQL 支持）
- 外键语法改为 MySQL 格式（`FOREIGN KEY` + `REFERENCES`）
- 条件唯一索引（PostgreSQL `WHERE` 条件索引）改为 MySQL 扩展属性或应用层实现
- 所有照片路径字段改为 **`photo_urls JSON`**（存 CDN URL JSON 数组，替代原 `photo_paths`）
- 移除所有表的 `sync_status` / `last_sync_time` 字段
- 新增 `user_account` 表（原设计缺失）
- 新增 `food_observation` 表（辅食新食物观察期状态机）
- `feeding_record` 拆分为 4 种 feeding_type，母乳字段补全
- `growth_record` 新增 WHO 百分位计算结果字段

---

## 执行顺序（外键依赖顺序）

```sql
-- CloudBase MCP 执行顺序（每次 manageSqlDatabase action="initializeSchema" 按此顺序传入）
-- 1. user_account
-- 2. family_group
-- 3. family_member
-- 4. baby_profile
-- 5. feeding_record / symptom_record / growth_record
--    sleep_record / activity_record / diaper_record
--    health_record / medical_record（并行，均依赖 baby_profile + family_member）
-- 6. food_observation（依赖 feeding_record）
-- sync_log 已移除，共 13 张表
```

---

## DDL

### 1. user_account · 用户账户表

```sql
CREATE TABLE user_account (
    id          CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,  -- UUID v4
    phone       VARCHAR(20) NOT NULL UNIQUE,   -- 大陆手机号，登录凭据
    name        VARCHAR(64) NOT NULL,           -- 用户昵称
    avatar_url  TEXT,                           -- 头像 CDN URL
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 按手机号快速查找
CREATE INDEX idx_user_account_phone ON user_account(phone);
```

**字段说明**：
- `phone`：UNIQUE 约束，作为登录凭据；服务端校验 11 位大陆手机号格式
- `avatar_url`：可选，存储 CloudBase 云存储 CDN URL

---

### 2. family_group · 家庭群组表

```sql
CREATE TABLE family_group (
    id          CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,  -- UUID v4
    name        VARCHAR(64) NOT NULL,                -- 家庭群组名称（如「张家的宝贝」）
    created_by  CHAR(36)    NOT NULL,
    invite_code VARCHAR(16),                         -- 6 位邀请码（备用，主流程走短信）
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fg_created_by FOREIGN KEY (created_by) REFERENCES user_account(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### 3. family_member · 家庭成员表

```sql
CREATE TABLE family_member (
    id             CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,  -- UUID v4
    family_id      CHAR(36)    NOT NULL,
    user_id        CHAR(36),               -- 接受邀请后关联；待接受时为 NULL
    member_name    VARCHAR(32) NOT NULL,   -- 昵称（爸爸/妈妈/奶奶）
    role           TINYINT     NOT NULL CHECK (role IN (0, 1, 2)),
                               -- 0=创建者  1=编辑者  2=查看者
    invite_phone   VARCHAR(20),            -- 被邀请者手机号
    invite_status  TINYINT     NOT NULL DEFAULT 0 CHECK (invite_status IN (0, 1, 2)),
                               -- 0=待接受  1=已接受  2=已拒绝
    invited_by     CHAR(36),              -- 邀请者成员 ID
    joined_at      DATETIME,              -- 接受邀请时写入
    created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_family_user (family_id, user_id),
    CONSTRAINT fk_fm_family  FOREIGN KEY (family_id)  REFERENCES family_group(id)  ON DELETE CASCADE,
    CONSTRAINT fk_fm_user    FOREIGN KEY (user_id)    REFERENCES user_account(id),
    CONSTRAINT fk_fm_inviter FOREIGN KEY (invited_by) REFERENCES family_member(id)
    -- 每个家庭只有一个创建者由应用层保证（MySQL 不支持条件唯一索引）
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_family_member_family ON family_member(family_id);
CREATE INDEX idx_family_member_user   ON family_member(user_id);
CREATE INDEX idx_family_member_invite ON family_member(invite_phone);
```

**权限说明**：
- `role=0`（创建者）：邀请/移除成员、修改宝宝档案、查看和新增所有记录；**唯一，不可转让**
- `role=1`（编辑者）：查看和新增所有记录
- `role=2`（查看者）：仅浏览，不可新增/修改

---

### 4. baby_profile · 宝宝档案表

```sql
CREATE TABLE baby_profile (
    id               CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,  -- UUID v4
    family_id        CHAR(36)    NOT NULL,
    name             VARCHAR(32) NOT NULL,          -- 宝宝姓名
    birth_date       DATE        NOT NULL,          -- 出生日期
    gender           TINYINT     NOT NULL CHECK (gender IN (0, 1)),
                                 -- 0=女  1=男
    allergy_type     TINYINT     NOT NULL DEFAULT 0 CHECK (allergy_type IN (0, 1)),
                                 -- 0=牛奶蛋白过敏  1=其他食物过敏
    allergy_severity TINYINT     CHECK (allergy_severity IN (1, 2, 3)),
                                 -- 1=轻度  2=中度  3=重度  NULL=未知
    created_by       CHAR(36)    NOT NULL,
    created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_bp_family  FOREIGN KEY (family_id)  REFERENCES family_group(id)  ON DELETE CASCADE,
    CONSTRAINT fk_bp_creator FOREIGN KEY (created_by) REFERENCES family_member(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- MVP 每个家庭只有 1 个宝宝（后续迭代去掉此约束以支持多宝宝）
CREATE UNIQUE INDEX idx_baby_profile_family_single ON baby_profile(family_id);

CREATE INDEX idx_baby_profile_family ON baby_profile(family_id);
```

---

### 5. feeding_record · 饮食记录表

```sql
CREATE TABLE feeding_record (
    id                   CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,  -- UUID v4
    baby_id              CHAR(36)    NOT NULL,
    recorded_by          CHAR(36)    NOT NULL,
    record_time          DATETIME    NOT NULL,      -- 喂养时间（支持补录）
    feeding_type         TINYINT     NOT NULL CHECK (feeding_type IN (1, 2, 3, 4)),
                                     -- 1=奶粉  2=母乳  3=营养素  4=辅食

    -- 奶粉字段（feeding_type=1 时有值）
    -- 格式：[{"type":0,"scoops":3,"has_lactose":false},{"type":1,"scoops":1}]
    -- type: 0=氨基酸 1=混合水解 2=适度水解 3=普通
    milk_types           JSON,
    milk_volume          FLOAT       CHECK (milk_volume > 0 AND milk_volume <= 500),  -- 奶量 ml

    -- 母乳字段（feeding_type=2 时有值）
    breastfeed_side      TINYINT     CHECK (breastfeed_side IN (1, 2, 3)),
                                     -- 1=左侧  2=右侧  3=双侧
    breastfeed_duration  SMALLINT    CHECK (breastfeed_duration > 0),  -- 哺乳时长（分钟）

    -- 营养素字段（feeding_type=3 时有值）
    -- 格式：[{"name":"维生素D","dose":400,"unit":"IU"},{"name":"铁","dose":1,"unit":"mg"}]
    nutrient_items       JSON,

    -- 辅食字段（feeding_type=4 时有值）
    complementary_food   VARCHAR(64),           -- 食物名称
    is_new_food          TINYINT(1)  DEFAULT 0, -- 0=否  1=是
    new_food_status      TINYINT     CHECK (new_food_status IN (1, 2, 3, 4)),
                                     -- 1=观察中  2=已耐受  3=疑似过敏  4=确认过敏

    created_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fr_baby     FOREIGN KEY (baby_id)     REFERENCES baby_profile(id),
    CONSTRAINT fk_fr_recorder FOREIGN KEY (recorded_by) REFERENCES family_member(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 最常用查询：某宝宝的时间范围查询
CREATE INDEX idx_feeding_baby_time   ON feeding_record(baby_id, record_time);
CREATE INDEX idx_feeding_recorded_by ON feeding_record(recorded_by);
-- 辅食新食物查询
CREATE INDEX idx_feeding_new_food    ON feeding_record(baby_id, complementary_food);
```

**`milk_types` JSON 结构示例**：
```json
[
  {"type": 0, "scoops": 3},
  {"type": 1, "scoops": 1, "has_lactose": true}
]
```

---

### 6. symptom_record · 表现记录表

```sql
CREATE TABLE symptom_record (
    id            CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,  -- UUID v4
    baby_id       CHAR(36)    NOT NULL,
    recorded_by   CHAR(36)    NOT NULL,
    record_time   DATETIME    NOT NULL,
    -- 格式：["rash","vomiting","diarrhea"]
    -- 预设值：rash=皮疹 vomiting=呕吐 diarrhea=腹泻
    --         cough=咳嗽 wheeze=喘息 eczema=湿疹 other=其他
    symptom_types JSON        NOT NULL,
    severity      SMALLINT    NOT NULL CHECK (severity IN (1, 2, 3)),
                              -- 1=轻度  2=中度  3=重度
    photo_urls    JSON,       -- CDN URL 数组（仅留档，不做 OCR）
    note          TEXT,
    created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_sr_baby     FOREIGN KEY (baby_id)     REFERENCES baby_profile(id),
    CONSTRAINT fk_sr_recorder FOREIGN KEY (recorded_by) REFERENCES family_member(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_symptom_baby_time ON symptom_record(baby_id, record_time DESC);
```

---

### 7. growth_record · 生长数据表

```sql
CREATE TABLE growth_record (
    id                  CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,  -- UUID v4
    baby_id             CHAR(36)    NOT NULL,
    recorded_by         CHAR(36)    NOT NULL,
    record_date         DATE        NOT NULL,
    height              FLOAT       NOT NULL CHECK (height > 0 AND height < 200),   -- cm
    weight              FLOAT       NOT NULL CHECK (weight > 0 AND weight < 50),    -- kg
    head_circumference  FLOAT       NOT NULL CHECK (head_circumference > 0 AND head_circumference < 80),  -- cm
    -- WHO 百分位（保存时由服务端计算写入，0~100 浮点）
    height_percentile   FLOAT       CHECK (height_percentile >= 0 AND height_percentile <= 100),
    weight_percentile   FLOAT       CHECK (weight_percentile >= 0 AND weight_percentile <= 100),
    head_percentile     FLOAT       CHECK (head_percentile >= 0 AND head_percentile <= 100),
    measurement_place   VARCHAR(64),             -- 测量机构（可选）
    photo_urls          JSON,                    -- 最多 3 张报告照片 CDN URL 数组
    created_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- 同一宝宝同一天只允许一条生长记录
    UNIQUE KEY uk_growth_baby_date (baby_id, record_date),
    CONSTRAINT fk_gr_baby     FOREIGN KEY (baby_id)     REFERENCES baby_profile(id),
    CONSTRAINT fk_gr_recorder FOREIGN KEY (recorded_by) REFERENCES family_member(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_growth_baby_date ON growth_record(baby_id, record_date DESC);
```

---

### 8. sleep_record · 睡眠记录表

```sql
CREATE TABLE sleep_record (
    id           CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,  -- UUID v4
    baby_id      CHAR(36)    NOT NULL,
    recorded_by  CHAR(36)    NOT NULL,
    start_time   DATETIME    NOT NULL,
    end_time     DATETIME,               -- 计时进行中时为 NULL
    duration_min SMALLINT    CHECK (duration_min >= 0),  -- 结束后计算写入
    sleep_period TINYINT     CHECK (sleep_period IN (0, 1, 2, 3)),
                             -- 0=夜间  1=上午  2=下午  3=其他
    quality      TINYINT     CHECK (quality IN (1, 2, 3)),
                             -- 1=良好  2=一般  3=较差
    status       VARCHAR(16) NOT NULL CHECK (status IN ('sleeping', 'completed', 'abnormal')),
                             -- sleeping=计时中  completed=正常结束  abnormal=超12h自动标记
    note         TEXT,
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_slr_baby     FOREIGN KEY (baby_id)     REFERENCES baby_profile(id),
    CONSTRAINT fk_slr_recorder FOREIGN KEY (recorded_by) REFERENCES family_member(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 最常用查询
CREATE INDEX idx_sleep_baby_time ON sleep_record(baby_id, start_time DESC);
-- 检测「未结束的睡眠计时」（MySQL 不支持条件索引，应用层过滤 status='sleeping'）
CREATE INDEX idx_sleep_status   ON sleep_record(baby_id, status);
```

> **关键业务规则**：
> - 点击「开始睡眠」**立即写入数据库**（`status = 'sleeping'`），不依赖内存
> - App 冷启动时查询 `status = 'sleeping'` 检测未结束计时，首页显示「进行中」横幅
> - 超过 **12 小时**自动标记为 `status = 'abnormal'`（由服务端定时任务处理）

---

### 9. activity_record · 活动记录表

```sql
CREATE TABLE activity_record (
    id            CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,  -- UUID v4
    baby_id       CHAR(36)    NOT NULL,
    recorded_by   CHAR(36)    NOT NULL,
    record_time   DATETIME    NOT NULL,
    activity_type TINYINT     NOT NULL CHECK (activity_type IN (1, 2, 3)),
                              -- 1=安静  2=正常  3=活跃
    duration_min  SMALLINT    CHECK (duration_min > 0),
    note          TEXT,
    created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ar_baby     FOREIGN KEY (baby_id)     REFERENCES baby_profile(id),
    CONSTRAINT fk_ar_recorder FOREIGN KEY (recorded_by) REFERENCES family_member(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_activity_baby_time ON activity_record(baby_id, record_time DESC);
```

---

### 10. diaper_record · 尿布记录表

```sql
CREATE TABLE diaper_record (
    id               CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,  -- UUID v4
    baby_id          CHAR(36)    NOT NULL,
    recorded_by      CHAR(36)    NOT NULL,
    record_time      DATETIME    NOT NULL,
    diaper_type      TINYINT     NOT NULL CHECK (diaper_type IN (0, 1, 2)),
                                 -- 0=小便  1=大便  2=混合
    stool_count      SMALLINT    CHECK (stool_count >= 0),  -- 0=未排便
    -- 格式：["loose","soft","blood","mucus","hard","normal"]
    stool_types      JSON,
    stool_photo_urls JSON,       -- 大便照片 CDN URL 数组（仅留档，不做 OCR）
    urine_level      TINYINT     CHECK (urine_level IN (1, 2, 3)),
                                 -- 1=少  2=中  3=多
    note             TEXT,
    created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_dr_baby     FOREIGN KEY (baby_id)     REFERENCES baby_profile(id),
    CONSTRAINT fk_dr_recorder FOREIGN KEY (recorded_by) REFERENCES family_member(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_diaper_baby_time ON diaper_record(baby_id, record_time DESC);
```

---

### 11. health_record · 健康记录表

```sql
CREATE TABLE health_record (
    id           CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,  -- UUID v4
    baby_id      CHAR(36)    NOT NULL,
    recorded_by  CHAR(36)    NOT NULL,
    record_time  DATETIME    NOT NULL,
    temperature  FLOAT       CHECK (temperature >= 35.0 AND temperature <= 42.0),  -- ℃
    mood         TINYINT     CHECK (mood IN (1, 2, 3)),
                             -- 1=良好  2=一般  3=低落
    note         TEXT,
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_hr_baby     FOREIGN KEY (baby_id)     REFERENCES baby_profile(id),
    CONSTRAINT fk_hr_recorder FOREIGN KEY (recorded_by) REFERENCES family_member(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_health_baby_time ON health_record(baby_id, record_time DESC);
```

---

### 12. medical_record · 医疗记录表

```sql
CREATE TABLE medical_record (
    id              CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,  -- UUID v4
    baby_id         CHAR(36)    NOT NULL,
    recorded_by     CHAR(36)    NOT NULL,
    visit_date      DATE        NOT NULL,
    visit_type      TINYINT     NOT NULL CHECK (visit_type IN (0, 1, 2, 3)),
                                -- 0=儿保检查  1=过敏相关检查  2=门诊就诊  3=自定义
    institution     VARCHAR(64),                -- 就诊机构
    result_summary  TEXT,                       -- 检查结果摘要
    diagnosis       TEXT,                       -- 诊断结论
    -- 格式：[{"name":"西替利嗪","dose":"2.5ml","frequency":"每日一次"}]
    medication      JSON,
    next_visit_date DATE,                       -- 下次复查日期（写入后可生成本地提醒）
    photo_urls      JSON,                       -- 最多 5 张病历照片 CDN URL 数组（用于 OCR）
    ocr_text        TEXT,                       -- OCR 从照片中提取的原始文字（用户确认前展示）
    note            TEXT,
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_mr_baby     FOREIGN KEY (baby_id)     REFERENCES baby_profile(id),
    CONSTRAINT fk_mr_recorder FOREIGN KEY (recorded_by) REFERENCES family_member(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_medical_baby_date ON medical_record(baby_id, visit_date DESC);
```

> **OCR 说明**：仅医疗记录模块支持拍照 OCR；其他模块照片仅做附件留档，不做 OCR。

---

### 13. food_observation · 辅食新食物观察期表

```sql
CREATE TABLE food_observation (
    id                  CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,  -- UUID v4
    baby_id             CHAR(36)    NOT NULL,
    food_name           VARCHAR(64) NOT NULL,     -- 食物名称（标准化小写存储）
    status              TINYINT     NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3, 4)),
                                    -- 1=观察中  2=已耐受  3=疑似过敏  4=确认过敏
    first_introduced    DATE        NOT NULL,     -- 首次引入日期
    observation_days    SMALLINT    NOT NULL DEFAULT 5 CHECK (observation_days BETWEEN 3 AND 7),
                                    -- 观察期天数（默认5天，用户可在3~7天间调整）
    observation_end     DATE        NOT NULL,     -- 观察期结束日期（first_introduced + observation_days）
    -- 格式：["uuid1","uuid2"] 关联触发此观察期的 feeding_record.id
    related_feeding_ids JSON,
    created_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- 同一宝宝每种食物只有一条观察期记录
    UNIQUE KEY uk_food_obs_baby_food (baby_id, food_name),
    CONSTRAINT fk_fo_baby FOREIGN KEY (baby_id) REFERENCES baby_profile(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_food_obs_baby        ON food_observation(baby_id);
CREATE INDEX idx_food_obs_baby_status ON food_observation(baby_id, status);
```

**状态机流转**：
```
1（观察中）
  → 无表现 + 用户确认 → 2（已耐受）
  → 出现可疑表现       → 3（疑似过敏）
  → 第2次引入仍出现    → 4（确认过敏）
```

---

~~### 14. sync_log~~ · **已移除（v2）**

> **v2 存储策略（联网写入优先）下，`sync_log` 表已整体移除**。
> 写入操作必须联网直接提交云端，不存在离线队列，也不存在冲突需要追踪。
> 云端数据库表数量从 14 张简化为 **13 张**。

---

## 客户端缓存表（iOS / Android）

> **Web H5 无本地缓存**：不使用 IndexedDB 或任何本地数据库，所有数据实时从云端请求；图片依赖浏览器自动缓存机制（HTTP Cache-Control）。本章节仅适用于 iOS 和 Android。

客户端本地缓存表字段与云端表**完全一致，无额外字段**（v2 已移除 `is_deleted` 和 `local_sync_at`）。

---

### 缓存库表全览

| # | 表名 | 缓存类型 | 缓存粒度 | 缓存字段 | 最大行数 | 失效 / 更新时机 |
|---|------|---------|---------|---------|---------|----------------|
| 1 | `baby_profile` | 永久元数据 | 全量 | 全部字段 | 1 | App 启动、宝宝档案编辑成功后 |
| 2 | `family_group` | 永久元数据 | 全量 | 全部字段 | 1 | App 启动、家庭信息变更后 |
| 3 | `family_member` | 永久元数据 | 全量 | 全部字段 | ≤ 10 | App 启动、成员变更（加入/退出）后 |
| 4 | `food_observation` | 永久业务状态 | 全量 | 全部字段 | ≤ 200 | 写入新辅食、状态变更成功后即时追加/更新 |
| 5 | `growth_record` | 永久历史数据 | 全量 | 全部字段（含百分位） | ≤ 365 | 写入生长记录成功后即时追加 |
| 6 | `feeding_record` | 当日全量 + 7天摘要 | 见下表 | 见下表 | 当日≤50 + 7天摘要≤350 | 写入成功后追加；次日 0 点将昨日转为摘要 |
| 7 | `sleep_record` | 当日全量 + 7天摘要 | 见下表 | 见下表 | 当日≤20 + 7天摘要≤140 | 同上 |
| 8 | `activity_record` | 当日全量 + 7天摘要 | 见下表 | 见下表 | 当日≤30 + 7天摘要≤210 | 同上 |
| 9 | `diaper_record` | 当日全量 + 7天摘要 | 见下表 | 见下表 | 当日≤30 + 7天摘要≤210 | 同上 |
| 10 | `health_record` | 当日全量 + 7天摘要 | 见下表 | 见下表 | 当日≤10 + 7天摘要≤70 | 同上 |
| 11 | `symptom_record` | 当日全量 + 7天摘要 | 见下表 | 见下表 | 当日≤10 + 7天摘要≤70 | 同上 |
| 12 | `medical_record` | **不缓存** | — | — | 0 | 每次打开「医疗记录」页面实时请求 |

> **`user_account` 不单独缓存**：当前用户信息（昵称、头像 URL）随 Session Token 存储在 Keychain（iOS）/ EncryptedSharedPreferences（Android），不进数据库。

---

### 业务记录表缓存字段详情

「当日全量」保留完整字段；「7天摘要」仅缓存以下摘要字段（用于首页卡片和简单趋势）：

| 表名 | 当日全量缓存字段 | 7天摘要缓存字段 | 摘要用途 |
|------|---------------|---------------|---------|
| `feeding_record` | 全部字段 | `id`, `record_time`, `feeding_type`, `milk_volume`, `breastfeed_duration`, `complementary_food`, `new_food_status` | 首页时间线卡片（类型 + 奶量/时长）；今日饮食统计 |
| `sleep_record` | 全部字段 | `id`, `start_time`, `end_time`, `duration_min`, `sleep_period`, `status` | 首页「进行中」横幅；今日睡眠时长统计 |
| `activity_record` | 全部字段 | `id`, `record_time`, `activity_type`, `duration_min` | 首页时间线卡片 |
| `diaper_record` | 全部字段 | `id`, `record_time`, `diaper_type`, `stool_count`, `urine_level` | 首页时间线卡片；今日尿布统计 |
| `health_record` | 全部字段 | `id`, `record_time`, `temperature`, `mood` | 首页体温趋势 |
| `symptom_record` | 全部字段 | `id`, `record_time`, `symptom_types`, `severity` | 首页时间线卡片（异常标记） |

> **`photo_urls` 字段**：当日全量和 7 天摘要均**不缓存** `photo_urls`，详见下方图片缓存方案。

---

### 缓存存储量估算

| 分类 | 估算大小 | 备注 |
|------|---------|------|
| 永久元数据（表 1~3） | ~3 KB | 极小，几乎可忽略 |
| 辅食观察期（表 4） | ~20 KB | 每条约 100B × 200 种食物 |
| 生长曲线（表 5） | ~15 KB | 每条约 150B × 100 条（约 3 个月/条） |
| 当日全量记录（表 6~11） | ~50 KB | 每条约 300B × 150 条（单日极限） |
| 7 天摘要记录（表 6~11） | ~80 KB | 每条约 80B × 1050 条 |
| **合计** | **~168 KB** | 远低于 iOS/Android 存储限制 |

---

### 图片缓存方案

#### 现状与问题

`photo_urls` 字段存储的是 CloudBase 云存储 CDN URL，图片本身**不存入本地数据库**。但每次查看记录时重新请求图片会消耗流量、增加延迟。

#### 方案评估

| 方案 | 实现方式 | 优点 | 缺点 | 适合场景 |
|------|---------|------|------|---------|
| **A · 系统 HTTP 缓存（推荐）** | CDN 设置 `Cache-Control: max-age=31536000, immutable`；由 iOS `URLSession` / Android `OkHttp` 自动缓存到磁盘 | **零开发成本**；自动管理缓存大小和过期；与 Web H5 策略一致 | 缓存路径不受控；系统可能在低存储时清除 | MVP 阶段，所有图片类型 |
| **B · 图片库托管缓存** | iOS 使用 `Kingfisher`；Android 使用 `Coil` 或 `Glide`；加载时自动缓存缩略图到磁盘 | API 简单；支持渐进加载、占位图、错误处理；磁盘缓存大小可配置（建议 50MB） | 引入额外依赖库 | MVP 阶段，推荐选择 |
| **C · 手动下载存本地** | 写入记录成功后主动下载图片到 App 沙盒 | 完全离线可用 | 存储占用不可控；删除同步复杂 | ❌ 不适合，过度工程 |

#### ✅ 推荐方案：B（图片库托管缓存）

```
iOS:     pod 'Kingfisher'  → KFImage(url)  → 自动缓存到 ~/Library/Caches/
Android: implementation 'io.coil-kt:coil:2.x'  → AsyncImage(url)  → 自动缓存到 /cache/
```

**缓存配置建议**：
- 磁盘缓存上限：**50 MB**（超出时 LRU 自动淘汰旧图）
- 内存缓存上限：**20 MB**（当前会话快速显示）
- 缓存有效期：**7 天**（7 天未访问的图片自动清除）
- 仅缓存**已加载过的图片**（懒加载，不预取）

**不同图片类型的缓存表现**：

| 图片类型 | 来源字段 | 频繁程度 | 缓存收益 |
|---------|---------|---------|---------|
| 症状/尿布照片 | `photo_urls` | 低（偶尔回看） | 中：避免重复加载 |
| 医疗记录报告 | `photo_urls` | 低（就诊时查看） | 中：文件较大（1~3MB），缓存价值高 |
| 生长测量报告 | `photo_urls` | 低 | 中 |
| 用户头像 | `user_account.avatar_url` | 高（每次进「我的」Tab） | **高**：必须缓存，极频繁 |

#### CDN 设置要求

CloudBase 云存储的 CDN 响应头需配置：

```
Cache-Control: public, max-age=31536000, immutable
```

> 图片上传后 URL 即为永久 URL（包含文件 hash），内容不变，可安全设置长缓存。若需更新照片，应上传新文件（新 URL），不覆盖旧文件。

---

## 字段变更汇总（相较原 architecture.md）

| 变更类型 | 字段/表 | 说明 |
|----------|---------|------|
| ✅ 新增表 | `user_account` | 用户账号（原设计缺失） |
| ✅ 新增表 | `food_observation` | 辅食观察期状态机 |
| 🔄 主键类型变更 | 所有表 `id` | `INTEGER 自增` → `TEXT UUID` |
| 🔄 照片字段重命名 | 所有表 `photo_paths` | → `photo_urls`，存 CDN URL |
| 🔄 时间字段类型 | 所有表 `DATETIME` | PostgreSQL `TIMESTAMPTZ` → MySQL `DATETIME`（服务层统一以 UTC 存储）|
| ❌ 移除字段 | 所有表 `sync_status` / `last_sync_time` | 取消同步管理，不再需要 |
| ❌ 移除整表 | `sync_log` | **v2**：联网写入优先，移除离线队列 |
| ❌ 移除字段 | 客户端表 `is_deleted` / `local_sync_at` | **v2**：缓存只读，无需软删除和同步时间 |
| ✅ 新增字段 | `feeding_record.feeding_type` | 区分奶粉/母乳/营养素/辅食 |
| ✅ 新增字段 | `feeding_record.breastfeed_side/duration` | 母乳记录字段 |
| ✅ 新增字段 | `feeding_record.nutrient_items` | 营养素 JSON 数组（替换原 `nutrient_type` + `nutrient_dose`） |
| ✅ 新增字段 | `feeding_record.is_new_food / new_food_status` | 辅食新食物标记 |
| ✅ 新增字段 | `growth_record.height/weight/head_percentile` | WHO 百分位（服务端计算） |
| ✅ 新增字段 | `family_group.invite_code` | 6位邀请码备用 |
| ✅ 新增约束 | `growth_record` UNIQUE | `(baby_id, record_date)` 同一天只有一条 |
| ✅ 新增约束 | `food_observation` UNIQUE | `(baby_id, food_name)` 每种食物一条记录 |
