-- =============================================================
-- Migration 025: 用药增强（F14）——「多药同服」批次 + 药品照片
-- 日期: 2026-10-12
-- 说明:
--   1) medication_record 新增 `batch_id`：同一次服药的多条记录共享同一 UUID，
--      前端按批聚合展示为「一条服药事件」（时间线/记录列表合并条目）。
--      NULL = 历史单药记录 → 展示层按单条处理，**存量数据天然兼容、无需回填**。
--   2) medication 新增 `photo_id`：药品照片 fileID（拍药盒留档，家里老人靠图区分药品）。
--   3) 纯加列 + 加索引，无数据变更 → 对存量数据与运行中的服务均无破坏性影响。
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- ------------------------------------------------------------
-- 药品清单：照片
-- ------------------------------------------------------------
ALTER TABLE `medication`
  ADD COLUMN `photo_id` VARCHAR(512) NULL COMMENT '药品照片 fileID（拍药盒；NULL=未拍照）' AFTER `default_dose`;

-- ------------------------------------------------------------
-- 服药打卡：多药批次
-- ------------------------------------------------------------
ALTER TABLE `medication_record`
  ADD COLUMN `batch_id` CHAR(36) NULL COMMENT '同一次服药批次（多药同服共享同一 batch_id；NULL=历史单药记录）' AFTER `medication_id`,
  ADD KEY `idx_medrec_batch` (`batch_id`);

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('025_medication_enhance');
