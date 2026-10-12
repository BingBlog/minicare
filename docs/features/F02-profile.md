# F02 · 宝宝档案管理

> 功能 ID：P0-001  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-10-12（编辑弹窗支持**出生数据补录**：出生体重/身高/头围，选填可清空；新增字段 `baby_profile.birth_head_cm`，Migration 026）  
>
> **来源**：docs/business/MVP-PRD.md §3.1  
> 功能 ID：P0-001  
> 优先级：P0  
> 最后同步：2026-10-12（更新：编辑弹窗出生数据补录 + birth_head_cm）

## 功能描述

首次登录且无宝宝档案时，引导用户完成 3 步引导流程（介绍→表单→完成），创建家庭与宝宝档案后进入首页。已有档案的用户可在"我的"页面编辑宝宝信息。

**平台实现**：微信小程序（主平台），数据通过 REST API 存入远程 MySQL。

## 引导流程（Onboarding）

| 步骤 | 页面 | 说明 |
|------|------|------|
| Step 0 | 介绍页 | 产品价值介绍 + "开始创建"按钮 |
| Step 1 | 表单页 | 填写宝宝基本信息（BabyInfoForm 组件） |
| Step 2 | 成功页 | 创建成功动画 + "进入首页"按钮 |

### 表单字段

**必填**：宝宝昵称、出生日期、性别（male/female/unknown）

**可选**：过敏程度（mild/moderate/severe/unknown）

**固定值**（不展示 UI）：过敏类型硬编码为 `['milk']`（牛奶蛋白过敏）

### 创建流程（Step 1 提交时）

1. 调用 `familyApi.create('我们的家')` 创建家庭
2. 调用 `babyApi.create(familyId, babyData)` 创建宝宝档案（含 `birth_weight_g`、`birth_height_cm` 可选字段）
3. 将家庭和宝宝信息存入 Taro Storage
4. 跳转 Step 2 成功页

## 档案编辑

在"我的"页面（ProfilePage）点击宝宝信息卡片，弹出 `EditBabyModal` 编辑弹窗：

**可编辑字段**：昵称、出生日期、性别、过敏程度、过敏类型（编辑时支持多选：milk/egg/wheat/peanut/tree_nut/soy/fish/shellfish/other）

**出生数据（选填，2026-10-12 新增）**：出生体重（克，500~7000）、出生身高（厘米，30~80）、出生头围（厘米，20~50）

- 三项均为选填，输入仅接受数字（整数），空串 = 清空该字段（提交 `null`）
- 前端校验范围与后端 DTO 一致，超范围 Toast 拦截
- **不联动生长记录**：出生数据是档案的一次性属性；生长曲线 0 月龄起点仍走「生长记录」（`growth_record`）
- 消费方：`minicare-agent` 画像注入读取 `birth_weight_g` 渲染"出生体重 X 千克"（其余字段暂无消费方，预留）

## 删除宝宝档案

在"我的"页面 → 编辑宝宝档案弹窗（`EditBabyModal`）底部提供「删除宝宝档案」入口，**仅家庭创建者（owner）可见**：

- 点击后弹出二次确认，提示该宝宝档案和全部记录将**不再显示，历史数据归档保留**
- 确认后调用 `DELETE /api/family/:familyId/baby/:babyId`
- **软删除原则（Migration 012）**：服务端仅标记 `baby_profile.deleted_at = NOW()`，**不物理删除任何数据**——该宝宝全部记录（feeding 4 表、sleep/diaper/activity/health/symptom/growth/medical、food_observation、record_timeline 等）原样保留在库中，所有查询按 `deleted_at IS NULL` 过滤，前端不再展示
- 删除成功后前端自动切换到其他宝宝；若无其他宝宝则清空当前状态
- 普通 member 调用该接口返回 403（`@MinRole(OWNER)` 拦截）
- 软删后同家庭可继续创建新宝宝（Migration 012 已移除"每家庭单宝宝"唯一键）

> 背景：用户被邀请加入其他家庭后，自己创建的家庭/宝宝已无用，需要能删除；软删除保证误删可恢复、历史数据不丢失。

## 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/family` | POST | 创建家庭（body: `{ name }`) |
| `/api/family/mine` | GET | 获取当前用户所在家庭列表 |
| `/api/family/:familyId/baby` | POST | 创建宝宝档案 |
| `/api/family/:familyId/baby` | GET | 获取家庭下宝宝列表 |
| `/api/family/:familyId/baby/:babyId` | PATCH | 更新宝宝信息 |
| `/api/family/:familyId/baby/:babyId` | DELETE | 删除宝宝档案（仅 Owner，级联删除全部记录） |

## 数据库表

**baby_profile**（Migration 008 + 026）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | CHAR(36) | UUID，应用层生成 |
| `family_id` | CHAR(36) | 关联 family_group.id |
| `name` | VARCHAR(50) | 宝宝昵称 |
| `gender` | VARCHAR(10) | 性别：male/female/unknown |
| `birth_date` | DATE | 出生日期 |
| `birth_weight_g` | SMALLINT | 出生体重（克），可选（Migration 002） |
| `birth_height_cm` | TINYINT | 出生身高（厘米），可选（Migration 002） |
| `birth_head_cm` | TINYINT | 出生头围（厘米），可选（Migration 026，2026-10-12） |
| `allergy_types` | JSON | 过敏原类型数组 |
| `allergy_level` | VARCHAR(20) | 过敏程度 |

## 验收标准（AC）

- [x] 新用户首次登录进入引导流程
- [x] 表单必填字段校验（昵称、出生日期、性别）
- [x] 提交后自动创建家庭 + 宝宝档案
- [x] 创建成功后进入首页并展示宝宝信息
- [x] "我的"页面可编辑宝宝档案
- [x] 编辑模式支持多种过敏原类型选择
- [x] 编辑弹窗支持出生数据补录（体重/身高/头围，选填，可清空；Migration 026）
- [x] 性别选择器：男宝/女宝/未知
- [x] 家庭创建者可删除宝宝档案（二次确认 + 软删除标记，数据归档保留）
- [x] 非创建者（member）调用删除接口返回 403
- [x] 软删后同家庭可继续创建新宝宝

## 影响面清单（消费方）

> **改动 F02 任何逻辑前必读**：运行 `node .agents/scripts/impact-scan.mjs profile birth baby` 
> 核对以下消费点（大小写不敏感匹配，需人工确认），改动后同步更新本清单。
> 本清单 2026-10-12 建立（参照 F03-feeding.md 样板）。

**入口层**
- "我的"页面：`minicare-mp/src/pages/profile/index.tsx`（档案状态、编辑弹层编排、保存 payload、头像上传、删除宝宝）
- 引导建档：`minicare-mp/src/pages/onboarding/`（`index.tsx` / `BabyInfoForm` / `AllergySection`；创建时仅昵称/生日/性别/过敏，**不含出生数据**）
- 登录后路由：`minicare-mp/src/lib/afterLogin.ts`（无宝宝档案且无待处理邀请 → 引导建档页）

**弹层 / 组件**
- `minicare-mp/src/pages/profile/EditBabyModal.tsx`（编辑弹窗：昵称/出生日期/性别/**出生数据（体重/身高/头围）**/过敏类型/过敏程度/删除入口）
- `minicare-mp/src/pages/profile/BabyHero.tsx`（档案头部：名字/月龄/过敏徽标；**不展示出生数据**）
- `minicare-mp/src/pages/profile/BabyStats.tsx`（身高/体重/头围三格 = **growth_record 各自最近非空值**，与出生数据无关）
- 样式：`minicare-mp/src/pages/profile/index.scss`（`edit-baby-*`）

**API 层**
- `minicare-mp/src/api/baby.ts`（`babyApi`：getMine / get / list / create / update / remove；`CreateBabyDto` 与 `update` 类型含出生数据字段）
- `minicare-mp/src/api/types.ts`（`Baby` 类型：`birth_weight_g` / `birth_height_cm` / `birth_head_cm`）

**后端**
- `minicare-server/src/baby/`（controller / `baby.service.ts` 6 处 SQL：INSERT + 4 处 SELECT + updateBaby 动态更新 / `dto/create-baby.dto.ts`）
- `minicare-server/src/family/family.service.ts`（解散家庭级联软删宝宝）

**消费方（读出生数据）**
- `minicare-agent/src/lib/profile.js`（画像注入读 `birth_weight_g` → "出生体重 X 千克"；**身高/头围暂无消费方**）
- 生长曲线（`minicare-mp/src/pagesReport/tabs/GrowthTab.tsx` + `minicare-server/src/report/report.service.ts`）数据源 = `growth_record`（**与档案出生数据互不联动**，0 月龄起点走生长记录）

**跨端**
- `minicare-web/`（维护模式）：onboarding `OptionalFields` 采集出生体重/身高（历史入口）；编辑弹窗**未同步**出生数据字段

## 相关文件

- 引导页：`minicare-mp/src/pages/onboarding/index.tsx`
- 表单组件：`minicare-mp/src/pages/onboarding/BabyInfoForm.tsx`
- 编辑弹窗：`minicare-mp/src/pages/profile/EditBabyModal.tsx`
- 宝宝 API：`minicare-mp/src/api/baby.ts`
- 家庭 API：`minicare-mp/src/api/family.ts`
- 服务端：`minicare-server/src/baby/`、`minicare-server/src/family/`
