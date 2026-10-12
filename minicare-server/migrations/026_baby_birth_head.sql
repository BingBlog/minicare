-- =============================================================
-- Migration 026: baby_profile 增加出生头围字段（档案出生数据补录）
-- 日期: 2026-10-12
-- 说明: 「我的 → 编辑宝宝档案」支持补录出生数据（体重/身高/头围），
--       weight/height 已有（见 002），本次补齐出生头围；
--       口径与 birth_height_cm 一致：TINYINT 整数厘米。
--       与生长记录（growth_record.head_mm）互不联动 —— 出生数据是
--       档案的一次性属性，生长曲线 0 月龄起点仍走生长记录。
-- =============================================================

SET NAMES utf8mb4;

ALTER TABLE `baby_profile`
  ADD COLUMN `birth_head_cm` TINYINT NULL COMMENT '出生头围（厘米）';

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('026_baby_birth_head');
