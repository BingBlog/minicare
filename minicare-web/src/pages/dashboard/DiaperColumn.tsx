/**
 * 尿布记录列
 * 行布局：time | label | tags | (无 summary)
 * 对齐 Records 页面：label="换尿布"，tags 拆分为独立 Pill
 */
import type { DashboardData } from './useDashboardData'
import type { TodayRecord } from '@/api'

// 与 RecordContent.tsx DIAPER_CARD_LABELS 一致
const DIAPER_CARD_LABELS: Record<string, string> = {
  wet: '嘘嘘',
  dirty: '臭臭',
  mixed: '臭臭＋嘘嘘',
  dry: '干净',
}

// 与后端 poopType 枚举对齐
const POOP_LABEL: Record<string, string> = {
  normal: '正常软便',
  loose: '稀便',
  watery: '水样便',
  hard: '干硬粒',
  bloody: '血丝便',
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  data: DashboardData
  onAdd?: () => void
}

function renderDiaperRow(r: TodayRecord) {
  const detail = r.detail ?? {}
  const diaperType = (detail.diaper_type as string) ?? 'wet'
  const poopType = detail.poop_type as string | undefined
  const time = formatHM(r.time)

  const hasPoop = diaperType === 'dirty' || diaperType === 'mixed'
  const hasWet = diaperType === 'wet' || diaperType === 'mixed'
  const isDry = diaperType === 'dry'

  // Records 页面逻辑：mixed 拆为两个独立 Pill（臭臭 + 嘘嘘）
  const tagPills: Array<{ text: string; cls: string }> = []
  if (isDry) {
    tagPills.push({ text: DIAPER_CARD_LABELS[diaperType] ?? diaperType, cls: '' })
  }
  if (hasPoop) {
    tagPills.push({ text: hasPoop && hasWet ? '臭臭' : (DIAPER_CARD_LABELS[diaperType] ?? diaperType), cls: 'db-pill-brown' })
  }
  if (hasWet) {
    tagPills.push({ text: hasWet && hasPoop ? '嘘嘘' : (DIAPER_CARD_LABELS[diaperType] ?? diaperType), cls: 'db-pill-blue' })
  }
  if (poopType && hasPoop) {
    const poopLabel = POOP_LABEL[poopType] ?? poopType
    tagPills.push({ text: poopLabel, cls: 'db-pill-red' })
  }

  return (
    <div key={r.id} className="db-row">
      <span className="db-row-time">{time}</span>
      <span className="db-row-label">换尿布</span>
      <span className="db-row-tags">
        {tagPills.map((p, i) => (
          <span key={i} className={`db-pill ${p.cls}`}>{p.text}</span>
        ))}
      </span>
    </div>
  )
}

export default function DiaperColumn({ data, onAdd }: Props) {
  const records = data.diaper

  return (
    <>
      <div className="db-col-header">
        <div className="db-col-title">
          <svg className="db-col-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg>
          尿布
          {onAdd && <button type="button" className="db-col-add-btn" onClick={onAdd}>+</button>}
        </div>
      </div>
      <div className="db-col-records">
        {records.length === 0 ? (
          <div className="db-empty">暂无记录</div>
        ) : (
          records.map((r) => renderDiaperRow(r))
        )}
      </div>
    </>
  )
}
