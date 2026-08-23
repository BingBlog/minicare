# 微信开发者工具 API 能力调研：是否存在类似 Chrome CDP 的调试协议

> 调研日期：2026-08-20 ｜ 结论：**官方没有开放标准 CDP，但有私有的「自动化协议」+ HTTP/CLI 双接口**，可组合出接近 CDP 的开发辅助能力。

## 一、核心结论

微信开发者工具**不提供**面向外部开发者开放的、标准化的 Chrome DevTools Protocol（CDP）端点。它提供的是**三层私有接口**：

| 层级 | 接口 | 通信方式 | 定位 |
|---|---|---|---|
| 1 | 自动化协议（miniprogram-automator） | 私有 WebSocket（`ws://127.0.0.1:9420`） | 最接近 CDP 的能力：驱动页面、操作元素、截图 |
| 2 | HTTP 调用接口（`/v2/*`） | HTTP REST | 工具级操作：打开/编译/预览/上传/清缓存 |
| 3 | CLI 调用（`cli` v2） | 命令行 | 与 HTTP 接口能力等价，适合脚本 |

工具**内部**的模拟器/调试器基于 Chromium 内核，官方调试面板（Performance、Memory、Layer、Rendering）就是 CDP 驱动的，但**未对外暴露调试端口**。

## 二、三层接口能力清单

### 1. 自动化协议（miniprogram-automator）— 官方「CDP 类似物」

- **连接**：`cli auto --project <dist> --auto-port 9420`，SDK `automator.connect({ wsEndpoint })`
- **MiniProgram 层**：`reLaunch`（打开页面）、`currentPage`、`navigateBack`、`switchTab`、`callWxMethod`、`screenshot`（**截图**）、`exposeFunction`（注入函数）
- **Page 层**：`$` / `$$`（CSS 选择器查元素）、`data()`（读取页面数据）、`callMethod`（调用页面方法）、`setData`、`waitFor`
- **Element 层**：`tap`（点击）、`input`（输入）、`longPress`、`attribute`、`wxml`（**获取 WXML 结构**）、`text`、`style`
- **局限**（相对 CDP 缺失）：
  - ❌ 无网络请求监控（Network 面板能力）
  - ❌ 无 Console 日志流式订阅
  - ❌ 无运行时断点/单步调试（Debugger 面板能力）
  - ❌ 无 Performance profile 导出
  - ⚠️ 与开发者工具版本强耦合（我们实测 0.12.1 与新版工具存在协议兼容波动）

### 2. HTTP 调用接口（/v2/*）

- 工具启动后自动开启 HTTP 服务，端口号在用户目录 `.ide` 文件中（macOS：`~/Library/Application Support/微信开发者工具/<MD5>/Default/.ide`）
- 接口：`/login` `/islogin` `/preview` `/upload` `/autopreview` `/buildnpm` `/cleancache` `/open` `/close` `/quit` `/resetfileutils` `/cloud/*`
- 特点：GET 请求、无鉴权（本机回环）、支持 `compile-condition`（自定义编译条件：指定启动页面+参数）

### 3. CLI 调用（cli v2）

- 与 HTTP 接口能力一一对应，另有 `auto-replay`（自动化测试录制回放窗口）、`build-npm`、`cache` 等
- 前置：设置 → 安全设置 → 服务端口开启

## 三、工具内部 Chromium 调试能力（面板级）

官方文档明确模拟器调试面板「参考 Chrome 对应面板」实现，包括：

- **逻辑层 JS Profile**：Performance / JavaScript Profiler 面板
- **逻辑层内存调试**：Memory 面板（JS 堆快照，排查泄漏）
- **视图层调试**（需 nightly 版）：Performance / Memory / Layer / Rendering 面板——视图层即 WebView，本质是 CDP
- **低端机模拟**：CPU 限速

这些能力**只在 GUI 内可用，无外部协议入口**。

## 四、社区方案（非官方）

| 方案 | 原理 | 平台 | 可用性 |
|---|---|---|---|
| WMPFDebugger | 逆向私有调试协议 → 转标准 CDP，浏览器内用 Chrome DevTools 调试小程序 | 仅 Windows（WMPF 运行时） | 不适用于本项目（macOS 开发者工具） |
| Playwright/Puppeteer 直连 WebView CDP | 启动时加调试参数，直连视图层 WebView 的 CDP 端口 | 需特殊参数/定制基础库 | 非官方路径，稳定性差 |
| 云测平台 SDK | 平台封装真机自动化 | 云端 | 有费用、灵活性低 |

## 五、对本项目（minicare）的开发辅助建议

1. **已落地**：`miniprogram-ui-preview` skill 已用自动化协议实现「截图 + WXML」双通道预览审查，覆盖 UI 渲染与功能断言
2. **可扩展**：利用 HTTP/CLI 接口补充工具级自动化——`/v2/preview` 自定义编译条件直达指定页面、`/v2/upload` 自动化发版、`cli auto-replay` 录制回放测试用例
3. **能力缺口**：网络请求监控与 Console 日志目前无官方外部入口；如需可考虑：
   - 页面内注入（`exposeFunction` + 项目内日志收集）绕行
   - 后端链路用 NestJS 日志/云函数日志补充排查（minicare-server 已有完整日志）
4. **版本敏感**：自动化协议随工具版本演进有兼容波动（本次已踩坑），脚本层保持与 automator 版本锁定

## 参考文档

- 自动化测试：https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/quick-start.html
- CLI 调用：https://developers.weixin.qq.com/miniprogram/dev/devtools/cli.html
- HTTP 调用：https://developers.weixin.qq.com/miniprogram/dev/devtools/http.html
- 模拟器与调试器：https://developers.weixin.qq.com/miniprogram/dev/framework/performance/devtools-perf
