-- =============================================================
-- Migration 020: medical_record 类型化扩展（疫苗/儿保/就诊分型）+ 疫苗参考库 + timeline 子类型列
-- 日期: 2026-09-07
-- 关联: PRD-005 / TECH-011
-- 说明:
--   1) medical_record 增加类型化扩展列（显式列承载需查询/计算的字段，JSON 承载列表型字段），
--      非本类型对应列允许为空，旧数据与跨类型编辑安全；类型专属校验放 DTO 层。
--   2) 新建 vaccine_schedule（只读参考库, seed 数据在文件内）+ baby_vaccine_setting（宝宝级跟踪偏好）。
--   3) record_timeline 增加 medical_visit_type 物化冗余列（feed 子类型 SQL 过滤用）+ 索引。
--   4) 幂等处理由 migrate.sh 按 schema_migrations 去重控制；文件尾部 INSERT IGNORE 兜底登记。
--
-- ⚠️ REVIEW-PENDING（M0 医学复核项）:
--   vaccine_schedule seed 数据基于《国家免疫规划疫苗儿童免疫程序及说明》(2021年版参考)
--   与常见二类疫苗说明书整理，month_min/month_rec/month_max 为"产品内参考窗口"(整月近似)，
--   非权威依据；上线前须由医学背景复核并按最新免疫程序修订，用户侧一律呈现
--   "参考数据，以接种本/医生建议为准"。
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- -------------------------------------------------------------
-- 1. medical_record 类型化扩展列
-- -------------------------------------------------------------
ALTER TABLE `medical_record`
  -- ── 疫苗（visit_type='vaccine'）──
  ADD COLUMN `vaccine_name`         VARCHAR(100) NULL COMMENT '疫苗名称（自定义名或参考库名快照）' AFTER `visit_type`,
  ADD COLUMN `vaccine_schedule_key` VARCHAR(40)  NULL COMMENT '参考库程序键（hepb/dtp/mcv…；自定义疫苗为 NULL）' AFTER `vaccine_name`,
  ADD COLUMN `vaccine_dose_seq`     TINYINT      NULL COMMENT '第几剂（1 起，回填历史针次也用此列）' AFTER `vaccine_schedule_key`,
  ADD COLUMN `vaccine_site`         VARCHAR(20)  NULL COMMENT '接种部位: left_arm/right_arm/thigh/oral/other/unknown' AFTER `vaccine_dose_seq`,
  ADD COLUMN `vaccine_batch`        VARCHAR(50)  NULL COMMENT '疫苗批号（选填）' AFTER `vaccine_site`,
  ADD COLUMN `vaccine_reactions`    JSON         NULL COMMENT '反应枚举数组，如 ["fever","local_redness"]' AFTER `vaccine_batch`,
  ADD COLUMN `vaccine_reaction_note` TEXT        NULL COMMENT '接种反应文字说明' AFTER `vaccine_reactions`,
  -- ── 儿保（visit_type='checkup'）──
  ADD COLUMN `checkup_height_mm`    SMALLINT     NULL COMMENT '身高 mm（与 growth 同单位）' AFTER `vaccine_reaction_note`,
  ADD COLUMN `checkup_weight_g`     INT          NULL COMMENT '体重 g' AFTER `checkup_height_mm`,
  ADD COLUMN `checkup_head_mm`      SMALLINT     NULL COMMENT '头围 mm' AFTER `checkup_weight_g`,
  ADD COLUMN `checkup_milestones`   JSON         NULL COMMENT '[{dim,status,note}] dim∈gross/fine/language/cognitive/social status∈ok/watch/na' AFTER `checkup_head_mm`,
  ADD COLUMN `checkup_assessment`   TEXT         NULL COMMENT '医生综合评估与建议' AFTER `checkup_milestones`,
  ADD COLUMN `checkup_qa`           JSON         NULL COMMENT '[{question,answer}] answer 空=待补答复' AFTER `checkup_assessment`,
  ADD COLUMN `checkup_growth_sync`  VARCHAR(16)  NULL COMMENT 'none/synced/overwritten/skipped' AFTER `checkup_qa`,
  -- ── 就诊（visit_type='sick'）──
  ADD COLUMN `sick_complaint`       TEXT         NULL COMMENT '主诉描述' AFTER `checkup_growth_sync`,
  ADD COLUMN `sick_symptom_flags`   JSON         NULL COMMENT '主诉症状标签枚举数组' AFTER `sick_complaint`;

ALTER TABLE `medical_record`
  ADD KEY `idx_medical_baby_type_date` (`baby_id`, `visit_type`, `visit_date`);

-- -------------------------------------------------------------
-- 2. vaccine_schedule 疫苗参考程序库（只读 seed）
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `vaccine_schedule` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `vkey`        VARCHAR(40)  NOT NULL COMMENT '程序键，如 hepb/polio/dtp（一支疫苗一个 vkey，多剂多行）',
  `name`        VARCHAR(60)  NOT NULL COMMENT '疫苗名（用户可见）',
  `category`    VARCHAR(8)   NOT NULL COMMENT 'free=一类免费 / paid=二类自费',
  `dose_seq`    TINYINT      NOT NULL COMMENT '剂次序号 1 起',
  `dose_label`  VARCHAR(20)  NOT NULL COMMENT '第1剂/第2剂…',
  `month_min`   SMALLINT     NULL COMMENT '可接种最早月龄（参考）',
  `month_rec`   SMALLINT     NOT NULL COMMENT '建议月龄（进度展示/到龄计算用）',
  `month_max`   SMALLINT     NULL COMMENT '建议窗口上限月龄（逾期判定；NULL=无硬上限）',
  `note`        VARCHAR(200) NULL,
  `sort`        INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vkey_dose` (`vkey`, `dose_seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='疫苗参考程序库(只读seed, 以接种本/医生为准)';

-- seed（⚠️ REVIEW-PENDING：窗口为整月近似参考，见文件头说明）
INSERT INTO `vaccine_schedule`
  (`vkey`, `name`, `category`, `dose_seq`, `dose_label`, `month_min`, `month_rec`, `month_max`, `note`, `sort`) VALUES
  -- 一类（免费）
  ('hepb', '乙肝疫苗', 'free', 1, '第1剂', 0, 0, 1, '出生医院首针', 10),
  ('hepb', '乙肝疫苗', 'free', 2, '第2剂', 1, 1, 3, '与第1剂间隔≥1月', 10),
  ('hepb', '乙肝疫苗', 'free', 3, '第3剂', 6, 6, 12, '与第1剂间隔≥6月', 10),
  ('bcg', '卡介苗', 'free', 1, '第1剂', 0, 0, 3, '3月龄内可直接补种，超龄遵医嘱', 20),
  ('polio', '脊灰疫苗', 'free', 1, '第1剂', 2, 2, 4, 'IPV/bOPV 组合以门诊为准', 30),
  ('polio', '脊灰疫苗', 'free', 2, '第2剂', 3, 3, 5, NULL, 30),
  ('polio', '脊灰疫苗', 'free', 3, '第3剂', 4, 4, 6, NULL, 30),
  ('polio', '脊灰疫苗', 'free', 4, '第4剂', 48, 48, NULL, '4 岁加强', 30),
  ('dtp', '百白破疫苗', 'free', 1, '第1剂', 3, 3, 5, NULL, 40),
  ('dtp', '百白破疫苗', 'free', 2, '第2剂', 4, 4, 6, NULL, 40),
  ('dtp', '百白破疫苗', 'free', 3, '第3剂', 5, 5, 7, NULL, 40),
  ('dtp', '百白破疫苗', 'free', 4, '第4剂', 18, 18, NULL, '18 月龄加强', 40),
  ('dt', '白破疫苗', 'free', 1, '第1剂', 72, 72, NULL, '6 岁（与百白破衔接）', 45),
  ('mmr', '麻腮风疫苗', 'free', 1, '第1剂', 8, 8, 12, NULL, 50),
  ('mmr', '麻腮风疫苗', 'free', 2, '第2剂', 18, 18, NULL, NULL, 50),
  ('je_l', '乙脑减毒活疫苗', 'free', 1, '第1剂', 8, 8, NULL, NULL, 60),
  ('je_l', '乙脑减毒活疫苗', 'free', 2, '第2剂', 24, 24, NULL, '2 岁加强', 60),
  ('mena', 'A群流脑疫苗', 'free', 1, '第1剂', 6, 6, 9, NULL, 70),
  ('mena', 'A群流脑疫苗', 'free', 2, '第2剂', 9, 9, 12, NULL, 70),
  ('menac', 'A+C群流脑疫苗', 'free', 1, '第1剂', 36, 36, NULL, '3 岁', 80),
  ('menac', 'A+C群流脑疫苗', 'free', 2, '第2剂', 72, 72, NULL, '6 岁', 80),
  ('hepa_l', '甲肝减毒活疫苗', 'free', 1, '第1剂', 18, 18, NULL, '18 月龄', 90),
  -- 二类（自费参考）
  ('pentavalent', '五联疫苗', 'paid', 1, '第1剂', 2, 2, 5, '替代脊灰/百白破/Hib（不自动换算，手动标记）', 200),
  ('pentavalent', '五联疫苗', 'paid', 2, '第2剂', 3, 3, 6, NULL, 200),
  ('pentavalent', '五联疫苗', 'paid', 3, '第3剂', 4, 4, 7, NULL, 200),
  ('pentavalent', '五联疫苗', 'paid', 4, '第4剂', 18, 18, NULL, NULL, 200),
  ('pcv13', '13价肺炎球菌疫苗', 'paid', 1, '第1剂', 2, 2, 5, '以接种门诊所用厂商程序为准', 210),
  ('pcv13', '13价肺炎球菌疫苗', 'paid', 2, '第2剂', 4, 4, 7, NULL, 210),
  ('pcv13', '13价肺炎球菌疫苗', 'paid', 3, '第3剂', 6, 6, 12, NULL, 210),
  ('pcv13', '13价肺炎球菌疫苗', 'paid', 4, '第4剂', 12, 12, 15, '12-15 月龄加强', 210),
  ('rv', '轮状病毒疫苗', 'paid', 1, '第1剂', 2, 2, 7, '有最早年龄上限，超龄不可接种', 220),
  ('rv', '轮状病毒疫苗', 'paid', 2, '第2剂', 3, 3, 7, '间隔≥4周', 220),
  ('rv', '轮状病毒疫苗', 'paid', 3, '第3剂', 4, 4, 7, NULL, 220),
  ('hib', 'Hib疫苗', 'paid', 1, '第1剂', 2, 2, 5, NULL, 230),
  ('hib', 'Hib疫苗', 'paid', 2, '第2剂', 4, 4, 7, NULL, 230),
  ('hib', 'Hib疫苗', 'paid', 3, '第3剂', 6, 6, 12, NULL, 230),
  ('hib', 'Hib疫苗', 'paid', 4, '第4剂', 18, 18, NULL, NULL, 230),
  ('ev71', 'EV71手足口疫苗', 'paid', 1, '第1剂', 6, 6, NULL, '6 月龄起', 240),
  ('ev71', 'EV71手足口疫苗', 'paid', 2, '第2剂', 7, 7, NULL, '间隔≥1月', 240),
  ('flu', '流感疫苗', 'paid', 1, '第1剂', 6, 6, NULL, '6 月龄起，首年 2 剂', 250),
  ('flu', '流感疫苗', 'paid', 2, '第2剂', 7, 7, NULL, '首年间隔≥1月；此后每年 1 剂', 250);

-- -------------------------------------------------------------
-- 3. baby_vaccine_setting 宝宝级疫苗本偏好
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `baby_vaccine_setting` (
  `id`            CHAR(36)     NOT NULL,
  `baby_id`       CHAR(36)     NOT NULL,
  `vaccine_key`   VARCHAR(40)  NOT NULL COMMENT '参考库 vkey（自定义疫苗不落此表）',
  `track_flag`    TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=参与疫苗本进度/提醒 0=隐藏不跟踪',
  `replaced_flag` TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=已由联合疫苗替代(手动标记)',
  `replaced_note` VARCHAR(100) NULL,
  `updated_by`    CHAR(36)     NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_baby_vaccine` (`baby_id`, `vaccine_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='疫苗本宝宝级跟踪偏好';

-- -------------------------------------------------------------
-- 4. record_timeline 子类型物化列（feed 子类型过滤）
-- -------------------------------------------------------------
ALTER TABLE `record_timeline`
  ADD COLUMN `medical_visit_type` VARCHAR(20) NULL COMMENT '冗余 medical 子类型, 仅 source_type=medical 填充' AFTER `source_id`,
  ADD KEY `idx_timeline_baby_medtype` (`baby_id`, `source_type`, `medical_visit_type`, `event_time`, `timeline_id`);

-- -------------------------------------------------------------
-- 5. schema_migrations 登记（migrate.sh 兜底）
-- -------------------------------------------------------------
INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('020_medical_typed_records');
