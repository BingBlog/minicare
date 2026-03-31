/**
 * 尿布记录表单页
 * UI 对齐 ui-draft/form-diaper.html
 * API: POST /api/family/:familyId/records/diaper
 * 字段：baby_id, diaper_type(wet|dirty|mixed|dry), record_time, color, note
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

type DiaperChip = 'wet' | 'dirty' | 'mixed' | 'dry'

// 大便性状（6 项网格，对齐 HTML 稿）
const poopItems = [
  { key: 'normal_soft', label: '正常软便', dot: '#F5C842' },
  { key: 'loose',       label: '稀便',     dot: '#8BC34A' },
  { key: 'watery',      label: '水样便',   dot: '#64B5F6' },
  { key: 'hard',        label: '干硬粒',   dot: '#B0B0B0' },
  { key: 'bloody',      label: '血丝便',   dot: '#EF5350' },
  { key: 'normal_form', label: '正常成形', dot: '#8D6E63' },
]

// 大便颜色 chip（小号）
const colorChips = [
  { key: 'yellow',       label: '黄色', dot: '#F5C518' },
  { key: 'brown_yellow', label: '棕黄', dot: '#B8860B' },
  { key: 'green',        label: '绿色', dot: '#4CAF82' },
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

export default function DiaperFormPage() {
  const navigate = useNavigate()
  const { currentFamily, currentBaby } = useAppStore()

  const [recordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())

  // 换尿布 chip 多选
  const [diaperChips, setDiaperChips] = useState<Set<DiaperChip>>(new Set(['wet']))
  // 今日次数
  const [diaperCount, setDiaperCount] = useState(3)
  // 大便性状（单选）
  const [poopType, setPoopType] = useState<string | null>(null)
  // 颜色 chip（多选）
  const [colorSelected, setColorSelected] = useState<Set<string>>(new Set())

  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  const toggleDiaperChip = (key: DiaperChip) => {
    setDiaperChips(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const toggleColor = (key: string) => {
    setColorSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // 从多选 chip 推断主类型
  const inferDiaperType = (): 'wet' | 'dirty' | 'mixed' | 'dry' => {
    const hasDirty = diaperChips.has('dirty')
    const hasWet = diaperChips.has('wet')
    const hasMixed = diaperChips.has('mixed')
    if (hasMixed || (hasDirty && hasWet)) return 'mixed'
    if (hasDirty) return 'dirty'
    if (diaperChips.has('dry')) return 'dry'
    return 'wet'
  }

  const showPoop = diaperChips.has('dirty') || diaperChips.has('mixed')

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) { showToast('请先完成宝宝建档'); return }
    setSubmitting(true)
    try {
      const noteArr: string[] = []
      if (poopType) {
        const p = poopItems.find(x => x.key === poopType)
        if (p) noteArr.push('性状：' + p.label)
      }
      if (colorSelected.size > 0) {
        noteArr.push('颜色：' + [...colorSelected].map(c => colorChips.find(x => x.key === c)?.label).join('、'))
      }
      if (diaperCount !== 3) noteArr.push(`今日次数：${diaperCount}次`)
      if (note) noteArr.push(note)
      await recordsApi.diaper.create(currentFamily.id, {
        baby_id: currentBaby.id,
        diaper_type: inferDiaperType(),
        record_time: timeToISO(recordDate, recordTime),
        note: noteArr.join(' / ') || undefined,
      })
      showToast('✓ 尿布记录已保存')
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
        <span className="text-[17px] font-bold text-[#4A3035]">尿布记录</span>
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

        {/* 换尿布 */}
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          {/* 标题 */}
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2" style={{ borderBottom: '0.5px solid #F5EEF0' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#4CAF82" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
            </svg>
            <span className="text-[13px] font-bold text-[#7A5A60]">换尿布</span>
          </div>
          {/* chip 多选行 */}
          <div className="flex gap-2 px-4 py-3 flex-wrap">
            {([
              { key: 'wet' as const,   label: '湿尿布' },
              { key: 'dirty' as const, label: '大便' },
              { key: 'mixed' as const, label: '都有' },
              { key: 'dry' as const,   label: '未换' },
            ]).map(({ key, label }) => (
              <button key={key} type="button" onClick={() => toggleDiaperChip(key)}
                className="px-4 py-1.5 rounded-full text-[13px] font-semibold border transition-all"
                style={{
                  borderColor: diaperChips.has(key) ? '#F87098' : '#E5D8DA',
                  background: diaperChips.has(key) ? '#FFF0F4' : '#fff',
                  color: diaperChips.has(key) ? '#F87098' : '#7A5A60',
                }}>
                {label}
              </button>
            ))}
          </div>
          {/* 今日次数 */}
          <div className="flex items-center px-4 py-2.5" style={{ borderTop: '0.5px solid #F5EEF0' }}>
            <span className="text-[14px] text-[#7A5A60] flex-1">今日次数</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDiaperCount(c => Math.max(0, c - 1))}
                className="w-6 h-6 rounded-full border flex items-center justify-center text-[14px] text-[#9A8090] active:bg-pink-50"
                style={{ borderColor: '#E5D8DA' }}>−</button>
              <span className="text-[14px] font-bold text-[#4A3035] min-w-[20px] text-center">{diaperCount}</span>
              <button type="button" onClick={() => setDiaperCount(c => c + 1)}
                className="w-6 h-6 rounded-full border flex items-center justify-center text-[14px] text-[#9A8090] active:bg-pink-50"
                style={{ borderColor: '#E5D8DA' }}>＋</button>
            </div>
          </div>
        </div>

        {/* 大便性状（条件显示） */}
        {showPoop && (
          <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
            <div className="flex items-center gap-2 px-4 pt-3.5 pb-2" style={{ borderBottom: '0.5px solid #F5EEF0' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span className="text-[13px] font-bold text-[#7A5A60]">大便性状</span>
            </div>
            {/* 6项网格 */}
            <div className="grid grid-cols-3 gap-2 p-3">
              {poopItems.map(({ key, label, dot }) => (
                <button key={key} type="button" onClick={() => setPoopType(poopType === key ? null : key)}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-all active:scale-95"
                  style={{
                    borderColor: poopType === key ? '#FF8C42' : '#E5D8DA',
                    background: poopType === key ? '#FFF5EE' : '#fff',
                  }}>
                  <span className="w-[22px] h-[22px] rounded-full" style={{ background: dot }} />
                  <span className="text-[11px] font-medium"
                    style={{ color: poopType === key ? '#C05020' : '#9A8090' }}>{label}</span>
                </button>
              ))}
            </div>
            {/* 颜色 chip 小号 */}
            <div className="flex items-center px-4 py-2.5" style={{ borderTop: '0.5px solid #F5EEF0' }}>
              <span className="text-[12px] text-[#9A8090] mr-3">颜色</span>
              <div className="flex gap-1.5 flex-1 justify-end">
                {colorChips.map(({ key, label, dot }) => (
                  <button key={key} type="button" onClick={() => toggleColor(key)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] transition-all"
                    style={{
                      borderColor: colorSelected.has(key) ? '#F87098' : '#E5D8DA',
                      background: colorSelected.has(key) ? '#FFF0F4' : '#fff',
                      color: colorSelected.has(key) ? '#F87098' : '#7A5A60',
                    }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: dot }} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 备注（可选） */}
        <div className="px-4 pb-1">
          <span className="text-[12px] font-semibold text-[#9A8090]">备注（可选）</span>
        </div>
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="px-4 py-3">
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="其他观察或备注…" rows={2}
              className="w-full text-[13px] text-[#4A3035] resize-none outline-none"
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
