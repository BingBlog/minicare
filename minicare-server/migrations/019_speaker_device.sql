-- 019_speaker_device.sql
-- 音箱设备绑定（音箱对话渠道「小宝小宝」，TECH-008）
-- ⚠️ 编号说明：017=knowledge_base，018=baby_diary，本迁移为 019
-- 设计来源：docs/tech/TECH-008-speaker-channel.md §2

-- ── 1. 音箱设备表 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `speaker_device` (
  `id`                   CHAR(36)     NOT NULL PRIMARY KEY,          -- UUID
  `family_id`            CHAR(36)     NOT NULL,                      -- 绑定家庭
  `device_name`          VARCHAR(64)  NOT NULL DEFAULT '小宝音箱',    -- 设备名称
  `device_type`          VARCHAR(32)  NOT NULL DEFAULT 'esp32-s3',    -- 硬件型号（esp32-s3-box-3）
  `mac_address`          VARCHAR(32)  NULL,                           -- 设备 MAC（xiaozhi Device-Id）
  `client_id`            VARCHAR(64)  NULL,                           -- xiaozhi Client-Id（重装固件重置）
  `token_hash`           VARCHAR(128) NOT NULL,                       -- device token 哈希 sha256（不存明文）
  `status`               VARCHAR(16)  NOT NULL DEFAULT 'active',      -- active / revoked
  `bound_by`             CHAR(36)     NOT NULL,                       -- 绑定操作人（管理员 user_id）
  `bound_at`             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at`         DATETIME     NULL,                           -- 最近一次会话
  `last_conversation_id` CHAR(36)     NULL,                           -- 最近会话线程（跨唤醒延续）
  `created_at`           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at`           DATETIME     NULL,
  KEY `idx_device_family` (`family_id`, `status`),
  KEY `idx_device_mac` (`mac_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='音箱设备绑定';

-- ── 2. 音箱绑定码表（每家庭同一时刻仅 1 条 pending）──────────
CREATE TABLE IF NOT EXISTS `speaker_binding_code` (
  `id`          CHAR(36)    NOT NULL PRIMARY KEY,
  `family_id`   CHAR(36)    NOT NULL,
  `code`        CHAR(6)     NOT NULL,                          -- 6 位数字
  `status`      VARCHAR(16) NOT NULL DEFAULT 'pending',        -- pending / used / revoked
  `created_by`  CHAR(36)    NOT NULL,                          -- 管理员 user_id
  `created_at`  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `used_at`     DATETIME    NULL,
  `used_device` CHAR(36)    NULL,                              -- 绑定成功的设备 id
  KEY `idx_code_family` (`family_id`, `status`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='音箱绑定码（永久有效）';

INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('019_speaker_device');
