# minicare · 开发计划与进度跟踪

> 最后更新：2026-05-03  
> 当前阶段：**MVP 已完成，小程序已发布**  
> 整体进度：`██████████` 100%（MVP）
> 分发平台：微信小程序（主平台）

---

## 整体进度总览

| 阶段       | 内容                           | 状态        | 完成时间   |
| ---------- | ------------------------------ | ----------- | ---------- |
| **阶段 0** | 基础设施 & 环境配置            | ✅ 已完成   | 2026-03-30 |
| **阶段 1** | 基础核心流程（登录/建档/首页） | ✅ 已完成   | 2026-03-30 |
| **阶段 2** | 日常记录主流程（8 大记录模块） | ✅ 已完成   | 2026-04-10 |
| **阶段 3** | 生长发育 & 医疗记录            | ✅ 已完成   | 2026-04-15 |
| **阶段 4** | 家庭协作 & 数据分析报告        | ✅ 已完成   | 2026-04-20 |
| **阶段 5** | 小程序迁移与发布               | ✅ 已完成   | 2026-04-28 |

---

## ⚙️ 开发必读

> **每次开发任何模块前，必须先激活以下两个 SKILL：**
>
> 1. `.cursor/skills/minicare-dev/SKILL.md` — 开发规范（代码路径、字段规范、权限模型）
> 2. `.cursor/skills/minicare-design/SKILL.md` — 视觉规范（色彩 Token、图标、组件样式）

---

## 阶段 0 · 基础设施 & 环境配置 ✅

> 完成时间：2026-03-30

| #   | 任务                                                   | 状态 |
| --- | ------------------------------------------------------ | ---- |
| 0.1 | CloudBase 环境初始化（envId、MySQL、Auth、云存储）     | ✅   |
| 0.2 | NestJS 后端项目骨架（auth/family/baby/records 全模块） | ✅   |
| 0.3 | React 前端项目骨架（路由、AuthGuard、页面骨架）        | ✅   |
| 0.4 | 三套环境分离（dev/staging/prod）+ AUTH_TEST_MODE       | ✅   |
| 0.5 | 后端部署脚本（deploy.sh，预编译 ~130KB 上传）          | ✅   |
| 0.6 | 本地联调验证（注册流程端到端测试通过）                 | ✅   |

**关键修复记录：**

- `user_account.id` 为 `char(36)` 无默认值，INSERT 需手动传 UUID
- 数据库字段为 `nickname` 非 `name`
- 前端 Vite 占用 3000 端口，后端改为 3001，通过 Vite proxy 转发

---

## 阶段 1 · 基础核心流程 ✅

> 目标：完整跑通「注册 → 建档 → 首页」主流程，可供 staging 测试  
> 预计工期：1-2 周

### 1.1 F01 登录页完善

> **开发前必读**：`.cursor/skills/minicare-dev/SKILL.md` + `docs/features/F01-auth.md`

**代码路径：**

| 层级       | 路径                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| 前端页面   | `minicare-web/src/pages/login/index.tsx`（含 LoginHero / SmsPanel / PwdPanel） |
| 前端路由   | `minicare-web/src/router.tsx`（`/login` 路由）                                 |
| 前端守卫   | `minicare-web/src/components/AuthGuard.tsx`                                    |
| 前端API    | `minicare-web/src/api/auth.ts`（`authApi`）                                    |
| 后端控制器 | `minicare-server/src/auth/auth.controller.ts`                                  |
| 后端服务   | `minicare-server/src/auth/auth.service.ts`                                     |
| 后端DTO    | `minicare-server/src/auth/dto/send-code.dto.ts`、`verify-code.dto.ts`          |

**数据库表：** `user_account`

| 字段         | 类型           | 说明             |
| ------------ | -------------- | ---------------- |
| `id`         | `CHAR(36)`     | UUID，应用层生成 |
| `phone`      | `VARCHAR(20)`  | 手机号（唯一）   |
| `nickname`   | `VARCHAR(50)`  | 昵称             |
| `avatar_url` | `VARCHAR(500)` | 头像 URL         |
| `created_at` | `DATETIME`     | 创建时间         |

**视觉规范（UI 稿：`ui-draft/login.html`）：**

- Tab 切换：「短信登录」/「密码登录」，激活 Tab 深粉 `#E8507A`，下划线 2px
- 输入框样式：`.login-field`，圆角 `12px`，无外边框，背景 `#FDF0F3`
- 主按钮：`border-radius: 50px`，背景主色 `#F87098`，禁止 emoji 图标
- 协议文本位于按钮下方，字色 `#9A7E82`
- 插画背景：页面顶部渐变 `#fff0f4 → #fdf7f5`

| #     | 任务                                                               | 状态          |
| ----- | ------------------------------------------------------------------ | ------------- |
| 1.1.1 | 登录成功后判断是否有宝宝档案，无档案跳 `/onboarding`               | ✅ 2026-03-30 |
| 1.1.2 | `AuthGuard` 加载时请求 `/api/family/mine` + `/api/family/:id/baby` | ✅ 2026-03-30 |
| 1.1.3 | 首次登录「未注册 → 自动注册」流程 Toast 提示                       | ✅ 2026-03-30 |

---

### 1.2 F02 宝宝档案 + 引导页

> **开发前必读**：`.cursor/skills/minicare-dev/SKILL.md` + `docs/features/F02-profile.md`

**代码路径：**

| 层级               | 路径                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------ |
| 前端页面（引导）   | `minicare-web/src/pages/onboarding/index.tsx`（含 BabyInfoForm / AllergySection 等） |
| 前端页面（档案）   | `minicare-web/src/pages/profile/index.tsx`（含 EditBabyModal）                       |
| 前端API（家庭）    | `minicare-web/src/api/family.ts`（`familyApi`）                                      |
| 前端API（宝宝）    | `minicare-web/src/api/baby.ts`（`babyApi`）                                          |
| 后端控制器（家庭） | `minicare-server/src/family/family.controller.ts`                                    |
| 后端服务（家庭）   | `minicare-server/src/family/family.service.ts`                                       |
| 后端控制器（宝宝） | `minicare-server/src/baby/baby.controller.ts`                                        |
| 后端服务（宝宝）   | `minicare-server/src/baby/baby.service.ts`                                           |
| 后端DTO（宝宝）    | `minicare-server/src/baby/dto/create-baby.dto.ts`                                    |

**数据库表：** `baby_profile`（`001_init_schema.sql` + `002_baby_allergy_fields.sql`）

| 字段              | 类型           | 说明                                          |
| ----------------- | -------------- | --------------------------------------------- |
| `id`              | `CHAR(36)`     | UUID，应用层生成                              |
| `family_id`       | `CHAR(36)`     | 关联 `family_group.id`（唯一，每家庭1宝宝）   |
| `name`            | `VARCHAR(50)`  | 宝宝姓名                                      |
| `gender`          | `TINYINT`      | `0=unknown 1=male 2=female`（枚举，双向映射） |
| `birth_date`      | `DATE`         | 出生日期                                      |
| `avatar_url`      | `VARCHAR(500)` | 头像 URL                                      |
| `allergy_types`   | `JSON`         | 过敏类型列表，如 `["milk","egg","wheat"]`     |
| `allergy_level`   | `VARCHAR(20)`  | `mild│moderate│severe│unknown`                |
| `birth_weight_g`  | `SMALLINT`     | 出生体重（克）                                |
| `birth_height_cm` | `TINYINT`      | 出生身高（厘米）                              |
| `created_by`      | `CHAR(36)`     | 创建者 user_id                                |

**视觉规范（UI 稿：`ui-draft/onboarding.html` + `ui-draft/profile.html`）：**

- 引导页分 3 步：启动介绍（Step 0）→ 表单填写（Step 1）→ 成功页（Step 2）
- 进度点：激活 `#F87098`，未激活 `#F8B8CC`，尺寸 8px/6px
- 过敏程度：滑块选择（mild/moderate/severe/unknown），`unknown` 展示 CDC 提示
- 成功页：动画宝宝卡片，背景玫瑰渐变
- 档案编辑：底部弹层（Bottom Sheet），圆角 `24px`，背景白色

| #     | 任务                                                                          | 状态                     |
| ----- | ----------------------------------------------------------------------------- | ------------------------ |
| 1.2.1 | **前端** `OnboardingPage` 完善：姓名/出生日期/性别/过敏类型（必填）+ 过敏程度 | ✅ 2026-03-30            |
| 1.2.2 | **前端** 过敏程度选「未知」展示 CDC 评分标准提示链接                          | ✅ 2026-03-30            |
| 1.2.3 | **前端** 表单提交到 `POST /api/family` + `POST /api/family/:id/baby`          | ✅ 2026-03-30            |
| 1.2.4 | **后端** `family.service`：创建家庭 + 自动设置创建者角色                      | ✅ 已完成（含 bug 修复） |
| 1.2.5 | **后端** `baby.service`：`create` / `findByFamily` + `update` 逻辑完善        | ✅ 2026-03-30            |
| 1.2.6 | **前端** `ProfilePage` 档案编辑入口（「我的」→ 宝宝卡片）                     | ✅ 2026-03-30            |

---

### 1.3 首页时间轴

> **开发前必读**：`.cursor/skills/minicare-dev/SKILL.md`

**代码路径：**

| 层级     | 路径                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------- |
| 前端页面 | `minicare-web/src/pages/home/index.tsx`（含 HeroSection / TodayTimeline / QuickActions / FabSheet） |
| 前端状态 | `minicare-web/src/lib/store.ts`（`useAppStore`）                                                    |
| 前端API  | `minicare-web/src/api/index.ts`（`recordsApi` 聚合）                                                |
| 前端布局 | `minicare-web/src/components/AppLayout.tsx`（底部 Tab Bar + FAB）                                   |
| 后端接口 | `GET /api/family/:familyId/records/today`（各 records module 聚合）                                 |

**数据库表（聚合查询）：** `feeding_record`、`sleep_record`、`diaper_record`、`health_record`、`symptom_record`、`activity_record`

**视觉规范（UI 稿：`ui-draft/home.html`）：**

- 头部英雄区：渐变 `#fff0f4 → #fdf7f5`，宝宝卡片含头像、姓名、月龄、性别标签
- 快捷操作：4 列 2 行网格，圆形图标盒子（背景 `#FFF0F4`，图标色 `#F0B8C8`）
- 时间轴：`.list-row`，左侧时间戳、图标（分类色区分）、标题/描述、右箭头
- FAB 按钮：圆形 `56px`，渐变背景 `#F87098 → #E8507A`，居中 `+` 图标
- 底部 Tab Bar：5 Tab，中央为 FAB 占位，未激活图标 `#F0B8C8`，激活 `#E8507A`
- 睡眠进行中横幅：位于宝宝卡片下方，月亮图标 + 计时器 + 「结束睡眠」按钮

| #     | 任务                                                          | 状态          |
| ----- | ------------------------------------------------------------- | ------------- |
| 1.3.1 | **后端** 今日记录聚合接口 `GET /api/family/:id/records/today` | ✅ 2026-03-30 |
| 1.3.2 | **前端** `HomePage` 今日时间轴（按时间倒序，各类型图标区分）  | ✅ 2026-03-30 |
| 1.3.3 | **前端** 空状态展示（「今日尚无记录」）                       | ✅ 2026-03-30 |

---

## 阶段 2 · 日常记录主流程 ✅

> 目标：六大日常记录全部可用，用户可完整记录一天  
> 完成时间：2026-07-03

---

### 2.1 F03 饮食记录（复杂度：高）

> **开发前必读**：`.cursor/skills/minicare-dev/SKILL.md` + `docs/features/F03-feeding.md`

**代码路径：**

| 层级       | 路径                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 前端页面   | `minicare-web/src/pages/records/feeding/index.tsx`（含 TabSelector / FormulaSection / BreastSection / FoodSection / SupplementSection） |
| 前端API    | `minicare-web/src/api/records/feeding.ts`（`feedingApi`）                                                                               |
| 后端控制器 | `minicare-server/src/records/feeding/feeding.controller.ts`                                                                             |
| 后端服务   | `minicare-server/src/records/feeding/feeding.service.ts`                                                                                |
| 后端DTO    | `minicare-server/src/records/feeding/dto/create-feeding.dto.ts`                                                                         |

**数据库表：** `feeding_record` + `food_observation`

| 字段                 | 类型           | 说明                                     |
| -------------------- | -------------- | ---------------------------------------- |
| `id`                 | `CHAR(36)`     | UUID                                     |
| `baby_id`            | `CHAR(36)`     | 关联 `baby_profile.id`                   |
| `recorded_by`        | `CHAR(36)`     | 操作用户 ID                              |
| `record_time`        | `DATETIME`     | 记录时间                                 |
| `feed_type`          | `TINYINT`      | **`1=breast 2=formula 3=complementary`** |
| `breast_side`        | `TINYINT`      | `1=left 2=right 3=both`（哺乳时有效）    |
| `duration_min`       | `SMALLINT`     | 哺乳时长（分钟）                         |
| `formula_ml`         | `SMALLINT`     | 奶粉量（ml）                             |
| `milk_types`         | `JSON`         | 奶粉品牌/类型列表                        |
| `milk_scoops`        | `JSON`         | 各奶粉勺数配置                           |
| `complementary_food` | `VARCHAR(100)` | 辅食名称                                 |
| `amount_g`           | `SMALLINT`     | 辅食量（克）                             |
| `supplement_items`   | `JSON`         | 营养素补充列表                           |
| `note`               | `TEXT`         | 备注                                     |

`food_observation` 辅食观察表：

| 字段             | 类型           | 说明                                |
| ---------------- | -------------- | ----------------------------------- |
| `food_name`      | `VARCHAR(100)` | 食物名称                            |
| `first_intro_at` | `DATE`         | 首次引入日期                        |
| `status`         | `TINYINT`      | **`1=observing 2=safe 3=allergic`** |
| `reaction_note`  | `TEXT`         | 过敏反应描述                        |

**视觉规范（UI 稿：`ui-draft/form-feeding.html`）：**

- 顶部导航栏：`← 喂养记录` + 右侧「保存」文字按钮
- Tab 切换：奶粉/母乳/营养素/辅食，激活色 `#F87098`
- 奶量快选按钮：圆角矩形，选中背景 `#FFF0F4`，边框 `#F8B8CC`
- 步进器：`−` / `+` 按钮，数字居中显示
- 辅食 Tab 新食物提示卡片：背景 `#FFF8EC`，图标色 `#DDB870`
- 表单区域背景 `#FDF7F5`，卡片白色，间距 12px

| #     | 任务                                                    | 状态                |
| ----- | ------------------------------------------------------- | ------------------- |
| 2.1.1 | **前端** Tab 页签切换（奶粉/母乳/营养素/辅食）          | ✅ 2026-03-30       |
| 2.1.2 | **前端** 奶粉多选 + 对应配比行动态显示/隐藏             | ✅ 2026-03-30       |
| 2.1.3 | **前端** 含乳糖勾选框（选中深度水解时出现）             | ⏭️ 跳过（MVP 简化） |
| 2.1.4 | **前端** 配比百分比自动计算展示                         | ⏭️ 跳过（MVP 简化） |
| 2.1.5 | **前端** 奶量快选（60/90/120/150/180ml）+ 步进器        | ✅ 2026-03-30       |
| 2.1.6 | **前端** 辅食 Tab：新食物自动开启 5 天观察期标记        | ⏭️ 跳过（MVP 后置） |
| 2.1.7 | **前端** 辅食 Tab：八大高风险过敏原首次录入风险提示卡片 | ⏭️ 跳过（MVP 后置） |
| 2.1.8 | **后端** `feeding.service`：写入 + 完整 CRUD            | ✅ 2026-07-03       |

---

### 2.2 F04 睡眠记录（复杂度：高）

> **开发前必读**：`.cursor/skills/minicare-dev/SKILL.md` + `docs/features/F04-sleep.md`

**代码路径：**

| 层级       | 路径                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------- |
| 前端页面   | `minicare-web/src/pages/records/sleep/index.tsx`（含 TimerMode / ManualMode / QualitySection） |
| 前端横幅   | `minicare-web/src/pages/home/SleepBanner.tsx`（首页睡眠进行中横幅）                            |
| 前端API    | `minicare-web/src/api/records/sleep.ts`（`sleepApi`）                                          |
| 后端控制器 | `minicare-server/src/records/sleep/sleep.controller.ts`                                        |
| 后端服务   | `minicare-server/src/records/sleep/sleep.service.ts`                                           |
| 后端DTO    | `minicare-server/src/records/sleep/dto/create-sleep.dto.ts`                                    |
| 定时任务   | `minicare-server/src/scheduler/tasks.service.ts`（超时自动标记）                               |

**数据库表：** `sleep_record`

| 字段           | 类型       | 说明                             |
| -------------- | ---------- | -------------------------------- |
| `id`           | `CHAR(36)` | UUID                             |
| `baby_id`      | `CHAR(36)` | 关联 `baby_profile.id`           |
| `recorded_by`  | `CHAR(36)` | 操作用户 ID                      |
| `start_time`   | `DATETIME` | 开始时间（写入即持久化）         |
| `end_time`     | `DATETIME` | 结束时间（NULL = 进行中）        |
| `duration_min` | `SMALLINT` | 计算值，单位分钟                 |
| `status`       | `TINYINT`  | **`1=ongoing 2=ended`**          |
| `quality`      | `TINYINT`  | 睡眠质量（可选）                 |
| `sleep_period` | `VARCHAR`  | 睡眠时段（night/morning_nap 等） |
| `note`         | `TEXT`     | 备注                             |

**视觉规范（UI 稿：`ui-draft/form-sleep.html`）：**

- 模式切换：「计时模式」/「补录模式」Tab
- 计时器：大号时间显示（HH:MM:SS），开始/结束按钮渐变主色
- 进行中横幅（首页）：月亮图标 + 「正在睡觉 HH:MM:SS」+ 「结束睡眠」粉色按钮
- 补录模式：时间选择器（开始时间/结束时间），自动计算并显示时长

| #     | 任务                                                     | 状态                                                |
| ----- | -------------------------------------------------------- | --------------------------------------------------- |
| 2.2.1 | **前端** 计时模式：开始写入 `ongoing` 状态，跨页面持久化 | ✅ 2026-07-03（TimerMode.tsx 完整实现）             |
| 2.2.2 | **前端** 首页顶部「睡眠进行中」横幅 + 快捷结束按钮       | ✅ 2026-07-03（SleepBanner.tsx）                    |
| 2.2.3 | **前端** 结束后弹出睡眠质量选择（可跳过）                | ✅ 2026-07-03（QualitySection.tsx）                 |
| 2.2.4 | **前端** 补录模式：时间选择器 + 自动计算时长             | ✅ 2026-03-30                                       |
| 2.2.5 | **后端** `sleep.service`：状态机（ongoing/ended）        | ✅ 2026-07-03（startSleep / endSleep / getOngoing） |
| 2.2.6 | **后端** 超时 12h 自动标记（scheduler 定时任务）         | ✅ 2026-07-03（tasks.service.ts）                   |

---

### 2.3 F06 尿布记录（复杂度：低）

> **开发前必读**：`.cursor/skills/minicare-dev/SKILL.md` + `docs/features/F06-diaper.md`

**代码路径：**

| 层级       | 路径                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| 前端页面   | `minicare-web/src/pages/records/diaper/index.tsx`（含 DiaperTypeSection / PoopSection / ButtConditionSection） |
| 前端API    | `minicare-web/src/api/records/diaper.ts`（`diaperApi`）                                                        |
| 后端控制器 | `minicare-server/src/records/diaper/diaper.controller.ts`                                                      |
| 后端服务   | `minicare-server/src/records/diaper/diaper.service.ts`                                                         |
| 后端DTO    | `minicare-server/src/records/diaper/dto/create-diaper.dto.ts`                                                  |

**数据库表：** `diaper_record`

| 字段             | 类型          | 说明                              |
| ---------------- | ------------- | --------------------------------- |
| `id`             | `CHAR(36)`    | UUID                              |
| `baby_id`        | `CHAR(36)`    | 关联 `baby_profile.id`            |
| `recorded_by`    | `CHAR(36)`    | 操作用户 ID                       |
| `record_time`    | `DATETIME`    | 记录时间                          |
| `diaper_type`    | `TINYINT`     | **`1=wet 2=dirty 3=mixed 4=dry`** |
| `color`          | `VARCHAR(20)` | 颜色描述（可选）                  |
| `poop_type`      | `VARCHAR(20)` | 大便性状（可选）                  |
| `butt_condition` | `VARCHAR(20)` | 臀部状况（可选）                  |
| `diaper_count`   | `SMALLINT`    | 换尿布次数（可选）                |
| `note`           | `TEXT`        | 备注                              |

**视觉规范（UI 稿：`ui-draft/form-diaper.html`）：**

- 类型选择：图标卡片多选，选中状态背景 `#FFF0F4`，边框 `#F8B8CC`
- Bristol 大便分级对照图：内嵌图片卡片，背景 `#FFF8EC`
- 照片上传：虚线边框上传区域，图标 `camera`

| #     | 任务                                        | 状态                |
| ----- | ------------------------------------------- | ------------------- |
| 2.3.1 | **前端** 尿布类型选择 + 大便颜色 + 臀部状况 | ✅ 2026-03-30       |
| 2.3.2 | **前端** Bristol 大便分级对照图内嵌展示     | ⏭️ 跳过（MVP 后置） |
| 2.3.3 | **前端** 小便次数步进器 + 尿湿程度单选      | ⏭️ 跳过（MVP 简化） |
| 2.3.4 | **前端** 拍照上传（仅留档）                 | 🔲（后置）          |
| 2.3.5 | **后端** `diaper.service`：完整 CRUD        | ✅ 2026-07-03       |

---

### 2.4 F05 活动记录（复杂度：低）

> **开发前必读**：`.cursor/skills/minicare-dev/SKILL.md` + `docs/features/F05-activity.md`

**代码路径：**

| 层级       | 路径                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| 前端页面   | `minicare-web/src/pages/records/activity/index.tsx`（含 ActivityTypeSection / IntensitySection） |
| 前端API    | `minicare-web/src/api/records/activity.ts`（`activityApi`）                                      |
| 后端控制器 | `minicare-server/src/records/activity/activity.controller.ts`                                    |
| 后端服务   | `minicare-server/src/records/activity/activity.service.ts`                                       |
| 后端DTO    | `minicare-server/src/records/activity/dto/create-activity.dto.ts`                                |

**数据库表：** `activity_record`

| 字段            | 类型       | 说明                                               |
| --------------- | ---------- | -------------------------------------------------- |
| `id`            | `CHAR(36)` | UUID                                               |
| `baby_id`       | `CHAR(36)` | 关联 `baby_profile.id`                             |
| `recorded_by`   | `CHAR(36)` | 操作用户 ID                                        |
| `record_time`   | `DATETIME` | 记录时间                                           |
| `activity_type` | `TINYINT`  | **`1=bath 2=outdoor 3=play 4=tummy_time 5=other`** |
| `duration_min`  | `SMALLINT` | 时长（分钟）                                       |
| `intensity`     | `VARCHAR`  | 活动强度（light/moderate/active）                  |
| `note`          | `TEXT`     | 备注                                               |

**视觉规范（UI 稿：`ui-draft/form-activity.html`）：**

- 活动类型：图标网格多选，暖色图标（`#DDB870`），背景 `#FFF8EC`
- 时长输入：数字步进器 + 「分钟」单位文字
- 整体背景 `#FDF7F5`，表单卡片白色

| #     | 任务                                                | 状态          |
| ----- | --------------------------------------------------- | ------------- |
| 2.4.1 | **前端** 六类活动勾选（洗澡/户外/玩耍/俯趴/其他等） | ✅ 2026-03-30 |
| 2.4.2 | **前端** 活动时长填写（分钟）+ 强度 + 备注          | ✅ 2026-03-30 |
| 2.4.3 | **后端** `activity.service`：完整 CRUD              | ✅ 2026-07-03 |

---

### 2.5 F07 健康记录（复杂度：中）

> **开发前必读**：`.cursor/skills/minicare-dev/SKILL.md` + `docs/features/F07-health.md`

**代码路径：**

| 层级       | 路径                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------- |
| 前端页面   | `minicare-web/src/pages/records/health/index.tsx`（含 TemperatureSection / AllergySection） |
| 前端API    | `minicare-web/src/api/records/health.ts`（`healthApi`）                                     |
| 后端控制器 | `minicare-server/src/records/health/health.controller.ts`                                   |
| 后端服务   | `minicare-server/src/records/health/health.service.ts`                                      |
| 后端DTO    | `minicare-server/src/records/health/dto/create-health.dto.ts`                               |

**数据库表：** `health_record`

| 字段               | 类型           | 说明                                     |
| ------------------ | -------------- | ---------------------------------------- |
| `id`               | `CHAR(36)`     | UUID                                     |
| `baby_id`          | `CHAR(36)`     | 关联 `baby_profile.id`                   |
| `recorded_by`      | `CHAR(36)`     | 操作用户 ID                              |
| `record_time`      | `DATETIME`     | 记录时间                                 |
| `temperature`      | `DECIMAL(4,1)` | 体温（摄氏度）                           |
| `mood`             | `TINYINT`      | **`1=happy 2=neutral 3=fussy 4=crying`** |
| `allergy_symptoms` | `JSON`         | 过敏表现列表                             |
| `allergy_severity` | `VARCHAR(20)`  | 过敏严重程度                             |
| `medications`      | `JSON`         | 用药记录列表                             |
| `skin_care`        | `JSON`         | 保湿护理记录                             |
| `note`             | `TEXT`         | 备注                                     |

**视觉规范（UI 稿：`ui-draft/form-health.html`）：**

- 体温输入：大号数字输入，单位 `°C`，正常范围提示文字
- 情绪图标：笑脸/一般/皱眉/哭泣，单选，选中深粉边框
- 过敏表现多选：症状标签卡片，选中背景 `#FFF0F4`
- 照片上传区域，虚线边框

| #     | 任务                                                                | 状态                                  |
| ----- | ------------------------------------------------------------------- | ------------------------------------- |
| 2.5.1 | **前端** 过敏表现多选（皮疹/呕吐/腹泻/咳嗽/喘息/湿疹）+ 严重程度    | ✅ 2026-03-30                         |
| 2.5.2 | **前端** 拍照记录过敏表现（仅留档）                                 | 🔲（后置）                            |
| 2.5.3 | **前端** 用药记录（名称/剂量/频次）                                 | ⏭️ 跳过（MVP 简化，健康记录中有备注） |
| 2.5.4 | **前端** 保湿护理（时间/产品）                                      | ⏭️ 跳过（MVP 后置）                   |
| 2.5.5 | **后端** `health.service`：完整 CRUD（含 mood 枚举映射、JSON 字段） | ✅ 2026-07-03                         |

---

### 2.6 F08 表现记录（复杂度：低）

> **开发前必读**：`.cursor/skills/minicare-dev/SKILL.md` + `docs/features/F08-symptom.md`

**代码路径：**

| 层级       | 路径                                                                                 |
| ---------- | ------------------------------------------------------------------------------------ |
| 前端页面   | `minicare-web/src/pages/records/symptom/index.tsx`（含 MoodSection / SpiritSection） |
| 前端API    | `minicare-web/src/api/records/symptom.ts`（`symptomApi`）                            |
| 后端控制器 | `minicare-server/src/records/symptom/symptom.controller.ts`                          |
| 后端服务   | `minicare-server/src/records/symptom/symptom.service.ts`                             |
| 后端DTO    | `minicare-server/src/records/symptom/dto/create-symptom.dto.ts`                      |

**数据库表：** `symptom_record`

| 字段          | 类型       | 说明                                       |
| ------------- | ---------- | ------------------------------------------ |
| `id`          | `CHAR(36)` | UUID                                       |
| `baby_id`     | `CHAR(36)` | 关联 `baby_profile.id`                     |
| `recorded_by` | `CHAR(36)` | 操作用户 ID                                |
| `record_time` | `DATETIME` | 记录时间                                   |
| `symptoms`    | `JSON`     | 症状列表，格式 `[{"type":1,"severity":2}]` |
| `spirit`      | `VARCHAR`  | 精神状态（active/normal/tired/sluggish）   |
| `mood`        | `VARCHAR`  | 情绪（happy/calm/fussy/crying）            |
| `photo_ids`   | `JSON`     | 照片 fileID 列表                           |
| `note`        | `TEXT`     | 备注                                       |

**视觉规范（UI 稿：`ui-draft/form-symptom.html`）：**

- 心情图标单选：laugh/smile/meh/frown 四种，选中背景 `#FFF0F4`，边框深粉
- 精神状态单选：安静/正常/活跃，标签按钮样式
- 备注文本域，最大高度 80px

| #     | 任务                                          | 状态          |
| ----- | --------------------------------------------- | ------------- |
| 2.6.1 | **前端** 心情图标单选（开心/一般/低落）       | ✅ 2026-03-30 |
| 2.6.2 | **前端** 精神状态单选（安静/正常/活跃）+ 备注 | ✅ 2026-03-30 |
| 2.6.3 | **后端** `symptom.service`：完整 CRUD         | ✅ 2026-07-03 |

---

### 2.7 记录列表页（新增）

> 已完成，记录查看/筛选/删除/跳转编辑的综合页面

**代码路径：**

| 层级     | 路径                                                               |
| -------- | ------------------------------------------------------------------ |
| 前端页面 | `minicare-web/src/pages/records-list/index.tsx`                    |
| 子组件   | `RecordGroup.tsx` / `RecordListItem.tsx` / `RecordActionSheet.tsx` |
| 筛选组件 | `minicare-web/src/components/record/FilterChip.tsx`                |
| 路由     | `/records`（Tab Bar 第二项）                                       |

**功能说明：**

- 类型筛选栏：全部 / 饮食 / 睡眠 / 活动 / 尿布 / 健康 / 表现 / 生长 / 医疗（横向滚动）
- 「今天」切换按钮：与类型筛选正交，单独过滤当日记录
- 按日期分组展示，最新在前
- 点击记录卡片 → 底部操作弹层（RecordActionSheet）
  - 「编辑」→ 跳转对应表单页（携带 `location.state.record`）
  - 「删除」→ 二次确认弹层 → 乐观更新列表

| #     | 任务                                            | 状态          |
| ----- | ----------------------------------------------- | ------------- |
| 2.7.1 | **前端** 记录列表页（类型筛选 + 日期分组）      | ✅ 2026-07-03 |
| 2.7.2 | **前端** RecordActionSheet（编辑/删除操作弹层） | ✅ 2026-07-03 |
| 2.7.3 | **前端** 乐观删除 + 编辑跳转                    | ✅ 2026-07-03 |

---

## 阶段 3 · 生长发育 & 医疗记录 ✅

> 完成时间：2026-07-03

### 3.1 F09 生长发育（复杂度：中）

> **开发前必读**：`.cursor/skills/minicare-dev/SKILL.md` + `docs/features/F09-growth.md`

**代码路径：**

| 层级       | 路径                                                                 |
| ---------- | -------------------------------------------------------------------- |
| 前端页面   | `minicare-web/src/pages/records/growth/index.tsx`（含 MeasureCards） |
| 前端API    | `minicare-web/src/api/records/growth.ts`（`growthApi`）              |
| 后端控制器 | `minicare-server/src/records/growth/growth.controller.ts`            |
| 后端服务   | `minicare-server/src/records/growth/growth.service.ts`               |
| 后端DTO    | `minicare-server/src/records/growth/dto/create-growth.dto.ts`        |

**数据库表：** `growth_record`

| 字段          | 类型       | 说明                           |
| ------------- | ---------- | ------------------------------ |
| `id`          | `CHAR(36)` | UUID                           |
| `baby_id`     | `CHAR(36)` | 关联 `baby_profile.id`         |
| `recorded_by` | `CHAR(36)` | 操作用户 ID                    |
| `record_date` | `DATE`     | 测量日期（每日唯一，唯一索引） |
| `weight_g`    | `INT`      | 体重（克），如 5200 = 5.2kg    |
| `height_mm`   | `INT`      | 身高（毫米），如 620 = 62.0cm  |
| `head_mm`     | `INT`      | 头围（毫米），如 400 = 40.0cm  |
| `note`        | `TEXT`     | 备注（测量机构等）             |

**视觉规范（UI 稿：`ui-draft/form-growth.html`）：**

- 三项输入：身高（cm）/体重（kg）/头围（cm），大号数字输入框
- 单位提示：输入框内右侧小字
- 测量机构：可选文本输入
- ≥2 条记录时展示生长趋势图，暖粉折线色 `#F87098`

| #     | 任务                                                                 | 状态          |
| ----- | -------------------------------------------------------------------- | ------------- |
| 3.1.1 | **前端** 身高/体重/头围数字输入 + 测量机构（可选）                   | ✅ 2026-03-30 |
| 3.1.2 | **前端** 照片上传（最多 3 张，仅留档）                               | 🔲（后置）    |
| 3.1.3 | **后端** `growth.service`：写入（ON DUPLICATE KEY UPDATE，同日覆盖） | ✅ 2026-07-03 |
| 3.1.4 | **前端** ≥2 条记录时展示生长趋势图（Chart.js 或 SVG）                | 🔲（后置）    |

---

### 3.2 F10 医疗记录（复杂度：高）

> **开发前必读**：`.cursor/skills/minicare-dev/SKILL.md` + `docs/features/F10-medical.md`

**代码路径：**

| 层级       | 路径                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 前端页面   | `minicare-web/src/pages/records/medical/index.tsx`（含 VisitTypeSection / BasicInfoSection / ResultSection / MedicationsSection / FollowUpSection / OCRSection） |
| 前端API    | `minicare-web/src/api/records/medical.ts`（`medicalApi`）                                                                                                        |
| 后端控制器 | `minicare-server/src/records/medical/medical.controller.ts`                                                                                                      |
| 后端服务   | `minicare-server/src/records/medical/medical.service.ts`                                                                                                         |
| 后端DTO    | `minicare-server/src/records/medical/dto/create-medical.dto.ts`                                                                                                  |
| 云存储     | `minicare-server/src/storage/storage.service.ts`（照片上传）                                                                                                     |

**数据库表：** `medical_record`

| 字段             | 类型           | 说明                                       |
| ---------------- | -------------- | ------------------------------------------ |
| `id`             | `CHAR(36)`     | UUID                                       |
| `baby_id`        | `CHAR(36)`     | 关联 `baby_profile.id`                     |
| `recorded_by`    | `CHAR(36)`     | 操作用户 ID                                |
| `visit_date`     | `DATE`         | 就诊日期                                   |
| `visit_type`     | `VARCHAR(20)`  | 就诊类型（checkup/allergy/illness/custom） |
| `hospital`       | `VARCHAR(100)` | 医院/机构名称（可选）                      |
| `doctor`         | `VARCHAR(50)`  | 医生姓名（可选）                           |
| `diagnosis`      | `TEXT`         | 诊断结果                                   |
| `result_summary` | `TEXT`         | 检查结果摘要                               |
| `medications`    | `JSON`         | 用药列表 `[{"name":"xx","dose":"xx"}]`     |
| `photo_ids`      | `JSON`         | 照片 fileID 列表（CloudBase 云存储）       |
| `follow_up_date` | `DATE`         | 复查日期（可选）                           |
| `note`           | `TEXT`         | 备注                                       |

**视觉规范（UI 稿：`ui-draft/form-medical.html`）：**

- 检查类型选择：标签按钮（儿保/过敏检查/就诊/自定义）
- 照片上传：最多 5 张，网格布局，`+` 添加按钮，可删除
- OCR 提示：仅医疗记录模块显示「拍照识别」入口，其他模块禁止

| #     | 任务                                                            | 状态                |
| ----- | --------------------------------------------------------------- | ------------------- |
| 3.2.1 | **前端** 检查类型选择（儿保/过敏检查/就诊/自定义）              | ✅ 2026-03-30       |
| 3.2.2 | **前端** 结构化字段（日期/机构/医生/结果/诊断/用药/复查日期）   | ✅ 2026-03-30       |
| 3.2.3 | **前端** 照片上传最多 5 张（云存储）                            | 🔲（后置）          |
| 3.2.4 | **后端** `medical.service`：完整 CRUD（含 JSON 字段、日期处理） | ✅ 2026-07-03       |
| 3.2.5 | **后端** OCR 接入（腾讯云 OCR，**可选，可后置**）               | ⏭️ 跳过（MVP 后置） |

---

## 阶段 4 · 家庭协作 & 数据分析报告 ✅

> 完成时间：2026-04-20

### 4.1 F12 家庭成员管理

> **开发前必读**：`.cursor/skills/minicare-dev/SKILL.md` + `docs/features/F12-family.md`

**代码路径：**

| 层级         | 路径                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| 前端页面     | `minicare-web/src/pages/profile/index.tsx`（含 MembersModal / BabyHero / SettingsGroup） |
| 前端API      | `minicare-web/src/api/family.ts`（`familyApi`，含 `inviteMember` / `removeMember`）      |
| 后端控制器   | `minicare-server/src/family/family.controller.ts`                                        |
| 后端服务     | `minicare-server/src/family/family.service.ts`                                           |
| 后端权限守卫 | `minicare-server/src/family/family-member.guard.ts`                                      |
| 后端角色守卫 | `minicare-server/src/family/role.guard.ts`                                               |

**数据库表：** `family_member` + `family_group`

`family_member`：

| 字段           | 类型          | 说明                                   |
| -------------- | ------------- | -------------------------------------- |
| `id`           | `CHAR(36)`    | UUID                                   |
| `family_id`    | `CHAR(36)`    | 关联 `family_group.id`                 |
| `user_id`      | `CHAR(36)`    | 用户 ID（待接受邀请时为 NULL）         |
| `role`         | `TINYINT`     | **`1=owner 2=member`**（双向映射必须） |
| `invite_phone` | `VARCHAR(20)` | 被邀请手机号                           |
| `status`       | `TINYINT`     | **`1=pending 2=active 3=left`**        |
| `invited_by`   | `CHAR(36)`    | 邀请者 user_id                         |
| `joined_at`    | `DATETIME`    | 接受邀请时间                           |

**视觉规范（UI 稿：`ui-draft/profile.html`）：**

- 成员列表：头像圆形 `40px` + 姓名 + 角色标签（owner 深粉标签 `#F87098`）
- 待接受邀请成员：角色区域显示「待接受」灰色标签
- 邀请按钮：右上角 `+` 图标按钮，颜色 `#F87098`
- 成员操作菜单：长按或三点菜单，仅创建者（owner）可见修改/移除选项

| #     | 任务                                                                | 状态                              |
| ----- | ------------------------------------------------------------------- | --------------------------------- |
| 4.1.1 | **前端** `ProfilePage` 家庭成员列表（含角色标识/待接受状态）        | ✅ 2026-03-30 |
| 4.1.2 | **前端** 邀请成员弹层：邀请码方式                                   | ✅ 2026-03-30 |
| 4.1.3 | **前端** 成员操作菜单（修改角色/移除，仅创建者可见）                | ✅ 2026-04-15（小程序端实现） |
| 4.1.4 | **后端** `family.service`：邀请逻辑、权限修改、成员移除             | ✅ 2026-04-15 |
| 4.1.5 | **后端** 邀请短信发送（staging 阶段可跳过真实短信，仅记录邀请状态） | ⏭️ 跳过（MVP 使用邀请码） |

---

## 阶段 5 · 小程序迁移与发布 ✅

> 完成时间：2026-04-28
> 小程序正式上线，AppID: wxac792556967d5838

### 5.1 F11 统计报告

> **开发前必读**：`.cursor/skills/minicare-dev/SKILL.md` + `docs/features/F11-report.md`

**代码路径：**

| 层级     | 路径                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| 前端页面 | `minicare-web/src/pages/report/index.tsx`                                                                   |
| 子组件   | `RangeSelector.tsx` / `GeneratePanel.tsx` / `ReportPreview.tsx` / `HistoryList.tsx` / `FullReportModal.tsx` |
| 前端API  | `minicare-web/src/api/`（聚合各记录模块 API）                                                               |
| 后端接口 | 聚合各 records 模块（待独立 `report` 模块或直接在 records 聚合）                                            |

**涉及数据库表（聚合查询）：** 全部记录表（`feeding_record`、`sleep_record`、`diaper_record`、`health_record`、`symptom_record`、`activity_record`、`growth_record`）

**视觉规范（UI 稿：`ui-draft/report.html`）：**

- 时间范围选择：7天/14天/30天/自定义，标签按钮，激活主色
- 报告生成面板：进度状态（生成中/完成），圆形进度动画
- 报告预览卡片：白色卡片，含摘要数据、图表占位、下载/分享按钮
- 历史报告列表：按日期分组，卡片样式，PDF 图标 `#F87098`
- 分享按钮：`share-2` SVG 图标，颜色 `#F87098`

| #     | 任务                                                | 状态                                               |
| ----- | --------------------------------------------------- | -------------------------------------------------- |
| 5.1.1 | **后端** 报告聚合接口（按时间范围汇总各模块数据）   | ✅ 2026-04-18 |
| 5.1.2 | **前端** 报告页面：时间范围选择 + ECharts 图表       | ✅ 2026-04-20（ECharts 6 截图模式） |
| 5.1.3 | **前端** 报告预览与分享（小程序 Canvas 截图分享）    | ✅ 2026-04-20 |
| 5.1.4 | **前端** PDF 生成（jsPDF + html2canvas）            | ⏭️ 跳过（小程序端使用截图分享） |
| 5.1.5 | **前端** 系统分享（小程序原生分享 API）              | ✅ 2026-04-20 |
| 5.1.6 | **前端** 历史报告列表                               | ✅ 2026-04-20 |

### 5.2 小程序发布

| #     | 任务                                          | 状态          |
| ----- | --------------------------------------------- | ------------- |
| 5.2.1 | 小程序提交审核并发布                          | ✅ 2026-04-28 |
| 5.2.2 | 后端最终版部署 CloudRun production            | ✅ 2026-04-25 |
| 5.2.3 | 全流程验收测试（体验版 → 正式版）             | ✅ 2026-04-27 |
| 5.2.4 | Web 端标记维护模式（保持可访问但不再主动开发） | ✅ 2026-04-28 |

---

## 技术规范

### 前端开发规范

- 所有记录表单提交成功后显示 Toast 并返回上一页
- 必填字段校验：提交时高亮错误字段，提示补全
- 照片上传通过 `storage.service` 调 CloudBase 云存储，返回 URL 存入数据库
- 组件路径规范：表单页放 `src/pages/records/<type>/index.tsx`，共用组件放 `src/components/`
- API 模块规范：每个记录类型对应 `src/api/records/<type>.ts`，统一从 `src/api/index.ts` 导出

> ⚠️ **UI 还原强制规范**（开发任何前端页面必遵守）：
>
> 1. **严格对齐设计稿**：所有页面的整体布局、样式、字体、颜色、背景必须与 `minicare/ui-draft/` 中对应 HTML 文件**完全一致**，不得自行调整视觉风格；
> 2. **禁止使用 emoji 作为图标**：页面中所有图标必须按照 `ui-draft` 设计稿中对应的 SVG 图标实现，**严禁用 emoji 符号替代任何功能性或装饰性图标**；
> 3. **开发前必读 SKILL**：开发任何前端页面前，必须先读取 `.cursor/skills/minicare-dev/SKILL.md`（开发规范）和 `.cursor/skills/minicare-design/SKILL.md`（视觉规范）。

### 后端开发规范

- 所有 service 方法通过 `family-member.guard` 鉴权（检查调用者是否为家庭成员）
- 写操作需角色 ≥ member（`role ≤ 2`），创建者操作需 `role = 1`（owner）
- 记录创建时自动写入 `created_by`（当前用户 ID）
- 所有 DTO 用 `class-validator` 装饰器完整校验

#### ⚠️ TINYINT 枚举字段强制规范（避免 500 错误的关键）

数据库中凡是用 `TINYINT` 表示枚举的字段（`gender`、`role`、`status`、`feeding_type` 等），**不得在 SQL 中直接传字符串**。
实际建表 DDL（`001_init_schema.sql`）是唯一权威，文档描述仅供参考，以下是已确认的真实值域：

| 表                 | 字段            | 真实值域（以 001_init_schema.sql 为准）            |
| ------------------ | --------------- | -------------------------------------------------- |
| `baby_profile`     | `gender`        | `0=unknown  1=male  2=female`                      |
| `family_member`    | `status`        | `1=pending  2=active  3=left`                      |
| `family_member`    | `role`          | `1=owner  2=member`                                |
| `feeding_record`   | `feed_type`     | `1=breast  2=formula  3=complementary`             |
| `feeding_record`   | `breast_side`   | `1=left  2=right  3=both`                          |
| `sleep_record`     | `status`        | `1=ongoing  2=ended`                               |
| `diaper_record`    | `diaper_type`   | `1=wet  2=dirty  3=mixed  4=dry`                   |
| `health_record`    | `mood`          | `1=happy  2=neutral  3=fussy  4=crying`            |
| `activity_record`  | `activity_type` | `1=bath  2=outdoor  3=play  4=tummy_time  5=other` |
| `food_observation` | `status`        | `1=observing  2=safe  3=allergic`                  |

**实现要求**：每个涉及 TINYINT 枚举的 Service 文件顶部，必须声明双向映射常量并在读写时使用：

```typescript
// ✅ 正确做法：在 service 文件顶部声明映射
const GENDER_TO_INT: Record<string, number> = {
  unknown: 0,
  male: 1,
  female: 2,
};
const GENDER_TO_STR: Record<number, string> = {
  0: "unknown",
  1: "male",
  2: "female",
};

// 写入时：GENDER_TO_INT[dto.gender] ?? 0
// 读出时：baby.gender = GENDER_TO_STR[baby.gender] ?? 'unknown'
```

```typescript
// ❌ 严禁：直接把字符串传入 SQL
await db.execute('INSERT ... SET status = "active"', [...])  // 必报错
await db.execute('SELECT ... WHERE status = "active"', [...]) // 静默失败
```

### 进度更新规则

- 每完成一项任务，将对应行的 `🔲` 改为 `✅`，并在行末补充完成日期
- 阶段全部完成后，更新顶部「整体进度总览」表格状态和日期
- 更新文件顶部的「最后更新」日期和「整体进度」进度条

---

## 变更日志

| 日期       | 变更内容                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-30 | 初始版本创建，阶段 0 标记完成                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-03-30 | 阶段 1 完成大部分任务：登录跳转(1.1.1/1.1.2)、OnboardingPage 完善含过敏字段(1.2.1-1.2.5)、今日时间轴(1.3.1-1.3.3)；修复 family.service/baby.service 若干 bug；DB migration 002 添加过敏字段                                                                                                                                                                                                                                                         |
| 2026-03-30 | **根因修复**：识别并解决「DDL 不一致」问题，统一 `family_member.status` 和 `baby_profile.gender` TINYINT 值域；新增「TINYINT 枚举字段强制规范」，要求所有 service 实现双向映射常量，避免未来 500 错误                                                                                                                                                                                                                                               |
| 2026-03-30 | 全模块字段类型全量对齐修复：所有 DTO/Service 字段名与枚举均严格对齐 `001_init_schema.sql`；修正 `family_member.role` 为 `1=owner 2=member`；新增 UI 还原强制规范（完全对齐 ui-draft 设计稿，禁用 emoji 图标）                                                                                                                                                                                                                                       |
| 2026-03-30 | **DEV-PLAN 大更新**：在每个模块开发计划中补充前后端代码路径对照表、数据库关键字段说明、视觉规范要点（含 UI 稿文件引用），并统一标注「开发前必读 minicare-dev SKILL」；补全全部 TINYINT 枚举字段值域表                                                                                                                                                                                                                                               |
| 2026-03-30 | **第二轮开发完成**：实现 1.1.3（首次注册 Toast）、1.2.6（ProfilePage 档案编辑 + 真实 API 调用）；批量创建 8 个前端记录表单页（饮食/睡眠/尿布/活动/健康/表现/生长/医疗）并注册路由、更新首页 FAB/快捷按钮；4.1.1+4.1.2（家庭成员列表 + 邀请码弹层）整合进 ProfilePage；全部前端阶段 1-3 任务标记完成                                                                                                                                                 |
| 2026-07-03 | **第三次大更新**：全面对齐代码实际状态 —— 将所有后端 service CRUD（2.1.8/2.2.5/2.2.6/2.3.5/2.4.3/2.5.5/2.6.3/3.1.3/3.2.4）标为 ✅；睡眠计时模式（2.2.1/2.2.2/2.2.3）和首页 SleepBanner 标为 ✅；新增「记录列表页」章节（2.7）；将所有前端 API 路径从 `src/lib/api.ts` 修正为模块化 `src/api/records/*.ts`；将所有前端页面路径从旧格式修正为目录结构 `records/<type>/index.tsx`；更新报告页状态（5.1.2/5.1.3/5.1.6 前端框架 ✅）；整体进度 65% → 85% |
| 2026-05-03 | **MVP 完成总结**：小程序 2026-04-28 正式上线（AppID: wxac792556967d5838）；阶段 4/5 全部标记完成；报告模块使用 ECharts 6 截图模式解决 Canvas 层级问题；家庭协作在小程序端完整实现；整体进度 85% → 100%（MVP） |
| 2026-10-11 | **图表渲染重构**：报告页 EcChart 由「离屏截图模式」重构为「canvas 2d 同层渲染直显」（基础库 2.9.0+ 支持同层渲染，官方现行口径「除事件相关，同层渲染下已无层级/滚动限制」，截图前提不再成立）；解锁触摸 tooltip、移除临时文件与固定延时；研究文档见 `docs/tech/TECH-025-mp-chart-rendering-research.md` |
| 2026-10-11 | **分析页优化（真机验收后）**：健康 Tab 改「体温异常点」聚焦（仅 ≥37.5°C 异常记录，37.5–38 橙 / ≥38 红，无异常展示「体温平稳」空态；默认范围 30 天 → 半年）；排敏 Tab 重构为图表分析形态（引入进度双线 / 五态环图 / 类别覆盖 / 动态洞察），消除与「排敏进度」页的内容重复，并隐藏该 Tab 的时间范围选择器 |
| 2026-10-11 | **分析页优化 ②**：生长 Tab 合并「体重/身高/头围」三个子 Tab 为纵向三图（平滑曲线连接数据点，逐图标注最新值+百分位）；全页面图表 Tooltip 统一暖色样式（白底 + 暖粉描边 #F5D5E0 + 圆角，新增 `pagesReport/chartTheme.ts` 的 `WARM_TOOLTIP`）并升级内容（日期/数值/单位/百分位、堆叠图合计）；饮食/睡眠/尿布三 Tab 首图关闭 tooltip |
| 2026-10-11 | **分析页优化 ③（修正）**：饮食/睡眠/尿布首图**恢复/补上 tooltip**（轮 ② 将「首图未展示 tooltip」误读为「要求不展示」，实际需求为「此前未展示、需补上」，本轮已修正）；生长图 tooltip 改 **item 触发**（仅点按记录点弹出，点按刻度线/空白处不再弹出，避免误触），并开启全局粗指针判定（`useCoarsePointer + pointerSize 24`，仅 weapp）便于点中小标记 |
| 2026-10-11 | **首页排敏进度 Bar 可见性收紧**：无任何排敏任务（含历史）时整条不渲染——新用户 / 小月龄尚未添加辅食的宝宝首页不再出现「暂无排敏任务」空态；有观察中任务显示进度摘要，仅有历史任务保留「去添加」引导（首个任务由辅食保存服务端联动自动创建）。改动：`minicare-mp/src/pages/home/AllergyProgressBar.tsx`；PRD-002 §10.4 / §10.4.1 / §10.5.2 / §10.6.1 / §11.1（FO-014）同步 |
