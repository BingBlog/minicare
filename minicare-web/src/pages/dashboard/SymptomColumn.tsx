/**
 * 表现/护理列
 *
 * 合并展示：健康记录（体温/过敏/用药）+ 症状记录（精神/情绪）
 * 行布局：time | label | tags | summary
 */
import type { DashboardData } from './useDashboardData'
import type { TodayRecord } from '@/api'

// 对齐后端 mood 枚举
const MOOD_LABEL: Record<string, string> = {
  happy: '开心',
  neutral: '平静',
  fussy: '烦躁',
  crying: '哭闹',
}

// 对齐后端 spiritLevel 枚举
const SPIRIT_LABEL: Record<string, string> = {
  active: '活跃',
  normal: '正常',
  tired: '疲倦',
  lethargic: '嗜睡',
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  data: DashboardData
  onAdd: () => void
}

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
    <div key={r.id} className="db-row">
      <span className="db-row-time">{time}</span>
      <span className="db-row-label">健康</span>
      <span className="db-row-tags">
        {tagPills.map((p, i) => (
          <span key={i} className={`db-pill ${p.cls}`}>{p.text}</span>
        ))}
      </span>
      {temp != null ? (
        <span className={`db-row-summary ${isFever ? 'db-summary-red db-summary-active' : 'db-summary-pink'}`}>
          <span className="db-row-summary-value">{temp.toFixed(1)}</span>
          <span className="db-row-summary-unit">°C</span>
        </span>
      ) : null}
    </div>
  )
}

function renderSymptomRow(r: TodayRecord) {
  const detail = r.detail ?? {}
  const mood = detail.mood as string | undefined
  const spirit = detail.spirit as string | undefined
  const time = formatHM(r.time)

  const tagPills: Array<{ text: string; cls: string }> = []
  if (mood) tagPills.push({ text: MOOD_LABEL[mood] ?? mood, cls: 'db-pill-pink' })
  if (spirit) tagPills.push({ text: SPIRIT_LABEL[spirit] ?? spirit, cls: 'db-pill-amber' })

  return (
    <div key={r.id} className="db-row">
      <span className="db-row-time">{time}</span>
      <span className="db-row-label">表现</span>
      <span className="db-row-tags">
        {tagPills.map((p, i) => (
          <span key={i} className={`db-pill ${p.cls}`}>{p.text}</span>
        ))}
      </span>
    </div>
  )
}

export default function SymptomColumn({ data, onAdd }: Props) {
  const healthRecords = data.health
  const symptomRecords = data.symptom ?? []
  const allRecords = [...healthRecords, ...symptomRecords]
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  // 小结：最新体温 + 最新精神/情绪
  const summaryParts: string[] = []
  if (data.latestTemp != null) summaryParts.push(`${data.latestTemp.toFixed(1)}°C`)
  if (data.latestSpirit) summaryParts.push(SPIRIT_LABEL[data.latestSpirit] ?? data.latestSpirit)
  if (data.latestMood) summaryParts.push(MOOD_LABEL[data.latestMood] ?? data.latestMood)

  return (
    <>
      <div className="db-col-header">
        <div className="db-col-title">
          <svg className="db-col-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          表现
          <button type="button" className="db-col-add-btn" onClick={onAdd}>+</button>
        </div>
      </div>
      <div className="db-col-records">
        {allRecords.length === 0 ? (
          <div className="db-empty">暂无记录</div>
        ) : (
          allRecords.map((r) => r.type === 'symptom' ? renderSymptomRow(r) : renderHealthRow(r))
        )}
      </div>
    </>
  )
}
