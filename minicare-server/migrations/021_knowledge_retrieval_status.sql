-- 021_knowledge_retrieval_status.sql
-- 用途：把「不可检索」从 content 前缀 hack 改为显式字段（PRD-008 D-06 / TECH-015 §6.2）
-- 目标：MySQL 8 / CynosDB
--
-- ⚠️⚠️ 本文件**只加列，不回填**。这是 expand-contract 五阶段执行序的第 1 步：
--
--    ① 只加列（本文件）            → 新列默认 enabled，旧前缀仍在 → agent-poc 的旧过滤继续有效
--    ② 平台双写（写字段 + 保留前缀） → 两侧过滤都能工作
--    ③ 回填字段（scripts/backfill-retrieval-status.py，前缀不动）
--    ④ agent-poc 切到 retrieval_status='enabled' 过滤
--    ⑤ 清理前缀（scripts/clean-review-prefix.py，**不可逆**）
--
--    顺序错任一环：要么 2 条 review 条目直接进检索，要么检索报错。
--    回填与清理**必须独立成脚本**，不能写在这里 —— 混进迁移会按①的时机自动执行，破坏时序。
--
-- 前置：已在 dev 库演练通过（见 TECH-015 §9.1）

ALTER TABLE `knowledge_base`
  ADD COLUMN `retrieval_status` VARCHAR(10) NOT NULL DEFAULT 'enabled'
      COMMENT 'enabled=可检索 / excluded=噪声块已屏蔽 / review=数字待复核' AFTER `risk_level`,
  ADD COLUMN `review_state` VARCHAR(12) NULL
      COMMENT 'pending/accepted/rejected/edited；仅 retrieval_status=review 时有值'
      AFTER `retrieval_status`,
  ADD KEY `idx_kb_retrieval_status` (`retrieval_status`);
