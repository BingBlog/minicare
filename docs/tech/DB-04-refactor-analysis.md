# DB-04 · 数据库设计问题分析与重构计划

> 撰写日期：2026-04-13  
> 角色：资深 DBA（结合业务 PRD + 前端交互逻辑 + 当前 DDL 全量分析）  
> 覆盖 migration：001 ~ 007  
> 状态：**草稿，待评审后执行**

---

## 一、总体结论

当前数据库设计存在 **6 大类问题**，核心矛盾在于：

1. **`feeding_record` 承载了 4 种异质业务**（母乳 / 配方奶 / 辅食 / 营养素），用单表 + 多稀疏字段拼凑，字段耦合严重、数据不完整。
2. **`food_observation` 缺少关键字段**，无法支撑"辅食记录→观察期"闭环逻辑。
3. **辅食量字段类型不匹配**（`SMALLINT` g 无法表达 `泥/勺/份` 等非整数量纲）。
4. **部分枚举仍用 `TINYINT`**，而部分已改为 `VARCHAR`，混用策略不统一。
5. **`growth_record` 缺少 `record_time` 字段**，前端 DTO 已传但数据库无列接收。
6. **索引缺失 / 唯一约束松弛**，部分高频查询无覆盖索引。

---

## 二、逐模块问题明细

### P1 · feeding_record（最严重）

#### 问题 1-A：营养素 Tab 用 `complementary_food='营养素'` 作魔法字符串区分类型

**现状**（`index.tsx` 第 442 行）：
```ts
// 前端：营养素提交时
complementary_food: "营养素",  // ← 魔法字符串！
feed_type: "complementary"     // ← 与辅食共用同一个 feed_type 值
```

**后端判断逻辑**（`initFromRecord` 第 80 行）：
```ts
if (record.complementary_food === "营养素") tab = "supplement";
else tab = "food";
```

**问题**：
- `feed_type=3(complementary)` 同时代表"辅食"和"营养素"两种完全不同的业务，通过字符串内容区分，无法在数据库层面做类型过滤
- SQL 查询"今日营养素记录"需要 `WHERE complementary_food = '营养素'`，性能差、语义混乱
- 营养素的实际数据在 `supplement_items` JSON 字段，`complementary_food` 字段被无意义占用

**影响**：统计报告中无法直接 GROUP BY 区分辅食vs营养素；今日时间轴展示类型混淆。

#### 问题 1-B：辅食记录用 `complementary_food VARCHAR(100)` 存多值列表

**现状**（前端提交，`index.tsx` 第 403 行）：
```ts
complementary_food: foodList.join("、")  // 例："南瓜、西兰花、鸡蛋"
```

**问题**：
- 字段语义是"一种食物名称"（`VARCHAR(100)`），实际存入"顿号分隔多值字符串"
- 长度限制 100 字符不够（多种辅食名称可能超出）
- 无法 JOIN 到 `food_observation` 表做过敏状态查询
- 无法统计"某种食物总被记录多少次"（不能 WHERE food_name = 'xx'，需 LIKE）

#### 问题 1-C：`milk_types` / `milk_scoops` 存储在 `feeding_record` 而非独立行

**现状（004 migration 新增的 JSON 列）**：
```sql
milk_types  JSON  -- ["aa","eh_no_lactose"]
milk_scoops JSON  -- {"aa":3,"eh_no_lactose":0.33}
```

**问题**：
- 转奶阶段的奶粉配比数据无法进行范围查询（如"最近 30 天 AA 奶粉的用量趋势"）
- `milk_scoops` 中存储浮点数（`0.33`），JSON 浮点精度问题可能导致读出 `0.3333333...`
- 无法做 `GROUP BY milk_type` 的聚合统计

#### 问题 1-D：`feed_type` 枚举值 3 语义二义

**DDL**：`TINYINT 1=breast 2=formula 3=complementary`

**现状**：3 既代表"辅食"又代表"营养素"（通过 `complementary_food` 区分）

**建议**：增加第 4 个枚举值 `4=supplement`，或拆表。

#### 问题 1-E：奶量字段类型偏小

**DDL**：`formula_ml SMALLINT NULL`（最大 32767）

- 理论上没问题，但 `SMALLINT` 最大 32767，实际奶量 ≤ 500，有过度预留
- 建议改为 `SMALLINT UNSIGNED`（范围 0~65535）或保持现状，低优先级

---

### P2 · food_observation（观察期表缺字段）

#### 问题 2-A：缺少观察期天数字段

**现状 DDL**：
```sql
first_intro_at DATE NOT NULL  -- 首次引入日期
status TINYINT DEFAULT 1       -- 1=observing 2=safe 3=allergic
```

**PRD 要求**（F03 辅食业务规则）：
> 默认 5 天观察期，可在 3～7 天间**手动调整**

**问题**：数据库中没有 `observation_days` 字段，PRD 中用户可调整的天数无处存储。前端调整后，后端只能把天数写入 `note` 或客户端本地存储，导致数据不完整。

#### 问题 2-B：缺少 `last_intro_at`（最近引入日期）

**PRD 状态机**：
```
[观察期中] → 出现可疑过敏表现 → [疑似过敏]
[疑似过敏] → 第 2 次引入仍出现表现 → [确认过敏]
```

当前无法判断"第几次引入"，因为没有记录最近引入日期（只有首次引入）。

#### 问题 2-C：`food_observation` 与 `feeding_record` 之间缺少关联

`food_observation` 的观察期状态是手动维护的独立记录，与 `feeding_record.complementary_food` 字段之间没有外键或触发器关联。

实际应有的关联路径：
```
feeding_record（辅食 Tab 提交）
  → 检测 food_observation 是否存在对应记录
  → 不存在则自动创建观察期
  → 存在则更新 last_intro_at
```

目前这个关联逻辑完全在前端实现，数据库层面没有约束保障。

#### 问题 2-D：唯一约束用 `food_name` 字符串，大小写/空格不一致会产生重复

**DDL**：
```sql
UNIQUE KEY `uk_food_obs_baby_food` (`baby_id`, `food_name`)
```

`food_name` 为自由文本，用户输入"南瓜"和"南 瓜"、"南瓜泥"会产生 3 条不同的观察期记录，重复问题无法避免。

---

### P3 · diaper_record（枚举/类型问题）

#### 问题 3-A：`diaper_type` 仍用 TINYINT，而新字段 `poop_type` / `butt_condition` 改用 VARCHAR

**混用情况**：
| 字段 | 类型 | 策略 |
|------|------|------|
| `diaper_type` | TINYINT | 整数枚举，需双向映射 |
| `poop_type` | VARCHAR(30) | 字符串枚举，直接存储 |
| `butt_condition` | VARCHAR(30) | 字符串枚举，直接存储 |

**问题**：`diaper_type` 的 `dry` (4) 已从业务中废弃（F06 PRD 中明确注明"已废弃"），但 DDL 注释仍保留 `4=dry`，存量数据可能存在 value=4 的脏数据。

**建议**：`diaper_type` 跟随 006 migration 的策略，改为 VARCHAR 存储 `wet/dirty/mixed`。

#### 问题 3-B：`color` 字段语义模糊，与 `poop_type` 职责重叠

**DDL**：`color VARCHAR(20) NULL`（位于 `001_init_schema.sql`）

**004 migration**：新增了 `poop_type VARCHAR(30)` 字段

**问题**：
- `color` 最初设计为"大便颜色"，但字段名不明确（`stool_color` 更准确）
- 颜色信息（黄色/绿色/棕色）完全可以合并进 `poop_type` 或作为独立枚举，不需要 `VARCHAR(20)` 自由文本
- F06 PRD 验收标准：「颜色可多选（黄色/棕黄/绿色）」→ 但数据库 `color` 是单值字段，无法支持多选颜色

**修复**：将 `color` 改名为 `stool_colors` 并改为 JSON 数组存储（或 VARCHAR 逗号分隔）。

---

### P4 · growth_record（字段缺失）

#### 问题 4-A：缺少 `record_time` 字段，前端 DTO 有但数据库无对应列

**前端 DTO**（`types.ts` 第 411 行）：
```ts
export interface CreateGrowthDto {
  record_date: string   // YYYY-MM-DD
  record_time?: string  // HH:mm ← 前端有此字段
  ...
}
```

**DDL**（`001_init_schema.sql`）：
```sql
CREATE TABLE growth_record (
  record_date DATE NOT NULL,  -- 有日期
  -- 没有 record_time 列！
  ...
)
```

**问题**：用户在前端填写了测量时间（HH:mm），但后端无法保存，数据静默丢失。生长发育报告中的时间轴精度不足。

**修复**：添加 `record_time TIME NULL COMMENT '测量时间（可选）'`。

---

### P5 · health_record（语义混乱）

#### 问题 5-A：`mood` 字段存在于两张表：`health_record` 和 `symptom_record`

| 表 | 字段 | 类型 | 枚举 |
|----|------|------|------|
| `health_record` | `mood` | TINYINT | 1=happy 2=neutral 3=fussy 4=crying |
| `symptom_record` | `mood` | VARCHAR(20) | happy/neutral/fussy/crying |

**问题**：
- 两张表都记录情绪，但情绪属于"表现"范畴，理应只在 `symptom_record` 中
- `health_record.mood` 的 TINYINT 与 `symptom_record.mood` 的 VARCHAR 不统一
- 前端 F07（健康记录）和 F08（表现记录）均有情绪字段，用户可能在两处重复录入

**建议**：健康记录中的 `mood` 字段迁移到 `symptom_record`，`health_record` 专注于体温/过敏/用药/护理。

#### 问题 5-B：`health_record.medications` 与 `medical_record.medications` 字段结构不统一

| 表 | 字段 | 结构 |
|----|------|------|
| `health_record.medications` | JSON | `[{"name":"xx","dose":"xx"}]`（005 migration） |
| `medical_record.medications` | JSON | `[{"name":"xx","dose":"xx"}]`（001 migration） |

**看似一致**，但：
- `health_record` 是记录"每日临时用药"（如退烧药），频率高
- `medical_record` 是记录"就诊处方用药"，与病历绑定
- 两者的 JSON schema 相同但语义不同，缺少区分字段（如用药频次 `frequency`、用药天数 `days`）

---

### P6 · 索引与约束问题

#### 问题 6-A：`family_member` 唯一约束允许 NULL 的 user_id 绕过

**DDL**：
```sql
UNIQUE KEY `uk_family_user` (`family_id`, `user_id`)
```

MySQL 中 `UNIQUE` 约束对 NULL 的处理：多个 NULL 不违反唯一约束。

**问题**：同一个 family 可以有多条 `user_id=NULL` 的 pending 邀请记录，但对相同 `invite_phone` 没有唯一约束，同一个手机号可能被邀请多次。

**修复**：添加 `UNIQUE KEY uk_family_invite_phone (family_id, invite_phone)` 约束。

#### 问题 6-B：`feeding_record` 缺少营养素高频查询索引

当前索引：
```sql
KEY idx_feeding_baby_time (baby_id, record_time)
KEY idx_feeding_new_food (baby_id, complementary_food)
```

缺少的索引：
- `(baby_id, feed_type, record_time)` → 按类型过滤时间段查询（统计报告高频）
- `(baby_id, record_time, feed_type)` → 覆盖索引，减少回表

#### 问题 6-C：`food_observation` 缺少 `status + last_intro_at` 复合索引

当前索引对"观察期中的食物列表"查询（首页提示卡片）：
```sql
KEY idx_food_obs_baby_status (baby_id, status)
```

缺少 `first_intro_at` 在索引中，无法做"观察期超时检测"的高效过期查询。

#### 问题 6-D：`sleep_record` 没有唯一约束防止同时存在多条 `ongoing` 记录

**业务规则**：同一宝宝任意时刻最多一条 `status=ongoing` 记录。

**DDL**：只有 `KEY idx_sleep_status (baby_id, status)`，是普通索引，无唯一约束。

**风险**：网络重试或并发请求可能创建多条进行中睡眠记录，导致首页横幅异常。

**修复**：应用层加锁，或添加部分唯一索引（MySQL 不支持条件唯一索引，可用触发器或应用层幂等控制）。

---

## 三、优化方案汇总

### 方案 A（推荐）：渐进式修复，按优先级分批 migration

不拆表，保持向后兼容，仅补充字段和修复约束。适合当前 MVP 阶段。

| 优先级 | 问题 | 方案 |
|--------|------|------|
| P0（数据丢失） | 4-A: growth_record 缺 record_time | 008 migration：ADD COLUMN record_time |
| P0（数据丢失） | 2-A: food_observation 缺 observation_days | 008 migration：ADD COLUMN observation_days |
| P0（逻辑错误） | 1-A: 营养素用魔法字符串区分 | 008 migration：feed_type 增加值 4=supplement；清洗历史数据 |
| P1（查询问题） | 1-B: 辅食多值存 VARCHAR | 008 migration：新增 food_items JSON 字段 |
| P1（数据质量） | 3-B: color 字段语义模糊 | 008 migration：ADD COLUMN stool_colors JSON |
| P1（完整性） | 2-B: food_observation 缺 last_intro_at | 008 migration：ADD COLUMN last_intro_at |
| P2（一致性） | 3-A: diaper_type 仍为 TINYINT | 009 migration：VARCHAR 化（参考 006） |
| P2（枚举混乱） | 5-A: mood 重复定义 | 规范化（暂不迁移数据，标记 health_record.mood 为 deprecated） |
| P2（约束缺失） | 6-A: family_member 唯一约束 | 008 migration：ADD UNIQUE KEY |
| P2（性能） | 6-B/6-C: 缺少复合索引 | 008 migration：ADD INDEX |

### 方案 B（彻底重构）：拆表

将 `feeding_record` 拆为 4 张独立表：
- `feeding_breast_record`（母乳）
- `feeding_formula_record`（配方奶，含奶粉配比）
- `feeding_food_record`（辅食，含 food_items）
- `feeding_supplement_record`（营养素，含 supplement_items）

**优点**：字段完全对齐业务，无稀疏列，查询干净。  
**缺点**：迁移成本极高，需要同时修改后端 6+ 个模块和前端 API；MVP 阶段不推荐。

**结论：采用方案 A，分 2 个 migration 批次执行**。

---

## 四、执行计划（方案 A）

### Migration 008：核心修复（P0 + P1）

```sql
-- 1. feeding_record：新增 feed_type=4 的支持
--    方式：DDL 注释更新 + 历史数据清洗
ALTER TABLE feeding_record 
  MODIFY COLUMN feed_type TINYINT NOT NULL 
    COMMENT '1=breast 2=formula 3=complementary(辅食) 4=supplement(营养素)';

UPDATE feeding_record 
  SET feed_type = 4 
  WHERE feed_type = 3 AND complementary_food = '营养素';

-- 2. feeding_record：新增辅食多值 JSON 字段（向后兼容）
ALTER TABLE feeding_record
  ADD COLUMN food_items JSON NULL 
    COMMENT '辅食列表，如 ["南瓜","西兰花"]，替代 complementary_food 多值拼接'
    AFTER supplementary_items;

-- 3. growth_record：补 record_time 字段
ALTER TABLE growth_record
  ADD COLUMN record_time TIME NULL 
    COMMENT '测量时间（可选，HH:MM:SS）'
    AFTER record_date;

-- 4. food_observation：补 observation_days 和 last_intro_at
ALTER TABLE food_observation
  ADD COLUMN observation_days TINYINT UNSIGNED NOT NULL DEFAULT 5 
    COMMENT '观察期天数（3~7 天）'
    AFTER first_intro_at,
  ADD COLUMN last_intro_at DATE NULL 
    COMMENT '最近一次引入日期（用于第 2 次引入判断）'
    AFTER observation_days;

-- 5. diaper_record：stool_colors 替代 color 语义（兼容模式）
ALTER TABLE diaper_record
  ADD COLUMN stool_colors JSON NULL 
    COMMENT '大便颜色多选，如 ["yellow","green"]'
    AFTER color;

-- 6. family_member：补充 invite_phone 唯一约束
ALTER TABLE family_member
  ADD UNIQUE KEY uk_family_invite_phone (family_id, invite_phone);

-- 7. feeding_record：补充复合索引
ALTER TABLE feeding_record
  ADD KEY idx_feeding_baby_type_time (baby_id, feed_type, record_time);

-- 8. food_observation：补充复合索引
ALTER TABLE food_observation
  ADD KEY idx_food_obs_status_intro (baby_id, status, first_intro_at);
```

### Migration 009：次优先修复（P2）

```sql
-- 1. diaper_type：TINYINT → VARCHAR（参考 006 strategy）
ALTER TABLE diaper_record
  MODIFY COLUMN diaper_type VARCHAR(10) NOT NULL 
    COMMENT 'wet=嘘嘘 dirty=臭臭 mixed=臭臭+嘘嘘';

UPDATE diaper_record SET diaper_type = 'wet'   WHERE diaper_type = '1';
UPDATE diaper_record SET diaper_type = 'dirty' WHERE diaper_type = '2';
UPDATE diaper_record SET diaper_type = 'mixed' WHERE diaper_type = '3';

-- 2. 清理废弃的 dry 枚举数据
UPDATE diaper_record SET diaper_type = 'mixed' WHERE diaper_type = '4'; -- 或标记为删除

-- 3. health_record.mood 标记为废弃（注释更新）
ALTER TABLE health_record
  MODIFY COLUMN mood TINYINT NULL 
    COMMENT '【已废弃，请使用 symptom_record.mood】1=happy 2=neutral 3=fussy 4=crying';
```

---

## 五、前后端联动改造要点

在执行 008 migration 后，需同步修改以下代码：

### 5.1 后端（minicare-server）

| 模块 | 改动 |
|------|------|
| `records/feeding/feeding.service.ts` | `createFeeding` 中：当 feed_type='supplement' 时，不再写入 `complementary_food='营养素'`；新记录写入 `feed_type=4` |
| `records/feeding/feeding.service.ts` | `findAll` 查询：`feed_type IN (3,4)` 分别返回不同类型 |
| `records/feeding/dto/create-feeding.dto.ts` | FeedType 枚举增加 `supplement` 值 |
| `records/growth/growth.service.ts` | 新增 `record_time` 字段读写 |
| `records/feeding/feeding.service.ts` | 辅食提交：同时写入 `food_items` JSON 字段 |

### 5.2 前端（minicare-web）

| 文件 | 改动 |
|------|------|
| `api/types.ts` | `FeedType` 增加 `'supplement'`；移除魔法字符串判断 |
| `pages/records/feeding/index.tsx` | `initFromRecord` 中移除 `complementary_food === '营养素'` 判断，改为 `feed_type === 'supplement'` |
| `pages/records/feeding/index.tsx` | 营养素提交时 `feed_type: 'supplement'`，不再写 `complementary_food: '营养素'` |
| `pages/records/growth/index.tsx` | `record_time` 字段提交和回填 |
| `api/records/feeding.ts` | 相应 API 调用更新 |

### 5.3 数据清洗注意事项

执行 008 migration 前，必须先执行数据清洗 SQL：
```sql
-- 确认受影响记录数量（不超过预期才继续）
SELECT COUNT(*) FROM feeding_record 
WHERE feed_type = 3 AND complementary_food = '营养素';

-- 清洗（迁移到 feed_type=4）
UPDATE feeding_record 
SET feed_type = 4 
WHERE feed_type = 3 AND complementary_food = '营养素';

-- 同步写入 food_items（对现有辅食记录）
UPDATE feeding_record
SET food_items = JSON_ARRAY(complementary_food)
WHERE feed_type = 3 
  AND complementary_food IS NOT NULL 
  AND complementary_food != ''
  AND JSON_VALID(CONCAT('["', complementary_food, '"]')) = 1;
```

---

## 六、风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 008 UPDATE 误清洗生产数据 | 高 | 先备份表，先在 dev 库验证，再执行生产 |
| 前端仍用旧 `complementary_food='营养素'` 判断 | 高 | 前后端同步部署，使用过渡期双写兼容 |
| `uk_family_invite_phone` 与现有重复数据冲突 | 中 | 先查询重复记录，手工处理后再加约束 |
| growth_record 历史数据 record_time 为 NULL | 低 | 字段设计为 NULL 兼容，无需清洗 |

---

## 七、不做改动的项目（说明理由）

| 问题 | 不改动理由 |
|------|-----------|
| `milk_types/milk_scoops` 改为关系行 | MVP 阶段查询需求不复杂，JSON 列足够；拆表代价 > 收益 |
| `food_observation.food_name` 规范化 | 需要建立食材主表，影响范围大；暂保留自由文本，配合前端辅食库做软约束 |
| `health_record.mood` 物理删除 | 有存量数据，破坏性大；标记废弃即可 |
| `feeding_record` 拆表（方案 B） | 影响全链路，MVP 阶段不做 |

---

*下一步：评审通过后，新建 `008_core_refactor.sql` 执行 P0+P1 修复。*
