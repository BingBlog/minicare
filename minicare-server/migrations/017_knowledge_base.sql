-- 016_knowledge_base.sql
-- 敏宝知识条目库（M2 知识问答）
-- ⚠️ 编号说明：014/015 已被医疗记录迁移占用，知识库迁移从 016 开始
-- 设计来源：docs/agent/tech/M02-knowledge.md §2

CREATE TABLE IF NOT EXISTS `knowledge_base` (
  `id`             CHAR(36)      NOT NULL,
  `kb_id`          VARCHAR(32)   NOT NULL COMMENT '条目ID，如 KB-A1-001',
  `module`         VARCHAR(8)    NOT NULL COMMENT 'A-H 模块（导入脚本填 doc_id 前 8 位）',
  `title`          VARCHAR(200)  NOT NULL,
  `category`       VARCHAR(50)   NOT NULL COMMENT 'chunk_type: section/table/image/paragraph',
  `content`        MEDIUMTEXT    NOT NULL,
  `keywords`       VARCHAR(500)  NULL COMMENT '逗号分隔关键词（FULLTEXT 用）',
  `source`         VARCHAR(200)  NOT NULL COMMENT '公众号文章标题/指南名',
  `source_url`     VARCHAR(500)  NULL,
  `evidence_level` VARCHAR(20)   NULL COMMENT 'guideline/consensus/RCT/policy/edu',
  `region`         VARCHAR(8)    NULL COMMENT 'cn/intl/both',
  `risk_level`     VARCHAR(10)   NOT NULL DEFAULT 'low' COMMENT 'low/caution/emergency',
  `applicable_age` VARCHAR(16)   NULL,
  `embedding`      BLOB          NULL COMMENT 'float32 向量（离线生成）',
  `status`         TINYINT       NOT NULL DEFAULT 1 COMMENT '1=active 2=archived',
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_kb_id` (`kb_id`),
  KEY `idx_kb_category` (`category`), KEY `idx_kb_risk` (`risk_level`),
  FULLTEXT KEY `ft_kb_ngram` (`title`,`content`,`keywords`) WITH PARSER ngram
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='敏宝知识条目库';
