# 技术方案：医疗健康档案类型化重构（medical_record 分型 + 疫苗本 / 儿保档案 / 医疗档案归口）

> 关联 PRD：`docs/prd/PRD-005.md`（v1.0）
> 范围映射：P0（类型路由 US-01、疫苗 US-02/03、儿保 US-04/05、兼容 US-10）、P1（就诊增强 US-06、其他 US-07、聚合页 US-08）、P2（过敏档案 US-09，本方案仅预留）
> 版本：v0.2 ｜ 日期：2026-09-07 ｜ 状态：执行中（P0 开发进度见 §5.2/5.4）

## 0. 现状基线（代码事实，勿凭记忆开发）

| 项 | 现状 |
|---|---|
| 主表 | `medical_record`：单表承载 visit_type(checkup/sick/vaccine/other，废弃 blood/allergy)；已有列 visit_date/visit_time/visit_type/hospital/doctor/diagnosis/result_summary/medications(JSON)/photo_ids(JSON)/follow_up_date/follow_up_time/note |
| Service | `minicare-server/src/records/medical/medical.service.ts`：手写 mysql2 SQL；写后调 `timelineService.upsertFromSource('medical', id)`；findAll 为 **7 天窗口**列表（非全量分页） |
| 物化时间线 | `record_timeline`（migration 009）：source_type/source_id/summary_*/detail_json，UNIQUE(source_type,source_id)；读侧 `feed.service` 默认单查询物化表，type 过滤=`source_type = ?`（无子类型维度）；`timeline.service.loadMedicalPayload` 为 medical 摘要来源 |
| growth | `growth_record` 有 `uk_growth_baby_date(baby_id,record_date)`；`growth.service.create` 用 **INSERT…ON DUPLICATE KEY UPDATE**，同日重复提交天然"覆盖"——与 PRD D2「默认覆盖」语义一致 |
| 用药 | 双表 `medication`(药箱) + `medication_record`(打卡)；`medication.service` 有 `assertNameUnique`（同宝宝同名去重），无 ensure 式原子方法 |
| 健康 | `health_record` 复用承载过敏(allergy_symptoms/severity + reaction_source)与体温(temperature)；不动录入表单 |
| MP 路由 | `app.config.ts` subPackages：`pages/records/medical` root 下 pages 仅 `['index']`（表单页）；health 分包先例 pages 用 `['temperature/index','allergy/index']` 嵌套形式 |
| MP 语音 | `lib/voicePrefill.ts`：`voice_*` query 参数 → 表单预填（extractVoiceFields/hasVoiceFields），新增类型化字段沿用该机制 |

## 1. 架构决策

### 1.1 数据模型：medical_record 扩展列（主）+ JSON 列（列表型）

对比三种方案：

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| A. 单表 + 扩展列（显式列 + JSON 列表列） | 与现状/风格一致（photo_ids/medications 已 JSON）；写路径/时间线双写改动最小；vaccine 进度计算可直接按列查询 | 列较多（+13）；JSON 校验靠 DTO | **采用**（P0） |
| B. 拆子表 medical_checkup / medical_vaccine | 关系型最规整；QA/里程碑可独立查询 | 每个子表都要维护"主记录+子记录"一致性；timeline/feed 与现有编辑分流全要双表适配；MVP 工作量陡增 | 不采用（P2 发育回顾统计出现真实查询需求时，再把 QA/里程碑从 JSON 迁子表，见 §6） |
| C. 每类型独立业务表 | 最解耦 | 破坏 medical_record 现有数据/接口/timeline 兼容，老数据迁移成本高 | 不采用 |

JSON 列范围：**列表型 & 无独立查询需求** → `vaccine_reactions`、`sick_symptom_flags`、`checkup_milestones`、`checkup_qa`。显式列范围：**需参与进度计算 / 过滤 / 统计** → vaccine_name/schedule_key/dose_seq、checkup 测量三值/growth_sync。

### 1.2 疫苗参考程序库：DB 表 + seed（migration 内），服务端下发

理由：①进度计算在服务端（为未来提醒/PUSH 预留）；②前端疫苗本列表、选择器联想都需参考库 → 单一数据源后端下发，避免前端双份；③随免疫程序调整走 seed 更新可审计。宝宝级偏好（跟踪开关/联合替代标记）落 `baby_vaccine_setting` 表。参考库为**只读低频数据**，不建索引以外开销。

### 1.3 timeline 适配：物化行加冗余列 `medical_visit_type`

feed 是按物化表分页 keyset 的，**医疗子类型筛选必须落 SQL**（本地过滤会破坏跨页正确性）。故给 `record_timeline` 加 `medical_visit_type VARCHAR(20) NULL`（仅 medical 行填充），读侧 feed 扩展 subtype 过滤；写侧 `loadMedicalPayload` 同步填充；历史行由幂等 backfill 脚本重刷（先例：`scripts/backfill-duration-summary.mjs`）。

### 1.4 growth 同步：直接调用 GrowthService.create（幂等覆盖）

不引入事件总线。`medical.module` imports `GrowthModule`；medical service 在带测量时调 `growthService.create(userId, dto)`（内部 ON DUPLICATE 覆盖 = D2 默认覆盖）。同步前先查当日是否存在 growth 行，用于回填 `checkup_growth_sync`（synced/overwritten），"跳过"则由前端显式传 skip 标志，service 不写 growth。删除儿保**不级联**删 growth（PRD 约束）。

### 1.5 药箱同步（P1）：MedicationService 新增原子方法 `ensureByName`

`medical.module` imports `MedicationModule`；就诊开药列表保存时，对勾选同步的条目逐个 `ensureByName(familyId,babyId,userId,{name,default_dose})`（内部先按名查，存在返回原 id，不存在创建；复用 `assertNameUnique` 的"同宝宝同名唯一"口径）。**不生成服药打卡**。

## 2. 数据库设计（Migration 020）

文件：`minicare-server/migrations/020_medical_typed_records.sql`（编号续 019；schema_migrations 登记走现有 `INSERT IGNORE`）

### 2.1 medical_record 扩展列

```sql
ALTER TABLE `medical_record`
  -- ── 疫苗（visit_type='vaccine'）──
  ADD COLUMN `vaccine_name`        VARCHAR(100) NULL COMMENT '疫苗名称（自定义或参考库名快照）',
  ADD COLUMN `vaccine_schedule_key` VARCHAR(40)  NULL COMMENT '参考库程序键（hepb/dtp/mcv…；自定义疫苗为 NULL）',
  ADD COLUMN `vaccine_dose_seq`    TINYINT      NULL COMMENT '第几剂（1 起）',
  ADD COLUMN `vaccine_site`        VARCHAR(20)  NULL COMMENT '部位: left_arm/right_arm/thigh/oral/other/unknown',
  ADD COLUMN `vaccine_batch`       VARCHAR(50)  NULL COMMENT '批号（选填）',
  ADD COLUMN `vaccine_reactions`   JSON         NULL COMMENT '反应枚举数组，如 ["fever","local_redness"]',
  ADD COLUMN `vaccine_reaction_note` TEXT       NULL COMMENT '反应文字说明',
  -- ── 儿保（visit_type='checkup'）──
  ADD COLUMN `checkup_height_mm`   SMALLINT     NULL COMMENT '身高 mm（与 growth 同单位）',
  ADD COLUMN `checkup_weight_g`    INT          NULL COMMENT '体重 g',
  ADD COLUMN `checkup_head_mm`     SMALLINT     NULL COMMENT '头围 mm',
  ADD COLUMN `checkup_milestones`  JSON         NULL COMMENT '[{dim,status,note}] dim∈gross/fine/language/cognitive/social status∈ok/watch/na',
  ADD COLUMN `checkup_assessment`  TEXT         NULL COMMENT '医生综合评估与建议',
  ADD COLUMN `checkup_qa`          JSON         NULL COMMENT '[{question,answer}] answer 空=待补答复',
  ADD COLUMN `checkup_growth_sync` VARCHAR(16)  NULL COMMENT 'none/synced/overwritten/skipped',
  -- ── 就诊（visit_type='sick'）──
  ADD COLUMN `sick_complaint`      TEXT         NULL COMMENT '主诉描述',
  ADD COLUMN `sick_symptom_flags`  JSON         NULL COMMENT '主诉症状标签枚举数组';
```

约束/说明：
- 非类型对应列允许为空，**不强校验**（老数据与跨类型切换安全）；类型专属校验放 DTO。
- `vaccine_schedule_key` 无外键（参考库 seed 可重置，避免 FK 约束导入顺序问题），由 service 校验 key 存在。
- 不新增索引：疫苗/儿保按 `(baby_id, visit_type, visit_date)` 查询，现有 `idx_medical_baby_date` 不够 → 新增 `KEY idx_medical_baby_type_date (baby_id, visit_type, visit_date)`。

### 2.2 新表 vaccine_schedule（参考库，seed 同 migration）

```sql
CREATE TABLE `vaccine_schedule` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `vkey`        VARCHAR(40)  NOT NULL COMMENT '程序键，如 hepb/mcv-1',
  `name`        VARCHAR(60)  NOT NULL COMMENT '疫苗名（用户可见）',
  `category`    VARCHAR(8)   NOT NULL COMMENT 'free=一类免费 / paid=二类自费',
  `dose_seq`    TINYINT      NOT NULL COMMENT '剂次序号 1 起',
  `dose_label`  VARCHAR(20)  NOT NULL COMMENT '第1剂/第2剂…',
  `month_min`   SMALLINT     NULL COMMENT '可接种最早月龄',
  `month_rec`   SMALLINT     NOT NULL COMMENT '建议月龄（进度展示/到龄用）',
  `month_max`   SMALLINT     NULL COMMENT '建议窗口上限月龄（逾期判定，NULL=无上限）',
  `note`        VARCHAR(200) NULL,
  `sort`        INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vkey_dose` (`vkey`, `dose_seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='疫苗参考程序库(只读seed, 以接种本/医生为准)';
```

- 每支疫苗一个 `vkey`，每剂一行。seed 数据按 PRD-005 附录 A 展开（一类 8 支 + 常见二类 5 支，各剂次 month_min/rec/max），seed 需**医学复核**（风险见 §8）。
- 前端"疫苗名称联想"读本表；进度计算见 §3.4。

### 2.3 新表 baby_vaccine_setting（宝宝级偏好）

```sql
CREATE TABLE `baby_vaccine_setting` (
  `id`           CHAR(36) NOT NULL,
  `baby_id`      CHAR(36) NOT NULL,
  `vaccine_key`  VARCHAR(40) NOT NULL COMMENT '参考库 vkey（自定义疫苗不落此表）',
  `track_flag`   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=参与疫苗本进度/提醒 0=隐藏不跟踪',
  `replaced_flag` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=已由联合疫苗替代(手动标记)',
  `replaced_note` VARCHAR(100) NULL,
  `updated_by`   CHAR(36) NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_baby_vaccine` (`baby_id`, `vaccine_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='疫苗本宝宝级跟踪偏好';
```

### 2.4 record_timeline 加列 + backfill

```sql
ALTER TABLE `record_timeline`
  ADD COLUMN `medical_visit_type` VARCHAR(20) NULL COMMENT '冗余 medical 子类型, 仅 source_type=medical 填充',
  ADD KEY `idx_timeline_baby_medtype` (`baby_id`, `source_type`, `medical_visit_type`, `event_time`, `timeline_id`);
```

- 写侧：`timeline.service.loadMedicalPayload` 返回 payload 增加 `medicalVisitType`，`upsertFromSource` 的 INSERT/UPDATE 列表补该列。
- 回填：新增幂等脚本 `minicare-server/scripts/backfill-medical-visit-type.mjs`（风格对齐 backfill-duration-summary.mjs）：`UPDATE record_timeline rt JOIN medical_record m ON rt.source_id=m.id AND rt.source_type='medical' SET rt.medical_visit_type=m.visit_type`，并以"源表行是否已 join 上"判定残留孤儿行告警。dev/prod 各跑一次。

## 3. 后端设计

### 3.1 DTO 扩展（`src/records/medical/dto/create-medical.dto.ts`）

`CreateMedicalDto` / `UpdateMedicalDto` 增加（全部 @IsOptional）：

- 通用新字段：`vaccine_name?` `vaccine_schedule_key?` `vaccine_dose_seq?(@IsInt,min1,max20)` `vaccine_site?(@IsIn枚举)` `vaccine_batch?` `vaccine_reactions?(@IsArray @IsString({each:true}))` `vaccine_reaction_note?`
- `checkup_height_mm?(@IsInt 100-1600)` `checkup_weight_g?(@IsInt 1000-60000)` `checkup_head_mm?(@IsInt 200-700)` `checkup_milestones?(ValidateNested, MilestoneItemDto[])` `checkup_assessment?` `checkup_qa?(ValidateNested, QaItemDto[])` `checkup_growth_sync?(@IsIn(['none','synced','overwritten','skipped']))`
- `sick_complaint?` `sick_symptom_flags?(@IsArray @IsString({each:true}))`
- 就诊开药一次性参数：`sync_meds_to_stock?(@IsBoolean)`（true 时 service 将本次 medications 逐条 ensureByName 进药箱）
- medications item 扩展：`MedicationItemDto` 增加可选 `days?`（服药天数，仅展示）
- 新增枚举常量：`VaccineReaction`（none/fever/local_redness/induration/rash/sleepy_irritable/other）、`CheckupMilestoneDim`（gross/fine/language/cognitive/social）、`MilestoneStatus`（ok/watch/na）、`VaccineSite`（left_arm/right_arm/thigh/oral/other/unknown）→ 放 dto 同文件导出，前后端常量统一见 §4.4。

> 破坏性说明：现有 Create/Update 字段不动，纯增量 → 老调用方（语音/Web 存量）不回归。

### 3.2 MedicalService 改造（`medical.service.ts`）

- `create/update`：INSERT/UPDATE 语句列清单追加新列（手写 SQL 风格保持）；成功后照旧 `timelineService.upsertFromSource('medical', id)`（内部将自动带 medical_visit_type）。
- 新增私有 `syncGrowthIfMeasured(userId, dto, medicalId)`：当任一 checkup 测量值非空且 `checkup_growth_sync !== 'skipped'`：
  1. 查当日 growth 是否存在（baby_id+visit_date）；
  2. 调 `growthService.create`（同日覆盖）；
  3. UPDATE medical_record 回填 `checkup_growth_sync = existed ? 'overwritten' : 'synced'`。
  异常降级：growth 写失败记日志并继续保存 medical（`checkup_growth_sync='none'`），不阻断主流程（与 timeline best_effort 一致）。
- 新增 `syncMedsToStock(familyId,babyId,userId,medications)`：见 1.5，异常时跳过失败条目并日志，不阻断。
- `findAll` 保持 7 天窗口语义不动；新增档案式列表方法（见 3.3 archive）。

### 3.3 新端点（挂 `MedicalController`，注意路由顺序）

> ⚠️ **路由顺序陷阱**：`@Get(':id')`/`@Patch(':id')` 之前的静态路由（含本表全部新端点）**必须声明在其前面**（现有 `next-follow-up` 已示范）。全部新端点声明在 `:id` 之上。

| 方法 | 路径 | 说明 | 优先级 |
|---|---|---|---|
| GET | `…/medical/archive?baby_id&visit_type&before_date` | 全量 keyset 分页（按 visit_date/created desc），非 7 天窗口；供儿保档案/就诊历史/疫苗历史/记录流 | P0 |
| GET | `…/medical/vaccine/schedule` | 下发参考程序库全量（含 category/剂次/月龄），前端联想与疫苗本渲染 | P0 |
| GET | `…/medical/vaccine/book?baby_id` | 疫苗本：逐疫苗剂次状态机结果 + overview + next（下一针提醒，见 3.4）；含宝宝 setting 合并 | P0 |
| PATCH | `…/medical/vaccine/settings` | 宝宝疫苗偏好 upsert：{baby_id, vaccine_key, track_flag?, replaced_flag?, replaced_note?} | P0 |
| GET | `…/medical/next-follow-up`（已有） | 不动 | — |

复用 `POST/PATCH /records/medical` 承载疫苗/儿保记录写入（含回填历史针次：dose_seq 传历史值即可）；删除/编辑走既有 `:id` 端点，编辑锁定 visit_type（前端约束 + 后端 DTO 允许但 service 校验：update 时 visit_type 变化仅限 deprecated 归一场景，其余拒绝，见 3.5）。

### 3.4 疫苗本引擎（新增 `src/records/medical/vaccine-book.service.ts`）

入参 baby 出生日期 + 全部 medical(vaccine) 记录 + settings + schedule。输出结构：

```
{
  overview: { doneDoses, totalTracked, todoDoses, overdueDoses },
  next: [ {vkey,name,doseSeq,doseLabel,reason:'overdue'|'window'|'near',monthRec} ],  // 取逾期优先→窗口内→近1月，最多1条为主推+可含2条备选
  vaccines: [ {vkey,name,category,trackFlag,replacedFlag,doses:[{doseSeq,doseLabel,monthRec,
              status:'done'|'pending'|'overdue'|'upcoming'|'hidden', date?, recordId?}]} ]
}
```

- 月龄：按出生日期到"今天"取整月（service 统一实现 `monthsBetween`，与前端一致口径）。
- 状态判定（对齐 PRD 状态机）：`done`=有同 vkey 同 dose_seq 记录；`hidden`=track_flag=0 或 replaced_flag=1；`overdue`=month_max 非空且已过 month_max（或 month_max 为空但当前月龄 > month_rec+6 的宽限）；`pending`=month_min<=月龄<=窗口且未种；`upcoming`=未到 month_min。
- `next` 排序：overdue（按 month_max 升序）→ pending（按 month_rec 升序）→ near（month_rec-1≤月龄<month_rec）。
- 疫苗名匹配口径：`vaccine_schedule_key` 匹配优先；自定义疫苗（key NULL）按 name 聚合为"自定义"区（计入 doneDoses 但不进进度）。
- 建议封装纯函数 + 单元测试（schedule/记录组合 → 状态），接种程序调整只动 seed。

### 3.5 老数据兼容

- deprecated visit_type（blood/allergy）与缺失：保持现状（展示层归 other；编辑时前端归一 other，后端 update 校验见下）。
- 后端 update 增加规则：`visit_type` 变更仅在「old∈{blood,allergy} 且 new=other」时放行，其余变更返回 400（前端已锁 UI，此为纵深防御）。
- 老 vaccine 记录无 vaccine_name（补全引导判定）：archive/详情返回 `needsCompletion=true`（vaccine_name 为空且 visit_type=vaccine），前端展示"补全为疫苗记录"入口（进编辑表单补 name/dose_seq）。

### 3.6 feed 子类型过滤（列表/聚合页用）

- `feed.service`：buildBaseQuery/queryTimelineRows 系列增加可选参数 `subtype`——当 `type==='medical' && subtype` 时追加 `AND rt.medical_visit_type = ?`（含 subtype='unknown' 语义=IS NULL 的老数据）。DTO 在 feed.controller Query 增加 `subtype?`。
- `timeline.service.loadMedicalPayload`：读取新列并产出 `medicalVisitType`；summary_title 升级为子类型名（疫苗/儿保/就诊/其他检查——改用现有 VISIT_TYPE_LABELS 同源文案），summary_tags 注入疫苗名（如有），detail_json 增加 `{visit_type, vaccine_name?}`（列表徽标 + 编辑分流用）。

## 4. 前端设计（minicare-mp）

### 4.1 路由与分包（`src/app.config.ts`）

`pages/records/medical` 分包 pages 由 `['index']` 扩展为：

```ts
{ root: 'pages/records/medical', pages: [
    'index',                        // 医疗表单页（?type=vaccine|checkup|sick|other 分型渲染，编辑态锁定）
    'type-select/index',            // US-01 类型选择页（记录主入口）
    'hub/index',                    // US-08 医疗档案聚合页（查看入口）
    'vaccine-book/index',           // US-03 疫苗本
    'checkup-archive/index',        // US-05 儿保档案
] }
```

对应目录：`src/pages/records/medical/{type-select,hub,vaccine-book,checkup-archive}/index.{tsx,config.ts,scss}`（health 分包 `temperature/index` 已有先例）。

### 4.2 导航落地（对齐 PRD 决策 D1）

- `lib/constants.ts`：`HOME_RECORD_ROUTES.medical` → `/pages/records/medical/type-select/index`；`HOME_RECORD_MP_ROUTES['/records/form/medical']` → 同 type-select（列表页"＋"与 FAB 的 medical 入口直达类型选择页，**不再直达表单**）。
- 新增档案入口：记录列表页筛选（"医疗/健康/用药"扩展后）→ hub；hub 内各卡片 → 对应档案/疫苗本；hub / 空态引导 / 列表旧直达路径（records/list 编辑用 medical/index 仅编辑态保留）的语义核对照 PRD US-01/US-08。
- 表单页：`useRecordInit` 前读 `router.params.type`；新增模式 `?type=`；编辑态由记录 visit_type 决定分区且隐藏类型切换（US-01 锁定规则）。类型切换（新建态）需二次确认"切换将清空该类型已填内容"。
- 编辑分流：记录列表行点击 → 详情/编辑目标依 `detail_json.visit_type`（medical 行）路由到 medical/index 对应分区（编辑态）；定位现有分流函数（README: records/list 组件内联逻辑）扩展分支，Web 端分流不动（Web 维护模式）。

### 4.3 页面与组件拆分

表单页沿用"外壳 + 类型分区组件"模式（feeding 的 BreastSection/FormulaSection… 先例）：

```
src/pages/records/medical/
  index.tsx                  # 外壳：日期/机构/医生/照片/随访(共享) + type 分区渲染 + 提交归一
  VaccineSection.tsx         # 疫苗名联想(接口 schedule)+剂次联动+部位+批号+反应多选
  CheckupMeasureSection.tsx  # 三测量(同步提示文案)+发育5维三态+医生评估文本
  CheckupQaSection.tsx       # QA 动态多条（待补答复状态）
  SickSection.tsx            # 主诉标签+描述+开药列表(药箱联想)+同步药箱勾选
  VisitTypeSection.tsx       # 保留（新建态切换；编辑态隐藏）
type-select/index.tsx        # 4 类型路由卡片（PRD US-01 线框）
hub/index.tsx                # 聚合页：提醒条+疫苗本/儿保档案卡片+记录流（US-08 线框）
vaccine-book/index.tsx       # 进度环+下一针卡+月龄分档+类别过滤+折叠+跟踪开关/替代标记
checkup-archive/index.tsx    # 历次儿保摘要卡→只读详情/编辑（US-05 线框）
```

- 疫苗本折叠：>当前月龄 2 档以后的远期剂次默认折叠（D2）；"展开全部"。
- 儿保档案条目：服务端 archive 返回完整结构（含里程碑/QA/测量），卡片渲染即用。

### 4.4 API 层与常量

- `src/api/medical.ts`：类型声明扩展（VaccineRecordFields/CheckupRecordFields…）；新增 `archiveVaccineBook/schedule/vaccineSettings` 方法；`getOne` 返回类型化字段。
- `src/lib/constants.ts`：`VISIT_TYPE_LABELS` 已有；新增 `VACCINE_REACTION_LABELS / CHECKUP_MILESTONE_DIMS / MILESTONE_STATUS_LABELS / VACCINE_SITE_LABELS / CHECKUP_GROWTH_SYNC_LABELS`，与后端枚举键一一对应（前后端单一文案源：后端枚举码 ↔ 前端 label 表，禁止两端各写中文）。

### 4.5 语音适配（US-10 关联 PRD-001）

- `voicePrefill.ts` 无需改结构；语音识别产出字段扩展为 `voice_type=vaccine/checkup/…` + 类型字段（`voice_vaccine_name` `voice_checkup_height_mm` 等），表单初始化把 voice_* 映射到对应 state（在表单外壳统一做一次字段名映射表）。
- 识别不出类型 → 跳 type-select（带已识别通用字段 voice_date/hospital 等透传）。
- 语音解析侧（PRD-001 识别层，实现时定位 voice 模块意图 schema）按新字段清单扩展；字段缺失=现有"待补齐"交互，不新增链路。

## 5. 开发计划与进度跟踪

> 状态图例：⬜ 未开始 ｜ 🔄 进行中 ｜ ⛔ 阻塞 ｜ ✅ 已完成（同一天内勾选并在此标注日期）。
> 人日为**净开发口径**（不含评审/等待/缓冲）；单人全栈推进，最终排期以实际可用时间折算。
> 更新约定：每个任务开工/完成时同步更新本节 + 当日工作日志（`.workbuddy/memory/YYYY-MM-DD.md`）；提交信息带 `PD-P0-xx` 编号便于追溯。

### 5.1 里程碑节奏

| 里程碑 | 内容 | 退出标准（可验收物） |
|---|---|---|
| M0 准备（并行） | 疫苗程序 seed 医学复核（020 内数据） | seed 校对完成并记录校对人与日期 |
| M1 后端底座 | PD-P0-01/02/03/04 | migration 020 幂等执行 + backfill 后物化列一致；archive/book/schedule 接口可用；book 单测通过 |
| M2 前端类型化 | PD-P0-05/06 | type-select 可直达分型表单；编辑锁定/老数据兜底不 404；语音疫苗语料可预填 |
| M3 疫苗闭环 | PD-P0-07 | 疫苗本页（进度/下一针/跟踪开关/替代标记）端到端可用 |
| M4 儿保闭环 | PD-P0-08 | 儿保档案页 + 测量同步 growth（含同日冲突覆盖）端到端可用 |
| M5 P0 回归发布 | PD-P0-09 | §9 技术验收清单全绿；P0 发版（server migration+部署 / MP 提审） |
| P1 阶段 | PD-P1-10/11/12 | 就诊开药同步药箱、hub 聚合页、列表细分 chips 上线 |
| P2 阶段 | 预留（见 5.2 尾表） | 出现真实需求再排期 |

### 5.2 P0 任务分解（本期：类型化基础 + 疫苗 + 儿保 + 兼容）

| ID | 任务 | 依赖 | 净人日 | 关键文件 / 产出 | 状态 |
|---|---|---|---|---|---|
| PD-P0-01 | Migration 020：扩展列+`vaccine_schedule`(含 seed)+`baby_vaccine_setting`+timeline 列 | M0（seed 复核） | 1.0 | `migrations/020_medical_typed_records.sql`；dev 库幂等执行 + schema_migrations 登记 | ✅ 09-07 |
| PD-P0-02 | 后端 DTO/枚举扩展 + service create/update 新列 + 类型校验 | PD-P0-01 | 1.5 | `dto/create-medical.dto.ts`、`medical.service.ts`（含 syncGrowth/校验规则） | ✅ 09-07 |
| PD-P0-03 | archive + vaccine schedule/book/settings 端点 + 疫苗本引擎（纯函数+单测） | PD-P0-01 | 1.5 | `vaccine-book.service.ts`(新)、`medical.controller.ts`(新端点置于 `:id` 前)、单测（done/pending/overdue/upcoming/hidden/next） | ✅ 09-07 |
| PD-P0-04 | timeline 写侧 medical_visit_type + feed subtype 过滤 + backfill | PD-P0-01 | 1.0 | `timeline.service.ts`、`feed.service.ts`、`scripts/backfill-medical-visit-type.mjs`(新)；dev 已跑、prod 待部署后跑 | ✅ 09-07 |
| PD-P0-05 | 前端 API/常量/路由 + type-select 页 | PD-P0-03 | 1.0 | `api/medical.ts`、`constants.ts`、`navigation.ts`、`app.config.ts`、`records/medical/type-select/*` | ⬜ |
| PD-P0-06 | 表单分型渲染（Sections 组件）+ 编辑锁定/分流 + 语音 voice_* 透传 | PD-P0-02,05 | 2.0 | `records/medical/index.tsx` 重构 + `VaccineSection/Checkup*Section` 等（新）、voicePrefill 映射 | ⬜ |
| PD-P0-07 | 疫苗本页 + 宝宝设置（跟踪/替代） | PD-P0-03,05 | 1.5 | `records/medical/vaccine-book/*` | ⬜ |
| PD-P0-08 | 儿保档案页（archive 消费/卡片/补录入口） | PD-P0-03,05 | 1.5 | `records/medical/checkup-archive/*` | ⬜ |
| PD-P0-09 | 老数据兼容联调（blood 编辑兜底/疫苗补全引导）+ P0 全量回归 | PD-P0-04..08 | 1.0 | 回归用例；§9 清单全绿 | ⬜ |
| | **P0 小计** | | **≈12.0** | | |

> 验收对齐 PRD AC（完成 PD-P0-09 时逐条核验）：类型路由三场景、疫苗记录四场景（含自定义/重复校验/严重反应提示）、疫苗本四场景（进度/逾期/隐藏/直达）、儿保三场景（完整记录+同日冲突覆盖默认+待补答复）、老数据两场景（blood 编辑兜底不 404、疫苗补全引导出现）。

### 5.3 P1/P2 任务分解（预留）

| ID | 任务 | 依赖 | 净人日 | 关键文件 / 产出 | 状态 |
|---|---|---|---|---|---|
| PD-P1-10 | 就诊增强：开药列表（药箱联想 + `ensureByName`）+ medications.days | P0 | 1.0 | `medication.service.ts`(ensureByName 新)、`SickSection.tsx` | ⬜ |
| PD-P1-11 | other 表单按 US-07 收敛 + hub 聚合页（提醒条/档案卡片/记录流） | P0 | 1.0 | `records/medical/other` 收敛、`records/medical/hub/*` | ⬜ |
| PD-P1-12 | 列表 subtype chips（医疗/疫苗/儿保/就诊/其他）接 feed subtype | PD-P0-04 | 0.5 | `records/list/*`、feed.controller Query | ⬜ |
| PD-P2-13 | 过敏档案（US-09：health_record 归并 + reaction_source 去重） | P1 后 | 1.5~2.0 | `allergy-archive/*`（新） | ⬜ |
| PD-P2-14 | QA/里程碑 JSON → 子表迁移（若发育回顾需求出现）；到期/复查推送 | 视需求 | 另估 | — | ⬜ |
| | P1+P2 小计 | | ≈4.0+ | | |

### 5.4 进度速览

| 范围 | 总任务 | 已完成 | 进行中 | 未开始 | 最近更新 |
|---|---|---|---|---|---|
| P0 | 9 | 4 | 0 | 5 | 2026-09-07（01-04 完成，M1 后端底座闭环） |
| P1/P2 | 5 | 0 | 0 | 5 | 同上 |

> 关键路径：PD-P0-01 → 02/03/04（可并行）→ 05 → 06/07/08（部分并行）→ 09。P0 后端侧（01-04）完成后即可先行部署联调，前端 05-08 不阻塞其后端依赖项继续。
> 风险缓冲：Nest 路由顺序/JSON 校验/backfill 一致性等见 §8；每完成一个里程碑（M1/M3/M4）安排一次本地端到端自测，避免积压到 M5。

## 6. 演进预留（避免返工的关键点）

- `checkup_milestones` 的 `dim` 枚举与附录 B 月龄档参考**固定为稳定键**（gross/fine/language/cognitive/social），后续发育回顾统计按 dim+月龄聚合时无需映射历史数据。
- QA JSON item 结构 `{question,answer}` 简单稳定，迁子表时可按序平铺。
- `vaccine_schedule.vkey` 唯一且不随名称显示文案变化，未来做"记录→程序勾选"回填不会断链；**不建议**用户侧持久化疫苗中文名做主键。
- `medical_visit_type` 物化冗余列与 detail_json.visit_type 并存：detail_json 服务"单行渲染/分流"，物化列服务"SQL 过滤"，backfill 幂等保证一致；新增子类型（未来）只需同步两处映射。

## 7. 与既有模块的依赖

| 模块 | 关系 |
|---|---|
| growth | medical.module imports GrowthModule，调用 create 实现测量同步（D2 默认覆盖即其现有语义） |
| medication | medical.module imports MedicationModule（P1），新增 ensureByName 原子方法 |
| timeline / feed | 写侧扩展 loadMedicalPayload；读侧 subtype 过滤；回填脚本 |
| voice（PRD-001） | 类型化字段清单扩展，读 voice_* 预填（P0 兼容，不改链路） |
| food-observation（PRD-002） | 仅 P2 过敏档案涉及（reaction_source 归并），P0/P1 零接触 |
| Web 端（维护模式） | 不做类型化改造；既有 Web 对 /records/medical 的读写字段兼容（新增列全部可空），不回归 |

## 8. 风险与待办

1. **参考库权威性**：020 seed 的疫苗程序须按《国家免疫规划疫苗儿童免疫程序及说明》现行版本复核（标注校对人与日期）；用户侧一律带"以接种本/医生为准"（PRD 已约束）。
2. **Nest 静态/参数路由顺序**：archive、vaccine/* 必须在 `:id` 之前注册；补测试覆盖 `GET /vaccine/book` 不被 `:id` 吞掉。
3. **growth 覆盖不可逆**：同日覆盖无审计（growth 现状即如此）。PRD 已定默认覆盖；若后续要审计，growth 加 overwrite 日志（P2 候选，不在本期）。
4. **vaccine_reactions / milestone / QA JSON 校验**：服务端 DTO 强校验防脏数据；客户端提交前枚举过滤。
5. **backfill 窗口一致性**：回填期间新写入不受影响（upsert 单行）；脚本幂等可重复跑，dev/prod 各一次。
6. **老 vaccine 文本行补全**：引导覆盖率取决于用户意愿，不做批量迁移（避免臆造疫苗名）。
7. **timeline summary_title 文案变更**：loadMedicalPayload 的 title 改为子类型中文名会改变老列表展示（原先可能是"医疗"或空）——属预期升级，需在列表页徽标渲染时统一（类型徽标配色沿用 PRD §3 规则）。
8. **待定位项（实现时确认）**：records/list 的 medical 行编辑分流函数当前位置；voice 解析 schema 所在模块（PRD-001 实现）；Web 端既有 medical 列表/表单对新增 detail_json 字段的容错（应天然容错）。

## 9. 验收清单（技术层）

- [ ] migration 020 在 dev 库幂等执行；020 登记 schema_migrations
- [ ] backfill 脚本 dev/prod 运行后 `record_timeline.medical_visit_type` 与源表一致（0 残留差异）
- [ ] 疫苗记录/儿保记录/就诊记录 PATCH 后 detail_json 与物化列正确更新（读 feed 验证）
- [ ] vaccine/book 全状态组合单元测试通过（done/pending/overdue/upcoming/hidden/next 排序）
- [ ] 儿保带测量保存 → growth 当日 upsert；同日已有行 → overwritten；skip → 不写 growth
- [ ] 列表/聚合页 medical subtype 过滤跨页正确（keyset 分页不丢行）
- [ ] type-select 直达、表单 ?type= 分型渲染、编辑锁定、老记录兜底/补全引导全部可达
- [ ] 语音「记乙肝第二针」预填 vaccine_name/dose_seq/日期（缺字段可补）
- [ ] P0 回归：既有 7 天窗口 findAll、next-follow-up、Web 端读写、feeding/sleep 等其它类型 feed 无回归
