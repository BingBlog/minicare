# minicare-web 转微信小程序方案（Taro）

> 最后更新：2026-04-28  
> 适用范围：`minicare-web`（React + Vite）迁移至微信小程序端  
> 目标：在不改后端业务接口的前提下，落地可发布的小程序版本

---

## 1. 目标与原则

- 后端 `minicare-server` 与数据库保持不变，继续复用现有 `/api/*`。
- 前端新增小程序工程，避免直接改造 Web 导致双端互相牵连。
- 优先保证核心业务闭环（登录、首页、记录、报告、我的），再做体验增强。
- 小程序和 Web 并行开发与回归，降低上线风险。

---

## 2. 当前项目现状（迁移输入）

`minicare-web` 当前关键特征：

- 技术栈：React 18 + Vite + TypeScript + Zustand + Tailwind。
- 路由：`react-router-dom` + `createHashRouter`。
- 请求：`src/api/http.ts` 中 `fetch` + `localStorage` token。
- 状态：`src/lib/store.ts`（Zustand persist）。
- 典型 Web 依赖：
  - PWA 与 Service Worker（`UpdatePrompt`）。
  - `react-mobile-picker`（时间/日期滚轮）。
  - `@dnd-kit`（快捷操作拖拽编辑）。
  - `recharts`（报告图表）。

以上能力不能直接原样运行在微信小程序环境，需要替换。

---

## 3. 迁移路线（推荐）

采用 **“后端不动 + 前端新建小程序端（Taro React）”**：

1. 新建 `minicare-mp/`（Taro + React + TypeScript）。
2. 复用现有业务分层设计：`pages` / `api` / `store` / `components` / `lib`。
3. 按业务模块逐页迁移，保持路由和目录命名尽量一致。
4. 迁移期间保留 `minicare-web` 正常可用，最终灰度发布小程序。

---

## 4. 关键技术改造清单

### 4.1 路由与页面

- 从 `react-router` 路由改为小程序页面路由（`app.config.ts`）。
- `navigate(path, state)` 改为 query 参数或全局 store 传参。
- Tab 页面映射为小程序 `tabBar` 结构（首页/记录/报告/我的）。

### 4.2 网络与鉴权

- `fetch` 替换为 `Taro.request` 封装。
- `localStorage` 替换为 `Taro.setStorageSync/getStorageSync`。
- 继续使用 `Authorization: Bearer <token>`。
- 小程序端使用 `API_BASE_URL`，不再依赖 Vite `/api` proxy。

### 4.3 状态管理

- 保留 Zustand（可复用思维模型与状态结构）。
- `persist` 存储适配为小程序存储 API。

### 4.4 组件与能力替换

- `react-mobile-picker` -> 小程序 `picker` 或自定义底部滚轮组件。
- `@dnd-kit` -> 小程序拖拽组件，或先降级为“上移/下移排序”。
- `recharts` -> `echarts-for-weixin` / `uCharts`（择一统一）。
- Web PWA 更新逻辑（SW/version.json）删除。

### 4.5 文件与媒体能力

- 图片选择：`wx.chooseMedia` / `wx.chooseImage`。
- 上传链路复用现有后端存储 API（必要时补充分片/压缩策略）。
- 医疗 OCR 保持后端能力不变，小程序仅改前端入口与上传流程。

---

## 5. 分阶段实施计划

## Phase 0（约 1 周）：工程与底座

- 初始化 `minicare-mp` 工程（Taro + TS + React）。
- 完成 API 请求层、token 管理、全局 store。
- 接通登录流程与家庭/宝宝上下文。
- 完成基础 UI Token、通用布局、错误提示机制。

交付：可登录并进入首页骨架。

## Phase 1（约 1-2 周）：核心闭环

- 迁移登录/引导建档。
- 迁移首页（含今日时间线）。
- 迁移 8 类记录的新增与列表（优先 P0 主流程）。

交付：核心记录流程可用。

## Phase 2（约 1 周）：增强能力

- 报告页图表迁移与性能优化。
- 医疗记录图片与 OCR 联调。
- 快捷记录编辑（拖拽或降级排序）补齐。

交付：功能完整度接近 Web MVP。

## Phase 3（约 1 周）：发布与灰度

- 真机联调（iOS/Android）。
- 分包、首屏性能、错误监控与埋点。
- 配置合法域名、备案信息、隐私合规材料。
- 提审、灰度、全量发布。

交付：小程序可上线版本。

---

## 6. 风险与对策

- 路由语义差异（`state` 传参丢失）  
  对策：统一 query/store 传参规范。

- 拖拽与滚轮交互差异  
  对策：先可用后优化，关键页面支持降级方案。

- 图表性能与包体压力  
  对策：图表组件按需加载 + 分包。

- 域名/网络白名单导致请求失败  
  对策：提前完成微信公众平台合法域名配置与联调。

---

## 7. 目标目录建议

```text
minicare-mp/
├── src/
│   ├── pages/
│   │   ├── login/
│   │   ├── onboarding/
│   │   ├── home/
│   │   ├── records/
│   │   ├── report/
│   │   └── profile/
│   ├── api/
│   ├── store/
│   ├── components/
│   └── lib/
├── project.config.json
└── package.json
```

---

## 8. Web -> 小程序映射原则

- `src/api/*`：优先迁移，尽量保持方法名一致。
- `src/lib/constants.ts`：作为双端共享常量首批候选。
- `src/lib/utils.ts`：抽取纯函数到共享层，平台相关逻辑分离。
- 页面层按 `F01~F12` 业务模块迁移，避免按“组件散迁”失控。

---

## 9. 验收标准（迁移完成定义）

- 核心 P0 模块在小程序端可完整操作并与后端联通。
- 关键路径（登录 -> 首页 -> 记录 -> 报告 -> 家庭）真机通过。
- 无阻断性兼容问题（iOS/Android 主流机型）。
- 审核材料、隐私合规、备案流程可闭环。

---

## 10. 后续建议

- 第二阶段可将 `api/types/constants/utils` 抽到 `packages/shared`，形成 Web + MP 双端共享层，降低长期维护成本。

---

## 11. 开发环境（已初始化）

仓库内已创建小程序工程目录 **`minicare-mp/`**（Taro 4 + React + TS + Webpack5），包含示例首页与构建脚本。

- **说明与命令**：见 `minicare-mp/README.md`
- **Node 版本**：需 **≥ 18**（根目录可通过 `minicare-mp/.nvmrc` 对齐）
- **本地调试**：`npm install` 后执行 `npm run dev:weapp`，用微信开发者工具打开/关联该工程即可预览

