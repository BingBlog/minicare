-- =============================================================
-- Migration 003: medical_record 增加就诊类型、主诊医生、结果摘要、复查日期字段
-- 日期: 2026-04-01
-- 说明: 兼容 MySQL 5.7（本地）和 MySQL 8.0（CloudBase 远程）
--       前端 MedicalFormPage 收集的 visitType/doctor/resultSummary/followUpDate
--       原先因无对应列而丢弃，本迁移补全这些列以保持前后端字段一致。
--       幂等处理由应用层 migrate 脚本控制（schema_migrations 表去重）
-- =============================================================

SET NAMES utf8mb4;

ALTER TABLE `medical_record`
  ADD COLUMN `visit_type`     VARCHAR(20)  NULL COMMENT '就诊类型: checkup|allergy|sick|vaccine|blood|other',
  ADD COLUMN `doctor`         VARCHAR(50)  NULL COMMENT '主诊医生姓名',
  ADD COLUMN `result_summary` TEXT         NULL COMMENT '结果摘要（检测指标等）',
  ADD COLUMN `follow_up_date` DATE         NULL COMMENT '下次复查日期';

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('003_medical_extra_fields');
