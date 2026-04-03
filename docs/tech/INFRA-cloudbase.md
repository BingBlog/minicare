# INFRA-01 · CloudBase 基础设施搭建执行清单

> 平台：腾讯云 CloudBase（云开发）  
> 适用阶段：MVP 上线前  
> 最后更新：2026-03-30（v11：阶段六 Web H5 前端静态托管完成，前端已上线）

---

## 📊 执行进度总览

| 阶段   | 名称                       | 状态      | 完成时间   |
| ------ | -------------------------- | --------- | ---------- |
| 阶段一 | CloudBase 环境初始化       | ✅ 已完成 | 2026-03-29 |
| 阶段二 | 数据库初始化（MySQL 建表） | ✅ 已完成 | 2026-03-29 |
| 阶段三 | Auth 认证配置              | ✅ 已完成 | 2026-03-29 |
| 阶段四 | 云存储配置（照片 CDN）     | ✅ 已完成 | 2026-03-29 |
| 阶段五 | CloudRun 后端服务部署      | ✅ 已完成 | 2026-03-29 |
| 阶段六 | Web H5 前端静态托管        | ✅ 已完成 | 2026-03-30 |
| 阶段七 | 移动端接入（iOS/Android）  | 🔲 待执行 | —          |
| 阶段八 | 云函数（定时任务）         | ✅ 已完成 | 2026-04-03 |
| 阶段九 | 监控与运维                 | 🔲 待执行 | —          |

---

## 执行前提

| 项目            | 说明                                         |
| --------------- | -------------------------------------------- |
| 腾讯云账号      | 已完成实名认证，建议使用企业账号             |
| ICP 备案        | 域名备案（Web H5 及 API 域名）已完成或进行中 |
| 手机号 SMS 配额 | 在 CloudBase 控制台申请短信配额（Auth 登录） |
| 开发机环境      | Node.js ≥ 18、`@cloudbase/cli` 已安装        |

---

## 阶段一：CloudBase 环境初始化 ✅ 已完成（2026-03-29）

> 验收结论：全部通过。envId 已确认，CLI 已登录，所有基础资源就绪。

### 关键信息记录

| 项目                | 值                                                              |
| ------------------- | --------------------------------------------------------------- |
| **envId**           | `minicare-cloud-6gqledlle0132cbe`                               |
| **环境别名**        | `minicare-cloud`                                                |
| **地域**            | `ap-shanghai`（上海）                                           |
| **套餐**            | 体验版，到期 `2026-09-29`                                       |
| **静态托管域名**    | `minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com`  |
| **云存储 CDN 域名** | `6d69-minicare-cloud-6gqledlle0132cbe-1253854169.tcb.qcloud.la` |
| **云函数命名空间**  | `minicare-cloud-6gqledlle0132cbe`                               |
| **CloudBase CLI**   | v2.12.9                                                         |
| **本地 Node.js**    | v24.14.0                                                        |

### 1.1 创建 CloudBase 环境

- [x] 登录 [腾讯云 CloudBase 控制台](https://console.cloud.tencent.com/tcb)
- [x] 点击「新建环境」，选择「按量计费」（MVP 阶段避免月租包锁定）
- [x] 地域选择：**上海**（`ap-shanghai`）
- [x] 记录 `envId`：`minicare-cloud-6gqledlle0132cbe`

### 1.2 安装 CloudBase CLI

```bash
npm install -g @cloudbase/cli
cloudbase login          # 扫码授权
cloudbase env list       # 确认环境已创建
```

- [x] CLI v2.12.9 已安装，已登录，MCP 工具认证 READY

### 1.3 初始化项目配置文件

```bash
# 在项目根目录执行
cloudbase init
```

生成 `cloudbaserc.json`，建议内容：

```json
{
  "envId": "minicare-cloud-6gqledlle0132cbe",
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

## 阶段二：数据库初始化 ✅ 已完成（2026-03-29）

> 验收结论：全部通过。13 张表全部建立，23 条外键约束均已创建。
> 执行方式：CloudBase MCP 工具（`manageSqlDatabase` + `querySqlDatabase`）

### MySQL 实例信息

| 项目 | 值 |
|------|----||
| **实例 ID** | `cynosdbmysql-dg17geyu` |
| **状态** | `running` |
| **内网地址** | `172.17.0.9:3306` |
| **数据库名** | `minicare-cloud-6gqledlle0132cbe` |
| **MySQL 版本** | `8.0` |
| **规格** | Serverless（0.25~0.5 vCPU，自动弹性） |

### 2.1 开启 MySQL 实例

- [x] MySQL 实例已就绪（`READY`，`running`）
- [x] 内网地址已确认：`172.17.0.9:3306`
- [x] 数据库名与 envId 同名：`minicare-cloud-6gqledlle0132cbe`

### 2.2 按顺序执行建表 DDL

按以下顺序执行，确保外键依赖满足：

```
第 1 批（无外键依赖）：
  → user_account       ✅

第 2 批（依赖 user_account）：
  → family_group       ✅

第 3 批（依赖 family_group + user_account）：
  → family_member      ✅

第 4 批（依赖 family_group + family_member）：
  → baby_profile       ✅

第 5 批（依赖 baby_profile + family_member，可并行）：
  → feeding_record     ✅
  → symptom_record     ✅
  → growth_record      ✅
  → sleep_record       ✅
  → activity_record    ✅
  → diaper_record      ✅
  → health_record      ✅
  → medical_record     ✅

第 6 批（依赖 baby_profile）：
  → food_observation   ✅
```

- [x] `SHOW TABLES;` 确认共 **13 张表** ✅
- [x] 外键约束检查：共 **23 条** FOREIGN KEY 约束均已创建 ✅

### 2.3 安全规则配置

在控制台 → 「数据库」→「安全规则」中配置：

- [ ] 关闭所有表的**公开读写**权限（默认关闭，确认未误开）
- [ ] 所有数据库操作通过 **CloudRun 服务端 SDK** 进行（不走客户端直连）
- [ ] 客户端 Web H5 通过 `@cloudbase/js-sdk` + Auth Token 访问受保护的云函数/CloudRun API

### ⚠️ 已知风险（需手动处理）

| #   | 风险                            | 影响                                                  | 状态      | 处置方式                                                                                                                              |
| --- | ------------------------------- | ----------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | **数据库回档能力未开启**        | 🔴 高 — 误操作/Bug 批量写入后无法回滚                 | ❌ 待处理 | 控制台 → [CynosDB](https://console.cloud.tencent.com/cynosdb) → 集群 `cynosdbmysql-dg17geyu` → **备份管理** → 开启自动备份，保留 7 天 |
| R-2 | **Serverless 自动启停无法关闭** | 🟡 中 — 30 分钟无连接后 DB 暂停，下次唤醒冷启动 30~60s | ✅ 已缓解 | 双层保活：层一 CloudRun 内 `TasksService.keepDatabaseAlive`（每 8 分钟 `SELECT 1`）；层二 CloudBase 云函数 `keepalive-ping`（每 20 分钟 HTTP GET `/health`，防 CloudRun 缩容至 0 导致层一失效）。详见阶段八 § 8.3 |

---

## 阶段三：Auth 认证配置 ✅ 已完成（2026-03-29）

> 验收结论：全部通过。手机号登录已开启，安全域名已配置。
> ⚠️ **体验版套餐限制记录**：`CreateAuthDomain` API 不可用（`OperationDenied.FreePackageDenied`），安全域名须通过控制台手动添加。

### 3.1 开启手机号短信登录

- [x] 开启「手机号」登录（`PhoneNumberLogin = true`）
- [x] 配置短信签名
- [x] 配置验证码短信模板
- [ ] 控制台调试工具发送一条验证码，确认短信可达（上线前必做）

### 3.2 配置安全域名

> 路径：CloudBase 控制台 → 「用户管理」→「登录设置」→「Web 安全域名」

**已配置域名**：

| 域名                                                                        | 用途               | 状态      |
| --------------------------------------------------------------------------- | ------------------ | --------- |
| `minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com`              | 静态托管默认域名   | ✅ 已启用 |
| `minicare-cloud-6gqledlle0132cbe-1253854169.ap-shanghai.app.tcloudbase.com` | CloudBase 应用域名 | ✅ 已启用 |
| `localhost`                                                                 | 本地 Vite 开发     | ✅ 已添加 |
| `127.0.0.1`                                                                 | 本地开发备用       | ✅ 已添加 |

- [x] 控制台手动添加 `localhost` 安全域名
- [x] 控制台手动添加 `127.0.0.1` 安全域名
- [x] iOS / Android 无需配置（通过自建 JWT HTTP API 接入，不受安全域名限制）

---

## 阶段四：云存储配置（照片 CDN）✅ 已完成（2026-03-29）

> 验收结论：全部通过。存储桶权限已确认，CDN 默认域名可用，目录规划已确定。
> ⚠️ **体验版套餐限制记录**：`ModifyStorageSafeRule` API 不可用（`OperationDenied.FreePackageDenied`），存储安全规则无法通过 CLI/API 修改，但现有默认权限满足需求。

### 4.1 存储桶权限

> 当前权限：**「仅创建者及管理员可读写」**（PRIVATE）✅ 满足隐私要求

- [x] 确认当前 ACL 为私有读写（`cloudbase storage get-acl` 验证）
- [x] 所有客户端上传通过 CloudRun 服务端签发**临时上传 URL**（`getUploadFileInfo`），不直接暴露存储凭证
- [x] 所有客户端下载通过 CloudRun 服务端签发**临时读取 URL**（`getTempFileURL`，有效期 1h），不公开图片链接

> ⚠️ 体验版不支持修改安全规则；升级套餐后可进一步细化规则（如 `avatars/` 公开读）。

### 4.2 CDN 访问域名

> 体验版已提供默认 CDN 域名，无需额外配置

- [x] 默认 CDN 域名可用：`[env-id]-[appid].tcloudbaseapp.com`（全国 CDN 节点）
- [x] 图片通过临时签名 URL 访问，天然携带 CDN 缓存头
- [ ] 自定义域名 `cdn.minicare.xxx.com`（上线前可选，需 ICP 备案 + HTTPS）

### 4.3 存储目录规划

> 目录无需预创建，CloudRun 首次上传文件时自动生成路径

```
cloud://minicare-cloud-6gqledlle0132cbe.ap-shanghai/
  ├── avatars/         # 用户头像  → {user_id}.jpg
  ├── symptoms/        # 症状照片  → {baby_id}/{record_id}/{n}.jpg
  ├── diapers/         # 尿布照片  → {baby_id}/{record_id}/{n}.jpg
  ├── growth/          # 生长图表  → {baby_id}/{record_id}/{n}.jpg
  └── medical/         # 病历照片  → {baby_id}/{record_id}/{n}.jpg
```

- [x] 存储路径规范已确定（与 DB `photo_urls` JSON 字段的 fileID 格式对应）
- [x] 路径使用 `baby_id/record_id/序号.jpg` 结构，天然隔离不同宝宝的数据

---

## 阶段五：CloudRun 后端服务部署 ✅ 已完成（2026-03-29）

> **框架选型：NestJS v10**
> 理由：minicare 有 3 层角色 × 50+ API 的权限校验矩阵，NestJS Guards 装饰器声明一次全局复用；
> `MinNum=1` 热实例消除冷启动劣势；`@nestjs/swagger` 自动生成 OpenAPI 文档供 iOS/Android 联调；
> Module 分层约定保障长期可维护性。
> 详见 `docs/architecture.md` § 三、后端技术选型
>
> **5.1 代码骨架已创建（2026-03-29）**：`minicare/minicare-server/` 目录已包含完整 NestJS 项目结构。
> **本地开发环境已全面就绪（2026-03-29）**：本地 MySQL 5.7 已初始化，迁移体系建立，`npm run start:dev` 运行正常。
> **5.3 ～ 5.4 CloudRun 部署待执行**：需在 CloudRun 控制台创建服务并配置环境变量。

### 5.1 项目结构

```
minicare-server/                      ✅ 已创建
  ├── src/
  │   ├── main.ts                     ✅ NestJS 应用入口，Swagger、ValidationPipe、CORS
  │   ├── app.module.ts               ✅ 根模块，汇总所有业务 Module
  │   ├── auth/                       ✅ 认证模块
  │   │   ├── auth.module.ts
  │   │   ├── auth.controller.ts      # POST /auth/send-code, /auth/verify-code, GET /auth/me
  │   │   ├── auth.service.ts         # CloudBase OTP + user_account 查/创 + JWT 颁发
  │   │   ├── jwt.guard.ts            # ① JWT 验证 Guard（Bearer Token）
  │   │   └── dto/send-code.dto.ts, verify-code.dto.ts
  │   ├── family/                     ✅ 家庭模块
  │   │   ├── family.module.ts
  │   │   ├── family.controller.ts    # 创建/查看/邀请/加入
  │   │   ├── family.service.ts
  │   │   ├── family-member.guard.ts  # ② family 成员资格 Guard
  │   │   ├── role.guard.ts           # ③ 角色权限 Guard（配合 @MinRole）
  │   │   └── dto/create-family.dto.ts
  │   ├── baby/                       ✅ 宝宝档案模块（MVP 单宝宝限制）
  │   ├── records/                    ✅ 业务记录模块（8类）
  │   │   ├── feeding/                # 喂养（母乳/奶粉/辅食）
  │   │   ├── sleep/                  # 睡眠（含计时状态机 start/end/ongoing）
  │   │   ├── diaper/                 # 尿布
  │   │   ├── health/                 # 健康（体温/情绪）
  │   │   ├── symptom/                # 症状（含照片 fileID）
  │   │   ├── activity/               # 活动
  │   │   ├── growth/                 # 生长数据（体重/身高/头围）
  │   │   └── medical/                # 病历（含照片 fileID、用药列表）
  │   ├── storage/                    ✅ POST /storage/upload-url, /storage/download-urls
  │   ├── websocket/                  ✅ Socket.IO Gateway /ws，按 family_id room 广播
  │   ├── scheduler/                  ✅ 定时任务：DB 保活(8min) + 睡眠超时检查(10min)
  │   └── common/
  │       ├── database/               ✅ mysql2 连接池 Provider（含 Serverless 冷启动预热）
  │       ├── cloudbase/              ✅ @cloudbase/node-sdk Provider
  │       ├── decorators/             ✅ @CurrentUser(), @MinRole(), FamilyRole enum
  │       └── interceptors/           ✅ ResponseFormatInterceptor（统一响应格式）
  ├── Dockerfile                      ✅ 多阶段构建（node:20-alpine）
  ├── .env.example                    ✅ 环境变量示例（不含真实密钥）
  ├── .gitignore                      ✅
  ├── nest-cli.json                   ✅
  ├── tsconfig.json                   ✅
  ├── migrations/
  │   └── 001_init_schema.sql          ✅ 完整建表 DDL（兼容 MySQL 5.7 + 8.0）
  └── scripts/
      └── migrate.sh                  ✅ 迁移管理脚本（自动追踪版本，支持 dry-run）
  └── package.json                    ✅ NestJS v10 + mysql2 + socket.io + @cloudbase/node-sdk
```

### 5.1b 本地开发环境 ✅ 已就绪（2026-03-29）

> 本地开发连接本地 MySQL 5.7，不污染 CloudBase 生产数据库。

| 项目                             | 状态        | 说明                                        |
| -------------------------------- | ----------- | ------------------------------------------- |
| 本地 MySQL 5.7.31                | ✅ 运行中   | DMG 安装版，root 密码已重置                 |
| `minicare_dev` 数据库            | ✅ 已创建   | `utf8mb4_unicode_ci`                        |
| `migrations/001_init_schema.sql` | ✅ 已执行   | 14 张表（含 `schema_migrations`）           |
| `.env` 本地配置                  | ✅ 已配置   | `DB_HOST=127.0.0.1`，`DB_NAME=minicare_dev` |
| `npm run start:dev`              | ✅ 正常启动 | 所有模块加载成功，无报错                    |
| `npm run migrate`                | ✅ 可用     | 支持 `--status` / `--dry-run`               |

**数据库版本差异说明**：

|                    | 本地                                   | CloudBase 远程            |
| ------------------ | -------------------------------------- | ------------------------- |
| MySQL 版本         | 5.7.31                                 | 8.0（CynosDB Serverless） |
| `DEFAULT (uuid())` | ❌ 不支持                              | ✅ 支持                   |
| 应对               | UUID 由应用层（`uuid` npm 包）生成传入 | 同左                      |
| `JSON` 类型        | ✅ 支持（5.7.8+）                      | ✅ 支持                   |

**后续加字段流程**：

```bash
# 1. 新建迁移文件（文件名递增）
echo "-- 描述: xxx\nALTER TABLE xxx ADD COLUMN yyy;" > migrations/002_xxx.sql

# 2. 本地执行
npm run migrate

# 3. 生产执行：通过 CloudBase MCP 工具执行同一条 ALTER SQL，并在此文档记录
```

### 5.2 关键环境变量

在 CloudRun 控制台配置以下环境变量（不存入代码）：

| 变量名            | 说明                                   |
| ----------------- | -------------------------------------- |
| `TCB_ENV_ID`      | CloudBase 环境 ID                      |
| `DB_HOST`         | MySQL 内网地址（CloudBase 控制台获取） |
| `DB_PORT`         | `3306`                                 |
| `DB_NAME`         | 数据库名                               |
| `DB_USER`         | 数据库用户名                           |
| `DB_PASS`         | 数据库密码                             |
| `JWT_SECRET`      | JWT 签名密钥（随机 32 字节）           |
| `SMS_SIGN`        | 短信签名名称                           |
| `SMS_TEMPLATE_ID` | 短信验证码模板 ID                      |

- [x] 环境变量清单已在 `.env.example` 列出（含说明）
- [x] JWT_SECRET 生成命令已在注释中提供
- [x] **本地 `.env` 已配置**（连接本地 MySQL `minicare_dev`，`dotenv/config` 在 `main.ts` 顶部加载）
- [x] **已完成**：所有环境变量在 CloudRun `minicare-api-002` 版本环境变量面板配置完毕
- [x] **`.env` 已加入 `.gitignore`，禁止提交真实密钥**

### 5.3 部署 CloudRun 服务

```bash
# 方式一：通过 CLI 部署
cloudbase run deploy --name minicare-api --path ./minicare/minicare-server

# 方式二：GitHub Actions CI/CD（推荐）
# 在 .github/workflows/deploy.yml 中配置自动部署
```

- [x] **已完成**：首次部署成功，版本 `minicare-api-002` 状态为「正常」，流量 100%
- [ ] **待执行**：配置「最小实例数=1」防止冷启动（月增约 ¥15，R-2 风险缓解）
- [ ] **待执行**：配置「自定义域名」：`api.minicare.xxx.com`（需 HTTPS + ICP 备案，上线前）
- [x] **已完成**：`/health` 验证通过 ✅
  ```bash
  # 访问域名
  https://minicare-cloud-6gqledlle0132cbe-1253854169.ap-shanghai.app.tcloudbase.com
  # 响应：{"status":"ok","service":"minicare-api","version":"0.1.0","env":"production"}
  ```
- [ ] HTTP 访问服务路由：`/` → `minicare-api`（云托管）✅ 已配置

### 5.4 WebSocket 配置（家庭实时同步）

- [x] `EventsGateway` Socket.IO `/ws` 命名空间已实现，按 `family_id` room 广播
- [ ] **待确认**：CloudRun 控制台确认 WebSocket 长连接支持已开启（暂未找到入口，上线前再确认）
- [ ] 在 CloudRun 控制台开启「长连接支持」（上线前执行）
- [ ] 实现消息类型：
  - `record:created` — 家庭成员新增记录后广播
  - `record:updated` — 家庭成员修改记录后广播
  - `member:joined` — 新成员接受邀请后广播

---

## 阶段六：Web H5 前端（React + Vite）静态托管 ✅ 已完成（2026-03-30）

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
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // ⚠️ 必须使用相对路径，静态托管 CDN 部署必须
  build: {
    outDir: "dist",
  },
});
```

### 6.3 CloudBase SDK 初始化（单例）

```typescript
// src/lib/cloudbase.ts
import cloudbase from "@cloudbase/js-sdk";

// ⚠️ 必须同步初始化，不能 async/lazy import
export const app = cloudbase.init({
  env: import.meta.env.VITE_TCB_ENV_ID, // .env.local 中配置
  region: "ap-shanghai",
  auth: { detectSessionInUrl: true },
});

export const auth = app.auth;
```

```bash
# .env.local（不提交 Git）
VITE_TCB_ENV_ID=minicare-cloud-6gqledlle0132cbe
VITE_API_BASE_URL=https://minicare-api.xxxx.run.tcloudbase.com
```

### 6.4 路由配置（Hash 模式）

```typescript
// src/router.ts — TanStack Router，Hash 模式
import { createHashHistory, createRouter } from "@tanstack/react-router";

const hashHistory = createHashHistory();
export const router = createRouter({ routeTree, history: hashHistory });
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

- [x] 静态托管已开启，默认域名可访问（`minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com`）
- [x] `vite.config.ts` 中 `base: './'` 已配置（相对路径，CDN 必须）
- [x] `react-router-dom` 使用 `createHashRouter`（Hash 模式），刷新不 404
- [ ] 配置自定义域名（`app.minicare.xxx.com`）+ HTTPS 证书
- [ ] 在控制台「安全域名」中添加前端域名（Auth SDK 跨域要求）

> **✅ 阶段六完成** （2026-03-30）
>
> - 前端访问地址：**https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com**
> - 技术栈：React 18 + Vite 6 + TypeScript + TailwindCSS 3 + Zustand + react-router-dom 6
> - 已实现页面：登录、注册、新用户引导（添加宝宝）、首页、记录列表（含新增弹窗）、我的
> - 构建产物：12 个文件，主 bundle 218 KB（gzip 72 KB）
> - 部署命令：`tcb hosting deploy dist -e minicare-cloud-6gqledlle0132cbe`

### 6.6 前端调用 CloudRun API

```typescript
// src/api/records/feeding.ts
import { app } from "@/lib/cloudbase";

export async function createFeedingRecord(data: CreateFeedingInput) {
  // 方式一：通过 CloudBase SDK 调用 CloudRun（自动注入 Auth Token）
  const res = await app.callContainer({
    name: "minicare-api",
    method: "POST",
    path: "/records/feeding",
    header: { "Content-Type": "application/json" },
    data,
  });
  return res.data;
}

// 方式二：直接 fetch（手动附加 Bearer Token）
const { data: session } = await auth.getSession();
const res = await fetch(
  `${import.meta.env.VITE_API_BASE_URL}/records/feeding`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(data),
  },
);
```

- [ ] 确认 SDK 版本 `@cloudbase/js-sdk >= 2.x`
- [ ] 所有 API 请求指向 CloudRun 服务（`VITE_API_BASE_URL`）
- [ ] 图片上传走「客户端直传」（从 CloudRun 获取临时上传 URL → 直传 CloudBase 云存储）

---

## 阶段七：移动端接入（iOS / Android）

### 7.1 HTTP API 接入方式

移动端**不使用 CloudBase 原生 SDK**，统一通过 HTTP/WebSocket 接入 CloudRun API：

| 能力     | 接入方式                                                           |
| -------- | ------------------------------------------------------------------ |
| 认证     | `POST /auth/send-code` + `POST /auth/verify-code` → 返回 JWT Token |
| 数据读写 | 携带 `Authorization: Bearer <token>` 的 HTTP REST API              |
| 实时推送 | WebSocket `wss://api.minicare.xxx.com/ws?token=<jwt>`              |
| 图片上传 | `GET /storage/upload-url` → 获取预签名 URL → 直传 CloudBase CDN    |

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

### 8.3 数据库 + CloudRun 双层保活 ✅ 已完成（2026-04-03）

> 背景：CynosDB Serverless 30 分钟无连接后自动暂停，冷启动 30~60 秒（R-2 风险）。CloudRun 自动缩容到 0 后，
> 容器内定时任务 `TasksService.keepDatabaseAlive`（层一）也随之停止，保活链断裂。
> 解决方案：增加层二——CloudBase 定时云函数定期 ping CloudRun，使 CloudRun 保持至少 1 个运行实例，
> 让层一的 8 分钟 DB ping 持续有效，形成闭环。

#### 保活链路图

```
[CloudBase 定时云函数 keepalive-ping]
  │  每 20 分钟  GET /health
  ▼
[CloudRun minicare-api]  ← 被唤醒 / 保持运行
  │  每 8 分钟  SELECT 1
  ▼
[CynosDB Serverless]  ← 不会 30 分钟无连接暂停
```

#### 层一（已有）：CloudRun 内部 DB 保活

文件：`minicare-server/src/scheduler/tasks.service.ts`

```typescript
// 每 8 分钟执行一次，防止 MySQL Serverless 30 分钟无连接后自动暂停
@Cron('0 */8 * * * *')
async keepDatabaseAlive() {
  await this.db.execute('SELECT 1');
}
```

> 当 CloudRun 至少有 1 个实例在运行时，此任务持续生效。
> **层一单独存在时的盲点**：CloudRun 长时间无请求会缩容至 0，层一随之停止。

#### 层二（新增）：CloudBase 定时云函数

**云函数名称**：`keepalive-ping`  
**运行时**：`Nodejs18.15`  
**触发频率**：每 20 分钟（`0 */20 * * * *`）  
**目标**：HTTP GET CloudRun `/health` 端点，唤醒实例并触发层一

**函数代码**：

```javascript
// functions/keepalive-ping/index.js
const https = require('https');

const HEALTH_URL =
  'https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com/health';

exports.main = async (event, context) => {
  return new Promise((resolve) => {
    const req = https.get(HEALTH_URL, { timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        console.log(`[keepalive] status=${res.statusCode} body=${body}`);
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on('error', (err) => {
      console.error('[keepalive] error:', err.message);
      resolve({ error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      console.error('[keepalive] timeout after 15s');
      resolve({ error: 'timeout' });
    });
  });
};
```

**创建步骤（控制台）**：

1. 进入 [CloudBase 控制台](https://console.cloud.tencent.com/tcb) → 「云函数」
2. 点击「新建云函数」，填写：
   - 函数名称：`keepalive-ping`
   - 运行时：`Node.js 18.15`
   - 超时时间：`20s`
   - 内存：`64 MB`
3. 粘贴上方函数代码，点击「保存并部署」
4. 点击「触发器」→「新建触发器」：
   - 触发方式：**定时触发**
   - Cron 表达式：`0 */20 * * * *`（每 20 分钟）
   - 触发器名称：`every-20min`
5. 手动点击「测试」，确认日志输出 `status=200`

**创建步骤（CLI 方式）**：

```bash
# 在项目根目录
mkdir -p functions/keepalive-ping
# 写入上述 index.js 后执行
cloudbase functions:deploy keepalive-ping -e minicare-cloud-6gqledlle0132cbe
```

**执行清单**：

- [x] 创建云函数 `keepalive-ping`（Node.js 18.15，超时 60s，HTTP 请求超时 55s）
- [x] 配置定时触发器：`0 */20 * * * * *`，触发器名 `every-20min`
- [x] 手动测试：日志输出 `status=200`，347ms 返回✅
- [ ] 观察 24 小时日志：确认每 20 分钟触发一次且无报错
- [ ] 配置告警：连续 3 次触发失败时邮件通知

> ℹ️ **已知第一次冷启动超时问题**：首次测试返回 `timeout`，因为 CloudRun MinNum=0，实例为 0 时冷启动需 30~60s。
> 将函数超时改为 60s、HTTP 请求超时改为 55s 后，第二次调用成功返回 `status=200`。
> 实际运行中，CloudRun 实例已启动的情况下每次请求 < 500ms，冷启动只发生一次。

#### 成本评估

| 项目 | 量级 | 费用 |
|------|------|------|
| 云函数调用次数 | 每 20 分钟 1 次 × 24h × 30d = 2,160 次/月 | 免费额度 10 万次/月，**¥0** |
| 云函数计算资源 | 每次 < 1 秒，64 MB | 免费额度 40 万 GBs/月，**¥0** |
| CynosDB CCU | 每次 `SELECT 1` ≈ 0.001 CCU，层一 + 层二共约 5 CCU/月 | **< ¥0.01/月** |
| **合计** | | **可忽略不计（< ¥0.1/月）** |

---

## 阶段九：监控与运维

> **总方案文档**：[`INFRA-ops-monitoring.md`](INFRA-ops-monitoring.md)（背景、现状、调研、目标、架构/流程图、详细设计、计划、风险）  
> **CLS 专项**：[`INFRA-cls-logging.md`](INFRA-cls-logging.md)

### 9.1 基础监控

- [ ] CloudBase 控制台 → 「监控告警」→ 配置以下告警：
  - MySQL 连接数 > 80% → 邮件告警
  - CloudRun 错误率 > 1% → 邮件 + 短信告警
  - 云存储用量 > 4GB → 邮件告警（免费额度边界）

### 9.2 日志接入

- [ ] CloudRun 服务日志接入「日志服务（CLS）」→ **操作步骤见 [`INFRA-cls-logging.md`](INFRA-cls-logging.md)**
- [ ] 关键操作日志（写入/删除/邀请）需结构化记录 `{ user_id, action, table, record_id, timestamp }`

### 9.3 数据备份

- [ ] 控制台 → 「数据库」→「备份管理」→ 开启每日自动备份
- [ ] 备份保留周期：**30 天**

---

## 成本估算（MVP 阶段，≤1000 DAU）

| 资源           | 配置                   | 月估算费用             |
| -------------- | ---------------------- | ---------------------- |
| CloudBase 环境 | 按量计费               | 免费额度覆盖           |
| MySQL          | 1C1G，按量             | ~¥30–50/月             |
| CloudRun       | 0.25C/0.5G，最小实例=0 | ~¥10–20/月（流量触发） |
| 云存储         | 5GB + CDN              | ~¥5–10/月              |
| SMS 短信       | 1000条验证码           | ~¥50/月                |
| 保活云函数     | 2160 次/月，< 1s/次    | **¥0**（免费额度内）   |
| **合计**       |                        | **~¥100–130/月**       |

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
