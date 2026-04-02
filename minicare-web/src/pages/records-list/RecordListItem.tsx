/**
 * RecordListItem 记录列表条目组件
 *
 * 记录列表中的单行记录展示，布局与首页 TodayTimeline 对齐：
 * - 左侧时间（HH:MM）
 * - 类型图标
 * - 内容区（使用共享 RecordContent，突出关键数值/状态）
 * - 右侧箭头指示
 *
 * 被引用：RecordGroup.tsx → RecordsPage.tsx
 */
import RecordTypeIcon from '@/components/record/RecordTypeIcon'
import RecordContent, { PULSE_STYLE } from '@/components/record/RecordContent'
import { formatTime, getRecordTime, getRecordType } from '@/lib/utils'
import type { RecordItem } from '@/api'
import { IconChevronRight } from '@/components/ui/icons'

/** RecordListItem 属性 */
interface RecordListItemProps {
  /** 记录数据 */
  record: RecordItem
  /** 是否显示顶部分隔线（非第一条时显示） */
  showDivider: boolean
  /** 点击记录时的回调（用于显示操作菜单） */
  onClick: (record: RecordItem) => void
}

/**
 * 将 RecordItem 扁平字段映射为 RecordContent 需要的 detail 结构
 * RecordItem 中各类型专有字段直接作为 detail 使用（两者结构相同）
 */
function toDetail(record: RecordItem): Record<string, unknown> {
  // RecordItem 本身包含所有专有字段（如 feed_type / formula_ml / status 等）
  // 直接将其作为 detail 传递给 RecordContent
  return record as Record<string, unknown>
}

/**
 * 单条记录展示组件
 *
 * @example
 * <RecordListItem
 *   record={rec}
 *   showDivider={i > 0}
 *   onClick={setSelectedRecord}
 * />
 */
export default function RecordListItem({ record, showDivider, onClick }: RecordListItemProps) {
  const recType = getRecordType(record)
  const time = getRecordTime(record)

  return (
    <>
      {/* 呼吸动效 keyframes（仅注入一次，后续重复注入无副作用） */}
      <style>{PULSE_STYLE}</style>

      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer active:bg-[#FFF9FA] transition-colors relative"
        style={showDivider ? { borderTop: '.5px solid #F5F0F2' } : {}}
        onClick={() => onClick(record)}
      >
        {/* 左侧时间 */}
        <span
          className="text-xs flex-shrink-0 w-10 text-right pt-0.5"
          style={{ color: '#9A8090' }}
        >
          {formatTime(time)}
        </span>

        {/* 记录类型图标 */}
        <div className="flex-shrink-0 mt-0.5">
          <RecordTypeIcon type={recType} containerSize={32} iconSize={16} />
        </div>

        {/* 内容区：使用共享 RecordContent 渲染丰富信息 */}
        <div className="flex-1 min-w-0">
          <RecordContent type={recType} detail={toDetail(record)} />
          {/* 备注（有备注时额外展示） */}
          {record.note && (
            <div
              className="text-xs truncate mt-1"
              style={{ color: '#B0A0A4' }}
            >
              {record.note as string}
            </div>
          )}
        </div>

        {/* 右侧箭头 */}
        <IconChevronRight size={14} color="#C0A8AD" style={{ flexShrink: 0, marginTop: 2 }} />
      </div>
    </>
  )
}
