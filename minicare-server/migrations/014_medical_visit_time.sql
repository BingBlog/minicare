-- =============================================================
-- Migration 014: 医疗记录增加检查时间（visit_time）
-- 日期: 2026-08-22
-- 说明:
--   1) medical_record 增加 visit_time（HH:mm，可选），用于记录就诊/检查的具体时间
--   2) 纯增量字段，不影响存量数据；VARCHAR 便于前端直接回显
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

ALTER TABLE `medical_record`
  ADD COLUMN `visit_time` VARCHAR(5) NULL
  COMMENT '就诊/检查时间 HH:mm（可选，2026-08-22 新增）'
  AFTER `visit_date`;
