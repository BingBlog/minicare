/**
 * 睡眠记录列
 * 行布局：time | label | tags | summary
 * 对齐 Records 页面：label=时段名（进行中加"中"后缀），tags=质量+进行中，summary=时长
 */
import { useState } from 'react'
import type { DashboardData } from './useDashboardData'
import type { TodayRecord } from '@/api'

// 与后端 sleepPeriod 枚举对齐
const SLEEP_PERIOD_LABEL: Record<string, string> = {
  night: '夜觉',
  morning_nap: '上午觉',
  afternoon_nap: '下午觉',
  other: '小憩',
}

function fmtDuration(min?: number | null): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  data: DashboardData
  onAdd?: () => void
  onEndSleep?: (sleepId: string) => Promise<void>
}

function SleepRow({ r, onEndSleep }: { r: TodayRecord; onEndSleep?: (id: string) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [ending, setEnding] = useState(false)

  const detail = r.detail ?? {}
  const sleepPeriod = (detail.sleep_period as string) ?? 'other'
  const quality = detail.quality as string | undefined
  const durationMin = detail.duration_min as number | undefined
  const status = detail.status as string | undefined
  const time = formatHM(r.time)
  const isOngoing = status === 'ongoing'

  const periodLabel = SLEEP_PERIOD_LABEL[sleepPeriod] ?? sleepPeriod
  const label = periodLabel
    ? (isOngoing ? `${periodLabel}中` : periodLabel)
    : (isOngoing ? '睡眠中' : '睡眠')

  const QUALITY_PILL: Record<string, { text: string; cls: string }> = {
    good: { text: '质量好', cls: 'db-pill-green' },
    normal: { text: '一般', cls: 'db-pill-amber' },
    poor: { text: '较差', cls: 'db-pill-red' },
  }
  const qualityCfg = quality ? QUALITY_PILL[quality] : null

  const handleEndClick = async () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    // 第二次点击：执行结束
    if (ending || !onEndSleep) return
    setEnding(true)
    try {
      await onEndSleep(r.id)
    } catch {
      setEnding(false)
      setConfirming(false)
    }
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirming(false)
  }

  return (
    <div key={r.id} className={`db-row ${isOngoing ? 'db-row-ongoing' : ''}`}>
      <span className="db-row-time">{time}</span>
      <span className="db-row-label">{label}</span>
      <span className="db-row-tags">
        {isOngoing && !confirming && <span className="db-pill db-pill-pink">进行中</span>}
        {qualityCfg && <span className={`db-pill ${qualityCfg.cls}`}>{qualityCfg.text}</span>}
      </span>
      {isOngoing && onEndSleep ? (
        <span className="db-row-actions">
          {confirming ? (
            <>
              <button
                type="button"
                className="db-end-sleep-btn db-end-sleep-btn--confirm"
                onClick={handleEndClick}
                disabled={ending}
              >
                {ending ? '结束中...' : '确认结束'}
              </button>
              <button
                type="button"
                className="db-end-sleep-btn db-end-sleep-btn--cancel"
                onClick={handleCancel}
              >
                取消
              </button>
            </>
          ) : (
            <button type="button" className="db-end-sleep-btn" onClick={handleEndClick}>
              结束睡眠
            </button>
          )}
        </span>
      ) : durationMin ? (
        <span className={`db-row-summary ${isOngoing ? 'db-summary-pink db-summary-active' : 'db-summary-gold'}`}>
          <span className="db-row-summary-value">{fmtDuration(durationMin)}</span>
        </span>
      ) : null}
    </div>
  )
}

export default function SleepColumn({ data, onAdd, onEndSleep }: Props) {
  const records = data.sleep

  return (
    <>
      <div className="db-col-header">
        <div className="db-col-title">
          <svg className="db-col-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          睡眠
          {onAdd && <button type="button" className="db-col-add-btn" onClick={onAdd}>+</button>}
        </div>
      </div>
      <div className="db-col-records">
        {records.length === 0 ? (
          <div className="db-empty">暂无记录</div>
        ) : (
          records.map((r) => <SleepRow key={r.id} r={r} onEndSleep={onEndSleep} />)
        )}
      </div>
    </>
  )
}
