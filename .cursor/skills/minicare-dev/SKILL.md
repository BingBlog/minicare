---
name: minicare-dev
description: 敏宝日记（minicare）项目的开发规范 SKILL。开发 minicare App 的任何功能模块时必须使用此 SKILL。具体场景：（1）开发或实现某个功能模块（如饮食记录、睡眠记录、家庭管理等），需要引用对应 PRD 模块文档以了解业务规则、验收标准和数据库表结构；（2）修改或更新任何功能逻辑后，需要同步更新对应 PRD 模块文档；（3）需要了解数据库表字段、权限模型、设计规范时；（4）用户说「实现 XX 功能」「开发 XX 模块」「修改 XX 逻辑」时，均应使用此 SKILL 确保 PRD 一致性。
---

# 敏宝日记开发规范

## 核心原则

**每次开发或修改功能时，必须同时做两件事**：

1. **开发前**：读取对应模块的 PRD 文档，了解业务规则和验收标准
2. **开发后**：若逻辑有变化，更新对应 PRD 模块文档，并在文件顶部更新「最后同步」日期

---

## PRD 文档结构

所有模块文档位于 `/Users/bing/Desktop/工作区/minicare/docs/`

**快速导航（按功能模块）**：

| 开发功能                       | 先读这个文件                    |
| ------------------------------ | ------------------------------- |
| 登录/注册                      | `docs/features/F01-auth.md`     |
| 宝宝档案管理（含引导页、设置） | `docs/features/F02-profile.md`  |
| **饮食记录**（含转奶/辅食）    | `docs/features/F03-feeding.md`  |
| **睡眠记录**                   | `docs/features/F04-sleep.md`    |
| 活动记录                       | `docs/features/F05-activity.md` |
| 尿布记录                       | `docs/features/F06-diaper.md`   |
| 健康记录                       | `docs/features/F07-health.md`   |
| 表现记录                       | `docs/features/F08-symptom.md`  |
| 生长发育记录                   | `docs/features/F09-growth.md`   |
| **医疗记录**（含 OCR）         | `docs/features/F10-medical.md`  |
| 报告生成与导出                 | `docs/features/F11-report.md`   |
| **家庭成员管理**               | `docs/features/F12-family.md`   |
| **数据库架构总览**             | `docs/tech/DB-01-overview.md`   |
| **建表 DDL**                   | `docs/tech/DB-02-schema.md`     |
| **Mock 数据**                  | `docs/tech/DB-03-mock-data.md`  |
| 视觉设计/图标/交互规范         | `docs/design-system.md`         |
| UI 原型设计稿（权威参考）       | `minicare/ui-draft/*.html`      |
| 产品概述/导航结构              | `docs/overview.md`              |

完整索引：`docs/README.md`

---

## 代码路径速查

### 前端项目结构（`minicare-web/`）

```
minicare-web/src/
├── pages/
│   ├── login/                 # F01 登录（SmsPanel / PwdPanel / useLoginLogic）
│   ├── onboarding/            # F02 宝宝建档引导（4步流程，AllergySection / BabyInfoForm）
│   ├── home/                  # 首页（HeroSection / QuickActions / TodayTimeline / FabSheet / SleepBanner）
│   ├── profile/               # F02/F12 档案+家庭（BabyHero / MembersModal / EditBabyModal / SettingsGroup）
│   ├── records/               # 各记录表单（8个子目录）
│   │   ├── feeding/           # F03 饮食（BreastSection / FormulaSection / FoodSection / TabSelector）
│   │   ├── sleep/             # F04 睡眠（TimerMode / ManualMode / QualitySection）
│   │   ├── activity/          # F05 活动
│   │   ├── diaper/            # F06 尿布（DiaperTypeSection / PoopSection / ButtConditionSection）
│   │   ├── health/            # F07 健康（TemperatureSection / AllergySection）
│   │   ├── symptom/           # F08 表现（MoodSection / SpiritSection）
│   │   ├── growth/            # F09 生长发育
│   │   ├── medical/           # F10 医疗（OCRSection / MedicationsSection / VisitTypeSection）
│   │   └── shared/            # 共用工具组件
│   ├── records-list/          # 全记录列表（RecordActionSheet / RecordGroup / RecordListItem）
│   └── report/                # F11 报告（GeneratePanel / ReportPreview / FullReportModal）
├── components/
│   ├── AppLayout.tsx          # 底部 Tab Bar（含中央 FAB 占位）
│   ├── record/                # 记录类通用组件（RecordTypeIcon / RecordContent）
│   └── ui/                    # 基础 UI 组件（icons / Toast / BottomSheet / LoadingSpinner）
├── api/
│   ├── http.ts                # request() 基础工具（禁止在组件中直接引用）
│   ├── types.ts               # 全局 TS 类型声明
│   ├── index.ts               # 统一出口，recordsApi 聚合对象
│   └── records/               # 各记录 API 模块（feeding / sleep / diaper / ...）
├── lib/
│   ├── store.ts               # Zustand 全局状态（currentFamily / currentBaby）
│   ├── constants.ts           # 所有枚举中文标签（XXXX_LABELS 系列）
│   └── utils.ts               # 工具函数（getBabyAge / formatTime / timeToISO 等）
└── router.tsx                 # 路由配置
```

### 后端项目结构（`minicare-server/`）

```
minicare-server/src/
├── auth/                      # POST /api/auth/send-code, /api/auth/verify-code
├── family/                    # /api/family，含 family-member.guard.ts / role.guard.ts
├── baby/                      # /api/family/:id/baby
├── baby-foods/                # GET /api/baby-foods（公开静态数据，无需鉴权）
├── records/                   # 8个记录模块（feeding/sleep/diaper/activity/health/symptom/growth/medical）
├── scheduler/                 # 定时任务（睡眠超时 12h 自动标记）
├── storage/                   # 云存储上传（照片）
├── websocket/                 # WebSocket 实时推送
└── common/                    # 共用工具（database / cloudbase / decorators / interceptors / utils）
```

**云函数**（`minicare-server/functions/`）：
- `keepalive-ping/index.js`：定时保活，每 20 分钟 GET CloudRun `/health`

### 数据库迁移文件

**唯一权威来源**：`minicare-server/migrations/` 目录，按文件名顺序执行。

> **当前最新迁移**：`007_diaper_butt_condition.sql`（001~007 共 7 个文件）
> 新增迁移文件后，**必须更新本行的「当前最新迁移」字段**。

| 文件 | 变更内容 |
|------|----------|
| `001_init_schema.sql` | 初始化全部业务表 |
| `002_baby_allergy_fields.sql` | baby_profile 增加过敏/出生字段 |
| `003_medical_extra_fields.sql` | 医疗记录扩展字段 |
| `004_add_structured_fields.sql` | 结构化字段补充 |
| `005_health_structured_fields.sql` | 健康记录结构化字段 |
| `006_activity_type_varchar.sql` | activity_type 改为 VARCHAR |
| `007_diaper_butt_condition.sql` | diaper_record 新增 butt_condition 列 |

---

## 数据库表字段速查

> ⚠️ **唯一权威来源**：`minicare-server/migrations/` 目录下的所有 SQL 文件（当前 001~007）  
> 主键均为 `CHAR(36)` UUID，由**应用层生成传入**（MySQL 不支持 `DEFAULT UUID()`）

### TINYINT 枚举值域（双向映射必须）

| 表                | 字段             | 值域                                              |
| ----------------- | ---------------- | ------------------------------------------------- |
| `baby_profile`    | `gender`         | `0=unknown 1=male 2=female`                       |
| `family_member`   | `role`           | `1=owner 2=member`                                |
| `family_member`   | `status`         | `1=pending 2=active 3=left`                       |
| `feeding_record`  | `feed_type`      | `1=breast 2=formula 3=complementary`              |
| `feeding_record`  | `breast_side`    | `1=left 2=right 3=both`                           |
| `sleep_record`    | `status`         | `1=ongoing 2=ended`                               |
| `diaper_record`   | `diaper_type`    | `1=wet 2=dirty 3=mixed 4=dry`                     |
| `health_record`   | `mood`           | `1=happy 2=neutral 3=fussy 4=crying`              |
| `activity_record` | `activity_type`  | `1=bath 2=outdoor 3=play 4=tummy_time 5=other`    |
| `food_observation`| `status`         | `1=observing 2=safe 3=allergic`                   |

### 各模块关键字段

**`baby_profile`**（`001` + `002`）：`id`, `family_id`, `name`, `gender(TINYINT)`, `birth_date`, `avatar_url`, `allergy_types(JSON)`, `allergy_level(VARCHAR)`, `birth_weight_g`, `birth_height_cm`

**`feeding_record`**：`id`, `baby_id`, `recorded_by`, `record_time`, `feed_type(TINYINT)`, `breast_side(TINYINT)`, `duration_min`, `formula_ml`, `complementary_food`, `amount_g`, `note`

**`sleep_record`**：`id`, `baby_id`, `recorded_by`, `start_time`, `end_time(NULL=进行中)`, `duration_min`, `status(TINYINT)`, `note`

**`diaper_record`**：`id`, `baby_id`, `recorded_by`, `record_time`, `diaper_type(TINYINT)`, `color`, `note`

**`health_record`**：`id`, `baby_id`, `recorded_by`, `record_time`, `temperature(DECIMAL4,1)`, `mood(TINYINT)`, `note`

**`symptom_record`**：`id`, `baby_id`, `recorded_by`, `record_time`, `symptoms(JSON)`, `photo_ids(JSON)`, `note`

**`activity_record`**：`id`, `baby_id`, `recorded_by`, `record_time`, `activity_type(TINYINT)`, `duration_min`, `note`

**`growth_record`**：`id`, `baby_id`, `recorded_by`, `record_date(DATE)`, `weight_g(INT,克)`, `height_mm(INT,毫米)`, `head_mm(INT,毫米)`, `note`（每日唯一）

**`medical_record`**：`id`, `baby_id`, `recorded_by`, `visit_date(DATE)`, `hospital`, `diagnosis(TEXT)`, `medications(JSON)`, `photo_ids(JSON)`, `note`

**`food_observation`**：`id`, `baby_id`, `food_name`, `first_intro_at(DATE)`, `status(TINYINT)`, `reaction_note`（每宝宝每食物唯一）

**`family_member`**：`id`, `family_id`, `user_id(NULL=待接受)`, `role(TINYINT)`, `invite_phone`, `status(TINYINT)`, `invited_by`, `joined_at`

---

## 开发工作流

### 步骤 1：读取对应模块文档

开始开发前，使用 `read_file` 读取对应模块的 PRD 文档：

```
read_file("docs/features/F03-feeding.md")  // 以饮食记录为例
```

重点关注：

- **业务规则**（不可跳过，包含临床规则和边界条件）
- **验收标准（AC）**（对应测试用例）
- **数据库表字段**（避免字段设计错误）
- **交互示意图**（了解 UI 预期状态）

### 步骤 2：开发实现

- UI 原型参考文件路径：`minicare/ui-draft/` 下对应 HTML 文件（见下方映射表）
- 设计 Token 参考：`.catpaw/skills/minicare-design/design-tokens.md`
- 组件规范参考：`.catpaw/skills/minicare-design/components.md`
- 图标使用规范：**必须用 Lucide Icons SVG，禁止用 emoji 替代功能性图标**

**UI 稿文件映射**：

| 功能模块 | UI 稿文件 |
| -------- | --------- |
| 首页（时间轴/FAB/睡眠横幅） | `ui-draft/home.html` |
| 登录页 | `ui-draft/login.html` |
| 引导建档页 | `ui-draft/onboarding.html` |
| 个人档案/家庭 | `ui-draft/profile.html` |
| 记录列表 | `ui-draft/records.html` |
| 统计报告 | `ui-draft/report.html` |
| 饮食记录表单 | `ui-draft/form-feeding.html` |
| 睡眠记录表单 | `ui-draft/form-sleep.html` |
| 尿布记录表单 | `ui-draft/form-diaper.html` |
| 活动记录表单 | `ui-draft/form-activity.html` |
| 健康记录表单 | `ui-draft/form-health.html` |
| 表现记录表单 | `ui-draft/form-symptom.html` |
| 生长发育表单 | `ui-draft/form-growth.html` |
| 医疗记录表单 | `ui-draft/form-medical.html` |

> ⚠️ **UI 还原强制规范（开发任何页面前必读）**
>
> 1. **严格对齐设计稿**：所有页面的整体布局、样式、字体、颜色、背景必须与 `minicare/ui-draft/` 中对应 HTML 文件**完全一致**，不得自行调整视觉风格；
> 2. **禁止使用 emoji 作为图标**：页面中所有图标必须按照 `ui-draft` 设计稿中对应的 SVG 图标（`icons-sprite.js` / `icons.css`）实现，**严禁用 emoji 符号替代任何功能性或装饰性图标**；
> 3. **同时激活设计规范 SKILL**：开发或修改任何前端页面时，必须同时读取并遵循 `.catpaw/skills/minicare-design/SKILL.md` 中的视觉规范。

### 步骤 3：同步更新 PRD

若开发过程中业务规则有变更，必须同步更新：

1. 更新 `docs/features/F0x-*.md` 对应章节
2. 更新文件顶部 `最后同步` 日期
3. 同步更新 `MVP-PRD.md` 对应章节（`MVP-PRD.md` 是权威来源）

---

## 关键业务规则速查

### 权限模型（family_member.role）

- `1` = owner（创建者）：可邀请/移除成员、修改宝宝档案、查看和新增所有记录
- `2` = member（普通成员）：可查看和新增所有记录

> **注**：DDL `family_member.role TINYINT DEFAULT 2 COMMENT '1=owner 2=member'`，旧文档中的 0=创建者/1=编辑者/2=查看者已废弃。

### 奶粉多选逻辑

- 选中奶粉类型 → 显示对应配比行
- 取消选中 → 隐藏配比行 + **重置勺数为 0**
- 选中「深度水解」→ 额外显示「含乳糖」勾选框
- 取消「深度水解」→ **隐藏并重置含乳糖状态**

### 睡眠计时持久化

- 点击「开始睡眠」**立即写入数据库**（`status = 1` 即 `ongoing`），不依赖内存
- App 冷启动/唤醒时检测未结束记录（`status=1`），首页显示「进行中」横幅
- 超过 **12 小时**由 scheduler 定时任务自动处理（`tasks.service.ts`）

### OCR 边界（非常重要）

- **仅医疗记录模块**（`MedicalFormPage.tsx` + `medical.service.ts`）支持拍照 OCR 文字提取
- 其他所有模块的照片输入**仅做附件留档，不做 OCR**

### 视觉核心规范（快速记忆）

| 场景 | 颜色 |
| ---- | ---- |
| 主色（按钮/激活/强调） | `#F87098` |
| 图标盒背景（浅粉） | `#FFF0F4` |
| 图标颜色（默认粉） | `#F0B8C8` |
| Tab 激活图标 | `#E8507A` |
| 暖色图标（活动/辅食） | `#DDB870`，背景 `#FFF8EC` |
| 主文字 | `#3D2B2E` |
| 次级文字 | `#9A7E82` |
| 时间线标题 | `#7A5A60` |
| 页面背景 | `#FDF7F5` |
| 卡片背景 | `#FFFFFF` |

---

## PRD 更新模板

更新 PRD 模块文档时，在文件顶部 `最后同步` 字段后追加变更摘要：

```markdown
> 来源：MVP-PRD.md §3.2.1  
> 功能 ID：P0-002  
> 优先级：P0  
> 最后同步：2026-03-30（更新：奶粉多选+含乳糖勾选交互逻辑）
```

**禁止直接删除 PRD 内容**——若需求变更，使用删除线标注旧内容并在下方注明新规则。

---

## 文档维护规则

每次迭代结束时，检查以下事项是否需要同步更新：

| 代码变更事件 | 需更新的文件 | 更新内容 |
|-------------|------------|----------|
| 新增 migration（NNN_xxx.sql） | 本 SKILL 的「当前最新迁移」行 | 改为 `NNN_xxx.sql` |
| 新增前端页面目录 | 本 SKILL 的「前端项目结构」 | 在对应位置补充目录行 |
| 新增后端模块目录 | 本 SKILL 的「后端项目结构」 | 在 records/ 或根目录补充 |
| 新增云函数 | 本 SKILL 的「云函数」小节 + `cloudbase-conventions.mdc` §4.5 | 新增函数名和说明 |
| PRD 业务规则变更 | `docs/features/F0x-*.md` 对应章节 | 更新规则 + 顶部「最后同步」日期 |
| 数据库密码/JWT 变更 | `.catpaw/skills/minicare-deploy/SKILL.md` §1.3 | 更新 EnvParams 字符串 |
| CloudRun 域名变更 | deploy Skill §1.3 + `cloudbase-conventions.mdc` §1.1 | 同步更新两处域名 |
| 新增枚举中文标签 | `minicare-web/src/lib/constants.ts` + 本 SKILL 的「已收录枚举」表 | 追加常量名和含义 |

> **原则**：目录结构优于文件枚举（目录变化慢）；指针优于复制（复制必然过时）。

---

## 参考文件

- `minicare/docs/README.md` — 模块文档总索引
- `minicare/docs/tech/DB-01-overview.md` — 数据架构总览（ER 图、存储策略、技术选型）
- `minicare/docs/tech/DB-02-schema.md` — 完整建表说明（指向 migrations 权威）
- `minicare/docs/tech/DB-03-mock-data.md` — Mock 数据示例
- `minicare/minicare-server/migrations/` — **权威 DDL 目录（001~007）**
- `minicare/MVP-PRD.md` — 完整 PRD（权威来源）
- `.catpaw/skills/minicare-deploy/SKILL.md` — 发布操作手册（含 EnvParams 等敏感参数，不提交 git）
- `.catpaw/skills/minicare-design/SKILL.md` — 视觉风格指南（UI 页面开发时同时激活）
- `minicare/docs/DEV-PLAN.md` — 开发计划与进度跟踪