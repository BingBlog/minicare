---
name: minicare-deploy
description: minicare 项目构建发布操作手册。包含前端静态托管、后端 CloudRun、云函数、数据库迁移四个发布对象的完整参数配置和 SOP 流程。当用户说「部署前端/后端/函数/数据库」或使用 /deploy-* 命令时使用此 Skill。
---

# minicare 发布操作手册

> 💡 **敏感配置（密码/密钥）见 `minicare-server/.env.example`（模板），实际值存在 `minicare-server/.env.local`（不进 git）。**
> 执行部署前读取 `minicare-server/.env.local` 获取 `DB_HOST / DB_PORT / DB_USER / DB_PASS` 的实际值。
> **`JWT_SECRET` 不通过 EnvParams 传递**，仅通过 CloudBase 控制台设置一次后持久化，避免部署时误覆盖导致全量用户 token 失效。

> 🔧 **部署工具统一使用 `tcb` CLI**（CloudBase CLI 3.x），不使用 MCP 工具。CLI 更稳定、可脚本化、无交互式认证问题。
> 部署前需确认已登录：`tcb login`，环境 ID：`minicare-cloud-6gqledlle0132cbe`。

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
| 静态托管 cloudPath | `staging`                                                                       | `.`（根路径）                                                           |
| 访问地址           | `https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/staging/` | `https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/` |
| VITE_AUTH_MODE     | `test`（固定验证码 123456）                                                     | `sms`（真实短信）                                                       |
| 构建成功标志       | 输出 `built in X.XXs`，无 TypeScript error                                      | 同左                                                                    |
| CLI 上传命令       | `tcb hosting deploy dist staging -e minicare-cloud-6gqledlle0132cbe`            | `tcb hosting deploy dist . -e minicare-cloud-6gqledlle0132cbe`          |

> ✅ 使用 **Hash 路由**（`createHashRouter`），URL 形如 `https://xxx.tcloudbaseapp.com/staging/#/login`，
> 路由路径在 `#` 之后，不受宿主路径 `/staging/` 影响，无需修改任何路由配置。

### 1.3 后端参数（minicare-server）

| 属性            | staging                                                                           | production                                                                                  |
| --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 项目目录        | `/Users/bing/Documents/minicare-v1/minicare-server`                               | 同左                                                                                        |
| 构建命令        | `npm run build`（= `nest build`）                                                 | 同左                                                                                        |
| 预检命令        | `bash scripts/deploy.sh`                                                          | 同左                                                                                        |
| CloudRun 服务名 | `minicare-api`                                                                    | `minicare-api-production`                                                                   |
| serverType      | `container`                                                                       | `container`                                                                                 |
| 访问域名        | `https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com`                | `https://www.minicare.top`                                                                  |
| DB_NAME         | `minicare_staging`                                                                | `minicare-cloud-6gqledlle0132cbe`                                                           |
| AUTH_TEST_MODE  | `true`（固定验证码 123456）                                                       | `false`（真实短信）                                                                         |
| 健康检查端点    | `GET /health`                                                                     | `GET /health`                                                                               |
| CLI 部署命令    | `tcb cloudrun deploy -s minicare-api --port 3000 --force -e minicare-cloud-6gqledlle0132cbe` | `tcb cloudrun deploy -s minicare-api-production --port 3000 --force -e minicare-cloud-6gqledlle0132cbe` |

> 所有环境变量通过 CloudBase 控制台独立管理，部署时不再通过 `EnvParams` 传递。
> 首次部署前需在控制台设置好全部变量，后续部署只更新代码。

> ⚠️ **`AUTH_TEST_MODE` 必须与前端构建目标严格对齐**：
>
> - 部署 **staging**（对应前端 `build:staging`）→ `AUTH_TEST_MODE=true`（固定验证码 `123456`）
> - 部署 **production**（对应前端 `build:prod`）→ `AUTH_TEST_MODE=false`（真实短信）
>
> **两者不对齐会导致登录失败**（前端用真实短信 + 后端用固定验证码 = 400 错误）。

### 1.4 Agent 服务参数（minicare-agent）

| 属性            | 值                                                                                     |
| --------------- | -------------------------------------------------------------------------------------- |
| 项目目录        | `/Users/bing/Study/minicare/minicare-agent`                                          |
| CloudRun 服务名 | `minicare-agent`                                                                        |
| 部署方式        | `node scripts/deploy-agent.mjs`（manager-node 源码上传 + 云端 Docker 构建，EnvParams 保留合并） |
| 状态/构建日志   | `node scripts/check-agent-deploy.mjs`；`app.cloudrun.getDeployRecords/getBuildLog`       |
| 端到端验收      | `node scripts/verify-online.mjs --domain` 看线上版本/域名/令牌一致性；`node scripts/verify-online.mjs "旺仔现在转奶到哪一步了？"` 直打生产 CloudRun 并回放 SSE |
| 访问域名        | `https://minicare-agent-240137-10-1253854169.sh.run.tcloudbase.com`                     |
| 健康检查        | `GET /health`（免 token）→ `{"ready":true,"db":true,"embedding":true,"tokenAuth":true}` |
| EnvParams       | DEEPSEEK_API_KEY, TCB_*, AGENT_INTERNAL_TOKEN, DB_*(生产库), TOKENHUB_API_KEY — 控制台为准 |

> ⚠️ 踩坑（2026-09-04）：
> 1. `@cloudbase/manager-node` 5.x 的 `init()` 参数从 `env` 改名为 **`envId`**（旧写法报 `[DescribeEnvInfo] EnvId is required`）；deploy 脚本已适配。
> 2. manager-node 是 minicare-agent 的 devDependency（部署时曾被误删），缺了先 `npm i -D @cloudbase/manager-node`。
> 3. 直连 SDK 版镜像依赖 `@anthropic-ai/claude-agent-sdk` 的 linux-x64 CLI 二进制，云端 `npm install` 自动按平台拉取；部署后必须跑一次 `/chat` 端到端验证 CLI 可用。
> 4. 验收时 `x-agent-token` 必须用 **CloudRun EnvParams 里的 AGENT_INTERNAL_TOKEN**。2026-09-20 实测：线上 agent 与线上 `minicare-api-production` 的值一致（48 位），而本地 `minicare-server/.env.local` 是 **18 位** —— 两者早已脱钩（拿本地值调线上会一直 401，现象像"发版失败"）。**真正的风险**：minicare-server 部署若把本地 EnvParams 整体写入，会把线上 48 位冲成 18 位，而 agent 侧仍是 48 位 → **生产聊天全线 401**。部署 minicare-server 前先核对这一项；`verify-online.mjs` 会主动比对并告警。
> 5. Dockerfile 非root用户（oak）+ `CLAUDE_CONFIG_DIR` 兜底 /tmp；`.dockerignore` 已排除 `.env.local`/`.wire-logs`。
> 6. 实测耗时（2026-09-20，v013→v014）：提交到镜像构建完 **5m44s**（`create_build_image: creating` → `succ`），随后 `create_eks_virtual_service` 秒级 succ，全程约 6 分钟。`getDeployRecords` 比 `getProcessLog` 滞后（前者还在 `creating`、后者已 `succ`），**判断是否完成优先看 `getProcessLog`**。
> 7. `AGENT_INTERNAL_TOKEN` 为 32 位以上随机串时，新版本首次 `/chat` 若返回 `{"error":"unauthorized"}`，先按第 4 条排查令牌，不要误判为部署失败。

> ⚠️ 部署状态监控（2026-09-07 补充）：
> - 用 `getDeployRecords({serverName})` 看 `DeployId/Status/FlowRatio`（creating→normal + flow=100 才算完），比 `detail().VersionName` 可靠（detail 在放量前一直显示旧版）。
> - 线上 prod 库有多个"旺仔"种子家庭（04-02/04-03 创建）且测试账号 `13146989718` 在 prod 无 active 家庭绑定——**验收勿臆测 family/baby ctx**，数据回归需真实用户会话。
> - emoji 加固已上线（v012，2026-09-07）：规则 22 扩写覆盖寒暄/自我介绍 + 规则 33 追加全篇禁 emoji（日记除外）——验收/回归时注意寒暄类回复不应再出现表情符号。

### 1.5 云函数参数

| 属性       | 值                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------- |
| 函数名     | `keepalive-ping`                                                                             |
| 函数根目录 | `/Users/bing/Documents/minicare-v1/minicare-server/functions`                                |
| handler    | `index.main`                                                                                 |
| 环境变量   | `CLOUDRUN_HEALTH_URL=https://minicare-api-production-240137-10-1253854169.sh.run.tcloudbase.com/health`（用默认域名而非 www.minicare.top，避免自定义域名证书故障时保活失效——2026-10-02 证书过期事故验证了这一点） |
| 验证标志   | 调用后日志含 `status=200`                                                                    |
| CLI 命令   | `tcb fn code update keepalive-ping --dir functions -e minicare-cloud-6gqledlle0132cbe`       |

### 1.6 数据库迁移参数

| 属性         | 值                                                    |
| ------------ | ----------------------------------------------------- |
| 迁移脚本路径 | `/Users/bing/Documents/minicare-v1/minicare-server`   |
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
cd /Users/bing/Documents/minicare-v1/minicare-web
npm run build:staging
```

**成功判定**：输出 `built in X.XXs`，无 TypeScript 编译错误。

```bash
# Step 2：上传到 CloudBase 静态托管 /staging/ 路径
tcb hosting deploy dist staging -e minicare-cloud-6gqledlle0132cbe
```

**成功判定**：输出 `✔ Successfully uploaded N file(s)`，`Failed to upload 0 file(s)`。

**验证**：访问 `https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/staging/` 确认页面正常加载，显示「🔧 测试模式」提示条。

### 步骤（production）

```bash
# Step 1：构建 production 版本
cd /Users/bing/Documents/minicare-v1/minicare-web
npm run build:prod
```

**成功判定**：输出 `built in X.XXs`，无 TypeScript 编译错误。

```bash
# Step 2：上传到 CloudBase 静态托管根路径
tcb hosting deploy dist . -e minicare-cloud-6gqledlle0132cbe
```

**成功判定**：输出 `✔ Successfully uploaded N file(s)`，`Failed to upload 0 file(s)`。

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
cd /Users/bing/Documents/minicare-v1/minicare-server
npm run build
```

**成功判定**：无错误输出，`dist/` 目录存在，`dist/main.js` 存在。

```bash
# Step 2：构建预检
bash scripts/deploy.sh
```

**成功判定**：输出「预检通过」，`dist/` < 2MB，不存在 `dist/test/` 目录。若预检失败，**不得继续执行 Step 3**。

```bash
# Step 3：CloudRun 部署（staging）
cd /Users/bing/Documents/minicare-v1/minicare-server
echo "n" | tcb cloudrun deploy -s minicare-api --port 3000 --force -e minicare-cloud-6gqledlle0132cbe
```

```bash
# Step 3：CloudRun 部署（production）
cd /Users/bing/Documents/minicare-v1/minicare-server
echo "n" | tcb cloudrun deploy -s minicare-api-production --port 3000 --force -e minicare-cloud-6gqledlle0132cbe
```

> `echo "n"` 用于自动回答「是否启用灰度部署」的交互提示（选择 No，即部署后自动切换流量）。
> `--force` 跳过二次确认提示。

**等待**：部署为异步操作，CLI 提交后会输出控制台链接，需等待约 2~5 分钟构建完成。

```bash
# Step 4a：查看 CloudRun 服务状态
tcb cloudrun list --serviceName minicare-api --json -e minicare-cloud-6gqledlle0132cbe
```

```bash
# Step 4b：验证服务健康（staging）
curl https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com/health
# Step 4b：验证服务健康（production）
curl https://www.minicare.top/health
```

**成功判定**：返回 `{"status":"ok","db":{"host_set":true,"pass_set":true,...}}`
若 `db.host_set=false`：环境变量未生效，需在 CloudBase 控制台检查配置。
若超时 30s：CloudRun 冷启动，重试一次。

### 完成报告格式

> ✅ 后端发布完成（staging / production）
> /health 响应：{"status":"ok","db":{"name":"minicare_staging 或 minicare-cloud-..."}}

---

## §4 SOP-C：云函数发布流程（/deploy-fn）

**适用场景**：`functions/keepalive-ping/index.js` 代码有变更。

### 步骤

```bash
# Step 1：上传函数代码
cd /Users/bing/Documents/minicare-v1/minicare-server
tcb fn code update keepalive-ping --dir functions -e minicare-cloud-6gqledlle0132cbe
```

**成功判定**：CLI 输出更新成功状态。

```bash
# Step 2：触发调用验证
tcb fn invoke keepalive-ping -e minicare-cloud-6gqledlle0132cbe
```

**成功判定**：返回结果中含 `statusCode = 200`，或日志含 `[keepalive] status=200`。

```bash
# Step 3（可选）：查询最近日志
tcb fn log keepalive-ping --limit 5 -e minicare-cloud-6gqledlle0132cbe
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
cd /Users/bing/Documents/minicare-v1/minicare-server
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
> 后端服务：✅ /health OK
> 云函数：✅ keepalive-ping status=200
> 前端 staging：✅ X 个文件 → /staging/
> 前端 production：✅ X 个文件 → /
> Staging 地址：https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/staging/
> Production 地址：https://minicare-cloud-6gqledlle0132cbe-1253854169.tcloudbaseapp.com/

---

## §7 SOP-F：网关自定义域名证书续期（/renew-cert）

**适用场景**：`www.minicare.top` SSL 证书过期（小程序真机报 `request:fail -201`），或证书临期主动续绑。

> ⚠️ **2026-10-02 事故复盘**：`www.minicare.top` 是 CloudBase HTTP 网关自定义域名（DomainType=HTTPSERVICE，AccessType=DIRECT），
> 证书用腾讯云 SSL 免费证书（TrustAsia C1 DV Free，**3 个月有效期**，已开自动续费）。
> **核心坑：SSL「自动续费」只负责签发新证书，不会自动部署到 CloudBase 网关**——新证书躺在 SSL 列表里，
> 网关仍挂旧证书，到期即正式版小程序全线 `request:fail -201`（Chromium ERR_CERT_DATE_INVALID）。
> 上次事故：旧证书 2026-10-01 08:59 过期，新证书 09-04 就已签发（`aWzNXPDQ`）但未绑定。

### 步骤（CloudBase MCP 路径）

```
Step 1：查 SSL 账户里该域名的最新有效证书
  callCloudApi(service="ssl", action="DescribeCertificates",
    params={SearchKey:"minicare.top", Limit:20})
  → 找 Status=1（已颁发）且 CertEndTime 未过期的证书，记下 CertificateId

Step 2：增量换绑网关证书（只改 CertId，不动路由）
  callCloudApi(service="tcb", version="2018-06-08",
    action="ModifyHTTPServiceRoute",
    params={EnvId:"minicare-cloud-6gqledlle0132cbe",
            Domain:{Domain:"www.minicare.top", CertId:"<新证书ID>"}})
  → 接口支持增量修改：不传的字段不变，路由（/→静态托管、/api→minicare-api-production、/health）保持原样

Step 3：验证（约 20 秒内生效）
  curl -vI https://www.minicare.top/health
  → expire date 应为新证书到期日，SSL certificate verify ok，HTTP 200
  curl -s https://www.minicare.top/api/config  → 业务路由正常返回 JSON
```

> ⚠️ 坑中坑：MCP 的 `manageGateway(bindCustomDomain)` 对**已存在**的域名不会更新 CertId
> （底层 Create 语义，返回成功但证书不变）。必须用 `tcb ModifyHTTPServiceRoute`。

> ℹ️ 已知配置漂移（不影响使用）：网关记录 DNSStatus=INVALID，因 CNAME 指向环境服务域名
> （`minicare-cloud-6gqledlle0132cbe.service.tcloudbase.com`）而非标准
> `www.minicare.top.tcbaccess.tencentcloudbase.com`。当前链路正常，换证书无需处理。

**周期提醒**：免费证书 3 个月一换，**下次到期 2026-12-03**。自动续费会在到期前 ~1 个月签发新证书，
但需执行上面 Step 2 换绑才生效。

### 完成报告格式

> ✅ 网关证书续期完成
> 证书 ID：<旧> → <新>，有效期至 <日期>
> /health 200 ✓ /api/config 正常 ✓ 手机端即时恢复（无需客户端操作）

---

## §8 故障速查

| 现象                                        | 根因                                | 解决方法                                                                        |
| ------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------- |
| 前端上传后页面未更新                        | 浏览器缓存                          | 强制刷新（Ctrl+Shift+R），或等待 CDN 刷新（最长 5 分钟）                        |
| `dist/` 体积 > 5MB                          | `test/` 被编译进去                  | 确认 `nest-cli.json` 的 `tsConfigPath` 指向 `tsconfig.build.json`               |
| `dist/test/` 目录存在                       | tsconfig.build.json 的 exclude 失效 | 检查 `nest-cli.json`                                                            |
| 部署后 `/health` 超时 30s                   | CloudRun 冷启动                     | 重试一次；或检查 `DB_HOST` 是否使用了公网地址                                   |
| `/health` 返回 `db.host_set=false`          | 环境变量未生效                      | 在 CloudBase 控制台检查 CloudRun 服务的环境变量配置                             |
| 数据库连接超时（upstream-timecost ≈ 30000） | CloudRun 使用了内网地址             | 确认 DB_HOST=`sh-cynosdbmysql-grp-6a0nj6a8.sql.tencentcdb.com`，DB_PORT=`21002` |
| 生产前端登录失败（400/验证码错误）           | AUTH_TEST_MODE 未设为 false         | 确认 `minicare-api-production` 的环境变量中 `AUTH_TEST_MODE=false`              |
| 云函数调用返回 error                        | 函数代码错误或环境变量未配          | `tcb fn log keepalive-ping --error -e minicare-cloud-6gqledlle0132cbe` 查看错误日志 |
| 迁移执行失败中断                            | SQL 语法错误或字段冲突              | 修复 SQL 文件，重新执行；`schema_migrations` 表中未记录失败的版本，可安全重试   |
| `tcb` CLI 未登录                            | 认证过期                            | 执行 `tcb login` 重新授权                                                       |
| `tcb cloudrun deploy` 交互卡住              | 灰度部署确认提示                    | 使用 `echo "n" \|` 管道输入或加 `--force` 跳过确认                              |
| 小程序真机 `request:fail -201`              | `www.minicare.top` SSL 证书过期（自动续费只签发不部署） | 按 §7 SOP-F 换绑网关证书（2026-10-02 事故实录）                  |

---

## §9 CLI 命令速查

```bash
# 前置：登录
tcb login

# 前端上传（staging）
cd minicare-web && tcb hosting deploy dist staging -e minicare-cloud-6gqledlle0132cbe

# 前端上传（production）
cd minicare-web && tcb hosting deploy dist . -e minicare-cloud-6gqledlle0132cbe

# 后端部署（staging）
cd minicare-server && echo "n" | tcb cloudrun deploy -s minicare-api --port 3000 --force -e minicare-cloud-6gqledlle0132cbe

# 后端部署（production）
cd minicare-server && echo "n" | tcb cloudrun deploy -s minicare-api-production --port 3000 --force -e minicare-cloud-6gqledlle0132cbe

# 后端状态查看
tcb cloudrun list --serviceName minicare-api --json -e minicare-cloud-6gqledlle0132cbe

# 云函数更新
cd minicare-server && tcb fn code update keepalive-ping --dir functions -e minicare-cloud-6gqledlle0132cbe

# 云函数调用
tcb fn invoke keepalive-ping -e minicare-cloud-6gqledlle0132cbe

# 云函数日志
tcb fn log keepalive-ping --limit 20 -e minicare-cloud-6gqledlle0132cbe

# 静态托管文件列表
tcb hosting list staging -e minicare-cloud-6gqledlle0132cbe
```
