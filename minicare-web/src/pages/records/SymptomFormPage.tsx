/**
 * 表现记录表单页
 * UI 对齐 ui-draft/form-symptom.html
 * API: POST /api/family/:familyId/records/symptom
 * 字段：baby_id, record_time, mood, spirit, note
 * mood: happy/normal/sad   spirit: calm/normal/active/sleepy
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/lib/store'
import { recordsApi } from '@/api'
import TimePicker from '@/components/TimePicker'

const IconArrowLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

// Mood SVG 图标
const IconLaugh = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 13s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
)
const IconSmile = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 1.5 4 1.5 4-1.5 4-1.5" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
)
const IconFrown = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
)
// Spirit SVG 图标
const IconPause = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
)
const IconPlay = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)
const IconTrendingUp = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
)
const IconMoon = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

function nowTime(): string {
  const d = new Date()
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
function nowDate(): string {
  return new Date().toISOString().split('T')[0]
}
function timeToISO(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}:00`).toISOString()
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-5 pt-3.5 pb-1" style={{ fontSize: 12, fontWeight: 600, color: '#9A8090' }}>
      {label}
    </div>
  )
}

/** 带图标圆角方块的 Mood 按钮（对齐 ui-draft .mood-btn 样式） */
function MoodButton({
  selected,
  onClick,
  label,
  iconBg,
  icon,
}: {
  selected: boolean
  onClick: () => void
  label: string
  iconBg: string
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1 rounded-xl transition-all"
      style={{
        padding: '10px 4px',
        border: `1.5px solid ${selected ? '#F87098' : '#EDE0E3'}`,
        background: selected ? '#FFF5F8' : '#fff',
      }}
    >
      {/* 图标圆角方块 */}
      <div className="flex items-center justify-center rounded-lg"
        style={{ width: 28, height: 28, background: iconBg }}>
        {icon}
      </div>
      <span className="text-[11px] font-medium"
        style={{ color: selected ? '#F87098' : '#9A8090', fontWeight: selected ? 600 : 500 }}>
        {label}
      </span>
    </button>
  )
}

const PRIMARY = '#F87098'

export default function SymptomFormPage() {
  const navigate = useNavigate()
  const { currentFamily, currentBaby } = useAppStore()

  const [recordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [mood, setMood] = useState<string>('happy')
  const [spirit, setSpirit] = useState<string>('normal')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg); setTimeout(() => setToast(''), 2000)
  }

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) { showToast('请先完成宝宝建档'); return }
    setSubmitting(true)
    try {
      const noteArr: string[] = []
      const moodLabel = { happy: '开心', normal: '一般', sad: '低落' }[mood] ?? mood
      const spiritLabel = { calm: '安静', normal: '正常', active: '活跃', sleepy: '嗜睡' }[spirit] ?? spirit
      noteArr.push(`心情：${moodLabel}`, `精神：${spiritLabel}`)
      if (note) noteArr.push(note)

      await recordsApi.symptom.create(currentFamily.id, {
        baby_id: currentBaby.id,
        record_time: timeToISO(recordDate, recordTime),
        symptoms: [{ type: 6, severity: 1 }],
        note: noteArr.join(' / ') || undefined,
      })
      showToast('✓ 表现记录已保存')
      setTimeout(() => navigate('/'), 1400)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#FAF5F6' }}>
      {/* 导航栏 */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 bg-white sticky top-0 z-20"
        style={{ boxShadow: '0 1px 0 #F5EEF0' }}>
        <button type="button" onClick={() => navigate(-1)} className="text-[#7A5A60] p-1 -ml-1">
          <IconArrowLeft />
        </button>
        <span className="text-[17px] font-bold text-[#4A3035]">表现记录</span>
        <div className="w-8" />
      </div>

      <div className="pb-32">

        {/* ── 记录时间 ── */}
        <SectionLabel label="记录时间" />
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="px-4 py-3">
            <TimePicker value={recordTime} onChange={setRecordTime} label="记录时间" />
          </div>
        </div>

        {/* ── 心情状态 ── */}
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="px-4 pt-3.5 pb-2 flex items-center gap-2"
            style={{ borderBottom: '0.5px solid #F5EEF0' }}>
            {/* smile 图标 */}
            <svg viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 1.5 4 1.5 4-1.5 4-1.5" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
            <span className="text-[13px] font-bold text-[#7A5A60]">心情状态</span>
          </div>
          <div className="flex gap-2 px-4 py-3">
            <MoodButton
              selected={mood === 'happy'}
              onClick={() => setMood('happy')}
              label="开心"
              iconBg="#E8F5E9"
              icon={<IconLaugh color="#4CAF82" />}
            />
            <MoodButton
              selected={mood === 'normal'}
              onClick={() => setMood('normal')}
              label="一般"
              iconBg="#F5F0F2"
              icon={<IconSmile color="#9A8090" />}
            />
            <MoodButton
              selected={mood === 'sad'}
              onClick={() => setMood('sad')}
              label="低落"
              iconBg="#FFF0F4"
              icon={<IconFrown color={PRIMARY} />}
            />
          </div>
        </div>

        {/* ── 精神状态 ── */}
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="px-4 pt-3.5 pb-2 flex items-center gap-2"
            style={{ borderBottom: '0.5px solid #F5EEF0' }}>
            {/* star 图标 */}
            <svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span className="text-[13px] font-bold text-[#7A5A60]">精神状态</span>
          </div>
          <div className="flex gap-2 px-4 py-3">
            <MoodButton
              selected={spirit === 'calm'}
              onClick={() => setSpirit('calm')}
              label="安静"
              iconBg="#E8F5E9"
              icon={<IconPause color="#4CAF82" />}
            />
            <MoodButton
              selected={spirit === 'normal'}
              onClick={() => setSpirit('normal')}
              label="正常"
              iconBg="#FFF8E6"
              icon={<IconPlay color="#DDB870" />}
            />
            <MoodButton
              selected={spirit === 'active'}
              onClick={() => setSpirit('active')}
              label="活跃"
              iconBg="#FFF0F4"
              icon={<IconTrendingUp color={PRIMARY} />}
            />
            <MoodButton
              selected={spirit === 'sleepy'}
              onClick={() => setSpirit('sleepy')}
              label="嗜睡"
              iconBg="#EEF0FF"
              icon={<IconMoon color="#7B68EE" />}
            />
          </div>
        </div>

        {/* ── 备注 ── */}
        <SectionLabel label="备注（可选）" />
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="px-4 py-3">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="其他观察或备注…"
              className="w-full text-[13px] text-[#4A3035] outline-none"
              style={{ background: 'transparent' }}
            />
          </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white px-5 pt-3 pb-8"
        style={{ boxShadow: '0 -1px 0 #F5EEF0' }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 rounded-full text-white text-[16px] font-bold"
          style={{ background: submitting ? '#F9A8C0' : PRIMARY }}
        >
          {submitting ? '保存中…' : '保存记录'}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-[#4A3035] text-white text-sm px-5 py-2.5 rounded-full z-50 whitespace-nowrap shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
