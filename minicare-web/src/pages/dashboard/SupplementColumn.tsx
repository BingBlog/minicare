/**
 * 补剂/营养素列
 * 行布局：time | label | tags | (无 summary)
 * 对齐 Records 页面：label="营养素"，tags=每项独立 Pill（名称+剂量+单位）
 */
import { useMemo } from 'react'
import type { DashboardData } from './useDashboardData'
import type { TodayRecord } from '@/api'

interface SuppItem {
  key?: string
  label?: string
  dose?: string
  unit?: string
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  data: DashboardData
  onAdd?: () => void
}

function renderSupplementRow(r: TodayRecord) {
  const detail = r.detail ?? {}
  const items = (detail.supplement_items as SuppItem[] | undefined) ?? []
  const time = formatHM(r.time)

  // Records 页面：每个 supplement_item 生成独立 Pill（"维D 400IU"）
  return (
    <div key={r.id} className="db-row">
      <span className="db-row-time">{time}</span>
      <span className="db-row-label">营养素</span>
      <span className="db-row-tags">
        {items.map((it, i) => {
          const name = it.label ?? it.key ?? ''
          const dose = it.dose ? ` ${it.dose}${it.unit ?? ''}` : ''
          return <span key={i} className="db-pill db-pill-amber">{name}{dose}</span>
        })}
      </span>
    </div>
  )
}

export default function SupplementColumn({ data, onAdd }: Props) {
  const records = data.supplement

  // 小结：列出所有营养素名称
  const summary = useMemo(() => {
    if (records.length === 0) return ''
    const names: string[] = []
    for (const r of records) {
      const items = (r.detail?.supplement_items as SuppItem[] | undefined) ?? []
      for (const it of items) {
        const name = it.label ?? it.key ?? ''
        if (name && !names.includes(name)) names.push(name)
      }
    }
    return names.length > 0 ? names.join('、') : `${records.length}项`
  }, [records])

  return (
    <>
      <div className="db-col-header">
        <div className="db-col-title">
          <svg className="db-col-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="6" rx="3" /><line x1="12" y1="11" x2="12" y2="17" /></svg>
          补剂
          {onAdd && <button type="button" className="db-col-add-btn" onClick={onAdd}>+</button>}
        </div>
      </div>
      <div className="db-col-records">
        {records.length === 0 ? (
          <div className="db-empty">暂无记录</div>
        ) : (
          records.map((r) => renderSupplementRow(r))
        )}
      </div>
    </>
  )
}
