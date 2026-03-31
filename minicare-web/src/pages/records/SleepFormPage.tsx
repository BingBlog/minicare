/**
 * 睡眠记录表单页
 * UI 对齐 ui-draft/form-sleep.html
 * API: POST /api/family/:familyId/records/sleep (补录)
 * 字段：baby_id, start_time, end_time, note
 */
import { useState, useEffect, useRef } from 'react'
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
const IconMoon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#4CAF82" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

type SleepMode = 'timer' | 'manual'

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
function calcDurationMin(startTime: string, endTime: string): number {
  const s = new Date(`2000-01-01T${startTime}:00`).getTime()
  let e = new Date(`2000-01-01T${endTime}:00`).getTime()
  if (e < s) e += 24 * 3600 * 1000
  return Math.round((e - s) / 60000)
}
function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`
  return `${m}m`
}

export default function SleepFormPage() {
  const navigate = useNavigate()
  const { currentFamily, currentBaby } = useAppStore()

  const [mode, setMode] = useState<SleepMode>('timer')

  // 计时模式
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerStartTime, setTimerStartTime] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 补录模式
  const [recordDate] = useState(nowDate())
  const [startTime, setStartTime] = useState(() => {
    const d = new Date(); d.setHours(d.getHours() - 1)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  })
  const [endTime, setEndTime] = useState(nowTime())

  // 共用
  const [sleepPeriod, setSleepPeriod] = useState<string>('night')
  const [sleepQuality, setSleepQuality] = useState<'good' | 'normal' | 'poor'>('normal')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')
  const [timerStopped, setTimerStopped] = useState(false)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  const durationMin = calcDurationMin(startTime, endTime)

  // 计时器 tick
  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        setTimerSeconds(s => s + 1)
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [timerRunning])

  const startTimer = () => {
    setTimerStartTime(new Date())
    setTimerSeconds(0)
    setTimerRunning(true)
    setTimerStopped(false)
  }

  const stopTimer = () => {
    setTimerRunning(false)
    setTimerStopped(true)
  }

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) { showToast('请先完成宝宝建档'); return }
    setSubmitting(true)
    try {
      let startISO: string, endISO: string
      if (mode === 'timer') {
        if (!timerStopped || !timerStartTime) { showToast('请先开始并结束计时'); setSubmitting(false); return }
        startISO = timerStartTime.toISOString()
        endISO = new Date().toISOString()
      } else {
        if (durationMin <= 0) { showToast('结束时间应晚于开始时间'); setSubmitting(false); return }
        startISO = timeToISO(recordDate, startTime)
        endISO = timeToISO(recordDate, endTime)
      }
      const noteArr: string[] = []
      const periodLabels: Record<string, string> = { night: '夜间', morning_nap: '上午小睡', afternoon_nap: '下午小睡', other: '其他' }
      if (sleepPeriod !== 'night') noteArr.push('时段：' + (periodLabels[sleepPeriod] || sleepPeriod))
      const qualityLabels: Record<string, string> = { good: '良好', normal: '一般', poor: '较差' }
      noteArr.push('质量：' + (qualityLabels[sleepQuality] || sleepQuality))
      if (note) noteArr.push(note)

      await recordsApi.sleep.create(currentFamily.id, {
        baby_id: currentBaby.id,
        start_time: startISO,
        end_time: endISO,
        note: noteArr.join(' / ') || undefined,
      })
      showToast('✓ 睡眠记录已保存')
      setTimeout(() => navigate('/'), 1400)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const qualityOptions = [
    { key: 'good' as const,   label: '良好', icon: '😊', color: '#4CAF82', bg: '#E8F5E9' },
    { key: 'normal' as const, label: '一般', icon: '😐', color: '#9A8090', bg: '#F5F0F2' },
    { key: 'poor' as const,   label: '较差', icon: '😟', color: '#F87098', bg: '#FFF0F4' },
  ]

  const periodOptions = [
    { key: 'night',        label: '夜间',     icon: '🌙' },
    { key: 'morning_nap',  label: '上午小睡', icon: '☀️' },
    { key: 'afternoon_nap',label: '下午小睡', icon: '🌤️' },
    { key: 'other',        label: '其他',     icon: '' },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#FAF5F6' }}>
      {/* 导航栏 */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 bg-white sticky top-0 z-20"
        style={{ boxShadow: '0 1px 0 #F5EEF0' }}>
        <button type="button" onClick={() => navigate(-1)} className="text-[#7A5A60] p-1 -ml-1">
          <IconArrowLeft />
        </button>
        <span className="text-[17px] font-bold text-[#4A3035]">睡眠记录</span>
        <div className="w-8" />
      </div>

      {/* 模式切换 */}
      <div className="mx-4 mt-3 flex gap-0 rounded-xl overflow-hidden p-[3px]" style={{ background: '#F0E8EA' }}>
        {([{ key: 'timer', label: '计时模式' }, { key: 'manual', label: '补录模式' }] as const).map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setMode(key)}
            className="flex-1 py-[9px] text-[14px] font-semibold rounded-[10px] transition-all"
            style={{
              background: mode === key ? '#fff' : 'transparent',
              color: mode === key ? '#4A3035' : '#9A8090',
              boxShadow: mode === key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>
            {label}
          </button>
        ))}
      </div>

      <div className="pb-32">
        {/* ── 计时模式 ── */}
        {mode === 'timer' && (
          <div className="flex flex-col items-center pt-8 pb-4 gap-4">
            {/* 圆形计时器 */}
            <div className="relative flex items-center justify-center"
              style={{
                width: 180, height: 180, borderRadius: '50%',
                background: timerRunning
                  ? `conic-gradient(#4CAF82 ${Math.min(100, (timerSeconds / (12 * 3600)) * 100)}%, #F0E8EA 0%)`
                  : '#F0E8EA',
              }}>
              <div className="flex flex-col items-center justify-center gap-1"
                style={{ width: 148, height: 148, borderRadius: '50%', background: '#fff' }}>
                <IconMoon />
                <span className="text-[32px] font-extrabold text-[#4A3035] leading-none tracking-tight">
                  {timerRunning || timerStopped ? formatTimer(timerSeconds) : '0m'}
                </span>
                <span className="text-[12px] text-[#9A8090] font-medium">
                  {timerRunning ? '睡眠进行中' : timerStopped ? '已结束' : '准备好了'}
                </span>
              </div>
            </div>
            {timerStartTime && (
              <span className="text-[13px] text-[#9A8090]">
                开始于 {timerStartTime.getHours().toString().padStart(2, '0')}:{timerStartTime.getMinutes().toString().padStart(2, '0')} 今天
              </span>
            )}
            {/* 操作按钮 */}
            {!timerRunning && !timerStopped && (
              <button type="button" onClick={startTimer}
                className="w-44 py-4 rounded-2xl text-white text-[16px] font-bold"
                style={{ background: '#4CAF82', boxShadow: '0 4px 14px rgba(52,199,89,.4)' }}>
                开始计时
              </button>
            )}
            {timerRunning && (
              <button type="button" onClick={stopTimer}
                className="w-44 py-4 rounded-2xl text-white text-[16px] font-bold"
                style={{ background: '#F87098', boxShadow: '0 4px 14px rgba(248,112,152,.35)' }}>
                结束睡眠
              </button>
            )}
            {timerStopped && (
              <button type="button" onClick={startTimer}
                className="w-44 py-4 rounded-2xl text-[16px] font-bold"
                style={{ background: '#F0E8EA', color: '#7A5A60' }}>
                重新计时
              </button>
            )}
          </div>
        )}

        {/* ── 补录模式 ── */}
        {mode === 'manual' && (
          <>
            <div className="px-4 pt-3.5 pb-1">
              <span className="text-[12px] font-semibold text-[#9A8090]">时间信息</span>
            </div>
            <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '0.5px solid #F5EEF0' }}>
                <TimePicker value={startTime} onChange={setStartTime} label="入睡时间" />
              </div>
              <div className="px-4 py-3" style={{ borderBottom: '0.5px solid #F5EEF0' }}>
                <TimePicker value={endTime} onChange={setEndTime} label="醒来时间" />
              </div>
              <div className="flex items-center px-4 py-3">
                <span className="text-[14px] text-[#7A5A60] flex-1">睡眠时长</span>
                <span className="text-[14px] font-semibold text-[#4A3035]">
                  {durationMin > 0
                    ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m（自动计算）`
                    : '—'}
                </span>
              </div>
            </div>

            {/* 睡眠时段 */}
            <div className="px-4 pb-1">
              <span className="text-[12px] font-semibold text-[#9A8090]">睡眠时段</span>
            </div>
            <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
              <div className="flex flex-wrap gap-2 px-4 py-3">
                {periodOptions.map(({ key, label, icon }) => (
                  <button key={key} type="button" onClick={() => setSleepPeriod(key)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full border text-[13px] font-semibold transition-all"
                    style={{
                      borderColor: sleepPeriod === key ? '#F87098' : '#E5D8DA',
                      background: sleepPeriod === key ? '#FFF0F4' : '#fff',
                      color: sleepPeriod === key ? '#F87098' : '#7A5A60',
                    }}>
                    {icon && <span>{icon}</span>}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 睡眠质量（两种模式都显示） */}
        <div className="px-4 pb-1">
          <span className="text-[12px] font-semibold text-[#9A8090]">睡眠质量</span>
        </div>
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="flex gap-2.5 px-4 py-3">
            {qualityOptions.map(({ key, label, icon, color, bg }) => (
              <button key={key} type="button" onClick={() => setSleepQuality(key)}
                className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all active:scale-95"
                style={{
                  borderColor: sleepQuality === key ? color : '#E5D8DA',
                  background: sleepQuality === key ? bg : '#fff',
                }}>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: sleepQuality === key ? bg : '#F5F0F2' }}>
                  <span className="text-[18px]">{icon}</span>
                </span>
                <span className="text-[12px] font-medium" style={{ color: sleepQuality === key ? color : '#9A8090' }}>{label}</span>
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
              placeholder="如：夜哭了2次"
              className="w-full text-[13px] text-[#4A3035] outline-none"
              style={{ background: 'transparent' }} />
          </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white px-5 pt-3 pb-8" style={{ boxShadow: '0 -1px 0 #F5EEF0' }}>
        <button type="button" onClick={handleSubmit} disabled={submitting}
          className="w-full py-4 rounded-full text-white text-[16px] font-bold"
          style={{ background: submitting ? '#A8D8B0' : '#4CAF82' }}>
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
