# DB-04 · 数据库设计问题分析与重构计划

> ⚠️ **[已实施 · IMPLEMENTED]** 本分析已通过 `008_schema_redesign.sql` 落地实施。
> 重构内容：feeding_record 拆分为 4 表、TINYINT 枚举迁移为 VARCHAR、索引优化等。
> 当前数据库 Schema 以 migration 008 为准，详见 `DB-01-overview.md`。

> 撰写日期：2026-04-13（更新：按未上线最佳实践全量重写）  
> 角色：资深 DBA（结合业务 PRD + 前端交互逻辑 + 当前 DDL 全量分析）  
> 覆盖 migration：001 ~ 007  
> 前提：**开发验证阶段，未正式上线，无历史数据迁移约束，按长远最佳实践设计**  
> 状态：**已实施** — 通过 `008_schema_redesign.sql` 于 2026-04-15 完成重建

---

## 一、设计原则

| 原则 | 说明 |
|------|------|
| **类型语义清晰** | 枚举字段统一用 `VARCHAR` 存储字符串枚举值，废弃全部 TINYINT 魔法数字 |
| **一表一业务** | `feeding_record` 的 4 个业务 Tab 对应 4 张独立表，消灭稀疏列 |
| **JSON 仅用于真正无结构数据** | 奶粉配比、辅食列表改为关联行；营养素/症状列表保留 JSON |
| **字段名即文档** | 字段名直接反映业务语义（`color` → `stool_colors`；情绪字段归一到 symptom） |
| **约束完备** | 唯一性、非空、外键在数据库层面保障，不依赖应用层单点控制 |
| **索引覆盖高频查询** | 所有 `baby_id + 时间范围` 报告查询均有覆盖索引 |

---

## 二、问题清单

### 问题 1：feeding_record 一表四业务（最严重）

`feeding_record` 用 `feed_type` 区分 4 种完全异质的饮食记录：

| feed_type 值 | Tab | 有效字段 | 空置字段（NULL） |
|---|---|---|---|
| `1=breast` | 母乳 | `breast_side`, `duration_min` | `formula_ml`, `complementary_food`, `amount_g`, `milk_types`, `milk_scoops`, `supplement_items` |
| `2=formula` | 配方奶 | `formula_ml`, `milk_types`, `milk_scoops`, `duration_min` | `breast_side`, `complementary_food`, `amount_g`, `supplement_items` |
| `3=complementary` | 辅食 | `complementary_food`, `amount_g` | 几乎所有其他字段 |
| `3=complementary` + 魔法字符串 | 营养素 | `supplement_items` | 几乎所有其他字段 |

**核心缺陷**：

- 每行平均 60%+ 字段为 NULL，违反第一范式
- 营养素与辅食共用 `feed_type=3`，靠魔法字符串 `complementary_food='营养素'` 区分，SQL 层无法直接过滤类型
- `milk_scoops JSON` 存浮点数（`0.33` = 1/3 勺），JSON 浮点精度丢失；无法 `GROUP BY milk_type` 做配比趋势分析
- `complementary_food VARCHAR(100)` 前端拼接多值（"南瓜、西兰花"），无法 JOIN `food_observation` 做过敏查询，无法统计单种食物频次，100 字符上限不够

**修复方案**：拆为 4 张主表 + 2 张明细关联表（见第三节）。

---

### 问题 2：food_observation 缺少关键字段 + 状态不完整

| 缺失内容 | 影响 |
|----------|------|
| `observation_days` 字段 | PRD 要求 3~7 天可调整，无处持久化用户设置 |
| `last_intro_at` 字段 | 无法判断"第几次引入"，`疑似过敏 → 确认过敏` 的条件缺失 |
| `intro_count` 字段 | 辅助判断过敏程度，报告页展示需要 |
| `suspected` 状态值 | 原枚举只有 `1=observing/2=safe/3=allergic` 三态，PRD 状态机定义四态（缺 `suspected=疑似过敏`） |

---

### 问题 3：diaper_record 枚举策略混用 + color 字段设计错误

| 字段 | 当前类型 | 问题 |
|------|----------|------|
| `diaper_type` | TINYINT（含已废弃的 `4=dry`） | 与同表的 `poop_type VARCHAR`、`butt_condition VARCHAR` 策略不一致 |
| `color VARCHAR(20)` | 自由文本单值 | F06 PRD 要求颜色**多选**（黄/棕黄/绿），单值字段无法支持；字段名语义模糊 |

---

### 问题 4：growth_record 缺少 record_time（数据静默丢失）

前端 DTO 有 `record_time?: string`（HH:mm），数据库无此列，**用户填写的测量时间被后端静默丢弃**。

---

### 问题 5：health_record.mood 与 symptom_record.mood 重复且类型不一致

| 表 | mood 类型 | 枚举格式 |
|----|-----------|---------|
| `health_record` | TINYINT `1=happy 2=neutral 3=fussy 4=crying` | 整数 |
| `symptom_record` | VARCHAR(20) `happy/neutral/fussy/crying` | 字符串 |

情绪状态属于"宝宝表现"范畴，语义归属 `symptom_record`。`health_record` 应专注体温/过敏/用药/护理，`health_record.mood` 应**删除**。

---

### 问题 6：约束与索引不完备

| 位置 | 问题 | 风险 |
|------|------|------|
| `family_member` | `UNIQUE(family_id, user_id)` 对 NULL 失效，同一手机号可被重复邀请 | pending 记录堆积 |
| `sleep_record` | 无约束防止同一宝宝多条 `ongoing` 并存 | 首页睡眠横幅异常 |
| `feeding_record`（旧） | 缺少 `(baby_id, feed_type, record_time)` 覆盖索引 | 报告页全表扫描 |
| `food_observation` | 缺少 `(baby_id, status, first_intro_at)` 复合索引 | 观察期超时检测慢查询 |

---

## 三、目标 Schema（最佳实践版）

### 3.1 feeding_record → 拆为 4 张主表 + 2 张明细表

#### feeding_breast_record（母乳记录）

```sql
CREATE TABLE `feeding_breast_record` (
  `id`           CHAR(36)          NOT NULL,
  `baby_id`      CHAR(36)          NOT NULL,
  `recorded_by`  CHAR(36)          NOT NULL,
  `record_time`  DATETIME          NOT NULL  COMMENT '哺乳开始时间',
  `breast_side`  VARCHAR(10)       NOT NULL  COMMENT 'left=左侧 right=右侧 both=双侧',
  `duration_min` SMALLINT UNSIGNED NULL      COMMENT '哺乳时长（分钟，0~120）',
  `note`         TEXT              NULL,
  `created_at`   DATETIME          NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME          NOT NULL  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`      VARCHAR(256)      NULL      COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_breast_baby_time` (`baby_id`, `record_time`),
  KEY `idx_breast_recorder`  (`recorded_by`),
  CONSTRAINT `fk_fbr_baby`     FOREIGN KEY (`baby_id`)     REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_fbr_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='母乳记录';
```

#### feeding_formula_record（配方奶主记录）

```sql
CREATE TABLE `feeding_formula_record` (
  `id`           CHAR(36)          NOT NULL,
  `baby_id`      CHAR(36)          NOT NULL,
  `recorded_by`  CHAR(36)          NOT NULL,
  `record_time`  DATETIME          NOT NULL  COMMENT '喂养开始时间',
  `end_time`     DATETIME          NULL      COMMENT '喂养结束时间（可选）',
  `duration_min` SMALLINT UNSIGNED NULL      COMMENT '喂养时长（分钟）',
  `formula_ml`   SMALLINT UNSIGNED NULL      COMMENT '奶量（毫升，0~500）',
  `note`         TEXT              NULL,
  `created_at`   DATETIME          NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME          NOT NULL  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`      VARCHAR(256)      NULL      COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_formula_baby_time` (`baby_id`, `record_time`),
  KEY `idx_formula_recorder`  (`recorded_by`),
  CONSTRAINT `fk_ffr_baby`     FOREIGN KEY (`baby_id`)     REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_ffr_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='配方奶记录主表（奶粉配比见 feeding_formula_mix）';
```

#### feeding_formula_mix（奶粉配比明细）

> **设计重点**：原 `milk_types JSON` + `milk_scoops JSON` 改为关联行。`DECIMAL(4,2)` 精确存储 0.25/0.33/0.50 等分数勺数，彻底解决 JSON 浮点精度问题。配比行独立后，`GROUP BY milk_type` 分析转奶趋势成为普通 SQL 聚合查询。

```sql
CREATE TABLE `feeding_formula_mix` (
  `id`        CHAR(36)     NOT NULL,
  `record_id` CHAR(36)     NOT NULL  COMMENT '关联 feeding_formula_record.id',
  `milk_type` VARCHAR(20)  NOT NULL  COMMENT 'aa=氨基酸 eh_no_lactose=深度水解无乳糖 eh_lactose=深度水解含乳糖 ph=适度水解 std=普通奶粉',
  `scoops`    DECIMAL(4,2) NOT NULL  COMMENT '勺数（DECIMAL 精确存储小数，避免 JSON 浮点精度问题）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mix_record_type` (`record_id`, `milk_type`),
  KEY `idx_mix_milk_type`         (`milk_type`),
  CONSTRAINT `fk_ffm_record` FOREIGN KEY (`record_id`)
    REFERENCES `feeding_formula_record` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='配方奶配比明细（每行一种奶粉，随主记录级联删除）';
```

#### feeding_food_record（辅食主记录）

```sql
CREATE TABLE `feeding_food_record` (
  `id`          CHAR(36)     NOT NULL,
  `baby_id`     CHAR(36)     NOT NULL,
  `recorded_by` CHAR(36)     NOT NULL,
  `record_time` DATETIME     NOT NULL  COMMENT '辅食记录时间',
  `note`        TEXT         NULL,
  `created_at`  DATETIME     NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`     VARCHAR(256) NULL      COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_food_baby_time` (`baby_id`, `record_time`),
  KEY `idx_food_recorder`  (`recorded_by`),
  CONSTRAINT `fk_ffd_baby`     FOREIGN KEY (`baby_id`)     REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_ffd_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='辅食记录主表（食物列表见 feeding_food_item）';
```

#### feeding_food_item（辅食食物明细）

> **设计重点**：原 `complementary_food VARCHAR(100)` 多值字符串改为关联行。`food_name` 独立成行后可直接 `JOIN food_observation ON food_name` 查询过敏状态，可按食物名统计历史引入频次。`amount_g DECIMAL(6,1)` 支持 0.5g 精度（原 `SMALLINT` 无法表达半克）。

```sql
CREATE TABLE `feeding_food_item` (
  `id`          CHAR(36)     NOT NULL,
  `record_id`   CHAR(36)     NOT NULL  COMMENT '关联 feeding_food_record.id',
  `food_name`   VARCHAR(100) NOT NULL  COMMENT '食物名称',
  `amount_g`    DECIMAL(6,1) NULL      COMMENT '进食量（克，支持 0.5g 精度；NULL=未记录）',
  `amount_note` VARCHAR(50)  NULL      COMMENT '描述性量纲（如"半碗""一勺"，无法精确克数时填写）',
  PRIMARY KEY (`id`),
  KEY `idx_food_item_record` (`record_id`),
  KEY `idx_food_item_name`   (`food_name`),
  CONSTRAINT `fk_ffi_record` FOREIGN KEY (`record_id`)
    REFERENCES `feeding_food_record` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='辅食食物明细（每行一种食物，food_name 可软关联 food_observation）';
```

#### feeding_supplement_record（营养素记录）

> `supplement_items` 保留 JSON——营养素种类用户可自由扩展（支持"其他"自定义），是真正的无固定结构列表，不适合拆行。

```sql
CREATE TABLE `feeding_supplement_record` (
  `id`               CHAR(36)     NOT NULL,
  `baby_id`          CHAR(36)     NOT NULL,
  `recorded_by`      CHAR(36)     NOT NULL,
  `record_time`      DATETIME     NOT NULL  COMMENT '营养素记录时间',
  `supplement_items` JSON         NOT NULL  COMMENT '[{"key":"vitD","label":"维生素D","dose":"400","unit":"IU"}]',
  `note`             TEXT         NULL,
  `created_at`       DATETIME     NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NOT NULL  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`          VARCHAR(256) NULL      COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_supplement_baby_time` (`baby_id`, `record_time`),
  KEY `idx_supplement_recorder`  (`recorded_by`),
  CONSTRAINT `fk_fsr_baby`     FOREIGN KEY (`baby_id`)     REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_fsr_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='营养素记录';
```

---

### 3.2 food_observation（补全缺失字段 + 新增状态值）

```sql
CREATE TABLE `food_observation` (
  `id`               CHAR(36)          NOT NULL,
  `baby_id`          CHAR(36)          NOT NULL,
  `food_name`        VARCHAR(100)      NOT NULL  COMMENT '食物名称（与 feeding_food_item.food_name 软关联）',
  `first_intro_at`   DATE              NOT NULL  COMMENT '首次引入日期',
  `last_intro_at`    DATE              NULL      COMMENT '最近一次引入日期（用于判断第几次引入）',
  `intro_count`      SMALLINT UNSIGNED NOT NULL  DEFAULT 1  COMMENT '累计引入次数',
  `observation_days` TINYINT UNSIGNED  NOT NULL  DEFAULT 5  COMMENT '观察期天数（用户可调，3~7 天）',
  `status`           VARCHAR(20)       NOT NULL  DEFAULT 'observing'
                                                 COMMENT 'observing=观察期中 safe=已耐受 suspected=疑似过敏 allergic=确认过敏',
  `reaction_note`    TEXT              NULL      COMMENT '过敏反应描述',
  `created_at`       DATETIME          NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME          NOT NULL  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`          VARCHAR(256)      NULL      COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_food_obs_baby_food`   (`baby_id`, `food_name`),
  KEY `idx_food_obs_baby_status`       (`baby_id`, `status`),
  KEY `idx_food_obs_status_intro`      (`baby_id`, `status`, `first_intro_at`),
  CONSTRAINT `fk_fo_baby` FOREIGN KEY (`baby_id`) REFERENCES `baby_profile` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='辅食新食物观察期状态机';
```

**变更说明**：
- `status` 从 `TINYINT 1/2/3` 改为 `VARCHAR(20)` 字符串枚举
- **新增 `suspected`（疑似过敏）状态**，补全 PRD 四态状态机
- 新增 `last_intro_at`、`intro_count`、`observation_days` 三个缺失字段

---

### 3.3 diaper_record（枚举统一 + color 修正）

```sql
-- diaper_type: TINYINT → VARCHAR，移除废弃的 dry(4)
ALTER TABLE `diaper_record`
  MODIFY COLUMN `diaper_type` VARCHAR(10) NOT NULL
    COMMENT 'wet=嘘嘘 dirty=臭臭 mixed=臭臭+嘘嘘';

-- color（自由文本单值）→ stool_colors（JSON 多选数组）
ALTER TABLE `diaper_record`
  CHANGE COLUMN `color` `stool_colors` JSON NULL
    COMMENT '大便颜色多选，如 ["yellow","brown","green"]';

-- poop_type: 枚举值长度收紧
ALTER TABLE `diaper_record`
  MODIFY COLUMN `poop_type` VARCHAR(20) NULL
    COMMENT 'normal=正常 loose=稀便 watery=水样便 hard=干硬粒 bloody=血丝便';
```

---

### 3.4 growth_record（补 record_time）

```sql
ALTER TABLE `growth_record`
  ADD COLUMN `record_time` TIME NULL
    COMMENT '测量时间（可选，如 09:30:00）'
    AFTER `record_date`;
```

---

### 3.5 health_record（删除重复的 mood 字段）

```sql
ALTER TABLE `health_record`
  DROP COLUMN `mood`;
```

`health_record` 职责收窄为：**体温 + 过敏反应 + 用药 + 护理**，情绪状态统一由 `symptom_record.mood` 记录。

---

### 3.6 全库枚举字段 TINYINT → VARCHAR（一次性统一）

```sql
ALTER TABLE `baby_profile`
  MODIFY COLUMN `gender` VARCHAR(10) NULL
    COMMENT 'unknown=未知 male=男 female=女';

ALTER TABLE `family_member`
  MODIFY COLUMN `role` VARCHAR(10) NOT NULL DEFAULT 'member'
    COMMENT 'owner=创建者 member=普通成员';

ALTER TABLE `family_member`
  MODIFY COLUMN `status` VARCHAR(10) NOT NULL DEFAULT 'pending'
    COMMENT 'pending=待接受 active=已激活 left=已离开';

ALTER TABLE `sleep_record`
  MODIFY COLUMN `status` VARCHAR(10) NOT NULL DEFAULT 'ongoing'
    COMMENT 'ongoing=进行中 ended=已结束';
```

---

### 3.7 约束补全

```sql
-- family_member：同一家庭不允许对同一手机号重复邀请
ALTER TABLE `family_member`
  ADD UNIQUE KEY `uk_family_invite_phone` (`family_id`, `invite_phone`);
```

---

## 四、枚举规范汇总

**全库枚举字段统一为 VARCHAR，消除 TINYINT 整数映射，后端 Service 层可删除所有双向映射函数。**

| 表 | 字段 | 新类型 | 枚举值 |
|---|---|---|---|
| `baby_profile` | `gender` | VARCHAR(10) | `unknown / male / female` |
| `family_member` | `role` | VARCHAR(10) | `owner / member` |
| `family_member` | `status` | VARCHAR(10) | `pending / active / left` |
| `feeding_breast_record` | `breast_side` | VARCHAR(10) | `left / right / both` |
| `feeding_formula_mix` | `milk_type` | VARCHAR(20) | `aa / eh_no_lactose / eh_lactose / ph / std` |
| `sleep_record` | `status` | VARCHAR(10) | `ongoing / ended` |
| `diaper_record` | `diaper_type` | VARCHAR(10) | `wet / dirty / mixed` |
| `diaper_record` | `poop_type` | VARCHAR(20) | `normal / loose / watery / hard / bloody` |
| `diaper_record` | `butt_condition` | VARCHAR(20) | `normal / slightly_red / rash / severe_rash / fungal / other` |
| `activity_record` | `activity_type` | VARCHAR(20) | `gross_motor / fine_motor / edu_play / outdoor / daily_care / other` |
| `health_record` | `mood` | — | **删除**（归入 symptom_record） |
| `symptom_record` | `mood` | VARCHAR(20) | `happy / neutral / fussy / crying` |
| `symptom_record` | `spirit` | VARCHAR(20) | `active / normal / tired / lethargic` |
| `food_observation` | `status` | VARCHAR(20) | `observing / safe / suspected / allergic` |

---

## 五、重构后 ER 关系图

```
Layer 0 · 账户层
└── user_account

Layer 1 · 家庭层
├── family_group
└── family_member

Layer 2 · 宝宝层
└── baby_profile

Layer 3 · 业务记录层（均含 baby_id + recorded_by）
├── feeding_breast_record          母乳记录
├── feeding_formula_record         配方奶主记录
│     └── feeding_formula_mix      配比明细（每奶粉类型一行，CASCADE 删除）
├── feeding_food_record            辅食主记录
│     └── feeding_food_item        食物明细（每种食物一行，CASCADE 删除）
├── feeding_supplement_record      营养素记录
├── sleep_record                   睡眠记录
├── activity_record                活动记录
├── diaper_record                  尿布记录
├── health_record                  健康记录（体温/过敏/用药/护理，无 mood）
├── symptom_record                 表现记录（症状/精神 spirit/情绪 mood）
├── growth_record                  生长数据（补 record_time）
└── medical_record                 医疗记录

Layer 4 · 衍生逻辑层
└── food_observation               辅食观察期状态机（四态，含 suspected）

关联关系：
feeding_formula_mix.record_id ──(外键 CASCADE)──> feeding_formula_record.id
feeding_food_item.record_id   ──(外键 CASCADE)──> feeding_food_record.id
feeding_food_item.food_name   ──(软关联，按名称)──> food_observation.food_name
```

---

## 六、执行计划

### 步骤一：008_schema_redesign.sql（直接重建）

未上线，直接 DROP + CREATE，无需历史数据迁移。执行顺序（按外键依赖）：

```
1.  DROP TABLE feeding_record                     -- 删旧大表
2.  CREATE TABLE feeding_breast_record
3.  CREATE TABLE feeding_formula_record
4.  CREATE TABLE feeding_formula_mix
5.  CREATE TABLE feeding_food_record
6.  CREATE TABLE feeding_food_item
7.  CREATE TABLE feeding_supplement_record
8.  DROP TABLE food_observation
9.  CREATE TABLE food_observation                 -- 重建（含新字段和四态状态）
10. ALTER TABLE diaper_record                     -- diaper_type + color → stool_colors
11. ALTER TABLE growth_record                     -- 补 record_time
12. ALTER TABLE health_record DROP COLUMN mood
13. ALTER 全库 TINYINT 枚举 → VARCHAR             -- gender / role / status / sleep.status
14. ADD UNIQUE KEY uk_family_invite_phone
15. INSERT INTO schema_migrations ('008_schema_redesign')
```

完整 DDL 见：`minicare-server/migrations/008_schema_redesign.sql`

---

### 步骤二：后端代码联动改造

| 模块 | 改动 |
|------|------|
| `records/feeding/` | 拆为 4 个子模块：`breast/` `formula/` `food/` `supplement/`，各自独立 DTO / Service / Controller |
| `records/feeding/formula/` | Service 新增 `feeding_formula_mix` 关联行的写入与查询；删除 `milk_types/milk_scoops` JSON 操作 |
| `records/feeding/food/` | Service 新增 `feeding_food_item` 行操作；删除 `complementary_food` 拼接字符串逻辑 |
| `records/growth/` | 新增 `record_time` 字段读写 |
| `records/diaper/` | `diaper_type` 直接透传字符串，不再做 TINYINT 映射；`color` 改为 `stool_colors`（JSON 数组） |
| `records/health/` | 删除 `mood` 字段的读写 |
| `food-observation/` | 新增 `last_intro_at`/`intro_count`/`observation_days` 字段处理；`status` 新增 `suspected` 枚举分支 |
| **全部 Service** | **删除所有 TINYINT↔字符串双向映射函数**（`mapFeedType`/`mapGender`/`mapDiaperType` 等）；直接透传字符串枚举 |
| `today-timeline/` `report/` | 更新 UNION ALL 查询：从 4 张饮食子表分别 SELECT，用表名标识 feed_type |

---

### 步骤三：前端代码联动改造

| 文件 | 改动 |
|------|------|
| `api/types.ts` | 新增 `FeedingBreastRecord`/`FeedingFormulaRecord`/`FeedingFoodRecord`/`FeedingSupplementRecord` 接口；删除旧的大 `FeedingRecord` 接口和 `FeedType` 联合类型 |
| `api/records/feeding.ts` | 按子类型拆为 4 个 API 模块，各自独立 `create/update/delete/getById` |
| `pages/records/feeding/index.tsx` | 移除 `complementary_food='营养素'` 魔法字符串判断；按 4 个模块路由到对应 API |
| `pages/records/feeding/FormulaSection.tsx` | `milk_types/milk_scoops` 改为 `feeding_formula_mix` 明细行结构 |
| `pages/records/feeding/FoodSection.tsx` | `foodList.join('、')` 改为 `feeding_food_item[]` 数组结构 |
| `pages/records/growth/index.tsx` | `record_time` 字段提交和回填 |
| `pages/records/diaper/DiaperTypeSection.tsx` | `stool_colors` 改为 JSON 数组（多选支持） |
| 所有含 TINYINT 枚举的页面 | 移除 TINYINT↔字符串映射，直接使用字符串枚举值 |

---

## 七、风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 008 SQL 误执行到生产库 | 高 | 脚本头部显式 `USE minicare_dev`，执行前三次确认连接的是 dev 库 |
| 前端仍用旧 `complementary_food='营养素'` 魔法判断 | 高 | 前后端同步部署，不允许仅部署后端；后端旧接口不保留兼容 |
| `uk_family_invite_phone` 与现有 dev 数据冲突 | 中 | 执行前先 `SELECT` 查重，手工清理后再加唯一约束 |
| `growth_record` 历史数据 `record_time` 为 NULL | 低 | 字段设计为 NULL 兼容，无需清洗 |
| 外键约束顺序错误导致 DROP 失败 | 低 | SQL 文件头部执行 `SET FOREIGN_KEY_CHECKS=0`，末尾恢复 `SET FOREIGN_KEY_CHECKS=1` |

---

## 八、下一步行动

1. **评审本文档** → 确认新 Schema 无遗漏
2. **执行** `minicare-server/migrations/008_schema_redesign.sql`（在 `minicare_dev` 开发库验证）
3. **后端代码改造**（按步骤二清单）
4. **前端代码改造**（按步骤三清单）
5. **联调验证**：4 种饮食记录的增删改查、辅食观察期四态流转、尿布多选颜色
6. **确认无误后**，将同一 SQL 在 Staging 库执行，再同步部署 CloudRun
