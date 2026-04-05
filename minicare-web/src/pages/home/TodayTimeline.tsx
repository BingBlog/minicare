/**
 * TodayTimeline 今日时间线组件
 *
 * 首页：与记录页一致的单行条目（RecordListItem），支持按类型 / 按时间排序。
 */
import { useMemo, useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import RecordTypeIcon from '@/components/record/RecordTypeIcon'
import RecordsSortModeBar from '@/components/record/RecordsSortModeBar'
import RecordListItem from '@/pages/records-list/RecordListItem'
import { RecordTypeSectionHeader } from '@/pages/records-list/RecordGroup'
import { todayRecordToRecordItem } from '@/lib/record-adapters'
import { sortDayItems, type RecordsSortMode } from '@/lib/records-sort'
import { getRecordType } from '@/lib/utils'
import type { TodayRecord } from '@/api/types'
import type { RecordItem } from '@/api'

interface TodayTimelineProps {
  records: TodayRecord[]
  onRecordClick?: (record: RecordItem) => void
}

export default function TodayTimeline({ records, onRecordClick }: TodayTimelineProps) {
  const navigate = useNavigate()
  const [sortMode, setSortMode] = useState<RecordsSortMode>('type')

  const sortedItems = useMemo(() => {
    const items = records.map(todayRecordToRecordItem)
    return sortDayItems(items, sortMode)
  }, [records, sortMode])

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: '0 2px 12px rgba(200,100,120,0.08), 0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5">
        <span className="text-[11px] font-semibold text-[#9A8090] tracking-[0.8px] uppercase">
          今日时间线
        </span>
        <span
          className="text-xs text-primary font-medium cursor-pointer"
          onClick={() => navigate('/records')}
        >
          全部 ›
        </span>
      </div>

      <RecordsSortModeBar mode={sortMode} onChange={setSortMode} embedded />

      {records.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="mb-2 flex justify-center">
            <RecordTypeIcon type="feeding" containerSize={40} iconSize={20} />
          </div>
          <div className="text-sm text-subtext">今日尚无记录</div>
          <div className="text-xs text-subtext/70 mt-1">点击上方快捷按钮开始记录</div>
        </div>
      ) : (
        sortedItems.map((rec, i) => {
          const t = getRecordType(rec)
          const prevT = i > 0 ? getRecordType(sortedItems[i - 1]) : null
          const groupByType = sortMode === 'type'
          const showSection = groupByType && (i === 0 || t !== prevT)
          const showDivider = i > 0 && (!groupByType || (prevT != null && prevT === t))

          return (
            <Fragment key={rec.id}>
              {showSection && (
                <RecordTypeSectionHeader typeKey={t} withTopBorder={groupByType && i > 0} />
              )}
              <RecordListItem
                record={rec}
                showDivider={showDivider}
                onClick={(r) => (onRecordClick ? onRecordClick(r) : navigate('/records'))}
              />
            </Fragment>
          )
        })
      )}
    </div>
  )
}
