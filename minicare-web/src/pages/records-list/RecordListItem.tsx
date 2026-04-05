/**
 * RecordListItem 记录列表条目组件
 *
 * 布局：第一行垂直居中 — 图标、标题+标签+补充信息、核心数据、时间（最右邻箭头）；
 * 第二行仅展示用户备注 note（有则显示）。
 *
 * 被引用：RecordGroup.tsx → RecordsPage.tsx
 */
import RecordTypeIcon from '@/components/record/RecordTypeIcon'
import { getRecordSummary, getRecordListCompactParts, PULSE_STYLE } from '@/components/record/RecordContent'
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

function toDetail(record: RecordItem): Record<string, unknown> {
  return record as Record<string, unknown>
}

export default function RecordListItem({ record, showDivider, onClick }: RecordListItemProps) {
  const recType = getRecordType(record)
  const time = getRecordTime(record)
  const detail = toDetail(record)
  const summary = getRecordSummary(recType, detail)
  const { primary, tags, meta } = getRecordListCompactParts(recType, detail)
  const note = record.note as string | undefined

  return (
    <>
      <style>{PULSE_STYLE}</style>

      <div
        className="flex flex-col gap-1 px-4 py-3 cursor-pointer active:bg-[#FFF9FA] transition-colors relative"
        style={showDivider ? { borderTop: '.5px solid #F5F0F2' } : {}}
        onClick={() => onClick(record)}
      >
        {/* 第一行：结构化信息 + 核心数据；时间在最右 */}
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <RecordTypeIcon type={recType} containerSize={36} iconSize={17} borderRadius={11} />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-1.5 flex-wrap">
            {primary}
            {tags}
            {meta}
          </div>

          {summary != null && (
            <div className="flex max-w-[min(140px,45vw)] shrink-0 items-center justify-end [&>*]:max-w-full [&_*]:truncate">
              {summary}
            </div>
          )}

          <span
            className="shrink-0 text-[11px] font-medium tabular-nums leading-none whitespace-nowrap"
            style={{ color: '#9A7E82' }}
          >
            {formatTime(time)}
          </span>

          <IconChevronRight size={13} color="#D4B8BE" className="shrink-0" />
        </div>

        {/* 第二行：仅备注 */}
        {note ? (
          <div
            className="text-[11px] leading-snug line-clamp-2 pl-12"
            style={{ color: '#B0A0A4' }}
          >
            {note}
          </div>
        ) : null}
      </div>
    </>
  )
}
