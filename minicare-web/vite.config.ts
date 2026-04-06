import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

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

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
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
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching,
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
