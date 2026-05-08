import { useState, useCallback, useMemo } from 'react'
import { feedingApi } from '@/api'
import type { DashboardData } from './useDashboardData'
import type { RecentSupplement } from './useRecentSupplements'
import SupplementConfirmSheet from './SupplementConfirmSheet'

interface SuppItemDetail {
  key?: string
  label?: string
  dose?: string
  unit?: string
}

interface Props {
  data: DashboardData
  familyId: string | null
  babyId: string | null
  recentList: RecentSupplement[]
  recentLoading: boolean
  onAdd?: () => void
  onRecorded?: () => void
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function SupplementQuickEntry({
  data, familyId, babyId, recentList, recentLoading, onAdd, onRecorded
}: Props) {
  const [sheetVisible, setSheetVisible] = useState(false)
  const [selectedItem, setSelectedItem] = useState<RecentSupplement | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const records = data.supplement

  const todayRecordedMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of records) {
      const items = (r.detail?.supplement_items as SuppItemDetail[] | undefined) ?? []
      for (const it of items) {
        const key = it.key || `custom_${it.label}`
        if (key && !map.has(key)) {
          map.set(key, r.time)
        }
      }
    }
    return map
  }, [records])

  const handleItemClick = useCallback((item: RecentSupplement) => {
    setSelectedItem(item)
    setSheetVisible(true)
  }, [])

  const handleConfirm = useCallback(async (item: RecentSupplement, dose: string, recordTime: string) => {
    if (!familyId || !babyId) return
    setSubmitting(true)
    try {
      await feedingApi.create(familyId, {
        baby_id: babyId,
        feed_type: 'complementary',
        record_time: recordTime,
        complementary_food: '营养素',
        supplement_items: [{
          key: item.key,
          label: item.label,
          dose: dose || '',
          unit: item.unit || '',
        }],
      })
      setSheetVisible(false)
      setSelectedItem(null)
      onRecorded?.()
    } catch (err) {
      console.error('[SupplementQuickEntry] create error:', err)
    } finally {
      setSubmitting(false)
    }
  }, [familyId, babyId, onRecorded])

  const handleCancel = useCallback(() => {
    if (!submitting) {
      setSheetVisible(false)
      setSelectedItem(null)
    }
  }, [submitting])

  return (
    <>
      <div className="db-col-header">
        <div className="db-col-title">
          <svg className="db-col-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="6" rx="3" /><line x1="12" y1="11" x2="12" y2="17" /></svg>
          补剂
          {onAdd && <button type="button" className="db-col-add-btn" onClick={onAdd}>+记录</button>}
        </div>
      </div>
      <div className="db-col-records">
        {recentList.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-2">
            {recentList.map((item) => {
              const recordedTime = todayRecordedMap.get(item.key)
              const isDone = !!recordedTime
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
                    isDone
                      ? 'bg-green-900/30 text-green-400'
                      : 'bg-amber-900/30 text-amber-300 hover:bg-amber-900/50'
                  }`}
                  onClick={() => handleItemClick(item)}
                >
                  {isDone && <span className="text-[10px]">✓</span>}
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        )}

        {recentLoading && recentList.length === 0 && (
          <div className="db-empty">加载中...</div>
        )}

        {!recentLoading && recentList.length === 0 && records.length === 0 && (
          <div className="db-empty">
            <span className="block text-xs text-gray-500">暂无常用补剂</span>
            <span className="mt-1 block text-[10px] text-gray-600">点击"+记录"添加第一条补剂记录后，这里将展示快捷选项</span>
          </div>
        )}

        {records.length > 0 && (
          <div className="mt-1">
            <span className="mb-1 block text-[10px] text-gray-500">今日记录</span>
            {records.map((r) => {
              const items = (r.detail?.supplement_items as SuppItemDetail[] | undefined) ?? []
              const names = items.map(it => it.label ?? it.key ?? '').filter(Boolean).join('、')
              return (
                <div key={r.id} className="db-row">
                  <span className="db-row-time">{formatHM(r.time)}</span>
                  <span className="db-row-label">营养素</span>
                  <span className="db-row-tags">
                    {items.map((it, i) => {
                      const name = it.label ?? it.key ?? ''
                      const doseStr = it.dose ? ` ${it.dose}${it.unit ?? ''}` : ''
                      return <span key={i} className="db-pill db-pill-amber">{name}{doseStr}</span>
                    })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <SupplementConfirmSheet
        visible={sheetVisible}
        item={selectedItem}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        submitting={submitting}
      />
    </>
  )
}
