# DB-03 · Mock 数据与用户故事演练

> 通过完整的用户故事场景，验证数据库表字段设计的合理性
> 最后同步：2026-03-29

---

## 场景设定

**家庭背景**：
- 宝宝：小宝（男，2025-12-16 出生，3 个月 13 天）
- 诊断：牛奶蛋白过敏（中度），目前喝氨基酸奶粉
- 家庭成员：妈妈（创建者）+ 爸爸（编辑者）+ 奶奶（查看者）

---

## 一、基础数据（用户 + 家庭 + 宝宝）

### user_account

| id | phone | name | avatar_url | created_at |
|----|-------|------|-----------|-----------|
| `ua-001` | `13811112222` | 小宝妈妈 | `https://cdn.example.com/avatar/mom.jpg` | `2026-01-01T10:00:00+08` |
| `ua-002` | `13933334444` | 小宝爸爸 | `https://cdn.example.com/avatar/dad.jpg` | `2026-01-01T10:05:00+08` |
| `ua-003` | `13755556666` | 奶奶 | NULL | `2026-01-02T09:00:00+08` |

### family_group

| id | name | created_by | invite_code | created_at |
|----|------|-----------|------------|-----------|
| `fg-001` | 小宝的家 | `ua-001` | `ABC123` | `2026-01-01T10:01:00+08` |

### family_member

| id | family_id | user_id | member_name | role | invite_phone | invite_status | invited_by | joined_at |
|----|----------|---------|------------|------|-------------|--------------|-----------|---------|
| `fm-001` | `fg-001` | `ua-001` | 妈妈 | 0 | NULL | 1 | NULL | `2026-01-01T10:01:00+08` |
| `fm-002` | `fg-001` | `ua-002` | 爸爸 | 1 | `13933334444` | 1 | `fm-001` | `2026-01-01T10:30:00+08` |
| `fm-003` | `fg-001` | `ua-003` | 奶奶 | 2 | `13755556666` | 1 | `fm-001` | `2026-01-02T09:10:00+08` |

**role 枚举**：0=创建者，1=编辑者，2=查看者

### baby_profile

| id | family_id | name | birth_date | gender | allergy_type | allergy_severity | created_by |
|----|----------|------|-----------|--------|-------------|-----------------|-----------|
| `bp-001` | `fg-001` | 小宝 | `2025-12-16` | 1 | 0 | 2 | `fm-001` |

**枚举说明**：
- `gender`: 0=女，1=男
- `allergy_type`: 0=牛奶蛋白过敏，1=其他食物过敏
- `allergy_severity`: 1=轻度，2=中度，3=重度，NULL=未知

---

## 二、用户故事演练

### 故事 1：妈妈早晨喂奶粉（单一类型）

**场景**：08:00 妈妈用氨基酸奶粉 4 勺 + 120ml

```json
// feeding_record
{
  "id": "fr-001",
  "baby_id": "bp-001",
  "recorded_by": "fm-001",
  "record_time": "2026-03-29T08:00:00+08",
  "feeding_type": 1,
  "milk_types": "[{\"type\":0,\"scoops\":4}]",
  "milk_volume": 120,
  "breastfeed_side": null,
  "breastfeed_duration": null,
  "nutrient_items": null,
  "complementary_food": null,
  "is_new_food": false,
  "new_food_status": null
}
```

**milk_types 解析**：
- `type=0`: 氨基酸奶粉
- `scoops=4`: 4 勺

---

### 故事 2：爸爸中午记录转奶过渡（多类型混合）

**场景**：转奶第 3 天，深度水解 1 勺 + 氨基酸 3 勺，奶量 150ml

```json
// feeding_record
{
  "id": "fr-002",
  "baby_id": "bp-001",
  "recorded_by": "fm-002",
  "record_time": "2026-03-29T12:00:00+08",
  "feeding_type": 1,
  "milk_types": "[{\"type\":0,\"scoops\":3},{\"type\":1,\"scoops\":1,\"has_lactose\":false}]",
  "milk_volume": 150
}
```

**milk_types 解析**：
| 类型 | type | scoops | has_lactose |
|------|------|--------|-------------|
| 氨基酸 | 0 | 3 | - |
| 深度水解 | 1 | 1 | false |

**配比计算（应用层）**：总勺数=4，氨基酸 75%，深度水解 25%

---

### 故事 3：妈妈记录母乳喂养

**场景**：15:30 母乳喂养，双侧共 20 分钟

```json
// feeding_record
{
  "id": "fr-003",
  "baby_id": "bp-001",
  "recorded_by": "fm-001",
  "record_time": "2026-03-29T15:30:00+08",
  "feeding_type": 2,
  "milk_types": null,
  "milk_volume": null,
  "breastfeed_side": 3,
  "breastfeed_duration": 20
}
```

**breastfeed_side 枚举**：1=左侧，2=右侧，3=双侧

---

### 故事 4：爸爸首次引入辅食「南瓜泥」

**场景**：14:00 宝宝第一次吃南瓜泥，自动开启 5 天观察期

```json
// feeding_record
{
  "id": "fr-004",
  "baby_id": "bp-001",
  "recorded_by": "fm-002",
  "record_time": "2026-03-29T14:00:00+08",
  "feeding_type": 4,
  "complementary_food": "南瓜泥",
  "is_new_food": true,
  "new_food_status": 1
}

// food_observation（触发创建）
{
  "id": "fo-001",
  "baby_id": "bp-001",
  "food_name": "南瓜泥",
  "status": 1,
  "first_introduced": "2026-03-29",
  "observation_days": 5,
  "observation_end": "2026-04-03",
  "related_feeding_ids": "[\"fr-004\"]"
}
```

**new_food_status 枚举**：1=观察中，2=已耐受，3=疑似过敏，4=确认过敏

---

### 故事 5：妈妈记录营养素补充

**场景**：09:00 补充维生素 D 400IU + 铁 1mg

```json
// feeding_record
{
  "id": "fr-005",
  "baby_id": "bp-001",
  "recorded_by": "fm-001",
  "record_time": "2026-03-29T09:00:00+08",
  "feeding_type": 3,
  "nutrient_items": "[{\"name\":\"维生素D\",\"dose\":400,\"unit\":\"IU\"},{\"name\":\"铁\",\"dose\":1,\"unit\":\"mg\"}]"
}
```

---

### 故事 6：妈妈补录昨晚睡眠记录

**场景**：昨晚 22:30 入睡，今早 06:00 醒来，补录

```json
// sleep_record
{
  "id": "sr-001",
  "baby_id": "bp-001",
  "recorded_by": "fm-001",
  "start_time": "2026-03-28T22:30:00+08",
  "end_time": "2026-03-29T06:00:00+08",
  "duration_min": 450,
  "sleep_period": 0,
  "quality": 1,
  "status": "completed",
  "note": "宝宝睡了整晚，只醒了一次"
}
```

**枚举说明**：
- `sleep_period`: 0=夜间，1=上午，2=下午，3=其他
- `quality`: 1=良好，2=一般，3=较差
- `status`: sleeping/completed/abnormal

---

### 故事 7：爸爸记录换尿布（大便 + 小便混合）

**场景**：10:30 换尿布，大便软便 + 小便中等

```json
// diaper_record
{
  "id": "dr-001",
  "baby_id": "bp-001",
  "recorded_by": "fm-002",
  "record_time": "2026-03-29T10:30:00+08",
  "diaper_type": 2,
  "stool_count": 1,
  "stool_types": "[\"soft\"]",
  "stool_photo_urls": null,
  "urine_level": 2,
  "note": null
}
```

**枚举说明**：
- `diaper_type`: 0=小便，1=大便，2=混合
- `stool_types`: loose/soft/hard/blood/mucus/normal
- `urine_level`: 1=少，2=中，3=多

---

### 故事 8：妈妈记录宝宝出现皮疹

**场景**：第 2 天发现面部皮疹，拍照记录，关联新食物观察期

```json
// symptom_record
{
  "id": "sym-001",
  "baby_id": "bp-001",
  "recorded_by": "fm-001",
  "record_time": "2026-03-30T09:30:00+08",
  "symptom_types": "[\"rash\"]",
  "severity": 1,
  "photo_urls": "[\"https://cdn.example.com/symptom/rash-001.jpg\"]",
  "note": "面部两颊淡红色皮疹"
}

// 触发更新 food_observation
{
  "id": "fo-001",
  "status": 3,
  "updated_at": "2026-03-30T09:35:00+08"
}
```

**symptom_types 预设值**：rash/vomiting/diarrhea/cough/wheeze/eczema/other

---

### 故事 9：妈妈记录生长数据

**场景**：3 个月儿保，身高 65cm，体重 6.8kg，头围 42cm

```json
// growth_record
{
  "id": "gr-001",
  "baby_id": "bp-001",
  "recorded_by": "fm-001",
  "record_date": "2026-03-29",
  "height": 65.0,
  "weight": 6.8,
  "head_circumference": 42.0,
  "height_percentile": 45.2,
  "weight_percentile": 52.8,
  "head_percentile": 48.5,
  "measurement_place": "北京儿童医院",
  "photo_urls": "[\"https://cdn.example.com/growth/report-001.jpg\"]"
}
```

**percentile 字段**：由服务端基于 WHO 标准计算后写入

---

### 故事 10：妈妈记录医疗就诊

**场景**：儿保检查，上传报告照片，OCR 提取文字

```json
// medical_record
{
  "id": "mr-001",
  "baby_id": "bp-001",
  "recorded_by": "fm-001",
  "visit_date": "2026-03-29",
  "visit_type": 0,
  "institution": "北京儿童医院",
  "result_summary": "身高65cm，体重6.8kg，头围42cm。发育正常。",
  "diagnosis": "牛奶蛋白过敏（中度），建议继续氨基酸奶粉",
  "medication": "[{\"name\":\"氯雷他定糖浆\",\"dose\":\"2.5ml\",\"frequency\":\"每日一次\"}]",
  "next_visit_date": "2026-09-29",
  "photo_urls": "[\"https://cdn.example.com/medical/report-001.jpg\"]",
  "ocr_text": "检查日期：2026年3月29日\n姓名：小宝\n身高：65cm\n体重：6.8kg\n特异性IgE：牛奶4.3kU/L"
}
```

**visit_type 枚举**：0=儿保检查，1=过敏相关检查，2=门诊就诊，3=自定义

---

### 故事 11：爸爸记录宝宝活动

**场景**：下午 17:00 趴趴练习 15 分钟，状态活跃

```json
// activity_record
{
  "id": "ar-001",
  "baby_id": "bp-001",
  "recorded_by": "fm-002",
  "record_time": "2026-03-29T17:00:00+08",
  "activity_type": 3,
  "duration_min": 15,
  "note": "趴趴练习，抬头很稳"
}
```

**activity_type 枚举**：1=安静，2=正常，3=活跃

---

### 故事 12：妈妈记录健康状态

**场景**：晚上 20:00 测体温 36.8℃，情绪良好

```json
// health_record
{
  "id": "hr-001",
  "baby_id": "bp-001",
  "recorded_by": "fm-001",
  "record_time": "2026-03-29T20:00:00+08",
  "temperature": 36.8,
  "mood": 1,
  "note": null
}
```

**mood 枚举**：1=良好，2=一般，3=低落

---

## 三、权限控制场景

### 场景：奶奶（查看者）尝试新增记录

**流程**：
1. 奶奶打开 App，点击「饮食记录」
2. 客户端查询 `family_member.role`，发现 `role=2`（查看者）
3. 弹出提示：「查看者无法新增记录，请联系创建者修改权限」
4. 请求在应用层被拒绝，**不会到达数据库层**

**权限矩阵**：

| role | 查看 | 新增 | 编辑 | 删除 | 邀请成员 | 修改档案 |
|------|:----:|:----:|:----:|:----:|:--------:|:--------:|
| 0 创建者 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1 编辑者 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 2 查看者 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 四、离线同步场景

### 场景：妈妈在地铁上离线记录喂奶

**流程**：

1. 妈妈手机无网络，08:0sup0 记录一条奶粉记录
2. 写入本地 SQLite，`sync_log` 新增：
   ```json
   {
     "id": "sl-001",
     "table_name": "feeding_record",
     "record_id": "fr-001",
     "operation_type": 0,
     "operated_by": "fm-001",
     "operated_at": "2026-03-29T08:00:05+08",
     "sync_status": 0
   }
   ```
3. UI 立即响应，显示「保存成功 ✓」
4. 08:30 地铁出站，网络恢复
5. 客户端检测网络状态，读取 `sync_log WHERE sync_status = 0`
6. 批量上传到云端，更新 `sync_status = 1`
7. 云端推送 WebSocket 事件给爸爸、奶奶的设备
8. 爸爸、奶奶客户端收到事件后，拉取这条新记录写入本地缓存

---

## 五、冲突解决场景

### 场景：妈妈和爸爸同时修改同一条记录

**前提**：
- 妈妈手机离线，10:00 修改 `fr-001` 的奶量从 120ml → 150ml
- 爸爸手机在线，10:05 修改 `fr-001` 的奶量从 120ml → 130ml

**冲突**：
- 爸爸 10:05 的修改先到达云端，`updated_at = 10:05`
- 妈妈 10:30 恢复网络，上传修改，`updated_at = 10:00`

**解决策略**：**Last-Write-Wins（以云端 updated_at 为准）**
- 云端 `updated_at = 10:05` > 妈妈的 `updated_at = 10:00`
- 妈妈的修改被拒绝，客户端收到最新版本（130ml）
- 原始冲突数据写入 `sync_log.conflict_data` 存档：
  ```json
  {
    "conflict_data": "{\"milk_volume\":150,\"updated_at\":\"2026-03-29T10:00:00+08\"}"
  }
  ```

---

## 六、字段覆盖检查清单

通过以上用户故事演练，验证所有关键字段均已覆盖：

| 功能模块 | 关键字段 | 覆盖状态 |
|----------|---------|:--------:|
| 奶粉多选 | `milk_types` JSON 数组 | ✅ |
| 深度水解含乳糖 | `has_lactose` 嵌套字段 | ✅ |
| 母乳记录 | `breastfeed_side`, `breastfeed_duration` | ✅ |
| 营养素记录 | `nutrient_items` JSON 数组 | ✅ |
| 辅食新食物 | `is_new_food`, `new_food_status` | ✅ |
| 辅食观察期 | `food_observation` 表 | ✅ |
| 睡眠计时 | `status`, `start_time`, `end_time` | ✅ |
| 尿布记录 | `stool_types`, `urine_level` | ✅ |
| 表现记录 | `symptom_types` JSON 数组 | ✅ |
| 生长百分位 | `height_percentile`, `weight_percentile` | ✅ |
| 医疗 OCR | `photo_urls`, `ocr_text` | ✅ |
| 成员权限 | `family_member.role` | ✅ |
| 记录者标识 | `recorded_by` 所有记录表 | ✅ |
| 离线同步 | `sync_log` 表 | ✅ |
| 冲突解决 | `sync_log.conflict_data`, `server_version` | ✅ |
