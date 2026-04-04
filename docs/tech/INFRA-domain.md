# INFRA-04 · minicare.top 域名绑定与环境隔离方案

> 适用项目：minicare-web（前端）+ minicare-server（后端）  
> 最后更新：2026-04-04  
> 前置状态：`minicare.top` 域名已注册，ICP 备案进行中

---

## 一、问题

### 1.1 现状痛点

**① 环境访问地址无语义，staging / production 共用同一域名**

当前所有访问均通过 CloudBase 默认域名：

```
现状：https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/
```

- 默认域名长达 60+ 字符，不适合对外分享、不具备品牌识别度
- 没有 production 专属入口，无法区分「内部测试」和「正式对外」

**② 后端 CORS 当前依赖 CloudRun 网关注入，新域名存在被拒风险**

```ts
// minicare-server/src/main.ts 现状
if (process.env.NODE_ENV !== 'production') {
  app.enableCors(...)  // 只在本地开发启用，生产环境全部关闭
}
```

当 `minicare.top` 上线后，浏览器发起跨域请求，CloudRun 网关注入的 CORS 头未包含新域名，存在**新域名被 CORS 拒绝**的风险。

**③ CloudBase Auth 安全域名白名单未包含新域名**

CloudBase JS SDK 初始化时校验当前页面域名是否在安全域名白名单内，新域名不在白名单则 SDK 调用直接报错（登录失败）。

**④ WebSocket CORS 配置为 `origin: '*'`，存在安全隐患**

```ts
// minicare-server/src/websocket/events.gateway.ts
@WebSocketGateway({ namespace: '/ws', cors: { origin: '*' } })
```

通配符允许任意来源建立 WebSocket 连接，应收紧为明确的域名列表。

---

## 二、目标

| 目标              | 具体描述                                                                          |
| ----------------- | --------------------------------------------------------------------------------- |
| **语义化域名**    | `minicare.top` → production 前端入口，`tcloudbaseapp.com` 默认域名 → staging 入口 |
| **前端环境隔离**  | 两套前端构建产物，独立部署路径（`/` vs `/staging/`），独立数据库                  |
| **CORS 安全收紧** | 后端只允许已知域名跨域，WebSocket 同步收紧，移除通配符                            |
| **域名绑定**      | CloudBase 控制台完成 CNAME 绑定 + SSL 证书                                        |
| **面向长远**      | 预留独立 production 后端服务的升级路径，当前阶段不执行                            |

---

## 三、整体方案

### 3.1 阶段规划

本方案分两个阶段实施，与业务成熟度对齐：

| 阶段                     | 触发时机                 | 后端服务                     | 说明                                         |
| ------------------------ | ------------------------ | ---------------------------- | -------------------------------------------- |
| **当前阶段（MVP）**      | 现在                     | 1 套（staging 服务）         | minicare.top 绑定前端，后端共用 staging 服务 |
| **未来阶段（正式上线）** | 有真实用户、需严格隔离时 | 2 套（staging + production） | 新建独立 production 后端服务，连生产库       |

### 3.2 三环境全景架构图（当前阶段）

> 纵向三列对应三套环境。⚠️ 标记为当前阶段的临时折中，production 前端共用 staging 后端和数据库。

```
┌─────────────────────────────────┬──────────────────────────────────┬──────────────────────────────────────┐
│      本地开发（development）      │         staging（测试）             │         production（正式）             │
│      开发者本机                   │         内部测试人员                  │         正式用户 / 产品验证             │
├─────────────────────────────────┼──────────────────────────────────┼──────────────────────────────────────┤
│                                 │                                  │                                      │
│  浏览器                           │  浏览器                            │  浏览器                               │
│  http://localhost:3000          │  xxx.tcloudbaseapp.com           │  minicare.top                        │
│       │                         │  /staging/                       │       │ CNAME → CloudBase CDN        │
│  Vite dev server                │       │                          │       │                              │
│  /api/* 代理 → :3001             │       │                          │       │                              │
│       │                         │       ▼                          │       ▼                              │
│       ▼                         │   CloudBase 静态托管               │   CloudBase 静态托管                   │
│  minicare-web（:3000）            │   cloudPath: /staging/           │   cloudPath: /                       │
│  .env.development               │   .env.staging                   │   .env.production                    │
│  VITE_AUTH_MODE=test            │   VITE_AUTH_MODE=test            │   VITE_AUTH_MODE=sms                 │
│       │                         │       │                          │       │                              │
│       │ HTTP /api/*             │       │ HTTPS /api/*             │       │ HTTPS /api/*                 │
│       ▼                         │       └──────────────────────────┼───────┘  ⚠️ 共用同一后端              │
│  minicare-server（:3001）         │                                  │                                      │
│  NestJS + .env.local            │        CloudRun: minicare-api（当前阶段 staging / production 共用）          │
│  AUTH_TEST_MODE=true            │    AUTH_TEST_MODE=true  ⚠️                                               │
│       │                         │    DB_NAME=minicare_staging  ⚠️                                          │
│       │                         │    CORS_ORIGINS=minicare.top, xxx.tcloudbaseapp.com                      │
│       │                         │                   │                                                      │
│       ▼                         │                   ▼                                                      │
│  CynosDB: minicare_dev          │   CynosDB: minicare_staging  ⚠️ production 暂时也连此库                    │
│  （远程，公网直连）                 │   （远程 CynosDB 公网地址）                                                  │
│                                 │                                  │                                      │
│  验证码：固定 123456               │  验证码：固定 123456               │  验证码：真实短信                         │
└─────────────────────────────────┴──────────────────────────────────────────────────────────────────────┘
```

### 3.3 本地开发环境说明

本地开发与远端环境**完全隔离**，所有服务均在本机运行，但数据库直连远程 CynosDB 开发库（避免本地 MySQL 与 CynosDB 的兼容性差异）。

```
开发者本机
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  浏览器                                                           │
│  http://localhost:3000                                           │
│       │  Vite dev server 代理                                    │
│       │  /api/* → http://localhost:3001                         │
│       ▼                                                          │
│  minicare-web（Vite dev server, port 3000）                      │
│  .env.development / .env.local                                  │
│  VITE_AUTH_MODE=test（固定验证码 123456）                          │
│       │                                                          │
│       │ HTTP /api/*                                              │
│       ▼                                                          │
│  minicare-server（NestJS, port 3001）                            │
│  .env.local                                                     │
│  AUTH_TEST_MODE=true                                            │
│  CORS_ORIGINS=http://localhost:3000,http://localhost:5173       │
│       │                                                          │
└───────┼──────────────────────────────────────────────────────────┘
        │ 公网直连（本地 MySQL 与 CynosDB 存在兼容性差异，故直连远程）
        ▼
  CynosDB: minicare_dev（远程开发库）
  sh-cynosdbmysql-grp-6a0nj6a8.sql.tencentcdb.com:21002
```

**关键配置**：

| 配置项        | 值                                 | 位置                                     |
| ------------- | ---------------------------------- | ---------------------------------------- |
| 前端端口      | `3000`                             | `vite.config.ts`                         |
| 后端端口      | `3001`                             | `minicare-server/.env.local` `PORT=3001` |
| Vite 代理     | `/api/*` → `http://localhost:3001` | `vite.config.ts`                         |
| 数据库        | `minicare_dev`（远程 CynosDB）     | `minicare-server/.env.local`             |
| 短信验证码    | 固定 `123456`，不发真实短信        | `AUTH_TEST_MODE=true`                    |
| CloudBase SDK | 连远程 CloudBase 环境（存储/认证） | `VITE_TCB_ENV_ID`                        |

**本地启动命令**：

```bash
# 终端 1：启动后端
cd minicare-server
npm run start:dev      # NODE_ENV=development，自动加载 .env.local

# 终端 2：启动前端
cd minicare-web
npm run dev            # 加载 .env.development，Vite proxy 代理到 :3001
```

> 首次使用本地开发环境注意：`minicare_dev` 是独立空库，需用测试手机号重新注册（清空浏览器 `localStorage.minicare_token` 后再登录）。

### 3.4 三环境全景架构图（未来阶段，正式上线后）

> production 后端从 staging 独立出来，各环境完全隔离，不再有 ⚠️ 折中。

```
┌─────────────────────────────────┬──────────────────────────────────┬──────────────────────────────────────┐
│      本地开发（development）      │         staging（测试）             │         production（正式）             │
│      开发者本机                   │         内部测试人员                  │         正式用户                       │
├─────────────────────────────────┼──────────────────────────────────┼──────────────────────────────────────┤
│                                 │                                  │                                      │
│  浏览器                           │  浏览器                            │  浏览器                               │
│  http://localhost:3000          │  xxx.tcloudbaseapp.com           │  minicare.top                        │
│       │                         │  /staging/                       │       │ CNAME → CloudBase CDN        │
│  Vite dev server                │       │                          │       │                              │
│  /api/* 代理 → :3001             │       │                          │       │                              │
│       │                         │       ▼                          │       ▼                              │
│       ▼                         │   CloudBase 静态托管               │   CloudBase 静态托管                   │
│  minicare-web（:3000）            │   cloudPath: /staging/           │   cloudPath: /                       │
│  .env.development               │   .env.staging                   │   .env.production                    │
│  VITE_AUTH_MODE=test            │   VITE_AUTH_MODE=test            │   VITE_AUTH_MODE=sms                 │
│       │                         │       │                          │       │                              │
│       │ HTTP /api/*             │       │ HTTPS /api/*             │       │ HTTPS /api/*                 │
│       ▼                         │       ▼                          │       ▼                              │
│  minicare-server（:3001）         │  CloudRun: minicare-api-staging  │  CloudRun: minicare-api              │
│  NestJS + .env.local            │  AUTH_TEST_MODE=true             │  AUTH_TEST_MODE=false                │
│  AUTH_TEST_MODE=true            │  DB_NAME=minicare_staging        │  DB_NAME=minicare-cloud-xxx          │
│       │                         │  CORS_ORIGINS=xxx.tcloudbase... │  CORS_ORIGINS=minicare.top,...       │
│       │                         │       │                          │       │                              │
│       ▼                         │       ▼                          │       ▼                              │
│  CynosDB: minicare_dev          │  CynosDB: minicare_staging       │  CynosDB: minicare-cloud-xxx         │
│  （远程，公网直连）                 │  （测试数据，可随时清空）              │  （生产数据，严格保护）                   │
│                                 │                                  │                                      │
│  验证码：固定 123456               │  验证码：固定 123456               │  验证码：真实短信                         │
└─────────────────────────────────┴──────────────────────────────────────────────────────────────────────┘
```

### 3.5 发布流程（当前阶段）

```
staging 前端：
  build:staging ──► uploadFiles(cloudPath='/staging/') ──► xxx.tcloudbaseapp.com/staging/
                                                            （内部验证，验证码 123456）

production 前端：
  build:prod    ──► uploadFiles(cloudPath='/')          ──► minicare.top/
                                                            （正式入口，但共用 staging 后端）

后端：
  统一使用 minicare-api（staging 配置）
  两个前端均调用同一个 CloudRun 服务
```

---

## 四、详细方案

### 4.1 前端变更（minicare-web）

**无需修改 `vite.config.ts` 和路由配置**。

原因：项目使用 `createHashRouter`（Hash 路由），URL 形如 `minicare.top/#/login`，路由路径在 `#` 之后，不受宿主域名和子路径影响，天然兼容子路径部署。

**`minicare-web/.env.production`** — 无需变更，`VITE_API_BASE_URL` 继续指向现有 CloudRun 地址（staging 服务）：

```bash
# 不变
VITE_API_BASE_URL=https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com
VITE_AUTH_MODE=sms   # production 前端仍使用真实短信流程
```

> `VITE_AUTH_MODE=sms` 的含义是前端走真实短信验证码流程，但后端 `AUTH_TEST_MODE=true` 此时不会生效（后端 test mode 只影响 `/api/auth/send-code` 和 `/api/auth/verify-code` 接口，`sms` 模式走的是 `/api/auth/tcb-login`）。两者不冲突。

**`minicare-web/.env.staging`** — 已有，无需变更：

```bash
VITE_AUTH_MODE=test   # staging 前端走固定验证码 123456
```

### 4.2 后端变更（minicare-server）

> **关键约束：CloudRun 环境变量来源**
>
> `minicare-api` 容器运行时的**所有环境变量，由 CloudRun 控制台的服务版本配置（EnvParams）注入**，与代码仓库中的 `.env.staging` / `.env.production` 文件**完全无关**。
>
> 原因：`main.ts` 开头的 dotenv 加载逻辑仅在 `NODE_ENV !== 'production'` 时执行（只有本地开发才读 `.env.local`）。CloudRun 容器启动时 `NODE_ENV=production`，**不会读取任何 `.env` 文件**。
>
> 因此：
> - `.env.staging` / `.env.production` 是纯人工参考文档，标注变量含义和示例值，**不影响任何运行时行为**
> - 查看线上实际 EnvParams：`queryCloudRun(action='detail', detailServerName='minicare-api')`
> - 修改线上 EnvParams：需要重新执行 `manageCloudRun(action='deploy')` 并在 `serverConfig.EnvParams` 字段中写入完整配置

#### 变更一：CORS 改为环境变量白名单控制

**`main.ts`** 中的 CORS 逻辑重写——从「仅本地开发启用」改为「所有环境按域名白名单启用」：

```ts
// 变更前
if (process.env.NODE_ENV !== "production") {
  app.enableCors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  });
}

// 变更后
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.enableCors({
  origin: corsOrigins.length > 0 ? corsOrigins : false,
  credentials: true,
});
```

**`minicare-server/.env.local`** 增加本地开发 CORS 配置：

```bash
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173
```

**CloudRun EnvParams 新增字段**（当前阶段，单服务）：

```json
"CORS_ORIGINS": "https://minicare.top,https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com"
```

#### 变更二：WebSocket CORS 收紧

**`events.gateway.ts`** 中的 WebSocket CORS 配置同步收紧：

```ts
// 变更前
@WebSocketGateway({ namespace: '/ws', cors: { origin: '*' } })

// 变更后
@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',').map(s => s.trim()) ?? false,
    credentials: true,
  },
})
```

### 4.3 CloudBase 控制台操作

#### 操作一：添加 Auth 安全域名

路径：CloudBase 控制台 → 环境 → 安全配置 → Web 安全域名 → 添加

需要添加：`minicare.top`

#### 操作二：静态托管申请 SSL 证书

路径：CloudBase 控制台 → 静态托管 → 自定义域名 → 添加域名

CloudBase 支持免费申请 SSL 证书，或上传腾讯云证书服务中已有的证书。

#### 操作三：绑定自定义域名到静态托管

绑定 `minicare.top` 后，控制台会提供：

- CNAME 目标值（供 DNS 配置使用）
- TXT 域名所有权验证记录（供 DNS 配置使用）

### 4.4 DNS 配置（域名注册商操作）

| 类型    | 主机记录 | 记录值                                 | 说明           |
| ------- | -------- | -------------------------------------- | -------------- |
| `TXT`   | `@`      | CloudBase 提供的验证值                 | 域名所有权验证 |
| `CNAME` | `@`      | CloudBase CDN 节点（控制台绑定时提供） | 静态托管入口   |

> DNS 生效时间通常 5~30 分钟，最长 24 小时。

---

## 五、执行清单（当前阶段）

### 前置条件

- [ ] **ICP 备案审核通过**（当前进行中）—— **阻塞后续所有步骤**

---

### 阶段一：备案通过后立即执行（约 30 分钟）

**CloudBase 控制台操作**

- [ ] 1.1 Auth 安全域名白名单添加 `minicare.top`
- [ ] 1.2 静态托管申请 SSL 证书（或上传腾讯云已有证书）
- [ ] 1.3 静态托管绑定自定义域名 `minicare.top`，获取 CNAME 目标值和 TXT 验证值

**DNS 操作（域名注册商后台）**

- [ ] 1.4 添加 TXT 记录，完成域名所有权验证
- [ ] 1.5 添加 CNAME 记录 `@` → CloudBase CDN 节点（1.3 中获取）
- [ ] 1.6 等待 DNS 生效（5~30 分钟，可用 `dig minicare.top CNAME` 确认）
- [ ] 1.7 验证：`curl -I https://minicare.top` 返回 200

---

### 阶段二：后端代码变更（约 1 小时）

**代码修改**

- [ ] 2.1 修改 `minicare-server/src/main.ts`：CORS 改为从 `CORS_ORIGINS` 环境变量读取白名单
- [ ] 2.2 修改 `minicare-server/src/websocket/events.gateway.ts`：WebSocket CORS 从 `'*'` 改为读取 `CORS_ORIGINS`
- [ ] 2.3 修改 `minicare-server/.env.local`：添加 `CORS_ORIGINS=http://localhost:3000,http://localhost:5173`

**重新部署 CloudRun**

- [ ] 2.4 `npm run build` 编译后端
- [ ] 2.5 执行 `manageCloudRun deploy`，`EnvParams` 中新增 `CORS_ORIGINS` 字段（含 minicare.top 和 tcloudbaseapp.com 两个域名）
- [ ] 2.6 验证 `/health` 端点正常响应

---

### 阶段三：前端部署（约 30 分钟）

**staging 前端**

- [ ] 3.1 `npm run build:staging` 构建
- [ ] 3.2 `uploadFiles(cloudPath='/staging/')` 上传
- [ ] 3.3 访问 `xxx.tcloudbaseapp.com/staging/` 验证功能（验证码 `123456` 可正常登录）

**production 前端（接入正式域名）**

- [ ] 3.4 `npm run build:prod` 构建
- [ ] 3.5 `uploadFiles(cloudPath='/')` 上传
- [ ] 3.6 访问 `minicare.top` 验证功能（真实短信登录，后端为 staging 服务）

---

### 未来阶段（正式上线时执行，暂不计划）

> 触发条件：有真实用户，需要严格隔离生产数据，或对 staging 服务稳定性有顾虑时。

- [ ] F.1 新建 CloudRun 服务 `minicare-api-staging`，迁移当前 `minicare-api` 配置（连 `minicare_staging` 库）
- [ ] F.2 将 `minicare-api`（原服务）重新部署为 production 配置：`AUTH_TEST_MODE=false`，`DB_NAME=minicare-cloud-xxx`
- [ ] F.3 更新 `minicare-web/.env.staging`，`VITE_API_BASE_URL` 改为新 staging 服务地址
- [ ] F.4 重新执行前端 staging 构建和上传（3.1~3.3）
- [ ] F.5 验证两套服务完全独立

---

## 六、关键约束

| 约束                                        | 说明                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **备案先行**                                | 未备案的域名无法在 CloudBase 绑定静态托管，绑定操作会被直接拒绝                                                                                              |
| **CORS 顺序**                               | 阶段二（后端 CORS 变更）必须在阶段三 production 前端上线之前完成，否则 `minicare.top` 访问 API 会被浏览器 CORS 拒绝                                          |
| **Auth 安全域名**                           | 步骤 1.1 必须在步骤 3.6 之前完成，否则 CloudBase SDK 在 `minicare.top` 下初始化报错（登录失败）                                                              |
| **不影响现有访问**                          | 阶段一~三均为增量变更，不影响现有访问                                                                                                                        |
| **当前阶段 minicare.top 共用 staging 后端** | 当前阶段 `minicare.top` 的 API 请求打到 staging 服务（`AUTH_TEST_MODE=true`），前端 `VITE_AUTH_MODE=sms` 走真实短信但后端 test mode 不影响该流程，两者不冲突 |

---

## 七、访问地址汇总

### 当前阶段

| 环境                | 前端访问地址                                                                    | 后端 API 地址                                                                              | 数据库                             | 短信验证码    |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- | ------------- |
| **本地开发**        | `http://localhost:3000`                                                         | `http://localhost:3001`（本机 NestJS）                                                     | `minicare_dev`（远程 CynosDB）     | 固定 `123456` |
| **staging**         | `https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/staging/` | `https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com`（staging 服务）          | `minicare_staging`                 | 固定 `123456` |
| **production 前端** | `https://minicare.top`                                                          | `https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com`（**共用 staging 服务**） | `minicare_staging`（**暂时共用**） | 真实短信      |

### 未来阶段（正式上线后）

| 环境           | 前端访问地址                                                                    | 后端 API 地址                                                                             | 数据库                            | 短信验证码    |
| -------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------- | ------------- |
| **本地开发**   | `http://localhost:3000`                                                         | `http://localhost:3001`（本机 NestJS）                                                    | `minicare_dev`（远程 CynosDB）    | 固定 `123456` |
| **staging**    | `https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/staging/` | `https://minicare-api-staging-xxx.sh.run.tcloudbase.com`（独立 staging 服务）             | `minicare_staging`                | 固定 `123456` |
| **production** | `https://minicare.top`                                                          | `https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com`（独立 production 服务） | `minicare-cloud-6gqledlle0132cbe` | 真实短信      |
