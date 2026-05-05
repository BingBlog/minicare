# F09 · 生长记录

> 功能 ID：P0-011  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-05-03（对齐小程序实际实现）
>
> **生长标准**：使用**国家卫健委2023年版《中国7岁以下儿童生长发育参照标准》**（非 WHO 标准）。
> 百分位线：P3 / P15 / P50 / P85 / P97，覆盖 0-36 月龄，按性别分组。

## 功能描述

记录宝宝的身体生长测量数据（身高、体重、头围），并在报告页以百分位曲线展示生长趋势。

**平台实现**：微信小程序（主平台），数据通过 REST API 存入远程 MySQL。

## 表单字段

**必填**：`record_date`（日期，YYYY-MM-DD 格式）  
**至少填一项**：`weight_g` / `height_mm` / `head_mm`（提交时前端校验"请至少填写一项测量数据"）

### 测量值

| 字段 | 前端输入 | 后端存储 | 范围约束 |
|------|----------|----------|----------|
| 体重 | **kg**（如 5.3） | `weight_g` INT（克） | 500 ~ 30000 |
| 身高 | **cm**（如 65.2） | `height_mm` INT（毫米） | 300 ~ 1500 |
| 头围 | **cm**（如 40.1） | `head_mm` INT（毫米） | 250 ~ 600 |

> 前端提交时自动换算：cm × 10 → mm，kg × 1000 → g

### 辅助字段

| 字段 | 说明 |
|------|------|
| `record_time` | 可选，HH:mm 格式 |
| 测量机构 | 芯片选择：儿保门诊 / 家中自测 / 社区卫生 / 其他（存入 note 字段前缀） |
| 上传测量单 | 拍照入口（当前显示"功能开发中"）|
| `note` | 备注（含机构前缀："机构：XXX / 备注内容"）|

## 唯一约束

同一宝宝同一天只能记录一次生长数据（unique index on `baby_id + record_date`），重复提交返回错误提示"同一天只能记录一次"。

## 生长标准数据

文件：`minicare-mp/src/lib/growth-standards.ts`

- 按性别分组：`BOY_GROWTH_STANDARDS` / `GIRL_GROWTH_STANDARDS`
- 每个数据点包含月龄 + 身高/体重/头围各 5 条百分位线
- 月龄覆盖：0, 1, 2, ... 12, 15, 18, 21, 24, 30, 36
- 曲线 footer 说明："曲线基于国家卫健委2023年版《中国7岁以下儿童生长发育参照标准》"

## 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/family/:familyId/records/growth` | POST | 创建生长记录 |
| `/api/family/:familyId/records/growth` | GET | 查询生长记录列表 |
| `/api/family/:familyId/records/growth/:id` | PATCH | 更新记录 |
| `/api/family/:familyId/records/growth/:id` | DELETE | 删除记录 |

## DTO 字段

**CreateGrowthDto**：

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `baby_id` | UUID string | 是 | @IsUUID() |
| `record_date` | string | 是 | @IsDateString(), YYYY-MM-DD |
| `record_time` | string | 否 | @Matches(/^\d{2}:\d{2}$/), HH:mm |
| `weight_g` | number | 否 | @Min(500) @Max(30000) |
| `height_mm` | number | 否 | @Min(300) @Max(1500) |
| `head_mm` | number | 否 | @Min(250) @Max(600) |
| `note` | string | 否 | @IsString() |

> 注：DTO 层所有测量字段均为 @IsOptional()，业务层无"至少填一项"校验，此校验仅在前端执行。

## 验收标准（AC）

- [x] 日期必填，默认今日
- [x] 身高/体重/头围前端校验至少填一项
- [x] 输入单位 cm/kg，提交自动转换为 mm/g
- [x] 同一天重复记录拦截提示
- [x] 测量机构芯片选择（写入 note）
- [x] 提交后 Toast 提示并返回上一页
- [x] 在报告页 GrowthTab 以百分位曲线展示
- [x] 支持编辑和删除已有记录

## 相关文件

- 生长表单：`minicare-mp/src/pages/records/growth/index.tsx`
- 生长标准数据：`minicare-mp/src/lib/growth-standards.ts`
- 报告图表：`minicare-mp/src/pages/report/tabs/GrowthTab.tsx`
- API 模块：`minicare-mp/src/api/records/growth.ts`
- 服务端：`minicare-server/src/records/growth/`
- DTO：`minicare-server/src/records/growth/dto/create-growth.dto.ts`
