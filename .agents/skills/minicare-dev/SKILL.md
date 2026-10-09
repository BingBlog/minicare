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
├── schedule/                   # 宝宝作息计划（PRD-009）：/api/family/:familyId/schedule/{template,today}
│                              #   📌 日程项类型的**唯一改动点 = 这 3 个文件**：
│                              #      schedule-item-type.ts        枚举值（DDL item_type VARCHAR(24)）
│                              #      schedule-item-type.meta.ts   默认名/分组/可判定/默认提前量（纯数据，随 /api/config 下发）
│                              #      schedule-item-type.registry.ts  match/summary 函数（Record 强制穷举，漏写编译报错）
│                              #   ⚠️ matchRecord / buildSummary 已改为**查表**，不要在 service 里加 case
│                              #   ⚠️ 判定窗口 60/90 + 同类项间隔 150 的单一定义处 = schedule.constants.ts
│                              #   ⚠️ 与 @nestjs/schedule 的 ScheduleModule 同名，app.module.ts 中已把后者重命名为 CronScheduleModule
├── scheduler/                 # 定时任务（睡眠超时 12h 自动标记）
├── storage/                   # 云存储上传（照片）
├── websocket/                 # WebSocket 实时推送
├── device/                    # 音箱设备（TECH-008）：DeviceGuard + 绑定码/绑定/解绑 + LLM Adapter
├── app-config/                # GET /api/config（公开）：枚举/数值范围/营养素/日程项类型 的统一下发通道
│                              #   ⚠️ app-config.data.ts 是"权威数据源"，各 DTO 的 enum 从此处导入
│                              #   ⚠️ 改这里要同步 bump CONFIG_VERSION
└── common/                    # 共用工具（database / cloudbase / decorators / interceptors / utils）
```

### 小程序项目结构（`minicare-mp/`，主平台）

> ⚠️ 本节只记录**相对 Web 的新增/差异目录**，完整结构以 `minicare-mp/src/` 为准。

```
minicare-mp/src/
├── pages/
│   ├── home/                  # 首页（含 ScheduleBanner.tsx = PRD-009 日程 Bar）
│   └── schedule/              # PRD-009 宝宝日程表
│       ├── index.tsx           #   作息计划（US-01 / US-02：默认模板 + 增删改 + 拖拽排序 + 全量保存）
│       └── today.tsx           #   今日日程详情（US-04：进度条 + 时间轴 + 点项预填跳记录）
├── api/
│   ├── schedule.ts            # scheduleApi（template / today），类型 ScheduleItem 等
│   └── activity.ts            # ActivityType union（含 bath）
└── lib/
    └── schedule.ts            # 日程展示配置：六态徽标 / 150 分钟镜像常量 / 类型→记录页跳转表
                               #   ⚠️ 类型清单**不在前端**：由 GET /api/config 的 scheduleItemTypes 下发，
                               #      经 buildScheduleTypeIndex() 消费。新增类型只改服务端。
```

**云函数**（`minicare-server/functions/`）：
- `keepalive-ping/index.js`：定时保活，每 20 分钟 GET CloudRun `/health`

### 数据库迁移文件

**唯一权威来源**：`minicare-server/migrations/` 目录，按文件名顺序执行。

> **当前最新迁移**：`024_password_login.sql`（001~022 + 024，**无 023**）
> 新增迁移文件后，**必须更新本行的「当前最新迁移」字段**。
>
> ⚠️ **环境差异提醒**：各库进度不一致，写任何跨环境代码前先确认目标库的 `schema_migrations`
> （`npm run migrate:status`，或 `SELECT version FROM schema_migrations ORDER BY version`）。
> **实测 2026-10-09**：`minicare_dev` → **024**（最新）；`minicare_staging` → **019**；
> `minicare-cloud-6gqledlle0132cbe`（正式）→ **019**。
> 即 **020 / 021 / 022 / 023 / 024 对 staging 与正式库都还没生效**。
> ⚠️ `022_schedule_template.sql`（PRD-009）**必须配套执行**才可用日程功能：接口无表可写会直接 500；
> `023_schedule_sort_order.sql` 必须紧跟其后，否则保存模板时 `sort_order` 列不存在 → 500。

| 文件 | 变更内容 |
|------|----------|
| `001_init_schema.sql` | 初始化全部业务表 |
| `002_baby_allergy_fields.sql` | baby_profile 增加过敏/出生字段 |
| `003_medical_extra_fields.sql` | 医疗记录扩展字段 |
| `004_add_structured_fields.sql` | 结构化字段补充 |
| `005_health_structured_fields.sql` | 健康记录结构化字段 |
| `006_activity_type_varchar.sql` | activity_type 改为 VARCHAR |
| `007_diaper_butt_condition.sql` | diaper_record 新增 butt_condition 列 |
| `008_schema_redesign.sql` | 全库重设计：feeding 拆 4 表、枚举 VARCHAR 化 |
| `009_record_timeline.sql` | record_timeline 物化表 + 数据回填 |
| `010_sleep_midnight_split.sql` | 睡眠跨午夜拆分 |
| `011_food_observation_workflow.sql` | 辅食排敏任务工作流（food_observation_log 等） |
| `012_soft_delete.sql` | **软删除：baby_profile/family_group 加 deleted_at，移除单宝宝唯一键** |
| `013_medication.sql` | 用药记录模块（medication / medication_record，F14） |
| `014_medical_visit_time.sql` | medical_record 增加 visit_time（HH:mm，可选） |
| `015_follow_up_time.sql` | medical_record 增加 follow_up_time（HH:mm，可选，复查提醒用） |
| `016_timeline_backfill.sql` | record_timeline 全量重刷回填：修复 medical/growth 物化缺失（日期拼接 bug）、medication 历史回填、medical summary_tags 补全（就诊类型/医院/诊断）、清理 medication 孤儿行 |
| `017_knowledge_base.sql` | 敏宝知识条目库（M2 知识问答，agent 知识库，FULLTEXT ngram + embedding BLOB） |
| `018_baby_diary.sql` | 宝宝每日日记（M5 日记生成，baby_id+diary_date 唯一每天一篇） |
| `019_speaker_device.sql` | 音箱设备绑定（TECH-008「小宝小宝」）：speaker_device（token 哈希+last_conversation_id）+ speaker_binding_code（6 位绑定码，每家庭仅 1 条 pending） |
| `020_medical_typed_records.sql` | medical_record 类型化扩展（visit_type=vaccine/checkup/sick + vaccine_*/checkup_*/sick_* 列）+ vaccine_schedule 参考库 + baby_vaccine_setting + record_timeline.medical_visit_type（**生产库尚未应用，见上方提醒**） |
| `021_knowledge_retrieval_status.sql` | 知识库「不可检索」由 content 前缀 hack 改为显式字段（PRD-008 D-06 / TECH-015 §6.2）。**只加列不回填**（expand-contract 第 1 步） |
| `022_schedule_template.sql` | **`schedule_template_item`** 宝宝作息计划模板（PRD-009 期一）：**只存模板不存每日日程**，今日状态实时派生；`item_type` VARCHAR(30)、`execute_time`/`prepare_time` TIME、`enabled`、`deleted_at` 软删除、`KEY idx_sched_baby_time(baby_id, execute_time)` |
| `023_schedule_sort_order.sql` | `schedule_template_item` 加 **`sort_order` INT NOT NULL DEFAULT 0 + `KEY idx_sched_baby_sort(baby_id, sort_order)`**（PRD-009 拖拽排序）。**只加列不改语义**：默认 0 让历史行自动退化为"按 `execute_time` 升序"，向后兼容；保存时按提交数组下标整体重写 0..n-1，故不建唯一索引 |
| `024_password_login.sql` | 「手机号 + 密码」登录（TECH-016 §3）：`password_hash` bcrypt（cost=10，NULL 表示未设密码 → 不允许密码登录）|

---

## 数据库表字段速查

> ⚠️ **唯一权威来源**：`minicare-server/migrations/` 目录下的所有 SQL 文件（当前 001~024，号段连续）  
> 主键均为 `CHAR(36)` UUID，由**应用层生成传入**（MySQL 不支持 `DEFAULT UUID()`）

### TINYINT 枚举值域（双向映射必须）

> ⚠️ 下列字段中，**部分已在 migration 008 被改为 VARCHAR 字符串枚举**（如 `activity_record.activity_type`），
> 遇到"标了 TINYINT 但实际是字符串"的情况，以 migration 文件为准。

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
| `activity_record` | `activity_type`  | ❌ **已废弃 TINYINT 口径**（`006` 改为 VARCHAR(20)）：`gross_motor`\|`fine_motor`\|`edu_play`\|`outdoor`\|`bath`\|`daily_care`\|`other` |
| `food_observation`| `status`         | `1=observing 2=safe 3=allergic`                   |
| `schedule_template_item` | `enabled` | `1=启用 0=停用`；同表 `item_type` 是 VARCHAR 字符串枚举，**14 个取值**，权威清单见 `schedule-item-type.meta.ts`（新增类型不改 DDL） |

### 各模块关键字段

**`baby_profile`**（`001` + `002`）：`id`, `family_id`, `name`, `gender(TINYINT)`, `birth_date`, `avatar_url`, `allergy_types(JSON)`, `allergy_level(VARCHAR)`, `birth_weight_g`, `birth_height_cm`

**`feeding_record`**：`id`, `baby_id`, `recorded_by`, `record_time`, `feed_type(TINYINT)`, `breast_side(TINYINT)`, `duration_min`, `formula_ml`, `complementary_food`, `amount_g`, `note`

**`sleep_record`**：`id`, `baby_id`, `recorded_by`, `start_time`, `end_time(NULL=进行中)`, `duration_min`, `status(TINYINT)`, `note`

**`diaper_record`**：`id`, `baby_id`, `recorded_by`, `record_time`, `diaper_type(TINYINT)`, `color`, `note`

**`health_record`**：`id`, `baby_id`, `recorded_by`, `record_time`, `temperature(DECIMAL4,1)`, `mood(TINYINT)`, `note`

**`symptom_record`**：`id`, `baby_id`, `recorded_by`, `record_time`, `symptoms(JSON)`, `photo_ids(JSON)`, `note`

**`activity_record`**：`id`, `baby_id`, `recorded_by`, `record_time`, `activity_type(VARCHAR20)`, `duration_min`, `intensity(VARCHAR10)`, `note`

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
- **影响面清单**（该模块的全部消费方，改动前必须逐项核对）
- **交互示意图**（了解 UI 预期状态）

### 步骤 2：影响面扫描（改动任何功能前必做，硬性）

> 背景：一次 health 表单改动曾漏掉首页时间线/记录列表展示层，用户测试才发现。
> 根因是消费方清单缺失。此步骤强制"先梳理影响面，再动手"。
> 双路扫描：**impact-scan 脚本（字段级）+ GitNexus 图谱（符号级）**，互补覆盖。

1. **字段级扫描**（找业务字段/路由/枚举的全部引用）：

```bash
node .agents/scripts/impact-scan.mjs <功能域关键词...>
# 例：node .agents/scripts/impact-scan.mjs health temperature allergy skin_care
```

2. **符号级查询**（找函数/组件/类的调用链与影响半径，GitNexus 知识图谱）：

```bash
# 改动前查影响面（MCP 工具已接入 WorkBuddy 时优先用 impact/context 工具）
npx -y gitnexus@latest impact <符号名>       # 上游依赖（谁调用它）
npx -y gitnexus@latest context <符号名>      # 360° 视图：callers/callees/流程
# 提交前检查：本次 git 改动命中了哪些符号/流程
npx -y gitnexus@latest detect-changes
```

   风险分级（GitNexus impact 输出按深度评估）：

| 深度 | 风险 | 含义 |
|------|------|------|
| d=1 | **WILL BREAK** | 直接调用方/引用方，必须逐一核对 |
| d=2 | LIKELY AFFECTED | 间接依赖，重点检查 |
| d=3 | MAY NEED TESTING | 传递影响，抽查 |

3. 按输出分组（入口层/表单页/组件/API/展示层/常量工具/后端/文档）**逐项核对**，
   评估本次改动是否影响该消费点，并把影响结论记录在改动说明中。
4. 对照 PRD「影响面清单」章节检查：清单里有没有本次新增/变更的消费点？
   有则**先补清单再开发**（清单与代码同步演进，防止下次再漏）。
5. 常用功能域关键词速查（按需扩展）：

| 功能域 | 关键词 |
|--------|--------|
| 健康（体温/过敏） | `health temperature allergy skin_care` |
| 饮食（含奶粉多选/辅食/补剂） | `feeding formula breast food supplement` |
| 睡眠 | `sleep` |
| 尿布 | `diaper` |
| 表现 | `symptom mood spirit` |
| 生长 | `growth height weight head` |
| 医疗 | `medical hospital medications` |
| 用药 | `medication` |
| 辅食排敏 | `food_observation reaction` |

> ⚠️ 大小写不敏感匹配（如 `health` 会命中 `HealthRecord` 类型名），扫描结果需人工确认，
> 可能有少量误报，但**漏报风险远低于误报**——宁可多核对几个文件。
> 图谱维护：git post-commit hook 已自动增量更新（.git/hooks/post-commit，后台异步），
> 也可手动 `npx -y gitnexus@latest analyze`；图谱落后时 impact 输出会提示 stale。

### 步骤 3：开发实现

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

### 步骤 4：同步更新 PRD

若开发过程中业务规则有变更，必须同步更新：

1. 更新 `docs/features/F0x-*.md` 对应章节
2. **更新该模块的「影响面清单」章节**：新增/删除的消费点（页面、组件、API、后端服务、展示层）必须同步
3. 更新文件顶部 `最后同步` 日期
4. 同步更新 `docs/business/MVP-PRD.md` 对应章节（`docs/business/MVP-PRD.md` 是权威来源）

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

- 点击「开始睡眠」**立即写入数据库**（`status='ongoing'`，字符串枚举，Migration 008 起），不依赖内存
- App 冷启动/唤醒时检测未结束记录（`status='ongoing'`），首页显示「进行中」横幅
- 超过 **16 小时**由 scheduler 定时任务自动关闭（`tasks.service.ts`，写 `quality='poor'` + 备注）
- **睡眠质量默认「良好」**：计时/补录页质量控件默认选中「良好」；首页横幅 / 看板「结束」
  等**无质量选择入口**的快捷路径必须提交 `quality='good'`，**禁止硬编码 `normal`**
  （2026-10-09 修复，详见 F04-sleep.md「睡眠质量默认值」）

### OCR 边界（非常重要）

- **仅医疗记录模块**（`MedicalFormPage.tsx` + `medical.service.ts`）支持拍照 OCR 文字提取
- 其他所有模块的照片输入**仅做附件留档，不做 OCR**

### 软删除原则（硬性约束，Migration 012）

- **所有删除操作一律软删除，禁止物理 DELETE 业务数据**——保留历史数据，避免误删导致数据丢失
- 删除 = 标记 `deleted_at = NOW()`；`family_member` 复用 `status='left'`
- **查询必须过滤**：所有按 baby/family 的查询带 `deleted_at IS NULL`；FamilyMemberGuard 已 JOIN `family_group.deleted_at IS NULL`（家庭解散后成员访问被拦截）
- 新增删除功能时：① 目标表加 `deleted_at`（或复用 status）② 查询过滤 ③ 勿删关联记录
- 已落地示例：`BabyService.deleteBaby` / `FamilyService.deleteFamily`（仅标记，不物理删除）
- 例外：测试数据清理可物理删除

### 日程项类型：单一声明源（PRD-009，硬性）

**新增/修改一个日程项类型，只改服务端 3 个文件**：
`src/schedule/schedule-item-type.ts`（枚举值）→ `schedule-item-type.meta.ts`（名称/分组/可判定/默认提前量）
→ `schedule-item-type.registry.ts`（`match` / `summary`）。

其余全部自动派生，**禁止再枚举第二遍**：
- 服务端：`SCHEDULE_ITEM_TYPE_LABELS` / `isJudgableItemType` / `defaultPrepareOffsetMin` 由 meta 派生；
  `schedule.service.ts::matchRecord` / `buildSummary` 查表（**不要在里面加 case**）。
- 小程序：类型选项来自 `GET /api/config` 的 `scheduleItemTypes`，用 `lib/schedule.ts::buildScheduleTypeIndex()` 消费；
  前端只保留「类型 → 记录页跳转」(`SCHEDULE_ITEM_TYPE_RECORD`) 这一张**前端专属**表（页面路径服务端不该知道）。

**两条判定硬约束**（决定哪些类型能做日程项）：
① 能唯一定位 `getTodayRecords()` 出口的一类记录（`type + detail` 双键）；
② 记录自带可解析时分 —— `recordHm()` 只认 `[T ]HH:mm`。
→ `growth`（出口 time 是纯日期）、观察型（`temperature` / `allergy` / `symptom`，属事件非计划）、
容器类（`feeding` / `health`，无独立时间语义）**一律不做日程项**。

### 日程判定：两遍配对（PRD-009，硬性）

`schedule.service.ts::deriveItems()` 是**唯一**的状态派生口径，顺序**不能倒**：

1. **窗口匹配（高置信）**：逐项在 `[执行−60, 执行+90]` 找最早匹配记录，命中即 `done` 并标记"已消费"。
2. **顺序兜底（低置信）**：只对第一遍**完全没命中**的项生效 —— 同类「未配对且**执行时间已到**」的项 ×
   「未消费记录」各按时间升序**一一顺序配对**，**不设时间偏差上限**（用户决策）。
   → 解决"一天整体偏早/偏晚 → 全部误判 `missed` 一直催补记录"。
   → 安全闸：执行时间没到的项**不参与**（否则一顿补喂会把晚上的项提前点亮）。
   → 配对基准是 `execute_time` 升序，**不是** `sort_order`（"第 N 顿"是时间概念，用户怎么拖都不影响）。

⚠️ 常见误改：把 ② 去掉退化成"只做窗口匹配"（就是最初的 bug）；或让 ② 对已到/未到时间的项一视同仁（会误报完成）。
改前先读 `PRD-009.md §1.4.2`，改后跑 `node scripts/e2e-schedule.mjs`（T2/T4 就是这两条的正确性护栏）。

### 作息计划拖拽排序（PRD-009）

- **顺序 = 提交数组顺序**：`PUT template` 的 `items` 下标即 `sort_order`（0..n-1），服务端整体重写，**客户端不传该字段**。
- ⚠️ **禁止在保存前按 `execute_time` 排序** —— 旧实现这么干，会把用户拖出来的顺序"弹"回时间序。
- ⚠️ 拖拽落点几何（`measureRowSlots()`）在长按开始时**只量一次**，前提是"拖拽期间行高一致"：
  ① 拖拽前先收起展开项；② 拖拽态样式**只许用 `transform` / `box-shadow` / 颜色**，改 `padding`/`border`/字号会让落点整体错位。
- 触摸事件挂在**页面根节点**（列表会实时重排、节点在动，挂会变的节点上容易丢事件）。

### 补记录跳转：URL 参数必须解码（PRD-009 US-04，踩过）

🚨 `Taro` 的 `useLoad(options)` **不解码**查询串，而发送端是 `encodeURIComponent` →
接收端不解码就会把 `initTime=07%3A00` 原样塞进表单，`HH:mm` 解析出 `[NaN]` 并渲染成 **`NaN:NaN`**。

- 统一入口：`lib/useRecordInit.ts::useLoad` 里对 `opts` 走一次 `decodeParams()`（所有用该 Hook 的表单页全覆盖），
  日程预填时间经新增的 **`onInitTime`** 回调下发，**各页不要再自己 `parseOptions` 处理 initTime**。
- 不用该 Hook 的页面（`records/feeding`、`records/sleep`）**各自显式 `decodeParams`**。
- 透传型页面（`records/index`、`records/medical/type-select`）必须先解码再编码，否则**二次编码**。

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
> 来源：docs/business/MVP-PRD.md §3.2.1  
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
- `minicare/minicare-server/migrations/` — **权威 DDL 目录（001~022 + 024）**
- `minicare/docs/business/MVP-PRD.md` — 完整 PRD 存档（已归档，现行权威规格见 docs/features/ + docs/prd/）
- `.catpaw/skills/minicare-deploy/SKILL.md` — 发布操作手册（含 EnvParams 等敏感参数，不提交 git）
- `.catpaw/skills/minicare-design/SKILL.md` — 视觉风格指南（UI 页面开发时同时激活）
- `minicare/docs/DEV-PLAN.md` — 开发计划与进度跟踪