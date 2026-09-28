# F04 · 睡眠记录

> 功能 ID：P0-007  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-05-21（新增：跨零点睡眠自动拆分规则）

## 功能描述

记录宝宝的睡眠时长、入睡/醒来时间和睡眠质量；支持**计时模式**（实时开始/结束）和**补录模式**（事后手动填写时间段）。

**平台实现**：微信小程序（主平台），数据通过 REST API 存入远程 MySQL。

## 核心功能

### 计时模式

1. 点击「开始睡眠」→ 调用 `POST .../sleep/start` 创建 `status=ongoing` 记录
2. 前端 `setInterval` 本地计时显示，服务端持久化开始时间（断线可恢复）
3. 页面加载时通过 `GET .../sleep/ongoing` 检查是否有进行中记录，有则恢复计时
4. 点击「结束」→ 调用 `PATCH .../sleep/:id/end` 将状态改为 `ended`，后端计算 `duration_min`
5. **3 分钟短时确认**：计时不足 3 分钟时结束，弹出确认弹窗（"仍然保存" / "继续计时"），防止误触
6. **取消计时**：计时中可点击"取消本次计时"，调用 DELETE API 删除 ongoing 记录

### 补录模式

点击切换到补录 Tab → 手动选择开始时间和结束时间 → 调用 `POST .../sleep/complete` 一次性写入完成状态记录（不走 start+end 两步）。

### 首页 SleepBanner

当存在 ongoing 记录时，首页显示"宝宝正在睡觉"横幅（含实时计时），支持一键结束。

## 状态机

```
ongoing ──(end)──→ ended
   │
   └──(cancel/delete)──→ 删除
```

只有两种状态：`ongoing`（进行中）和 `ended`（已结束）。

## 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/family/:familyId/records/sleep/start` | POST | 开始计时（创建 ongoing 记录） |
| `/api/family/:familyId/records/sleep/:id/end` | PATCH | 结束计时 |
| `/api/family/:familyId/records/sleep/complete` | POST | 补录完整记录（一步到位） |
| `/api/family/:familyId/records/sleep/ongoing` | GET | 查询当前 ongoing 记录 |
| `/api/family/:familyId/records/sleep` | GET | 查询睡眠记录列表 |
| `/api/family/:familyId/records/sleep/:id` | PATCH | 编辑已结束记录 |
| `/api/family/:familyId/records/sleep/:id` | DELETE | 删除记录 |

## 数据库表

**sleep_record**（Migration 008）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | CHAR(36) | UUID |
| `baby_id` | CHAR(36) | 关联 baby_profile.id |
| `recorded_by` | CHAR(36) | 操作用户 ID |
| `start_time` | DATETIME | 入睡时间 |
| `end_time` | DATETIME | 醒来时间（ongoing 时为 NULL） |
| `duration_min` | INT | 时长（分钟），后端 TIMESTAMPDIFF 计算 |
| `status` | VARCHAR(10) | `ongoing` / `ended` |
| `sleep_period` | VARCHAR(20) | 时段：night/morning_nap/afternoon_nap/other |
| `quality` | VARCHAR(10) | 质量：good/fair/poor（可选） |
| `note` | TEXT | 备注 |

## DTO 字段

**CreateSleepDto**（start）：`baby_id`（必填）、`start_time`（可选，默认当前时间）

**EndSleepDto**：`end_time`（可选，默认当前时间）、`quality`、`sleep_period`、`note`

**CreateCompleteSleepDto**（补录）：`baby_id`（必填）、`start_time`（必填）、`end_time`（必填）、`quality`、`sleep_period`、`note`

## 技术细节

- `duration_min` 由后端 MySQL `TIMESTAMPDIFF(MINUTE, start_time, end_time)` 计算，规避容器 UTC+0 时区问题
- 前端计时器使用 `setInterval` 每秒更新显示，实际时长以服务端 `start_time` 为准
- 编辑模式：通过 URL 参数 `recordId` 进入，可修改已结束的睡眠记录

### 跨零点睡眠自动拆分

当一条睡眠记录的 `start_time` 和 `end_time` 不在同一天（跨零点）时，后端自动按零点拆分为多条记录写入数据库：

**拆分规则**：
- 拆分时机：仅在「结束睡眠」（`endSleep`）和「补录完整记录」（`createCompleteSleep`）时执行
- 进行中（ongoing）的记录**不拆分**，始终保持1条记录
- 拆分后每条记录的 `start_time` 和 `end_time` 在同一天内
- 每条记录独立拥有 `duration_min`，值为该日内的实际睡眠分钟数

**示例**：入睡 22:00 → 醒来 06:00（跨零点）
- 记录A：`start_time=22:00, end_time=00:00, duration_min=120, sleep_period=night`
- 记录B：`start_time=00:00, end_time=06:00, duration_min=360, sleep_period=night`

**字段分配**：
- `quality`：两条记录相同（继承原始值）
- `sleep_period`：第一条继承原始值，第二条根据开始时间自动推断
- `note`：仅保留在第一条记录上

**编辑处理**：
- 编辑已结束记录时，如果修改后的时间范围跨零点，自动删除原记录并拆分为多条新记录
- 编辑进行中记录时，仅更新字段，不触发拆分

**统计影响**：
- 前端按 `DATE(start_time)` 查询某天记录，`SUM(duration_min)` 即为当天实际睡眠时长
- 无需前端额外计算，数据源头已保证每条记录归属正确日期

## 验收标准（AC）

- [x] 计时模式：点击开始立即创建服务端记录
- [x] 计时模式：结束后正确计算时长
- [x] 3 分钟短时确认弹窗，防止误触
- [x] 计时取消功能
- [x] 补录模式：手动选择时间段一步创建
- [x] 页面重进时恢复 ongoing 状态
- [x] 首页 SleepBanner 显示 + 一键结束
- [x] 睡眠质量选择（好/一般/差）
- [x] 编辑和删除已有记录

## 相关文件

- 睡眠表单：`minicare-mp/src/pages/records/sleep/index.tsx`
- 首页横幅：`minicare-mp/src/pages/home/SleepBanner.tsx`
- API 模块：`minicare-mp/src/api/records/sleep.ts`
- 服务端：`minicare-server/src/records/sleep/`
