# F08 · 表现记录

> 功能 ID：P0-010  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-05-03（对齐小程序实际实现）
>
> **注意**：本模块记录宝宝的情绪和精神状态。数据库使用 `symptom_record` 表，
> mood 和 spirit 字段为 VARCHAR 存储（Migration 008 后从 health_record 独立出来）。

## 功能描述

记录宝宝的情绪状态和精神状况，帮助照护者追踪宝宝的日常表现变化。

**平台实现**：微信小程序（主平台），数据通过 REST API 存入远程 MySQL。

## 情绪状态（mood）

4 种选项，卡片式单选：

| 后端枚举值 | 前端标签 | 说明 |
|-----------|----------|------|
| `happy` | 愉悦满足 | 开心状态 |
| `neutral` | 平静舒适 | 平静状态 |
| `fussy` | 烦躁不开心 | 烦躁状态 |
| `crying` | 痛苦哭闹 | 哭闹状态 |

> 注：前端 constants.ts 中 `MOOD_LABELS` 使用 `calm` 对应后端 `neutral`，存在映射关系。

## 精神状态（spirit）

后端 4 种枚举值，前端展示 3 种选项（含映射）：

| 后端枚举值 | 前端显示 | 映射说明 |
|-----------|----------|----------|
| `active` / `normal` | 状态良好 (good) | 前端 good → 后端 active |
| — | 烦躁不安 (fussy) | 前端 fussy → 后端 tired |
| `lethargic` | 萎靡嗜睡 (lethargic) | 前端 lethargic → 后端 lethargic |

> 注：前端 constants.ts 中 `SPIRIT_LABELS` 使用 `low` 对应后端 `lethargic`。
> 前端组件 `SpiritSection.tsx` 内有 `toBackendSpirit` / `toFrontendSpirit` 映射函数。

## 症状列表（symptoms）

JSON 数组，DTO 中 `@ArrayMinSize(1)` 必填。格式：

```json
[{"type": 6, "severity": 1}]
```

> 当前前端创建表现记录时，默认传入 `[{type:6, severity:1}]` 作为占位值（症状选择 UI 待完善）。

## 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/family/:familyId/records/symptom` | POST | 创建表现记录 |
| `/api/family/:familyId/records/symptom` | GET | 查询表现记录列表 |
| `/api/family/:familyId/records/symptom/:id` | PATCH | 更新记录 |
| `/api/family/:familyId/records/symptom/:id` | DELETE | 删除记录 |

## DTO 字段

**CreateSymptomDto**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `baby_id` | string | 是 | 宝宝 UUID |
| `record_time` | string | 是 | ISO 8601 时间 |
| `symptoms` | object[] | 是 | 症状列表 [{type, severity?}]，@ArrayMinSize(1) |
| `spirit` | enum | 否 | active/normal/tired/lethargic |
| `mood` | enum | 否 | happy/neutral/fussy/crying |
| `photo_ids` | string[] | 否 | 照片 fileID 数组 |
| `note` | string | 否 | 备注 |

## 数据库表

**symptom_record**（Migration 001 + 008）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | CHAR(36) | UUID |
| `baby_id` | CHAR(36) | 关联 baby_profile.id |
| `recorded_by` | CHAR(36) | 操作用户 ID |
| `record_time` | DATETIME | 记录时间 |
| `symptoms` | JSON | 症状列表 |
| `spirit` | VARCHAR(20) | 精神状态 |
| `mood` | VARCHAR(20) | 情绪状态 |
| `photo_ids` | JSON | 照片 fileID 列表 |
| `note` | TEXT | 备注 |

## 前后端枚举映射注意事项

由于历史原因，前后端枚举值存在不一致，需通过映射函数处理：

| 字段 | 前端 constants.ts | 后端 DTO |
|------|------------------|----------|
| mood | calm | neutral |
| spirit | low | lethargic |

## 验收标准（AC）

- [x] 4 种情绪状态卡片式单选
- [x] 3 种精神状态选择
- [x] 提交后 Toast 提示并返回上一页
- [x] 支持编辑和删除已有记录

## 相关文件

- 表现表单：`minicare-mp/src/pages/records/symptom/index.tsx`
- 情绪选择：`minicare-mp/src/pages/records/symptom/MoodSection.tsx`
- 精神选择：`minicare-mp/src/pages/records/symptom/SpiritSection.tsx`
- API 模块：`minicare-mp/src/api/records/symptom.ts`
- 服务端：`minicare-server/src/records/symptom/`
- DTO：`minicare-server/src/records/symptom/dto/create-symptom.dto.ts`
