-- =============================================================
-- Migration 008: 全库 Schema 重设计（按长远最佳实践）
-- 日期: 2026-04-13
-- 前提: 开发验证阶段，未正式上线，dev 库可直接 DROP + CREATE
-- 覆盖问题:
--   1. feeding_record 一表四业务 → 拆为 4 主表 + 2 明细表
--   2. food_observation 缺少 last_intro_at / intro_count / observation_days / suspected 状态
--   3. diaper_record: diaper_type TINYINT → VARCHAR + color → stool_colors JSON 多选
--   4. growth_record: 补 record_time 字段
--   5. health_record: 删除重复的 mood 字段
--   6. 全库 TINYINT 枚举 → VARCHAR（gender / family_member.role / status / sleep.status）
--   7. 补全约束：family_member 手机号唯一
-- 执行说明:
--   ⚠️  先确认连接的是 minicare_dev 开发库，不要在生产库执行！
--   执行前先用 SELECT 检查重复数据，避免唯一约束冲突。
-- =============================================================

USE `minicare_dev`;   -- ← 安全护栏：强制限定在开发库

SET NAMES utf8mb4;
SET time_zone = '+08:00';
SET FOREIGN_KEY_CHECKS = 0;   -- 暂停外键检查，允许不按依赖顺序 DROP/CREATE

-- =============================================================
-- 第一部分：删除旧表（feeding_record 及 food_observation）
-- =============================================================

DROP TABLE IF EXISTS `feeding_record`;    -- 旧的一表四业务大表，全量废弃
DROP TABLE IF EXISTS `food_observation`;  -- 重建，含新字段和四态状态

-- =============================================================
-- 第二部分：新建饮食记录 4 张主表 + 2 张明细表
-- =============================================================

-- ------------------------------------------------------------
-- 2-1. 母乳记录表
-- ------------------------------------------------------------
CREATE TABLE `feeding_breast_record` (
  `id`           CHAR(36)          NOT NULL,
  `baby_id`      CHAR(36)          NOT NULL,
  `recorded_by`  CHAR(36)          NOT NULL,
  `record_time`  DATETIME          NOT NULL  COMMENT '哺乳开始时间',
  `breast_side`  VARCHAR(10)       NOT NULL  COMMENT 'left=左侧 right=右侧 both=双侧',
  `duration_min` SMALLINT UNSIGNED NULL      COMMENT '哺乳时长（分钟，0~120）',
  `note`         TEXT              NULL,
  `created_at`   DATETIME          NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME          NOT NULL  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`      VARCHAR(256)      NULL      COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_breast_baby_time` (`baby_id`, `record_time`),
  KEY `idx_breast_recorder`  (`recorded_by`),
  CONSTRAINT `fk_fbr_baby`     FOREIGN KEY (`baby_id`)     REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_fbr_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='母乳记录';

-- ------------------------------------------------------------
-- 2-2. 配方奶主记录表
-- ------------------------------------------------------------
CREATE TABLE `feeding_formula_record` (
  `id`           CHAR(36)          NOT NULL,
  `baby_id`      CHAR(36)          NOT NULL,
  `recorded_by`  CHAR(36)          NOT NULL,
  `record_time`  DATETIME          NOT NULL  COMMENT '喂养开始时间',
  `end_time`     DATETIME          NULL      COMMENT '喂养结束时间（可选）',
  `duration_min` SMALLINT UNSIGNED NULL      COMMENT '喂养时长（分钟）',
  `formula_ml`   SMALLINT UNSIGNED NULL      COMMENT '奶量（毫升，0~500）',
  `note`         TEXT              NULL,
  `created_at`   DATETIME          NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME          NOT NULL  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`      VARCHAR(256)      NULL      COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_formula_baby_time` (`baby_id`, `record_time`),
  KEY `idx_formula_recorder`  (`recorded_by`),
  CONSTRAINT `fk_ffr_baby`     FOREIGN KEY (`baby_id`)     REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_ffr_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='配方奶记录主表（奶粉配比见 feeding_formula_mix）';

-- ------------------------------------------------------------
-- 2-3. 配方奶配比明细表（每奶粉类型一行）
--      原 milk_types JSON + milk_scoops JSON 改为关联行
--      DECIMAL(4,2) 精确存储 0.25/0.33/0.50 等分数勺数
--      随主记录 CASCADE 删除
-- ------------------------------------------------------------
CREATE TABLE `feeding_formula_mix` (
  `id`        CHAR(36)     NOT NULL,
  `record_id` CHAR(36)     NOT NULL  COMMENT '关联 feeding_formula_record.id',
  `milk_type` VARCHAR(20)  NOT NULL  COMMENT 'aa=氨基酸 eh_no_lactose=深度水解无乳糖 eh_lactose=深度水解含乳糖 ph=适度水解 std=普通奶粉',
  `scoops`    DECIMAL(4,2) NOT NULL  COMMENT '勺数（DECIMAL 精确存储小数，避免 JSON 浮点精度问题）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mix_record_type` (`record_id`, `milk_type`),
  KEY `idx_mix_milk_type`         (`milk_type`),
  CONSTRAINT `fk_ffm_record` FOREIGN KEY (`record_id`)
    REFERENCES `feeding_formula_record` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='配方奶配比明细（每行一种奶粉，随主记录级联删除）';

-- ------------------------------------------------------------
-- 2-4. 辅食主记录表
-- ------------------------------------------------------------
CREATE TABLE `feeding_food_record` (
  `id`          CHAR(36)     NOT NULL,
  `baby_id`     CHAR(36)     NOT NULL,
  `recorded_by` CHAR(36)     NOT NULL,
  `record_time` DATETIME     NOT NULL  COMMENT '辅食记录时间',
  `note`        TEXT         NULL,
  `created_at`  DATETIME     NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`     VARCHAR(256) NULL      COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_food_baby_time` (`baby_id`, `record_time`),
  KEY `idx_food_recorder`  (`recorded_by`),
  CONSTRAINT `fk_ffd_baby`     FOREIGN KEY (`baby_id`)     REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_ffd_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='辅食记录主表（食物列表见 feeding_food_item）';

-- ------------------------------------------------------------
-- 2-5. 辅食食物明细表（每种食物一行）
--      原 complementary_food VARCHAR(100) 多值字符串改为关联行
--      food_name 独立成行后可 JOIN food_observation 查过敏状态
--      DECIMAL(6,1) 支持 0.5g 精度
--      随主记录 CASCADE 删除
-- ------------------------------------------------------------
CREATE TABLE `feeding_food_item` (
  `id`          CHAR(36)     NOT NULL,
  `record_id`   CHAR(36)     NOT NULL  COMMENT '关联 feeding_food_record.id',
  `food_name`   VARCHAR(100) NOT NULL  COMMENT '食物名称',
  `amount_g`    DECIMAL(6,1) NULL      COMMENT '进食量（克，支持 0.5g 精度；NULL=未记录）',
  `amount_note` VARCHAR(50)  NULL      COMMENT '描述性量纲（如"半碗""一勺"，无法精确克数时填写）',
  PRIMARY KEY (`id`),
  KEY `idx_food_item_record` (`record_id`),
  KEY `idx_food_item_name`   (`food_name`),
  CONSTRAINT `fk_ffi_record` FOREIGN KEY (`record_id`)
    REFERENCES `feeding_food_record` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='辅食食物明细（每行一种食物，food_name 可软关联 food_observation）';

-- ------------------------------------------------------------
-- 2-6. 营养素记录表
--      supplement_items 保留 JSON：营养素种类用户可自由扩展
--      （支持"其他"自定义），是真正无固定结构的列表
-- ------------------------------------------------------------
CREATE TABLE `feeding_supplement_record` (
  `id`               CHAR(36)     NOT NULL,
  `baby_id`          CHAR(36)     NOT NULL,
  `recorded_by`      CHAR(36)     NOT NULL,
  `record_time`      DATETIME     NOT NULL  COMMENT '营养素记录时间',
  `supplement_items` JSON         NOT NULL  COMMENT '[{"key":"vitD","label":"维生素D","dose":"400","unit":"IU"}]',
  `note`             TEXT         NULL,
  `created_at`       DATETIME     NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NOT NULL  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`          VARCHAR(256) NULL      COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  KEY `idx_supplement_baby_time` (`baby_id`, `record_time`),
  KEY `idx_supplement_recorder`  (`recorded_by`),
  CONSTRAINT `fk_fsr_baby`     FOREIGN KEY (`baby_id`)     REFERENCES `baby_profile` (`id`),
  CONSTRAINT `fk_fsr_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `user_account` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='营养素记录';

-- =============================================================
-- 第三部分：重建 food_observation（补全缺失字段 + 四态状态机）
-- =============================================================

CREATE TABLE `food_observation` (
  `id`               CHAR(36)          NOT NULL,
  `baby_id`          CHAR(36)          NOT NULL,
  `food_name`        VARCHAR(100)      NOT NULL  COMMENT '食物名称（与 feeding_food_item.food_name 软关联）',
  `first_intro_at`   DATE              NOT NULL  COMMENT '首次引入日期',
  `last_intro_at`    DATE              NULL      COMMENT '最近一次引入日期（用于判断第几次引入）',
  `intro_count`      SMALLINT UNSIGNED NOT NULL  DEFAULT 1  COMMENT '累计引入次数',
  `observation_days` TINYINT UNSIGNED  NOT NULL  DEFAULT 5  COMMENT '观察期天数（用户可调，3~7 天）',
  `status`           VARCHAR(20)       NOT NULL  DEFAULT 'observing'
                                                 COMMENT 'observing=观察期中 safe=已耐受 suspected=疑似过敏 allergic=确认过敏',
  `reaction_note`    TEXT              NULL      COMMENT '过敏反应描述',
  `created_at`       DATETIME          NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME          NOT NULL  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `_openid`          VARCHAR(256)      NULL      COMMENT '用于权限管理，请不要删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_food_obs_baby_food`  (`baby_id`, `food_name`),
  KEY `idx_food_obs_baby_status`      (`baby_id`, `status`),
  KEY `idx_food_obs_status_intro`     (`baby_id`, `status`, `first_intro_at`),
  CONSTRAINT `fk_fo_baby` FOREIGN KEY (`baby_id`) REFERENCES `baby_profile` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='辅食新食物观察期状态机（四态：observing/safe/suspected/allergic）';

-- =============================================================
-- 第四部分：修改现有表（不重建，仅 ALTER）
-- =============================================================

-- ------------------------------------------------------------
-- 4-1. diaper_record：
--       diaper_type TINYINT → VARCHAR(10)，移除废弃的 dry(4)
--       color VARCHAR(20) → 重命名为 stool_colors JSON（大便颜色多选）
--       poop_type 长度收紧为 VARCHAR(20)
-- ------------------------------------------------------------

-- Step 1: 将 diaper_type 改为 VARCHAR（MySQL 自动将 '1'/'2'/'3' 转为字符串）
ALTER TABLE `diaper_record`
  MODIFY COLUMN `diaper_type` VARCHAR(10) NOT NULL
    COMMENT 'wet=嘘嘘 dirty=臭臭 mixed=臭臭+嘘嘘';

-- Step 2: 将数字字符串迁移到业务枚举值
UPDATE `diaper_record` SET `diaper_type` = 'wet'   WHERE `diaper_type` = '1';
UPDATE `diaper_record` SET `diaper_type` = 'dirty' WHERE `diaper_type` = '2';
UPDATE `diaper_record` SET `diaper_type` = 'mixed' WHERE `diaper_type` = '3';
-- 废弃的 dry(4) 降级为 mixed
UPDATE `diaper_record` SET `diaper_type` = 'mixed' WHERE `diaper_type` = '4';

-- Step 3: color 单值文本 → stool_colors JSON 多选数组
--         由于无法直接 RENAME + CHANGE TYPE，采用：ADD 新列 → 迁移数据 → DROP 旧列
ALTER TABLE `diaper_record`
  ADD COLUMN `stool_colors` JSON NULL
    COMMENT '大便颜色多选，如 ["yellow","brown","green"]'
    AFTER `color`;

-- 迁移存量 color 数据（旧数据为单一颜色字符串，包装成单元素 JSON 数组）
UPDATE `diaper_record`
  SET `stool_colors` = JSON_ARRAY(`color`)
  WHERE `color` IS NOT NULL AND `color` != '';

-- 删除旧 color 列
ALTER TABLE `diaper_record`
  DROP COLUMN `color`;

-- Step 4: poop_type 长度收紧
ALTER TABLE `diaper_record`
  MODIFY COLUMN `poop_type` VARCHAR(20) NULL
    COMMENT 'normal=正常软便 loose=稀便 watery=水样便 hard=干硬粒 bloody=血丝便';

-- ------------------------------------------------------------
-- 4-2. growth_record：补 record_time 字段（已提前存在则跳过）
-- ------------------------------------------------------------
-- record_time 已在之前某次开发中手动添加，此处用条件添加保证幂等
ALTER TABLE `growth_record`
  MODIFY COLUMN `record_time` TIME NULL
    COMMENT '测量时间（可选，如 09:30:00）';

-- ------------------------------------------------------------
-- 4-3. health_record：删除重复的 mood 字段
--       health_record 职责收窄为：体温 + 过敏反应 + 用药 + 护理
--       情绪状态统一由 symptom_record.mood 记录
-- ------------------------------------------------------------
ALTER TABLE `health_record`
  DROP COLUMN `mood`;

-- ------------------------------------------------------------
-- 4-4. 全库 TINYINT 枚举 → VARCHAR（一次性统一）
-- ------------------------------------------------------------

-- baby_profile.gender
ALTER TABLE `baby_profile`
  MODIFY COLUMN `gender` VARCHAR(10) NULL
    COMMENT 'unknown=未知 male=男 female=女';

UPDATE `baby_profile` SET `gender` = 'unknown' WHERE `gender` = '0';
UPDATE `baby_profile` SET `gender` = 'male'    WHERE `gender` = '1';
UPDATE `baby_profile` SET `gender` = 'female'  WHERE `gender` = '2';

-- family_member.role
ALTER TABLE `family_member`
  MODIFY COLUMN `role` VARCHAR(10) NOT NULL DEFAULT 'member'
    COMMENT 'owner=创建者 member=普通成员';

UPDATE `family_member` SET `role` = 'owner'  WHERE `role` = '1';
UPDATE `family_member` SET `role` = 'member' WHERE `role` = '2';

-- family_member.status
ALTER TABLE `family_member`
  MODIFY COLUMN `status` VARCHAR(10) NOT NULL DEFAULT 'pending'
    COMMENT 'pending=待接受 active=已激活 left=已离开';

UPDATE `family_member` SET `status` = 'pending' WHERE `status` = '1';
UPDATE `family_member` SET `status` = 'active'  WHERE `status` = '2';
UPDATE `family_member` SET `status` = 'left'    WHERE `status` = '3';

-- sleep_record.status
ALTER TABLE `sleep_record`
  MODIFY COLUMN `status` VARCHAR(10) NOT NULL DEFAULT 'ongoing'
    COMMENT 'ongoing=进行中 ended=已结束';

UPDATE `sleep_record` SET `status` = 'ongoing' WHERE `status` = '1';
UPDATE `sleep_record` SET `status` = 'ended'   WHERE `status` = '2';

-- ------------------------------------------------------------
-- 4-5. family_member：补充 invite_phone 唯一约束
--       ⚠️  执行前先检查是否有重复数据：
--       SELECT family_id, invite_phone, COUNT(*)
--       FROM family_member
--       WHERE invite_phone IS NOT NULL
--       GROUP BY family_id, invite_phone
--       HAVING COUNT(*) > 1;
-- ------------------------------------------------------------
ALTER TABLE `family_member`
  ADD UNIQUE KEY `uk_family_invite_phone` (`family_id`, `invite_phone`);

-- =============================================================
-- 第五部分：恢复外键检查 + 记录迁移版本
-- =============================================================

SET FOREIGN_KEY_CHECKS = 1;

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('008_schema_redesign');
