-- =============================================================
-- Migration 002: 宝宝档案增加过敏类型、过敏程度、出生体重/身高字段
-- 日期: 2026-03-30
-- 说明: 兼容 MySQL 5.7（本地）和 MySQL 8.0（CloudBase 远程）
--       MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS，改用 IGNORE 写法
-- =============================================================

SET NAMES utf8mb4;

-- 依次添加，幂等处理由应用层 migrate 脚本控制（schema_migrations 表去重）
ALTER TABLE `baby_profile`
  ADD COLUMN `allergy_types`   JSON        NULL    COMMENT '过敏类型列表，如 ["milk","egg","wheat"]',
  ADD COLUMN `allergy_level`   VARCHAR(20) NULL    COMMENT '过敏程度: mild | moderate | severe | unknown',
  ADD COLUMN `birth_weight_g`  SMALLINT    NULL    COMMENT '出生体重（克）',
  ADD COLUMN `birth_height_cm` TINYINT     NULL    COMMENT '出生身高（厘米）';

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('002_baby_allergy_fields');
