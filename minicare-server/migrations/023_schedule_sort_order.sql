-- 023_schedule_sort_order.sql
-- PRD-009 追加：作息计划支持**拖拽排序**（用户自定义展示顺序）
--
-- 背景：022 建表后列表按 `execute_time` 强制升序，用户无法把项目排成自己习惯的顺序
--       （新增项追加在末尾会被下一次保存"弹"回时间序）。本次改为**展示顺序由用户拖拽决定**。
--
-- 设计要点：
--   ① `sort_order` 是**唯一**的展示顺序依据；`execute_time` 只表示"几点做"，不再决定排列。
--   ② 保存时按提交数组的**下标**整体重写 `sort_order`（0..n-1），不做增量 diff —— 与 022 的
--      "全量差集提交"语义一致，避免局部重排产生空洞或重复。
--   ③ 默认值 0：022 之前的历史行全部为 0，此时 `ORDER BY sort_order, execute_time` 自动
--      退化为"按时间升序"，与升级前表现一致（向后兼容）。
--
-- 前置：022=schedule_template，本迁移为 023

ALTER TABLE `schedule_template_item`
  ADD COLUMN `sort_order` INT NOT NULL DEFAULT 0
      COMMENT '展示顺序（拖拽调整，0..n-1）；同值时回退到 execute_time 升序' AFTER `enabled`,
  ADD KEY `idx_sched_baby_sort` (`baby_id`, `sort_order`);

-- schema_migrations 登记（migrate.sh 兜底）
INSERT IGNORE INTO `schema_migrations` (`version`) VALUES ('023_schedule_sort_order');
