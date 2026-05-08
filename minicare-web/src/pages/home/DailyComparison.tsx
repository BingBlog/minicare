import { useMemo } from 'react'
import RecordTypeIcon from '@/components/record/RecordTypeIcon'
import type { TodayRecord } from '@/api/types'

interface SupplementItem {
  key: string
  label: string
  dose?: string
  unit?: string
}

interface DailyComparisonProps {
  todayRecords: TodayRecord[]
  yesterdayRecords: TodayRecord[]
}

function extractSupplements(records: TodayRecord[]): SupplementItem[] {
  const items: SupplementItem[] = []
  const seen = new Set<string>()
  for (const r of records) {
    if (r.type !== 'feeding') continue
    const d = r.detail ?? {}
    const feedType = d.feed_type as string | undefined
    if (feedType !== 'supplement' && feedType !== 'complementary') continue
    if (feedType === 'complementary' && d.complementary_food !== '营养素') continue
    const suppItems = (d.supplement_items as SupplementItem[] | undefined) ?? []
    for (const item of suppItems) {
      if (!seen.has(item.key)) {
        seen.add(item.key)
        items.push(item)
      }
    }
  }
  return items
}

export default function DailyComparison({ todayRecords, yesterdayRecords }: DailyComparisonProps) {
  const todaySupplements = useMemo(() => extractSupplements(todayRecords), [todayRecords])
  const yesterdaySupplements = useMemo(() => extractSupplements(yesterdayRecords), [yesterdayRecords])

  if (todaySupplements.length === 0 && yesterdaySupplements.length === 0) {
    return null
  }

  return (
    <div className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center" style={{ width: 28, height: 28, background: '#FFF8E0', borderRadius: 8 }}>
          <RecordTypeIcon type="supplement" containerSize={28} iconSize={16} borderRadius={8} />
        </div>
        <span className="text-sm font-medium text-gray-800">补剂&营养素</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-400 w-8 shrink-0 pt-0.5">今日</span>
          <div className="flex flex-wrap gap-1.5">
            {todaySupplements.length > 0 ? todaySupplements.map((s) => (
              <span
                key={s.key}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                style={{ background: '#FFF8E0', color: '#D4900A' }}
              >
                {s.label}{s.dose ? ` ${s.dose}${s.unit ?? ''}` : ''}
              </span>
            )) : (
              <span className="text-xs text-gray-300">暂无记录</span>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-400 w-8 shrink-0 pt-0.5">昨日</span>
          <div className="flex flex-wrap gap-1.5">
            {yesterdaySupplements.length > 0 ? yesterdaySupplements.map((s) => (
              <span
                key={s.key}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                style={{ background: '#F5F5F5', color: '#9A8090' }}
              >
                {s.label}{s.dose ? ` ${s.dose}${s.unit ?? ''}` : ''}
              </span>
            )) : (
              <span className="text-xs text-gray-300">暂无记录</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
