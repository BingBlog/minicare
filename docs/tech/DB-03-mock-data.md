# DB-03 · Mock 数据与用户故事演练

> 通过完整的用户故事场景，验证数据库表字段设计的合理性  
> **字段以 `minicare-server/migrations/001_init_schema.sql` 为权威**  
> 最后同步：2026-03-30

---

## 场景设定

**家庭背景**：
- 宝宝：小宝（男，2025-12-16 出生，约 3 个月）
- 诊断：牛奶蛋白过敏（中度），目前喝氨基酸奶粉
- 家庭成员：妈妈（owner）+ 爸爸（member）+ 奶奶（member）

---

## 一、基础数据（用户 + 家庭 + 宝宝）

### user_account

| id | phone | nickname | avatar_url | created_at |
|----|-------|----------|-----------|-----------|
| `ua-001` | `13811112222` | 小宝妈妈 | `https://cdn.example.com/avatar/mom.jpg` | `2026-01-01T10:00:00` |
| `ua-002` | `13933334444` | 小宝爸爸 | `https://cdn.example.com/avatar/dad.jpg` | `2026-01-01T10:05:00` |
| `ua-003` | `13755556666` | 奶奶 | NULL | `2026-01-02T09:00:00` |

> 字段名 `nickname`（非 `name`）；时间以 UTC 存储

### family_group

| id | name | invite_code | created_by | created_at |
|----|------|------------|-----------|-----------|
| `fg-001` | 小宝的家 | `ABC123` | `ua-001` | `2026-01-01T10:01:00` |

> `invite_code` 为 NOT NULL 字段，创建家庭时必须传入

### family_member

| id | family_id | user_id | role | invite_phone | status | invited_by | joined_at |
|----|----------|---------|------|-------------|--------|-----------|---------|
| `fm-001` | `fg-001` | `ua-001` | 1 | NULL | 2 | NULL | `2026-01-01T10:01:00` |
| `fm-002` | `fg-001` | `ua-002` | 2 | `13933334444` | 2 | `ua-001` | `2026-01-01T10:30:00` |
| `fm-003` | `fg-001` | `ua-003` | 2 | `13755556666` | 2 | `ua-001` | `2026-01-02T09:10:00` |

**字段说明**：
- `role`：`1=owner`，`2=member`（DDL 默认值 2）
- `status`：`1=pending`，`2=active`，`3=left`
- `invited_by`：指向 `user_account.id`（非 `family_member.id`）
- 原设计中的 `member_name`、`invite_status` 字段在实际 DDL 中**不存在**

### baby_profile

| id | family_id | name | gender | birth_date | avatar_url | created_by |
|----|----------|------|--------|-----------|-----------|-----------|
| `bp-001` | `fg-001` | 小宝 | 1 | `2025-12-16` | NULL | `ua-001` |

**枚举说明**：
- `gender`：`0=unknown`，`1=male`，`2=female`
- `created_by` 指向 `user_account.id`
- 过敏字段（`allergy_types`、`allergy_level` 等）由 `002_baby_allergy_fields.sql` 增量添加

---

## 二、用户故事演练

### 故事 1：妈妈早晨喂配方奶（formula）

**场景**：08:00 妈妈喂氨基酸奶粉 120ml

```json
// feeding_record
{
  "id": "fr-001",
  "baby_id": "bp-001",
  "recorded_by": "ua-001",
  "record_time": "2026-03-29T08:00:00",
  "feed_type": 2,
  "formula_ml": 120,
  "breast_side": null,
  "duration_min": null,
  "complementary_food": null,
  "amount_g": null,
  "note": null
}
```

**枚举说明**：
- `feed_type`：`1=breast`，`2=formula`，`3=complementary`

---

### 故事 2：妈妈记录母乳喂养

**场景**：15:30 母乳喂养，双侧共 20 分钟

```json
// feeding_record
{
  "id": "fr-002",
  "baby_id": "bp-001",
  "recorded_by": "ua-001",
  "record_time": "2026-03-29T15:30:00",
  "feed_type": 1,
  "breast_side": 3,
  "duration_min": 20,
  "formula_ml": null,
  "complementary_food": null,
  "amount_g": null,
  "note": null
}
```

**`breast_side` 枚举**：`1=left`，`2=right`，`3=both`

---

### 故事 3：爸爸首次引入辅食「南瓜泥」

**场景**：14:00 宝宝第一次吃南瓜泥 30g，自动开启 5 天观察期

```json
// feeding_record
{
  "id": "fr-003",
  "baby_id": "bp-001",
  "recorded_by": "ua-002",
  "record_time": "2026-03-29T14:00:00",
  "feed_type": 3,
  "complementary_food": "南瓜泥",
  "amount_g": 30,
  "breast_side": null,
  "duration_min": null,
  "formula_ml": null,
  "note": "第一次尝试南瓜泥，接受良好"
}

// food_observation（应用层检测新食物后创建）
{
  "id": "fo-001",
  "baby_id": "bp-001",
  "food_name": "南瓜泥",
  "first_intro_at": "2026-03-29",
  "status": 1,
  "reaction_note": null
}
```

**`food_observation.status` 枚举**：`1=observing`，`2=safe`，`3=allergic`

---

### 故事 4：妈妈补录昨晚睡眠记录

**场景**：昨晚 22:30 入睡，今早 06:00 醒来，补录

```json
// sleep_record
{
  "id": "slr-001",
  "baby_id": "bp-001",
  "recorded_by": "ua-001",
  "start_time": "2026-03-28T22:30:00",
  "end_time": "2026-03-29T06:00:00",
  "duration_min": 450,
  "status": 2,
  "note": "宝宝睡了整晚，只醒了一次"
}
```

**`status` 枚举**：`1=ongoing`，`2=ended`

> 原设计中的 `sleep_period`（夜间/上午/下午）、`quality`（良好/一般/较差）字段在实际 DDL 中**不存在**

---

### 故事 5：妈妈开始睡眠计时（实时记录）

**场景**：21:00 宝宝开始入睡，点击「开始」按钮

```json
// sleep_record（立即写入数据库）
{
  "id": "slr-002",
  "baby_id": "bp-001",
  "recorded_by": "ua-001",
  "start_time": "2026-03-29T21:00:00",
  "end_time": null,
  "duration_min": null,
  "status": 1,
  "note": null
}
```

> `status=1`（ongoing）；App 冷启动时查询 `status=1` 检测未结束计时；超 12h 由定时任务自动标记异常

---

### 故事 6：爸爸记录换尿布

**场景**：10:30 换尿布，混合型，大便颜色偏黄

```json
// diaper_record
{
  "id": "dr-001",
  "baby_id": "bp-001",
  "recorded_by": "ua-002",
  "record_time": "2026-03-29T10:30:00",
  "diaper_type": 3,
  "color": "yellow",
  "note": null
}
```

**`diaper_type` 枚举**：`1=wet`，`2=dirty`，`3=mixed`，`4=dry`

> 原设计中的 `stool_count`、`stool_types`、`stool_photo_urls`、`urine_level` 字段在实际 DDL 中**不存在**

---

### 故事 7：妈妈记录宝宝出现皮疹

**场景**：第 2 天发现面部皮疹，拍照记录，触发辅食观察期状态更新

```json
// symptom_record
{
  "id": "sym-001",
  "baby_id": "bp-001",
  "recorded_by": "ua-001",
  "record_time": "2026-03-30T09:30:00",
  "symptoms": [{"type": "rash", "severity": 1}],
  "photo_ids": ["fileID-rash-001"],
  "note": "面部两颊淡红色皮疹"
}

// 触发更新 food_observation（应用层判断后执行）
{
  "id": "fo-001",
  "status": 3,
  "reaction_note": "引入南瓜泥后第2天出现面部皮疹"
}
```

> 照片存储为 CloudBase 云存储 fileID（非 URL），`photo_ids` 字段为 JSON 数组

---

### 故事 8：妈妈记录生长数据

**场景**：3 个月儿保，身高 65cm，体重 6.8kg，头围 42cm

```json
// growth_record
{
  "id": "gr-001",
  "baby_id": "bp-001",
  "recorded_by": "ua-001",
  "record_date": "2026-03-29",
  "weight_g": 6800,
  "height_mm": 650,
  "head_mm": 420,
  "note": "北京儿童医院儿保测量"
}
```

> 单位：`weight_g`（克）、`height_mm`（毫米）、`head_mm`（毫米）  
> 原设计中的 `height`（cm）、`weight`（kg）、`head_circumference`（cm）、百分位字段、`measurement_place` 在实际 DDL 中**不存在**

---

### 故事 9：妈妈记录医疗就诊

**场景**：儿保检查，上传报告照片

```json
// medical_record
{
  "id": "mr-001",
  "baby_id": "bp-001",
  "recorded_by": "ua-001",
  "visit_date": "2026-03-29",
  "hospital": "北京儿童医院",
  "diagnosis": "牛奶蛋白过敏（中度），建议继续氨基酸奶粉",
  "medications": [
    {"name": "氯雷他定糖浆", "dose": "2.5ml"}
  ],
  "photo_ids": ["fileID-medical-001"],
  "note": "下次复查：2026-09-29"
}
```

> 原设计中的 `visit_type`、`result_summary`、`next_visit_date`、`ocr_text`、`photo_urls` 在实际 DDL 中**不存在**  
> 照片存为 CloudBase fileID，字段名为 `photo_ids`（非 `photo_urls`）

---

### 故事 10：爸爸记录宝宝活动

**场景**：下午 17:00 趴趴练习 15 分钟

```json
// activity_record
{
  "id": "ar-001",
  "baby_id": "bp-001",
  "recorded_by": "ua-002",
  "record_time": "2026-03-29T17:00:00",
  "activity_type": 4,
  "duration_min": 15,
  "note": "趴趴练习，抬头很稳"
}
```

**`activity_type` 枚举**：`1=bath`，`2=outdoor`，`3=play`，`4=tummy_time`，`5=other`

> 原设计的「1=安静，2=正常，3=活跃」与实际 DDL 不符

---

### 故事 11：妈妈记录健康状态

**场景**：晚上 20:00 测体温 36.8℃，情绪良好

```json
// health_record
{
  "id": "hr-001",
  "baby_id": "bp-001",
  "recorded_by": "ua-001",
  "record_time": "2026-03-29T20:00:00",
  "temperature": 36.8,
  "mood": 1,
  "note": null
}
```

**`mood` 枚举**：`1=happy`，`2=neutral`，`3=fussy`，`4=crying`

> 原设计的「1=良好，2=一般，3=低落」与实际 DDL 不符（实际有 4 个值）

---

## 三、权限控制场景

### 场景：成员尝试执行超出权限的操作

**当前权限模型**（实际 DDL）：

| role | 说明 |
|------|------|
| `1=owner` | 家庭创建者，拥有全部权限 |
| `2=member` | 普通成员，可查看和新增记录 |

> 注意：实际 DDL 仅有 `owner` 和 `member` 两种角色，不再区分「编辑者」和「查看者」。  
> 若需要细粒度权限（如只读成员），需通过新 migration 扩展 `role` 值域。

**流程**：
1. 客户端查询 `family_member WHERE user_id = ? AND family_id = ? AND status = 2`
2. 获取 `role` 值，在应用层判断权限
3. 不符合权限的操作在 API 层拦截，不下发到数据库

---

## 四、存储策略场景（Cloud-first）

### 场景：妈妈在无网络环境尝试记录

**流程**：

1. 客户端检测网络状态 → 无网络
2. 弹出提示：「当前无网络，请检查网络连接后重试」
3. 表单保持填写状态，**不写入任何本地或云端数据**
4. 网络恢复后，用户重新提交
5. API 写入 CloudBase MySQL 成功
6. WebSocket 广播事件给同 `family_id` 的在线成员
7. 其他成员客户端实时刷新

> `sync_log` 表已从数据模型中**完全移除**（v2 联网写入优先，无离线队列，无冲突解决逻辑）

---

## 五、字段覆盖检查清单

通过以上用户故事演练，验证所有关键字段均已覆盖：

| 功能模块 | 实际字段（DDL 为准） | 覆盖状态 |
|----------|-------------------|:--------:|
| 配方奶记录 | `feed_type=2`, `formula_ml` | ✅ |
| 母乳记录 | `feed_type=1`, `breast_side`, `duration_min` | ✅ |
| 辅食记录 | `feed_type=3`, `complementary_food`, `amount_g` | ✅ |
| 辅食新食物观察期 | `food_observation` 表（`food_name`, `first_intro_at`, `status`, `reaction_note`） | ✅ |
| 睡眠计时（实时） | `status=1(ongoing)`, `start_time`, `end_time=NULL` | ✅ |
| 睡眠补录 | `status=2(ended)`, `duration_min` | ✅ |
| 尿布记录 | `diaper_type`, `color` | ✅ |
| 症状记录 | `symptoms` JSON, `photo_ids` JSON | ✅ |
| 生长数据 | `weight_g`, `height_mm`, `head_mm` | ✅ |
| 健康记录 | `temperature`, `mood`（4值枚举） | ✅ |
| 活动记录 | `activity_type`（5值枚举） | ✅ |
| 医疗记录 | `hospital`, `diagnosis`, `medications` JSON, `photo_ids` JSON | ✅ |
| 成员权限 | `family_member.role`（1=owner, 2=member） | ✅ |
| 记录者标识 | `recorded_by → user_account.id` | ✅ |
| 照片存储 | `photo_ids`（CloudBase fileID） | ✅ |
