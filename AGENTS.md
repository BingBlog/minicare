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

These 5 project rules are referenced by `opencode.json` and auto-apply to matching file patterns — you do not need to manually read them, but their domain rules are binding:

| Rule file | Scope |
|---|---|
| `.agents/rules/api-conventions.mdc` | API design, routing, DTOs, auth |
| `.agents/rules/cloudbase-conventions.mdc` | CloudBase platform, CLI tools, env info |
| `.agents/rules/deploy-conventions.mdc` | Build config, deploy scripts, Dockerfile |
| `.agents/rules/frontend-coding.mdc` | Icons, enum labels, dialog rules (web + mp) |
| `.agents/rules/miniapp-development.mdc` | Miniprogram platform constraints |

> ⚠️ **`.agents/` 是 rules 和 skills 的唯一数据源**。`.cursor/`、`.trae/`、`.opencode/` 中的 rules 和 skills 均为 symlink 指向 `.agents/`，**禁止直接编辑这些目录中的文件**。所有修改必须通过 `.agents/rules/` 或 `.agents/skills/` 路径进行。

---

## Project structure

Monorepo with 3 independent packages (no root `package.json`):

| Directory | Stack | Role |
|---|---|---|
| `minicare-server/` | NestJS v10 + TypeScript + mysql2 | Backend API (CloudRun) |
| `minicare-mp/` | Taro 4.2 + React 18 | **Primary platform** — WeChat miniprogram |
| `minicare-web/` | React 18 + Vite 6 + Tailwind | Web frontend (secondary, maintenance mode) |

> **Platform strategy**: WeChat miniprogram (`minicare-mp/`) is the **primary distribution channel**. MVP has been released on the miniprogram platform. `minicare-web/` served as the prototyping platform during early development and is now in maintenance mode.

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

## Deploy

**Server (CloudRun):**
1. `cd minicare-server && npm run build && bash scripts/deploy.sh` (pre-check)
2. Deploy via `tcb` CLI: `echo "n" | tcb cloudrun deploy -s minicare-api --port 3000 --force -e minicare-cloud-6gqledlle0132cbe`
3. Verify: `curl /health`

**Miniprogram:**
1. `cd minicare-mp && npm run build:weapp`
2. Upload via WeChat DevTools → submit for review → publish
