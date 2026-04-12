/**
 * PWA 更新提示组件
 *
 * 核心问题：CloudBase CDN 对 sw.js 设置了 max-age=31536000（1年），
 * 导致浏览器永远拿不到新的 sw.js，SW 更新链路完全失效。
 *
 * 解决方案：
 * 1. SW 注册时在 URL 上加 ?v=BUILD_TIME，每次构建不同，绕开 CDN 缓存
 * 2. 轮询 version.json?t=时间戳（no-store），对比构建时间戳检测更新
 * 3. 用户点「立即更新」时执行 location.reload()，强制从网络拉最新代码
 */

import { useEffect, useRef, useState } from 'react'

/** 刷新图标 */
const IconRefresh = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#F05060"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 28, height: 28 }}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)

/** 当前构建时间戳（由 vite.config.ts define 注入） */
const BUILD_TIME = import.meta.env.VITE_BUILD_TIME as string | undefined

/** 拉取服务器上的版本信息（?t= 随机参数绕开所有缓存） */
async function fetchRemoteBuildTime(): Promise<string | null> {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = (await res.json()) as { buildTime?: string }
    return json.buildTime ?? null
  } catch {
    return null
  }
}

/** 手动注册 SW，URL 带 ?v=BUILD_TIME，每次构建不同，绕开 CDN 的1年强缓存 */
function registerSW() {
  // 开发模式不生成 sw.js（devOptions.enabled: false），跳过注册
  if (import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return
  const swUrl = BUILD_TIME ? `sw.js?v=${encodeURIComponent(BUILD_TIME)}` : 'sw.js'
  navigator.serviceWorker.register(swUrl).catch((err) => {
    console.error('[PWA] SW registration failed:', err)
  })
}

export default function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const checkingRef = useRef(false)
  const registeredRef = useRef(false)

  // ── 注册 SW ───────────────────────────────────────────────────────
  useEffect(() => {
    if (registeredRef.current) return
    registeredRef.current = true
    // 页面 load 完成后再注册，避免阻塞首屏
    if (document.readyState === 'complete') {
      registerSW()
    } else {
      window.addEventListener('load', registerSW, { once: true })
    }
  }, [])

  // ── 版本轮询：绕开 CDN 对 sw.js 的强缓存，主动检测新版本 ──────────
  const checkVersion = async () => {
    if (import.meta.env.DEV) return // 开发模式不检查版本
    if (checkingRef.current || needRefresh) return
    if (!BUILD_TIME) return
    checkingRef.current = true
    try {
      const remote = await fetchRemoteBuildTime()
      if (remote && remote !== BUILD_TIME) {
        setNeedRefresh(true)
      }
    } finally {
      checkingRef.current = false
    }
  }

  useEffect(() => {
    // 页面加载后 3 秒首次检查
    const initTimer = setTimeout(checkVersion, 3000)
    // 每 5 分钟轮询
    const pollTimer = setInterval(checkVersion, 5 * 60 * 1000)
    // 切回 Tab / focus 时检查
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkVersion()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', checkVersion)

    return () => {
      clearTimeout(initTimer)
      clearInterval(pollTimer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', checkVersion)
    }
  }, [needRefresh]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!needRefresh) return null

  return (
    <>
      {/* 蒙层 */}
      <div
        className="fixed inset-0 z-[80]"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={() => setNeedRefresh(false)}
      />

      {/* BottomSheet */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full bg-white rounded-t-3xl z-[81]"
        style={{
          maxWidth: 430,
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        }}>
        {/* 拖拽把手 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* 图标 + 标题 */}
        <div className="flex flex-col items-center px-6 pt-4 pb-2 gap-3">
          <div
            className="flex items-center justify-center rounded-2xl"
            style={{ width: 56, height: 56, background: '#FFF0F0' }}>
            <IconRefresh />
          </div>
          <div className="text-[18px] font-extrabold text-[#4A3035] text-center">
            发现新版本
          </div>
          <div className="text-[13px] text-[#9A8090] text-center leading-relaxed">
            敏宝日记已更新，点击「立即更新」<br />
            即可使用最新版本
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="px-4 pt-3 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full py-3.5 text-white font-bold text-[15px] border-none cursor-pointer rounded-2xl transition-all active:scale-[0.97]"
            style={{ background: '#F87098' }}>
            立即更新
          </button>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="w-full py-3.5 font-semibold text-[14px] text-[#9A8090] border-none cursor-pointer rounded-2xl transition-all active:scale-[0.97]"
            style={{ background: '#F5F0F2' }}>
            稍后再说
          </button>
        </div>
      </div>
    </>
  )
}
