-- 022_schedule_template.sql
-- 宝宝每日作息计划模板（PRD-009 期一 US-01 / US-02 / US-05）
--
-- 设计要点（PRD-009 §3 决策 D3）：
--   ① **只存模板，不存"每日日程"**。今日各项状态由「模板项 × 当日记录」实时派生，
--      不落库 —— 否则会出现"记录已写但日程没打勾"的双写不一致。
--   ② 时间用 TIME 而非 DATETIME：日程是"每天重复的时刻"，不是某一天的绝对时间。
--   ③ 判定窗口（提前 60 / 宽限 90 分钟）**不存在表里**，由应用层常量推导；
--      同类项"窗口不重叠"（间隔 ≥150 分钟）是应用层校验，SQL 无法表达。
--   ④ 不建唯一索引：允许两条同名项（如两顿"户外活动"），时间不同即可。
--
-- 判定依据映射（见 PRD-009 US-05）：
--   feeding_food      → feeding_food_record      （排除"营养素"）
--   feeding_formula   → feeding_formula_record
--   activity_outdoor  → activity_record.activity_type = 'outdoor'
--   activity_bath     → activity_record.activity_type = 'bath'（US-06 新增枚举，无需迁移）
--   other             → 不判定，不计入进度分母
--
-- 前置：019=speaker_device，020=medical_typed_records，021=knowledge_retrieval_status，本迁移为 022

CREATE TABLE IF NOT EXISTS `schedule_template_item` (
  `id`                 CHAR(36)   NOT NULL,
  `baby_id`            CHAR(36)   NOT NULL COMMENT '所属宝宝（多孩子家庭按 baby 隔离）',
  `item_type`          VARCHAR(24) NOT NULL
      COMMENT 'feeding_food=辅食 / feeding_formula=奶粉 / activity_outdoor=外出活动 / activity_bath=洗澡 / other=其他（不判定）',
  `title`              VARCHAR(50)  NULL COMMENT '用户可见名称；为空时由 item_type 推导默认名',
  `execute_time`       TIME         NOT NULL COMMENT '计划执行时间（每日重复）',
  `prepare_time`       TIME         NULL COMMENT '准备节点时间；NULL 表示无准备节点',
  `prepare_offset_min` SMALLINT UNSIGNED NULL
      COMMENT '准备提前量（分钟）；仅用于 UI 联动推导，判定不依赖此列',
  `enabled`            TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0=停用：不参与展示、判定与进度分母',
  `note`               VARCHAR(200) NULL,
  `created_at`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`         DATETIME     NULL COMMENT '软删除（约定见 migration 012）',
  PRIMARY KEY (`id`),
  KEY `idx_sched_baby_time` (`baby_id`, `execute_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='宝宝每日作息计划模板项';

-- schema_migrations 登记（migrate.sh 兜底）
INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('022_schedule_template');
