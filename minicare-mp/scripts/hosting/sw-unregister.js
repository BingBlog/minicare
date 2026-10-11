/**
 * 过渡用「自注销」Service Worker（PWA 废弃 · 2026-10-10）
 *
 * 背景：旧 minicare-web 以 PWA 形式注册过 Service Worker（/sw.js、/staging/sw.js），
 * 历史用户的浏览器会持续用旧的 precache / 路由规则接管请求。web 由 Taro H5 替代后
 * PWA 废弃，本文件部署在 /sw.js 与 /staging/sw.js 覆盖旧 SW——浏览器在下次访问站点时
 * 会自动拉取本文件并触发生命周期：
 *   1) skipWaiting 尽快接管
 *   2) 清空全部 CacheStorage（旧 precache 缓存）
 *   3) 注销自身注册（退场）
 *
 * ⚠️ 本文件需长期保留在托管根与 /staging/（覆盖尚未回访的历史 PWA 用户），不要删除。
 * ⚠️ 故意不注册 fetch 处理器：未接管请求时浏览器直接走网络，行为等价于「没有 SW」。
 */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      } catch (e) {
        // 清理缓存失败不阻塞退场
      }
      try {
        await self.registration.unregister()
      } catch (e) {
        // ignore
      }
    })(),
  )
})
