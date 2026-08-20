-- =============================================================
-- Migration 013: 用药记录模块（F14-medication）
-- 日期: 2026-08-20
-- 说明:
--   1) medication        —— 宝宝级药品清单（常用药库 + 自定义）
--   2) medication_record —— 单次服药打卡记录
--   3) 均遵循软删除原则（deleted_at），历史数据保留
--   4) record_timeline 物化表新增 medication 类型（由服务层写入，
--      本迁移无需处理存量数据）
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- ------------------------------------------------------------
-- 药品清单（宝宝级）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `medication` (
  `id`           CHAR(36)      NOT NULL,
  `baby_id`      CHAR(36)      NOT NULL  COMMENT '关联 baby_profile.id',
  `name`         VARCHAR(50)   NOT NULL  COMMENT '药品名称',
  `default_dose` VARCHAR(50)   NULL      COMMENT '默认剂量（如 5ml / 1袋）',
  `note`         VARCHAR(200)  NULL      COMMENT '备注',
  `created_by`   CHAR(36)      NOT NULL  COMMENT '创建人 user_account.id',
  `created_at`   DATETIME      NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME      NOT NULL  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`   DATETIME      NULL      COMMENT '软删除时间（NULL=正常）',
  PRIMARY KEY (`id`),
  KEY `idx_med_baby` (`baby_id`),
  KEY `idx_med_baby_deleted` (`baby_id`, `deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用药记录-药品清单';

-- ------------------------------------------------------------
-- 服药打卡记录
-- medication_name 冗余快照：清单改名/软删不影响历史展示
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `medication_record` (
  `id`              CHAR(36)     NOT NULL,
  `baby_id`         CHAR(36)     NOT NULL  COMMENT '关联 baby_profile.id',
  `medication_id`   CHAR(36)     NULL      COMMENT '关联 medication.id（清单软删后保留）',
  `medication_name` VARCHAR(50)  NOT NULL  COMMENT '药品名称快照',
  `dose`            VARCHAR(50)  NULL      COMMENT '本次实际剂量（可空=按需）',
  `record_time`     DATETIME     NOT NULL  COMMENT '服药时间（默认当前，可补录）',
  `note`            VARCHAR(200) NULL      COMMENT '备注',
  `recorded_by`     CHAR(36)     NOT NULL  COMMENT '记录人 user_account.id',
  `created_at`      DATETIME     NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME     NOT NULL  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`      DATETIME     NULL      COMMENT '软删除时间（NULL=正常）',
  PRIMARY KEY (`id`),
  KEY `idx_medrec_baby_time` (`baby_id`, `record_time`),
  KEY `idx_medrec_baby_deleted` (`baby_id`, `deleted_at`),
  KEY `idx_medrec_medication` (`medication_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用药记录-服药打卡';

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('013_medication');
