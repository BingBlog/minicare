/**
 * 健康记录表单页
 * UI 对齐 ui-draft/form-health.html
 * API: POST /api/family/:familyId/records/health
 * 字段：baby_id, record_time, temperature, mood(happy|neutral|fussy|crying), note
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

// 过敏症状 9项（3列网格）
const allergySymptoms = ['皮疹/湿疹', '荨麻疹', '腹泻', '呕吐', '鼻塞/流鼻涕', '打喷嚏', '眼睛红肿', '血便', '呼吸急促']

// 用药chip
const medChips = ['维生素D', '铁剂', '益生菌', '钙剂']

// 保湿护理chip
const skinChips = ['已做保湿', '涂抹面霜', '涂抹身体乳']

export default function HealthFormPage() {
  const navigate = useNavigate()
  const { currentFamily, currentBaby } = useAppStore()

  const [recordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [temperature, setTemperature] = useState('')
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([])
  const [severity, setSeverity] = useState<'mild' | 'moderate' | 'severe' | null>(null)
  const [selectedMeds, setSelectedMeds] = useState<Set<string>>(new Set())
  const [medDose, setMedDose] = useState('')
  const [selectedSkin, setSelectedSkin] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  const toggleSymptom = (s: string) => {
    setSelectedSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }
  const toggleMed = (s: string) => {
    setSelectedMeds(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })
  }
  const toggleSkin = (s: string) => {
    setSelectedSkin(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })
  }

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) { showToast('请先完成宝宝建档'); return }
    const temp = temperature ? parseFloat(temperature) : undefined
    if (temp !== undefined && (temp < 35 || temp > 42)) { showToast('体温范围应为 35～42℃'); return }
    setSubmitting(true)
    try {
      const noteArr: string[] = []
      if (selectedSymptoms.length > 0) {
        noteArr.push('过敏表现：' + selectedSymptoms.join('、'))
        if (severity) {
          const sevLabel = { mild: '轻度', moderate: '中度', severe: '重度' }[severity]
          noteArr.push('严重程度：' + sevLabel)
        }
      }
      if (selectedMeds.size > 0) {
        noteArr.push('用药：' + [...selectedMeds].join('、') + (medDose ? `（${medDose}）` : ''))
      }
      if (selectedSkin.size > 0) noteArr.push('护理：' + [...selectedSkin].join('、'))
      if (note) noteArr.push(note)

      await recordsApi.health.create(currentFamily.id, {
        baby_id: currentBaby.id,
        record_time: timeToISO(recordDate, recordTime),
        temperature: temp,
        note: noteArr.join(' / ') || undefined,
      })
      showToast('✓ 健康记录已保存')
      setTimeout(() => navigate('/'), 1400)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const severityConfig = [
    { key: 'mild' as const,     label: '轻度', borderColor: '#4CAF82', bgColor: '#E8F5E9', textColor: '#2E7D32' },
    { key: 'moderate' as const, label: '中度', borderColor: '#FF8C42', bgColor: '#FFF3E0', textColor: '#E65100' },
    { key: 'severe' as const,   label: '重度', borderColor: '#F05060', bgColor: '#FEF0F0', textColor: '#C62828' },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#FAF5F6' }}>
      {/* 导航栏 */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 bg-white sticky top-0 z-20"
        style={{ boxShadow: '0 1px 0 #F5EEF0' }}>
        <button type="button" onClick={() => navigate(-1)} className="text-[#7A5A60] p-1 -ml-1">
          <IconArrowLeft />
        </button>
        <span className="text-[17px] font-bold text-[#4A3035]">健康记录</span>
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

        {/* 体温 */}
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2" style={{ borderBottom: '0.5px solid #F5EEF0' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
            </svg>
            <span className="text-[13px] font-bold text-[#7A5A60]">体温（可选）</span>
          </div>
          <div className="flex items-center px-4 py-3">
            <span className="text-[14px] text-[#7A5A60] flex-1">体温</span>
            {/* 步进器：0.1℃步进，比直接输入数字更精准好用 */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTemperature(v => {
                  const cur = parseFloat(v) || 37.0
                  return Math.max(35.0, +(cur - 0.1).toFixed(1)).toString()
                })}
                className="flex items-center justify-center w-7 h-7 rounded-full border text-[16px] text-[#9A8090] active:bg-pink-50"
                style={{ borderColor: '#E5D8DA' }}
              >−</button>
              <div className="flex items-center gap-0.5">
                <span className="text-[18px] font-bold text-[#4A3035] min-w-[46px] text-center">
                  {temperature || '—'}
                </span>
                <span className="text-[13px] text-[#9A8090]">℃</span>
              </div>
              <button
                type="button"
                onClick={() => setTemperature(v => {
                  const cur = parseFloat(v) || 37.0
                  return Math.min(42.0, +(cur + 0.1).toFixed(1)).toString()
                })}
                className="flex items-center justify-center w-7 h-7 rounded-full border text-[16px] text-[#9A8090] active:bg-pink-50"
                style={{ borderColor: '#E5D8DA' }}
              >＋</button>
              {temperature && (
                <button
                  type="button"
                  onClick={() => setTemperature('')}
                  className="text-[11px] text-[#C0A8B0] ml-1"
                >清除</button>
              )}
            </div>
          </div>
          {temperature && parseFloat(temperature) >= 37.5 && (
            <div className="mx-4 mb-3 px-3 py-2 rounded-xl text-xs" style={{ background: '#FFF0F4', color: '#F05060' }}>
              ⚠️ 体温偏高（≥37.5℃），建议关注宝宝状态
            </div>
          )}
        </div>

        {/* 过敏表现（9项网格，3列） */}
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2" style={{ borderBottom: '0.5px solid #F5EEF0' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#F0A0B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span className="text-[13px] font-bold text-[#7A5A60]">过敏表现（多选，无则跳过）</span>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3">
            {allergySymptoms.map(s => (
              <button key={s} type="button" onClick={() => toggleSymptom(s)}
                className="py-2.5 px-2 rounded-xl border text-[13px] font-medium text-center transition-all active:scale-95"
                style={{
                  borderColor: selectedSymptoms.includes(s) ? '#F05060' : '#E5D8DA',
                  background: selectedSymptoms.includes(s) ? '#FEF0F0' : '#fff',
                  color: selectedSymptoms.includes(s) ? '#F05060' : '#7A5A60',
                }}>
                {s}
              </button>
            ))}
          </div>
          {/* 表现程度（有症状时显示） */}
          {selectedSymptoms.length > 0 && (
            <>
              <div className="px-4 pb-1 text-[12px] text-[#9A8090]">表现程度</div>
              <div className="flex gap-2 px-4 pb-3">
                {severityConfig.map(({ key, label, borderColor, bgColor, textColor }) => (
                  <button key={key} type="button" onClick={() => setSeverity(severity === key ? null : key)}
                    className="flex-1 py-2.5 rounded-xl border text-[13px] font-semibold text-center transition-all"
                    style={{
                      borderColor: severity === key ? borderColor : '#E5D8DA',
                      borderWidth: severity === key ? 2 : 1.5,
                      background: severity === key ? bgColor : '#fff',
                      color: severity === key ? textColor : '#9A8090',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              {/* 表现拍照 */}
              <div className="px-4 pb-1 text-[12px] text-[#9A8090]">表现拍照（可选）</div>
              <div className="flex gap-2.5 px-4 pb-3">
                <div className="w-16 h-16 rounded-xl flex items-center justify-center border-2 border-dashed"
                  style={{ borderColor: '#F0B8C8', background: '#FFF0F4' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 24, height: 24 }}>
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>
                <button type="button"
                  onClick={() => showToast('拍照功能（功能开发中）')}
                  className="w-16 h-16 rounded-xl flex items-center justify-center text-[28px] font-light border-2 border-dashed"
                  style={{ borderColor: '#E5D8DA', background: '#F8F3F4', color: '#C0A8B0' }}>
                  ＋
                </button>
              </div>
            </>
          )}
        </div>

        {/* 用药记录 */}
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2" style={{ borderBottom: '0.5px solid #F5EEF0' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#9B8ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/>
            </svg>
            <span className="text-[13px] font-bold text-[#7A5A60]">用药记录</span>
          </div>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {medChips.map(med => (
              <button key={med} type="button" onClick={() => toggleMed(med)}
                className="px-3 py-1.5 rounded-full border text-[13px] font-medium transition-all"
                style={{
                  borderColor: selectedMeds.has(med) ? '#9B8ED8' : '#E5D8DA',
                  background: selectedMeds.has(med) ? '#F3F0FF' : '#fff',
                  color: selectedMeds.has(med) ? '#9B8ED8' : '#7A5A60',
                }}>
                {med}
              </button>
            ))}
          </div>
          {selectedMeds.size > 0 && (
            <div className="flex items-center px-4 pb-3" style={{ borderTop: '0.5px solid #F5EEF0' }}>
              <span className="text-[14px] text-[#7A5A60] flex-1 pt-3">剂量</span>
              <input type="text" value={medDose} onChange={(e) => setMedDose(e.target.value)}
                placeholder="如：400IU" className="w-32 text-right text-[14px] text-[#4A3035] pt-3 outline-none"
                style={{ background: 'transparent' }} />
            </div>
          )}
        </div>

        {/* 保湿护理 */}
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2" style={{ borderBottom: '0.5px solid #F5EEF0' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span className="text-[13px] font-bold text-[#7A5A60]">保湿护理</span>
          </div>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {skinChips.map(chip => (
              <button key={chip} type="button" onClick={() => toggleSkin(chip)}
                className="px-3 py-1.5 rounded-full border text-[13px] font-medium transition-all"
                style={{
                  borderColor: selectedSkin.has(chip) ? '#F87098' : '#E5D8DA',
                  background: selectedSkin.has(chip) ? '#FFF0F4' : '#fff',
                  color: selectedSkin.has(chip) ? '#F87098' : '#7A5A60',
                }}>
                {chip}
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
          style={{ background: submitting ? '#F9A8C0' : '#F87098' }}>
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
