-- 006_activity_type_varchar.sql
-- 将 activity_record.activity_type 从 TINYINT 改为 VARCHAR(20)，直接存储字符串枚举值。
-- 改造目的：未来新增活动类型只需修改代码枚举，无需任何数据迁移。
--
-- 步骤一：修改字段类型（MySQL 会将 TINYINT 1/2/3/4/5 自动转成字符串 '1'/'2'/'3'/'4'/'5'）
ALTER TABLE `activity_record`
  MODIFY COLUMN `activity_type` VARCHAR(20) NOT NULL
    COMMENT 'gross_motor=大运动练习 fine_motor=精细运动练习 edu_play=亲子早教互动 outdoor=户外活动 daily_care=日常护理 other=其他活动';

-- 步骤二：将原整数字符串迁移到新枚举值
--   原 1=bath       → daily_care（洗澡属于日常护理）
--   原 2=outdoor    → outdoor（保持不变）
--   原 3=play       → gross_motor（玩耍/运动活动 → 大运动练习）
--   原 4=tummy_time → gross_motor（俯趴练习 → 大运动练习）
--   原 5=other      → other（保持不变）
UPDATE `activity_record` SET `activity_type` = 'daily_care'   WHERE `activity_type` = '1';
UPDATE `activity_record` SET `activity_type` = 'outdoor'      WHERE `activity_type` = '2';
UPDATE `activity_record` SET `activity_type` = 'gross_motor'  WHERE `activity_type` = '3';
UPDATE `activity_record` SET `activity_type` = 'gross_motor'  WHERE `activity_type` = '4';
UPDATE `activity_record` SET `activity_type` = 'other'        WHERE `activity_type` = '5';
