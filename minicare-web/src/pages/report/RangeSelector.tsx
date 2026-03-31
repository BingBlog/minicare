/**
 * RangeSelector 时间范围选择组件
 *
 * 分段控制器样式（Segmented Control），选项：7天 / 14天 / 30天 / 自定义。
 * 激活项白色背景 + 阴影，未激活项透明背景。
 *
 * 被引用：ReportPage.tsx
 */
import { REPORT_RANGE_OPTIONS } from '@/lib/constants'

/** RangeSelector 属性 */
interface RangeSelectorProps {
  /** 当前激活的 key（"7" | "14" | "30" | "custom"） */
  activeKey: string
  /** 切换回调 */
  onChange: (key: string) => void
}

/**
 * 报告时间范围分段控制器
 *
 * @example
 * <RangeSelector activeKey={activeRange} onChange={setActiveRange} />
 */
export default function RangeSelector({ activeKey, onChange }: RangeSelectorProps) {
  return (
    <div
      className="mx-4 flex rounded-xl overflow-hidden p-1"
      style={{ background: '#F0EAEC' }}
    >
      {REPORT_RANGE_OPTIONS.map(({ key, label }) => (
        <div
          key={key}
          onClick={() => onChange(key)}
          className="flex-1 text-center py-2.5 rounded-[10px] cursor-pointer text-[13px] font-semibold transition-all"
          style={
            activeKey === key
              ? { background: '#fff', color: '#4A3035', boxShadow: '0 1px 6px rgba(0,0,0,0.09)' }
              : { color: '#9A8090' }
          }
        >
          {label}
        </div>
      ))}
    </div>
  )
}
