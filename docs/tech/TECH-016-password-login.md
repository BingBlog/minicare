# 技术方案：密码登录（minicare-mp 新增「手机号 + 密码」登录）

> 关联需求：`docs/business/MVP-PRD.md` §「登录方式」（`密码登录（可选）` 一条）、`docs/features/F01-auth.md`
> 关联设计稿：`ui-draft/login.html`（**已有完整的「密码登录」Tab + 面板 + 忘记密码入口**）
> 版本：v1.0 ｜ 日期：2026-10-09 ｜ 状态：**第 1 期已完成**（后端 + 小程序，决策点已拍板见 §11，实施记录见 §12）

---

## 0. 现状基线（代码事实，勿凭记忆开发）

| 项 | 现状 | 证据 |
|---|---|---|
| 登录方式 | **唯一**：手机号 + 短信验证码（登录即注册）。小程序端**无任何密码相关 UI**，连灰置/注释残留都没有 | `minicare-mp/src/pages/login/index.tsx`；全仓库 grep `password\|pwd` 在 `minicare-mp/src` 下 0 命中 |
| 后端 auth 路由 | 4 个：`POST /api/auth/send-code`、`POST /api/auth/verify-code`、`POST /api/auth/tcb-login`、`GET /api/auth/me`（仅 me 带 JwtGuard） | `auth.controller.ts:37/49/60/71` |
| **验证码在哪校验** | **服务端完全不经手**。`AUTH_TEST_MODE=true` 时 `verifyCode` 仅做 `code !== '123456'` 字符串比较；生产模式由**前端 CloudBase JS SDK** 发/验短信，后端只拿 `access_token` 反查手机号 | `auth.service.ts:22-24,30-35,45-47,62-93` |
| CloudBase 换手机号 | `fetch https://{TCB_ENV_ID}.ap-shanghai.tcb-api.tencentcloudapi.com/auth/v1/user/me`，取 `phone_number` 去 `+86` 前缀 | `auth.service.ts:65-85` |
| 注册逻辑 | `findOrCreateUser(phone)`：查不到就 `INSERT`，`nickname = 用户_${phone.slice(-4)}`，然后签 JWT | `auth.service.ts:98-136` |
| 密码相关代码 | **不存在**。无 `password` 列、无 `bcrypt`/`argon2` 依赖、无哈希逻辑。仓库内 `createHash('sha256')` 只用于设备 token（`device.guard.ts:18`），**不可复用** | `minicare-server/package.json` 依赖清单；`user_account` DDL |
| `user_account` 表 | 7 列：`id`(PK CHAR36) / `phone`(VARCHAR20 UNIQUE) / `nickname` / `avatar_url` / `created_at` / `updated_at` / `_openid`。**20 个 migration 从未 ALTER 过该表** | `migrations/001_init_schema.sql:17-28` |
| 最新 migration | `021_knowledge_retrieval_status.sql`（磁盘实际最大号） | `ls migrations/` |
| JWT | payload 仅 `{ sub: user.id }`；`secret = process.env.JWT_SECRET`；`expiresIn: '30d'`；**无 refresh、无版本号、无黑名单** | `auth.service.ts:127-130`；`auth.module.ts:9-12` |
| JwtGuard | 验签验期 → **额外查库** `SELECT id FROM user_account WHERE id=?` 确认用户存在 → 注入 `request.user` | `jwt.guard.ts:31-59` |
| 守卫模型 | **无全局守卫、无 `@Public` 装饰器** → 「公开」= 「不声明 `@UseGuards`」，默认放行 | grep `APP_GUARD\|@Public` 无命中 |
| 服务端限流 | **不存在**。连 `send-code` 的 60s 都是纯前端倒计时（F01 文档声称「服务端限流 60s」与代码不符） | `minicare-mp/src/pages/login/index.tsx:43-54` |
| 登录后跳转 | 逻辑硬编码在登录页内：紧 `babyApi.getMine()` + `familyApi.getPendingInvites()` → 三分支 `reLaunch`（无档案无邀请→onboarding / 有邀请→home / 否则设 family+baby→home） | `pages/login/index.tsx:99-135` |
| `activatedFamilyIds` | **恒为空数组**（`return { ..., activatedFamilyIds: [] }`），F01 文档与 `tcbLogin` 注释声称的「自动激活 pending 邀请」**从未实现** | `auth.service.ts:132` |
| Web 端密码 UI | `PwdPanel.tsx` 是**真实渲染的完整 UI**（手机号/密码/忘记密码/立即注册/协议勾选），但提交函数是空壳：`handlePwdLogin` 只 `showToast('密码登录功能开发中，请使用验证码登录')`；`LoginMode = 'sms' \| 'pwd'` tab 切换已实现 | `minicare-web/src/pages/login/useLoginLogic.ts:27,34,220-225`；`PwdPanel.tsx` |
| 设计稿 | `ui-draft/login.html` **已含**「验证码登录 / 密码登录」Tab（第 239-242 行）、密码面板（266-287 行，含「忘记密码?」与「没有账号？立即注册」）、`switchMode()` / `switchToRegister()` 脚本 | `ui-draft/login.html:238-287,298-308` |
| 需求口径 | MVP-PRD 原文：**「密码登录（可选）：输入手机号 + 密码 → 登录；密码由首次注册后在「我的」中设置」** | `docs/business/MVP-PRD.md:133` |

### 0.1 现状暴露的 5 个硬约束（决定了方案形态）

1. **服务端没有"可校验的验证码状态"**。任何「忘记密码」「设置密码」都要先证明手机所有权，而后端在 sms 模式下拿不到验证码 —— 只能拿 CloudBase `access_token`。
2. **`user_account` 无密码列，也无任何哈希依赖**，需要新增 migration + 新依赖。
3. **JWT 无失效机制**。改密后旧 token 仍有效 30 天。
4. **限流零基建**。防爆破必须在不引入 Redis 的前提下自建。
5. **登录后跳转逻辑内联在登录页**，密码登录无法复用 → 必须先抽取，否则两份逻辑必然漂移。

---

## 1. 目标与非目标

### 目标
- 小程序端新增「手机号 + 密码」登录方式，与验证码登录**并存**。
- 密码由用户在「我的 → 账号与安全」中**自行设置**（与 MVP-PRD:133 口径一致），登录页不承担设置密码。
- 忘记密码可自助重置（复用短信验证链路）。
- 改密后旧会话失效，且**当前设备不掉线**。
- 不引入新基础设施（不加 Redis、不加新服务）。

### 非目标
- 不做注册时强制/引导设置密码（保持"登录即注册、密码后置"）。
- 不做微信一键登录 / 第三方登录。
- 不做更换手机号、账号注销（§9 第 3 期，或独立需求）。
- 不改动 `AUTH_TEST_MODE` 的双模式框架本身。
- 不做密码强度可视化等级条（第 2 期）。

---

## 2. 方案总览

```
                     ┌──────────────────────────────────┐
                     │  phoneProof（手机所有权凭证抽象）  │
                     │  test : code === '123456'        │
                     │  sms  : CloudBase access_token   │
                     └──────────────┬───────────────────┘
                                    │ 复用
   ┌────────────────────────────────┼────────────────────────────────┐
   │                                │                                │
[现有] verify-code / tcb-login   [新] reset-password        [新] password（设置/修改）
   │                                │                                │
   └────────────► findOrCreateUser ◄─┴───► 写 password_hash ◄────────┘
                        │                          │
                        └──────► 签 JWT（含 tv）◄────┘
                                     │
                          [改] JwtGuard 校验 tv
```

**四条核心决策：**

| # | 决策 | 理由 |
|---|---|---|
| D-a | 验证码登录**保留为兜底通道**，密码登录是效率补充 | 忘记密码要有出口；密码登录天然不支持注册 |
| D-b | 「证明手机所有权」统一抽象为 **phoneProof**，复用 `tcbLogin` 里已跑通的 CloudBase 校验 | 零新增验证码基建，安全边界由 CloudBase 保证 |
| D-c | JWT 增加 **`token_version`（tv）**，改密时 +1 使旧 token 失效 | `JwtGuard` 本来就要查一次库（`jwt.guard.ts:49-52`），加一列**零额外查询成本** |
| D-d | 密码登录**只影响密码端点**，不纳入账号锁定 | 账号锁定若牵连验证码登录 → 攻击者可恶意锁死他人账号 |

---

## 3. 数据模型

### 3.1 Migration（编号见 §11 决策点 D-2）

```sql
-- 024_password_login.sql
ALTER TABLE `user_account`
  ADD COLUMN `password_hash`       VARCHAR(100)     NULL     COMMENT 'bcrypt 哈希，NULL=未设置密码' AFTER `avatar_url`,
  ADD COLUMN `password_updated_at` DATETIME         NULL     COMMENT '密码最后修改时间'              AFTER `password_hash`,
  ADD COLUMN `sms_verified_at`     DATETIME         NULL     COMMENT '最近一次短信验证通过时间（10min 内可免验证码设置/重置密码）',
  ADD COLUMN `pwd_fail_count`      TINYINT UNSIGNED NOT NULL DEFAULT 0     COMMENT '连续密码错误次数，成功即清零',
  ADD COLUMN `pwd_locked_until`    DATETIME         NULL     COMMENT '密码登录锁定截止时间',
  ADD COLUMN `token_version`       INT UNSIGNED     NOT NULL DEFAULT 0     COMMENT 'JWT 版本号，改密后 +1 使已签发 token 全部失效';
```

**向后兼容保证**：`token_version` 默认 0；旧 JWT 无 `tv` 字段 → 校验时取 `payload.tv ?? 0` → **存量 token 全部继续有效，不会被批量踢下线**。

### 3.2 不改动的表
`family_group` / `family_member` 与 `user_account` 的关联关系不变（`user_account` ←created_by— `family_group` ←family_id— `family_member` —user_id→ `user_account`）。

---

## 4. 后端设计（`minicare-server/src/auth/`）

### 4.1 依赖

新增 `bcryptjs`（**纯 JS**，无原生编译）。

> **为什么不选 `bcrypt` / `@node-rs/bcrypt`**：本机 npm 环境需 `--ignore-scripts`（否则卡 `fsevents` 的 node-gyp，见项目记忆 §5），原生模块的预编译产物可能被一并跳过；CloudRun 容器构建同样要额外验证。`bcryptjs` 零编译风险，代价是慢 3–5 倍（cost=10 实测约 100ms），对单次登录接口完全可接受。
> 性能若成为瓶颈，第 2 期可平滑换 `@node-rs/bcrypt`（哈希串格式兼容 bcrypt）。
>
> ⚠️ **禁止复用 `device.guard.ts` 的 `createHash('sha256')` 模式** —— 无盐、过快，不能用于用户口令。

### 4.2 验证凭证抽象（本方案的核心重构）

把 `auth.service.ts:63-90` 内联在 `tcbLogin` 里的 CloudBase 校验抽成私有方法：

```ts
/** 用 CloudBase access_token 换取手机号（原 tcbLogin 第 63-90 行原样搬入） */
private async verifyTcbToken(accessToken: string): Promise<string>

/** 统一解析手机所有权凭证；sms 模式会断言换回的手机号与传入 phone 一致 */
private async resolvePhone(phone: string, code?: string, accessToken?: string): Promise<void>
```

`resolvePhone` 规则：
- `AUTH_TEST_MODE === 'true'`：要求 `code === '123456'`；手机号以请求体传入的 `phone` 为准。
- 否则：要求 `accessToken`，调 `verifyTcbToken()` 取回手机号，**断言与 `phone` 一致**（防止拿 A 的 token 改 B 的密码）。
- 两种模式都失败 → `UnauthorizedException('验证码错误或已过期')`。

> 新端点、老端点共用同一份 CloudBase 校验代码，避免"两处实现、一处先腐烂"。**`tcbLogin` 同步改为调用 `verifyTcbToken()`**，是本次的必做重构项。

### 4.3 接口清单

| # | Method | Path | 鉴权 | 入参 | 出参 |
|---|---|---|---|---|---|
| 1 | POST | `/api/auth/login-by-password` | 无 | `{ phone, password }` | `AuthResult`（与 `verify-code` 同构） |
| 2 | GET | `/api/auth/password-status` | `JwtGuard` | — | `{ hasPassword, passwordUpdatedAt, smsVerifiedRecently }` |
| 3 | POST | `/api/auth/password` | `JwtGuard` | `{ newPassword, currentPassword?, code?, accessToken? }` | `{ ok: true, token, user }` |
| 4 | POST | `/api/auth/reset-password` | 无 | `{ phone, newPassword, code?, accessToken? }` | `{ ok: true, token, user }` |

**接口 1 返回体与 `verify-code` 完全同构**（`{ token, user, isNewUser: false, activatedFamilyIds: [] }`），使前端可复用同一段登录后跳转逻辑（§5.3）。

**接口 3 的放行矩阵**（前端按 `password-status` 决定展示"设置密码"还是"修改密码"表单）：

| `hasPassword` | 必需凭证 |
|---|---|
| `false`（设置密码） | `code`/`accessToken` 验证通过 **或** `sms_verified_at` 在 10 分钟内 |
| `true`（修改密码） | `currentPassword` 正确 **或** `code`/`accessToken` 验证通过 **或** `sms_verified_at` 在 10 分钟内 |

> `sms_verified_at` 的引入是为了**消除"刚用验证码登录完，进设置页还要再收一次短信"的荒谬体验**。写入点两处：`verifyCode()` 与 `tcbLogin()` 成功后。
> 安全边界：token 泄露场景下，若用户近 10 分钟未做短信验证，攻击者仍需短信 → 被拦住。

**⚠️ 接口 3 / 4 必须返回新签发的 token**。因为写密码时 `token_version + 1` 会让**当前设备手上的 token 也失效** —— 不补发就会出现"改完密码立刻被踢回登录页"。这是最容易踩的坑。

**接口 4（忘记密码）** 成功后：`token_version + 1`（踢掉所有旧会话）+ 下发新 token **自动登录**（用户刚证明手机所有权，少一步更顺）。若评审要求更保守，可改为跳回登录页手动登录（决策点 D-4）。

### 4.4 密码策略（单一真相源）

```
8–20 位；必须同时包含字母与数字；允许 !@#$%^&*._- 等常用符号；禁止空格与中文
```

- 后端：`src/auth/password-policy.ts` 导出 `PASSWORD_REGEX` 与 `PASSWORD_HINT`，DTO 用 `@Matches(PASSWORD_REGEX, { message: PASSWORD_HINT })`。
- 前端：`minicare-mp/src/lib/passwordPolicy.ts` 镜像同一份规则与文案（Taro 编译期无法共享后端 TS 文件）。
- ⚠️ **两处必须同改**，已记入 §8 影响面清单与 F01 文档。

### 4.5 防爆破（不引入 Redis）

```
/login-by-password 失败 → pwd_fail_count += 1
  fail_count >= 5 → pwd_locked_until = NOW() + 10min
成功 → pwd_fail_count = 0, pwd_locked_until = NULL
```

- **锁定只作用于 `/login-by-password`**，验证码登录、其他接口完全不受影响（决策 D-d）。
- 错误文案分三档：
  - `< 5 次`：`手机号或密码错误（还可尝试 N 次）`
  - 已锁定：`密码错误次数过多，请 10 分钟后再试，或改用验证码登录`
  - `hasPassword = false`：`该账号未设置密码，请使用验证码登录`（返回 code `NO_PASSWORD_SET`，前端**自动切回验证码 Tab**）
- 手机号不存在时**不单独提示"用户不存在"**，统一归入「手机号或密码错误」，避免账号枚举。
  （`NO_PASSWORD_SET` 是一处**有意的轻微信息泄露**，权衡见 §10 R7。）

### 4.6 待实现清单（后端）

```
minicare-server/src/auth/
├── auth.controller.ts        [改] +4 路由
├── auth.service.ts           [改] 抽 verifyTcbToken / 加 4 个方法 / 写 sms_verified_at
├── auth.module.ts            [不改]
├── jwt.guard.ts              [改] SELECT 加 token_version 列 + 比对 payload.tv ?? 0
├── password-policy.ts        [新] 正则 + 提示文案
└── dto/
    ├── login-by-password.dto.ts   [新]
    ├── set-password.dto.ts        [新]
    └── reset-password.dto.ts      [新]
migrations/024_password_login.sql  [新]
package.json                       [改] + bcryptjs
```

`jwt.guard.ts` 的改动（关键 3 行）：

```ts
const [rows] = await this.db.execute<any[]>(
  'SELECT id, token_version FROM user_account WHERE id = ?', [payload.sub],
);
if (!rows?.length) throw new UnauthorizedException('用户不存在，请重新登录');
if ((payload.tv ?? 0) !== (rows[0].token_version ?? 0)) {
  throw new UnauthorizedException('登录状态已失效，请重新登录');
}
```

---

## 5. 小程序端设计（`minicare-mp/`）

### 5.1 登录页改造（`pages/login/index.tsx`）

**视觉策略（决策点 D-1）**：`ui-draft/login.html` 的登录页是「顶部插画 + 遮罩 Tab」结构，与当前线上小程序登录页（白色卡片 + `login-nav` 返回栏 + `敏宝日记登录` 标题）差异较大。本方案推荐 **追加式改造**：保持现有卡片布局与页面骨架，在标题下方插入 Tab 行，**不搬运 ui-draft 的插画头部**。理由：全量重做会把本次改动的影响面从"登录逻辑"扩大到"整页视觉"，且需重跑 iPad 适配（`_ipad-adapt-mixins.scss` 里有 `home-guest-login` 等同类规则）。

```
┌──────────────────────────┐
│  ←                       │  login-nav
│                          │
│  ┌────────────────────┐  │
│  │  敏宝日记登录       │  │  login-title
│  │  [验证码登录][密码登录]│  │  login-mode-tabs  ← 新增
│  │                    │  │
│  │  手机号 [_________] │  │  login-field
│  │  密码   [_________] │  │  login-field（type=password）
│  │          忘记密码?  │  │  login-field-extra  ← 新增
│  │                    │  │
│  │  [     登 录     ]  │  │  login-btn
│  │  没有账号？立即注册  │  │  login-switch  ← 新增
│  │  □ 我已阅读并同意…  │  │  login-agreement（沿用）
│  └────────────────────┘  │
└──────────────────────────┘
```

- Tab 语义与文案照抄 `ui-draft/login.html:240-241`：`验证码登录` / `密码登录`。
- `密码登录` Tab 下：手机号 + 密码（Taro `<Input password />`）+「忘记密码?」+ 登录按钮 +「没有账号？立即注册」+ 协议勾选。
- 「没有账号？立即注册」→ 切回验证码 Tab + `toast('手机号验证码即可注册或登录')`（与设计稿 `switchToRegister()` 行为一致，`ui-draft/login.html:305-308`）。
- 「忘记密码?」→ `Taro.navigateTo('/pages/login/forgot/index')`。
- `IS_TEST_MODE` 提示按 Tab 区分：验证码 Tab → `开发模式：验证码固定 123456`；密码 Tab → `开发模式：密码登录走真实校验`。
- 新增样式（`index.scss`）：`.login-mode-tabs` / `.login-mode-tab(--active)` / `.login-field-extra` / `.login-switch` / `.login-switch-link`，字体与配色沿用现有变量（主色 `#F87098`、主文字 `#3D2B2E`、次级文字 `#9A7E82`）。
- 图标：**用 Lucide SVG 转 `data:image/svg+xml`**（同 `SettingsGroup.tsx` 的既有做法），严禁 emoji。

### 5.2 新增页面

| 页面 | 分包声明 | 内容 |
|---|---|---|
| `pages/login/forgot/index` | `pages/login` 的 `pages` 数组加 `'forgot'` | 手机号（预填登录页已输的）→ 获取验证码（60s 倒计时）→ 验证码 → 新密码 → 确认新密码 → 提交 `reset-password` → 自动登录并 `toast('密码已重置')` → `afterLogin()` |
| `pages/account/security/index` | **新分包** `{ root: 'pages/account', pages: ['security/index'] }` | ① 手机号（只读展示，中间四位打码）② 「设置密码」/「修改密码」（按 `password-status` 决定文案）③ 进入后按需发起 `password-status` |

`app.config.ts` 需改 2 处：`pages/login` 的 `pages` 数组、新增 `pages/account` 分包条目。

### 5.3 登录后跳转逻辑抽取（必做）

把 `pages/login/index.tsx:99-135` 的 40 行跳转逻辑搬到 **`src/lib/afterLogin.ts`**：

```ts
export async function afterLogin(res: AuthResult): Promise<void>
// 内部：babyApi.getMine() + familyApi.getPendingInvites() → 三分支 reLaunch
```

密码登录与验证码登录共用同一份，避免两套逻辑漂移。这也是「登录页越来越胖」的解药。

### 5.4 「我的」入口（`pages/profile/`）

新增 `accountRows` 分组，置于「家庭」组**之前**：

```
┌ 账号 ────────────────────────┐
│ 🔒 账号与安全         已设置密码 ›│
└─────────────────────────────┘
```

改动点：
- `types.ts`：`SettingsRowIcon` 追加 `'lock'`。
- `SettingsGroup.tsx`：`iconSvgSrcs` 追加 `lock`（Lucide `lock`，描边 `#F0B8C8`，同其他粉色图标）。
- `index.tsx`：新增 `accountRows: SettingsRow[]`，`label: '账号与安全'`，`subText` 由 `authApi.passwordStatus()` 决定（`已设置密码` / `未设置密码`），**请求失败静默降级为不显示 subText**；`onClick` → `navigateTo('/pages/account/security/index')`。

### 5.5 API 层（`src/api/auth.ts`）

追加 4 个函数（`auth` 标志按接口需要设置）：

```ts
loginByPassword(phone, password)          // POST /api/auth/login-by-password   auth:false
getPasswordStatus()                       // GET  /api/auth/password-status
setOrChangePassword(payload)              // POST /api/auth/password
resetPassword(payload)                    // POST /api/auth/reset-password       auth:false
```

并新增高层封装 `loginByPasswordAndPersist()`，内部 `setToken` + `setUser`，与现有 `loginByCode` 对称。

**sms 模式下的验证码获取复用现有 `sendVerificationCode(phone)`** —— 它已返回 `verifyOtp` 回调，忘记密码页可直接沿用同一套调用姿势（`sendVerificationCode` → `verifyOtp({token: code})` → 取 `session.access_token`），无需新写 SDK 分支。

---

## 6. Web 端（`minicare-web/`，第 2 期）

`PwdPanel.tsx` 与 `useLoginLogic.ts` 的 Tab 切换**已存在**，接线成本很低：

1. `useLoginLogic.ts` 的 `handlePwdLogin` 从假逻辑改为真实请求。
2. `PwdPanel` 的「忘记密码?」由 toast 改为跳转（或复用 web 端尚无的重置页 → 第 2 期可与 mp 共用后端接口）。
3. web 端 401 **无全局跳登录**（`minicare-web/src/api/http.ts:40-43` 仅 `throw`），与 mp 端行为不一致 —— 顺带补齐。

Web 处于 maintenance mode，故排在第 2 期；不阻塞小程序上线。

---

## 7. 影响面清单（`node .agents/scripts/impact-scan.mjs auth login password`，147 个文件命中）

### 7.1 后端（d=1 高风险）

| 文件 | 改动 | 风险 |
|---|---|---|
| `auth/jwt.guard.ts` | 加 `token_version` 比对 | 🔴 **全站公共依赖**：所有受保护接口（home/records/report/agent/device/storage…共 30+ 控制器）都经它。改动后必须回归全链路 |
| `auth/auth.service.ts` | 抽 `verifyTcbToken`、+4 方法 | 🔴 `tcbLogin` 是生产登录唯一入口，重构后必测 |
| `auth/auth.controller.ts` | +4 路由 | 🟡 |
| `auth/dto/*.ts` | +3 文件 | 🟢 |
| `auth/password-policy.ts` | 新 | 🟢 |
| `migrations/024_*.sql` | 新 | 🟡 生产库需按 CONVENTIONS 走 migration 流程 |
| `package.json` | +`bcryptjs` | 🟢 |

### 7.2 小程序

| 层 | 文件 |
|---|---|
| 入口层 | `app.config.ts`（分包 + `pages/login` 子页） |
| 页面层 | `pages/login/index.tsx`（+Tab/+密码面板）、新 `pages/login/forgot/*`、新 `pages/account/security/*`、`pages/profile/index.tsx`（+账号组） |
| 组件 | `pages/profile/SettingsGroup.tsx`（+lock 图标）、`pages/profile/types.ts`（+`'lock'`） |
| API 层 | `api/auth.ts`（+4）、`api/index.ts`（导出新函数） |
| 常量工具 | 新 `lib/afterLogin.ts`、新 `lib/passwordPolicy.ts` |
| 样式 | `pages/login/index.scss` |
| **不受影响但需回归** | `components/LoginGuide/*`、`pages/home/index.tsx:218`（`authApi.checkToken()`）、`pages/dashboard`、`pagesReport/*GuestReport`、`pages/chat`、`pages/diary` 的登录引导入口 —— 它们只依赖"是否登录"，与登录方式无关，但 `checkToken` 走 JwtGuard，**必须回归** |

### 7.3 文档

| 文件 | 更新内容 |
|---|---|
| `docs/features/F01-auth.md` | 「登录方式」加密码登录；「后端 API」表 +4 行；「业务规则」加密码策略/锁定/`token_version`；「AC」+条目；「相关文件」补新路径；顶部「最后更新」 |
| `docs/business/MVP-PRD.md` | §登录方式：「密码登录（可选）」→ 去掉"可选"，补设置入口与重置路径 |
| `docs/README.md` | F01 状态行 |
| `docs/DEV-PLAN.md` | 登录相关条目 |
| `.agents/skills/minicare-dev/SKILL.md` | 「当前最新迁移」行改为新编号 |
| 本文档 | 评审后转 v1.0 |

---

## 8. 分期与任务拆分

### 第 1 期 — 功能闭环（P0）

**后端**
1. `migrations/024_password_login.sql` + 三环境执行（dev → staging → prod）
2. `npm i bcryptjs`（`--registry=https://registry.npmmirror.com --ignore-scripts`）
3. `password-policy.ts` + 3 个 DTO
4. `auth.service.ts`：抽 `verifyTcbToken()` → `tcbLogin` 改调用 → 加 `resolvePhone()` → 加 4 个方法（含写 `sms_verified_at`）
5. `auth.controller.ts`：+4 路由
6. `jwt.guard.ts`：`token_version` 比对
7. Swagger 注解（`@ApiOperation`，非生产环境 `/api-docs` 可见）

**小程序**
8. `lib/afterLogin.ts` 抽取 + `login/index.tsx` 改为调用（**先重构、后加功能**，避免一次改两件事）
9. `lib/passwordPolicy.ts`
10. `api/auth.ts` +4 + `api/index.ts` 导出
11. 登录页 Tab + 密码面板 + 样式
12. `pages/login/forgot/*`
13. `pages/account/security/*` + `app.config.ts` 分包
14. `profile` 页账号组 + `SettingsGroup` lock 图标

**文档**
15. F01 / MVP-PRD / README / SKILL 同步

### 第 2 期 — 体验与安全增强（P1）
- 弱口令黑名单（`12345678` / `password` / `qwerty` 等）
- 密码强度提示条；修改密码页显示"上次修改于 X"
- 登录审计表 `login_attempt`（手机号/IP/UA/结果/时间），供后续异常登录提醒
- Web 端 `PwdPanel` 接线 + web 端 401 全局跳登录
- 顺带补齐 `send-code` 的服务端 60s 限流（F01 文档声称存在、代码不存在）

### 第 3 期 — 可复用扩展（P2）
- 更换手机号（直接复用 `phoneProof` 抽象，成本极低）
- 账号注销入口（**合规相关，见 R8**）

---

## 9. 验收标准

### 后端
- [ ] `POST /login-by-password` 正确密码 → 返回与 `verify-code` 同构的 `AuthResult`
- [ ] 密码错误 → 401，文案含剩余次数；连续 5 次 → 锁定 10 分钟
- [ ] 锁定期间 `GET /verify-code` 路径与 `send-code` **仍可用**（锁定不牵连验证码登录）
- [ ] 未设置密码的账号 → 返回 `NO_PASSWORD_SET`，不提示"用户不存在"
- [ ] 不存在的手机号 → 与密码错误**同一文案**（不可枚举账号）
- [ ] `POST /password` 设置成功后：`password_hash` 为 bcrypt 串（`$2a$`/`$2b$` 前缀）、`password_updated_at` 已写、`token_version` +1
- [ ] `POST /password` 返回的**新 token 立即可用**，旧 token **立即 401**
- [ ] `AUTH_TEST_MODE=true` 下 `code='123456'` 可完成设置/重置；`false` 时走 `accessToken` 且**换回手机号必须与请求 `phone` 一致**
- [ ] 「10 分钟内短信验证过」可免验证码设置密码；超过 10 分钟则要求验证码
- [ ] `POST /reset-password` 成功 → 未登录态也能重置，返回新 token
- [ ] `AUTH_TEST_MODE=false` 且 `code`/`accessToken` 均缺失 → 400，不泄露内部细节

### 小程序
- [ ] 登录页两个 Tab 可切换，切回验证码 Tab 时验证码表单状态不丢
- [ ] 密码 Tab：手机号/密码非空校验、协议未勾选拦截、加载态、错误 toast
- [ ] `NO_PASSWORD_SET` → 自动切回验证码 Tab + 提示
- [ ] 密码登录成功 → 与验证码登录**完全相同的跳转结果**（有档案→首页 / 无档案→引导页 / 有邀请→首页）
- [ ] 「忘记密码?」→ 忘记密码页；重置成功 → 自动登录进首页
- [ ] 「我的」显示「账号与安全」，subText 正确反映是否已设置密码
- [ ] 账号与安全页：未设密码时标题为「设置密码」，已设时「修改密码」且需输原密码
- [ ] 修改密码成功后当前设备**未掉线**，其他设备 401 后被踢回登录页
- [ ] test 模式（`TARO_APP_AUTH_MODE=test`）与 sms 模式**两条路径都手工验证过**
- [ ] 点击「获取验证码」倒计时 60s，期间按钮禁用
- [ ] 全程无 emoji 图标；样式与 `ui-draft/login.html` 的语义对齐

### 回归（因 `jwt.guard.ts` 改动，必做）
- [ ] 存量未过期 JWT **继续可用**（不因上线被批量踢下线）
- [ ] 首页 / 记录列表 / 各记录表单 / 报告 / agent 对话 / iPad 看板 / 音箱设备 全部正常
- [ ] 401 拦截仍正常清 token 并 `reLaunch` 登录页

---

## 10. 风险

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | `JwtGuard` 是全站公共依赖，改错影响面 30+ 控制器 | 🔴 高 | §9 回归清单逐项跑；`payload.tv ?? 0` 保证向后兼容；灰度先上 dev/staging |
| R2 | Migration 编号冲突：022 已被 PRD-009（`schedule_template_item`）预留、023 被 PRD-006 §9（转奶/排敏表）预留，且两份 PRD 都写了 022 | 🟡 中 | 落地前确认三者实际执行顺序，本方案暂记 **024**；该冲突本身是既有问题，建议顺手在 `migrations/README` 里加一句取号约定 |
| R3 | 账号锁定被用于 DoS（恶意连错他人手机号） | 🟡 中 | 锁定**只作用于密码登录**，用户仍可用验证码登录；锁定期 10 分钟。剩余风险接受 |
| R4 | `bcryptjs` 纯 JS 性能（cost=10 约 100ms）在 CloudRun 单实例并发下排队 | 🟡 中 | 先上线观察；必要时 cost 降到 8 或换 `@node-rs/bcrypt`（哈希串兼容） |
| R5 | 前端/后端密码正则两处实现，容易漂移 | 🟡 中 | §8 影响面清单 + F01 文档双重标注"两处必须同改" |
| R6 | 改密使 `token_version` +1，若漏发新 token → 用户改完密码自己被踢 | 🟡 中 | 已写入 §4.3 与验收清单；接口 3/4 强制返回 token |
| R7 | `NO_PASSWORD_SET` 泄露"该手机号在本 App 注册过且未设密码" | 🟢 低 | 家庭 App 用户量小、通过短信本身已可判断手机号归属；体验优先。若评审要求收紧，可改为统一文案 + 前端引导 |
| R8 | 微信小程序账号类功能合规：上线"设置/修改/重置密码"后"账号"概念实体化，而当前**无账号注销入口**，且 `pages/privacy` 的《隐私政策》/《用户服务协议》未覆盖账号安全条款 | 🟡 中 | 建议同期在协议中补「账号安全」小节；账号注销列为第 3 期或独立需求（**需产品拍板**） |
| R9 | 登录页视觉与 `ui-draft/login.html` 不完全一致 | 🟢 低 | 由决策点 D-1 拍板；方案默认追加式改造 |

---

## 11. 待拍板决策点（2026-10-09 已拍板）

| # | 决策 | 结论 |
|---|---|---|
| **D-1** | 登录页视觉策略 | ✅ **追加式改造** —— 保留现有卡片布局，标题下插 Tab 行；未采用 ui-draft 的插画头部（避免把改动面扩散到整页视觉 + iPad 适配） |
| **D-2** | Migration 取号 | ✅ **024**（022 已落地为 `022_schedule_template.sql`、023 留给 PRD-006 §9） |
| **D-3** | 密码强度 | ✅ **8–20 位，字母 + 数字**（允许 `!@#$%^&*._-`） |
| **D-4** | 重置密码后 | ✅ **自动登录**（下发新 token，前端 `adoptNewToken` 后 `afterLogin()`） |
| **D-5** | 忘记密码 | ✅ **P0 做完整 `reset-password` 接口**，登录页「忘记密码?」直达重置页 |
| **D-6** | 哈希实现 | ✅ **`bcryptjs@3.0.3`**（纯 JS，内置类型，零编译风险） |
| **D-7** | 未设密码提示 | ✅ **明确提示 + 自动切回验证码 Tab**（错误码 `NO_PASSWORD_SET`） |
| **D-8** | Web 端 | ⏳ 第 2 期接线（`PwdPanel.tsx` 仍是假逻辑） |
| **D-9** | 账号注销 + 协议条款 | ⏳ 独立需求排期（见 R8） |

---

## 12. 第 1 期实施记录（2026-10-09）

### 12.1 数据库

| 环境 | 动作 | 结果 |
|---|---|---|
| `minicare_dev` | 按序执行 `021` / `022` / `024` | ✅ 三个均成功；`user_account` 7 列 → **13 列**；`password_hash` 实际为 `$2b$10$` 前缀（bcrypt cost=10） |
| `minicare_staging` | 未执行 | 仍停在 019 |
| `minicare-cloud-6gqledlle0132cbe` | 未执行 | 仍停在 019 |

> ⚠️ staging / 正式库尚未应用 024，上线前需按 `minicare-deploy` 流程另行执行。

### 12.2 后端实测（本地 3001，`AUTH_TEST_MODE=true`，库 = `minicare_dev`）

14 项主链路 + 6 项锁定路径**全部通过**：

| 验证点 | 结果 |
|---|---|
| 验证码登录签发 T1 | 200，`isNewUser=true` |
| `password-status` 初始态 | `hasPassword=false`、`smsVerifiedRecently=true` |
| 未设密码走密码登录 | 400 + `code=NO_PASSWORD_SET` |
| 弱密码（`12345678`）被 DTO 拒绝 | 400，文案 = `PASSWORD_HINT` |
| 设置密码（免二次验证码走 `sms_verified_at`） | 200，返回新 token T2 |
| **旧 token T1 立即失效** | 401 `登录状态已失效，请重新登录` |
| 新 token T2 可用 | 200（当前设备未掉线） |
| 密码登录成功 | 200，`isNewUser=false` |
| 密码错误文案含剩余次数 | `手机号或密码错误（还可尝试 4 次）` |
| 不存在的手机号 | 与密码错误**同一文案**（不可枚举账号） |
| `reset-password` 未登录态重置 | 200，自动登录 |
| 重置后仅新密码可用 | 新 200 / 旧 401 |
| `password-status` / `password` 无 token | 401 |
| **连续 5 次失败锁定 10 分钟** | 第 5 次即锁；锁定期正确密码亦被拒 |
| **锁定期验证码登录仍可用** | 200（决策 D-d 生效） |
| 锁定仅作用于单账号 | 另一账号仍返回 `NO_PASSWORD_SET` |

### 12.3 小程序端

| 文件 | 改动 |
|---|---|
| `src/lib/afterLogin.ts` | **[新]** 登录后跳转逻辑从登录页抽出，验证码/密码登录共用 |
| `src/lib/passwordPolicy.ts` | **[新]** 后端 `password-policy.ts` 的前端镜像 |
| `src/api/http.ts` | **[改]** 新增 `ApiError`（携带 `statusCode` + 后端 `code`），向后兼容 |
| `src/api/auth.ts` | **[改]** +4 接口、`loginByPasswordAndPersist`、`adoptNewToken`、`buildPhoneProof` |
| `src/api/types.ts` | **[改]** `Family` 补 `role?: 'owner' \| 'member'`（后端 SQL 实际返回 `fm.role`，原类型缺字段） |
| `src/pages/login/index.tsx` | **[改]** 新增 Tab + 密码面板；跳转逻辑改调 `afterLogin()` |
| `src/pages/login/index.scss` | **[改]** `.login-mode-tabs/-tab/--active`、`.login-field--pwd`、`.login-field-extra`、`.login-switch*`（对齐 `ui-draft/login.html:172-183`） |
| `src/pages/login/forgot/*` | **[新]** 忘记密码重置页 |
| `src/pages/account/security/*` | **[新]** 账号与安全（设置/修改密码） |
| `src/app.config.ts` | **[改]** `pages/login` 加 `forgot/index`；新增 `pages/account` 分包 |
| `src/pages/profile/index.tsx` | **[改]** 新增「账号」设置组 + `useDidShow` 拉取密码状态 |
| `src/pages/profile/types.ts` | **[改]** `SettingsRowIcon` 加 `'lock'` |
| `src/pages/profile/SettingsGroup.tsx` | **[改]** `iconSvgSrcs` 加 `lock`（Lucide lock） |

### 12.4 已知遗留（未处理，非本次范围）

1. **`src/pages/profile/index.tsx` 的「管理宝宝」行图标缺失**：`icon: 'baby'` 不在 `SettingsRowIcon` 联合类型里，`iconSvgSrcs` 也没有该键 → 运行时不渲染图标，且 `tsc` 报 3 个错（其中 2 个是从这一处级联出来的）。
   **这是本次改动之前就存在的缺陷**（已用 `git show HEAD` 核对），修法是在 `types.ts` 与 `SettingsGroup.tsx` 各补一条 `baby`（Lucide `baby`），本次未动。
2. `minicare-mp` 的 `tsconfig.json` 未开 `skipLibCheck`，全量 `tsc --noEmit` 有 155 个错误、其中 54 个在 `src/`，绝大多数为历史遗留（未使用变量、`void` 类型误用等）。
   本次新增/改动的文件**贡献 0 个错误**。
3. 三个表单页（login / forgot / account-security）的卡片与输入框样式目前各自持有一份副本。
   本仓库已有现成的复用做法可参照：`src/pages/records/health/{allergy,temperature}/index.scss` 的
   `@import '../index.scss'`。超过 3 个同类页面时应抽到 `src/styles/_auth-form.scss` 统一维护。

### 12.5 上线前 TODO

- [ ] `minicare_staging` / 正式库按序补齐 `020` / `021` / `022` / `024`
- [ ] 生产 `AUTH_TEST_MODE=false` 路径需在真机验证（本次仅验了 test 模式；sms 模式的 `access_token` 分支代码路径与 `tcb-login` 共用 `verifyTcbToken()`，风险可控但**必须在真短信环境实测一次**）
- [ ] `minicare-mp` 的 `.env.production` 走 `TARO_APP_AUTH_MODE=sms`，需确认 `build:weapp` 产物中 `buildPhoneProof` 的 sms 分支可用
- [ ] 第 2 期：web 端 `PwdPanel` 接线、弱口令黑名单、登录审计

---

## 12b. 修复记录：401 语义混淆（2026-10-09，上线前实测发现）

### 现象

密码输错时，前端提示的不是「手机号或密码错误（还可尝试 4 次）」，而是**「登录已过期，请重新登录」**，
且已填的手机号/密码/协议勾选被清空。

### 根因

`minicare-mp/src/api/http.ts` 的旧实现把**任何** 401 都当成「登录态失效」：

```ts
if (res.statusCode === 401) {          // ← 无差别拦截
  removeToken(); removeUser();
  Taro.reLaunch({ url: '/pages/login/index' });
  throw new Error('登录已过期，请重新登录');   // ← 后端文案被丢弃
}
```

但 401 在这套接口里承担了**两种互斥语义**：

| 语义 | 来源 | 正确处置 |
|---|---|---|
| 登录态失效 | `JwtGuard` 拒绝已登录请求 | 清凭证 + 跳登录页 |
| **可预期的业务错误** | 密码错误 / 验证码错误 / 原密码错误 / 验证凭证不匹配 | **透出原始文案，什么都不做** |

受影响接口共 5 个（不止密码登录）：

| 接口 | 401 场景 | 错误后果 |
|---|---|---|
| `POST /auth/login-by-password` | 密码错误 / 次数过多锁定 | 提示变成「登录已过期」+ 表单清空 |
| `POST /auth/password` | 原密码错误 / 未通过凭证验证 | **已登录用户仅因输错原密码就被登出** |
| `POST /auth/verify-code` | 验证码错误（test 模式） | 提示错误 |
| `POST /auth/reset-password` | 验证码错误或已过期 | 提示错误 |
| `POST /auth/tcb-login` | CloudBase Token 无效 | 提示错误 |

> 之所以此前没暴露：后端接口测试（curl）全部通过 —— **该缺陷只存在于前端错误处理层**。

### 修法

把「401 是否代表登录态失效」变成**请求级显式声明**，默认保持原行为：

```ts
interface RequestOptions {
  /** 401 时是否清凭证 + 跳登录页。默认 true；登录/验证码/改密必须传 false */
  redirectOn401?: boolean
}
```

- 默认 `true` → 行为与改动前**逐字一致**（文案仍是「登录已过期，请重新登录」，`pages/home/index.tsx:321` 依赖它区分「未登录」与「后端未连通」）
- 上述 5 个接口显式传 `false` → 透出后端 `message`

同时抽出 `extractErrorBody()`，一并修掉两个相邻缺陷：
1. NestJS `ValidationPipe` 的 `message` 是**字符串数组**，旧实现会把它原样塞进 `showToast`；
2. `res.data` 为纯文本时旧实现退化成 `HTTP 400`。

### 回归测试（已入库）

`minicare-mp/scripts/check-401-semantics.cjs`（`npm run check:401`）

- **测真实源码**：用 `typescript.transpileModule` 加载仓库里的 `src/api/http.ts` + `src/api/auth.ts`，只 stub `@tarojs/taro`，不是重写的等价逻辑
- 6 个场景 / 26 条断言，覆盖：密码错误文案+不清凭证、`NO_PASSWORD_SET`、验证码错误、**已登录用户输错原密码不被登出**、真 token 失效仍走登出跳转、重置密码验证码错误
- 前置条件写在文件头（后端 3001 运行 + `minicare_dev` 已应用 024 + 两个测试账号）

### 影响面清单补充

| 层 | 消费点 |
|---|---|
| 小程序 API 层 | `src/api/http.ts`（🔴 **全端公共依赖**，所有请求经它；`redirectOn401` 语义变更需回归所有错误提示路径） |
| 回归脚本 | `src/api/auth.ts` 的 5 个接口 + `npm run check:401` |

---

## 12c. 修复记录：登录卡片右侧溢出（2026-10-09）

### 现象

登录卡片左右不对称：左边距 24px 正常，**右侧溢出屏幕**，卡片右上圆角被切掉。

### 根因

项目**全局没有任何 `box-sizing` reset**（`src/app.scss` 及 `src/styles/*.scss` 均无），
浏览器/小程序默认 `content-box`：

```scss
.login-card { width: 100%; padding: 20px 16px; }   // 实际宽度 = 容器内容宽 + 32px
```

`.login-page` 的内容盒宽 = 视口 − 48px，卡片总宽 = (视口 − 48) + 32 → **向右溢出 8px**。

### 为什么同样的写法在底部弹层里没事（关键机制）

| | 容器 | 子元素在 | 结果 |
|---|---|---|---|
| 登录卡片 | `.login-page` 是 `flex-direction: column` | **交叉轴** | 溢出 |
| 底部弹层（ConfirmSheet 等） | `.confirm-sheet-mask` 是 `display:flex`（横向，`align-items:flex-end`） | **主轴** | 不溢出 |

- **交叉轴**：`align-items: stretch` 只在子元素 `width` 为 `auto` 时生效。卡片显式写了 `width: 100%` → 不 stretch；交叉轴又没有 `flex-shrink` → 定死，溢出。
- **主轴**：`flex-shrink` 默认 1，弹层外框超出容器时会被自动收回 → 不溢出。

所以「`width:100%` + 水平 padding + 无 `border-box`」**只在 column-flex 容器或普通 block 容器里才致命**。

### 修法

三处卡片显式 `box-sizing: border-box`（各带注释指向本文件，便于后续新建同类卡片时照抄）：

- `src/pages/login/index.scss` → `.login-card`
- `src/pages/login/forgot/index.scss` → `.forgot-card`
- `src/pages/account/security/index.scss` → `.security-card`

> **未采用全局 reset**（`* { box-sizing: border-box }`）：会一次性改变全站 40+ 页面的既有布局，
> 风险远大于收益。若将来要做，必须逐页回归。

### 同类隐患扫描结果（`width:100%` + 水平 padding + 无 box-sizing）

全库命中 **15 处**（`src/**/*.scss`）：

| 分类 | 处数 | 结论 |
|---|---|---|
| 死样式（类名在 ts/tsx 中已无引用） | 5 | `logout-sheet` / `activity-sheet` / `health-sheet` / `medical-sheet` / `symptom-sheet` —— 顺手可清理 |
| 底部弹层 / Modal（父容器为 row-flex） | 9 | 按上述机制**不会溢出**，无需改动 |
| **页面级卡片** | 1 | ⚠️ `.success-page__card`（`pages/onboarding/index.scss`）：`.success-page` 是 `column` flex + `align-items: center` + `width:100%` + `padding:20px` → **与登录卡片同构，很可能同样溢出 40px（左右各 20px）**。本次未改，待真机确认 |

---

## 13. 参考

- 现状实现：`minicare-server/src/auth/`（4 个文件）、`minicare-mp/src/pages/login/index.tsx`、`minicare-mp/src/api/auth.ts`
- 设计稿：`ui-draft/login.html`（`switchMode()` / `switchToRegister()` 已定义 Tab 行为）
- 需求口径：`docs/business/MVP-PRD.md:133`（密码由「我的」中设置）
- 现有假 UI：`minicare-web/src/pages/login/PwdPanel.tsx` + `useLoginLogic.ts:220-225`
- 影响面工具：`node .agents/scripts/impact-scan.mjs auth login password`
