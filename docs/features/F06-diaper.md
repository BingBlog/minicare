# F06 · 尿布记录

> 功能 ID：P0-008  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-05-03（对齐小程序实际实现）
>
> **数据库架构**（Migration 008）：diaper_type 已从 TINYINT 迁移为 VARCHAR(10)。
> `color` 单值字段已重构为 `stool_colors` JSON 数组（支持多选）。

## 功能描述

记录宝宝的换尿布情况，包括尿布类型、大便性状和颜色。

**平台实现**：微信小程序（主平台），数据通过 REST API 存入远程 MySQL。

## 尿布类型

| 枚举值 | 中文标签 |
|--------|----------|
| `wet` | 小便（嘘嘘） |
| `dirty` | 大便（臭臭） |
| `mixed` | 混合 |
| `dry` | 干净 |

选择 `dirty` 或 `mixed` 时展开大便详情区域。

## 大便性状（poop_type）

5 种单选：

| 枚举值 | 中文标签 |
|--------|----------|
| `normal` | 正常软便 |
| `loose` | 稀便 |
| `watery` | 水样便 |
| `hard` | 干硬粒 |
| `bloody` | 血丝便 |

## 大便颜色（stool_colors）

JSON 数组，支持多选：

| 枚举值 | 中文标签 |
|--------|----------|
| `yellow` | 黄色 |
| `brown_yellow` | 棕黄色 |
| `green` | 绿色 |

## 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/family/:familyId/records/diaper` | POST | 创建尿布记录 |
| `/api/family/:familyId/records/diaper` | GET | 查询尿布记录列表 |
| `/api/family/:familyId/records/diaper/:id` | PATCH | 更新记录 |
| `/api/family/:familyId/records/diaper/:id` | DELETE | 删除记录 |

## DTO 字段

**CreateDiaperDto**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `baby_id` | string | 是 | 宝宝 UUID |
| `record_time` | string | 是 | ISO 8601 时间 |
| `diaper_type` | enum | 是 | wet/dirty/mixed/dry |
| `diaper_count` | number | 否 | 尿布数量（0~20，步进器） |
| `poop_type` | enum | 否 | 大便性状（dirty/mixed 时选填） |
| `stool_colors` | string[] | 否 | 大便颜色数组（多选） |
| `note` | string | 否 | 备注 |

## 数据库表

**diaper_record**（Migration 008）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | CHAR(36) | UUID |
| `baby_id` | CHAR(36) | 关联 baby_profile.id |
| `recorded_by` | CHAR(36) | 操作用户 ID |
| `record_time` | DATETIME | 记录时间 |
| `diaper_type` | VARCHAR(10) | 尿布类型枚举 |
| `diaper_count` | INT | 尿布数量 |
| `poop_type` | VARCHAR(20) | 大便性状 |
| `stool_colors` | JSON | 颜色数组 |
| `note` | TEXT | 备注 |

## 验收标准（AC）

- [x] 尿布类型 4 选 1（嘘嘘/臭臭/混合/干净）
- [x] 选择臭臭/混合时展开大便详情
- [x] 大便性状 5 选 1
- [x] 颜色可多选（黄色/棕黄/绿色）
- [x] 提交后 Toast 提示并返回上一页
- [x] 支持编辑和删除已有记录

## 相关文件

- 尿布表单：`minicare-mp/src/pages/records/diaper/index.tsx`
- 类型选择：`minicare-mp/src/pages/records/diaper/DiaperTypeSection.tsx`
- 大便详情：`minicare-mp/src/pages/records/diaper/PoopSection.tsx`
- API 模块：`minicare-mp/src/api/records/diaper.ts`
- 服务端：`minicare-server/src/records/diaper/`
