/**
 * 生长记录表单页
 * UI 对齐 ui-draft/form-growth.html
 * API: POST /api/family/:familyId/records/growth
 * 字段：baby_id, record_date(DATE), weight_g(int,克), height_mm(int,毫米), head_mm(int,毫米), note
 * 注意：每日唯一索引 uk_growth_baby_date
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/lib/store'
import { recordsApi } from '@/api'
import DatePicker from '@/components/DatePicker'

const IconArrowLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

function nowDate(): string {
  return new Date().toISOString().split('T')[0]
}

const orgOptions = ['儿保门诊', '家中自测', '社区卫生', '其他']

export default function GrowthFormPage() {
  const navigate = useNavigate()
  const { currentFamily, currentBaby } = useAppStore()

  const [recordDate, setRecordDate] = useState(nowDate())
  const [height, setHeight] = useState('')   // cm
  const [weight, setWeight] = useState('')   // kg
  const [head, setHead] = useState('')       // cm
  const [activeCard, setActiveCard] = useState<'height' | 'weight' | 'head' | null>(null)
  const [orgChip, setOrgChip] = useState<string | null>('儿保门诊')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2200) }

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) { showToast('请先完成宝宝建档'); return }
    if (!height && !weight && !head) { showToast('请至少填写一项测量数据'); return }
    setSubmitting(true)
    try {
      const heightMm = height ? Math.round(parseFloat(height) * 10) : undefined
      const weightG  = weight ? Math.round(parseFloat(weight) * 1000) : undefined
      const headMm   = head   ? Math.round(parseFloat(head) * 10) : undefined
      const noteArr: string[] = []
      if (orgChip) noteArr.push('机构：' + orgChip)
      if (note) noteArr.push(note)
      await recordsApi.growth.create(currentFamily.id, {
        baby_id: currentBaby.id,
        record_date: recordDate,
        height_mm: heightMm,
        weight_g: weightG,
        head_mm: headMm,
        note: noteArr.join(' / ') || undefined,
      })
      showToast('✓ 生长记录已保存')
      setTimeout(() => navigate('/'), 1400)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败（同日只可记录一次）')
    } finally {
      setSubmitting(false)
    }
  }

  // 测量卡片配置
  const measureCards = [
    { key: 'height' as const, label: '身高/身长', unit: 'cm', color: '#9B8ED8', iconSvg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#9B8ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <path d="M12 22V2M5 7l7-5 7 5M5 17l7 5 7-5"/>
      </svg>
    ), val: height },
    { key: 'weight' as const, label: '体重', unit: 'kg', color: '#F0B8C8', iconSvg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <circle cx="12" cy="8" r="3"/><path d="M3 21h18l-2-9H5z"/>
      </svg>
    ), val: weight },
    { key: 'head' as const,   label: '头围', unit: 'cm', color: '#B8D8C8', iconSvg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#B8D8C8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <circle cx="12" cy="12" r="10"/>
      </svg>
    ), val: head },
  ]

  const setterMap: Record<string, (v: string) => void> = {
    height: setHeight, weight: setWeight, head: setHead
  }

  return (
    <div className="min-h-screen" style={{ background: '#FAF5F6' }}>
      {/* 导航栏 */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 bg-white sticky top-0 z-20"
        style={{ boxShadow: '0 1px 0 #F5EEF0' }}>
        <button type="button" onClick={() => navigate(-1)} className="text-[#7A5A60] p-1 -ml-1">
          <IconArrowLeft />
        </button>
        <span className="text-[17px] font-bold text-[#4A3035]">生长记录</span>
        <div className="w-8" />
      </div>

      <div className="pb-32">
        {/* 本次测量数据 - 卡片预览 */}
        <div className="px-4 pt-3.5 pb-2">
          <span className="text-[12px] font-semibold text-[#9A8090]">本次测量数据</span>
        </div>
        <div className="grid grid-cols-3 gap-2.5 px-4 mb-3">
          {measureCards.map(({ key, label, unit, color, iconSvg, val }) => (
            <button key={key} type="button" onClick={() => setActiveCard(activeCard === key ? null : key)}
              className="flex flex-col items-center py-3.5 px-2 rounded-2xl border text-center transition-all"
              style={{
                borderColor: activeCard === key ? color : 'transparent',
                background: activeCard === key ? color + '18' : '#fff',
                boxShadow: '0 1px 6px rgba(200,100,120,0.08)',
              }}>
              <div className="flex items-center justify-center mb-1.5 h-7">{iconSvg}</div>
              <div className="text-[22px] font-extrabold text-[#4A3035] leading-none">{val || '—'}</div>
              <div className="text-[12px] font-medium text-[#9A8090] mt-0.5">{unit}</div>
              <div className="text-[11px] mt-1" style={{ color: activeCard === key ? color : '#9A8090', fontWeight: activeCard === key ? 600 : 400 }}>{label}</div>
            </button>
          ))}
        </div>

        {/* 填写数值 */}
        <div className="px-4 pb-1">
          <span className="text-[12px] font-semibold text-[#9A8090]">填写数值</span>
        </div>
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          {[
            { key: 'height' as const, label: '身高', unit: 'cm', val: height, placeholder: '如 68.0' },
            { key: 'weight' as const, label: '体重', unit: 'kg', val: weight, placeholder: '如 7.5' },
            { key: 'head' as const,   label: '头围', unit: 'cm', val: head,   placeholder: '如 43.0' },
          ].map(({ key, label, unit, val, placeholder }, idx) => (
            <div key={key} className="flex items-center px-4 py-3"
              style={{ borderBottom: idx < 2 ? '0.5px solid #F5EEF0' : 'none' }}>
              <span className="text-[14px] text-[#7A5A60] flex-1">{label}</span>
              <input
                type="text"
                inputMode="decimal"
                value={val}
                onChange={(e) => { setterMap[key](e.target.value.replace(/[^0-9.]/g, '')); setActiveCard(key) }}
                onBlur={(e) => {
                  // 失焦时保留一位小数
                  const n = parseFloat(e.target.value)
                  if (!isNaN(n)) setterMap[key](n.toFixed(1))
                }}
                placeholder={placeholder}
                className="w-20 text-right text-[14px] font-semibold text-[#4A3035] bg-transparent outline-none" />
              <span className="text-[13px] text-[#9A8090] ml-1 w-6">{unit}</span>
            </div>
          ))}
          <div className="px-4 py-3" style={{ borderTop: '0.5px solid #F5EEF0' }}>
            <DatePicker value={recordDate} onChange={setRecordDate} label="测量日期" max={nowDate()} />
          </div>
        </div>

        {/* 测量机构（可选） */}
        <div className="px-4 pb-1">
          <span className="text-[12px] font-semibold text-[#9A8090]">测量机构（可选）</span>
        </div>
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {orgOptions.map(org => (
              <button key={org} type="button" onClick={() => setOrgChip(orgChip === org ? null : org)}
                className="px-3 py-1.5 rounded-full border text-[13px] font-semibold transition-all"
                style={{
                  borderColor: orgChip === org ? '#F87098' : '#E5D8DA',
                  background: orgChip === org ? '#FFF0F4' : '#fff',
                  color: orgChip === org ? '#F87098' : '#7A5A60',
                }}>
                {org}
              </button>
            ))}
          </div>
        </div>

        {/* 上传测量单（可选） */}
        <div className="px-4 pb-1">
          <span className="text-[12px] font-semibold text-[#9A8090]">上传测量单（可选）</span>
        </div>
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <button type="button"
            onClick={() => showToast('拍照上传（功能开发中）')}
            className="flex items-center gap-3 px-4 py-3.5 w-full text-left">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center border-2 border-dashed flex-shrink-0"
              style={{ borderColor: '#F0B8C8', background: '#FFF0F4' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 24, height: 24 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div>
              <div className="text-[14px] font-semibold text-[#7A5A60]">拍照或上传测量报告</div>
              <div className="text-[12px] text-[#9A8090] mt-0.5">JPG / PNG，与结构化数据一并保存</div>
            </div>
          </button>
        </div>

        {/* 备注 */}
        <div className="px-4 pb-1">
          <span className="text-[12px] font-semibold text-[#9A8090]">备注（可选）</span>
        </div>
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="px-4 py-3">
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="测量机构、备注等…" rows={2}
              className="w-full text-[13px] text-[#4A3035] resize-none outline-none"
              style={{ background: 'transparent' }} />
          </div>
        </div>

        <div className="mx-4 text-[11px] text-[#9A8090] text-center">同一天只能记录一次，如已有记录将覆盖</div>
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white px-5 pt-3 pb-8" style={{ boxShadow: '0 -1px 0 #F5EEF0' }}>
        <button type="button" onClick={handleSubmit} disabled={submitting}
          className="w-full py-4 rounded-full text-white text-[16px] font-bold"
          style={{ background: submitting ? '#DDCAD0' : '#9B8ED8' }}>
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
