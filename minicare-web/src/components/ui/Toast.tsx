/**
 * Toast 轻提示组件
 *
 * 用法：
 *   const { showToast, ToastNode } = useToast()
 *   <div> ... {ToastNode} </div>
 *   showToast('操作成功')
 *
 * 特性：
 * - 固定在底部导航栏上方（bottom: 96px = 24 * 4 Tailwind spacing）
 * - 2200ms 后自动消失
 * - z-index = 60（高于普通弹层 z-50）
 */
import { useState, useCallback } from 'react'

/** Toast 钩子返回值 */
interface UseToastReturn {
  /** 显示提示文字 */
  showToast: (msg: string) => void
  /** 在 JSX 中渲染的节点 */
  ToastNode: React.ReactNode
}

/**
 * useToast 钩子
 * 推荐在页面级组件中调用，每页维护独立的 toast 状态
 */
export function useToast(): UseToastReturn {
  const [toast, setToast] = useState('')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    // 2200ms 后自动隐藏
    setTimeout(() => setToast(''), 2200)
  }, [])

  const ToastNode = toast ? (
    <div
      className="fixed left-1/2 -translate-x-1/2 bg-[#4A3035] text-white text-sm px-5 py-2.5 rounded-full z-[60] whitespace-nowrap shadow-lg"
      style={{ bottom: 96 }}
    >
      {toast}
    </div>
  ) : null

  return { showToast, ToastNode }
}
