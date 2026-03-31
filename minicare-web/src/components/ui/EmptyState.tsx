/**
 * EmptyState 空状态组件
 *
 * 在列表为空、无数据时展示，提供友好的空状态视觉反馈。
 * 支持自定义 emoji、标题、副标题。
 */

/** EmptyState 属性 */
interface EmptyStateProps {
  /** 大尺寸 emoji，默认 📋 */
  emoji?: string
  /** 主标题文字 */
  title: string
  /** 副标题文字（可选） */
  subtitle?: string
  /** 顶部外边距（Tailwind 类），默认 py-12 */
  className?: string
}

/**
 * 通用空状态占位
 *
 * @example
 * <EmptyState
 *   emoji="📋"
 *   title="暂无记录"
 *   subtitle="点击底部 + 按钮开始记录宝宝的每一天"
 * />
 */
export default function EmptyState({
  emoji = '📋',
  title,
  subtitle,
  className = 'py-12',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center px-6 text-center gap-2 ${className}`}>
      <div className="text-[44px]">{emoji}</div>
      <div className="text-[16px] font-semibold text-[#4A3035]">{title}</div>
      {subtitle && (
        <div className="text-[13px] text-[#9A8090] leading-relaxed">{subtitle}</div>
      )}
    </div>
  )
}
