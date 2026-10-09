# AGENTS.md — minicare

## ⚠️ Pre-task routing (read this first)

**Every non-trivial task must start by matching against the table below and reading the corresponding skill.** This is a hard gate — no code, no deploy, no design change should begin before checking the relevant skill.

| User intent | Skill to read | Type |
|---|---|---|
| Develop / modify / fix any feature or module | `.agents/skills/minicare-dev/SKILL.md` | Dev |
| Deploy frontend / backend / cloud function / DB migration / full release | `.agents/skills/minicare-deploy/SKILL.md` | Ops |
| Design or restyle any UI page or component | `.agents/skills/minicare-design/SKILL.md` | Design |
| Write or refine PRD / requirements / user stories / acceptance criteria | `.agents/skills/prd-doc-writer/SKILL.md` | PM |
| Design or optimize DB schema / indexes / migrations | `.agents/skills/database-designer/SKILL.md` | DB |
| Migrate a Web page to miniprogram (MP) | `.agents/skills/web-to-mp-page-migration/SKILL.md` | Migration |
| Any CloudBase operation (auth / DB / storage / functions / CloudRun / AI / Agent) | `.agents/skills/cloudbase/SKILL.md` | Platform |

> `cloudbase/SKILL.md` is a **router** — it dispatches to 20+ sub-skills under `references/` (e.g. `auth-web`, `cloudrun-development`). Always read the router first, then follow its routing table to the correct sub-skill. Never call CloudBase APIs without going through the skill chain.

> **⚠️ 影响面机制（改动任何功能前必做）**：运行 `node .agents/scripts/impact-scan.mjs <功能域关键词>` 扫描该功能域的全部消费点（入口层/表单页/组件/API/展示层/后端/文档），并对照对应 PRD 的「影响面清单」章节逐项核对后再动手；开发完成后同步更新影响面清单。详细流程见 `.agents/skills/minicare-dev/SKILL.md` 步骤 2。

These 6 project rules are referenced by `opencode.json` and auto-apply to matching file patterns — you do not need to manually read them, but their domain rules are binding:

| Rule file | Scope |
|---|---|
| `.agents/rules/api-conventions.mdc` | API design, routing, DTOs, auth |
| `.agents/rules/cloudbase-conventions.mdc` | CloudBase platform, CLI tools, env info |
| `.agents/rules/deploy-conventions.mdc` | Build config, deploy scripts, Dockerfile |
| `.agents/rules/frontend-coding.mdc` | Icons, enum labels, dialog rules (web + mp) |
| `.agents/rules/miniapp-development.mdc` | Miniprogram platform constraints |
| `.agents/rules/mp-preview.mdc` | CI preview (miniprogram-ci, IP whitelist, proxy handling) |

> ⚠️ **`.agents/` 是 rules 和 skills 的唯一数据源**。`.cursor/`、`.trae/` 中的 rules 和 skills 均为 symlink 指向 `.agents/`，**禁止直接编辑这些目录中的文件**。所有修改必须通过 `.agents/rules/` 或 `.agents/skills/` 路径进行。（`.opencode/` 不使用目录，`opencode.json` 直接引用 `.agents/rules/*.mdc`。）

> 🖥️ **换机器 / 新 clone 后自检（10 秒）**：运行 `bash .agents/scripts/setup-links.sh --check`。
> `.cursor/`、`.trae/`、`.workbuddy/skills` 的镜像软链均为**相对路径**且已进版本库，正常 clone 后由 git 自动重建，通常无需任何操作。
> 若自检报 `BROKEN` / `WRONG` / `CONFLICT`，运行 `bash .agents/scripts/setup-links.sh`（不带 `--check`）修复。
> ⚠️ **新增软链时禁止使用绝对路径**——绝对路径软链在提交者机器上完全正常、`git status` 也干净，但换机器或换 clone 目录后会静默断链。CI（`.github/workflows/verify-links.yml`）会拦截这类提交。详见 `.agents/README.md`。

---

## Project structure

Monorepo with 5 independent projects (no root `package.json`):

| Directory | Stack | Role |
|---|---|---|
| `minicare-server/` | NestJS v10 + TypeScript + mysql2 | Backend API (CloudRun) |
| `minicare-mp/` | Taro 4.2 + React 18 | **Primary platform** — WeChat miniprogram |
| `minicare-web/` | React 18 + Vite 6 + Tailwind | Web frontend (secondary, maintenance mode) |
| `minicare-platform/` | FastAPI（Python 3.13）+ React 18 + Vite | **本机管理端**（127.0.0.1:8787，单用户）：`api/` = 平台后端（KB 六步管线 + 检索质检 + 平台服务，原 `minicare-kb`）；`web/` = 管理界面（React SPA，同端口托管） |
| `agent-poc/` | Node.js + DeepSeek（Claude Agent SDK 运行时） | 养娃智能体「敏宝助手」服务（被测对象）+ agent 测评 harness（`scripts/eval/`，由平台调度） |

> **Platform strategy**: WeChat miniprogram (`minicare-mp/`) is the **primary distribution channel**. MVP has been released on the miniprogram platform. `minicare-web/` served as the prototyping platform during early development and is now in maintenance mode.
> **管理端策略**：`minicare-platform/` 是本机单用户管理端（知识库 + Agent 测评两个能力域），**不做云端部署**；`agent-poc/` 是被测智能体本体。

All commands run from within the specific project directory.

## Development commands

```bash
# Miniprogram — PRIMARY (must be in minicare-mp/)
npm run dev:weapp          # Taro build --type weapp --watch
npm run build:weapp        # Taro build --type weapp (production)

# Server (must be in minicare-server/)
npm run start:dev          # dev server on :3001 (needs .env.local)
npm run build              # nest build (uses tsconfig.build.json)
npm run test               # unit tests (jest)
npm run test:e2e           # e2e tests
npm run lint               # eslint {src,test}/**/*.ts --fix
npm run start:debug        # dev + debugger

# Web — SECONDARY (must be in minicare-web/)
npm run dev                # dev server on :3000, /api proxies to :3001
npm run build:staging      # tsc -b + vite build (staging mode)
npm run build:prod         # tsc -b + vite build (production mode)

# Platform — 本机管理端（must be in minicare-platform/api/ 或 web/）
.venv/bin/kb-pipeline serve    # 平台服务 :8787（同端口托管 web/dist；--reload 开发热载）
cd ../web && npm run dev       # 前端 Vite :5173（/api 代理到 8787）；npm run build → dist/

# Agent 测评（must be in agent-poc/，详见 scripts/eval/README.md）
node scripts/eval/eval-agent.mjs --all --no-judge   # harness 全量（不含 judge）
node scripts/eval/gate.mjs                          # P0 上线闸门
```

## Environment setup

- **Server**: Copy `.env.example` → `.env.local` with real credentials. Local dev connects to **remote CynosDB** (not local MySQL) — prepared statement handling differs between CynosDB Serverless and local MySQL 8, causing "passes locally, fails in prod" bugs.
- **CloudRun**: Runtime env vars come **only** from CloudRun console, not from `.env.*` files in the repo. `main.ts` dotenv skips `NODE_ENV=production`. **部署时不得在 `serverConfig.EnvParams` 中传入环境变量**，否则会整体替换已有配置（包括 `JWT_SECRET`），导致全量用户 Token 失效。环境变量应在 CloudBase 控制台独立管理。
- **Miniprogram**: Environment variables via `TARO_APP_*` prefix, injected at build time. `.env.development` / `.env.production` control API URL and auth mode (`test` vs `sms`).
- **Web**: `.env.development` sets `VITE_API_BASE_URL=` (empty, uses Vite proxy). `.env.production`/`.env.staging` set full CloudRun URL.

## Architecture notes

### Miniprogram (`minicare-mp/`) — Primary platform
- Taro 4.2 + React 18 + TypeScript, targets WeChat miniprogram (`weapp`)
- Subpackage loading: 4 TabBar pages in main package, 8 record form pages + login/onboarding in subpackages
- Custom TabBar with center FAB button for quick record creation
- API layer: `src/api/http.ts` `request<T>()` — all HTTP via `Taro.request`, never raw calls
- Auth: dual mode — `test` (fixed code 123456) for dev, CloudBase SMS OTP for production
- Guest preview: unauthenticated users can view home layout, prompted to login on interaction
- Charts: ECharts 6 with Canvas off-screen rendering + screenshot display (solves miniprogram Canvas z-index issues)
- Global config: `/api/config` response cached to Taro Storage, avoids repeated requests
- Growth standards: China 2023 pediatric growth reference data (P3-P97 percentiles) built-in

### Server (`minicare-server/`)
- Entry: `src/main.ts` → `node dist/main` (**not** `node dist/src/main`)
- Global prefix `/api` (except `/health`). Swagger at `/api-docs` (non-prod only).
- Auth layers: `JwtGuard` → `FamilyMemberGuard` → `RoleGuard`+`@MinRole()` decorator
- Modules: auth, family, baby, records (8 subtypes), storage, websocket, scheduler, baby-foods, report, app-config
- DTOs use `class-validator` decorators. String enums in DTOs, VARCHAR enums in database (migrated from TINYINT). All Update DTO fields `@IsOptional()`.

### Web (`minicare-web/`) — Secondary
- Hash router (`createHashRouter`) for static hosting compatibility
- API layer: `src/api/http.ts` `request<T>()` — all HTTP must go through this, never raw fetch
- API modules in `src/api/`, imported via `import { recordsApi } from '@/api'`
- PWA with manual service worker registration (version param on sw.js to bypass CDN cache)

### Database
- ~18 tables: user_account → family_group/member → baby_profile → feeding (4 subtables: breast/formula/food/supplement + 2 detail tables: formula_mix/food_item) → sleep/diaper/activity/health/symptom/growth/medical + food_observation
- All PKs CHAR(36) UUID. Enums stored as VARCHAR (migrated from TINYINT in Migration 008).

## Critical gotchas

- **No global response wrapper**: `ResponseFormatInterceptor` exists but is **not registered** in `main.ts`. API returns raw data — frontend reads fields directly, no `.data` layer.
- **API paths must include `/api` prefix** in frontend calls (e.g. `request('/api/family/.../records/feeding')`).
- **List endpoints return `T[]`**, not `{ items: T[] }` or paginated wrappers.
- **Build entry**: Server MUST use `tsconfig.build.json` (excludes tests). Using `tsconfig.json` compiles `test/` into `dist/`.
- **No emojis** anywhere (code, data, API responses). Use SVG icons: `src/assets/icons/*.svg` (mp) / `src/components/ui/icons.tsx` (web).
- **Enum labels** centralized in `src/lib/constants.ts` (both mp and web). Never define label maps locally in components.
- **No `window.confirm/alert/prompt`** (web). Use inline bottom-sheet confirm dialogs. In miniprogram, use `Taro.showModal` or custom components.
- **Timezone**: 前端传递时间给后端时，绝不使用 `new Date().toISOString()`（输出 UTC 导致 8 小时偏差），必须使用 `dayjs().format('YYYY-MM-DDTHH:mm:ss')` 输出本地时间字符串（不带 Z 后缀）。
- **Soft delete（软删除原则，硬性约束）**: 所有删除操作一律软删除，**禁止物理 DELETE 业务数据**（Migration 012）。删除 = 标记 `deleted_at = NOW()`，所有查询必须带 `deleted_at IS NULL` 过滤。已落地：`baby_profile`/`family_group` 有 `deleted_at` 列；`family_member` 复用 `status='left'`。新增删除功能时必须：① 目标表加 `deleted_at`（或复用 status）② 查询过滤 ③ 勿删关联记录。例外：测试数据清理、已软删数据的兜底清理可物理删除。

## 文档管理规范（2026-08-23 起强制）

- **根目录禁放文档**：根目录只允许 `README.md` 与 `AGENTS.md`；任何新增 .md 文档一律进 `docs/` 对应分类目录
- **索引同步（硬性）**：新增/移动/删除 docs/ 下任何文档，**必须同步更新 `docs/README.md` 的索引与状态列**；docs 变更后检查是否影响 `minicare-dev` SKILL 的引用路径
- **命名规范**：英文小写 + 前缀编号（`TECH-NNN-*` / `INFRA-*` / `DB-NN-*` / `FNN-*` / `PRD-NNN` / `REVIEW-*` / `MNN-*`），**禁止中文文件名**
- **生命周期**：文档 frontmatter 标注 `status: draft | active | superseded | archived`，修改后更新 `updated` 日期；被取代的文档标 `superseded` 或移入 `docs/archive/`，不物理删除
- **知识库**：资料在 `docs/knowledge/`（source/ = 原始文献，research/ = 调研），管线工程在 `minicare-platform/api/`，二者引用用完整路径
- **文档归属速查**：商业/战略 → `docs/business/`；产品 → `docs/product/`；PRD → `docs/prd/`（注册表 `docs/PRD_REGISTRY.md`）；功能规格 → `docs/features/`；技术方案 → `docs/tech/`；智能体模块 → `docs/agent/`；硬件 → `docs/hardware/`；审查复盘 → `docs/reviews/`；数据分析 → `docs/analytics/`；公众号文章 → `docs/wechat-articles/`

## Deploy

**Server (CloudRun):**
1. `cd minicare-server && npm run build && bash scripts/deploy.sh` (pre-check)
2. Deploy via `tcb` CLI: `echo "n" | tcb cloudrun deploy -s minicare-api --port 3000 --force -e minicare-cloud-6gqledlle0132cbe`
3. Verify: `curl /health`

**Miniprogram:**
1. `cd minicare-mp && npm run build:weapp`
2. Upload via WeChat DevTools → submit for review → publish

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **minicare** (15632 symbols, 27836 relationships, 450 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/minicare/context` | Codebase overview, check index freshness |
| `gitnexus://repo/minicare/clusters` | All functional areas |
| `gitnexus://repo/minicare/processes` | All execution flows |
| `gitnexus://repo/minicare/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
