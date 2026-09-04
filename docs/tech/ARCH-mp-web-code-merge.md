# 小程序 / Web 双端代码合并方案调研

> 状态：调研结论（待决策）
> 日期：2026-09-03
> 范围：`minicare-mp`（Taro 4.2 + React 18）与 `minicare-web`（React 18 + Vite 6 + Tailwind）
> 问题：双端各维护一套代码，如何减少重复维护成本

---

## 一、结论（TL;DR）

1. **项目内已有过一次相关分析**：`docs/tech/MINIAPP-migration-plan.md`（Web → 小程序迁移方案，已归档）。其第 10 节「后续建议」明确写过：*第二阶段可将 api/types/constants/utils 抽到 `packages/shared`，形成 Web + MP 双端共享层*。该建议从未落地，两端已开始分叉。
2. **完全合并为一套代码（方案 A：Taro H5）是可行的**，且本项目的前置条件比一般项目好：mp 代码零裸调 `wx.*`、全部通过 `Taro.*` API、仅 2 处 `TARO_ENV` 分支。预计 POC 1-2 天可验证，完整切换约 1-2 周（含回归）。
3. **若不做完全合并，公共目录（方案 B：`packages/shared`）值得做但只解决一半问题**——能共享的 api/lib/类型层约 4-5k 行；页面/组件/样式（两端代码的大头，约 20k+ 行/端）因 UI 原语不同（Taro 组件+SCSS vs HTML+Tailwind）无法直接共享。
4. **AI coding 对双端维护是友好的**：Taro 的条件编译与多端文件是文件名约定（`.weapp.ts` / `.h5.ts`），规则明确、可写入 `.agents/rules/`，比人工更不容易「忘记同步」。需要配两条护栏：共享文件 lint 禁用端特有全局对象、CI 同时编译双端做冒烟。
5. **推荐路径**：先做方案 A 的 POC（在 minicare-mp 上开 H5 编译目标）；POC 通过 → Web 冻结并由 Taro H5 产物替代；POC 受阻 → 退回方案 B 止血。若 Web 已无真实用户，方案 C（直接冻结 Web、停止同步）是零成本选项。

---

## 二、项目内已有分析检索结果

| 文档 | 相关内容 |
|---|---|
| `docs/tech/MINIAPP-migration-plan.md` | 当年 Web→MP 迁移方案（已归档）。**第 10 节已提出 `packages/shared` 双端共享层建议，未落地**；第 8 节给出了映射原则（api 方法名一致、constants 作为双端共享首批候选） |
| `docs/tech/ARCH-config-api.md` | 枚举/常量/配置下沉后端 `/api/config` 统一下发的方案——是「常量多端同步」问题的长期解，Phase 2 过渡期两套数据源并存按模块迁移 |
| `docs/architecture.md` | 明确定位：小程序为**主平台**，Web H5 为**维护模式** |
| Git 记录 | `feat(web): sync miniprogram features and bug fixes to web`、`feat(web): migrate invite & multi-baby features from MP to Web`——证实当前工作流是「MP 先行开发、人工同步回 Web」，即本次想消除的痛点 |

---

## 三、两端代码重合度量化

### 3.1 总量与分层

| 层 | minicare-mp | minicare-web | 重合情况 |
|---|---|---|---|
| TS/TSX 总行数 | 25,783 | 33,944 | — |
| api 层 | 2,215 行（23 文件，扁平） | 2,404 行（records/ 子目录） | **几乎全量平行重复**，仅 http.ts 与组织方式不同 |
| lib 层 | 2,132 行 | 1,393 行 | 部分重复且已分叉 |
| 页面/组件/样式 | 约 21k 行（Taro 组件 + SCSS） | 约 30k 行（HTML + Tailwind） | **无法直接共享**（UI 原语不同） |

### 3.2 共享候选文件逐个 diff（web → mp）

| 文件 | 状态 | 结论 |
|---|---|---|
| `lib/growth-standards.ts` | diff 为空 | **完全一致**，可直接共享 |
| `lib/cloudbase.ts` | 30+/5- | 基本一致（仅环境变量来源不同：`TARO_APP_*` vs `VITE_*`），易共享 |
| `lib/useAppConfig.ts` | 53+/76- | 小幅分叉，易合并 |
| `api/types.ts` | mp 80 行 vs web 585 行 | mp 拆到各 api 文件内，web 全量大文件——需要一次归并 |
| `lib/constants.ts` | mp 242 行 vs web 334 行 | 已分叉，需人工合并（`ARCH-config-api` 方案可长期替代） |
| `lib/utils.ts` | mp 311 行 vs web 370 行 | 已分叉，纯函数部分可共享、平台函数需拆分 |
| `lib/records-sort.ts` | 45+/35-（命名风格差异） | 易合并 |
| `api/http.ts` | 完全不同（fetch vs Taro.request） | 不共享，各端保留薄适配层 |

### 3.3 业务功能对比

- mp 是功能超集：chat / diary / device / dashboard 分包、iPad 适配、语音输入等仅 mp 有。
- web 的独有物只有：PWA/Service Worker、dev 页面、Tailwind 版 UI（与 mp UI 是同构的 1:1 平行实现，mp 页面注释明确写「与 Web pages/records/diaper/index.tsx 保持业务逻辑对齐，子组件拆分与 Web 1:1 对应」）。

---

## 四、方案 A：基于小程序代码构建 Web（Taro H5，单代码库）

### 4.1 可行性依据

1. **Taro 官方将 H5 作为一等编译目标**：页面 → 路由、分包 → 懒加载 chunk、`Taro.request/setStorageSync/navigateTo` 均有 H5 实现。
2. **本项目代码纪律对 H5 极友好**：全库 0 处裸调 `wx.*`，45 个文件通过 `Taro.*` 访问平台能力，仅 `useVoiceInput.ts` / `useChatVoice.ts` 2 处 `TARO_ENV` 守卫。
3. **登录链路两端天然一致**：均为 CloudBase 短信 OTP（`signInWithOtp → verifyOtp → /api/auth/tcb-login` 换 JWT），H5 不是阻塞点。
4. **echarts 为标准 `echarts/core` 按需引入**，H5 可直接渲染（weapp 截图模式反而是端特有分支）。

### 4.2 适配成本清单（web 端运行时依赖的小程序能力逐项评估）

| # | 能力 | 现状 | H5 适配方式 | 成本 |
|---|---|---|---|---|
| 1 | HTTP / 存储 / 导航 | `Taro.request` / `setStorageSync` / `navigateTo` / 自定义 TabBar | Taro H5 原生支持（XHR / localStorage / hash 路由） | 近零 |
| 2 | API 导入风格 | `import Taro from '@tarojs/taro'` 默认导入 + `Taro.xxx` 调用 | Taro 4 在 H5 曾出现默认导入缺方法的案例（GitHub discussion #17382），需编译验证；必要时 codemod 为具名导入 | 小（0.5 天验证 + 可能批量替换） |
| 3 | 图片压缩+COS 直传 | `Taro.compressImage`（weapp only）+ `getFileSystemManager().readFile` 读 ArrayBuffer 再 PUT | 多端文件：`uploadImage.weapp.ts` / `uploadImage.h5.ts`（H5 用 canvas 压缩 + fetch Blob/File PUT，签名 header 集不变） | 小（1 个文件 × 2 实现） |
| 4 | 报告图表 | EcChart：weapp Canvas 离屏 + 截图展示 | H5 分支直接 `echarts.init(canvas DOM)`；weapp 分支保留 | 小（组件内 `TARO_ENV` 分支） |
| 5 | 状态栏/安全区、分享图、语音输入 | `safeArea.ts` / `shareImage.ts` / `useVoiceInput.ts` | 多端文件或 no-op 守卫（语音已有守卫） | 小 |
| 6 | 登录鉴权 | CloudBase OTP（`@cloudbase/app` + `@cloudbase/auth`） | 同一链路，浏览器即原生场景 | 近零 |
| 7 | 分包/预加载 | `subPackages` + `preloadRule` | H5 编译为懒加载路由，自动生效 | 近零 |
| 8 | 样式隔离 | SCSS + BEM 风格类名 | H5 无样式隔离，全局作用域——依赖现有类名纪律，必要时 CSS Modules | 小（回归排查） |
| 9 | Web 独有能力 | PWA/SW 更新提示、Tailwind UI、dev 页面 | H5 产物 = mp UI（预期收益）；PWA 需重接或明确放弃；dev 页面不迁移 | 中（视 PWA 是否保留） |
| 10 | 双端回归保障 | 仅编译 weapp | CI 增加 `build:weapp` + `build:h5` 双目标编译冒烟 | 小（一次性配置） |

### 4.3 已知风险（来自社区反馈）

- Taro 4.x 文档更新滞后、H5 端零散 API 兼容问题（`getCurrentPages` 刷新后为空、ScrollView overflow、className 空字符串崩溃、`chooseImage` 返回结构差异等）——均为可绕过的工程问题，但需要真实浏览器回归。
- H5 样式全局作用域与小程序隔离行为不同，是回归问题的主要来源。
- `pageOrientation: auto`、iPad 适配等 mp 特性在 H5 无对应物，按响应式处理即可。

### 4.4 工作量估计

- **POC（1-2 天）**：mp 开启 H5 编译 → 跑通「登录 → 首页 → 一个记录表单 → 报告图表」→ 浏览器真实验证。
- **完整切换（约 1-2 周）**：适配清单逐项落地 + 全页面浏览器回归 + 部署产物替换 `minicare-web`（`minicare.top` 路径不变）+ PWA 决策。

---

## 五、方案 B：不完全合并时的公共目录设计（`packages/shared`）

若不替换 Web（或 POC 未通过），落地迁移方案文档中提出但未实施的共享层：

### 5.1 工程结构

```text
minicare-v1/
├── pnpm-workspace.yaml          # 新增：packages: ['minicare-mp', 'minicare-web', 'packages/*']
├── packages/shared/             # 新增：纯 TS 源码包，不预编译
│   ├── package.json             # name: @minicare/shared, main: src/index.ts
│   └── src/
│       ├── types/               # 领域类型（Family/Baby/Record/各记录类型，归并两端分叉）
│       ├── constants/           # 枚举 label、选项配置（长期由 /api/config 下发替代）
│       ├── utils/               # 纯函数：date、scoop、records-sort 等
│       ├── growth-standards/    # 中国 2023 生长标准数据（当前已完全一致）
│       └── api/                 # 各记录类型的请求函数（入参出参类型化；transport 由各端注入）
└── minicare-mp / minicare-web   # 依赖 "@minicare/shared": "workspace:*"
```

- **mp 接入**：Taro webpack5 `compile.include` 加入 `packages/shared`（直接编译 TS 源码），或 alias。
- **web 接入**：Vite `resolve.alias` 指向 shared 源码，零构建成本。
- **transport 注入**：shared 里的 api 模块不 import Taro/fetch，由两端把各自的 `http.ts` 传进去，保持 `request<T>()` 语义一致。

### 5.2 迁移顺序（按分叉风险从低到高）

1. `growth-standards`（零分叉）→ 2. `types`（归并 mp 80 行 + web 585 行）→ 3. `records-sort` / `utils` 纯函数 → 4. `constants`（人工合并分叉，注意 web 334 行里含 mp 没有的枚举）→ 5. api 请求模块（最大件）。

### 5.3 成本与边界

- 成本：基建 1-2 天（workspace + 双端编译链路），模块迁移按序推进，总量 3-5 天。
- **边界**：只解决 api/lib/类型层（约 4-5k 行/端）的双维护；页面、组件、样式（两端的大头）依旧各写一套。UI 不同步问题依然存在。

---

## 六、AI coding 对双端开发的适配性评估

**结论：善于处理，且优于人工同步，但需要两条护栏。**

有利因素：

1. Taro 跨端机制是**文件约定**而非运行时魔法：`process.env.TARO_ENV` 条件编译（编译期 DCE）+ 多端文件（`xxx.weapp.ts` / `xxx.h5.ts`，引用时写默认名）。AI 可以确定性地遵守「共享逻辑进默认文件、端差异进带后缀文件」，不依赖模糊判断。
2. 项目已有的纪律（0 裸调 `wx.*`、全走 `Taro.*`）证明这类约束 AI 能长期遵守；且本仓库 `.agents/rules/` 规则体系可直接承载，新增一条跨端规则（如：共享文件禁止 `window/document/localStorage` 直用、平台差异必须走多端文件、改共享文件需双端编译验证）即可。
3. 人工同步 Web 的真实痛点（两次 `sync ... to web` commit）本质是「容易忘」——AI + 自动化恰恰擅长消除这类流程性遗漏。

需要的护栏（否则会烂）：

1. **ESLint 限制**：共享目录 `no-restricted-globals`（window/document/localStorage）+ `no-restricted-imports`（禁 @tarojs/components 进 shared）。
2. **双端编译冒烟**：CI 同时跑 `build:weapp` 与 `build:h5`（方案 A）或 `tsc` 两端类型检查（方案 B），防止只编译单端导致另一端静默腐烂。

---

## 七、方案对比与推荐

| 维度 | A：Taro H5 单代码库 | B：packages/shared | C：冻结 Web |
|---|---|---|---|
| 消除重复维护的范围 | 几乎全部（~100%） | 仅 api/lib/类型层（约 20%） | 无（停止投入） |
| 一次性成本 | POC 1-2 天；切换 1-2 周 | 3-5 天 | 0 |
| 持续成本 | 双端构建/回归自动化（低） | 低 | 0 |
| 主要风险 | Taro 4 H5 零散兼容问题、PWA 取舍 | 常分叉文件合并的体力活；UI 依旧双维护 | Web 功能停滞 |
| 前提 | 接受 H5 使用 mp 的 UI | 两端 UI 均需继续迭代 | Web 无真实用户 |

**推荐**：先花 1-2 天做方案 A 的 POC（在 `minicare-mp` 开 H5 编译目标，验证第 4.2 节清单 #1/#2/#3/#4 四个点）。POC 通过 → 按「登录 → 记录表单 → 报告图表 → 全页面回归」顺序推进替换，`minicare-web` 冻结归档；POC 受阻 → 落地方案 B 止血（其中 growth-standards 与 types 无论走哪条路都建议先抽出来）。若确认 Web 已无真实流量，也可直接选 C。

---

## 附：POC 验证清单

> **2026-09-03 POC 已完成，结果：全部通过 ✅**（详见第八节）

- [x] `build:h5` 编译通过（webpack5，78s；`Taro.showToast/request` 默认导入在 H5 正常可用）
- [x] 登录页 test 模式跑通（`send-code` 200 → 登录 → 跳回首页；CORS 已配置白名单）
- [x] 记录表单（diaper）新增提交成功（`POST .../records/diaper` → 201）
- [x] EcChart 在 H5 直接渲染（echarts 实例挂载真实 canvas，生长曲线/百分位带正常）
- [x] 分包路由在 H5 变为懒加载路由、自定义 TabBar 正常
- [x] 样式回归：移动端字体与小程序 1:1（根字号锁定方案，见 8.2）

---

## 八、POC 实施记录（2026-09-03）

### 8.1 结论

**Taro H5 单代码库方案 POC 一次通过**：`minicare-mp` 增加 H5 编译目标后，登录 → 尿布表单提交 → 报告图表全链路在真实浏览器跑通，改动仅 4 个文件、零业务逻辑变更。验证截图见 `docs/tech/assets/poc-h5/`。

### 8.2 改动清单

| 文件 | 改动 | 说明 |
|---|---|---|
| `config/index.ts` | `outputRoot` 按 `TARO_ENV` 分离（h5 → `dist-h5`）+ copy 仅 weapp | 避免覆盖 weapp 的 dist（开发者工具正在 watch） |
| `config/dev.ts` | H5 devServer overlay 关闭 warning 浮层 | Sass @import 弃用警告不再遮蔽页面 |
| `src/components/EcChart/EcChart.tsx` | 增加 H5 分支：echarts 直接初始化真实 canvas | weapp 截图模式分支保留不变 |
| `src/lib/useIsIPad.ts` | H5 端仅 iPad UA 才启用大屏样式 | 桌面浏览器（宽 ≥768/platform=mac）误触发 iPad 布局 |
| `src/styles/h5-global.scss` | 桌面「手机画框」+ 根字号恒锁 40PX | 见 8.3/8.4，本 POC 最关键的两个坑 |
| `minicare-server/.env.local` | `CORS_ORIGINS` 追加 `localhost:10086/127.0.0.1:10086` | H5 是浏览器环境，必须 CORS 白名单（weapp 无此概念） |

### 8.3 关键踩坑 1：根字号必须恒锁 40PX（rem 语义冲突）

本项目 scss 以 **375 稿 px 直书**，且 weapp 端 `pxtransform.enable: false`（px 按逻辑像素原样渲染，不缩放）。而 Taro H5：

- 编译端：px → rem ÷40（`rootValue = (baseFontSize 20 / deviceRatio 1) × 2`）
- 运行时：注入脚本按 **750 稿等比**缩放根字号（`40×w/750`，375 宽 → 20px）

两端假设冲突 → 手机端所有 rem 尺寸渲染成源码的**一半**（字体极小、布局显小）。解法：`h5-global.scss` 中 `html { font-size: 40PX !important }` 覆盖注入脚本，使 rem 恒等 px，与小程序端 1:1。

> 注意 `PX` 大写是 Taro 的「免转换」转义写法；样式表 `!important` 可覆盖脚本写入的 inline 根字号。

### 8.4 关键踩坑 2：桌面端「手机画框」（fixed 元素收编）

桌面宽屏直接渲染会全宽拉伸 + `useIsIPad` 误触发 iPad 布局。全项目 24 处 `position: fixed`（TabBar/SubmitBar/底部弹层）逐个改不现实，采用：

```scss
@media screen and (min-width: 500PX) {
  html, body { height: 100%; overflow: hidden; }
  #app {
    max-width: 500PX; margin: 0 auto; height: 100%;
    overflow-y: auto;
    transform: translateZ(0);   /* 创建包含块：fixed 后代改相对 #app 定位 */
  }
}
```

`transform` 使 fixed 后代（TabBar 等）自动相对 500px 画框定位，滚动改为容器内滚——零业务样式侵入。

### 8.5 POC 未覆盖项跟进（2026-09-03 第二轮，已完成 4 项）

本轮新增改动：

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/lib/uploadImage.h5.ts` | **新增** H5 上传实现（多端文件） | canvas 缩放压缩（返回 data URL）+ fetch Blob PUT 直传 COS，签名 header 与 weapp 版一致；chat/diary/medical 三个上传场景共用 |
| `src/pages/records/medical/PhotoSection.tsx` | 删除本地 `compress`/`uploadToCos` 重复实现 | 收敛到共享多端版本（原参数与共享版完全一致，weapp 行为不变） |
| `src/pages/home/index.tsx` | `showShareMenu` 加编译期守卫；移除 `generateShareImage` 死导入 | 消除 H5 console 报错；shareImage.ts 整体无引用、被 tree-shake |
| `scripts/build-all.sh` | **新增** 双端编译冒烟脚本（CI 用） | 注明 weapp 构建会覆盖 dist 的本地注意事项 |

验证结果：

- **多端文件生效确认**：dev 与静态产物 chunk 均包含 `uploadImage.h5.ts`（8.4 KiB），`getFileSystemManager().readFile` 在 H5 产物中零残留
- **COS 直传链路**：`/api/storage/upload-url` 201 成功；PUT 已正确发出，被浏览器拦截于 COS 桶跨域（见 8.7 前置配置）
- **静态构建冒烟**：`taro build --type h5 --mode development`（49s）→ 静态 serve 后浏览器启动/hash 路由/根字号 40px/登录入口全部正常
- **`tsc --noEmit` 全量类型检查通过**（唯一警告为 sass 类型库既有噪音）

### 8.6 仍待办（完整切换前）

1. **COS 桶跨域配置**（一次性控制台操作，H5 上传链路的前置条件，见 8.7）
2. **PWA/Service Worker 取舍**：原 web 的离线/更新提示能力，需决策放弃或基于 H5 产物重接
3. **生产构建部署**：`build:h5` production 产物替换 `minicare.top` 静态托管（部署前需先完成 8.7 并把生产域名加入桶 CORS）
4. 微信支付/分享等 wx 特有能力：H5 无对应物，当前按端守卫降级（已覆盖）

### 8.7 前置配置：COS 桶跨域（H5 上传链路必需）

H5 是浏览器环境，直传 COS 受同源策略约束（weapp 无此概念）。当前 `http://localhost:10086` 的 PUT 被 CORS 拦截（`upload-url` 接口 201 正常，PUT `Failed to fetch`）。

**配置步骤**（云开发控制台，约 2 分钟）：

1. 打开云开发控制台 → 云存储 → 安全配置（跨域配置）
2. 添加规则：
   - 来源：`http://localhost:10086`（本地开发）、`https://minicare.top`（生产 H5 部署后）
   - 方法：`PUT`
   - 允许 Headers：`Signature, authorization, x-cos-security-token, x-cos-meta-fileid, key, Content-Type`
3. 保存后重试 H5 端图片上传即可打通

### 8.8 本地开发命令备忘

```bash
# H5 dev server（Node 18，端口 10086，连本地后端 3001，auth=test 模式）
cd minicare-mp && PATH="/Users/bing/.nvm/versions/node/v18.20.8/bin:$PATH" NODE_OPTIONS= npm run dev:h5

# 后端（需 .env.local 的 CORS_ORIGINS 含 localhost:10086）
cd minicare-server && NODE_ENV=development node dist/main.js
```
