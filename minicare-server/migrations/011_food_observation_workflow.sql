-- =============================================================
-- Migration 011: 辅食排敏任务工作流落地
-- 日期: 2026-05-27
-- 说明:
--   1) 扩展 food_observation 任务字段（当前进度、状态变更、复引入日期、严重度）
--   2) 新增 food_observation_log（按天打卡日志）
--   3) 扩展 health_record 关联字段（双向关联排敏任务）
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

ALTER TABLE `food_observation`
  ADD COLUMN `current_day` TINYINT UNSIGNED NULL COMMENT '当前进行到第几天（1..observation_days）' AFTER `status`,
  ADD COLUMN `last_status_changed_at` DATETIME NULL COMMENT '最近状态变更时间' AFTER `current_day`,
  ADD COLUMN `retry_after_date` DATE NULL COMMENT '可复引入日期' AFTER `last_status_changed_at`,
  ADD COLUMN `severity` VARCHAR(20) NULL COMMENT '反应严重程度：none/mild/moderate/severe' AFTER `retry_after_date`;

UPDATE `food_observation`
SET `current_day` = COALESCE(`current_day`, 1),
    `last_status_changed_at` = COALESCE(`last_status_changed_at`, `updated_at`)
WHERE `status` = 'observing';

CREATE TABLE IF NOT EXISTS `food_observation_log` (
  `id` CHAR(36) NOT NULL,
  `observation_id` CHAR(36) NOT NULL COMMENT '关联 food_observation.id',
  `baby_id` CHAR(36) NOT NULL COMMENT '冗余，便于查询',
  `day_index` TINYINT UNSIGNED NOT NULL COMMENT '第几天（1..7）',
  `record_date` DATE NOT NULL COMMENT '打卡日期',
  `intake_amount_g` DECIMAL(6,1) NULL COMMENT '当日摄入克数',
  `reaction_flags` JSON NULL COMMENT '反应标签数组',
  `reaction_level` VARCHAR(20) NULL COMMENT 'none/mild/moderate/severe',
  `note` TEXT NULL COMMENT '补充说明',
  `action` VARCHAR(20) NOT NULL DEFAULT 'continue' COMMENT 'continue/pause/mark_suspected/mark_allergic',
  `health_record_id` CHAR(36) NULL COMMENT '关联 health_record.id',
  `recorded_by` CHAR(36) NOT NULL COMMENT '记录人 user_account.id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_obs_day` (`observation_id`, `day_index`),
  KEY `idx_obs_log_baby_date` (`baby_id`, `record_date`),
  KEY `idx_obs_log_health` (`health_record_id`),
  CONSTRAINT `fk_obs_log_observation`
    FOREIGN KEY (`observation_id`) REFERENCES `food_observation` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='排敏任务逐日打卡日志';

ALTER TABLE `health_record`
  ADD COLUMN `observation_id` CHAR(36) NULL COMMENT '关联 food_observation.id' AFTER `recorded_by`,
  ADD COLUMN `food_name_snapshot` VARCHAR(100) NULL COMMENT '触发时食物名称快照' AFTER `observation_id`,
  ADD COLUMN `reaction_source` VARCHAR(20) NULL COMMENT 'observation/manual' AFTER `food_name_snapshot`;

CREATE INDEX `idx_food_obs_baby_status_updated` ON `food_observation` (`baby_id`, `status`, `updated_at`);
CREATE INDEX `idx_food_obs_baby_day` ON `food_observation` (`baby_id`, `current_day`);
CREATE INDEX `idx_health_obs` ON `health_record` (`observation_id`, `record_time`);
