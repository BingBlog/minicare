-- ============================================================
-- 008_mock_data_v2_sample.sql
-- mock-data-plan-v2 小样本：出生日起连续 3 天（校验用，非全量）
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';
SET foreign_key_checks = 0;

-- 与 003 相同：先清空该宝宝相关记录（仅开发/验证库执行）
DELETE FROM `feeding_record` WHERE `baby_id` = 'eacb2495-4387-4cf1-93a3-be11c444e618';
DELETE FROM `sleep_record` WHERE `baby_id` = 'eacb2495-4387-4cf1-93a3-be11c444e618';
DELETE FROM `diaper_record` WHERE `baby_id` = 'eacb2495-4387-4cf1-93a3-be11c444e618';
DELETE FROM `health_record` WHERE `baby_id` = 'eacb2495-4387-4cf1-93a3-be11c444e618';
DELETE FROM `symptom_record` WHERE `baby_id` = 'eacb2495-4387-4cf1-93a3-be11c444e618';
DELETE FROM `activity_record` WHERE `baby_id` = 'eacb2495-4387-4cf1-93a3-be11c444e618';
DELETE FROM `growth_record` WHERE `baby_id` = 'eacb2495-4387-4cf1-93a3-be11c444e618';
DELETE FROM `medical_record` WHERE `baby_id` = 'eacb2495-4387-4cf1-93a3-be11c444e618';
DELETE FROM `food_observation` WHERE `baby_id` = 'eacb2495-4387-4cf1-93a3-be11c444e618';

UPDATE `baby_profile` SET `birth_date` = '2025-12-26' WHERE `id` = 'eacb2495-4387-4cf1-93a3-be11c444e618';

INSERT INTO `feeding_record` (`id`,`baby_id`,`recorded_by`,`record_time`,`feed_type`,`breast_side`,`duration_min`,`formula_ml`,`complementary_food`,`amount_g`,`milk_types`,`milk_scoops`,`supplement_items`,`note`) VALUES
  ('cec3c239-4e01-4dcc-98ac-9f9c5c44330a', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 03:02:00', 2, NULL, NULL, 68, NULL, NULL, NULL, NULL, NULL, NULL),
  ('9247d88c-3e2f-4093-a10d-aaf49db96b31', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 03:39:00', 2, NULL, NULL, 63, NULL, NULL, NULL, NULL, NULL, NULL),
  ('80a650ac-021a-467e-8458-235085cb50b3', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 08:24:00', 1, 1, 18, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('c99866b4-bb28-4aa5-8f94-b816880504a5', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 08:25:00', 2, NULL, NULL, 76, NULL, NULL, NULL, NULL, NULL, NULL),
  ('ce814fff-3ae5-440d-a446-5b7bdf45afaa', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 13:01:00', 2, NULL, NULL, 82, NULL, NULL, NULL, NULL, NULL, NULL),
  ('499c25b8-9c39-4e94-972a-83a7eb98d514', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 15:04:00', 1, 3, 19, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('935abec3-eaf7-48a5-b45e-71fd35f124e8', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-26 17:10:00', 2, NULL, NULL, 65, NULL, NULL, NULL, NULL, NULL, NULL),
  ('1087c8b4-717a-4db7-b16c-2fb115662ffa', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 21:07:00', 1, 1, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('f479d1a9-1d5e-4d87-8b1c-047b966f3570', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 22:16:00', 1, 2, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fd8c8b0e-1c5f-4b03-b22c-613b2117af5c', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 23:03:00', 2, NULL, NULL, 61, NULL, NULL, NULL, NULL, NULL, NULL),
  ('70fdea64-456d-4e5f-8916-d9711a5b5af3', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 02:29:00', 1, 1, 18, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('8402f488-60c1-4eea-ab23-4a488b726b56', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 02:30:00', 2, NULL, NULL, 70, NULL, NULL, NULL, NULL, NULL, NULL),
  ('9b420bd3-7f79-4ac9-a6ae-d76bcb2ad6b4', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 05:32:00', 1, 2, 20, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('87a42817-4ca5-4e65-83b8-8c717dbdb4e7', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 08:11:00', 1, 1, 18, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('6641b8c3-adae-47c0-8bc3-115b43d5ae6c', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 09:20:00', 2, NULL, NULL, 98, NULL, NULL, NULL, NULL, NULL, NULL),
  ('88e5ae4e-c7c3-454b-8ef8-0128787599ed', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 13:16:00', 1, 1, 24, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('90d0bb8a-1596-4878-bc4d-22dfe3ee42e5', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 15:36:00', 1, 3, 16, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('40de9bde-4051-4040-bd3c-091aecccdb06', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 18:48:00', 2, NULL, NULL, 81, NULL, NULL, NULL, NULL, NULL, NULL),
  ('7dddc7e8-e6f0-480e-9760-5508f594a473', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 19:14:00', 1, 1, 20, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('d8582199-c0b9-4ce0-a15f-916d90020606', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 23:30:00', 1, 2, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('007426ff-02a1-4041-82cd-0e534804fe48', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 23:40:00', 2, NULL, NULL, 98, NULL, NULL, NULL, NULL, NULL, NULL),
  ('54bc8bbb-abda-4a02-a57f-7f09a8f36ff2', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 02:05:00', 1, 1, 19, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('3e0abd74-6289-4c18-9393-0d62171dacc6', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-28 01:29:00', 2, NULL, NULL, 72, NULL, NULL, NULL, NULL, NULL, NULL),
  ('8ad1206a-7d01-4dfb-8dec-a6db1e2064cc', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 03:35:00', 1, 1, 19, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('9bc7ca7c-c413-4d28-8073-16d2db5cbb13', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 07:53:00', 1, 2, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('7649f01d-b044-440c-9b18-8052b0781e30', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 09:49:00', 2, NULL, NULL, 92, NULL, NULL, NULL, NULL, NULL, NULL),
  ('3ac35564-45d4-4c12-b193-f2eed2f0fd6d', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-28 13:35:00', 1, 1, 19, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('31e7e3ba-22e8-4f86-b375-615065460df6', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 13:48:00', 1, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('25fafa2c-3e68-4d2e-9728-c2813553da83', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 18:44:00', 2, NULL, NULL, 80, NULL, NULL, NULL, NULL, NULL, NULL),
  ('6e1e466c-629a-4ea7-ab45-f3ac21c2aff3', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 19:43:00', 1, 3, 20, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('d0031c7c-5c7b-411c-b890-3568606bc96b', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-28 21:13:00', 1, 1, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('3cbc5165-0156-4db9-81aa-6af077ca83f5', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 22:03:00', 2, NULL, NULL, 97, NULL, NULL, NULL, NULL, NULL, NULL);

INSERT INTO `diaper_record` (`id`,`baby_id`,`recorded_by`,`record_time`,`diaper_type`,`color`,`poop_type`,`butt_condition`,`diaper_count`,`note`) VALUES
  ('dce73878-47d9-41ba-ab59-f7c6f3f21d9d', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 18:56:00', 2, 'dark_green', 'loose', NULL, NULL, '胎便（黑绿色）'),
  ('4463223e-42dd-4146-ab62-f1b3e160af35', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 21:33:00', 3, 'yellow', 'loose', NULL, NULL, '胎便（黑绿色）'),
  ('f136edb3-a5a5-40dd-a720-19ba6a325077', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 12:26:00', 2, 'dark_green', 'loose', NULL, NULL, '过渡便（黄绿色）'),
  ('337b80bb-9f09-43bf-af8e-6395ff552c7e', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 02:28:00', 3, 'yellow', 'loose', NULL, NULL, '过渡便（黄绿色）'),
  ('73369f8b-80c3-4fdc-a3fe-d3243e232d5a', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-26 07:52:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('74059bc7-6a85-4234-b7ac-7721e7e1828e', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-26 08:02:00', 3, 'yellow', 'normal_soft', NULL, NULL, NULL),
  ('d8b46a0f-82d5-45de-99c4-a0208ab9dc29', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 09:35:00', 2, 'yellow', 'normal_soft', NULL, NULL, NULL),
  ('38dbea46-3f84-4a9d-b08f-05a30a2ae42f', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 05:39:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('54d707f5-186e-480f-a753-3183adf767ce', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-26 09:12:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('ba0b18b7-d293-4afa-b138-8677ec297f89', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 20:53:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('67b7797e-e912-4972-a20f-972c03b383e9', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 05:40:00', 2, 'yellow', 'normal_soft', NULL, NULL, NULL),
  ('db3307ff-f572-423d-a31b-0ddbb4b802bb', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-26 21:56:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('97f44841-50e2-4d99-a8de-7186e1b9684d', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 18:16:00', 2, 'dark_green', 'loose', NULL, NULL, '过渡便（黄绿色）'),
  ('226f47cd-bb96-4ec1-a9b8-9d313a19214c', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 04:28:00', 3, 'yellow', 'loose', NULL, NULL, '过渡便（黄绿色）'),
  ('8785f343-8224-4581-88fd-1ee7d4fabb41', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 18:51:00', 2, 'dark_green', 'loose', NULL, NULL, '过渡便（黄绿色）'),
  ('0007e7ab-41ce-494a-806e-4183cf4fd692', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 18:06:00', 3, 'yellow', 'loose', NULL, NULL, '过渡便（黄绿色）'),
  ('2faa789b-b6cd-4950-a5bb-0c3d2673c189', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 14:32:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('a4f3168b-4d58-4fa7-af80-0962065382a0', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 10:44:00', 2, 'yellow', 'normal_soft', NULL, NULL, NULL),
  ('03ebc484-a52b-4000-93e6-21e84b58c178', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 15:03:00', 3, 'yellow', 'normal_soft', NULL, NULL, NULL),
  ('7813fd8c-40bd-49f3-8056-b3a71cb100ba', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 04:13:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('b0b2735f-5993-4984-9c1d-b02d84c7c127', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 11:38:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('fe1000fb-17b7-4d04-8f9d-2da837d4fae5', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 20:11:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('8aefdbc3-2134-41a9-8516-7c7c58c084b5', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 21:38:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('0bc79659-82fa-4a97-b6c8-c021c4e174a5', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 08:07:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('afbff98b-d435-465e-84e7-0b345cef8ea0', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 19:51:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('b70a40af-4738-4d5b-96a1-e30062783cbe', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-28 14:24:00', 2, 'yellow', 'normal_soft', NULL, NULL, NULL),
  ('e18671f4-7ea3-4c43-b7e2-55e12a27acfd', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 09:00:00', 2, 'yellow', 'normal_soft', NULL, NULL, NULL),
  ('d18e60fb-2ae5-41a3-9ae7-93655a7741f5', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 08:14:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('05d22430-a40c-4fb8-b3ff-884f01b2c160', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 10:20:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('15ae8cf4-6e13-43c6-9a7a-9cb8a2c73756', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 00:25:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('04955fd6-8878-4c13-a4cb-3ca65a6b6164', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 02:36:00', 2, 'yellow', 'normal_soft', NULL, NULL, NULL),
  ('d19f09a6-3f96-40d8-a474-826d034406d8', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-28 04:37:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('287388a1-9e9a-4b42-b5a9-8178f9ca2775', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 08:26:00', 1, NULL, NULL, NULL, NULL, NULL),
  ('5f420517-1a35-4514-a804-67a30dd12759', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-28 15:03:00', 2, 'yellow', 'normal_soft', NULL, NULL, NULL);

INSERT INTO `sleep_record` (`id`,`baby_id`,`recorded_by`,`start_time`,`end_time`,`duration_min`,`status`,`note`,`quality`,`sleep_period`) VALUES
  ('0b566e16-8430-44a3-9cbc-b2f15e0bd654', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 01:10:00', '2025-12-26 03:21:00', 131, 2, NULL, 'normal', 'night'),
  ('6d16f30e-adb8-417b-9899-746aad6f3b77', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 00:30:00', '2025-12-26 01:57:00', 87, 2, NULL, 'good', 'night'),
  ('aef7dbbf-e1b6-4c61-be3c-5e14fb05e07e', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 10:30:00', '2025-12-26 11:21:00', 51, 2, NULL, 'normal', 'morning_nap'),
  ('1bd1011c-5466-4298-b03f-130764fbba49', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 14:34:00', '2025-12-26 15:38:00', 64, 2, NULL, 'good', 'afternoon_nap'),
  ('15ead201-7b96-4f8e-99b0-6c70fe7677ea', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 17:07:00', '2025-12-26 17:45:00', 38, 2, NULL, 'normal', 'other'),
  ('729834e1-fdff-4906-b08f-24f90ccb9764', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-26 21:02:00', '2025-12-26 23:18:00', 136, 2, NULL, 'good', 'night'),
  ('358ac680-f8a7-4099-b91b-c113af909948', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-26 23:05:00', '2025-12-26 23:55:00', 50, 2, NULL, 'normal', 'night'),
  ('b74b2286-2329-44a4-89c2-6aac34751a2a', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 09:25:00', '2025-12-26 10:10:00', 45, 2, NULL, 'normal', 'morning_nap'),
  ('23a5299b-c887-4811-b1e3-f9dc58903b93', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26 13:47:00', '2025-12-26 14:34:00', 47, 2, NULL, 'normal', 'afternoon_nap'),
  ('bf1a348e-a0ec-42da-a7eb-ffdc0d9b5e5b', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 00:10:00', '2025-12-27 01:57:00', 107, 2, NULL, 'normal', 'night'),
  ('71444cee-2a33-4618-9e79-ac791eb14408', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 01:26:00', '2025-12-27 02:58:00', 92, 2, NULL, 'good', 'night'),
  ('665cf149-96dc-41c0-9bfe-caab045353c4', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 10:38:00', '2025-12-27 11:38:00', 60, 2, NULL, 'good', 'morning_nap'),
  ('ff6a90c4-ad85-4b2c-b8f9-ce8d5ea843ab', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 13:26:00', '2025-12-27 14:29:00', 63, 2, NULL, 'good', 'afternoon_nap'),
  ('03258205-5c0c-44ef-b1c7-f3d857c6b00e', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 16:03:00', '2025-12-27 16:47:00', 44, 2, NULL, 'poor', 'other'),
  ('4845e69a-678d-4dc3-aa17-061b8ae26978', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 21:10:00', '2025-12-27 23:18:00', 128, 2, NULL, 'good', 'night'),
  ('ee5e089b-ffae-486c-9245-b84e8c43aaa7', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 22:57:00', '2025-12-27 23:55:00', 58, 2, NULL, 'good', 'night'),
  ('c5a4c204-8e95-449a-9c18-03221c54ea8e', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 10:10:00', '2025-12-27 10:58:00', 48, 2, NULL, 'normal', 'morning_nap'),
  ('9996ed71-723b-404d-9fd1-41a525891749', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-27 13:49:00', '2025-12-27 14:49:00', 60, 2, NULL, 'poor', 'afternoon_nap'),
  ('7b0d113d-e26f-4ffa-a375-6f5d66389510', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-28 01:20:00', '2025-12-28 03:21:00', 121, 2, NULL, 'good', 'night'),
  ('0b59088a-01be-4d60-a671-befde07ec5d5', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 01:23:00', '2025-12-28 03:08:00', 105, 2, NULL, 'poor', 'night'),
  ('8508a44c-3e49-4730-92dc-aed836862d28', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 08:37:00', '2025-12-28 09:26:00', 49, 2, NULL, 'good', 'morning_nap'),
  ('0465eeca-bd78-40a1-bb59-b0a930dc134f', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-28 14:30:00', '2025-12-28 15:36:00', 66, 2, NULL, 'normal', 'afternoon_nap'),
  ('cbf85211-5681-4d7f-aa60-d6ff4dbc3ad4', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-28 17:05:00', '2025-12-28 17:43:00', 38, 2, NULL, 'poor', 'other'),
  ('4287300d-64b8-42d1-a031-eb9961dcc585', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 19:10:00', '2025-12-28 21:28:00', 138, 2, NULL, 'poor', 'night'),
  ('717c3c29-5efd-4f77-8c5d-10c3d3cd730c', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 23:54:00', '2025-12-28 23:55:00', 15, 2, NULL, 'poor', 'night'),
  ('682fb0e5-0fa6-4ce0-9126-cab6d0a32ae4', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 10:22:00', '2025-12-28 11:24:00', 62, 2, NULL, 'normal', 'morning_nap'),
  ('4a7a21ef-b39d-4066-b71e-018ebd8f2ce6', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28 13:39:00', '2025-12-28 14:31:00', 52, 2, NULL, 'good', 'afternoon_nap');

INSERT INTO `growth_record` (`id`,`baby_id`,`recorded_by`,`record_date`,`weight_g`,`height_mm`,`head_mm`,`note`) VALUES
  ('2761a3c4-34ba-4eb8-a6ee-bcf505c0bb24', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-26', 3300, 500, 340, NULL),
  ('e3f5502d-a8a8-43da-9657-96aef83bebd7', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'fbcccfbd-a450-45d8-be43-e5770de80359', '2025-12-28', 3120, 500, NULL, '生理性体重下降');

INSERT INTO `health_record` (`id`,`baby_id`,`recorded_by`,`record_time`,`temperature`,`mood`,`allergy_symptoms`,`allergy_severity`,`medications`,`skin_care`,`note`) VALUES
  ('450f6b72-a8be-4930-a3ee-e3a80f7d90c3', 'eacb2495-4387-4cf1-93a3-be11c444e618', 'b42b4c6f-5a57-413d-815a-af16e790f4a1', '2025-12-27 10:00:00', 36.7, 2, NULL, NULL, NULL, NULL, NULL);

SET foreign_key_checks = 1;
