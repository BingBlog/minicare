# INFRA-02 · 开发环境配置方案

> 适用项目：minicare-web（前端）+ minicare-server（后端）  
> 最后更新：2026-03-30

---

## 环境总览

项目共划分三套环境，当前**开发**和**测试**已配置完毕，**生产**在测试阶段完成后再接入。

| 环境 | 触发方式 | 短信验证码 | 后端地址 | 数据库 |
|------|---------|-----------|---------|--------|
| **开发（development）** | `npm run dev` / `npm run start:dev` | 固定 `123456` | `localhost:3000` | 本地 MySQL |
| **测试（staging）** | `npm run build:staging` / `npm run deploy` | 固定 `123456` | CloudRun 线上 | CloudBase MySQL |
| **生产（production）** | `npm run build:prod` / `npm run deploy -- --env production` | 真实短信 | CloudRun 线上 | CloudBase MySQL |

---

## 一、前端环境配置（minicare-web）

### 文件结构

```
minicare-web/
├── .env.development     ← npm run dev 自动加载（可提交 Git）
├── .env.staging         ← npm run build:staging 加载（可提交 Git）
├── .env.production      ← npm run build:prod 加载（占位，生产前填写）
└── .env.local           ← 本地私密覆盖，优先级最高（不提交 Git）
```

**Vite 加载优先级**（高 → 低）：`.env.local` > `.env.[mode]` > `.env`

### 环境变量说明

| 变量 | 说明 | 开发 | 测试 | 生产 |
|------|------|------|------|------|
| `VITE_TCB_ENV_ID` | CloudBase 环境 ID | 共用同一个 | 共用同一个 | 独立新环境 |
| `VITE_API_BASE_URL` | 后端 API 地址 | `http://localhost:3000` | CloudRun 域名 | 生产 CloudRun 域名 |
| `VITE_AUTH_MODE` | 登录模式 | `test` | `test` | `sms` |

### VITE_AUTH_MODE 说明

| 值 | 行为 |
|----|------|
| `test` | 调后端 `/api/auth/send-code` + `/api/auth/verify-code`，固定验证码 `123456`，页面显示黄色提示条 |
| `sms` | 调 CloudBase JS SDK `signInWithOtp` 发真实短信，验证成功后调 `/api/auth/tcb-login` 换 JWT |

### npm scripts

```bash
npm run dev              # 开发服务器（加载 .env.development）
npm run build:staging    # 构建测试包（加载 .env.staging）
npm run build:prod       # 构建生产包（加载 .env.production）
npm run build            # 默认等同于 build:staging
npm run deploy           # build:staging + 上传静态托管
```

---

## 二、后端环境配置（minicare-server）

### 文件结构

```
minicare-server/
├── .env.local           ← 本地开发配置（不提交 Git）
├── .env.staging         ← 测试环境变量说明（不提交 Git，仅作参考）
├── .env.example         ← 模板文件（提交 Git）
└── .env                 ← 兜底配置（不提交 Git）
```

### 环境变量加载逻辑（main.ts）

```
NODE_ENV=development → 从 .env.local 加载（本地开发）
NODE_ENV=production  → 不读文件，由 CloudRun 控制台注入环境变量
```

### 核心环境变量

| 变量 | 开发（.env.local） | 测试/生产（CloudRun 控制台注入） |
|------|-------------------|-------------------------------|
| `NODE_ENV` | `development` | `production` |
| `PORT` | `3000` | `80`（CloudRun 默认） |
| `TCB_ENV_ID` | `minicare-cloud-6gqledlle0132cbe` | 同左（测试），生产用独立环境 |
| `AUTH_TEST_MODE` | `true` | `true`（测试）/ `false`（生产） |
| `DB_HOST` | `127.0.0.1` | CloudBase MySQL 内网地址 |
| `DB_NAME` | `minicare_dev` | `minicare-cloud-6gqledlle0132cbe` |
| `JWT_SECRET` | `local-dev-secret-...` | 强随机密钥（生产必须更换） |

### AUTH_TEST_MODE 说明

| 值 | 行为 |
|----|------|
| `true` | `POST /api/auth/send-code` 不发短信，打印日志；`POST /api/auth/verify-code` 固定接受 `123456` |
| `false`（或未设置） | `send-code` 和 `verify-code` 接口返回 400，需走 `/api/auth/tcb-login` 流程 |

### npm scripts

```bash
npm run start:dev    # 开发服务器（NODE_ENV=development，加载 .env.local）
npm run start:prod   # 生产启动（NODE_ENV=production，不读文件）
npm run start:debug  # 调试模式（带 --inspect）
```

---

## 三、认证流程对照

### 测试模式（AUTH_TEST_MODE=true）

```
用户输入手机号
    ↓
前端 → POST /api/auth/send-code { phone }
    ↓
后端打印日志（不发短信）返回 { message: "验证码已发送" }
    ↓
用户输入 123456
    ↓
前端 → POST /api/auth/verify-code { phone, code: "123456" }
    ↓
后端验证通过 → 查/创 user_account → 颁发 JWT（30天）
    ↓
前端存 localStorage，跳转首页
```

### 生产模式（AUTH_TEST_MODE=false + VITE_AUTH_MODE=sms）

```
用户输入手机号
    ↓
前端 → CloudBase JS SDK auth.signInWithOtp({ phone })  ← 发真实短信
    ↓
用户输入收到的验证码
    ↓
前端 → verifyOtp({ token: code })  ← SDK 验证
    ↓
拿到 session.access_token
    ↓
前端 → POST /api/auth/tcb-login { accessToken }
    ↓
后端 → CloudBase HTTP API /v1/auth/users/me 验证 token → 取手机号
    ↓
查/创 user_account → 颁发自定义 JWT（30天）
    ↓
前端存 localStorage，跳转首页
```

---

## 四、部署流程

### 后端部署（CloudRun）

```bash
# 部署到测试环境（默认）
npm run deploy
# 等同于：bash scripts/deploy.sh --env staging

# 部署到生产环境（待配置）
npm run deploy -- --env production

# 仅检查构建产物大小
npm run deploy:check
```

**deploy.sh 执行步骤：**
1. `nest build` → 编译 TypeScript 到 `dist/`
2. 检查 `dist/` 大小（超 10 MB 中止，超 3 MB 警告）
3. 打印 CloudRun 环境变量配置检查表，要求手动确认
4. `tcb run:deprecated version create` 上传并部署

**上传内容**（约 130 KB 压缩后）：
```
dist/          ← 编译产物（排除 *.tsbuildinfo）
package.json
package-lock.json
Dockerfile
.dockerignore
```

### 前端部署（静态托管）

```bash
npm run deploy
# 等同于：npm run build:staging && tcb hosting deploy dist -e minicare-cloud-6gqledlle0132cbe
```

---

## 五、测试阶段 CloudRun 环境变量配置清单

在 CloudRun 控制台「服务配置 → 环境变量」中添加以下变量：

| 变量名 | 值 | 备注 |
|--------|-----|------|
| `NODE_ENV` | `production` | 必填 |
| `TCB_ENV_ID` | `minicare-cloud-6gqledlle0132cbe` | 必填 |
| `AUTH_TEST_MODE` | `true` | 测试阶段固定验证码 |
| `JWT_SECRET` | `<随机生成>` | 必填，用命令生成：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DB_HOST` | CloudBase MySQL 内网地址 | 控制台「数据库→连接信息」获取 |
| `DB_PORT` | `3306` | |
| `DB_NAME` | `minicare-cloud-6gqledlle0132cbe` | |
| `DB_USER` | 数据库用户名 | 控制台获取 |
| `DB_PASS` | 数据库密码 | 控制台获取 |

---

## 六、切换到生产环境的步骤（待执行）

1. **新建** CloudBase 生产环境（独立环境 ID）
2. **配置** 生产 CloudRun 服务，`AUTH_TEST_MODE=false`
3. **开启** CloudBase 控制台「登录授权 → 手机号+短信验证码」
4. **更新** `minicare-web/.env.production` 填入生产 `TCB_ENV_ID` 和 `API_BASE_URL`
5. **测试** 真实短信流程通过后，切换流量
