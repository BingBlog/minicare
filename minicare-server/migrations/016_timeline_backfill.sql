-- =============================================================
-- Migration 016: record_timeline 全量重刷回填（修复物化缺失 + 口径统一）
-- 日期: 2026-08-22
-- 背景:
--   1) timeline.service.ts loadMedicalPayload/loadGrowthPayload 存在日期拼接 bug
--      （mysql2 将 DATE 列解析为 JS Date，模板字符串产出非标准格式，
--      MySQL CAST 为 NULL → event_time NOT NULL 违反 → 物化写入静默失败），
--      导致服务层新增的 medical 记录不进物化表 → 记录列表页（feed 读物化表）不显示。
--   2) 按业务表全量重刷物化行（业务表是权威源），幂等（ON DUPLICATE KEY UPDATE），可重复执行。
--   3) medical summary_tags 对齐 TECH-002 §7 蓝图：存展示文案 [就诊类型, 医院, 诊断]。
--   4) medical event_time 统一为 visit_time 语义（与 family.getTodayRecords 一致）。
--   5) 追加 medication 段（013 建表后未回填历史数据）。
-- 说明: 与 009 相同模板，新增/修正段在文件内标注。
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

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
-- medical 【修正段】event_time 用 visit_time 语义；tags 存展示文案 [就诊类型, 医院, 诊断]
-- -------------------------------------------------------------
INSERT INTO `record_timeline` (
  baby_id, source_type, source_id, event_time, note,
  summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
  detail_json
)
SELECT
  r.baby_id, 'medical', r.id,
  CONCAT(r.visit_date, ' ', COALESCE(r.visit_time, '00:00'), ':00'),
  r.note,
  '医疗',
  CONCAT(
    '[',
    CONCAT_WS(',',
      IF(r.visit_type IS NOT NULL,
         JSON_QUOTE(CASE r.visit_type
           WHEN 'checkup' THEN '儿保检查'
           WHEN 'sick'    THEN '就诊记录'
           WHEN 'vaccine' THEN '疫苗接种'
           WHEN 'other'   THEN '其他检查'
           WHEN 'allergy' THEN '过敏原检测'
           WHEN 'blood'   THEN '血液检查'
           ELSE r.visit_type
         END),
         NULL),
      IF(r.hospital IS NOT NULL, JSON_QUOTE(r.hospital), NULL),
      IF(r.diagnosis IS NOT NULL, JSON_QUOTE(r.diagnosis), NULL)
    ),
    ']'
  ),
  NULL,
  NULL,
  'purple',
  0,
  JSON_OBJECT(
    'visit_date', r.visit_date,
    'visit_time', r.visit_time,
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

-- -------------------------------------------------------------
-- medication 【新增段】013 建表后历史数据未回填；软删记录不进物化
-- -------------------------------------------------------------
INSERT INTO `record_timeline` (
  baby_id, source_type, source_id, event_time, note,
  summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
  detail_json
)
SELECT
  r.baby_id, 'medication', r.id, r.record_time, r.note,
  '用药',
  CASE WHEN r.medication_name IS NOT NULL THEN JSON_ARRAY(r.medication_name) ELSE NULL END,
  r.dose,
  NULL,
  'purple',
  0,
  JSON_OBJECT(
    'medication_name', r.medication_name,
    'dose', r.dose
  )
FROM medication_record r
WHERE r.deleted_at IS NULL
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
-- 清理：物化表中业务表已不存在/已软删的 medication 行（孤儿行）
-- （medication 走软删除，历史曾出现软删/物理删后物化行未同步移除的残留）
-- -------------------------------------------------------------
DELETE t FROM `record_timeline` t
LEFT JOIN `medication_record` m
  ON t.source_type = 'medication' AND t.source_id = m.id AND m.deleted_at IS NULL
WHERE t.source_type = 'medication' AND m.id IS NULL;

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('016_timeline_backfill');
