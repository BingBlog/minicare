# minicare-web PWA 方案

> ⛔ **已废弃（2026-10-10）**：web 前端已由 Taro H5 替换，PWA 方案废弃——托管根与 `/staging/` 的 `sw.js` 已替换为「自注销版」（清 CacheStorage + unregister，需长期保留），`manifest.webmanifest` / `workbox-*.js` / `registerSW.js` 均已删除。本文档仅作历史参考。

> **定位变更说明（2026-05-03）**：项目已确定以**微信小程序**为主要分发平台。
> Web PWA 作为早期原型开发的补充方案保留，目前处于**维护模式**，不再作为主要用户入口。
> 新功能开发优先在小程序端（`minicare-mp/`）实现。

本文档描述敏宝日记 Web 端接入 **PWA（Progressive Web App）** 的技术方案与实施清单。与当前栈一致：**Vite 6、`base: './'`、Hash 路由、CloudBase 静态托管**（staging 部署在 `/staging/`，生产在 `/`）。

---

## 1. 目标与范围

| 目标     | 说明                                                |
| -------- | --------------------------------------------------- |
| 可安装   | 浏览器「添加到主屏幕」/ 安装为应用，独立窗口打开    |
| 基础离线 | 静态资源（JS/CSS/壳页面）可缓存，弱网或再次打开更快 |
| 可更新   | 新版本发布后用户能收到更新提示并安全刷新            |

**本期建议不做或单列二期**：复杂离线业务（未同步数据的离线写入）、推送通知（需额外权限与后端/推送通道等）。

---

## 2. 现状与约束

- **构建**：Vite + `base: './'`，产物适合 CDN/子路径部署；PWA 相关 URL 须继续采用**相对路径**策略，避免 staging/生产域名或路径不一致时坏链。
- **路由**：`createHashRouter`，`#` 后路径不经服务器，**仅需同一套 `index.html`**，与 PWA 兼容良好。
- **部署**（见 `minicare-deploy`）：staging 上传到 `cloudPath: /staging/`；production 上传到 `/`。**Web App Manifest 的 `scope` / `start_url` 必须随构建模式区分**，否则 staging 可能出现安装后打开根路径或 scope 错误。
- **已有**：`theme-color`、`apple-mobile-web-app-*`、`public/icon.svg`。各平台安装体验通常还需要 **192×192 / 512×512 的 PNG**（及可选 maskable），建议补全。

---

## 3. 技术选型

采用 **`vite-plugin-pwa`**（底层 **Workbox**）：

- 构建时生成 **Service Worker** 与 **Web App Manifest**，可注入 `index.html`。
- 支持 **预缓存（precache）** 构建产物与 **runtimeCaching** 规则。
- 须在插件配置中与 `base: './'` 对齐，并核对 staging 子路径下 SW / manifest 的注册与路径。

不建议从零手写 Service Worker：维护成本高，且易与 Vite 指纹资源、多环境路径不一致。

---

## 4. 核心设计要点

### 4.1 Web App Manifest

- **name / short_name**：如「敏宝日记」及更短展示名。
- **display**：`standalone`。
- **theme_color / background_color**：与现有品牌色（如 `#F87098`）一致。
- **icons**：至少提供 192、512；需要可加 **maskable**。
- **start_url / scope（关键）**
  - **production**：`scope: '/'`，`start_url` 与实际上传根路径一致（如 `/` 或相对等价形式）。
  - **staging**：`scope: '/staging/'`，`start_url` 建议 `/staging/` 或 `/staging/index.html`，与静态托管 **`/staging/`** 一致。
  - **实现**：通过 Vite `define` 或环境变量（如 `VITE_APP_BASE_PATH`）在 `vite-plugin-pwa` 的 manifest 配置中按 `mode` 分支，避免写死。

### 4.2 Service Worker 与缓存策略

- **Precache**：由 Workbox 处理本次构建的 `index.html`、带 hash 的 JS/CSS 等；新版本通过新 SW 生命周期控制更新。
- **Runtime（建议保守）**
  - 同源静态：可采用 `StaleWhileRevalidate` 或插件默认策略。
  - **`/api/*`**：采用 **NetworkOnly** 或不纳入 SW 拦截（若仅拦截同源，需避免未来同源代理误缓存 API）。
  - **跨域 CloudRun API**：以网络为准，避免错误缓存 JSON。

### 4.3 更新体验

- 使用 **`registerType: 'prompt'`**（或等价能力）：新版本进入 `waiting` 时，在应用内用**内联 BottomSheet** 引导「刷新以更新」。
- **禁止使用 `window.confirm`**（见项目前端规范）。
- 可选：用户确认后再 `skipWaiting` + `clientsClaim`，避免静默打断输入。

### 4.4 iOS / Safari

- 补充 **`apple-touch-icon`**（常见 180×180 PNG）。
- 保留现有 `apple-mobile-web-app-*` meta；iOS 对「安装到主屏幕」的能力因版本而异，验收以 **Android / Chrome** 为主，iOS 为最佳努力。

### 4.5 安全与域名

- CloudBase 静态托管为 **HTTPS**，满足 Service Worker 所需安全上下文。
- 若使用自定义域，**manifest 的 `start_url` 须对应该域上的真实入口**，并与 staging/生产路径策略一致。

---

## 5. 资源与工程改动（实现时）

| 项                      | 说明                                                                           |
| ----------------------- | ------------------------------------------------------------------------------ |
| 依赖                    | `vite-plugin-pwa`（及所需 peer）                                               |
| `vite.config.ts`        | 接入插件；按 `mode` 设置 manifest；必要时对齐 `base`                           |
| `src/main.tsx` 或根布局 | 挂载 SW 更新提示（若与插件注入分离）                                           |
| `public/`               | `icon-192.png`、`icon-512.png`、`apple-touch-icon.png`（可由 `icon.svg` 导出） |
| `index.html`            | 插件可自动注入 manifest link；避免与手写 meta/link 重复冲突                    |

业务路由与 API 封装可不因 PWA 强制改动。

---

## 6. 分阶段实施

**阶段 A — 最小可用（MVP）**

1. 接入 `vite-plugin-pwa`，打通 manifest + SW 生成。
2. 配置 staging / production 的 `scope` 与 `start_url`。
3. 本地 `vite preview` + 真机 Chrome 验证「安装应用」。
4. 将 staging 部署到 `/staging/`，验证安装与打开路径。

**阶段 B — 体验与运维**

1. 内联更新提示 UI（BottomSheet）。
2. 按需为字体/图片等增加轻量 runtime 规则。
3. 在发布流程中增加：发版后抽查新 SW 是否生效（开发者工具 Application → Service Workers 或二次打开验证）。

---

## 7. 验收标准（建议）

- Staging：从静态托管 staging 根 URL 可安装，打开后落在 **staging 应用**，Hash 路由正常。
- Production：从根路径安装与打开正常。
- 发新版后，用户可通过明确操作完成更新（或刷新后使用新版本静态资源）。
- 核心流程（登录、记录、报告等）在安装态与浏览器态一致，无因 SW 导致的 API 缓存错乱。

---

## 7.1 本地预览与 `base: './'`（staging 子路径空白页）

构建使用 **`base: './'`**，脚本与样式在 HTML 里形如 **`./assets/index-*.js`**。浏览器解析相对路径时，**相对于当前页面的路径**。若地址栏是 **`http://localhost:4173/staging/`**，则 `./assets/...` 会变成 **`http://localhost:4173/staging/assets/...`**。默认的 **`vite preview`** 只把 **`dist/`** 挂在**站点根**，磁盘上并不存在 **`/staging/assets/`** 这一层，请求会 **404**，表现为**白屏**。

**推荐（与线上「整包上传到 `/staging/`」一致）**

- 运行 **`npm run preview:staging`**（脚本内会带 **`VITE_API_BASE_URL=`** 执行 `build:staging`，再同步到 `.preview/staging` 并启动服务；与 **`npm run dev`** 一样走同源 **`/api`**，并由预览进程把 **`/api` 代理到 `http://127.0.0.1:3001`**）。
- 先在本机启动 **`minicare-server`**（默认 3001），再打开 **`http://127.0.0.1:4173/staging/`**。若后端地址不同，可设置 **`PREVIEW_API_PROXY`**（例如 `http://127.0.0.1:3001`）。
- 不要用 `vite preview` 再手动加 `/staging/`；也不要用未覆盖 `VITE_API_BASE_URL` 的 staging 包在本机预览，否则会请求线上 CloudRun。

**临时用 `npm run preview` 时**

- 请打开 **`http://localhost:4173/`**（根路径），**不要**访问 `/staging/`。这只适合快速看产物，URL 与线上 staging 不一致；且默认仍使用构建时写入的 API 地址（staging 构建通常为线上）。

---

## 8. 风险与对策

| 风险                                        | 对策                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `scope` / `start_url` 与 `/staging/` 不一致 | 构建时分环境写入 manifest；部署路径固定为 staging → `/staging/`         |
| 用户长期不更新 SW                           | `prompt` + 内联更新提示；重大变更可在发版说明中提示清理站点数据（少用） |
| 图标不合规导致安装项不完整                  | 按 192 / 512 / maskable 补图并真机检查                                  |
| 过度缓存 API                                | runtime 显式网络优先或排除 `/api`                                       |

---

## 9. 实施清单

以下为可勾选的执行项；按顺序推进，**阶段 A** 未完成前不必启动 **阶段 B** 中依赖上线的项。

### 阶段 A：MVP

- [x] **依赖**：在 `minicare-web` 安装并锁定 `vite-plugin-pwa`（及文档要求的 peer）。
- [x] **Vite**：在 `vite.config.ts` 中注册插件；`base` 保持 `./`，核对插件 `base`/注入路径与现有构建一致。
- [x] **Manifest**：配置 `name`、`short_name`、`display`、`theme_color`、`background_color`、`icons`。
- [x] **多环境**：为 **staging** 设置 `scope: /staging/`、`start_url` 指向 `/staging/`（或等价）；为 **production** 设置根路径 scope/start_url（通过 env 或 `mode` 分支）。
- [x] **图标**：在 `public/` 提供至少 192×192、512×512 PNG；可选 maskable；可选 `apple-touch-icon`（可先与 180 共用资源）。
- [x] **Workbox**：启用 precache；为 `/api` 或同源 API 配置 **NetworkOnly** 或确保不缓存 JSON（与项目代理/域名一致）。
- [x] **HTML**：确认 manifest / theme 注入无重复；`index.html` 与 `public/icon.svg` 引用仍正确。
- [x] **本地**：`npm run build:staging` / `build:prod` 无报错；`vite preview` 下检查生成的 `sw`、`manifest` 路径。
- [x] **真机**：Chrome 安装 PWA，打开首页与主要路由（Hash）正常。（已在真机 Chrome 验证通过）
- [x] **Staging 部署**：上传至 `/staging/` 后再次安装验证路径与 scope。（已完成）
- [ ] **文档**：若 `minicare-deploy` 需补充「PWA 发版后抽查 SW」一句，在对应 Skill 或本仓库部署说明中追加（可选）。

**阶段 A 落地说明（仓库现状）**

- 使用 `vite-plugin-pwa`（`registerType: 'autoUpdate'`；阶段 B 再改为 `prompt` + BottomSheet）。开发模式不启用 SW（`devOptions.enabled: false`）。
- 环境变量 `VITE_APP_BASE_PATH`：`/.env.staging` 为 `/staging/`，`.env.production` / `.env.development` 为 `/`，写入 manifest 的 `scope` / `start_url`。
- 构建产物含 `dist/sw.js`、`dist/workbox-*.js`、`dist/manifest.webmanifest`、`dist/registerSW.js`；`index.html` 自动注入 `manifest` 与 `registerSW.js`。
- 图标：`public/icon-192.png`、`icon-512.png`、`apple-touch-icon.png` 由 `npm run generate-pwa-icons`（`sharp` + `public/icon.svg`）生成；`icon.svg` 已改为矢量图形（无 emoji）。
- 本地按 **`/staging/`** 预览：使用 **`npm run preview:staging`**，见上文「7.1 本地预览与 `base: './'`」。

### 阶段 B：更新提示与运维

> **✅ 已修复（驱动阶段 B 实施）**
>
> 原问题：`autoUpdate` 模式下，已打开页面不会自动重载。强制刷新才能加载新代码，普通刷新使用旧版 SW 缓存。
>
> 已修复：`registerType` 改为 `'prompt'`，新增 `UpdatePrompt.tsx` BottomSheet 组件，在 `AppLayout` 中挂载。新 SW 就绪后自动弹出提示，用户点「立即更新」即可即时生效。

- [x] **更新策略**：`vite.config.ts` 中 `registerType` 改为 `'prompt'`；`useRegisterSW` hook 监听 `needRefresh`，`tsconfig.app.json` 中添加 `vite-plugin-pwa/client` 类型。
- [x] **UI**：`src/components/ui/UpdatePrompt.tsx` — BottomSheet 风格，「立即更新」 + 「稍后再说」；禁用 `window.confirm`；在 `AppLayout` 中挂载。
- [x] **用户确认刷新**：用户点击「立即更新」后调用 `updateServiceWorker(true)`，插件封装的 `skipWaiting` + `location.reload()`。
- [ ] **Runtime 缓存**：按需为静态字体/图片增加规则；避免缓存 API 响应。
- [ ] **回归**：发版后二次打开、强刷、多 Tab 场景抽样测一遍。

### 联调与发布（两阶段共用）

- [ ] **HTTPS**：确认正式与 staging 访问均为 HTTPS（CloudBase 默认满足）。
- [ ] **CORS / API**：确认安装态与浏览器态请求同源策略一致，无新增跨域问题。
- [ ] **回滚预案**：若 SW 导致异常，准备临时关闭插件或清空 SW 的发布流程说明（写在团队内部即可）。

---

## 10. 参考

- 项目部署路径与命令：`.cursor/skills/minicare-deploy/SKILL.md`（前端静态托管 staging/production）。
- 前端规范：`.cursor/rules/frontend-coding.mdc`（内联确认、禁用原生 `confirm` 等）。

文档版本：与仓库同步维护；实施完成后可将清单中已完成项勾选并视情况精简「联调」重复项。
