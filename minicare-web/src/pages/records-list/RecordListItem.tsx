/**
 * RecordListItem 记录列表条目组件
 *
 * 统一布局（primary 始终为 null，所有类型均为 Tags-inline 模式）：
 *   行 1：图标 · [弱标题前缀 + Tags Pill]  ···  summary  时间  >
 *   行 2：note 备注（有时）
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

  // primary 为 null 时，tags 顶到行1同行展示
  const tagsInline = primary == null
  // 是否需要第二行（只有 primary 存在时才可能有独立的 tags 行）
  const hasTagsRow = !tagsInline && !!(tags || meta)
  const hasNoteRow = !!note

  return (
    <>
      <style>{PULSE_STYLE}</style>

      <div
        className="flex flex-col px-4 cursor-pointer active:bg-[#FFF9FA] transition-colors relative"
        style={{
          paddingTop: 12,
          paddingBottom: (hasTagsRow || hasNoteRow) ? 10 : 12,
          ...(showDivider ? { borderTop: '.5px solid #F5F0F2' } : {}),
        }}
        onClick={() => onClick(record)}
      >
        {/* 行 1：图标始终居中对齐本行 */}
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <RecordTypeIcon type={recType} containerSize={36} iconSize={17} borderRadius={11} />
          </div>

          {/* 内容区：primary 模式 or tags-inline 模式 */}
          <div className="flex-1 min-w-0">
            {tagsInline
              ? /* Tags 直接顶行（含可能的弱标题前缀） */
                <div className="flex flex-wrap items-center gap-1 min-w-0">
                  {tags}
                  {meta}
                </div>
              : /* 强标题 */
                primary
            }
          </div>

          {/* summary 数值 */}
          {summary != null && (
            <div className="flex max-w-[min(140px,45vw)] shrink-0 items-center justify-end [&>*]:max-w-full [&_*]:truncate">
              {summary}
            </div>
          )}

          {/* 时间 */}
          <span
            className="shrink-0 text-[11px] font-medium tabular-nums leading-none whitespace-nowrap"
            style={{ color: '#9A7E82' }}
          >
            {formatTime(time)}
          </span>

          <IconChevronRight size={13} color="#D4B8BE" className="shrink-0" />
        </div>

        {/* 行 2：tags 独立行（仅 primary 存在时）+ note */}
        {(hasTagsRow || hasNoteRow) && (
          <div className="flex flex-col gap-1 mt-1.5 pl-[48px]">
            {hasTagsRow && (
              <div className="flex flex-wrap items-center gap-1">
                {tags}
                {meta}
              </div>
            )}
            {hasNoteRow && (
              <div
                className="text-[11px] leading-snug line-clamp-2"
                style={{ color: '#B0A0A4' }}
              >
                {note}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
