/**
 * RecordListItem 记录列表条目组件
 *
 * 列表布局（固定列宽，纵向严格对齐）：
 *
 *  ┌──────┬──────────┬───────────────────┬──────────┬────────┬────┐
 *  │ icon │  label   │  tags（Pill）      │ summary  │  time  │ >  │
 *  │ 36px │ w-[44px] │  flex-1 min-w-0   │ w-[80px] │w-[38px]│13px│
 *  └──────┴──────────┴───────────────────┴──────────┴────────┴────┘
 *
 * - label 列：固定宽，显示记录类型文字（配方奶 / 母乳 / 睡眠 / 换尿布…）
 * - tags 列：flex-1，Pill flex-wrap；换行时所有行左边缘严格对齐 label 列右侧
 * - summary / time / > 三列均 shrink-0 固定宽，纵向对齐；summary 左对齐
 * - 行 2（有 note 时）：pl-[48px] 缩进对齐内容区左边
 *
 * 被引用：RecordGroup.tsx → RecordsPage.tsx
 */
import RecordTypeIcon from '@/components/record/RecordTypeIcon'
import { getRecordSummary, getRecordListCompactParts, PULSE_STYLE } from '@/components/record/RecordContent'
import { formatTime, getRecordTime, getRecordType } from '@/lib/utils'
import type { RecordItem } from '@/api'
import { IconChevronRight } from '@/components/ui/icons'

interface RecordListItemProps {
  record: RecordItem
  showDivider: boolean
  onClick: (record: RecordItem) => void
}

function toDetail(record: RecordItem): Record<string, unknown> {
  return record as Record<string, unknown>
}

/**
 * 从记录中推导出精确的图标 type key：
 * - feeding 记录根据 feed_type / complementary_food 细分为 formula / breast / food / supplement
 * - 其余类型直接使用 record.type
 */
function getIconType(record: RecordItem): string {
  const base = getRecordType(record)
  if (base !== 'feeding') return base
  const detail = toDetail(record)
  const feedType = detail.feed_type as string | undefined
  if (feedType === 'formula') return 'formula'
  if (feedType === 'breast') return 'breast'
  if (feedType === 'complementary') {
    const food = detail.complementary_food as string | undefined
    return food === '营养素' ? 'supplement' : 'food'
  }
  return base
}

export default function RecordListItem({ record, showDivider, onClick }: RecordListItemProps) {
  const recType = getRecordType(record)
  const iconType = getIconType(record)
  const time = getRecordTime(record)
  const detail = toDetail(record)
  const summary = getRecordSummary(recType, detail)
  const { label, tags, meta } = getRecordListCompactParts(recType, detail)
  const note = record.note as string | undefined

  const hasNoteRow = !!note

  return (
    <>
      <style>{PULSE_STYLE}</style>

      <div
        className="flex flex-col px-4 cursor-pointer active:bg-[#FFF9FA] transition-colors relative"
        style={{
          paddingTop: 12,
          paddingBottom: hasNoteRow ? 10 : 12,
          ...(showDivider ? { borderTop: '.5px solid #F5F0F2' } : {}),
        }}
        onClick={() => onClick(record)}
      >
        {/* ── 主行：六列固定布局，纵向对齐 ── */}
        <div className="flex items-center gap-3">

          {/* 列 1：类型图标，固定 36px；feeding 子类型用精确 iconType */}
          <div className="shrink-0">
            <RecordTypeIcon type={iconType} containerSize={36} iconSize={17} borderRadius={11} />
          </div>

          {/* 列 2：标题文字，固定 w-[44px]，右侧留一点视觉间距 */}
          <div className="shrink-0 w-[44px]">
            {label && (
              <span
                className="text-[13px] font-medium leading-snug whitespace-nowrap"
                style={{ color: '#B0A0A4' }}
              >
                {label}
              </span>
            )}
          </div>

          {/* 列 3：Tags，flex-1，换行时每行都从同一垂直线开始 */}
          <div className="flex-1 min-w-0">
            {(tags || meta)
              ? <div className="flex flex-wrap gap-1">{tags}{meta}</div>
              : null
            }
          </div>

          {/* 列 4：summary 数值，固定 w-[80px] 左对齐 */}
          <div className="shrink-0 w-[80px] flex justify-start items-center">
            {summary != null && (
              <div className="flex items-center max-w-full [&>*]:max-w-full [&_*]:truncate">
                {summary}
              </div>
            )}
          </div>

          {/* 列 5：时间，固定 w-[38px] 右对齐 */}
          <span
            className="shrink-0 w-[38px] text-right text-[11px] font-medium tabular-nums leading-none whitespace-nowrap"
            style={{ color: '#9A7E82' }}
          >
            {formatTime(time)}
          </span>

          {/* 列 6：箭头 */}
          <IconChevronRight size={13} color="#D4B8BE" className="shrink-0" />
        </div>

        {/* ── 行 2：note 备注（有时），缩进对齐内容区 ── */}
        {hasNoteRow && (
          <div className="mt-1.5 pl-[48px]">
            <div
              className="text-[11px] leading-snug line-clamp-2"
              style={{ color: '#B0A0A4' }}
            >
              {note}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
