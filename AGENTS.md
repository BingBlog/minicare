# AGENTS.md — minicare

## Project structure

Monorepo with 3 independent packages (no root `package.json`):

| Directory | Stack | Role |
|---|---|---|
| `minicare-server/` | NestJS v10 + TypeScript + mysql2 | Backend API (CloudRun) |
| `minicare-web/` | React 18 + Vite 6 + Tailwind | Web frontend (static hosting) |
| `minicare-mp/` | Taro 4.2 + React 18 | WeChat miniprogram |

> `docs/architecture.md` references Fastify — it is **stale**. The server uses NestJS.

All commands run from within the specific project directory.

## Development commands

```bash
# Server (must be in minicare-server/)
npm run start:dev          # dev server on :3001 (needs .env.local)
npm run build              # nest build (uses tsconfig.build.json)
npm run test               # unit tests (jest)
npm run test:e2e           # e2e tests
npm run lint               # eslint {src,test}/**/*.ts --fix
npm run start:debug        # dev + debugger

# Web (must be in minicare-web/)
npm run dev                # dev server on :3000, /api proxies to :3001
npm run build:staging      # tsc -b + vite build (staging mode)
npm run build:prod         # tsc -b + vite build (production mode)

# Miniprogram (must be in minicare-mp/)
npm run dev:weapp          # Taro build --type weapp --watch
npm run build:weapp        # Taro build --type weapp
```

## Environment setup

- **Server**: Copy `.env.example` → `.env.local` with real credentials. Local dev connects to **remote CynosDB** (not local MySQL) — prepared statement handling differs between CynosDB Serverless and local MySQL 8, causing "passes locally, fails in prod" bugs.
- **CloudRun**: Runtime env vars come **only** from CloudRun console `EnvParams`, not from `.env.*` files in the repo. `main.ts` dotenv skips `NODE_ENV=production`.
- **Web**: `.env.development` sets `VITE_API_BASE_URL=` (empty, uses Vite proxy). `.env.production`/`.env.staging` set full CloudRun URL.

## Architecture notes

### Server (`minicare-server/`)
- Entry: `src/main.ts` → `node dist/main` (**not** `node dist/src/main`)
- Global prefix `/api` (except `/health`). Swagger at `/api-docs` (non-prod only).
- Auth layers: `JwtGuard` → `FamilyMemberGuard` → `RoleGuard`+`@MinRole()` decorator
- Modules: auth, family, baby, records (8 subtypes), storage, websocket, scheduler, baby-foods, report, app-config
- DTOs use `class-validator` decorators. String enums in DTOs, TINYINT mapping in service layer. All Update DTO fields `@IsOptional()`.

### Web (`minicare-web/`)
- Hash router (`createHashRouter`) for static hosting compatibility
- API layer: `src/api/http.ts` `request<T>()` — all HTTP must go through this, never raw fetch
- API modules in `src/api/`, imported via `import { recordsApi } from '@/api'`
- PWA with manual service worker registration (version param on sw.js to bypass CDN cache)

### Database
- 13 tables: user_account → family_group/member → baby_profile → 8 record tables + food_observation
- All PKs CHAR(36) UUID. Enums stored as TINYINT.

## Critical gotchas

- **No global response wrapper**: `ResponseFormatInterceptor` exists but is **not registered** in `main.ts`. API returns raw data — frontend reads fields directly, no `.data` layer.
- **API paths must include `/api` prefix** in frontend calls (e.g. `request('/api/family/.../records/feeding')`).
- **List endpoints return `T[]`**, not `{ items: T[] }` or paginated wrappers.
- **Build entry**: Server MUST use `tsconfig.build.json` (excludes tests). Using `tsconfig.json` compiles `test/` into `dist/`.
- **No emojis** anywhere (code, data, API responses). Use SVG icons: `src/components/ui/icons.tsx` (web) / `src/assets/icons/*.svg` (mp).
- **Enum labels** centralized in `src/lib/constants.ts` (web) or `src/lib/constants.ts` (mp). Never define label maps locally in components.
- **No `window.confirm/alert/prompt`** (web). Use inline bottom-sheet confirm dialogs.

## Deploy

See `.cursor/rules/deploy-conventions.mdc` and `.cursor/rules/cloudbase-conventions.mdc` for full details. TL;DR:
1. `cd minicare-server && npm run build && bash scripts/deploy.sh` (pre-check)
2. Deploy via CloudBase MCP `manageCloudRun(action='deploy', ...)` — **not** `tcb` CLI
3. Verify: `queryCloudRun(detail)` + `curl /health`

## Existing guidance

The `.cursor/rules/` directory contains 5 authoritative rule files:
- `api-conventions.mdc` — API design, routing, DTOs, auth
- `cloudbase-conventions.mdc` — CloudBase platform, MCP tools, skills
- `deploy-conventions.mdc` — Build config, deploy.sh, Dockerfile
- `frontend-coding.mdc` — Web coding conventions (icons, enums, dialogs)
- `miniapp-development.mdc` — Miniprogram dev constraints

Read these when working in their domain. They are the source of truth over any prose docs.
