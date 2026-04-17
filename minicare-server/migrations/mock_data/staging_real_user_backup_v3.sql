-- =============================================================
-- staging_real_user_backup_v3.sql
-- 从 minicare_staging 导出的真实用户数据备份（第三次，新 Schema）
-- 导出日期: 2026-04-16
-- 用途: 保存手机号 17600296377 账号在 staging 环境下的全部数据
--
-- 用户信息（staging 库）:
--   用户: 17600296377   user_id = 8b50d895-9402-4c66-a46a-eed53242c2a5  (owner)
--   家庭: 我们的家      family_id = 5143aa2e-5d18-4a04-af9f-d783e24a528d
--   宝宝: 旺仔          baby_id   = 8535bda2-7cdf-45c3-ba37-34a580822e5f
--         出生: 2025-12-28  性别: male(1)
--         家庭第二成员 user_id = 2f682ad2-4905-4b03-9dd0-b7053458c29b（部分记录 recorded_by）
--
-- 数据范围: 2026-04-09 ~ 2026-04-15（约 7 天）
-- 总记录数: 57 条
--
-- 汇总:
--   feeding_record:  35 条（配方奶 29 + 营养素 6）
--   diaper_record:    8 条（全部 dirty 大便）
--   growth_record:    6 条（出生+儿保门诊+社区卫生）
--   sleep_record:     3 条
--   activity_record:  1 条
--   health_record:    2 条
--   medical_record:   2 条（疫苗）
--   symptom_record:   0 条
--   food_observation: 0 条
-- =============================================================

-- ── 用户与家庭结构（备忘，不重复 INSERT）──────────────────────
-- user_account:  id=8b50d895  phone=17600296377  nickname=用户_6377
-- family_group:  id=5143aa2e  name=我们的家
-- family_member: user_id=8b50d895  family_id=5143aa2e
-- baby_profile:  id=8535bda2  name=旺仔  gender=1  birth_date=2025-12-28

-- =============================================================
-- feeding_record（35 条）
-- feed_type: 2=配方奶(formula), 3=辅食/营养素(complementary)
-- 数据范围: 2026-04-09 ~ 2026-04-15
-- =============================================================
INSERT INTO feeding_record
  (id, baby_id, recorded_by, record_time, feed_type, breast_side, duration_min, formula_ml,
   complementary_food, amount_g, note, milk_types, milk_scoops, supplement_items)
VALUES
  -- 2026-04-09
  ('08205cea-12d7-4ec0-8cb6-e20d1d715b2d','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-09 20:19:00',2,NULL,NULL,130,NULL,NULL,'拉肚子两次','["eh_no_lactose","eh_lactose"]','{"eh_lactose":3.6666666666666665,"eh_no_lactose":0.6666666666666666}',NULL),
  -- 2026-04-11
  ('8a8b3c55-57f3-4d35-97de-a0b15239ee1c','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-11 03:00:00',2,NULL,10,130,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":3.6666666666666665,"eh_no_lactose":0.6666666666666666}',NULL),
  ('933acf44-ac85-4b57-b0f8-aef0c21a9f9d','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-11 07:00:00',2,NULL,10,130,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":3.6666666666666665,"eh_no_lactose":0.6666666666666666}',NULL),
  ('7b599704-a88e-4952-8e8d-a9f980ce7cee','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-11 10:03:00',2,NULL,NULL,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('c2c1a6ee-ac91-4cbb-a4e5-f3c6d906ecc0','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-11 12:35:00',2,NULL,10,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('fedddc05-9afd-48c9-ab6d-ac29c1a6aea5','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-11 16:16:00',2,NULL,NULL,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('34d5cd49-d290-4a2d-bbdc-4a5972b30b13','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-11 18:44:00',2,NULL,10,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('6779ec3a-5696-477f-a89b-cce2dac02bd5','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-11 23:30:00',2,NULL,10,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  -- 2026-04-12
  ('a06a3ba9-6a9a-4fee-8fa3-0ba3d62597ed','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-12 03:52:00',2,NULL,10,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('d8917428-3dda-4cb0-a3e1-565a6b214507','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-12 06:44:00',2,NULL,NULL,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('fdaabe03-7354-4554-a647-69f0ef62561b','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-12 09:44:00',2,NULL,NULL,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('7c6726b5-ee52-48ce-9f12-813445a18b75','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-12 12:25:00',2,NULL,NULL,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('6cb1d546-f366-4de9-a61e-d61e2dd29338','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-12 15:09:00',3,NULL,NULL,NULL,'营养素',NULL,NULL,NULL,NULL,'[{"dose":"","key":"vitD","label":"维生素 D","unit":"IU"}]'),
  ('944a854d-a8ec-4ec7-bc39-aa5a19ebfa49','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-12 15:09:00',3,NULL,NULL,NULL,'营养素',NULL,NULL,NULL,NULL,'[{"dose":"","key":"probiotic","label":"益生菌","unit":"亿"}]'),
  ('a4c210d3-c603-4d19-a788-6140dd4f48f0','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-12 15:10:00',2,NULL,10,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('ac03c90f-e98f-462d-aff9-fbe6747f39a9','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-12 17:55:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('adc77637-377d-49a9-a8cc-ec4389084d0e','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-12 17:56:00',3,NULL,NULL,NULL,'营养素',NULL,NULL,NULL,NULL,'[{"dose":"","key":"vitAD","label":"维生素 AD","unit":"IU"}]'),
  ('8c89d70d-cde7-4cf7-8521-3a6e1a6ccb19','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-12 23:32:00',2,NULL,24,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  -- 2026-04-13
  ('94f46a2f-35b4-495d-b709-b4e1504643c3','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-13 07:50:00',2,NULL,10,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('adc783f7-58e7-4be8-b100-2c2df951108f','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-13 11:17:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('62e49347-9fce-4e07-8658-f2d2b632232a','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-13 11:22:00',3,NULL,NULL,NULL,'营养素',NULL,NULL,NULL,NULL,'[{"dose":"","key":"vitD","label":"维生素 D","unit":"IU"}]'),
  -- 2026-04-14
  ('ddf6b7bd-8ba8-494e-99c0-5fc4fe49587e','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-14 03:37:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('12601d52-0881-4d28-b735-40e11bd81b4c','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-14 07:37:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('1bcada90-ced2-407e-823c-cfd4c45ac520','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-14 11:37:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('49a7b652-4fe1-47a6-9f41-09f829989916','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-14 14:10:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('1f82bb47-f68f-4205-a6f9-0a9f21aba56c','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-14 14:26:00',3,NULL,NULL,NULL,'营养素',NULL,NULL,NULL,NULL,'[{"dose":"","key":"vitD","label":"维生素 D","unit":"IU"}]'),
  ('17c73b7b-0f00-4c4c-80c5-6d7e14daf1f5','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-14 17:34:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('57b96414-6f6a-4dc5-a0c2-de08e7ef9693','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-14 17:35:00',3,NULL,NULL,NULL,'营养素',NULL,NULL,NULL,NULL,'[{"dose":"","key":"vitAD","label":"维生素 AD","unit":"IU"}]'),
  ('47606e95-5067-4ade-9a77-2bb00203ef62','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-14 22:32:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('3d583fef-8943-4a87-95ab-205e935d555b','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-14 22:34:00',3,NULL,NULL,NULL,'营养素',NULL,NULL,NULL,NULL,'[{"dose":"","key":"probiotic","label":"益生菌","unit":"亿"}]'),
  -- 2026-04-15
  ('e0f823b7-788c-4501-8720-639c1d22c105','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-15 03:21:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('dbff41c3-5356-485d-ab16-498214bced13','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-15 06:22:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('8a90369f-7ba4-4573-a1c5-116051a01848','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-15 09:30:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('fbe5b7f9-571a-4e76-9764-0b4c100ecb98','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-15 12:00:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('0e307045-cd7e-4e1e-8fed-85cca7fe5390','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-15 14:58:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('1556861a-9b7d-4d2d-8e11-c6e925c53dcd','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-15 18:20:00',2,NULL,10,170,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":5,"eh_no_lactose":0.6666666666666666}',NULL),
  ('0c707099-96da-48b9-9db5-e2fa2a4e03b6','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-15 23:43:00',2,NULL,10,170,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":5,"eh_no_lactose":0.6666666666666666}',NULL);

-- =============================================================
-- diaper_record（8 条）
-- diaper_type: 2=dirty(大便)
-- =============================================================
INSERT INTO diaper_record
  (id, baby_id, recorded_by, record_time, diaper_type, color, poop_type, butt_condition, diaper_count, note)
VALUES
  ('ec971c7a-fc0c-4a9f-bee4-927582f2f3a5','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-09 18:20:00',2,'brown_yellow','loose','normal',NULL,NULL),
  ('e3d8426a-0e88-4527-b7ee-1bd7734216d3','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-11 07:05:00',2,NULL,'normal','normal',NULL,NULL),
  ('55cac637-bdcd-4366-bb70-ca0e629e1c67','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-11 12:00:00',2,NULL,'normal','normal',NULL,NULL),
  ('da51481b-1973-4d40-ad39-e60e263b9bc7','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-11 18:35:00',2,NULL,'normal','normal',NULL,NULL),
  ('993f182b-7f31-47c3-9395-d41be1505ac7','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-12 12:25:00',2,NULL,'normal','normal',NULL,NULL),
  ('45802a55-1e59-4f3e-b701-802a678cd2b2','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-13 07:50:00',2,'yellow',NULL,'normal',NULL,NULL),
  ('42dc7d4b-2e9a-4d5e-95d0-4ec40154c35a','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-14 14:20:00',2,'yellow','normal','normal',NULL,NULL),
  ('9787dece-e4ed-4a37-b3dd-5fb98dc16cb5','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-15 13:55:00',2,NULL,NULL,'normal',NULL,NULL);

-- =============================================================
-- growth_record（6 条）
-- weight_g: 克, height_mm: 毫米, head_mm: 毫米
-- =============================================================
INSERT INTO growth_record
  (id, baby_id, recorded_by, record_date, record_time, weight_g, height_mm, head_mm, note)
VALUES
  ('b6cad93b-7c90-48a7-8791-846b1f10dcb9','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2025-12-28',NULL,2800,480,NULL,'机构：社区卫生'),
  ('692bf812-f427-4800-b047-0bad8db38d5c','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-01-26',NULL,4100,535,NULL,'机构：儿保门诊'),
  ('401e4a5f-78ca-460f-a294-1865ba604d63','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-02-14',NULL,5300,565,390,'机构：儿保门诊'),
  ('74352fe1-3544-479d-87b4-ec453113e7bd','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-03-10',NULL,6000,590,410,'机构：儿保门诊'),
  ('540934af-92f6-4e28-a7fe-60e04c896c3b','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-02','08:46:00',7280,610,420,'机构：儿保门诊'),
  ('7e642258-ddde-4ba7-85fd-0dc32bb8c017','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-13','08:32:00',7280,620,420,'机构：儿保门诊');

-- =============================================================
-- sleep_record（3 条）
-- status: 2=已结束
-- =============================================================
INSERT INTO sleep_record
  (id, baby_id, recorded_by, start_time, end_time, duration_min, status, note, quality, sleep_period)
VALUES
  ('33c9de76-154f-43be-89ca-74cd330c3d83','8535bda2-7cdf-45c3-ba37-34a580822e5f','2f682ad2-4905-4b03-9dd0-b7053458c29b','2026-04-12 17:00:17','2026-04-12 18:10:18',70,2,NULL,'normal','night'),
  ('944de161-5ab0-449c-a313-fbe83c703038','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-13 08:32:00','2026-04-13 11:00:00',148,2,NULL,'good',NULL),
  ('f3429292-9ffa-4f0d-a96c-b65e8ea4a90e','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-15 14:17:15','2026-04-15 14:58:35',41,2,NULL,'normal','night');

-- =============================================================
-- activity_record（1 条）
-- =============================================================
INSERT INTO activity_record
  (id, baby_id, recorded_by, record_time, activity_type, duration_min, note, intensity)
VALUES
  ('18176483-7584-4f04-b520-79d7a7c62f35','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-09 20:22:00','gross_motor',15,NULL,'medium');

-- =============================================================
-- health_record（2 条）
-- =============================================================
INSERT INTO health_record
  (id, baby_id, recorded_by, record_time, temperature, mood, allergy_symptoms, allergy_severity, medications, skin_care, note)
VALUES
  ('079f66ca-9fea-40d6-aac6-463369309e6e','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-09 20:21:00','36.5',NULL,NULL,NULL,'[{"dose":"1包","name":"益生菌"}]',NULL,'妈咪爱'),
  ('0bfc5234-646d-4808-b77d-d7bd8790b6ca','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-11 12:35:00','36.5',NULL,NULL,NULL,'[{"dose":"1袋","name":"益生菌"}]',NULL,NULL);

-- =============================================================
-- medical_record（2 条）
-- visit_type: vaccine=疫苗接种
-- =============================================================
INSERT INTO medical_record
  (id, baby_id, recorded_by, visit_date, visit_type, hospital, diagnosis, medications, result_summary, follow_up_date, doctor, photo_ids, note)
VALUES
  ('4e5da20d-44fc-4dd7-b718-3b42f2454a96','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-15','vaccine',NULL,NULL,'[{"name":"五联第一针"}]',NULL,NULL,NULL,NULL,NULL),
  ('1c4407b3-9a9a-48cb-8bd5-0f3bb100144a','8535bda2-7cdf-45c3-ba37-34a580822e5f','8b50d895-9402-4c66-a46a-eed53242c2a5','2026-04-14','vaccine',NULL,'补铁 加奶量','[{"name":"五联第一针"}]',NULL,NULL,NULL,NULL,NULL);

-- =============================================================
-- 汇总: 共 57 条记录
--   feeding_record:   35 条（配方奶 29 + 营养素 6）
--   diaper_record:     8 条（全部 dirty 大便）
--   growth_record:     6 条（出生+各阶段儿保门诊）
--   sleep_record:      3 条
--   activity_record:   1 条
--   health_record:     2 条
--   medical_record:    2 条（五联第一针疫苗接种）
--   symptom_record:    0 条
--   food_observation:  0 条
-- =============================================================
