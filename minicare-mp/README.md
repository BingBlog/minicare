# minicare-mp

敏宝日记微信小程序端（Taro 4 + React + TypeScript + Webpack5）。

## 环境要求

- **Node.js ≥ 18**（Taro 4 CLI 依赖）。若终端里 `node -v` 为 **v12** 等旧版本，请先升级后再执行 `npm run dev:weapp`，否则会报错：`Cannot find module 'node:path'`。
- Taro 4.2 会在构建时提示「未来将要求 Node ≥ 20」，可按需执行 `nvm install 20 && nvm alias default 20`。
- 推荐使用 **nvm**：仓库已提供 `minicare-mp/.nvmrc`（内容为 `18`），可在本目录执行 `nvm install && nvm use`。
- npm 或 pnpm
- 微信开发者工具（预览 / 真机调试）

## 安装依赖

```bash
cd minicare-mp
npm install
```

若依赖解析报错，可尝试：

```bash
npm install --legacy-peer-deps
```

## 本地开发（微信小程序）

```bash
npm run dev:weapp
```

若 Node 版本低于 18，脚本会先退出并提示升级（避免出现 `Cannot find module 'node:path'` 这类 Taro CLI 报错）。

构建产物目录为 `dist/`。用 **微信开发者工具** 打开本仓库中的 `minicare-mp` 目录（或按工具提示选择 `dist` 所在项目，以开发者工具识别为准），即可预览。

`project.config.json` 中的 **`appid`** 已与当前小程序对齐。**请勿**把 **AppSecret** 写入本仓库或前端代码；密钥仅用于服务端（如云函数 / 自建后端），本地可放在 **`.env.*.local`**（已被 `.gitignore` 忽略）。

## 对接后端 API

上线前请在微信公众平台配置 **request 合法域名**（例如 CloudRun / API 网关域名），并在小程序侧配置 `API_BASE_URL`（后续接入时在 `src/api` 中统一封装）。

## 相关文档

- 迁移总方案：`docs/tech/MINIAPP-migration-plan.md`
