/**
 * 活动列（早教/锻炼）
 *
 * 展示当日活动记录：大运动、精细运动、亲子早教、户外活动等
 * 行布局：time | label | summary(时长)
 */
import type { DashboardData } from './useDashboardData'
import type { TodayRecord } from '@/api'

// 对齐后端 activityType 枚举
const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  gross_motor: '大运动',
  fine_motor: '精细运动',
  edu_play: '亲子早教',
  outdoor: '户外',
  daily_care: '日常护理',
  other: '其他',
}

function fmtDuration(min?: number | null): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  data: DashboardData
  onAdd: () => void
}

function renderRow(r: TodayRecord) {
  const detail = r.detail ?? {}
  const actType = (detail.activity_type as string) ?? 'other'
  const durationMin = detail.duration_min as number | undefined
  const time = formatHM(r.time)
  const label = ACTIVITY_TYPE_LABEL[actType] ?? actType

  return (
    <div key={r.id} className="db-row">
      <span className="db-row-time">{time}</span>
      <span className="db-row-label">{label}</span>
      <span className="db-row-tags" />
      {durationMin ? (
        <span className="db-row-summary db-summary-gold">
          <span className="db-row-summary-value">{fmtDuration(durationMin)}</span>
        </span>
      ) : null}
    </div>
  )
}

export default function ActivityColumn({ data, onAdd }: Props) {
  const activities = data.activity

  return (
    <>
      <div className="db-col-header">
        <div className="db-col-title">
          <svg className="db-col-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
          活动
          <button type="button" className="db-col-add-btn" onClick={onAdd}>+</button>
        </div>
      </div>
      <div className="db-col-records">
        {activities.length === 0 ? (
          <div className="db-empty">暂无活动</div>
        ) : (
          activities.map((r) => renderRow(r))
        )}
      </div>
    </>
  )
}
