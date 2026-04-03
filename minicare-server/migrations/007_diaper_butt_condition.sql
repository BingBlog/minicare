-- =============================================================
-- Migration 007: diaper_record 新增 butt_condition 列
-- 日期: 2026-04-03
-- 说明: 记录每次换尿布时的屁屁皮肤状态（尿布疹分级）
--       butt_condition 可选值（VARCHAR 存储字符串枚举）:
--         normal        正常
--         slightly_red  轻微发红
--         rash          红屁屁（尿布疹）
--         severe_rash   严重红屁屁（破皮渗出）
--         fungal        疑似真菌感染
--         other         其他异常
--       NULL = 未记录
-- =============================================================

ALTER TABLE `diaper_record`
  ADD COLUMN `butt_condition` VARCHAR(30) NULL COMMENT '屁屁状态: normal/slightly_red/rash/severe_rash/fungal/other'
  AFTER `poop_type`;
