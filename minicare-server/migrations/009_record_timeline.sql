-- =============================================================
-- Migration 009: 新增 record_timeline 物化表（Feed 最终形态）
-- 日期: 2026-05-23
-- 说明:
--   1) 新建 record_timeline（统一时间线查询表）
--   2) 回填现有 8 类记录数据
--   3) 后续新写入可通过服务层双写或触发器保持同步
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

CREATE TABLE IF NOT EXISTS `record_timeline` (
  `timeline_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `baby_id` CHAR(36) NOT NULL,
  `source_type` VARCHAR(20) NOT NULL COMMENT 'feeding/sleep/diaper/activity/health/growth/medical/symptom',
  `source_id` CHAR(36) NOT NULL COMMENT '原业务表主键',
  `event_time` DATETIME NOT NULL,
  `note` TEXT NULL,

  `summary_title` VARCHAR(64) NULL,
  `summary_tags_json` JSON NULL,
  `summary_value` VARCHAR(32) NULL,
  `summary_unit` VARCHAR(16) NULL,
  `summary_theme` VARCHAR(16) NULL,
  `summary_active` TINYINT(1) NOT NULL DEFAULT 0,

  `detail_json` JSON NULL,

  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`timeline_id`),
  UNIQUE KEY `uk_timeline_source` (`source_type`, `source_id`),
  KEY `idx_timeline_baby_time_id` (`baby_id`, `event_time`, `timeline_id`),
  KEY `idx_timeline_baby_type_time_id` (`baby_id`, `source_type`, `event_time`, `timeline_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='记录时间线物化表';

-- -------------------------------------------------------------
-- feeding: breast
-- -------------------------------------------------------------
INSERT INTO `record_timeline` (
  baby_id, source_type, source_id, event_time, note,
  summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
  detail_json
)
SELECT
  r.baby_id, 'feeding', r.id, r.record_time, r.note,
  '母乳',
  JSON_ARRAY(CASE r.breast_side WHEN 'left' THEN '左乳' WHEN 'right' THEN '右乳' ELSE '双侧' END),
  CASE WHEN r.duration_min IS NOT NULL THEN CAST(r.duration_min AS CHAR) ELSE NULL END,
  NULL,
  'pink',
  0,
  JSON_OBJECT(
    'feed_type', 'breast',
    'breast_side', r.breast_side,
    'duration_min', r.duration_min
  )
FROM feeding_breast_record r
ON DUPLICATE KEY UPDATE
  event_time = VALUES(event_time),
  note = VALUES(note),
  summary_title = VALUES(summary_title),
  summary_tags_json = VALUES(summary_tags_json),
  summary_value = VALUES(summary_value),
  summary_unit = VALUES(summary_unit),
  summary_theme = VALUES(summary_theme),
  summary_active = VALUES(summary_active),
  detail_json = VALUES(detail_json);

-- -------------------------------------------------------------
-- feeding: formula
-- -------------------------------------------------------------
INSERT INTO `record_timeline` (
  baby_id, source_type, source_id, event_time, note,
  summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
  detail_json
)
SELECT
  r.baby_id, 'feeding', r.id, r.record_time, r.note,
  '配方奶',
  NULL,
  CASE WHEN r.formula_ml IS NOT NULL THEN CAST(r.formula_ml AS CHAR) ELSE NULL END,
  CASE WHEN r.formula_ml IS NOT NULL THEN 'ml' ELSE NULL END,
  'pink',
  0,
  JSON_OBJECT(
    'feed_type', 'formula',
    'formula_ml', r.formula_ml,
    'milk_types', (
      SELECT JSON_ARRAYAGG(m.milk_type)
      FROM feeding_formula_mix m
      WHERE m.record_id = r.id
    ),
    'milk_scoops', (
      SELECT JSON_OBJECTAGG(m.milk_type, m.scoops)
      FROM feeding_formula_mix m
      WHERE m.record_id = r.id
    )
  )
FROM feeding_formula_record r
ON DUPLICATE KEY UPDATE
  event_time = VALUES(event_time),
  note = VALUES(note),
  summary_title = VALUES(summary_title),
  summary_tags_json = VALUES(summary_tags_json),
  summary_value = VALUES(summary_value),
  summary_unit = VALUES(summary_unit),
  summary_theme = VALUES(summary_theme),
  summary_active = VALUES(summary_active),
  detail_json = VALUES(detail_json);

-- -------------------------------------------------------------
-- feeding: food
-- -------------------------------------------------------------
INSERT INTO `record_timeline` (
  baby_id, source_type, source_id, event_time, note,
  summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
  detail_json
)
SELECT
  r.baby_id, 'feeding', r.id, r.record_time, r.note,
  '辅食',
  JSON_ARRAY(
    (
      SELECT GROUP_CONCAT(fi.food_name SEPARATOR '、')
      FROM feeding_food_item fi
      WHERE fi.record_id = r.id
    )
  ),
  CASE
    WHEN (
      SELECT MAX(fi.amount_g)
      FROM feeding_food_item fi
      WHERE fi.record_id = r.id
    ) IS NOT NULL
      THEN CAST((
        SELECT MAX(fi.amount_g)
        FROM feeding_food_item fi
        WHERE fi.record_id = r.id
      ) AS CHAR)
    ELSE NULL
  END,
  CASE
    WHEN (
      SELECT MAX(fi.amount_g)
      FROM feeding_food_item fi
      WHERE fi.record_id = r.id
    ) IS NOT NULL THEN 'g'
    ELSE NULL
  END,
  'warm',
  0,
  JSON_OBJECT(
    'feed_type', 'complementary',
    'complementary_food', (
      SELECT GROUP_CONCAT(fi.food_name SEPARATOR '、')
      FROM feeding_food_item fi
      WHERE fi.record_id = r.id
    ),
    'amount_g', (
      SELECT MAX(fi.amount_g)
      FROM feeding_food_item fi
      WHERE fi.record_id = r.id
    )
  )
FROM feeding_food_record r
ON DUPLICATE KEY UPDATE
  event_time = VALUES(event_time),
  note = VALUES(note),
  summary_title = VALUES(summary_title),
  summary_tags_json = VALUES(summary_tags_json),
  summary_value = VALUES(summary_value),
  summary_unit = VALUES(summary_unit),
  summary_theme = VALUES(summary_theme),
  summary_active = VALUES(summary_active),
  detail_json = VALUES(detail_json);

-- -------------------------------------------------------------
-- feeding: supplement
-- -------------------------------------------------------------
INSERT INTO `record_timeline` (
  baby_id, source_type, source_id, event_time, note,
  summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
  detail_json
)
SELECT
  r.baby_id, 'feeding', r.id, r.record_time, r.note,
  '营养素',
  NULL,
  NULL,
  NULL,
  'purple',
  0,
  JSON_OBJECT(
    'feed_type', 'supplement',
    'complementary_food', '营养素',
    'supplement_items', r.supplement_items
  )
FROM feeding_supplement_record r
ON DUPLICATE KEY UPDATE
  event_time = VALUES(event_time),
  note = VALUES(note),
  summary_title = VALUES(summary_title),
  summary_tags_json = VALUES(summary_tags_json),
  summary_value = VALUES(summary_value),
  summary_unit = VALUES(summary_unit),
  summary_theme = VALUES(summary_theme),
  summary_active = VALUES(summary_active),
  detail_json = VALUES(detail_json);

-- -------------------------------------------------------------
-- sleep
-- -------------------------------------------------------------
INSERT INTO `record_timeline` (
  baby_id, source_type, source_id, event_time, note,
  summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
  detail_json
)
SELECT
  r.baby_id, 'sleep', r.id, r.start_time, r.note,
  CASE WHEN r.status = 'ongoing' THEN '睡眠中' ELSE '睡眠' END,
  CASE WHEN r.status = 'ongoing' THEN JSON_ARRAY('进行中') ELSE NULL END,
  CASE WHEN r.duration_min IS NOT NULL THEN CAST(r.duration_min AS CHAR) ELSE NULL END,
  NULL,
  CASE WHEN r.status = 'ongoing' THEN 'pink' ELSE 'warm' END,
  CASE WHEN r.status = 'ongoing' THEN 1 ELSE 0 END,
  JSON_OBJECT(
    'status', r.status,
    'duration_min', r.duration_min,
    'sleep_period', r.sleep_period,
    'quality', r.quality,
    'start_time', r.start_time,
    'end_time', r.end_time
  )
FROM sleep_record r
ON DUPLICATE KEY UPDATE
  event_time = VALUES(event_time),
  note = VALUES(note),
  summary_title = VALUES(summary_title),
  summary_tags_json = VALUES(summary_tags_json),
  summary_value = VALUES(summary_value),
  summary_unit = VALUES(summary_unit),
  summary_theme = VALUES(summary_theme),
  summary_active = VALUES(summary_active),
  detail_json = VALUES(detail_json);

-- -------------------------------------------------------------
-- diaper
-- -------------------------------------------------------------
INSERT INTO `record_timeline` (
  baby_id, source_type, source_id, event_time, note,
  summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
  detail_json
)
SELECT
  r.baby_id, 'diaper', r.id, r.record_time, r.note,
  '换尿布',
  CASE
    WHEN r.diaper_type = 'mixed' THEN JSON_ARRAY('嘘嘘', '臭臭')
    WHEN r.diaper_type = 'wet' THEN JSON_ARRAY('嘘嘘')
    WHEN r.diaper_type = 'dirty' THEN JSON_ARRAY('臭臭')
    WHEN r.diaper_type = 'dry' THEN JSON_ARRAY('干净')
    ELSE NULL
  END,
  NULL,
  NULL,
  'warm',
  0,
  JSON_OBJECT(
    'diaper_type', r.diaper_type,
    'poop_type', r.poop_type,
    'diaper_count', r.diaper_count
  )
FROM diaper_record r
ON DUPLICATE KEY UPDATE
  event_time = VALUES(event_time),
  note = VALUES(note),
  summary_title = VALUES(summary_title),
  summary_tags_json = VALUES(summary_tags_json),
  summary_value = VALUES(summary_value),
  summary_unit = VALUES(summary_unit),
  summary_theme = VALUES(summary_theme),
  summary_active = VALUES(summary_active),
  detail_json = VALUES(detail_json);

-- -------------------------------------------------------------
-- activity
-- -------------------------------------------------------------
INSERT INTO `record_timeline` (
  baby_id, source_type, source_id, event_time, note,
  summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
  detail_json
)
SELECT
  r.baby_id, 'activity', r.id, r.record_time, r.note,
  '活动',
  NULL,
  CASE WHEN r.duration_min IS NOT NULL THEN CAST(r.duration_min AS CHAR) ELSE NULL END,
  NULL,
  'warm',
  0,
  JSON_OBJECT(
    'activity_type', r.activity_type,
    'duration_min', r.duration_min,
    'intensity', r.intensity
  )
FROM activity_record r
ON DUPLICATE KEY UPDATE
  event_time = VALUES(event_time),
  note = VALUES(note),
  summary_title = VALUES(summary_title),
  summary_tags_json = VALUES(summary_tags_json),
  summary_value = VALUES(summary_value),
  summary_unit = VALUES(summary_unit),
  summary_theme = VALUES(summary_theme),
  summary_active = VALUES(summary_active),
  detail_json = VALUES(detail_json);

-- -------------------------------------------------------------
-- health
-- -------------------------------------------------------------
INSERT INTO `record_timeline` (
  baby_id, source_type, source_id, event_time, note,
  summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
  detail_json
)
SELECT
  r.baby_id, 'health', r.id, r.record_time, r.note,
  '健康',
  NULL,
  CASE WHEN r.temperature IS NOT NULL THEN CAST(r.temperature AS CHAR) ELSE NULL END,
  CASE WHEN r.temperature IS NOT NULL THEN '℃' ELSE NULL END,
  CASE WHEN r.temperature >= 37.5 THEN 'fever' ELSE 'pink' END,
  CASE WHEN r.temperature >= 37.5 THEN 1 ELSE 0 END,
  JSON_OBJECT(
    'temperature', r.temperature,
    'allergy_symptoms', r.allergy_symptoms,
    'medications', r.medications
  )
FROM health_record r
ON DUPLICATE KEY UPDATE
  event_time = VALUES(event_time),
  note = VALUES(note),
  summary_title = VALUES(summary_title),
  summary_tags_json = VALUES(summary_tags_json),
  summary_value = VALUES(summary_value),
  summary_unit = VALUES(summary_unit),
  summary_theme = VALUES(summary_theme),
  summary_active = VALUES(summary_active),
  detail_json = VALUES(detail_json);

-- -------------------------------------------------------------
-- symptom
-- -------------------------------------------------------------
INSERT INTO `record_timeline` (
  baby_id, source_type, source_id, event_time, note,
  summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
  detail_json
)
SELECT
  r.baby_id, 'symptom', r.id, r.record_time, r.note,
  '表现',
  JSON_ARRAY(r.mood, r.spirit),
  NULL,
  NULL,
  'purple',
  0,
  JSON_OBJECT(
    'mood', r.mood,
    'spirit', r.spirit,
    'symptoms', r.symptoms
  )
FROM symptom_record r
ON DUPLICATE KEY UPDATE
  event_time = VALUES(event_time),
  note = VALUES(note),
  summary_title = VALUES(summary_title),
  summary_tags_json = VALUES(summary_tags_json),
  summary_value = VALUES(summary_value),
  summary_unit = VALUES(summary_unit),
  summary_theme = VALUES(summary_theme),
  summary_active = VALUES(summary_active),
  detail_json = VALUES(detail_json);

-- -------------------------------------------------------------
-- growth
-- -------------------------------------------------------------
INSERT INTO `record_timeline` (
  baby_id, source_type, source_id, event_time, note,
  summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
  detail_json
)
SELECT
  r.baby_id, 'growth', r.id, CONCAT(r.record_date, ' 00:00:00'), r.note,
  '生长',
  JSON_ARRAY(
    CASE WHEN r.height_mm IS NOT NULL THEN CONCAT(ROUND(r.height_mm / 10, 1), 'cm') ELSE NULL END,
    CASE WHEN r.weight_g IS NOT NULL THEN CONCAT(ROUND(r.weight_g / 1000, 2), 'kg') ELSE NULL END
  ),
  NULL,
  NULL,
  'purple',
  0,
  JSON_OBJECT(
    'record_date', r.record_date,
    'height_mm', r.height_mm,
    'weight_g', r.weight_g,
    'head_mm', r.head_mm
  )
FROM growth_record r
ON DUPLICATE KEY UPDATE
  event_time = VALUES(event_time),
  note = VALUES(note),
  summary_title = VALUES(summary_title),
  summary_tags_json = VALUES(summary_tags_json),
  summary_value = VALUES(summary_value),
  summary_unit = VALUES(summary_unit),
  summary_theme = VALUES(summary_theme),
  summary_active = VALUES(summary_active),
  detail_json = VALUES(detail_json);

-- -------------------------------------------------------------
-- medical
-- -------------------------------------------------------------
INSERT INTO `record_timeline` (
  baby_id, source_type, source_id, event_time, note,
  summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
  detail_json
)
SELECT
  r.baby_id, 'medical', r.id, CONCAT(r.visit_date, ' 00:00:00'), r.note,
  '医疗',
  CASE WHEN r.hospital IS NOT NULL THEN JSON_ARRAY(r.hospital) ELSE NULL END,
  NULL,
  NULL,
  'purple',
  0,
  JSON_OBJECT(
    'visit_date', r.visit_date,
    'visit_type', r.visit_type,
    'hospital', r.hospital,
    'diagnosis', r.diagnosis
  )
FROM medical_record r
ON DUPLICATE KEY UPDATE
  event_time = VALUES(event_time),
  note = VALUES(note),
  summary_title = VALUES(summary_title),
  summary_tags_json = VALUES(summary_tags_json),
  summary_value = VALUES(summary_value),
  summary_unit = VALUES(summary_unit),
  summary_theme = VALUES(summary_theme),
  summary_active = VALUES(summary_active),
  detail_json = VALUES(detail_json);

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('009_record_timeline');
