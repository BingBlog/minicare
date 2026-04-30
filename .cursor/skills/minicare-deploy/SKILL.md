---
name: minicare-deploy
description: minicare 项目构建发布操作手册。包含前端静态托管、后端 CloudRun、云函数、数据库迁移四个发布对象的完整参数配置和 SOP 流程。当用户说「部署前端/后端/函数/数据库」或使用 /deploy-* 命令时使用此 Skill。
---

# minicare 发布操作手册

> 💡 **敏感配置（密码/密钥）见 `minicare-server/.env.example`（模板），实际值存在 `minicare-server/.env.local`（不进 git）。**
> 执行部署前读取 `minicare-server/.env.local` 获取 `DB_HOST / DB_PORT / DB_USER / DB_PASS / JWT_SECRET` 的实际值。

---

## §1 配置参数表

### 1.1 CloudBase 环境

| 属性             | 值                                                                      |
| ---------------- | ----------------------------------------------------------------------- |
| 环境 ID          | `minicare-cloud-6gqledlle0132cbe`                                       |
| Region           | `ap-shanghai`                                                           |
| 静态托管访问地址 | `https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/` |

### 1.2 前端参数（minicare-web）

| 属性               | staging                                                                         | production                                                              |
| ------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 构建命令           | `npm run build:staging`                                                         | `npm run build:prod`                                                    |
| 构建产物路径       | `minicare-web/dist`                                                             | `minicare-web/dist`                                                     |
| 静态托管 cloudPath | `/staging/`                                                                     | `/`                                                                     |
| 访问地址           | `https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/staging/` | `https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/` |
| VITE_AUTH_MODE     | `test`（固定验证码 123456）                                                     | `sms`（真实短信）                                                       |
| 构建成功标志       | 输出 `built in X.XXs`，无 TypeScript error                                      | 同左                                                                    |

> ✅ 使用 **Hash 路由**（`createHashRouter`），URL 形如 `https://xxx.tcloudbaseapp.com/staging/#/login`，
> 路由路径在 `#` 之后，不受宿主路径 `/staging/` 影响，无需修改任何路由配置。

### 1.3 后端参数（minicare-server）

| 属性            | staging                                                                           | production                                                                                  |
| --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 项目目录        | `/Users/bing/Desktop/工作区/minicare/minicare-server`                             | 同左                                                                                        |
| 构建命令        | `npm run build`（= `nest build`）                                                 | 同左                                                                                        |
| 预检命令        | `bash scripts/deploy.sh`                                                          | 同左                                                                                        |
| CloudRun 服务名 | `minicare-api`                                                                    | `minicare-api-production`                                                                   |
| serverType      | `container`                                                                       | `container`                                                                                 |
| 访问域名        | `https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com`                | `https://minicare-api-production-240137-10-1253854169.sh.run.tcloudbase.com`                |
| DB_NAME         | `minicare_staging`                                                                | `minicare-cloud-6gqledlle0132cbe`                                                           |
| AUTH_TEST_MODE  | `true`（固定验证码 123456）                                                       | `false`（真实短信）                                                                         |
| 健康检查端点    | `GET /health`                                                                     | `GET /health`                                                                               |

**完整 manageCloudRun serverConfig（可直接复制）**：

> 以下 `EnvParams` 中的敏感值（`DB_HOST / DB_PORT / DB_USER / DB_PASS / JWT_SECRET`）需从 `minicare-server/.env.local` 读取后填入。

**staging 部署（`minicare-api`）：**
```
manageCloudRun(
  action     = 'deploy',
  serverName = 'minicare-api',
  targetPath = '/Users/bing/Desktop/工作区/minicare/minicare-server',
  serverType = 'container',
  serverConfig = {
    Cpu: 0.5, Mem: 1, MinNum: 0, MaxNum: 5, Port: 3000,
    OpenAccessTypes: ['OA', 'PUBLIC', 'MINIAPP'],
    EnvParams: "{\"NODE_ENV\":\"production\",\"TCB_ENV_ID\":\"minicare-cloud-6gqledlle0132cbe\",\"DB_HOST\":\"<DB_HOST>\",\"DB_PORT\":\"<DB_PORT>\",\"DB_NAME\":\"minicare_staging\",\"DB_USER\":\"<DB_USER>\",\"DB_PASS\":\"<DB_PASS>\",\"JWT_SECRET\":\"<JWT_SECRET>\",\"AUTH_TEST_MODE\":\"true\",\"CORS_ORIGINS\":\"https://minicare.top,https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com\"}"
  }
)
```

**production 部署（`minicare-api-production`）：**
```
manageCloudRun(
  action     = 'deploy',
  serverName = 'minicare-api-production',
  targetPath = '/Users/bing/Desktop/工作区/minicare/minicare-server',
  serverType = 'container',
  serverConfig = {
    Cpu: 0.5, Mem: 1, MinNum: 0, MaxNum: 5, Port: 3000,
    OpenAccessTypes: ['OA', 'PUBLIC', 'MINIAPP'],
    EnvParams: "{\"NODE_ENV\":\"production\",\"TCB_ENV_ID\":\"minicare-cloud-6gqledlle0132cbe\",\"DB_HOST\":\"<DB_HOST>\",\"DB_PORT\":\"<DB_PORT>\",\"DB_NAME\":\"minicare-cloud-6gqledlle0132cbe\",\"DB_USER\":\"<DB_USER>\",\"DB_PASS\":\"<DB_PASS>\",\"JWT_SECRET\":\"<JWT_SECRET>\",\"AUTH_TEST_MODE\":\"false\",\"CORS_ORIGINS\":\"https://minicare.top,http://www.minicare.top,https://www.minicare.top,https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com\"}"
  }
)
```

> ⚠️ **`AUTH_TEST_MODE` 必须与前端构建目标严格对齐**：
>
> - 部署 **staging**（对应前端 `build:staging`）→ `AUTH_TEST_MODE=true`（固定验证码 `123456`）
> - 部署 **production**（对应前端 `build:prod`）→ `AUTH_TEST_MODE=false`（真实短信）
>
> **两者不对齐会导致登录失败**（前端用真实短信 + 后端用固定验证码 = 400 错误）。

### 1.4 云函数参数

| 属性       | 值                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------- |
| 函数名     | `keepalive-ping`                                                                             |
| 函数根目录 | `/Users/bing/Desktop/工作区/minicare/minicare-server/functions`                              |
| handler    | `index.main`                                                                                 |
| 环境变量   | `CLOUDRUN_HEALTH_URL=https://minicare-api-production-240137-10-1253854169.sh.run.tcloudbase.com/health` |
| 验证标志   | 调用后日志含 `status=200`                                                                    |

### 1.5 数据库迁移参数

| 属性         | 值                                                    |
| ------------ | ----------------------------------------------------- |
| 迁移脚本路径 | `/Users/bing/Desktop/工作区/minicare/minicare-server` |
| 迁移文件目录 | `minicare-server/migrations/`                         |
| 开发库       | `minicare_dev`                                        |
| Staging 库   | `minicare_staging`                                    |
| 生产库       | `minicare-cloud-6gqledlle0132cbe`                     |

---

## §2 SOP-A：前端发布流程（/deploy-web）

**适用场景**：minicare-web 代码有变更，需要更新静态托管。

> 执行前确认目标环境：**staging** 还是 **production**？两者构建命令和上传路径不同。

### 步骤（staging）

```bash
# Step 1：构建 staging 版本
cd /Users/bing/Desktop/工作区/minicare/minicare-web
npm run build:staging
```

**成功判定**：输出 `built in X.XXs`，无 TypeScript 编译错误。

```
# Step 2：上传到 CloudBase 静态托管 /staging/ 路径
uploadFiles(
  localPath  = '/Users/bing/Desktop/工作区/minicare/minicare-web/dist',
  cloudPath  = '/staging/'
)
```

**成功判定**：所有文件的 `error` 字段均为 `null`。

**验证**：访问 `https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/staging/` 确认页面正常加载，显示「🔧 测试模式」提示条。

### 步骤（production）

```bash
# Step 1：构建 production 版本
cd /Users/bing/Desktop/工作区/minicare/minicare-web
npm run build:prod
```

**成功判定**：输出 `built in X.XXs`，无 TypeScript 编译错误。

```
# Step 2：上传到 CloudBase 静态托管 / 根路径
uploadFiles(
  localPath  = '/Users/bing/Desktop/工作区/minicare/minicare-web/dist',
  cloudPath  = '/'
)
```

**成功判定**：所有文件的 `error` 字段均为 `null`。

**验证**：访问 `https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/` 确认页面正常加载，**无**「测试模式」提示条。

### 完成报告格式

> ✅ 前端发布完成（staging / production）
> 构建产物：X 个文件，约 X MB  
> 上传成功：X 个文件  
> 访问地址：[对应地址]

---

## §3 SOP-B：后端发布流程（/deploy-server）

**适用场景**：minicare-server 代码有变更，需要更新 CloudRun 容器服务。

### 步骤

```bash
# Step 1：编译 TypeScript
cd /Users/bing/Desktop/工作区/minicare/minicare-server
npm run build
```

**成功判定**：无错误输出，`dist/` 目录存在，`dist/main.js` 存在。

```bash
# Step 2：构建预检
bash scripts/deploy.sh
```

**成功判定**：输出「预检通过」，`dist/` < 2MB，不存在 `dist/test/` 目录。若预检失败，**不得继续执行 Step 3**。

```
# Step 3：CloudRun 部署（参数见 §1.3 完整 manageCloudRun 块，直接复制执行）
manageCloudRun(...)  ← 使用 §1.3 中的完整参数
```

**等待**：部署为异步操作，调用后等待完成信号。

```
# Step 4a：验证版本号更新
queryCloudRun(action='detail', detailServerName='minicare-api')
```

**成功判定**：`OnlineVersionInfos[0].VersionName` 比部署前 +1。

```bash
# Step 4b：验证服务健康（staging）
curl https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com/health
# Step 4b：验证服务健康（production）
curl https://minicare-api-production-240137-10-1253854169.sh.run.tcloudbase.com/health
```

**成功判定**：返回 `{"status":"ok","db":{"host_set":true,"pass_set":true,...}}`  
若 `db.host_set=false`：EnvParams 未生效，需重新部署。  
若超时 30s：CloudRun 冷启动，重试一次。

### 完成报告格式

> ✅ 后端发布完成（staging / production）  
> 新版本号：X  
> /health 响应：{"status":"ok","db":{"name":"minicare_staging 或 minicare-cloud-..."}}

---

## §4 SOP-C：云函数发布流程（/deploy-fn）

**适用场景**：`functions/keepalive-ping/index.js` 代码有变更。

### 步骤

```
# Step 1：上传函数代码
manageFunctions(
  action           = 'updateFunctionCode',
  functionName     = 'keepalive-ping',
  functionRootPath = '/Users/bing/Desktop/工作区/minicare/minicare-server/functions',
  handler          = 'index.main'
)
```

**成功判定**：MCP 工具返回成功状态。

```
# Step 2：触发调用验证
manageFunctions(
  action       = 'invokeFunction',
  functionName = 'keepalive-ping',
  params       = {}
)
```

**成功判定**：返回结果中 `statusCode = 200`，或查询日志含 `[keepalive] status=200`。

```
# Step 3（可选）：查询最近日志
queryFunctions(action='listFunctionLogs', functionName='keepalive-ping', limit=5)
```

### 完成报告格式

> ✅ 云函数发布完成  
> 函数名：keepalive-ping  
> 调用验证：status=200

---

## §5 SOP-D：数据库迁移流程（/deploy-db）

**适用场景**：`migrations/` 目录下新增了 SQL 迁移文件，需要同步到三个库。

⚠️ **此操作不可逆，必须先执行 dry-run 预览，等待用户明确确认后才执行。**

### 步骤

```bash
# Step 1：预览待执行迁移（dry-run，不实际执行）
cd /Users/bing/Desktop/工作区/minicare/minicare-server
bash scripts/migrate.sh --dry-run --all-envs
```

**展示**：列出待执行的迁移文件列表，告知用户将对开发库、staging 库和生产库执行哪些变更。  
**等待用户明确确认**（必须收到确认才执行 Step 2）。

```bash
# Step 2：执行迁移（用户确认后）
bash scripts/migrate.sh --all-envs
```

**成功判定**：输出「全部数据库迁移完成」，三个库均无报错。

```bash
# Step 3：验证迁移版本
bash scripts/migrate.sh --status
```

**展示**：当前三个库的已执行迁移版本列表。

### 完成报告格式

> ✅ 数据库迁移完成  
> 开发库（minicare_dev）：已执行 001~NNN  
> Staging 库（minicare_staging）：已执行 001~NNN  
> 生产库（minicare-cloud-xxx）：已执行 001~NNN

---

## §6 SOP-E：全量发布流程（/deploy-all）

**适用场景**：多个组件同时有变更，需要一次性全量发布。

**执行顺序（严格按此顺序，不可并行）**：

```
1. 数据库迁移（SOP-D）  ← 先确保 Schema 就绪
        ↓ 成功后继续
2. 后端发布（SOP-B）    ← 服务依赖最新 Schema
        ↓ /health 验证通过后继续
3. 云函数发布（SOP-C）  ← 保活函数依赖后端服务
        ↓ status=200 验证通过后继续
4. 前端发布（SOP-A）    ← 前端最后上线
```

**任意步骤失败，立即停止并报告**，不得跳过继续执行后续步骤。

### 完成报告格式

> ✅ 全量发布完成  
> 数据库迁移：✅ dev + staging + 生产库均已最新  
> 后端服务：✅ 版本号 X，/health OK  
> 云函数：✅ keepalive-ping status=200  
> 前端 staging：✅ X 个文件 → /staging/  
> 前端 production：✅ X 个文件 → /  
> Staging 地址：https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/staging/  
> Production 地址：https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/

---

## §7 故障速查

| 现象                                        | 根因                                | 解决方法                                                                        |
| ------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------- |
| 前端上传后页面未更新                        | 浏览器缓存                          | 强制刷新（Ctrl+Shift+R），或等待 CDN 刷新（最长 5 分钟）                        |
| `dist/` 体积 > 5MB                          | `test/` 被编译进去                  | 确认 `nest-cli.json` 的 `tsConfigPath` 指向 `tsconfig.build.json`               |
| `dist/test/` 目录存在                       | tsconfig.build.json 的 exclude 失效 | 检查 `nest-cli.json`                                                            |
| 部署后 `/health` 超时 30s                   | CloudRun 冷启动                     | 重试一次；或检查 `DB_HOST` 是否使用了公网地址                                   |
| `/health` 返回 `db.host_set=false`          | EnvParams 未生效                    | 重新执行 manageCloudRun，确认 EnvParams 字符串格式正确                          |
| 数据库连接超时（upstream-timecost ≈ 30000） | CloudRun 使用了内网地址             | 确认 DB_HOST=`sh-cynosdbmysql-grp-6a0nj6a8.sql.tencentcdb.com`，DB_PORT=`21002` |
| 生产前端登录失败（400/验证码错误）           | AUTH_TEST_MODE 未设为 false         | 确认 `minicare-api-production` 的 EnvParams 中 `AUTH_TEST_MODE=false`            |
| 云函数调用返回 error                        | 函数代码错误或环境变量未配          | `queryFunctions(listFunctionLogs)` 查看错误日志                                 |
| 迁移执行失败中断                            | SQL 语法错误或字段冲突              | 修复 SQL 文件，重新执行；`schema_migrations` 表中未记录失败的版本，可安全重试   |
