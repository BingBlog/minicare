# F03 · 饮食记录

> 功能 ID：P0-004 ~ P0-006  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-05-03（对齐小程序实际实现）
>
> **数据库架构**（Migration 008）：feeding_record 已拆分为 4 张独立表：
> `breast_feeding` / `formula_feeding`（含 `formula_mix` 配比子表）/ `food_feeding`（含 `food_item` 明细子表）/ `supplement_feeding`
> 字段类型全部使用 VARCHAR 枚举，废弃 TINYINT。

## 功能描述

记录宝宝的饮食情况，覆盖 4 种喂养方式。通过 TabBar 中央 FAB 或首页快捷入口进入饮食表单页，根据 `feed_type` 选择对应 Tab。

**平台实现**：微信小程序（主平台），数据通过 REST API 存入远程 MySQL。

## 四种喂养类型

| feed_type | 中文标签 | 对应数据库表 |
|-----------|----------|-------------|
| `breast` | 母乳 | breast_feeding |
| `formula` | 配方奶 | formula_feeding + formula_mix |
| `complementary` (food) | 辅食 | food_feeding + food_item |
| `complementary` (supplement) | 营养补充 | supplement_feeding |

> 注：辅食和营养素在 API 层共用 `feed_type: 'complementary'`，通过 Tab UI 区分。

## 母乳记录

**必填**：record_time（记录时间）  
**可选**：breast_side（left/right/both）、duration_min（喂奶时长分钟）、note

## 配方奶记录

### 5 种奶粉类型

| 枚举值 | 中文标签 |
|--------|----------|
| `aa` | 氨基酸配方 |
| `eh_no_lactose` | 深度水解（无乳糖） |
| `eh_lactose` | 深度水解（含乳糖） |
| `ph` | 适度水解 |
| `std` | 普通奶粉 |

### 配比功能

- 支持多种奶粉混合配比（formula_mix 子表）
- 每种奶粉记录：类型 + 勺数（支持分数选择：1/4, 1/3, 1/2, 2/3, 3/4 勺）
- 总奶量：步进器 10-400ml，步长 10ml
- **上次配方缓存**：保存时将本次配方缓存到 Taro Storage，下次默认复用上次配方

**可选字段**：formula_end_time（喂奶结束时间）、note

## 辅食记录

- food_item 子表记录每种辅食的名称和份量
- 支持多种辅食同时记录
- note 备注字段

## 营养补充记录

### 8 种预设营养素

| 枚举值 | 中文标签 |
|--------|----------|
| `vitamin_d` | 维生素D |
| `iron` | 铁 |
| `calcium` | 钙 |
| `dha` | DHA |
| `vitamin_ad` | 维生素AD |
| `zinc` | 锌 |
| `probiotics` | 益生菌 |
| `vitamin_c` | 维生素C |

每种营养素记录：名称 + 剂量 + 单位

## 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/family/:familyId/records/feeding` | POST | 创建饮食记录 |
| `/api/family/:familyId/records/feeding` | GET | 查询饮食记录列表 |
| `/api/family/:familyId/records/feeding/:id` | GET | 查询单条记录 |
| `/api/family/:familyId/records/feeding/:id` | PATCH | 更新记录 |
| `/api/family/:familyId/records/feeding/:id` | DELETE | 删除记录 |

## 编辑模式

通过 URL 参数 `recordId` 进入编辑模式，加载已有记录数据进行修改。

## 验收标准（AC）

- [x] 4 种喂养类型 Tab 切换
- [x] 母乳：哺乳侧选择 + 时长
- [x] 配方奶：5 种奶粉类型多选 + 勺数（含分数选择器）+ 总奶量步进器
- [x] 配方奶：上次配方缓存与复用
- [x] 辅食：多种食物添加
- [x] 营养素：8 种预设 + 剂量/单位输入
- [x] 提交后 Toast "记录已保存" 并 navigateBack
- [x] 支持编辑和删除已有记录

## 相关文件

- 饮食表单：`minicare-mp/src/pages/records/feeding/index.tsx`
- 类型定义：`minicare-mp/src/pages/records/feeding/types.ts`
- API 模块：`minicare-mp/src/api/records/feeding.ts`
- 服务端：`minicare-server/src/records/feeding/`
- 数据库：`minicare-server/migrations/008_schema_redesign.sql`（4 表定义）
