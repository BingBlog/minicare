-- =============================================================
-- Migration 004: 各记录模块增加结构化专用字段
-- 日期: 2026-03-31
-- 说明: 将原先拼入 note 字段的业务数据提取为独立列，
--       便于编辑回填、数据汇总与计算分析。
--       所有新增列均为 NULL 兼容，不影响存量数据。
-- =============================================================

SET NAMES utf8mb4;

-- -------------------------------------------------------------
-- 1. 尿布记录表 diaper_record
--    新增：poop_type（大便性状）, poop_color（颜色，替代原 color 字段语义扩展）, diaper_count（今日次数）
-- -------------------------------------------------------------
ALTER TABLE `diaper_record`
  ADD COLUMN `poop_type`    VARCHAR(30)  NULL COMMENT '大便性状: normal_soft/loose/watery/hard/bloody/normal_form' AFTER `color`,
  ADD COLUMN `diaper_count` TINYINT UNSIGNED NULL COMMENT '今日换尿布次数（0~20）' AFTER `poop_type`;

-- -------------------------------------------------------------
-- 2. 睡眠记录表 sleep_record
--    新增：quality（睡眠质量）, sleep_period（睡眠时段）
-- -------------------------------------------------------------
ALTER TABLE `sleep_record`
  ADD COLUMN `quality`      VARCHAR(10)  NULL COMMENT '睡眠质量: good/normal/poor' AFTER `note`,
  ADD COLUMN `sleep_period` VARCHAR(20)  NULL COMMENT '睡眠时段: night/morning_nap/afternoon_nap/other' AFTER `quality`;

-- -------------------------------------------------------------
-- 3. 活动记录表 activity_record
--    新增：intensity（活动强度）
-- -------------------------------------------------------------
ALTER TABLE `activity_record`
  ADD COLUMN `intensity` VARCHAR(10) NULL COMMENT '活动强度: easy/medium/active' AFTER `note`;

-- -------------------------------------------------------------
-- 4. 喂养记录表 feeding_record
--    新增：milk_types（奶粉类型 JSON）, milk_scoops（勺数配比 JSON）,
--           supplement_items（营养素列表 JSON）
-- -------------------------------------------------------------
ALTER TABLE `feeding_record`
  ADD COLUMN `milk_types`       JSON NULL COMMENT '奶粉类型列表，如 ["aa","eh_no_lactose"]' AFTER `note`,
  ADD COLUMN `milk_scoops`      JSON NULL COMMENT '奶粉勺数映射，如 {"aa":3,"eh_no_lactose":0.33}' AFTER `milk_types`,
  ADD COLUMN `supplement_items` JSON NULL COMMENT '营养素列表，如 [{"key":"vitD","dose":"400","unit":"IU"}]' AFTER `milk_scoops`;

-- -------------------------------------------------------------
-- 5. 症状记录表 symptom_record
--    新增：spirit（精神状态）, mood（情绪状态）
-- -------------------------------------------------------------
ALTER TABLE `symptom_record`
  ADD COLUMN `spirit` VARCHAR(20) NULL COMMENT '精神状态: active/normal/tired/lethargic' AFTER `note`,
  ADD COLUMN `mood`   VARCHAR(20) NULL COMMENT '情绪状态: happy/neutral/fussy/crying' AFTER `spirit`;

-- 记录迁移版本
INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('004_add_structured_fields');