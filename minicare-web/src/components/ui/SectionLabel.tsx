/**
 * SectionLabel 分组标签
 *
 * 各设置组、弹层分组的通用小标题样式。
 * 统一字体大小（12px）、颜色（#9A8090）、间距。
 *
 * @example
 * <SectionLabel>基本信息</SectionLabel>
 * <SectionLabel paddingTop={14}>家庭</SectionLabel>
 */

interface SectionLabelProps {
  children: React.ReactNode
  /** 顶部额外 padding（px），默认 14 */
  paddingTop?: number
}

export default function SectionLabel({ children, paddingTop = 14 }: SectionLabelProps) {
  return (
    <div
      className="px-5 pb-1 text-[12px] font-semibold text-[#9A8090] tracking-[.5px]"
      style={{ paddingTop }}
    >
      {children}
    </div>
  )
}

/**
 * FormSectionLabel 表单专用分组标签（较小间距）
 * 用于弹层内表单的各分组标题
 */
export function FormSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.3px]">
      {children}
    </div>
  )
}

/**
 * FormSection 表单白色卡片容器
 * 统一表单行的白色圆角卡片样式
 */
export function FormSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`mx-4 bg-white rounded-2xl overflow-hidden mb-3 ${className}`}
      style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}
    >
      {children}
    </div>
  )
}
