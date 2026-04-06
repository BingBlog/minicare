/**
 * PWA 更新提示组件
 *
 * 当 Service Worker 检测到新版本（进入 waiting 状态）时，
 * 展示底部 BottomSheet，引导用户点击「立即更新」。
 *
 * 实现原理：
 * - vite-plugin-pwa `registerType: 'prompt'` 模式下，新 SW 进入 waiting 时触发
 *   useRegisterSW 的 needRefresh 状态为 true
 * - 用户确认后调用 updateServiceWorker(true)，内部执行 skipWaiting + location.reload()
 */

import { useRegisterSW } from 'virtual:pwa-register/react'

/** 刷新/更新图标 */
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

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // 可选：注册成功后打印日志
      if (import.meta.env.DEV) {
        console.log('[PWA] SW registered:', r)
      }
    },
    onRegisterError(error) {
      if (import.meta.env.DEV) {
        console.error('[PWA] SW registration error:', error)
      }
    },
  })

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
            onClick={() => updateServiceWorker(true)}
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
