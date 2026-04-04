/**
 * BottomSheet 底部抽屉组件
 *
 * 这是一个通用的底部弹层容器，多个页面（ProfilePage、RecordsPage、HomePage）
 * 都有类似的底部弹层交互，统一封装以减少代码重复。
 *
 * 特性：
 * - 点击蒙层关闭
 * - 顶部自动显示拖拽把手
 * - 最大宽度 430px（对齐移动端设计稿）
 * - 支持最大高度控制，超出时内容可滚动
 * - safe-area-inset-bottom 适配异形屏底部安全区
 */
import type { ReactNode } from 'react'

/** BottomSheet 属性 */
export interface BottomSheetProps {
  /** 是否展开 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 弹层内容 */
  children: ReactNode
  /** 最大高度（vh 单位），默认 92 */
  maxHeightVh?: number
  /** z-index，默认 60（高于底部导航栏 z-50） */
  zIndex?: number
  /** 是否允许内容区域滚动，默认 true */
  scrollable?: boolean
}

/**
 * BottomSheet 底部抽屉
 *
 * @example
 * <BottomSheet open={open} onClose={() => setOpen(false)}>
 *   <p>内容</p>
 * </BottomSheet>
 */
export default function BottomSheet({
  open,
  onClose,
  children,
  maxHeightVh = 92,
  zIndex = 60,
  scrollable = true,
}: BottomSheetProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 flex items-end"
      style={{ background: 'rgba(0,0,0,0.45)', zIndex }}
      // 点击蒙层（背景）时关闭
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full bg-white rounded-t-3xl"
        style={{
          maxWidth: 430,
          margin: '0 auto',
          maxHeight: `${maxHeightVh}vh`,
          /* safe-area-inset-bottom：适配 iPhone 底部横条区域 */
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
          overflowY: scrollable ? 'auto' : 'hidden',
        }}
      >
        {/* 拖拽把手（视觉提示用户可以拖动关闭） */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {children}
      </div>
    </div>
  )
}
