/**
 * 活动记录表单页
 * UI 对齐 ui-draft/form-activity.html
 * API: POST /api/family/:familyId/records/activity
 * 字段：baby_id, activity_type(bath|outdoor|play|tummy_time|other), record_time, duration_min, note
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
const IconCheck = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

type ActivityType = 'tummy_time' | 'outdoor' | 'play' | 'bath' | 'other'
type Intensity = 'easy' | 'medium' | 'active'

const activityOptions: { key: ActivityType; label: string; sub: string; icon: string; color: string; bg: string }[] = [
  { key: 'tummy_time', label: '爬走练习', sub: '趴卧/爬行练习',     icon: '🐛', color: '#F87098', bg: '#FFF0F4' },
  { key: 'outdoor',    label: '户外活动', sub: '散步/日晒/亲近自然', icon: '🌞', color: '#C0922A', bg: '#FFFDE7' },
  { key: 'play',       label: '运动活动', sub: '蹦跳/肢体运动',      icon: '🎯', color: '#4CAF82', bg: '#E8F5E9' },
  { key: 'bath',       label: '洗澡',     sub: '日常清洁护理',       icon: '🛁', color: '#4A90D9', bg: '#EEF6FF' },
  { key: 'other',      label: '其他活动', sub: '自由记录',           icon: '✨', color: '#9B8ED8', bg: '#F3F0FF' },
]

const intensityOptions: { key: Intensity; label: string; iconColor: string; bg: string }[] = [
  { key: 'easy',   label: '轻松', iconColor: '#4CAF82', bg: '#E8F5E9' },
  { key: 'medium', label: '适中', iconColor: '#DDB870', bg: '#FFF8E6' },
  { key: 'active', label: '活跃', iconColor: '#F87098', bg: '#FFF0F4' },
]

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

export default function ActivityFormPage() {
  const navigate = useNavigate()
  const { currentFamily, currentBaby } = useAppStore()

  const [recordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [activityType, setActivityType] = useState<ActivityType>('tummy_time')
  const [intensity, setIntensity] = useState<Intensity>('medium')
  const [durationMin, setDurationMin] = useState(15)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) { showToast('请先完成宝宝建档'); return }
    setSubmitting(true)
    try {
      const noteArr: string[] = []
      const intensityLabel = { easy: '轻松', medium: '适中', active: '活跃' }[intensity]
      noteArr.push('强度：' + intensityLabel)
      if (note) noteArr.push(note)
      await recordsApi.activity.create(currentFamily.id, {
        baby_id: currentBaby.id,
        activity_type: activityType,
        record_time: timeToISO(recordDate, recordTime),
        duration_min: durationMin,
        note: noteArr.join(' / ') || undefined,
      })
      showToast('✓ 活动记录已保存')
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
        <span className="text-[17px] font-bold text-[#4A3035]">活动记录</span>
        <div className="w-8" />
      </div>

      <div className="pb-32">
        {/* 记录时间 */}
        <div className="px-4 pt-3.5 pb-1">
          <span className="text-[12px] font-semibold text-[#9A8090]">记录时间</span>
        </div>
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="px-4 py-3">
            <TimePicker value={recordTime} onChange={setRecordTime} label="记录时间" />
          </div>
        </div>

        {/* 活动类型 */}
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2" style={{ borderBottom: '0.5px solid #F5EEF0' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <span className="text-[13px] font-bold text-[#7A5A60]">活动类型</span>
          </div>
          {/* mood-btn 横排 */}
          <div className="flex gap-1.5 px-3 py-3 overflow-x-auto">
            {activityOptions.map(({ key, label, icon, color, bg }) => (
              <button key={key} type="button" onClick={() => setActivityType(key)}
                className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border flex-shrink-0 transition-all active:scale-95"
                style={{
                  minWidth: 56,
                  borderColor: activityType === key ? color : '#E5D8DA',
                  background: activityType === key ? bg : '#fff',
                }}>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: activityType === key ? bg : '#F5F0F2' }}>
                  <span className="text-[16px]">{icon}</span>
                </span>
                <span className="text-[11px] font-medium whitespace-nowrap"
                  style={{ color: activityType === key ? color : '#9A8090' }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 活动时长 */}
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2" style={{ borderBottom: '0.5px solid #F5EEF0' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span className="text-[13px] font-bold text-[#7A5A60]">活动时长</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <button type="button" onClick={() => setDurationMin(d => Math.max(5, d - 5))}
              className="flex items-center justify-center w-9 h-9 rounded-full border text-[18px] text-[#9A8090] bg-white active:bg-pink-50"
              style={{ borderColor: '#E5D8DA' }}>−</button>
            <div className="flex-1 text-center">
              <span className="text-[28px] font-extrabold text-[#4A3035]">{durationMin}</span>
              <div className="text-[12px] text-[#9A8090] mt-0.5">分钟</div>
            </div>
            <button type="button" onClick={() => setDurationMin(d => Math.min(120, d + 5))}
              className="flex items-center justify-center w-9 h-9 rounded-full border text-[18px] text-[#9A8090] bg-white active:bg-pink-50"
              style={{ borderColor: '#E5D8DA' }}>＋</button>
          </div>
        </div>

        {/* 活动强度 */}
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2" style={{ borderBottom: '0.5px solid #F5EEF0' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span className="text-[13px] font-bold text-[#7A5A60]">活动强度</span>
          </div>
          <div className="flex gap-2.5 px-4 py-3">
            {intensityOptions.map(({ key, label, iconColor, bg }) => (
              <button key={key} type="button" onClick={() => setIntensity(key)}
                className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all active:scale-95"
                style={{
                  borderColor: intensity === key ? iconColor : '#E5D8DA',
                  background: intensity === key ? bg : '#fff',
                }}>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: intensity === key ? bg : '#F5F0F2' }}>
                  {key === 'easy' && <svg viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><rect x="6" y="10" width="12" height="4" rx="2"/></svg>}
                  {key === 'medium' && <svg viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                  {key === 'active' && <svg viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
                </span>
                <span className="text-[12px] font-medium"
                  style={{ color: intensity === key ? iconColor : '#9A8090' }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 备注 */}
        <div className="px-4 pb-1">
          <span className="text-[12px] font-semibold text-[#9A8090]">备注（可选）</span>
        </div>
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="px-4 py-3">
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="其他观察或备注…"
              className="w-full text-[13px] text-[#4A3035] outline-none"
              style={{ background: 'transparent' }} />
          </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white px-5 pt-3 pb-8" style={{ boxShadow: '0 -1px 0 #F5EEF0' }}>
        <button type="button" onClick={handleSubmit} disabled={submitting}
          className="w-full py-4 rounded-full text-white text-[16px] font-bold"
          style={{ background: submitting ? '#DDCAD0' : '#DDB870' }}>
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
