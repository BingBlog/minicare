/**
 * LoadingSpinner 加载旋转动画组件
 *
 * 统一全局 loading 样式，避免各页面重复实现 spin 动画。
 * 提供两种使用场景：
 * 1. 页面全屏加载（FullPageSpinner）
 * 2. 内联/局部区域加载（InlineSpinner）
 */
import type { CSSProperties } from 'react'

/** 加载旋转动画属性 */
interface SpinnerProps {
  /** 圆圈尺寸（px），默认 32 */
  size?: number
  /** 圆圈颜色，默认品牌粉色 #F87098 */
  color?: string
  /** 额外样式 */
  style?: CSSProperties
}

/**
 * 旋转加载圆圈（内联）
 * 通常配合 flex 容器居中使用
 */
export function InlineSpinner({ size = 32, color = '#F87098', style }: SpinnerProps) {
  return (
    <>
      {/* spin keyframe 注入到当前组件作用域 */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          /* 4px 边框：颜色部分（颜色填充）和透明部分形成旋转视觉 */
          border: `${Math.max(2, size / 8)}px solid rgba(0,0,0,0.08)`,
          borderTopColor: color,
          animation: 'spin 0.8s linear infinite',
          ...style,
        }}
      />
    </>
  )
}

/**
 * 全屏加载占位
 * 通常在页面顶层 loading 状态时使用
 */
export function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center h-screen bg-bg">
      <InlineSpinner />
    </div>
  )
}
