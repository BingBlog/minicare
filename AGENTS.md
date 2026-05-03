# AGENTS.md — minicare

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
- **CloudRun**: Runtime env vars come **only** from CloudRun console `EnvParams`, not from `.env.*` files in the repo. `main.ts` dotenv skips `NODE_ENV=production`.
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

## Deploy

See `.cursor/rules/deploy-conventions.mdc` and `.cursor/rules/cloudbase-conventions.mdc` for full details. TL;DR:

**Server (CloudRun):**
1. `cd minicare-server && npm run build && bash scripts/deploy.sh` (pre-check)
2. Deploy via CloudBase MCP `manageCloudRun(action='deploy', ...)` — **not** `tcb` CLI
3. Verify: `queryCloudRun(detail)` + `curl /health`

**Miniprogram:**
1. `cd minicare-mp && npm run build:weapp`
2. Upload via WeChat DevTools → submit for review → publish

## Existing guidance

The `.cursor/rules/` directory contains 5 authoritative rule files:
- `api-conventions.mdc` — API design, routing, DTOs, auth
- `cloudbase-conventions.mdc` — CloudBase platform, MCP tools, skills
- `deploy-conventions.mdc` — Build config, deploy.sh, Dockerfile
- `frontend-coding.mdc` — Web coding conventions (icons, enums, dialogs)
- `miniapp-development.mdc` — Miniprogram dev constraints (primary platform)

Read these when working in their domain. They are the source of truth over any prose docs.
