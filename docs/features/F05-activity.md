# F05 · 活动记录

> 功能 ID：P0-003  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-05-03（对齐小程序实际实现）

## 功能描述

记录宝宝的运动发育和日常活动情况，包括活动类型、时长和强度。

**平台实现**：微信小程序（主平台），数据通过 REST API 存入远程 MySQL。

## 活动类型

6 种活动类型（Migration 006 重新定义，VARCHAR 枚举）：

| 枚举值 | 中文标签 | 说明 |
|--------|----------|------|
| `gross_motor` | 大运动练习 | 翻身、爬行、走路等 |
| `fine_motor` | 精细运动练习 | 抓握、拼搭等 |
| `edu_play` | 亲子早教互动 | 阅读、音乐、认知游戏 |
| `outdoor` | 户外活动 | 散步、晒太阳等 |
| `daily_care` | 日常护理 | 洗澡、抚触等 |
| `other` | 其他活动 | 自定义 |

## 活动强度

| 枚举值 | 中文标签 |
|--------|----------|
| `easy` | 轻松 |
| `medium` | 适中 |
| `active` | 活跃 |

## 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/family/:familyId/records/activity` | POST | 创建活动记录 |
| `/api/family/:familyId/records/activity` | GET | 查询活动记录列表 |
| `/api/family/:familyId/records/activity/:id` | PATCH | 更新记录 |
| `/api/family/:familyId/records/activity/:id` | DELETE | 删除记录 |

## DTO 字段

**CreateActivityDto**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `baby_id` | string | 是 | 宝宝 UUID |
| `record_time` | string | 是 | ISO 8601 时间 |
| `activity_type` | enum | 是 | 上述 6 种类型之一 |
| `duration_min` | number | 否 | 时长（分钟），步进器 min=5, max=120, step=5，默认 15 |
| `intensity` | enum | 否 | easy/medium/active |
| `note` | string | 否 | 备注 |

## 数据库表

**activity_record**（Migration 006 + 008）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | CHAR(36) | UUID |
| `baby_id` | CHAR(36) | 关联 baby_profile.id |
| `recorded_by` | CHAR(36) | 操作用户 ID |
| `record_time` | DATETIME | 记录时间 |
| `activity_type` | VARCHAR(20) | 活动类型枚举 |
| `duration_min` | INT | 时长（分钟） |
| `intensity` | VARCHAR(10) | 活动强度 |
| `note` | TEXT | 备注 |

## 验收标准（AC）

- [x] 6 种活动类型可选择（大运动/精细运动/早教/户外/日常护理/其他）
- [x] 活动时长步进器（5-120 分钟，步长 5）
- [x] 活动强度三级选择（轻松/适中/活跃）
- [x] 提交后 Toast 提示并返回上一页
- [x] 支持编辑和删除已有记录

## 相关文件

- 活动表单：`minicare-mp/src/pages/records/activity/index.tsx`
- 类型选择：`minicare-mp/src/pages/records/activity/ActivityTypeSection.tsx`
- 强度选择：`minicare-mp/src/pages/records/activity/IntensitySection.tsx`
- API 模块：`minicare-mp/src/api/records/activity.ts`
- 服务端：`minicare-server/src/records/activity/`
- DTO：`minicare-server/src/records/activity/dto/create-activity.dto.ts`
