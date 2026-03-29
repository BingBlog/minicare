# INFRA-01 · CloudBase 基础设施搭建执行清单

> 平台：腾讯云 CloudBase（云开发）  
> 适用阶段：MVP 上线前  
> 最后更新：2026-03-29（v2：后端框架从 Express 更新为 Fastify；前端补充 React+Vite 部署规范）

---

## 执行前提

| 项目 | 说明 |
|------|------|
| 腾讯云账号 | 已完成实名认证，建议使用企业账号 |
| ICP 备案 | 域名备案（Web H5 及 API 域名）已完成或进行中 |
| 手机号 SMS 配额 | 在 CloudBase 控制台申请短信配额（Auth 登录） |
| 开发机环境 | Node.js ≥ 18、`@cloudbase/cli` 已安装 |

---

## 阶段一：CloudBase 环境初始化

### 1.1 创建 CloudBase 环境

- [ ] 登录 [腾讯云 CloudBase 控制台](https://console.cloud.tencent.com/tcb)
- [ ] 点击「新建环境」，选择「按量计费」（MVP 阶段避免月租包锁定）
- [ ] 地域选择：**广州**（国内延迟最优，后续可多地域扩展）
- [ ] 记录 `envId`（格式：`xxx-xxxxxx`，后续 SDK 初始化必用）

### 1.2 安装 CloudBase CLI

```bash
npm install -g @cloudbase/cli
cloudbase login          # 扫码授权
cloudbase env list       # 确认环境已创建
```

### 1.3 初始化项目配置文件

```bash
# 在项目根目录执行
cloudbase init
```

生成 `cloudbaserc.json`，建议内容：

```json
{
  "envId": "<your-env-id>",
  "framework": {
    "name": "minicare",
    "plugins": {
      "run": {
        "use": "@cloudbase/framework-plugin-run"
      }
    }
  }
}
```

---

## 阶段二：数据库初始化

> 参考文档：`DB-02-schema.md`（完整 MySQL DDL）  
> 执行方式：CloudBase MCP 工具或控制台 SQL 执行面板

### 2.1 开启 MySQL 实例

- [ ] 控制台 → 「数据库」→「关系型数据库」→「开通 MySQL」
- [ ] 规格：MVP 阶段选 **1C1G**（后续按量升配）
- [ ] 记录数据库名（默认与 envId 同名），供后续 SDK 连接

### 2.2 按顺序执行建表 DDL

按以下顺序执行，确保外键依赖满足：

```
第 1 批（无外键依赖）：
  → user_account

第 2 批（依赖 user_account）：
  → family_group

第 3 批（依赖 family_group + user_account）：
  → family_member

第 4 批（依赖 family_group + family_member）：
  → baby_profile

第 5 批（依赖 baby_profile + family_member，可并行）：
  → feeding_record
  → symptom_record
  → growth_record
  → sleep_record
  → activity_record
  → diaper_record
  → health_record
  → medical_record

第 6 批（依赖 baby_profile）：
  → food_observation
```

- [ ] 执行完毕后，在控制台执行 `SHOW TABLES;` 确认共 **13 张表**
- [ ] 执行 `SELECT * FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE();` 确认外键约束已创建

### 2.3 安全规则配置

在控制台 → 「数据库」→「安全规则」中配置：

- [ ] 关闭所有表的**公开读写**权限（默认关闭，确认未误开）
- [ ] 所有数据库操作通过 **CloudRun 服务端 SDK** 进行（不走客户端直连）
- [ ] 客户端 Web H5 通过 `@cloudbase/js-sdk` + Auth Token 访问受保护的云函数/CloudRun API

---

## 阶段三：Auth 认证配置

### 3.1 开启手机号短信登录

- [ ] 控制台 → 「用户管理」→「登录方式」→ 开启「手机号」登录
- [ ] 配置短信签名（需与备案主体一致）
- [ ] 配置短信模板（验证码模板）
- [ ] 测试发送验证码（控制台调试工具）

### 3.2 配置合法域名

- [ ] 控制台 → 「用户管理」→「登录设置」→「安全域名」
- [ ] 添加 Web H5 域名（本地开发添加 `localhost`；生产添加实际域名）
- [ ] iOS / Android 无需配置（通过 HTTP API 接入，不受域名限制）

---

## 阶段四：云存储配置（照片 CDN）

### 4.1 存储桶权限

- [ ] 控制台 → 「云存储」→「权限设置」
- [ ] 设置为**私有读写**（照片含用户隐私）
- [ ] 通过 CloudRun 服务端生成临时上传 URL，下发给客户端直传

### 4.2 CDN 缓存配置

- [ ] 控制台 → 「云存储」→「域名与 CDN」→ 开启 CDN 加速
- [ ] 配置缓存规则：图片文件 `Cache-Control: public, max-age=31536000, immutable`
- [ ] 配置自定义域名（可选，`cdn.minicare.xxx.com`）

### 4.3 存储目录规划

```
cloud://env-id.bucket/
  ├── avatars/         # 用户头像（{user_id}.jpg）
  ├── symptoms/        # 症状照片（{baby_id}/{record_id}/{n}.jpg）
  ├── diapers/         # 尿布照片（{baby_id}/{record_id}/{n}.jpg）
  ├── growth/          # 生长记录报告（{baby_id}/{record_id}/{n}.jpg）
  └── medical/         # 病历照片（{baby_id}/{record_id}/{n}.jpg）
```

- [ ] 在控制台手动创建上述目录（或在 CloudRun 代码中首次上传时自动创建）

---

## 阶段五：CloudRun 后端服务部署

> **框架选型：NestJS v10**
> 理由：minicare 有 3 层角色 × 50+ API 的权限校验矩阵，NestJS Guards 装饰器声明一次全局复用；
> `MinNum=1` 热实例消除冷启动劣势；`@nestjs/swagger` 自动生成 OpenAPI 文档供 iOS/Android 联调；
> Module 分层约定保障长期可维护性。
> 详见 `docs/architecture.md` § 三、后端技术选型

### 5.1 项目结构

```
minicare-server/
  ├── src/
  │   ├── main.ts                     # NestJS 应用入口，监听 process.env.PORT
  │   ├── app.module.ts               # 根模块，汇总所有业务 Module
  │   ├── auth/                       # 认证模块
  │   │   ├── auth.module.ts
  │   │   ├── auth.controller.ts      # POST /auth/send-code, /auth/verify-code
  │   │   ├── auth.service.ts
  │   │   ├── jwt.guard.ts            # ① JWT 验证 Guard
  │   │   └── dto/
  │   ├── family/                     # 家庭模块
  │   │   ├── family.module.ts
  │   │   ├── family.controller.ts
  │   │   ├── family.service.ts
  │   │   ├── family-member.guard.ts  # ② family 成员资格 Guard
  │   │   ├── role.guard.ts           # ③ 角色权限 Guard
  │   │   └── dto/
  │   ├── baby/                       # 宝宝档案模块
  │   ├── records/                    # 业务记录模块（8类）
  │   │   ├── feeding/
  │   │   ├── sleep/                  # 含计时状态机
  │   │   ├── diaper/
  │   │   ├── health/
  │   │   ├── symptom/
  │   │   ├── activity/
  │   │   ├── growth/                 # 含 WHO 百分位计算
  │   │   └── medical/                # 含 OCR 触发
  │   ├── storage/                    # GET /storage/upload-url
  │   ├── websocket/                  # @WebSocketGateway()，按 family_id 分组
  │   ├── scheduler/                  # @Cron() 定时任务（睡眠超时检查等）
  │   └── common/
  │       ├── database/               # mysql2 连接池 Provider
  │       ├── cloudbase/              # @cloudbase/node-sdk Provider
  │       └── interceptors/           # 响应格式统一
  ├── Dockerfile                      # 容器构建（node:20-alpine）
  ├── nest-cli.json
  ├── tsconfig.json
  └── package.json
```

### 5.2 关键环境变量

在 CloudRun 控制台配置以下环境变量（不存入代码）：

| 变量名 | 说明 |
|--------|------|
| `TCB_ENV_ID` | CloudBase 环境 ID |
| `DB_HOST` | MySQL 内网地址（CloudBase 控制台获取） |
| `DB_PORT` | `3306` |
| `DB_NAME` | 数据库名 |
| `DB_USER` | 数据库用户名 |
| `DB_PASS` | 数据库密码 |
| `JWT_SECRET` | JWT 签名密钥（随机 32 字节） |
| `SMS_SIGN` | 短信签名名称 |
| `SMS_TEMPLATE_ID` | 短信验证码模板 ID |

- [ ] 所有环境变量已在 CloudRun「环境变量」面板配置完毕
- [ ] **禁止**将 `DB_PASS` / `JWT_SECRET` 提交到 Git 仓库

### 5.3 部署 CloudRun 服务

```bash
# 方式一：通过 CLI 部署
cloudbase run deploy --name minicare-api --path ./minicare-server

# 方式二：GitHub Actions CI/CD（推荐）
# 在 .github/workflows/deploy.yml 中配置自动部署
```

- [ ] 首次部署成功，服务状态为「运行中」
- [ ] 配置「最小实例数=1」防止冷启动（可选，注意成本）
- [ ] 配置「自定义域名」：`api.minicare.xxx.com`（需 HTTPS + ICP 备案）
- [ ] 通过 `curl https://api.minicare.xxx.com/health` 确认服务健康

### 5.4 WebSocket 配置（家庭实时同步）

- [ ] CloudRun 服务监听 WebSocket 升级请求（`/ws` 路径）
- [ ] 在 CloudRun 控制台开启「长连接支持」
- [ ] 实现消息类型：
  - `record:created` — 家庭成员新增记录后广播
  - `record:updated` — 家庭成员修改记录后广播
  - `member:joined` — 新成员接受邀请后广播

---

## 阶段六：Web H5 前端（React + Vite）静态托管

> **技术栈：React 18 + Vite 5**
> CloudBase 静态托管对 Vite 构建产物完全兼容；`@cloudbase/js-sdk` 通过 npm 安装，支持 Tree-shaking。
> 详见 `docs/architecture.md` § 二、Web 前端技术选型

### 6.1 前端项目初始化

```bash
# 创建 React + Vite + TypeScript 项目
npm create vite@latest minicare-web -- --template react-ts
cd minicare-web

# 安装核心依赖
npm install @cloudbase/js-sdk @tanstack/react-router @tanstack/react-query
npm install zustand recharts react-hook-form zod @hookform/resolvers
npm install @radix-ui/react-dialog @radix-ui/react-slot
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 6.2 Vite 配置（关键）

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',           // ⚠️ 必须使用相对路径，静态托管 CDN 部署必须
  build: {
    outDir: 'dist',
  },
})
```

### 6.3 CloudBase SDK 初始化（单例）

```typescript
// src/lib/cloudbase.ts
import cloudbase from '@cloudbase/js-sdk'

// ⚠️ 必须同步初始化，不能 async/lazy import
export const app = cloudbase.init({
  env: import.meta.env.VITE_TCB_ENV_ID,   // .env.local 中配置
  region: 'ap-shanghai',
  auth: { detectSessionInUrl: true },
})

export const auth = app.auth
```

```bash
# .env.local（不提交 Git）
VITE_TCB_ENV_ID=minicare-cloud-6gqledlle0132cbe
VITE_API_BASE_URL=https://minicare-api.xxxx.run.tcloudbase.com
```

### 6.4 路由配置（Hash 模式）

```typescript
// src/router.ts — TanStack Router，Hash 模式
import { createHashHistory, createRouter } from '@tanstack/react-router'

const hashHistory = createHashHistory()
export const router = createRouter({ routeTree, history: hashHistory })
// ✅ Hash 模式（#/home）：静态托管刷新不会 404，无需服务端配置
```

### 6.5 构建并部署到 CloudBase 静态托管

```bash
# 构建
VITE_TCB_ENV_ID=minicare-cloud-xxx VITE_API_BASE_URL=https://... npm run build

# 部署到 CloudBase 静态托管（根目录）
cloudbase hosting deploy ./dist -e minicare-cloud-6gqledlle0132cbe

# 或部署到子路径
cloudbase hosting deploy ./dist minicare/ -e minicare-cloud-6gqledlle0132cbe
```

- [ ] 静态托管已开启，默认域名可访问（`xxx.tcloudbaseapp.com`）
- [ ] `vite.config.ts` 中 `base: './'` 已配置（相对路径，CDN 必须）
- [ ] `TanStack Router` 使用 Hash 模式（`createHashHistory`），刷新不 404
- [ ] 配置自定义域名（`app.minicare.xxx.com`）+ HTTPS 证书
- [ ] 在控制台「安全域名」中添加前端域名（Auth SDK 跨域要求）

### 6.6 前端调用 CloudRun API

```typescript
// src/api/records/feeding.ts
import { app } from '@/lib/cloudbase'

export async function createFeedingRecord(data: CreateFeedingInput) {
  // 方式一：通过 CloudBase SDK 调用 CloudRun（自动注入 Auth Token）
  const res = await app.callContainer({
    name: 'minicare-api',
    method: 'POST',
    path: '/records/feeding',
    header: { 'Content-Type': 'application/json' },
    data,
  })
  return res.data
}

// 方式二：直接 fetch（手动附加 Bearer Token）
const { data: session } = await auth.getSession()
const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/records/feeding`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token}`,
  },
  body: JSON.stringify(data),
})
```

- [ ] 确认 SDK 版本 `@cloudbase/js-sdk >= 2.x`
- [ ] 所有 API 请求指向 CloudRun 服务（`VITE_API_BASE_URL`）
- [ ] 图片上传走「客户端直传」（从 CloudRun 获取临时上传 URL → 直传 CloudBase 云存储）

---

## 阶段七：移动端接入（iOS / Android）

### 7.1 HTTP API 接入方式

移动端**不使用 CloudBase 原生 SDK**，统一通过 HTTP/WebSocket 接入 CloudRun API：

| 能力 | 接入方式 |
|------|---------|
| 认证 | `POST /auth/send-code` + `POST /auth/verify-code` → 返回 JWT Token |
| 数据读写 | 携带 `Authorization: Bearer <token>` 的 HTTP REST API |
| 实时推送 | WebSocket `wss://api.minicare.xxx.com/ws?token=<jwt>` |
| 图片上传 | `GET /storage/upload-url` → 获取预签名 URL → 直传 CloudBase CDN |

### 7.2 iOS 接入清单

- [ ] `URLSession` 封装 HTTP 客户端，支持 Token 刷新拦截器
- [ ] `Starscream` 库集成 WebSocket（`pod 'Starscream'`）
- [ ] `Kingfisher` 库集成图片缓存（`pod 'Kingfisher'`）
- [ ] Keychain 存储 JWT Token + 用户基本信息
- [ ] Core Data schema 与云端 13 张表的缓存字段一一对应
- [ ] App 启动时拉取最新 `baby_profile` / `family_group` / `family_member` 元数据

### 7.3 Android 接入清单

- [ ] `OkHttp` + `Retrofit` 封装 HTTP 客户端，支持 Token 刷新拦截器
- [ ] `OkHttp WebSocket` 集成实时推送
- [ ] `Coil` 库集成图片缓存（`implementation 'io.coil-kt:coil:2.x'`）
- [ ] `EncryptedSharedPreferences` 存储 JWT Token + 用户基本信息
- [ ] Room 数据库 schema 与云端 13 张表的缓存字段一一对应
- [ ] App 启动时拉取最新元数据（同 iOS 逻辑）

---

## 阶段八：云函数（定时任务）

### 8.1 睡眠超时自动标记

```typescript
// functions/sleep-timeout-checker/index.ts
// 每小时触发一次，将 status='sleeping' 且 start_time < NOW()-12h 的记录标记为 abnormal
```

- [ ] 创建云函数 `sleep-timeout-checker`
- [ ] 配置定时触发器：`0 * * * * *`（每小时整点）
- [ ] 部署并验证：手动触发一次，查看日志

### 8.2 辅食观察期到期提醒（可选，MVP 后）

- [ ] 创建云函数 `food-obs-reminder`
- [ ] 每日 09:00 查询 `observation_end = TODAY()` 且 `status=1` 的记录
- [ ] 通过腾讯云短信或 App 推送通知家长确认

---

## 阶段九：监控与运维

### 9.1 基础监控

- [ ] CloudBase 控制台 → 「监控告警」→ 配置以下告警：
  - MySQL 连接数 > 80% → 邮件告警
  - CloudRun 错误率 > 1% → 邮件 + 短信告警
  - 云存储用量 > 4GB → 邮件告警（免费额度边界）

### 9.2 日志接入

- [ ] CloudRun 服务日志接入「日志服务（CLS）」
- [ ] 关键操作日志（写入/删除/邀请）需结构化记录 `{ user_id, action, table, record_id, timestamp }`

### 9.3 数据备份

- [ ] 控制台 → 「数据库」→「备份管理」→ 开启每日自动备份
- [ ] 备份保留周期：**30 天**

---

## 成本估算（MVP 阶段，≤1000 DAU）

| 资源 | 配置 | 月估算费用 |
|------|------|-----------|
| CloudBase 环境 | 按量计费 | 免费额度覆盖 |
| MySQL | 1C1G，按量 | ~¥30–50/月 |
| CloudRun | 0.25C/0.5G，最小实例=0 | ~¥10–20/月（流量触发） |
| 云存储 | 5GB + CDN | ~¥5–10/月 |
| SMS 短信 | 1000条验证码 | ~¥50/月 |
| **合计** | | **~¥100–130/月** |

> 随 DAU 增长，主要费用增量来自 MySQL 读写次数和 CloudRun 调用次数。  
> 建议在 10,000 DAU 时评估是否升级至包年包月套餐。

---

## 验收检查项

在正式上线前，逐项确认：

- [ ] 数据库 13 张表全部创建，外键约束验证通过
- [ ] 手机号登录全流程可用（发送验证码 → 登录 → 获取 Token）
- [ ] 家庭创建、邀请、接受邀请全流程可用
- [ ] 至少 3 种业务记录（喂养/睡眠/尿布）的增删查可用
- [ ] 同一家庭两台设备实时同步验证通过（WebSocket 消息接收）
- [ ] 照片上传 → CDN 访问链路验证通过
- [ ] JWT Token 过期后自动刷新验证通过
- [ ] 无网络状态下 App 显示「无网络提示」，禁止提交数据
- [ ] 监控告警配置完毕，测试告警可正常触发
- [ ] 自动备份已开启
