-- =============================================================
-- staging_real_user_backup_v2.sql
-- 从 minicare_staging 导出的真实用户数据备份（第二次，新 Schema）
-- 导出日期: 2026-04-14
-- 用途: 保存手机号 17600296377 账号在新 staging 环境下的全部数据
--
-- 用户信息（staging 库）:
--   用户: 17600296377  user_id = 308572f1-65ed-435e-a8e4-791a916b0f41  (owner)
--   家庭: 我们的家     family_id = 6bb0e45b-d808-49cf-84c2-9ef7e40abe84
--   宝宝: 旺仔         baby_id   = a54c8980-2aac-473c-a26f-a150fce7ec70
--         出生: 2025-12-28  性别: male(1)  出生体重: 2847g  出生身长: 48cm
--         过敏: milk (mild)
--   Schema 版本: 旧 Schema（feeding_record 单表，含 feed_type TINYINT）
--
-- 注意: 此文件保存原始旧 Schema 数据，不做 Schema 转换
--       如需写入新 Schema（008 重构后的分表），请参考 staging_real_user_backup.sql 的转换逻辑
-- =============================================================

-- ── 宝宝基本信息 ────────────────────────────────────────────
-- baby_profile: 旺仔
--   id:             a54c8980-2aac-473c-a26f-a150fce7ec70
--   family_id:      6bb0e45b-d808-49cf-84c2-9ef7e40abe84
--   name:           旺仔
--   gender:         1 (male)
--   birth_date:     2025-12-28
--   birth_weight_g: 2847
--   birth_height_cm:48
--   allergy_types:  ["milk"]
--   allergy_level:  mild
--   created_at:     2026-04-03 08:43:44

-- ── 饮食记录（feeding_record 旧单表，21 条）────────────────────
-- feed_type: 2=配方奶(formula), 3=辅食/营养素(complementary)
-- 数据范围: 2026-04-09 ~ 2026-04-13

-- 2026-04-09: 1条配方奶
-- id=08205cea  record_time=2026-04-09 20:19:00  formula_ml=130  note=拉肚子两次  milk=[eh_no_lactose,eh_lactose]
-- 2026-04-11: 7条配方奶
-- id=8a8b3c55  record_time=2026-04-11 03:00:00  formula_ml=130  duration_min=10  milk=[eh_no_lactose,eh_lactose]
-- id=933acf44  record_time=2026-04-11 07:00:00  formula_ml=130  duration_min=10  milk=[eh_no_lactose,eh_lactose]
-- id=7b599704  record_time=2026-04-11 10:03:00  formula_ml=140  milk=[eh_no_lactose,eh_lactose]
-- id=c2c1a6ee  record_time=2026-04-11 12:35:00  formula_ml=140  duration_min=10  milk=[eh_no_lactose,eh_lactose]
-- id=fedddc05  record_time=2026-04-11 16:16:00  formula_ml=140  milk=[eh_no_lactose,eh_lactose]
-- id=34d5cd49  record_time=2026-04-11 18:44:00  formula_ml=140  duration_min=10  milk=[eh_no_lactose,eh_lactose]
-- id=6779ec3a  record_time=2026-04-11 23:30:00  formula_ml=140  duration_min=10  milk=[eh_no_lactose,eh_lactose]
-- 2026-04-12: 11条（9配方奶+2营养素）
-- id=a06a3ba9  record_time=2026-04-12 03:52:00  formula_ml=140  duration_min=10  milk=[eh_no_lactose,eh_lactose]
-- id=d8917428  record_time=2026-04-12 06:44:00  formula_ml=140  milk=[eh_no_lactose,eh_lactose]
-- id=fdaabe03  record_time=2026-04-12 09:44:00  formula_ml=140  milk=[eh_no_lactose,eh_lactose]
-- id=7c6726b5  record_time=2026-04-12 12:25:00  formula_ml=140  milk=[eh_no_lactose,eh_lactose]
-- id=6cb1d546  record_time=2026-04-12 15:09:00  feed_type=3  complementary_food=营养素  supplement=[{vitD,维生素D,IU}]
-- id=944a854d  record_time=2026-04-12 15:09:00  feed_type=3  complementary_food=营养素  supplement=[{probiotic,益生菌,亿}]
-- id=a4c210d3  record_time=2026-04-12 15:10:00  formula_ml=140  duration_min=10  milk=[eh_no_lactose,eh_lactose]
-- id=ac03c90f  record_time=2026-04-12 17:55:00  formula_ml=160  duration_min=10  milk=[eh_no_lactose,eh_lactose]
-- id=adc77637  record_time=2026-04-12 17:56:00  feed_type=3  complementary_food=营养素  supplement=[{vitAD,维生素AD,IU}]
-- id=8c89d70d  record_time=2026-04-12 23:32:00  formula_ml=160  duration_min=24  milk=[eh_no_lactose,eh_lactose]
-- 2026-04-13: 2条（1配方奶+1营养素）
-- id=94f46a2f  record_time=2026-04-13 07:50:00  formula_ml=140  duration_min=10  milk=[eh_no_lactose,eh_lactose]
-- id=adc783f7  record_time=2026-04-13 11:17:00  formula_ml=160  duration_min=10  milk=[eh_no_lactose,eh_lactose]
-- id=62e49347  record_time=2026-04-13 11:22:00  feed_type=3  complementary_food=营养素  supplement=[{vitD,维生素D,IU}]

-- ── 尿布记录（diaper_record，6 条）──────────────────────────
-- diaper_type: 2=dirty(大便)
-- 全部6条均为 dirty 类型
-- id=ec971c7a  record_time=2026-04-09 18:20:00  diaper_type=2  color=brown_yellow  poop_type=loose  butt=normal
-- id=e3d8426a  record_time=2026-04-11 07:05:00  diaper_type=2  poop_type=normal   butt=normal
-- id=55cac637  record_time=2026-04-11 12:00:00  diaper_type=2  poop_type=normal   butt=normal
-- id=da51481b  record_time=2026-04-11 18:35:00  diaper_type=2  poop_type=normal   butt=normal
-- id=993f182b  record_time=2026-04-12 12:25:00  diaper_type=2  poop_type=normal   butt=normal
-- id=45802a55  record_time=2026-04-13 07:50:00  diaper_type=2  color=yellow       butt=normal

-- ── 生长记录（growth_record，6 条）──────────────────────────
-- id=b6cad93b  date=2025-12-28  weight=2800g  height=480mm  note=机构：社区卫生
-- id=692bf812  date=2026-01-26  weight=4100g  height=535mm  note=机构：儿保门诊
-- id=401e4a5f  date=2026-02-14  weight=5300g  height=565mm  head=390mm  note=机构：儿保门诊
-- id=74352fe1  date=2026-03-10  weight=6000g  height=590mm  head=410mm  note=机构：儿保门诊
-- id=540934af  date=2026-04-02  weight=7280g  height=610mm  head=420mm  time=08:46  note=机构：儿保门诊
-- id=7e642258  date=2026-04-13  weight=7280g  height=620mm  head=420mm  time=08:32  note=机构：儿保门诊

-- ── 睡眠记录（sleep_record，2 条）──────────────────────────
-- id=33c9de76  start=2026-04-12 17:00  end=2026-04-12 18:10  duration=70min  quality=normal  period=night  status=2
-- id=944de161  start=2026-04-13 08:32  end=2026-04-13 11:00  duration=148min  quality=good  period=null  status=2

-- ── 活动记录（activity_record，1 条）────────────────────────
-- id=18176483  record_time=2026-04-09 20:22  type=gross_motor  duration=15min  intensity=medium

-- ── 健康记录（health_record，2 条）──────────────────────────
-- id=079f66ca  record_time=2026-04-09 20:21  temp=36.5  medications=[{益生菌,1包}]  note=妈咪爱
-- id=0bfc5234  record_time=2026-04-11 12:35  temp=36.5  medications=[{益生菌,1袋}]

-- =============================================================
-- 完整 INSERT 语句（旧 Schema 原始格式，baby_id 保持 staging 原值）
-- 如需写入 dev 库，需将 recorded_by 替换为 dev 库对应用户 ID
-- =============================================================

-- ── feeding_record（21 条，旧单表 Schema）────────────────────
INSERT INTO feeding_record
  (id, baby_id, recorded_by, record_time, feed_type, breast_side, duration_min, formula_ml,
   complementary_food, amount_g, note, milk_types, milk_scoops, supplement_items)
VALUES
  ('08205cea-12d7-4ec0-8cb6-e20d1d715b2d','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-09 20:19:00',2,NULL,NULL,130,NULL,NULL,'拉肚子两次','["eh_no_lactose","eh_lactose"]','{"eh_lactose":3.6666666666666665,"eh_no_lactose":0.6666666666666666}',NULL),
  ('8a8b3c55-57f3-4d35-97de-a0b15239ee1c','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-11 03:00:00',2,NULL,10,130,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":3.6666666666666665,"eh_no_lactose":0.6666666666666666}',NULL),
  ('933acf44-ac85-4b57-b0f8-aef0c21a9f9d','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-11 07:00:00',2,NULL,10,130,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":3.6666666666666665,"eh_no_lactose":0.6666666666666666}',NULL),
  ('7b599704-a88e-4952-8e8d-a9f980ce7cee','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-11 10:03:00',2,NULL,NULL,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('c2c1a6ee-ac91-4cbb-a4e5-f3c6d906ecc0','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-11 12:35:00',2,NULL,10,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('fedddc05-9afd-48c9-ab6d-ac29c1a6aea5','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-11 16:16:00',2,NULL,NULL,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('34d5cd49-d290-4a2d-bbdc-4a5972b30b13','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-11 18:44:00',2,NULL,10,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('6779ec3a-5696-477f-a89b-cce2dac02bd5','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-11 23:30:00',2,NULL,10,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('a06a3ba9-6a9a-4fee-8fa3-0ba3d62597ed','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-12 03:52:00',2,NULL,10,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('d8917428-3dda-4cb0-a3e1-565a6b214507','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-12 06:44:00',2,NULL,NULL,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('fdaabe03-7354-4554-a647-69f0ef62561b','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-12 09:44:00',2,NULL,NULL,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('7c6726b5-ee52-48ce-9f12-813445a18b75','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-12 12:25:00',2,NULL,NULL,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('6cb1d546-f366-4de9-a61e-d61e2dd29338','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-12 15:09:00',3,NULL,NULL,NULL,'营养素',NULL,NULL,NULL,NULL,'[{"dose":"","key":"vitD","label":"维生素 D","unit":"IU"}]'),
  ('944a854d-a8ec-4ec7-bc39-aa5a19ebfa49','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-12 15:09:00',3,NULL,NULL,NULL,'营养素',NULL,NULL,NULL,NULL,'[{"dose":"","key":"probiotic","label":"益生菌","unit":"亿"}]'),
  ('a4c210d3-c603-4d19-a788-6140dd4f48f0','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-12 15:10:00',2,NULL,10,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('ac03c90f-e98f-462d-aff9-fbe6747f39a9','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-12 17:55:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4,"eh_no_lactose":0.6666666666666666}',NULL),
  ('adc77637-377d-49a9-a8cc-ec4389084d0e','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-12 17:56:00',3,NULL,NULL,NULL,'营养素',NULL,NULL,NULL,NULL,'[{"dose":"","key":"vitAD","label":"维生素 AD","unit":"IU"}]'),
  ('8c89d70d-cde7-4cf7-8521-3a6e1a6ccb19','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-12 23:32:00',2,NULL,24,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('94f46a2f-35b4-495d-b709-b4e1504643c3','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-13 07:50:00',2,NULL,10,140,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('adc783f7-58e7-4be8-b100-2c2df951108f','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-13 11:17:00',2,NULL,10,160,NULL,NULL,NULL,'["eh_no_lactose","eh_lactose"]','{"eh_lactose":4.666666666666667,"eh_no_lactose":0.6666666666666666}',NULL),
  ('62e49347-9fce-4e07-8658-f2d2b632232a','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-13 11:22:00',3,NULL,NULL,NULL,'营养素',NULL,NULL,NULL,NULL,'[{"dose":"","key":"vitD","label":"维生素 D","unit":"IU"}]');

-- ── diaper_record（6 条）──────────────────────────────────────
INSERT INTO diaper_record
  (id, baby_id, recorded_by, record_time, diaper_type, color, poop_type, butt_condition, diaper_count, note)
VALUES
  ('ec971c7a-fc0c-4a9f-bee4-927582f2f3a5','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-09 18:20:00',2,'brown_yellow','loose','normal',NULL,NULL),
  ('e3d8426a-0e88-4527-b7ee-1bd7734216d3','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-11 07:05:00',2,NULL,'normal','normal',NULL,NULL),
  ('55cac637-bdcd-4366-bb70-ca0e629e1c67','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-11 12:00:00',2,NULL,'normal','normal',NULL,NULL),
  ('da51481b-1973-4d40-ad39-e60e263b9bc7','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-11 18:35:00',2,NULL,'normal','normal',NULL,NULL),
  ('993f182b-7f31-47c3-9395-d41be1505ac7','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-12 12:25:00',2,NULL,'normal','normal',NULL,NULL),
  ('45802a55-1e59-4f3e-b701-802a678cd2b2','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-13 07:50:00',2,'yellow',NULL,'normal',NULL,NULL);

-- ── growth_record（6 条）──────────────────────────────────────
INSERT INTO growth_record
  (id, baby_id, recorded_by, record_date, record_time, weight_g, height_mm, head_mm, note)
VALUES
  ('b6cad93b-7c90-48a7-8791-846b1f10dcb9','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2025-12-28',NULL,2800,480,NULL,'机构：社区卫生'),
  ('692bf812-f427-4800-b047-0bad8db38d5c','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-01-26',NULL,4100,535,NULL,'机构：儿保门诊'),
  ('401e4a5f-78ca-460f-a294-1865ba604d63','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-02-14',NULL,5300,565,390,'机构：儿保门诊'),
  ('74352fe1-3544-479d-87b4-ec453113e7bd','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-03-10',NULL,6000,590,410,'机构：儿保门诊'),
  ('540934af-92f6-4e28-a7fe-60e04c896c3b','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-02','08:46:00',7280,610,420,'机构：儿保门诊'),
  ('7e642258-ddde-4ba7-85fd-0dc32bb8c017','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-13','08:32:00',7280,620,420,'机构：儿保门诊');

-- ── sleep_record（2 条）───────────────────────────────────────
INSERT INTO sleep_record
  (id, baby_id, recorded_by, start_time, end_time, duration_min, status, note, quality, sleep_period)
VALUES
  ('33c9de76-154f-43be-89ca-74cd330c3d83','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-12 17:00:17','2026-04-12 18:10:18',70,2,NULL,'normal','night'),
  ('944de161-5ab0-449c-a313-fbe83c703038','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-13 08:32:00','2026-04-13 11:00:00',148,2,NULL,'good',NULL);

-- ── activity_record（1 条）────────────────────────────────────
INSERT INTO activity_record
  (id, baby_id, recorded_by, record_time, activity_type, duration_min, note, intensity)
VALUES
  ('18176483-7584-4f04-b520-79d7a7c62f35','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-09 20:22:00','gross_motor',15,NULL,'medium');

-- ── health_record（2 条）─────────────────────────────────────
INSERT INTO health_record
  (id, baby_id, recorded_by, record_time, temperature, mood, allergy_symptoms, allergy_severity, medications, skin_care, note)
VALUES
  ('079f66ca-9fea-40d6-aac6-463369309e6e','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-09 20:21:00','36.5',NULL,NULL,NULL,'[{"dose":"1包","name":"益生菌"}]',NULL,'妈咪爱'),
  ('0bfc5234-646d-4808-b77d-d7bd8790b6ca','a54c8980-2aac-473c-a26f-a150fce7ec70','308572f1-65ed-435e-a8e4-791a916b0f41','2026-04-11 12:35:00','36.5',NULL,NULL,NULL,'[{"dose":"1袋","name":"益生菌"}]',NULL,NULL);

-- =============================================================
-- 汇总: 共 38 条记录
--   feeding_record: 21 条 (配方奶 18 + 营养素 3)
--   diaper_record:   6 条 (全部 dirty 大便)
--   growth_record:   6 条 (儿保+社区卫生门诊数据)
--   sleep_record:    2 条
--   activity_record: 1 条
--   health_record:   2 条
-- =============================================================
