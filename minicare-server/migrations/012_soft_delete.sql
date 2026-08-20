-- =============================================================
-- Migration 012: 软删除支持（baby_profile / family_group）
-- 日期: 2026-08-20
-- 说明:
--   1) 全项目删除操作改为软删除，保留历史数据，避免误删导致数据丢失
--   2) baby_profile 增加 deleted_at（删除宝宝档案 = 标记时间，记录数据全部保留）
--   3) family_group 增加 deleted_at（解散家庭 = 标记时间 + 成员标 left + 宝宝标记删除）
--   4) family_member 复用既有 status='left' 软删除模式，无需新增字段
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

ALTER TABLE `baby_profile`
  ADD COLUMN `deleted_at` DATETIME NULL
  COMMENT '软删除时间（NULL=正常）' AFTER `updated_at`;

ALTER TABLE `family_group`
  ADD COLUMN `deleted_at` DATETIME NULL
  COMMENT '软删除时间（NULL=正常）' AFTER `updated_at`;

-- 查询性能：软删后按 deleted_at 过滤
CREATE INDEX `idx_baby_deleted` ON `baby_profile` (`deleted_at`);
CREATE INDEX `idx_family_deleted` ON `family_group` (`deleted_at`);

-- ⚠️ 软删除前置：移除 baby_profile 的「每家庭单宝宝」唯一键
-- （001 时代遗留。008 起已支持多宝宝；若保留，软删后同家庭将无法再创建宝宝）
-- 该唯一键被外键 fk_bp_family 复用为索引，需先删外键 → 删唯一键 → 重建普通索引 + 外键
ALTER TABLE `baby_profile` DROP FOREIGN KEY `fk_bp_family`;
ALTER TABLE `baby_profile` DROP INDEX `idx_baby_profile_family_single`;
ALTER TABLE `baby_profile` ADD KEY `idx_baby_family` (`family_id`);
ALTER TABLE `baby_profile` ADD CONSTRAINT `fk_bp_family`
  FOREIGN KEY (`family_id`) REFERENCES `family_group` (`id`);

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('012_soft_delete');
