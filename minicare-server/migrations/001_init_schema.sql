-- =============================================================
-- Migration 001: 初始化完整数据库表结构
-- 日期: 2026-03-29
-- 说明: 兼容 MySQL 5.7（本地）和 MySQL 8.0（CloudBase 远程）
--       MySQL 5.7 不支持，UUID 由应用层生成传入
--       本地开发执行: npm run migrate
--       生产环境通过 CloudBase MCP 工具执行（已完成）
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';
SET foreign_key_checks = 0;

-- -------------------------------------------------------------
-- 1. 用户账户表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_account` (
  `id`           CHAR(36)     NOT NULL,
  `phone`        VARCHAR(20)  NOT NULL COMMENT '手机号（唯一）',
  `nickname`     VARCHAR(50)  NULL,
  `avatar_url`   VARCHAR(500) NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`      VARCHAR(256) NULL     COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `phone` (`phone`),
  KEY `idx_user_account_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 2. 家庭组表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_group` (
  `id`          CHAR(36)     NOT NULL,
  `name`        VARCHAR(50)  NOT NULL COMMENT '家庭名称',
  `invite_code` VARCHAR(16)  NOT NULL COMMENT '邀请码',
  `created_by`  CHAR(36)     NOT NULL COMMENT '创建者 user_id',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`     VARCHAR(256) NULL     COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `fk_fg_created_by` (`created_by`),
  CONSTRAINT `fk_fg_created_by` FOREIGN KEY (`created_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 3. 家庭成员表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `family_member` (
  `id`           CHAR(36)    NOT NULL,
  `family_id`    CHAR(36)    NOT NULL,
  `user_id`      CHAR(36)    NULL     COMMENT '已注册用户 id（待接受邀请时为 NULL）',
  `role`         TINYINT     NOT NULL DEFAULT 2 COMMENT '1=owner 2=member',
  `invite_phone` VARCHAR(20) NULL     COMMENT '被邀请手机号',
  `status`       TINYINT     NOT NULL DEFAULT 1 COMMENT '1=pending 2=active 3=left',
  `invited_by`   CHAR(36)    NULL,
  `joined_at`    DATETIME    NULL,
  `created_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`      VARCHAR(256) NULL    COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family_user` (`family_id`, `user_id`),
  KEY `idx_family_member_family` (`family_id`),
  KEY `idx_family_member_user` (`user_id`),
  KEY `idx_family_member_invite` (`invite_phone`),
  KEY `fk_fm_inviter` (`invited_by`),
  CONSTRAINT `fk_fm_family` FOREIGN KEY (`family_id`) REFERENCES `family_group` (`id`),
  CONSTRAINT `fk_fm_user` FOREIGN KEY (`user_id`) REFERENCES `user_account` (`id`),
  CONSTRAINT `fk_fm_inviter` FOREIGN KEY (`invited_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 4. 宝宝档案表（MVP: 每个家庭限 1 个宝宝，family_id 唯一索引）
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `baby_profile` (
  `id`          CHAR(36)     NOT NULL,
  `family_id`   CHAR(36)     NOT NULL,
  `name`        VARCHAR(50)  NOT NULL,
  `gender`      TINYINT      NULL     COMMENT '0=unknown 1=male 2=female',
  `birth_date`  DATE         NOT NULL,
  `avatar_url`  VARCHAR(500) NULL,
  `created_by`  CHAR(36)     NOT NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`     VARCHAR(256) NULL     COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_baby_profile_family_single` (`family_id`),
  KEY `fk_bp_creator` (`created_by`),
  CONSTRAINT `fk_bp_family` FOREIGN KEY (`family_id`) REFERENCES `family_group` (`id`),
  CONSTRAINT `fk_bp_creator` FOREIGN KEY (`created_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 5. 喂养记录表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `feeding_record` (
  `id`                CHAR(36)     NOT NULL,
  `baby_id`           CHAR(36)     NOT NULL,
  `recorded_by`       CHAR(36)     NOT NULL,
  `record_time`       DATETIME     NOT NULL,
  `feed_type`         TINYINT      NOT NULL COMMENT '1=breast 2=formula 3=complementary',
  `breast_side`       TINYINT      NULL     COMMENT '1=left 2=right 3=both',
  `duration_min`      SMALLINT     NULL,
  `formula_ml`        SMALLINT     NULL,
  `complementary_food` VARCHAR(100) NULL,
  `amount_g`          SMALLINT     NULL,
  `note`              TEXT         NULL,
  `created_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`           VARCHAR(256) NULL     COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_feeding_baby_time` (`baby_id`, `record_time`),
  KEY `idx_feeding_recorded_by` (`recorded_by`),
  KEY `idx_feeding_new_food` (`baby_id`, `complementary_food`),
  CONSTRAINT `fk_fr_baby` FOREIGN KEY (`baby_id`) REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_fr_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 6. 睡眠记录表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sleep_record` (
  `id`          CHAR(36)     NOT NULL,
  `baby_id`     CHAR(36)     NOT NULL,
  `recorded_by` CHAR(36)     NOT NULL,
  `start_time`  DATETIME     NOT NULL,
  `end_time`    DATETIME     NULL     COMMENT 'NULL 表示仍在进行中',
  `duration_min` SMALLINT    NULL     COMMENT '计算值，单位分钟',
  `status`      TINYINT      NOT NULL DEFAULT 1 COMMENT '1=ongoing 2=ended',
  `note`        TEXT         NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`     VARCHAR(256) NULL     COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_sleep_baby_time` (`baby_id`, `start_time`),
  KEY `idx_sleep_status` (`baby_id`, `status`),
  KEY `fk_slr_recorder` (`recorded_by`),
  CONSTRAINT `fk_slr_baby` FOREIGN KEY (`baby_id`) REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_slr_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 7. 尿布记录表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `diaper_record` (
  `id`          CHAR(36)     NOT NULL,
  `baby_id`     CHAR(36)     NOT NULL,
  `recorded_by` CHAR(36)     NOT NULL,
  `record_time` DATETIME     NOT NULL,
  `diaper_type` TINYINT      NOT NULL COMMENT '1=wet 2=dirty 3=mixed 4=dry',
  `color`       VARCHAR(20)  NULL,
  `note`        TEXT         NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`     VARCHAR(256) NULL     COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_diaper_baby_time` (`baby_id`, `record_time`),
  KEY `fk_dr_recorder` (`recorded_by`),
  CONSTRAINT `fk_dr_baby` FOREIGN KEY (`baby_id`) REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_dr_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 8. 健康记录表（体温、情绪）
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `health_record` (
  `id`           CHAR(36)     NOT NULL,
  `baby_id`      CHAR(36)     NOT NULL,
  `recorded_by`  CHAR(36)     NOT NULL,
  `record_time`  DATETIME     NOT NULL,
  `temperature`  DECIMAL(4,1) NULL     COMMENT '体温，摄氏度',
  `mood`         TINYINT      NULL     COMMENT '1=happy 2=neutral 3=fussy 4=crying',
  `note`         TEXT         NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`      VARCHAR(256) NULL     COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_health_baby_time` (`baby_id`, `record_time`),
  KEY `fk_hr_recorder` (`recorded_by`),
  CONSTRAINT `fk_hr_baby` FOREIGN KEY (`baby_id`) REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_hr_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 9. 症状记录表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `symptom_record` (
  `id`           CHAR(36)     NOT NULL,
  `baby_id`      CHAR(36)     NOT NULL,
  `recorded_by`  CHAR(36)     NOT NULL,
  `record_time`  DATETIME     NOT NULL,
  `symptoms`     JSON         NOT NULL COMMENT '症状列表 [{"type":1,"severity":2}]',
  `photo_ids`    JSON         NULL     COMMENT '照片 fileID 列表',
  `note`         TEXT         NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`      VARCHAR(256) NULL     COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_symptom_baby_time` (`baby_id`, `record_time`),
  KEY `fk_sr_recorder` (`recorded_by`),
  CONSTRAINT `fk_sr_baby` FOREIGN KEY (`baby_id`) REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_sr_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 10. 活动记录表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_record` (
  `id`            CHAR(36)     NOT NULL,
  `baby_id`       CHAR(36)     NOT NULL,
  `recorded_by`   CHAR(36)     NOT NULL,
  `record_time`   DATETIME     NOT NULL,
  `activity_type` TINYINT      NOT NULL COMMENT '1=bath 2=outdoor 3=play 4=tummy_time 5=other',
  `duration_min`  SMALLINT     NULL,
  `note`          TEXT         NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`       VARCHAR(256) NULL     COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_activity_baby_time` (`baby_id`, `record_time`),
  KEY `fk_ar_recorder` (`recorded_by`),
  CONSTRAINT `fk_ar_baby` FOREIGN KEY (`baby_id`) REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_ar_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 11. 生长记录表（体重/身高/头围，每日唯一）
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `growth_record` (
  `id`          CHAR(36)      NOT NULL,
  `baby_id`     CHAR(36)      NOT NULL,
  `recorded_by` CHAR(36)      NOT NULL,
  `record_date` DATE          NOT NULL,
  `weight_g`    INT           NULL     COMMENT '体重，克',
  `height_mm`   INT           NULL     COMMENT '身高，毫米',
  `head_mm`     INT           NULL     COMMENT '头围，毫米',
  `note`        TEXT          NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`     VARCHAR(256)  NULL     COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_growth_baby_date` (`baby_id`, `record_date`),
  KEY `idx_growth_baby_date` (`baby_id`, `record_date`),
  KEY `fk_gr_recorder` (`recorded_by`),
  CONSTRAINT `fk_gr_baby` FOREIGN KEY (`baby_id`) REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_gr_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 12. 病历记录表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `medical_record` (
  `id`          CHAR(36)     NOT NULL,
  `baby_id`     CHAR(36)     NOT NULL,
  `recorded_by` CHAR(36)     NOT NULL,
  `visit_date`  DATE         NOT NULL,
  `hospital`    VARCHAR(100) NULL,
  `diagnosis`   TEXT         NULL,
  `medications` JSON         NULL     COMMENT '用药列表 [{"name":"xx","dose":"xx"}]',
  `photo_ids`   JSON         NULL     COMMENT '照片 fileID 列表',
  `note`        TEXT         NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`     VARCHAR(256) NULL     COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_medical_baby_date` (`baby_id`, `visit_date`),
  KEY `fk_mr_recorder` (`recorded_by`),
  CONSTRAINT `fk_mr_baby` FOREIGN KEY (`baby_id`) REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_mr_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 13. 辅食观察表（新食物追踪）
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `food_observation` (
  `id`             CHAR(36)     NOT NULL,
  `baby_id`        CHAR(36)     NOT NULL,
  `food_name`      VARCHAR(100) NOT NULL,
  `first_intro_at` DATE         NOT NULL,
  `status`         TINYINT      NOT NULL DEFAULT 1 COMMENT '1=observing 2=safe 3=allergic',
  `reaction_note`  TEXT         NULL,
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`        VARCHAR(256) NULL     COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_food_obs_baby_food` (`baby_id`, `food_name`),
  KEY `idx_food_obs_baby` (`baby_id`),
  KEY `idx_food_obs_baby_status` (`baby_id`, `status`),
  CONSTRAINT `fk_fo_baby` FOREIGN KEY (`baby_id`) REFERENCES `baby_profile` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 迁移版本追踪表（本地和生产均需建此表）
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `version`    VARCHAR(50)  NOT NULL COMMENT '迁移文件名，如 001_init_schema',
  `applied_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('001_init_schema');

SET foreign_key_checks = 1;
