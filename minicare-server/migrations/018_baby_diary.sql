-- 018_baby_diary.sql
-- 宝宝每日日记（M5 日记生成）
-- ⚠️ 编号说明：016=timeline_backfill，017=knowledge_base，本迁移为 018
-- 设计来源：docs/agent/tech/M05-diary.md §2

CREATE TABLE IF NOT EXISTS `baby_diary` (
  `id`          CHAR(36)      NOT NULL,
  `baby_id`     CHAR(36)      NOT NULL,
  `family_id`   CHAR(36)      NOT NULL,
  `diary_date`  DATE          NOT NULL COMMENT '日记归属日期',
  `author_id`   CHAR(36)      NOT NULL COMMENT '最后保存人（family_member.user_id）',
  `content`     TEXT          NOT NULL COMMENT '日记正文（温情叙事）',
  `photo_ids`   VARCHAR(1000) NULL COMMENT '逗号分隔 COS fileID 列表',
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_baby_date` (`baby_id`, `diary_date`),   -- 每天一篇
  KEY `idx_diary_family` (`family_id`, `diary_date`),
  KEY `idx_diary_baby_list` (`baby_id`, `diary_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='宝宝每日日记';

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('018_baby_diary');
