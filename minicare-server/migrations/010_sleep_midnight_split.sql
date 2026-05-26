-- 010_sleep_midnight_split.sql
-- 将已存在的跨零点睡眠记录按零点拆分为多条记录
-- 每条记录的 start_time 和 end_time 在同一天内
--
-- 注意：timeline_record 中对应的 source_id 会因原记录删除而级联失效，
-- 拆分后的新记录会在应用层通过 TimelineService.upsertFromSource 重建。
-- 本迁移脚本仅处理数据拆分，timeline 会在下次查询时自动重建。

-- Step 1: 为每条跨零点记录插入拆分后的第一段（原 start_time → 次日 00:00:00）
INSERT INTO sleep_record (id, baby_id, recorded_by, start_time, end_time, status, duration_min, quality, sleep_period, note)
SELECT
  UUID() AS id,
  baby_id,
  recorded_by,
  start_time,
  CONCAT(DATE(DATE_ADD(start_time, INTERVAL 1 DAY)), ' 00:00:00') AS end_time_split,
  'ended' AS status,
  TIMESTAMPDIFF(MINUTE, start_time, CONCAT(DATE(DATE_ADD(start_time, INTERVAL 1 DAY)), ' 00:00:00')) AS duration_min,
  quality,
  sleep_period,
  note
FROM sleep_record
WHERE status = 'ended'
  AND end_time IS NOT NULL
  AND DATE(start_time) < DATE(end_time);

-- Step 2: 为每条跨零点记录插入拆分后的最后一段（end_time 当日 00:00:00 → 原 end_time）
INSERT INTO sleep_record (id, baby_id, recorded_by, start_time, end_time, status, duration_min, quality, sleep_period, note)
SELECT
  UUID() AS id,
  baby_id,
  recorded_by,
  CONCAT(DATE(end_time), ' 00:00:00') AS start_time_split,
  end_time,
  'ended' AS status,
  TIMESTAMPDIFF(MINUTE, CONCAT(DATE(end_time), ' 00:00:00'), end_time) AS duration_min,
  quality,
  CASE
    WHEN HOUR(end_time) >= 22 OR HOUR(end_time) < 6 THEN 'night'
    WHEN HOUR(end_time) < 12 THEN 'morning_nap'
    WHEN HOUR(end_time) < 18 THEN 'afternoon_nap'
    ELSE 'other'
  END AS sleep_period,
  NULL AS note
FROM sleep_record
WHERE status = 'ended'
  AND end_time IS NOT NULL
  AND DATE(start_time) < DATE(end_time);

-- Step 3: 删除原始的跨零点记录
DELETE FROM sleep_record
WHERE status = 'ended'
  AND end_time IS NOT NULL
  AND DATE(start_time) < DATE(end_time);
