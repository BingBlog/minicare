# minicare-mp — 敏宝日记微信小程序

> 敏宝日记的主发布平台。基于 Taro 4.2 + React 18 + TypeScript + Webpack5 构建。
> AppID: `wxac792556967d5838`

## 功能概览

敏宝日记是一款针对过敏体质宝宝的全方位日常护理记录工具，支持：

- 8 类日常记录：母乳/配方奶/辅食/营养补充、睡眠、尿布、活动、健康、表现、生长发育、医疗
- 数据分析报告：ECharts 6 图表可视化，支持 7/14/30 天范围
- 家庭协作：邀请码加入家庭，多成员共同记录
- 食物观察日志：辅食引入追踪与过敏标记
- 访客预览模式：未登录可浏览部分内容

## 技术架构

| 层级 | 技术栈 |
|------|--------|
| 框架 | Taro 4.2 + React 18 |
| 语言 | TypeScript |
| 构建 | Webpack 5 |
| 图表 | ECharts 6（截图模式） |
| 后端 | NestJS on CloudRun（共享） |

### 分包策略

- **主包**：4 个 TabBar 页面（首页/记录列表/报告/我的）+ 登录/引导页
- **子包**（`subPackages`）：各记录表单、家庭管理、详情页等低频页面
- 主包体积控制在 2MB 以内

### 自定义 TabBar

使用 Taro 自定义 TabBar（`custom: true`），中间为 FAB 按钮，点击弹出记录类型选择弹层。

## 环境要求

- **Node.js >= 18**（Taro 4 CLI 依赖）。仓库已提供 `.nvmrc`（内容为 `18`），可执行 `nvm install && nvm use`。
- npm 或 pnpm
- 微信开发者工具（预览/真机调试）

## 安装与开发

```bash
cd minicare-mp
npm install

# 本地开发（watch 模式）
npm run dev:weapp

# 生产构建
npm run build:weapp
```

若依赖解析报错，可尝试 `npm install --legacy-peer-deps`。

构建产物目录为 `dist/`。用微信开发者工具打开 `minicare-mp` 目录即可预览。

## 对接后端 API

- 所有 API 调用统一经 `src/api/http.ts` 的 `request()` 函数，禁止直接 `Taro.request`
- API 路径保持 `/api` 前缀
- 本地开发时连接 `127.0.0.1:3001`（NestJS 开发服务器）
- 生产环境 `API_BASE_URL` 指向 CloudRun 域名，需在微信公众平台配置 request 合法域名

## 认证模式

- **测试模式**：固定验证码 `123456`，便于开发调试
- **短信模式**：CloudBase SMS OTP，生产环境使用
- **访客模式**：未登录用户可浏览部分页面

## 项目结构

```
src/
├── api/             # API 模块（http.ts + 各业务模块）
├── assets/icons/    # SVG 图标资源
├── components/      # 通用组件
├── custom-tab-bar/  # 自定义 TabBar 组件
├── lib/             # 工具函数、常量定义
├── pages/           # 主包页面
├── subpackages/     # 子包页面
└── app.config.ts    # Taro 应用配置
```

## 发布流程

1. `npm run build:weapp` 生产构建
2. 微信开发者工具上传代码
3. 微信公众平台提交审核 -> 发布正式版

## 相关文档

- 项目总览：`docs/overview.md`
- 架构设计：`docs/architecture.md`
- 迁移方案（已归档）：`docs/tech/MINIAPP-migration-plan.md`
- 小程序开发规范：`.cursor/rules/miniapp-development.mdc`
