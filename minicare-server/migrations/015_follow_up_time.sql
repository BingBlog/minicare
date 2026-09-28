-- =============================================================
-- Migration 015: 医疗记录增加复查时间（follow_up_time）
-- 日期: 2026-08-22
-- 说明:
--   1) medical_record 增加 follow_up_time（HH:mm，可选），
--      与 follow_up_date 搭配用于首页复查提醒展示（如「8月30日 08:00」）
--   2) 纯增量字段，不影响存量数据
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

ALTER TABLE `medical_record`
  ADD COLUMN `follow_up_time` VARCHAR(5) NULL
  COMMENT '复查时间 HH:mm（可选，2026-08-22 新增）'
  AFTER `follow_up_date`;
