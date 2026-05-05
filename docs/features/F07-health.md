# F07 · 健康记录

> 功能 ID：P0-009  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-05-03（对齐小程序实际实现）
>
> **数据库架构**（Migration 005 + 008）：health_record 已结构化改造，
> 新增 allergy_symptoms / allergy_severity / medications / skin_care 字段。
> mood 字段已从 health_record 移除（迁至 symptom_record）。

## 功能描述

记录宝宝的健康状况，包括体温、过敏表现、用药和护肤情况。采用折叠分区设计，体温默认展开，过敏和护理默认折叠。

**平台实现**：微信小程序（主平台），数据通过 REST API 存入远程 MySQL。

## 体温记录

- 数字输入，单位 °C
- 范围 35.0 ~ 42.0
- DECIMAL(4,1) 存储

## 过敏表现

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

JSON 数组，6 种预设选项：

**面部保湿**：凡士林、丝塔芙面霜、其他面部

**身体保湿**：丝塔芙身体乳、凡士林身体乳、其他身体

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

## 交互说明

- 拍照功能：AllergySection 有入口但当前显示"功能开发中"Toast（未实际实现）
- 折叠逻辑：体温区默认展开，过敏和护理区默认折叠，点击标题展开

## 验收标准（AC）

- [x] 体温数字输入（35.0~42.0）
- [x] 9 种过敏症状多选
- [x] 过敏严重程度三级选择
- [x] 用药记录（名称+剂量）
- [x] 护肤记录（6 种预设选项）
- [x] 分区折叠交互
- [x] 提交后 Toast 提示并返回上一页
- [x] 支持编辑和删除已有记录

## 相关文件

- 健康表单：`minicare-mp/src/pages/records/health/index.tsx`
- 过敏区：`minicare-mp/src/pages/records/health/AllergySection.tsx`
- API 模块：`minicare-mp/src/api/records/health.ts`
- 服务端：`minicare-server/src/records/health/`
- DTO：`minicare-server/src/records/health/dto/create-health.dto.ts`
