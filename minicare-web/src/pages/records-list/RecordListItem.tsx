/**
 * RecordListItem 记录列表条目组件
 *
 * 记录列表中的单行记录展示，包含：
 * - 左侧图标（带背景色）
 * - 中间内容区（类型名 + 备注）
 * - 右侧时间
 *
 * 被引用：RecordGroup.tsx → RecordsPage.tsx
 */
import RecordTypeIcon from '@/components/record/RecordTypeIcon'
import { RECORD_TYPE_CFG } from '@/lib/constants'
import { formatTime, getRecordTime, getRecordType, getRecordSummary } from '@/lib/utils'
import type { RecordItem } from '@/api'

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
  const cfg = RECORD_TYPE_CFG[recType] ?? { label: recType, bg: '#F5F5F5', color: '#9A8090' }
  const time = getRecordTime(record)
  // 优先从结构化字段生成摘要；如结构化摘要为空，则回退到 note
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = getRecordSummary(record as Record<string, any>) || (record.note as string | null | undefined) || ''

  return (
    <div
      className="flex items-start gap-3 px-4 py-3.5 cursor-pointer active:bg-[#FFF8FA] transition-colors relative"
      style={showDivider ? { borderTop: '.5px solid #F5F0F2' } : {}}
      onClick={() => onClick(record)}
    >
      {/* 记录类型图标 */}
      <RecordTypeIcon type={recType} containerSize={36} iconSize={20} />

      {/* 内容区 */}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold leading-snug" style={{ color: '#7A5A60' }}>
          {cfg.label}
        </div>
        {summary && (
          <div className="text-[12px] text-[#9A8090] mt-0.5 truncate">{summary}</div>
        )}
      </div>

      {/* 右侧时间 */}
      <div className="text-[12px] text-[#9A8090] flex-shrink-0 pt-0.5">
        {formatTime(time)}
      </div>
    </div>
  )
}