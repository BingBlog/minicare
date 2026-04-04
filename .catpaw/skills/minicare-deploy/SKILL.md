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

| 属性 | 值 |
|------|-----|
| 环境 ID | `minicare-cloud-6gqledlle0132cbe` |
| Region | `ap-shanghai` |
| 静态托管访问地址 | `https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/` |

### 1.2 前端参数（minicare-web）

| 属性 | 值 |
|------|-----|
| 项目目录 | `/Users/bing/Desktop/工作区/minicare/minicare-web` |
| 构建命令 | `npm run build:prod` |
| 构建产物路径 | `/Users/bing/Desktop/工作区/minicare/minicare-web/dist` |
| 静态托管 cloudPath | `/` |
| 构建成功标志 | 输出 `built in X.XXs`，无 TypeScript error |

### 1.3 后端参数（minicare-server）

| 属性 | 值 |
|------|-----|
| 项目目录 | `/Users/bing/Desktop/工作区/minicare/minicare-server` |
| 构建命令 | `npm run build`（= `nest build`） |
| 预检命令 | `bash scripts/deploy.sh` |
| CloudRun 服务名 | `minicare-api` |
| serverType | `container` |
| 访问域名 | `https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com` |
| 健康检查端点 | `GET /health` |

**完整 manageCloudRun serverConfig（可直接复制）**：

> 以下 `EnvParams` 中的敏感值（`DB_HOST / DB_PORT / DB_USER / DB_PASS / JWT_SECRET`）需从 `minicare-server/.env.local` 读取后填入。

```
manageCloudRun(
  action     = 'deploy',
  serverName = 'minicare-api',
  targetPath = '<minicare-server 绝对路径>',
  serverType = 'container',
  serverConfig = {
    Cpu: 1,
    Mem: 2,
    MinNum: 0,
    MaxNum: 5,
    Port: 3000,
    OpenAccessTypes: ['OA', 'PUBLIC', 'MINIAPP'],
    EnvParams: "{\"NODE_ENV\":\"production\",\"TCB_ENV_ID\":\"minicare-cloud-6gqledlle0132cbe\",\"DB_HOST\":\"<DB_HOST>\",\"DB_PORT\":\"<DB_PORT>\",\"DB_NAME\":\"minicare-cloud-6gqledlle0132cbe\",\"DB_USER\":\"<DB_USER>\",\"DB_PASS\":\"<DB_PASS>\",\"JWT_SECRET\":\"<JWT_SECRET>\",\"AUTH_TEST_MODE\":\"true\"}"
  }
)
```

> `AUTH_TEST_MODE=true`：固定验证码 `123456`，不发真实短信。正式上线前改为 `false`。

### 1.4 云函数参数

| 属性 | 值 |
|------|-----|
| 函数名 | `keepalive-ping` |
| 函数根目录 | `/Users/bing/Desktop/工作区/minicare/minicare-server/functions` |
| handler | `index.main` |
| 环境变量 | `CLOUDRUN_HEALTH_URL=https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com/health` |
| 验证标志 | 调用后日志含 `status=200` |

### 1.5 数据库迁移参数

| 属性 | 值 |
|------|-----|
| 迁移脚本路径 | `/Users/bing/Desktop/工作区/minicare/minicare-server` |
| 迁移文件目录 | `minicare-server/migrations/` |
| 开发库 | `minicare_dev` |
| 生产库 | `minicare-cloud-6gqledlle0132cbe` |

---

## §2 SOP-A：前端发布流程（/deploy-web）

**适用场景**：minicare-web 代码有变更，需要更新静态托管。

### 步骤

```bash
# Step 1：构建生产版本
cd /Users/bing/Desktop/工作区/minicare/minicare-web
npm run build:prod
```

**成功判定**：输出 `built in X.XXs`，无 TypeScript 编译错误。

```
# Step 2：上传到 CloudBase 静态托管
uploadFiles(
  localPath  = '/Users/bing/Desktop/工作区/minicare/minicare-web/dist',
  cloudPath  = '/'
)
```

**成功判定**：所有文件的 `error` 字段均为 `null`。

### 验证（必须执行）

访问 `https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/` 确认页面可正常加载。

### 完成报告格式

> ✅ 前端发布完成  
> 构建产物：X 个文件，约 X MB  
> 上传成功：X 个文件  
> 访问地址：https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/

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
# Step 4b：验证服务健康
curl https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com/health
```

**成功判定**：返回 `{"status":"ok","db":{"host_set":true,"pass_set":true,...}}`  
若 `db.host_set=false`：EnvParams 未生效，需重新部署。  
若超时 30s：CloudRun 冷启动，重试一次。

### 完成报告格式

> ✅ 后端发布完成  
> 新版本号：X  
> /health 响应：{"status":"ok","db":{...}}

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

**适用场景**：`migrations/` 目录下新增了 SQL 迁移文件，需要同步到开发库和生产库。

⚠️ **此操作不可逆，必须先执行 dry-run 预览，等待用户明确确认后才执行。**

### 步骤

```bash
# Step 1：预览待执行迁移（dry-run，不实际执行）
cd /Users/bing/Desktop/工作区/minicare/minicare-server
bash scripts/migrate.sh --dry-run --all-envs
```

**展示**：列出待执行的迁移文件列表，告知用户将对开发库和生产库执行哪些变更。  
**等待用户明确确认**（必须收到确认才执行 Step 2）。

```bash
# Step 2：执行迁移（用户确认后）
bash scripts/migrate.sh --all-envs
```

**成功判定**：输出「全部数据库迁移完成」，两个库均无报错。

```bash
# Step 3：验证迁移版本
bash scripts/migrate.sh --status
```

**展示**：当前两个库的已执行迁移版本列表。

### 完成报告格式

> ✅ 数据库迁移完成  
> 开发库：已执行 001~NNN  
> 生产库：已执行 001~NNN

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
> 数据库迁移：✅ 开发库 + 生产库均已最新  
> 后端服务：✅ 版本号 X，/health OK  
> 云函数：✅ keepalive-ping status=200  
> 前端：✅ X 个文件已上传  
> 访问地址：https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/

---

## §7 故障速查

| 现象 | 根因 | 解决方法 |
|------|------|---------|
| 前端上传后页面未更新 | 浏览器缓存 | 强制刷新（Ctrl+Shift+R），或等待 CDN 刷新（最长 5 分钟） |
| `dist/` 体积 > 5MB | `test/` 被编译进去 | 确认 `nest-cli.json` 的 `tsConfigPath` 指向 `tsconfig.build.json` |
| `dist/test/` 目录存在 | tsconfig.build.json 的 exclude 失效 | 检查 `nest-cli.json` |
| 部署后 `/health` 超时 30s | CloudRun 冷启动 | 重试一次；或检查 `DB_HOST` 是否使用了公网地址 |
| `/health` 返回 `db.host_set=false` | EnvParams 未生效 | 重新执行 manageCloudRun，确认 EnvParams 字符串格式正确 |
| 数据库连接超时（upstream-timecost ≈ 30000） | CloudRun 使用了内网地址 | 确认 DB_HOST=`sh-cynosdbmysql-grp-6a0nj6a8.sql.tencentcdb.com`，DB_PORT=`21002` |
| 云函数调用返回 error | 函数代码错误或环境变量未配 | `queryFunctions(listFunctionLogs)` 查看错误日志 |
| 迁移执行失败中断 | SQL 语法错误或字段冲突 | 修复 SQL 文件，重新执行；`schema_migrations` 表中未记录失败的版本，可安全重试 |