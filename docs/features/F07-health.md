# F07 · 健康记录

> 功能 ID：P0-009  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-08-22（**拆分为体温/过敏表现两个独立页面，移除保湿护理**）
>
> **来源**：docs/business/MVP-PRD.md §3.8  
> 功能 ID：P0-009  
> 优先级：P0  
> 最后同步：2026-08-20（更新：体温输入交互）
>
> **数据库架构**（Migration 005 + 008）：health_record 已结构化改造，
> 新增 allergy_symptoms / allergy_severity / medications / skin_care 字段。
> mood 字段已从 health_record 移除（迁至 symptom_record）。
>
> **2026-08-22 变更（小程序端）**：原健康综合页拆分为「体温记录」与「过敏表现」两个独立表单页，
> 减少每次填写的信息干扰；**保湿护理（skin_care）表单下线**（数据库列与历史数据保留，仅前端不再采集）。
> 后端 health_record 单表、API、时间轴、报告均不变（字段可空，按维度提交）。
> ⚠️ minicare-web 仍为维护模式，未同步此变更。

## 功能描述

记录宝宝的健康状况。~~采用折叠分区设计，体温默认展开，过敏和护理默认折叠。~~（2026-08-22 起）
拆分为两个独立记录页面：**体温记录**、**过敏表现**，各页面只展示自身维度字段，提交只携带对应字段。

**平台实现**：微信小程序（主平台），数据通过 REST API 存入远程 MySQL。

## 体温记录（独立页面）

- **直接输入**：点击数值框弹出数字键盘（digit，含小数点）直接录入，如 39.2 一次输入完成
- **± 快捷步进**：0.1℃ 步进保留，范围 35.0 ~ 42.0（步进基于当前输入值）
- **输入校验**：仅数字 + 一个小数点、保留 1 位小数、最多 4 字符；失焦时自动 clamp 到 [35.0, 42.0] 并格式化为一位小数；空/非法输入清空
- **单位**：°C；**存储**：DECIMAL(4,1)
- ≥37.5℃ 显示高温警告（实时响应输入）
- 提交时后端 DTO 校验范围，前端校验兜底（"体温范围应为 35~42 度"）
- 页面字段：记录时间 + 体温 + 备注；编辑分流：时间轴/列表点击有体温的健康记录 → 进本页

## 过敏表现（独立页面）

- 页面字段：记录时间 + 9 种症状多选 + 表现程度 + 备注
- 编辑分流：时间轴/列表点击含过敏症状的健康记录 → 进本页
- 历史复合记录（体温+过敏同一条）点击编辑优先进体温页；后端 PATCH 为局部更新，单页编辑不会清空另一维度字段

### 9 种过敏症状（中文字符串多选）

| 选项 |
|------|
| 皮疹/湿疹 |
| 荨麻疹 |
| 腹泻 |
| 呕吐 |
| 鼻塞/流鼻涕 |
| 打喷嚏 |
| 眼睛红肿 |
| 血便 |
| 呼吸急促 |

### 过敏严重程度（allergy_severity）

| 枚举值 | 中文标签 |
|--------|----------|
| `mild` | 轻度 |
| `moderate` | 中度 |
| `severe` | 重度 |

> 注：`allergy_symptoms` 为 JSON 数组，存储中文标签字符串（如 `["皮疹/湿疹","腹泻"]`）

## 用药记录（medications）

JSON 数组，每项包含：
- `name`：药品名称（必填）
- `dose`：剂量描述（可选）

格式：`[{"name":"开瑞坦","dose":"2.5ml"}]`

## 护肤记录（skin_care）

~~JSON 数组，6 种预设选项：~~

~~**面部保湿**：凡士林、丝塔芙面霜、其他面部~~

~~**身体保湿**：丝塔芙身体乳、凡士林身体乳、其他身体~~

> ~~**2026-08-22 已下线**：小程序表单移除保湿护理录入（时间轴/看板/报告本就不展示该字段），
> 数据库列与历史数据保留，不再采集新数据。~~

## 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/family/:familyId/records/health` | POST | 创建健康记录 |
| `/api/family/:familyId/records/health` | GET | 查询健康记录列表 |
| `/api/family/:familyId/records/health/:id` | PATCH | 更新记录 |
| `/api/family/:familyId/records/health/:id` | DELETE | 删除记录 |

## DTO 字段

**CreateHealthDto**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `baby_id` | string | 是 | 宝宝 UUID |
| `record_time` | string | 是 | ISO 8601 时间 |
| `temperature` | number | 否 | 体温 35.0~42.0 |
| `allergy_symptoms` | string[] | 否 | 过敏症状中文标签数组 |
| `allergy_severity` | enum | 否 | mild/moderate/severe |
| `medications` | object[] | 否 | 用药列表 [{name, dose}] |
| `skin_care` | string[] | 否 | 护肤选项数组 |
| `note` | string | 否 | 备注 |

## 数据库表

**health_record**（Migration 005 + 008）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | CHAR(36) | UUID |
| `baby_id` | CHAR(36) | 关联 baby_profile.id |
| `recorded_by` | CHAR(36) | 操作用户 ID |
| `record_time` | DATETIME | 记录时间 |
| `temperature` | DECIMAL(4,1) | 体温 |
| `allergy_symptoms` | JSON | 过敏症状数组 |
| `allergy_severity` | VARCHAR(10) | 过敏严重程度 |
| `medications` | JSON | 用药列表 |
| `skin_care` | JSON | 护肤记录 |
| `note` | TEXT | 备注 |

> 注：原 `mood` 字段已在 Migration 008 中 DROP，情绪记录移至 F08 表现记录（symptom_record）。

## 影响面清单（消费方）

> **改动 F07 任何逻辑前必读**：运行 `node .agents/scripts/impact-scan.mjs health temperature allergy skin_care`
> 核对以下消费点（大小写不敏感匹配，需人工确认），改动后同步更新本清单。
> 本清单为样板（2026-08-22 建立），其余模块清单在迭代中逐步补齐。

**入口层**
- FAB/快捷入口配置：`minicare-mp/src/lib/constants.ts`（RECORD_TYPE_CFG / ALL_QUICK_ACTION_KEYS / GLOBAL_FAB_GROUPS / FAB_GROUPS / FAB_SUBTITLES / HOME_RECORD_ROUTES / HOME_RECORD_MP_ROUTES）
- 路由分发：`minicare-mp/src/pages/records/index.tsx`（MP_ROUTE_MAP）、`minicare-mp/src/lib/navigation.ts`
- 语音入口：`minicare-mp/src/components/VoiceResultSheet/index.tsx`（VOICE_QUICK_TYPES 含 temperature/allergy）
- 看板添加/提醒：`minicare-mp/src/pages/dashboard/index.tsx`（RECORD_PAGE_MAP、SymptomColumn onAdd）、`RemindersColumn.tsx`（"今日体温未记录"→temperature）
- 首页辅食排敏横幅：`minicare-mp/src/pages/home/AllergyProgressBar.tsx`（经 food_observation 间接关联）

**表单页/组件**
- 独立页：`minicare-mp/src/pages/records/health/temperature/index` + `allergy/index`
- 区块组件：`TemperatureSection.tsx` / `AllergySection.tsx`（复用，改动影响两个页面）

**展示层**
- 首页时间线：`minicare-mp/src/pages/home/homeRecords.ts`（getTimelineRecordDisplay / getTimelineIconType 按体温/过敏分流）
- 记录列表：`minicare-mp/src/pages/records/list/recordListDisplay.ts`（label/summary 按维度展示）、`index.tsx`（buildHealthEditUrl 编辑分流）
- 看板聚合：`minicare-mp/src/pages/dashboard/SymptomColumn.tsx`、`useDashboardData.ts`（health 聚合、latestTemp）
- 报告：`minicare-mp/src/pagesReport/HealthTab`（体温曲线，走 report API）
- 游客演示：`minicare-mp/src/pages/records/list/GuestRecordsList.tsx`（demo mock）

**API 层**
- `minicare-mp/src/api/health.ts`（HealthRecord/CreateHealthDto）
- `minicare-mp/src/api/records.ts`（recordsApi.health 聚合）
- **关联**：`minicare-mp/src/api/foodObservation.ts`（health_record_id 链接，辅食排敏引用健康记录）

**后端**
- `minicare-server/src/records/health/`（controller/service/DTO，skin_care 字段已弃用但保留）
- `minicare-server/src/records/timeline/timeline.service.ts`（loadHealthPayload：summary=体温、detail 含症状）
- `minicare-server/src/records/food-observation/food-observation.service.ts`（关联 health_record 写过敏症状）
- `minicare-server/src/family/family.service.ts`（数据回填/导入映射 health_record）
- `minicare-server/src/records/feed/feed.service.ts`（supplement 详情引用 allergy_symptoms 字段结构）

**数据层**
- `health_record` 表（temperature / allergy_symptoms / allergy_severity / medications / skin_care(弃用) / note），Migration 005+008

## 交互说明

- 拍照功能：AllergySection 有入口但当前显示"功能开发中"Toast（未实际实现）
- ~~折叠逻辑：体温区默认展开，过敏和护理区默认折叠，点击标题展开~~（2026-08-22 起综合页删除，改为独立页面）
- 入口：FAB「日常护理→体温」「健康档案→过敏表现」；首页快捷网格"更多"池可选过敏表现；语音未识别时可选"过敏表现"

## 验收标准（AC）

- [x] 体温数字输入（35.0~42.0，支持直接键盘录入 + ± 步进，失焦自动 clamp）
- [x] 9 种过敏症状多选
- [x] 过敏严重程度三级选择
- [x] 体温/过敏表现拆分为独立页面（2026-08-22）
- [x] 保湿护理表单下线（2026-08-22，历史数据保留）
- [x] 时间轴/列表编辑按记录内容分流到对应独立页
- [x] 提交后 Toast 提示并返回上一页
- [x] 支持编辑和删除已有记录
- [x] ~~用药记录（名称+剂量）~~（小程序端暂未实现，字段保留）
- [x] ~~护肤记录（6 种预设选项）~~（已下线）
- [x] ~~分区折叠交互~~（已移除）

## 相关文件

- 体温表单：`minicare-mp/src/pages/records/health/temperature/index.tsx`
- 过敏表单：`minicare-mp/src/pages/records/health/allergy/index.tsx`
- 体温区块：`minicare-mp/src/pages/records/health/TemperatureSection.tsx`
- 过敏区块：`minicare-mp/src/pages/records/health/AllergySection.tsx`
- API 模块：`minicare-mp/src/api/records/health.ts`
- 服务端：`minicare-server/src/records/health/`
- DTO：`minicare-server/src/records/health/dto/create-health.dto.ts`
