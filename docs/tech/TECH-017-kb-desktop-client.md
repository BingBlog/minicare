# TECH-017 — 知识库平台桌面客户端（Electron 壳 + Python sidecar）

> 文档编号：TECH-017 ｜ 版本：v0.1 ｜ 日期：2026-10-09 ｜ 状态：**待评审（方案先行，未开工）**
> 上游：[`PRD-008`](../prd/PRD-008/README.md)（知识库平台化）｜ 配套技术方案：[`TECH-015`](TECH-015-kb-platform.md)
> 运维速查：[`TECH-015-kb-platform-gotchas.md`](TECH-015-kb-platform-gotchas.md)
> 代码基线：`minicare-platform/api/`（FastAPI + `kb_pipeline`）、`minicare-platform/web/`（React 静态产物）
> 本文性质：**执行方案与计划**。所有"现状"描述均基于 2026-10-09 的代码与库实测（不是设计意图）。

---

## 0. 结论摘要

| # | 结论 |
|---|---|
| **C-1** | **可行**，且**不改任何业务逻辑** —— Electron 只承担「进程编排 + 窗口 + 环境选择」，后端仍是同一个 `kb-pipeline serve`。 |
| **C-2** | **浏览器启动原样保留**：Electron 窗口加载的就是 `http://127.0.0.1:<port>`。**同一份服务、同一份前端、两种宿主**。 |
| **C-3** | 真正的门槛不是打包，是**三个前置改造**：路径可注入、环境 profile、写库闸门。缺这三样，客户端做出来只是"带壳的定时炸弹"。 |
| **C-4** | 最大风险 = **prod 环境的写库**（`publish.rollback()` 是无闸门 `DELETE FROM knowledge_base` + 全表重写）。必须用**代码级护栏**兜住，不能只靠 `.env` 纪律。 |
| **C-5** | 隐藏地雷：**staging / 正式库仍停在迁移 019**（020/021/022/024 均未应用）。切过去之前必须先补齐迁移，否则功能直接行为不一致甚至 500。 |

**一句话方案**：把现在「终端里跑 `kb-pipeline serve` + 开浏览器」变成「双击一个 .app」，**后端与前端一行不改**，只是给它们加了个进程宿主编排器和一个环境开关。

---

## 1. 目标与非目标

### 1.1 目标（FR）

| # | 目标 | 验收口径 |
|---|---|---|
| **FR-1** | 双击即用 | macOS 上一个 `.app`，**不要求用户装 Python / 开终端** |
| **FR-2** | **保留浏览器启动** | 不带壳也能 `kb-pipeline serve` + 浏览器访问，行为与现在**完全一致**；两条路径共用同一份服务与前端 |
| **FR-3** | 环境切换 | dev / 测试(staging) / 线上(prod) 三档，界面上切换，不需要手改文件 |
| **FR-4** | 本地生产 + 远程同步 | 解析/切片/校验全在本机；**只有「发布」这一步**把结果写进远程库 |
| **FR-5** | 数据与密钥留在本机 | 数据目录可迁移；密钥进系统 Keychain，不落明文 |

### 1.2 非目标（明确不做）

- ❌ **不重写后端**（Node 重写方案已否决：58 端点 + 六步编排 + 全部质量模块，收益不抵成本）
- ❌ **不改前端业务代码** —— 仅允许新增"环境色带"这类**外壳级**元素
- ❌ 不做多用户 / 权限 / 协同（PRD-008 D-01 已定"单用户本机"）
- ❌ 不把管线搬到云端 —— MinerU / embedding / LLM 本来就是远程 HTTP，本地只做编排
- ❌ 不做 Windows / Linux（除非后续确有需求，见 Q-06）

---

## 2. 现状约束（2026-10-09 核实）

### 2.1 对打包有利的事实

| 项 | 实测 | 对桌面化的意义 |
|---|---|---|
| 后端依赖 | `pypdf / click / pydantic / httpx / pymysql / PyYAML`（web extra 加 `fastapi`/`uvicorn`；`render` extra 加 `pypdfium2`） | **几乎全纯 Python**，唯一原生扩展是 pypdfium2 → 打包难度低 |
| 重计算 | MinerU `https://mineru.net`、embedding `https://tokenhub.tencentmaas.com`、LLM `https://api.deepseek.com` —— **全部远程 HTTP** | 本地**无模型、无 GPU**，客户端体积可控 |
| 前端 | React 18 + Vite，构建产物 **6.1 MB 静态 dist**，现由 FastAPI `StaticFiles` 同端口托管 | 直接进安装包，**前端零改造** |
| pdf.js 资源 | cmaps / standard_fonts / wasm 已由 `scripts/copy-pdfjs.mjs` 拷到 `public/pdfjs/`，**无 CDN** | 同源供给，Electron 里同样成立 |
| 本地状态 | `data/` 共 **20 MB**（corpus 12 MB + pages 8.3 MB + platform.db 128 KB）；源文件 87 MB | 体量极小，随客户端走没有负担 |
| 远程同步 | `publish.py`：快照 → 预检 → 增量写 → 校验（目标库 1586 行） | 就是 FR-4 要的"同步"，**已经实现** |

### 2.2 必须改造的硬编码（阻塞项，清单以行号为准）

| # | 位置 | 现状 | 必须变成 |
|---|---|---|---|
| **B-1** | `config.py:19` `PROJECT_ROOT = Path(__file__).resolve().parents[2]` | **一切路径的根锚在源码包位置** → 打包后落进只读、且升级即丢的应用包内 | 由 `KB_HOME` 解析；**缺省回退 PROJECT_ROOT**（开发态行为不变） |
| **B-2** | `config.py:190` `env_file=str(PROJECT_ROOT / ".env")` | 单一 `.env` | 支持 `KB_ENV_FILE`（指向 profile 文件） |
| **B-3** | `config.py:131-132` `db_path` / `data_root` | 派生自 PROJECT_ROOT | 支持 `KB_DATA_ROOT` / `KB_DB_PATH` 注入（pydantic-settings 字段别名） |
| **B-4** | `web/api.py:27` `ALLOW_WRITE = False` | **硬编码模块常量**，桌面端无法按环境切换 | 改为 Settings 字段 + profile 决定 |
| **B-5** | `web/api.py:35-54` `frontend_dist()` | 候选是 `parents[4]/…` 与 `Path.cwd()/…` → 打包后**两条都失效** | 首选 `KB_FRONTEND_DIST` |
| **B-6** | `cli.py:346-350` `serve` | 端口固定默认 8787 | 支持 `--port auto` + 就绪握手（供宿主发现端口） |
| **B-7** | 全局 | **无"当前环境"概念** | profile 名 + `/health` 下发环境与只读标记（前端顶栏据此显示色带） |
| **B-8** | `config/pipeline.yaml` + `prompts/` | 从 PROJECT_ROOT 读取的真实文件 | 随包分发，经 `KB_CONFIG_FILE` 指向内置副本 |

> **B-1 ~ B-6 是「阶段 0」的内容**，且它们与"是否做 Electron"**无关** —— 即使不做客户端，`KB_*` 可注入 + `ALLOW_WRITE` 配置化本身就有独立价值（多环境、可测试、可部署）。

---

## 3. 总体架构

### 3.1 进程与数据流

```
┌────────────────────────── macOS 应用（Electron）───────────────────────────┐
│  主进程 (Node)                                                            │
│   ├─ 读 profile → 组装环境变量                                            │
│   ├─ spawn: kb-pipeline serve --host 127.0.0.1 --port auto --print-ready   │
│   ├─ 等 KB_READY（或轮询 /health）拿到真实端口                             │
│   ├─ BrowserWindow.loadURL("http://127.0.0.1:<port>")                     │
│   ├─ 设置页/托盘：切环境 → 停旧 sidecar → 起新 sidecar                       │
│   └─ 退出：SIGTERM sidecar；意外崩溃：自动拉起（退避重试）                    │
│                              │                                            │
│                              ▼  同一份服务、同一份前端                       │
│  Python sidecar（PyInstaller onedir —— 就是现有的 kb_pipeline）             │
│   ├─ FastAPI：/api/* + StaticFiles(React dist)                            │
│   ├─ 六步编排 / SQLite(platform.db) / 产物目录（全部本机）                    │
│   └─ 远程：MySQL（**仅发布时写**）/ MinerU / TokenHub / DeepSeek            │
└───────────────────────────────────────────────────────────────────────────┘

                 同一入口，两种宿主（FR-2）：
   浏览器  ──▶ http://127.0.0.1:8787    （kb-pipeline serve，不装壳也能用）
   Electron ──▶ 同一个 URL             （只是多了窗口外壳与环境切换）
```

### 3.2 关键决策

| # | 决策 | 理由 | 反面论证（什么情况下会被推翻） |
|---|---|---|---|
| **D-1** | Electron 加载 **HTTP URL**，不用 `file://` | `/api` 同源、pdf.js 同源、前端**零改造**、浏览器与 Electron 共用入口 | 若将来前端要脱网独立运行（离线单机包），才需要 protocol handler 方案 |
| **D-2** | 后端以 **sidecar 子进程**运行，不重写 | 复用全部现有代码；进程隔离（后端崩了窗口还在）；开发态与打包态**同一条命令** | 若目标要"零 Python"，只有重写一条路 —— 已否决 |
| **D-3** | 环境 = **profile 文件**，不是单 `.env` | 三套连接与开关必须能并存；`.env` 单文件必然要手改，等于没做切换 | 若环境数恒为 1，profile 是过度设计 —— 但需求明确要三档 |
| **D-4** | **谁启动、谁负责端口与生命周期**（由主进程管） | 端口占用、僵尸进程、崩溃重启只有宿主能处理 | — |
| **D-5** | 打包用 **PyInstaller `--onedir`**，不用 `--onefile` | onefile 每次启动都要解压原生库（pypdfium2 的 pdfium），首启慢且杀软误报多 | 若极致追求"单文件分发"再评估 |
| **D-6** | prod **默认只读**：写操作需二次确认 + 写前强制快照 | 见 C-4：`rollback` 是全表重写，误点不可逆 | 若最终决定 prod 完全不许写（只走 CLI），则更简单，见 Q-04 |

### 3.3 保留浏览器启动的实现口径（FR-2 的落地约束）

1. `kb-pipeline serve` 仍是**一等公民**，不被 Electron 独占、不新增必填参数。
2. Electron 端口若被占**自动顺延**；窗口内提供「在浏览器中打开当前地址」。
3. 两条路径共享同一 `data_root` → 用**单实例锁**（Electron）+ **数据目录锁文件**（`data/.lock`，后端侧）避免并发写同一 SQLite。

---

## 4. 目录与配置设计

### 4.1 运行期目录（macOS）

```
~/Library/Application Support/minicare-platform/api/
  profiles/{dev,staging,prod}.env     环境档（连接与开关；密钥只存引用）
  data/                               迁移自 minicare-platform/api/data/（corpus / pages / platform.db）
  config/pipeline.yaml                随包分发的只读副本
  prompts/                            随包分发的只读副本
  logs/                               宿主日志 + 后端 stdout/stderr
```

- 首次启动：若 `home/data` 不存在而仓库 `minicare-platform/api/data` 存在 → 提供「导入现有数据」向导（**复制**，不移动，留退路）。
- 卸载/清理：数据在用户目录，**不受 app 升级影响**（这正是 B-1 要修的原因）。

### 4.2 profile 文件格式

```ini
# profiles/dev.env
KB_PROFILE=dev
KB_ENV_LABEL=开发
DB_HOST=...
DB_PORT=3306
DB_USER=...
DB_NAME=minicare_dev
KB_ALLOW_WRITE=false
KB_READ_ONLY=false
KB_SECRET_REF=keychain://minicare-platform/api/dev      # 密钥不落文件
```

密钥（DB 密码 / MinerU token / TokenHub key / DeepSeek key）经 Electron `safeStorage` 存 Keychain，运行时注入子进程环境变量，**不写入 profile 文件**。

### 4.3 新增环境变量清单

| 变量 | 作用 | 缺省 |
|---|---|---|
| `KB_HOME` | 运行期根目录 | `PROJECT_ROOT`（开发态不变） |
| `KB_ENV_FILE` | profile 文件路径 | `PROJECT_ROOT/.env`（开发态不变） |
| `KB_DATA_ROOT` / `KB_DB_PATH` | 产物根 / 本地库 | `PROJECT_ROOT/data*` |
| `KB_FRONTEND_DIST` | 前端构建产物目录 | 现有候选链 |
| `KB_CONFIG_FILE` | 阈值 YAML | **已存在**（`config.py:282`），无需新增 |
| `KB_PROFILE` | 环境名（dev/staging/prod） | `dev` |
| `KB_ALLOW_WRITE` | 写库闸门 | `false`（**默认拒绝**） |
| `KB_PORT` / `--port auto` | 监听端口 | `8787` |

> **不变量（Invariants）**：以上变量**全部可缺省**，缺省时行为与今天逐字一致 —— 这是"浏览器路径不受影响"的保证。

---

## 5. 分期计划

### 阶段 0 · 后端「可被托管」（前置，与是否做壳解耦）

| 项 | 内容 |
|---|---|
| 交付物 | B-1~B-8 全部落地；`kb-pipeline serve` 支持 `--port auto --print-ready`；`/health` 下发 `profile` / `env_label` / `read_only` |
| 改动 | 仅 `minicare-platform/api/`（`config.py` / `web/api.py` / `cli.py`），**不改前端业务代码** |
| 验收 | ① 不设任何 `KB_*` 时，`kb-pipeline serve` + 浏览器行为与今天**逐字一致**；② 用 `KB_ENV_FILE=profiles/staging.env` 起服务，`/health` 显示 `profile: staging`；③ prod profile 下所有写端点返回 **403**；④ `KB_HOME=/tmp/x` 时 data 落在 `/tmp/x/data` |
| 依赖 | 无。**可立即开工** |
| 不做 | 不动 Electron |

### 阶段 1 · Electron 壳打通（macOS 本机）

| 项 | 内容 |
|---|---|
| 交付物 | `minicare-platform/desktop/`（Electron 工程）；PyInstaller 打包脚本产出 backend onedir；`.app` 双击可用 |
| 改动 | 新增 `desktop/`；新增 `minicare-platform/api/packaging/*.spec`；**后端源码不动**（只吃阶段 0 的注入点） |
| 验收 | ① 双击 .app → 窗口显示「文档管理」20 张卡；② 工作台「解析结果对照」pdf.js 正常渲染与双向联动；③ **同时**用浏览器访问同一端口，界面与服务一致（FR-2）；④ 杀掉 sidecar 进程 → 宿主自动拉起；⑤ 关窗口 → sidecar 进程确实退出（无僵尸） |
| 依赖 | 阶段 0 |
| 不做 | 环境切换 UI（先用 dev profile） |

### 阶段 2 · 环境切换与安全

| 项 | 内容 |
|---|---|
| 交付物 | 设置页：profile 选择 + 「测试连接」；密钥入 Keychain；prod 只读护栏 + 写操作二次确认（输入环境名）；顶栏环境色带（prod = 红色） |
| 改动 | `desktop/` 为主 + 前端**仅新增**环境色带组件（读 `/health` 的 `env_label`） |
| 验收 | ① 切到 prod → 所有写按钮禁用、publish/rollback 不可点；② 尝试绕过 UI 直接打写端点 → 403；③ 切环境不需要重启应用（自动重启 sidecar）；④ 断开网络时"测试连接"给出明确错误 |
| 依赖 | 阶段 1；**前置**：目标库迁移补齐（见 C-5） |
| 不做 | 多用户、审计日志（可后置） |

### 阶段 3 · 分发与维护

| 项 | 内容 |
|---|---|
| 交付物 | macOS 代码签名 + 公证；`electron-updater` 自动更新；首启数据迁移向导；可选 Windows/Linux |
| 验收 | ① 干净机器上双击不被 Gatekeeper 拦截；② 新版本能自动更新且数据不丢 |
| 依赖 | **外部**：Apple Developer 账号（$99/年）；阶段 2 |
| 不做 | 企业内网分发、静默安装 |

---

## 6. 文件级改动清单

| 文件 | 阶段 | 改动 | 风险 |
|---|---|---|---|
| `minicare-platform/api/src/kb_pipeline/config.py` | 0 | `KB_HOME`/`KB_ENV_FILE`/`KB_DATA_ROOT`/`KB_DB_PATH` 解析 + 字段别名；缺省回退现状 | 中（触碰所有路径来源） |
| `minicare-platform/api/src/kb_pipeline/web/api.py` | 0 | `ALLOW_WRITE` → Settings；`frontend_dist()` 首选 `KB_FRONTEND_DIST`；`/health` 增字段 | 中（写库闸门） |
| `minicare-platform/api/src/kb_pipeline/cli.py` | 0 | `serve` 增 `--port auto` / `--print-ready` / `--profile` | 低 |
| `minicare-platform/api/packaging/kb-pipeline.spec` | 1 | PyInstaller 配置：onedir、`collect-submodules uvicorn`、收集 `pypdfium2` 原生库、bundle `config/` + `prompts/` | 中 |
| `minicare-platform/desktop/**` | 1–3 | 新增：主进程（spawn/探活/生命周期/单实例锁）、preload、设置页、打包配置 | 中 |
| `minicare-platform/web/src/**` | 2 | **仅新增**环境色带（读 `/health`） | 低 |
| `minicare-server/migrations/*` | 2 | **无新增**；但需对 staging/prod **执行既有迁移**（C-5） | **高**（跨环境 DDL） |

> **前端业务代码 0 改动**是硬约束；上表的 `web/src` 一行也只允许是外壳级新增。

---

## 7. 风险登记

| # | 风险 | 等级 | 对策 |
|---|---|---|---|
| **R-1** | **prod 写库误操作**（`rollback` = `DELETE FROM knowledge_base` 全表重写） | 🔴 高 | prod profile 默认只读；写操作二次确认（输入环境名）；写前强制快照；`KB_ALLOW_WRITE` 默认 `false` |
| **R-2** | **staging/prod 库停在迁移 019**，切过去功能直接不一致/500 | 🔴 高 | 切环境前先 `migrate:status` 核对并补齐 020/021/022/024；客户端在「测试连接」里**校验迁移版本**，不达标直接拦截 |
| **R-3** | 打包后路径失效（B-1/B-5 未修干净） | 🟠 中 | 阶段 0 的验收项④专门覆盖；打包后跑一遍"六步 + 对照页"冒烟 |
| **R-4** | 双宿主并发写同一 `platform.db` | 🟠 中 | Electron 单实例锁 + 后端 `data/.lock`；检测到锁占用时明确提示 |
| **R-5** | macOS 签名/公证（无 Apple 账号则被 Gatekeeper 拦） | 🟠 中 | 自用可先 `xattr -dr com.apple.quarantine`；分发必须签名（阶段 3 的硬依赖） |
| **R-6** | 体积膨胀（Electron + Python 运行时） | 🟡 低 | 预期 ~250–400 MB；如敏感可评估 Tauri（C 方案），但 Python sidecar 问题不变 |
| **R-7** | 密钥落盘泄露 | 🟠 中 | 一律 Keychain（`safeStorage`），不写 profile/.env |
| **R-8** | MinerU / TokenHub 等外部服务在客户端环境下网络不通（Clash 代理、DNS） | 🟡 低 | 「测试连接」逐个探活并给出可执行提示；沿用现有 `.env` 的连接口径 |

---

## 8. 待确认

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| **Q-01** | 只自用，还是要分发给别人？ | 决定阶段 3 是否必要（签名/自动更新/向导） | 若只自用，**阶段 0+1 即可收工**，ROI 最高 |
| **Q-02** | 是否保留「不做壳、双击脚本 + 浏览器」作为正式路径？ | 若保留，阶段 1 的优先级可降 | 建议：**永远保留**（它已由 FR-2 覆盖，零成本） |
| **Q-03** | 环境档位的"测试"指的是 `minicare_staging` 吗？ | 决定 profile 内容 | 若是，需先补迁移（R-2） |
| **Q-04** | prod 允许写，还是**只读 + 发布走 CLI**？ | 若只读，D-6 的确认流程可大幅简化 | 建议先做**只读**，观察一段时间再放开 |
| **Q-05** | 打包用 PyInstaller 还是 Nuitka？ | 构建时长与产物质量 | 建议 PyInstaller onedir（生态成熟、坑已知） |
| **Q-06** | Windows / Linux 是否需要？ | 工作量 ×N | 建议先 macOS |
| **Q-07** | 现有 `minicare-platform/api/data/` 是"导入"还是"移动"？ | 影响回退能力 | 建议**复制导入**，原目录保留 |

---

## 9. 工作量估算（人日，含自测）

| 阶段 | 内容 | 估算 |
|---|---|---|
| 阶段 0 | 路径注入 + profile + 写库闸门 + serve 增强 + 验收 | **2** |
| 阶段 1 | Electron 工程 + PyInstaller 打包 + 生命周期 + 冒烟 | **3** |
| 阶段 2 | 环境切换 UI + Keychain + 只读护栏 + 前端色带 | **3** |
| 阶段 3 | 签名公证 + 自动更新 + 迁移向导（不含账号申请等待） | **2–3** |
| **合计** | | **10–11** |

> **最小可用切片（MVP）**：阶段 0 + 阶段 1（约 **5 人日**）即可得到"双击能用的桌面客户端"，环境固定为 dev。环境切换与安全护栏是第二阶段，**不应与 MVP 捆绑**。
>
> **重要提醒**：阶段 0 的产出与 Electron **互不依赖**，即使最终决定不做壳，也建议先做 —— 它同时也是"多环境安全切换"的前置。

---

## 10. 与既有文档的关系

| 文档 | 关系 |
|---|---|
| [`TECH-015`](TECH-015-kb-platform.md) | 平台主设计与落地实况。本文**不重复**其内容，只在其之上加一层"宿主与分发" |
| [`PRD-008`](../prd/PRD-008/README.md) | 平台需求来源。本文实现的 FR-3/FR-4 对应其"单用户本机 + 发布闭环"，**不新增产品能力** |
| [`TECH-015-kb-platform-gotchas.md`](TECH-015-kb-platform-gotchas.md) | 构建/运维踩坑。本文阶段 1 的打包坑应在实施后回写该文件新增章节 |

**本文对 PRD/TECH 的补充建议**：
- 建议在 PRD-008 的"非目标"中**显式排除**"平台对外提供服务"，与本文"单用户本机"口径一致（PRD-008 D-01 已有此意，未见显式表述）。
- 建议在 `TODO.md` 增一条"桌面客户端方案（TECH-017）待评审"，与本文件同步。

---

## 附：术语

| 术语 | 含义 |
|---|---|
| **sidecar** | 由宿主进程（Electron 主进程）拉起并托管的子进程，此处即打包后的 `kb-pipeline serve` |
| **profile** | 一套环境档（连接 + 开关），对应 dev / staging / prod |
| **宿主** | 承载后端的进程环境。今天 = 终端；本文引入 = Electron 主进程。两者跑的是同一个后端 |
