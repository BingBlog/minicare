-- ============================================================
-- 008_feeding_only（仅饮食记录，按阶段拆分）
-- 由 gen_mock_data_v2.py --feeding-only 生成，seed=42
-- 执行顺序：008_feeding_only 内编号升序；合并导入（于 minicare-server 下）:
--   bash migrations/mock_data/apply_008_feeding_only.sh | mysql ...
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';
SET foreign_key_checks = 0;

DELETE FROM `feeding_record` WHERE `baby_id` = 'eacb2495-4387-4cf1-93a3-be11c444e618';

