-- =============================================================
-- Migration 005: health_record 增加结构化专用字段
-- 日期: 2026-04-01
-- 说明: 将过敏表现、严重程度、用药记录、护理记录等
--       原先拼入 note 字段的数据提取为独立 JSON 列，
--       便于编辑回填和数据统计分析。
--       所有新增列均为 NULL 兼容，不影响存量数据。
-- =============================================================

SET NAMES utf8mb4;

ALTER TABLE `health_record`
  ADD COLUMN `allergy_symptoms` JSON        NULL COMMENT '过敏症状列表，如 ["荨麻疹","血便"]' AFTER `mood`,
  ADD COLUMN `allergy_severity` VARCHAR(10) NULL COMMENT '过敏严重程度: mild|moderate|severe' AFTER `allergy_symptoms`,
  ADD COLUMN `medications`      JSON        NULL COMMENT '用药列表，如 [{"name":"维生素D","dose":"400IU"}]' AFTER `allergy_severity`,
  ADD COLUMN `skin_care`        JSON        NULL COMMENT '护理项目列表，如 ["已做保湿","涂抹面霜"]' AFTER `medications`;

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('005_health_structured_fields');