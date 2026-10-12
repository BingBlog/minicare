-- =============================================================
-- Migration 028: baby_profile 增加「每日补充计划」（PRD-018）
-- 日期: 2026-10-12
-- 说明: 首页「补剂&营养素」提醒从「昨日反推」升级为「计划对账」——
--       计划 = 每天要吃哪些营养素（key 数组，家长在营养素记录页显式配置）。
--       纯加列无回填；NULL / 空数组均视为「未配置」。
--       字段校验白名单见 src/baby/dto/update-baby.dto.ts::SUPPLEMENT_PLAN_KEYS。
-- =============================================================

SET NAMES utf8mb4;

ALTER TABLE `baby_profile`
  ADD COLUMN `supplement_plan` JSON NULL COMMENT '每日补充计划：营养素 key 数组，如 ["vitD","iron"]；NULL=未配置';

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('028_baby_supplement_plan');
