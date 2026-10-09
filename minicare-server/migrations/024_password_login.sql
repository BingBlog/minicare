-- 024_password_login.sql
-- 用途：新增「手机号 + 密码」登录（TECH-016 §3）
-- 目标：MySQL 8 / CynosDB
--
-- 设计要点：
--   ① password_hash 为 bcrypt 串（bcryptjs v3，cost=10）；NULL = 未设置密码 → 不允许密码登录
--   ② sms_verified_at 记录「最近一次短信验证通过时间」，10 分钟内可免验证码设置/重置密码
--      （消除「刚用验证码登录完、进设置页还要再收一次短信」的荒谬体验）
--   ③ token_version（JWT 的 tv 声明）：改密时 +1，使该用户已签发的所有 JWT 立即失效。
--      JwtGuard 本来就要 SELECT 一次 user_account 确认用户存在，加这一列**零额外查询成本**。
--      默认 0 且校验时取 `payload.tv ?? 0` → **存量 token 继续有效，不会批量踢下线**。
--   ④ pwd_fail_count / pwd_locked_until：防爆破，不引入 Redis。
--      连续 5 次失败锁 10 分钟；成功即清零。**锁定只作用于密码登录端点**，
--      验证码登录不受影响（否则攻击者可恶意锁死他人账号）。
--
-- ⚠️ 编号说明：022 已被 PRD-009（schedule_template_item）预留、023 已被 PRD-006 §9 预留，
--    本文件取 024 以避开这两处预定号。
--
-- 前置：纯加列、无回填、无数据变更 → 对存量数据与运行中的服务均无破坏性影响。

ALTER TABLE `user_account`
  ADD COLUMN `password_hash`       VARCHAR(100)     NULL     COMMENT 'bcrypt 哈希；NULL=未设置密码'      AFTER `avatar_url`,
  ADD COLUMN `password_updated_at` DATETIME         NULL     COMMENT '密码最后修改时间（首页/设置页展示用）' AFTER `password_hash`,
  ADD COLUMN `sms_verified_at`     DATETIME         NULL     COMMENT '最近一次短信验证通过时间，10min 内可免验证码设置/重置密码',
  ADD COLUMN `pwd_fail_count`      TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '连续密码错误次数，登录成功即清零',
  ADD COLUMN `pwd_locked_until`    DATETIME         NULL     COMMENT '密码登录锁定截止时间（仅作用于密码登录端点）',
  ADD COLUMN `token_version`       INT UNSIGNED     NOT NULL DEFAULT 0 COMMENT 'JWT 版本号，改密后 +1 使已签发 token 全部失效';
