# F02 · 宝宝档案管理

> 功能 ID：P0-001  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-05-03（对齐小程序实际实现）

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

## 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/family` | POST | 创建家庭（body: `{ name }`) |
| `/api/family/mine` | GET | 获取当前用户所在家庭列表 |
| `/api/family/:familyId/baby` | POST | 创建宝宝档案 |
| `/api/family/:familyId/baby` | GET | 获取家庭下宝宝列表 |
| `/api/family/:familyId/baby/:babyId` | PATCH | 更新宝宝信息 |

## 数据库表

**baby_profile**（Migration 008）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | CHAR(36) | UUID，应用层生成 |
| `family_id` | CHAR(36) | 关联 family_group.id |
| `name` | VARCHAR(50) | 宝宝昵称 |
| `gender` | VARCHAR(10) | 性别：male/female/unknown |
| `birth_date` | DATE | 出生日期 |
| `birth_weight_g` | INT | 出生体重（克），可选 |
| `birth_height_cm` | DECIMAL(5,1) | 出生身高（cm），可选 |
| `allergy_types` | JSON | 过敏原类型数组 |
| `allergy_level` | VARCHAR(20) | 过敏程度 |

## 验收标准（AC）

- [x] 新用户首次登录进入引导流程
- [x] 表单必填字段校验（昵称、出生日期、性别）
- [x] 提交后自动创建家庭 + 宝宝档案
- [x] 创建成功后进入首页并展示宝宝信息
- [x] "我的"页面可编辑宝宝档案
- [x] 编辑模式支持多种过敏原类型选择
- [x] 性别选择器：男宝/女宝/未知

## 相关文件

- 引导页：`minicare-mp/src/pages/onboarding/index.tsx`
- 表单组件：`minicare-mp/src/pages/onboarding/BabyInfoForm.tsx`
- 编辑弹窗：`minicare-mp/src/pages/profile/EditBabyModal.tsx`
- 宝宝 API：`minicare-mp/src/api/baby.ts`
- 家庭 API：`minicare-mp/src/api/family.ts`
- 服务端：`minicare-server/src/baby/`、`minicare-server/src/family/`
