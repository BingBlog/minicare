import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

/** 与静态托管路径一致：生产 `/`，预发 `/staging/` */
function normalizeAppBasePath(raw: string | undefined): string {
  let p = raw?.trim() || '/'
  if (!p.startsWith('/')) p = `/${p}`
  if (p !== '/' && !p.endsWith('/')) p += '/'
  return p
}

function apiNetworkOnlyPatterns(
  env: Record<string, string>
): { urlPattern: RegExp; handler: 'NetworkOnly' }[] {
  const rules: { urlPattern: RegExp; handler: 'NetworkOnly' }[] = [
    { urlPattern: /^\/api\//, handler: 'NetworkOnly' },
  ]
  const base = env.VITE_API_BASE_URL?.trim()
  if (!base) return rules
  try {
    const u = new URL(base)
    const origin = u.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    rules.push({
      urlPattern: new RegExp(`^${origin}/api/`),
      handler: 'NetworkOnly',
    })
  } catch {
    // ignore invalid VITE_API_BASE_URL
  }
  return rules
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const appBasePath = normalizeAppBasePath(env.VITE_APP_BASE_PATH)
  const runtimeCaching = apiNetworkOnlyPatterns(env)

  // 构建时间戳，用于版本检测（绕开 CDN 对 sw.js 的强缓存）
  const buildTime = new Date().toISOString()

  // 生成 public/version.json，部署后供客户端轮询比较
  fs.writeFileSync(
    path.resolve(__dirname, 'public/version.json'),
    JSON.stringify({ buildTime }),
  )

  return {
    define: {
      // 注入构建时间到前端代码，供 UpdatePrompt 比较
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null, // 手动注册，在代码里给 sw.js 加版本号参数绕开 CDN 缓存
        base: './',
        manifestFilename: 'manifest.webmanifest',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: '敏宝日记',
          short_name: '敏宝日记',
          description: '敏宝成长记录与健康管理',
          theme_color: '#F87098',
          background_color: '#F87098',
          display: 'standalone',
          scope: appBasePath,
          start_url: appBasePath,
          lang: 'zh-CN',
          icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // 只 precache 带 hash 的静态资源（JS/CSS/图片/字体）
          globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
          // 明确排除 index.html，防止 generateSW 自动注入
          globIgnores: ['**/index.html'],
          // 禁用 SPA navigation fallback（它会把 index.html 加进 precache）
          navigateFallback: null,
          runtimeCaching: [
            // index.html / 目录路径 — NetworkFirst
            // 普通刷新优先请求网络，联网时始终拿到最新版本
            {
              urlPattern: ({ request }: { request: Request }) =>
                request.mode === 'navigate',
              handler: 'NetworkFirst' as const,
              options: {
                cacheName: 'html-cache',
                networkTimeoutSeconds: 5,
                expiration: { maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            // API 接口 — NetworkOnly（不缓存）
            ...runtimeCaching,
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    base: './', // 相对路径，CloudBase 静态托管 CDN 必须
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
