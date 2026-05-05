/**
 * 底部区域
 * 左侧：早教/锻炼（活动记录）
 * 右侧：护理记录（健康 + 症状）
 *
 * 行布局：time | label | tags | summary
 * 对齐 Records 页面 getRecordListCompactParts + getRecordSummary
 */
import type { DashboardData } from './useDashboardData'
import type { TodayRecord } from '@/api'

// 对齐后端 activityType 枚举全称
const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  gross_motor: '大运动练习',
  fine_motor:  '精细运动练习',
  edu_play:    '亲子早教互动',
  outdoor:     '户外活动',
  daily_care:  '日常护理',
  other:       '其他活动',
}

// 对齐后端 mood 枚举全称
const MOOD_LABEL: Record<string, string> = {
  happy:   '愉悦满足',
  neutral: '平静舒适',
  fussy:   '烦躁不开心',
  crying:  '痛苦哭闹',
}

// 对齐后端 spiritLevel 枚举全称
const SPIRIT_LABEL: Record<string, string> = {
  active:    '精神活跃',
  normal:    '状态良好',
  tired:     '烦躁不安',
  lethargic: '萎靡嗜睡',
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
  onAddActivity?: () => void
  onAddHealth?: () => void
}

// ── Activity：label=活动类型全称 tags=无 summary=时长 ──
function renderActivityRow(r: TodayRecord) {
  const detail = r.detail ?? {}
  const actType = (detail.activity_type as string) ?? 'other'
  const durationMin = detail.duration_min as number | undefined
  const time = formatHM(r.time)

  const label = ACTIVITY_TYPE_LABEL[actType] ?? actType

  return (
    <div key={r.id} className="db-bottom-row">
      <span className="db-bottom-time">{time}</span>
      <span className="db-bottom-label">{label}</span>
      <span className="db-bottom-tags" />
      {durationMin ? (
        <span className="db-row-summary db-summary-gold">
          <span className="db-row-summary-value">{fmtDuration(durationMin)}</span>
        </span>
      ) : null}
    </div>
  )
}

// ── Health：label="健康" tags=发热/过敏/用药 summary=体温 ──
function renderHealthRow(r: TodayRecord) {
  const detail = r.detail ?? {}
  const temp = detail.temperature as number | undefined
  const allergySymptoms = detail.allergy_symptoms as string[] | undefined
  const medications = detail.medications as Array<{ name: string; dose?: string }> | undefined
  const time = formatHM(r.time)

  const isFever = temp != null && temp >= 37.5
  const tagPills: Array<{ text: string; cls: string }> = []
  if (isFever) tagPills.push({ text: '发热', cls: 'db-pill-red' })
  if (allergySymptoms && allergySymptoms.length > 0) tagPills.push({ text: '过敏', cls: 'db-pill-red' })
  if (medications && medications.length > 0) tagPills.push({ text: medications[0].name, cls: 'db-pill-lavender' })

  return (
    <div key={r.id} className="db-bottom-row">
      <span className="db-bottom-time">{time}</span>
      <span className="db-bottom-label">健康</span>
      <span className="db-bottom-tags">
        {tagPills.map((p, i) => (
          <span key={i} className={`db-pill ${p.cls}`}>{p.text}</span>
        ))}
      </span>
      {temp != null ? (
        <span className={`db-row-summary ${isFever ? 'db-summary-red db-summary-active' : 'db-summary-pink'}`}>
          <span className="db-row-summary-value">{temp.toFixed(1)}</span>
          <span className="db-row-summary-unit">℃</span>
        </span>
      ) : null}
    </div>
  )
}

// ── Symptom：label="表现" tags=情绪+精神 summary=无 ──
function renderSymptomRow(r: TodayRecord) {
  const detail = r.detail ?? {}
  const mood = detail.mood as string | undefined
  const spirit = detail.spirit as string | undefined
  const time = formatHM(r.time)

  const tagPills: Array<{ text: string; cls: string }> = []
  if (mood) tagPills.push({ text: MOOD_LABEL[mood] ?? mood, cls: 'db-pill-pink' })
  if (spirit) tagPills.push({ text: SPIRIT_LABEL[spirit] ?? spirit, cls: 'db-pill-amber' })

  return (
    <div key={r.id} className="db-bottom-row">
      <span className="db-bottom-time">{time}</span>
      <span className="db-bottom-label">表现</span>
      <span className="db-bottom-tags">
        {tagPills.map((p, i) => (
          <span key={i} className={`db-pill ${p.cls}`}>{p.text}</span>
        ))}
      </span>
    </div>
  )
}

export default function BottomSection({ data, onAddActivity, onAddHealth }: Props) {
  const activities = data.activity
  const healthRecords = data.health
  const symptomRecords = data.symptom ?? []

  return (
    <div className="db-bottom">
      <div className="db-bottom-section">
        <div className="db-bottom-title">
          早教 / 锻炼
          {onAddActivity && (
            <button type="button" className="db-col-add-btn" onClick={onAddActivity}>+</button>
          )}
        </div>
        {activities.length === 0 ? (
          <div className="db-empty">暂无活动</div>
        ) : (
          activities.map((r) => renderActivityRow(r))
        )}
      </div>

      <div className="db-bottom-section">
        <div className="db-bottom-title">
          护理记录
          {onAddHealth && (
            <button type="button" className="db-col-add-btn" onClick={onAddHealth}>+</button>
          )}
        </div>
        {healthRecords.length === 0 && symptomRecords.length === 0 ? (
          <div className="db-empty">暂无护理</div>
        ) : (
          [...healthRecords, ...symptomRecords]
            .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
            .map((r) => r.type === 'symptom' ? renderSymptomRow(r) : renderHealthRow(r))
        )}
      </div>
    </div>
  )
}
