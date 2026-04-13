-- =============================================================
-- staging_real_user_backup.sql
-- 从 minicare_staging 导出的真实用户数据备份
-- 导出日期: 2026-04-13
-- 用途: 数据库重构（008_schema_redesign）后，在新 dev/staging 库恢复真实用户数据
--
-- 用户信息:
--   家庭: 我们的家  family_id = 5143aa2e-5d18-4a04-af9f-d783e24a528d
--   宝宝: 旺仔     baby_id   = 8535bda2-7cdf-45c3-ba37-34a580822e5f  出生: 2025-12-28  性别: male
--   用户1 (owner): 17600296377  user_id = 8b50d895-9402-4c66-a46a-eed53242c2a5
--   用户2 (member): 13146989718  user_id = 2f682ad2-4905-4b03-9dd0-b7053458c29b
--
-- 注意:
--   1. 本文件基于新 Schema（008 重构后）生成，适配 minicare_dev 库
--   2. 旧 staging 库使用 feeding_record 一表四业务（TINYINT 枚举），
--      本文件已转换为新的分表结构（feeding_formula_record + feeding_supplement_record）
--   3. 执行前请确认已连接 minicare_dev，不要在生产库执行
--   4. INSERT IGNORE 用于幂等，重复执行不会报错
-- =============================================================

USE `minicare_dev`;

SET NAMES utf8mb4;
SET time_zone = '+08:00';
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================
-- 1. 用户账号
-- =============================================================
INSERT IGNORE INTO `user_account` (`id`, `phone`, `nickname`, `avatar_url`, `created_at`, `updated_at`) VALUES
  ('8b50d895-9402-4c66-a46a-eed53242c2a5', '17600296377', '用户_6377', NULL, '2026-04-08 23:45:17', '2026-04-08 23:45:17'),
  ('2f682ad2-4905-4b03-9dd0-b7053458c29b', '13146989718', '用户_9718', NULL, '2026-04-05 18:38:39', '2026-04-05 18:38:39');

-- =============================================================
-- 2. 家庭（dev 库表名为 family_group）
-- =============================================================
INSERT IGNORE INTO `family_group` (`id`, `name`, `invite_code`, `created_by`, `created_at`, `updated_at`) VALUES
  ('5143aa2e-5d18-4a04-af9f-d783e24a528d', '我们的家', '1DZ72O', '8b50d895-9402-4c66-a46a-eed53242c2a5', '2026-04-09 00:08:57', '2026-04-09 00:08:57');

-- =============================================================
-- 3. 家庭成员（role/status 已从 TINYINT 转为 VARCHAR）
-- =============================================================
INSERT IGNORE INTO `family_member` (`id`, `family_id`, `user_id`, `role`, `status`, `invite_phone`, `invited_by`, `joined_at`, `created_at`, `updated_at`) VALUES
  ('78750bcb-663f-4c2f-9ed9-0607dbd1960c', '5143aa2e-5d18-4a04-af9f-d783e24a528d', '8b50d895-9402-4c66-a46a-eed53242c2a5', 'owner',  'active', NULL,           NULL,                                        NULL,                        '2026-04-09 00:08:57', '2026-04-09 00:08:57'),
  ('385cfe3b-c828-4bb3-9b9c-277332f36396', '5143aa2e-5d18-4a04-af9f-d783e24a528d', '2f682ad2-4905-4b03-9dd0-b7053458c29b', 'member', 'active', '13146989718', '8b50d895-9402-4c66-a46a-eed53242c2a5', '2026-04-12 10:59:38', '2026-04-12 09:57:04', '2026-04-12 10:59:38');

-- =============================================================
-- 4. 宝宝档案（gender 已从 TINYINT 转为 VARCHAR: 1->male）
-- =============================================================
INSERT IGNORE INTO `baby_profile` (`id`, `family_id`, `name`, `gender`, `birth_date`, `avatar_url`, `allergy_types`, `allergy_level`, `birth_weight_g`, `birth_height_cm`, `created_by`, `created_at`, `updated_at`) VALUES
  ('8535bda2-7cdf-45c3-ba37-34a580822e5f', '5143aa2e-5d18-4a04-af9f-d783e24a528d', '旺仔', 'male', '2025-12-28', NULL, '["milk"]', 'mild', NULL, NULL, '8b50d895-9402-4c66-a46a-eed53242c2a5', '2026-04-09 00:08:57', '2026-04-09 00:08:57');

-- =============================================================
-- 5. 配方奶记录（feeding_record.feed_type=2 -> feeding_formula_record）
--    旧字段 milk_types/milk_scoops JSON -> 转入 feeding_formula_mix
--
--    配方奶配比规律（staging 原始数据）:
--      130ml: eh_no_lactose=0.6667勺, eh_lactose=3.6667勺
--      140ml: eh_no_lactose=0.6667勺, eh_lactose=4勺
--      160ml: eh_no_lactose=0.6667勺, eh_lactose=4勺（或4.6667勺）
-- =============================================================

-- 5-1. 配方奶主记录
INSERT IGNORE INTO `feeding_formula_record`
  (`id`, `baby_id`, `recorded_by`, `record_time`, `duration_min`, `formula_ml`, `note`, `created_at`, `updated_at`)
VALUES
  -- 2026-04-09: 130ml，拉肚子备注
  ('08205cea-12d7-4ec0-8cb6-e20d1d715b2d', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5', '2026-04-09 20:19:00', NULL, 130, '拉肚子两次', '2026-04-09 20:20:36', '2026-04-09 20:20:36'),
  -- 2026-04-11
  ('8a8b3c55-57f3-4d35-97de-a0b15239ee1c', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b', '2026-04-11 03:00:00', 10, 130, NULL, '2026-04-12 14:21:35', '2026-04-12 19:48:40'),
  ('933acf44-ac85-4b57-b0f8-aef0c21a9f9d', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b', '2026-04-11 07:00:00', 10, 130, NULL, '2026-04-12 14:22:21', '2026-04-12 19:48:52'),
  ('7b599704-a88e-4952-8e8d-a9f980ce7cee', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5', '2026-04-11 10:03:00', NULL, 140, NULL, '2026-04-11 10:03:44', '2026-04-11 10:03:44'),
  ('c2c1a6ee-ac91-4cbb-a4e5-f3c6d906ecc0', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b', '2026-04-11 12:35:00', 10, 140, NULL, '2026-04-12 14:23:55', '2026-04-12 19:48:19'),
  ('fedddc05-9afd-48c9-ab6d-ac29c1a6aea5', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5', '2026-04-11 16:16:00', NULL, 140, NULL, '2026-04-11 13:39:17', '2026-04-12 14:24:56'),
  ('34d5cd49-d290-4a2d-bbdc-4a5972b30b13', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b', '2026-04-11 18:44:00', 10, 140, NULL, '2026-04-12 14:19:18', '2026-04-12 19:46:36'),
  ('6779ec3a-5696-477f-a89b-cce2dac02bd5', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b', '2026-04-11 23:30:00', 10, 140, NULL, '2026-04-12 14:25:43', '2026-04-12 19:46:06'),
  -- 2026-04-12
  ('a06a3ba9-6a9a-4fee-8fa3-0ba3d62597ed', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b', '2026-04-12 03:52:00', 10, 140, NULL, '2026-04-12 14:18:46', '2026-04-13 08:20:40'),
  ('d8917428-3dda-4cb0-a3e1-565a6b214507', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5', '2026-04-12 06:44:00', NULL, 140, NULL, '2026-04-12 18:08:53', '2026-04-12 18:08:53'),
  ('fdaabe03-7354-4554-a647-69f0ef62561b', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5', '2026-04-12 09:44:00', NULL, 140, NULL, '2026-04-12 09:44:56', '2026-04-12 09:44:56'),
  ('7c6726b5-ee52-48ce-9f12-813445a18b75', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5', '2026-04-12 12:25:00', NULL, 140, NULL, '2026-04-12 12:25:07', '2026-04-12 12:25:07'),
  ('a4c210d3-c603-4d19-a788-6140dd4f48f0', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b', '2026-04-12 15:10:00', 10, 140, NULL, '2026-04-12 14:25:23', '2026-04-13 08:18:30'),
  ('ac03c90f-e98f-462d-aff9-fbe6747f39a9', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5', '2026-04-12 17:55:00', 10, 160, NULL, '2026-04-12 17:55:58', '2026-04-13 08:20:19'),
  -- 2026-04-12 夜 -> 2026-04-13
  ('8c89d70d-cde7-4cf7-8521-3a6e1a6ccb19', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5', '2026-04-12 23:32:00', 24, 160, NULL, '2026-04-13 11:33:03', '2026-04-13 11:33:03'),
  -- 2026-04-13
  ('94f46a2f-35b4-495d-b709-b4e1504643c3', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b', '2026-04-13 07:50:00', 10, 140, NULL, '2026-04-13 08:17:23', '2026-04-13 08:17:23'),
  ('adc783f7-58e7-4be8-b100-2c2df951108f', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5', '2026-04-13 11:17:00', 10, 160, NULL, '2026-04-13 11:22:48', '2026-04-13 11:22:48');

-- 5-2. 配方奶配比明细（feeding_formula_mix）
--      UUID 为新生成（原 staging 无此表，勺数取自 milk_scoops JSON）
--      精度统一为 DECIMAL(4,2)，对原始浮点值做四舍五入：
--        0.6666... -> 0.67
--        3.6666... -> 3.67
--        4.6666... -> 4.67
INSERT IGNORE INTO `feeding_formula_mix` (`id`, `record_id`, `milk_type`, `scoops`) VALUES
  -- 08205cea (130ml: eh_no_lactose=0.67, eh_lactose=3.67)
  (UUID(), '08205cea-12d7-4ec0-8cb6-e20d1d715b2d', 'eh_no_lactose', 0.67),
  (UUID(), '08205cea-12d7-4ec0-8cb6-e20d1d715b2d', 'eh_lactose',    3.67),
  -- 8a8b3c55
  (UUID(), '8a8b3c55-57f3-4d35-97de-a0b15239ee1c', 'eh_no_lactose', 0.67),
  (UUID(), '8a8b3c55-57f3-4d35-97de-a0b15239ee1c', 'eh_lactose',    3.67),
  -- 933acf44
  (UUID(), '933acf44-ac85-4b57-b0f8-aef0c21a9f9d', 'eh_no_lactose', 0.67),
  (UUID(), '933acf44-ac85-4b57-b0f8-aef0c21a9f9d', 'eh_lactose',    3.67),
  -- 7b599704 (140ml: eh_no_lactose=0.67, eh_lactose=4.00)
  (UUID(), '7b599704-a88e-4952-8e8d-a9f980ce7cee', 'eh_no_lactose', 0.67),
  (UUID(), '7b599704-a88e-4952-8e8d-a9f980ce7cee', 'eh_lactose',    4.00),
  -- c2c1a6ee
  (UUID(), 'c2c1a6ee-ac91-4cbb-a4e5-f3c6d906ecc0', 'eh_no_lactose', 0.67),
  (UUID(), 'c2c1a6ee-ac91-4cbb-a4e5-f3c6d906ecc0', 'eh_lactose',    4.00),
  -- fedddc05
  (UUID(), 'fedddc05-9afd-48c9-ab6d-ac29c1a6aea5', 'eh_no_lactose', 0.67),
  (UUID(), 'fedddc05-9afd-48c9-ab6d-ac29c1a6aea5', 'eh_lactose',    4.00),
  -- 34d5cd49
  (UUID(), '34d5cd49-d290-4a2d-bbdc-4a5972b30b13', 'eh_no_lactose', 0.67),
  (UUID(), '34d5cd49-d290-4a2d-bbdc-4a5972b30b13', 'eh_lactose',    4.00),
  -- 6779ec3a
  (UUID(), '6779ec3a-5696-477f-a89b-cce2dac02bd5', 'eh_no_lactose', 0.67),
  (UUID(), '6779ec3a-5696-477f-a89b-cce2dac02bd5', 'eh_lactose',    4.00),
  -- a06a3ba9
  (UUID(), 'a06a3ba9-6a9a-4fee-8fa3-0ba3d62597ed', 'eh_no_lactose', 0.67),
  (UUID(), 'a06a3ba9-6a9a-4fee-8fa3-0ba3d62597ed', 'eh_lactose',    4.00),
  -- d8917428
  (UUID(), 'd8917428-3dda-4cb0-a3e1-565a6b214507', 'eh_no_lactose', 0.67),
  (UUID(), 'd8917428-3dda-4cb0-a3e1-565a6b214507', 'eh_lactose',    4.00),
  -- fdaabe03
  (UUID(), 'fdaabe03-7354-4554-a647-69f0ef62561b', 'eh_no_lactose', 0.67),
  (UUID(), 'fdaabe03-7354-4554-a647-69f0ef62561b', 'eh_lactose',    4.00),
  -- 7c6726b5
  (UUID(), '7c6726b5-ee52-48ce-9f12-813445a18b75', 'eh_no_lactose', 0.67),
  (UUID(), '7c6726b5-ee52-48ce-9f12-813445a18b75', 'eh_lactose',    4.00),
  -- a4c210d3
  (UUID(), 'a4c210d3-c603-4d19-a788-6140dd4f48f0', 'eh_no_lactose', 0.67),
  (UUID(), 'a4c210d3-c603-4d19-a788-6140dd4f48f0', 'eh_lactose',    4.00),
  -- ac03c90f (160ml: eh_no_lactose=0.67, eh_lactose=4.00)
  (UUID(), 'ac03c90f-e98f-462d-aff9-fbe6747f39a9', 'eh_no_lactose', 0.67),
  (UUID(), 'ac03c90f-e98f-462d-aff9-fbe6747f39a9', 'eh_lactose',    4.00),
  -- 8c89d70d (160ml: eh_no_lactose=0.67, eh_lactose=4.67)
  (UUID(), '8c89d70d-cde7-4cf7-8521-3a6e1a6ccb19', 'eh_no_lactose', 0.67),
  (UUID(), '8c89d70d-cde7-4cf7-8521-3a6e1a6ccb19', 'eh_lactose',    4.67),
  -- 94f46a2f (140ml: eh_no_lactose=0.67, eh_lactose=4.67)
  (UUID(), '94f46a2f-35b4-495d-b709-b4e1504643c3', 'eh_no_lactose', 0.67),
  (UUID(), '94f46a2f-35b4-495d-b709-b4e1504643c3', 'eh_lactose',    4.67),
  -- adc783f7 (160ml: eh_no_lactose=0.67, eh_lactose=4.67)
  (UUID(), 'adc783f7-58e7-4be8-b100-2c2df951108f', 'eh_no_lactose', 0.67),
  (UUID(), 'adc783f7-58e7-4be8-b100-2c2df951108f', 'eh_lactose',    4.67);

-- =============================================================
-- 6. 营养素记录（feeding_record.feed_type=3 -> feeding_supplement_record）
--    原 complementary_food='营养素'，supplement_items 为 JSON 数组
-- =============================================================
INSERT IGNORE INTO `feeding_supplement_record`
  (`id`, `baby_id`, `recorded_by`, `record_time`, `supplement_items`, `note`, `created_at`, `updated_at`)
VALUES
  -- 2026-04-12 15:09 维生素D
  ('6cb1d546-f366-4de9-a61e-d61e2dd29338', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5',
   '2026-04-12 15:09:00',
   '[{"key":"vitD","label":"维生素 D","dose":"","unit":"IU"}]',
   NULL, '2026-04-12 18:09:50', '2026-04-12 18:09:50'),
  -- 2026-04-12 15:09 益生菌
  ('944a854d-a8ec-4ec7-bc39-aa5a19ebfa49', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5',
   '2026-04-12 15:09:00',
   '[{"key":"probiotic","label":"益生菌","dose":"","unit":"亿"}]',
   NULL, '2026-04-12 18:10:02', '2026-04-12 18:10:02'),
  -- 2026-04-12 17:56 维生素AD
  ('adc77637-377d-49a9-a8cc-ec4389084d0e', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5',
   '2026-04-12 17:56:00',
   '[{"key":"vitAD","label":"维生素 AD","dose":"","unit":"IU"}]',
   NULL, '2026-04-12 17:56:24', '2026-04-12 17:56:24'),
  -- 2026-04-13 11:22 维生素D
  ('62e49347-9fce-4e07-8658-f2d2b632232a', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5',
   '2026-04-13 11:22:00',
   '[{"key":"vitD","label":"维生素 D","dose":"","unit":"IU"}]',
   NULL, '2026-04-13 11:23:02', '2026-04-13 11:23:02');

-- =============================================================
-- 7. 尿布记录（diaper_type: TINYINT->VARCHAR: 1->wet, 2->dirty, 3->mixed）
--    color 字段: 新 schema 改为 stool_colors JSON，若原 color 不为 NULL
--    则包装成单元素数组 ["color_value"]，否则为 NULL
-- =============================================================
INSERT IGNORE INTO `diaper_record`
  (`id`, `baby_id`, `recorded_by`, `record_time`, `diaper_type`, `stool_colors`, `poop_type`, `butt_condition`, `diaper_count`, `note`, `created_at`, `updated_at`)
VALUES
  -- 2026-04-09 18:20 dirty 稀便 brown_yellow
  ('ec971c7a-fc0c-4a9f-bee4-927582f2f3a5', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5',
   '2026-04-09 18:20:00', 'dirty', '["brown_yellow"]', 'loose', 'normal', NULL, NULL, '2026-04-09 20:21:16', '2026-04-09 20:21:16'),
  -- 2026-04-11 07:05 dirty 正常便
  ('e3d8426a-0e88-4527-b7ee-1bd7734216d3', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b',
   '2026-04-11 07:05:00', 'dirty', NULL, 'normal', 'normal', NULL, NULL, '2026-04-12 14:26:16', '2026-04-12 14:26:16'),
  -- 2026-04-11 12:00 dirty 正常便
  ('55cac637-bdcd-4366-bb70-ca0e629e1c67', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b',
   '2026-04-11 12:00:00', 'dirty', NULL, 'normal', 'normal', NULL, NULL, '2026-04-12 14:26:34', '2026-04-12 14:27:10'),
  -- 2026-04-11 18:35 dirty 正常便
  ('da51481b-1973-4d40-ad39-e60e263b9bc7', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b',
   '2026-04-11 18:35:00', 'dirty', NULL, 'normal', 'normal', NULL, NULL, '2026-04-12 14:26:54', '2026-04-12 14:27:28'),
  -- 2026-04-12 12:25 dirty 正常便
  ('993f182b-7f31-47c3-9395-d41be1505ac7', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b',
   '2026-04-12 12:25:00', 'dirty', NULL, 'normal', 'normal', NULL, NULL, '2026-04-12 14:08:16', '2026-04-12 14:08:16'),
  -- 2026-04-13 07:50 dirty 黄色（poop_type NULL）
  ('45802a55-1e59-4f3e-b701-802a678cd2b2', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b',
   '2026-04-13 07:50:00', 'dirty', '["yellow"]', NULL, 'normal', NULL, NULL, '2026-04-13 08:17:53', '2026-04-13 08:17:53');

-- =============================================================
-- 8. 睡眠记录（status: TINYINT->VARCHAR: 1->ongoing, 2->ended）
-- =============================================================
INSERT IGNORE INTO `sleep_record`
  (`id`, `baby_id`, `recorded_by`, `start_time`, `end_time`, `duration_min`, `status`, `quality`, `sleep_period`, `note`, `created_at`, `updated_at`)
VALUES
  -- 2026-04-12 夜觉（17:00 ~ 18:10，70分钟，quality=normal）
  ('33c9de76-154f-43be-89ca-74cd330c3d83', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b',
   '2026-04-12 17:00:17', '2026-04-12 18:10:18', 70, 'ended', 'normal', 'night', NULL, '2026-04-12 17:00:17', '2026-04-12 18:33:06'),
  -- 2026-04-13 上午觉（08:32 ~ 11:00，148分钟，quality=good）
  ('944de161-5ab0-449c-a313-fbe83c703038', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5',
   '2026-04-13 08:32:00', '2026-04-13 11:00:00', 148, 'ended', 'good', NULL, NULL, '2026-04-13 10:33:06', '2026-04-13 10:33:06');

-- =============================================================
-- 9. 生长记录（record_time: TIME 可选）
-- =============================================================
INSERT IGNORE INTO `growth_record`
  (`id`, `baby_id`, `recorded_by`, `record_date`, `record_time`, `weight_g`, `height_mm`, `head_mm`, `note`, `created_at`, `updated_at`)
VALUES
  -- 出生体重（社区卫生）
  ('b6cad93b-7c90-48a7-8791-846b1f10dcb9', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b',
   '2025-12-28', NULL, 2800, 480, NULL, '机构：社区卫生', '2026-04-12 14:29:17', '2026-04-12 14:29:17'),
  -- 1月龄（儿保门诊）
  ('692bf812-f427-4800-b047-0bad8db38d5c', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b',
   '2026-01-26', NULL, 4100, 535, NULL, '机构：儿保门诊', '2026-04-12 14:29:45', '2026-04-12 14:29:45'),
  -- 2月龄（儿保门诊）
  ('401e4a5f-78ca-460f-a294-1865ba604d63', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b',
   '2026-02-14', NULL, 5300, 565, 390, '机构：儿保门诊', '2026-04-12 14:30:09', '2026-04-12 14:30:09'),
  -- 3月龄（儿保门诊）
  ('74352fe1-3544-479d-87b4-ec453113e7bd', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b',
   '2026-03-10', NULL, 6000, 590, 410, '机构：儿保门诊', '2026-04-12 14:30:31', '2026-04-12 14:30:31'),
  -- 3.5月龄（儿保门诊）
  ('540934af-92f6-4e28-a7fe-60e04c896c3b', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b',
   '2026-04-02', '08:46:00', 7280, 610, 420, '机构：儿保门诊', '2026-04-12 14:30:56', '2026-04-13 08:47:30'),
  -- 当日（儿保门诊）
  ('7e642258-ddde-4ba7-85fd-0dc32bb8c017', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '2f682ad2-4905-4b03-9dd0-b7053458c29b',
   '2026-04-13', '08:32:00', 7280, 620, 420, '机构：儿保门诊', '2026-04-12 16:35:25', '2026-04-13 08:32:41');

-- =============================================================
-- 10. 健康记录（mood 字段在新 schema 中已从 health_record 删除）
-- =============================================================
INSERT IGNORE INTO `health_record`
  (`id`, `baby_id`, `recorded_by`, `record_time`, `temperature`, `allergy_symptoms`, `allergy_severity`, `medications`, `skin_care`, `note`, `created_at`, `updated_at`)
VALUES
  -- 2026-04-09 益生菌（妈咪爱）体温36.5
  ('079f66ca-9fea-40d6-aac6-463369309e6e', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5',
   '2026-04-09 20:21:00', '36.5', NULL, NULL,
   '[{"name":"益生菌","dose":"1包"}]',
   NULL, '妈咪爱', '2026-04-09 20:21:46', '2026-04-09 20:21:46'),
  -- 2026-04-11 益生菌 体温36.5
  ('0bfc5234-646d-4808-b77d-d7bd8790b6ca', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5',
   '2026-04-11 12:35:00', '36.5', NULL, NULL,
   '[{"name":"益生菌","dose":"1袋"}]',
   NULL, NULL, '2026-04-11 13:39:59', '2026-04-11 13:39:59');

-- =============================================================
-- 11. 活动记录
-- =============================================================
INSERT IGNORE INTO `activity_record`
  (`id`, `baby_id`, `recorded_by`, `record_time`, `activity_type`, `duration_min`, `intensity`, `note`, `created_at`, `updated_at`)
VALUES
  -- 2026-04-09 大运动 15分钟 适中
  ('18176483-7584-4f04-b520-79d7a7c62f35', '8535bda2-7cdf-45c3-ba37-34a580822e5f', '8b50d895-9402-4c66-a46a-eed53242c2a5',
   '2026-04-09 20:22:00', 'gross_motor', 15, 'medium', NULL, '2026-04-09 20:22:28', '2026-04-09 20:22:28');

-- =============================================================
-- 恢复外键检查
-- =============================================================
SET FOREIGN_KEY_CHECKS = 1;
