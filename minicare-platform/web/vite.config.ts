import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 敏宝管理平台 · 维护端
 *
 * 部署形态（TECH-015 §3.1 / §4.8）：
 *   · 开发期：Vite dev server（默认 5173），`/api` 与 `/health` 代理到本机平台进程 8787
 *   · 生产期：`vite build` 产物（dist/）由 FastAPI 在 8787 **同端口托管** → 无 CORS、无反向代理
 *
 * 因此这里不设 base 前缀（生产挂在 `/`），也不用 PWA —— 本平台是桌面维护工具，离线非目标。
 */
const PLATFORM_ORIGIN = process.env.KB_PLATFORM_ORIGIN || 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    /**
     * ⚠️ **必须开轮询**（不是性能偏好，是这个环境下唯一能用的方案）。
     *
     * 实测（2026-10-04）：改完源文件 3 秒后，dev server 仍持续送出**旧内容**
     * （`curl localhost:5173/src/lib/steps.ts | grep 探针` 为 0），表现就是
     * 「改了但页面没变」，只能重启 dev server —— 而 `fsevents.node` 是在的，
     * 说明是**运行环境（沙箱）收不到 fs 事件**，chokidar 的原生监听（fsevents / fs.watch）失效。
     * 轮询不依赖事件投递，是唯一稳的。
     *
     * 代价：每 300ms 扫一遍项目目录。`node_modules` / `dist` / `public/pdfjs` 已排除
     * （后两者一个由构建产出、一个由脚本拷贝，都不需要热更新），本机 SSD 上开销可忽略。
     */
    watch: {
      usePolling: true,
      interval: 300,
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/public/pdfjs/**'],
    },
    proxy: {
      '/api': { target: PLATFORM_ORIGIN, changeOrigin: true },
      '/health': { target: PLATFORM_ORIGIN, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
})
