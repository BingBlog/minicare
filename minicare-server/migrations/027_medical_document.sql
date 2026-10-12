-- =============================================================
-- Migration 027: 就医记录「AI 识图建档」单据档案表（PRD-017 / TECH-035）
-- 日期: 2026-10-12
-- 说明:
--   1) 新增 medical_document：**每张单据图一行**，存 AI 视觉解析产出；
--      展示时按 doc_type 聚合成「单据卡片」（多页病历合并等，见 TECH-035 §5.2）。
--   2) parsed_json 稳定结构 = {docType, confidence, lowConfidenceFields, data:{…}}；
--      failed 行 parsed_json = NULL，error_note 存用户可读原因。
--   3) 纯新建表，无数据变更 → 对存量数据与运行中的服务均无破坏性影响。
--   4) 不加 FK：删除由 service 显式维护（与 medical_record 现行物理删除口径一致；
--      删除记录 / 删除图片时同步清理本表行）。
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

CREATE TABLE `medical_document` (
  `id`                CHAR(36)     NOT NULL                COMMENT '主键 UUID（应用层生成）',
  `medical_record_id` CHAR(36)     NOT NULL                COMMENT '归属就医记录 medical_record.id',
  `file_id`           VARCHAR(512) NOT NULL                COMMENT '图片 fileID（与 medical_record.photo_ids 元素一致）',
  `doc_type`          VARCHAR(32)  NOT NULL                COMMENT '单据类型 outpatient_record|prescription|lab_report|imaging_report|other',
  `status`            VARCHAR(16)  NOT NULL                COMMENT '识别状态 success|failed',
  `confidence`        VARCHAR(8)   NULL                    COMMENT '整体置信 high|low（failed 为 NULL）',
  `parsed_json`       JSON         NULL                    COMMENT '解析产出 {docType,confidence,lowConfidenceFields,data:{…}}',
  `error_note`        VARCHAR(255) NULL                    COMMENT '失败原因（用户可读短句；success 为 NULL）',
  `created_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_md_record_file` (`medical_record_id`, `file_id`),
  KEY `idx_md_record` (`medical_record_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='就医记录·单据 AI 解析档案（PRD-017）';

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('027_medical_document');
