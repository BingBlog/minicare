/**
 * 医疗记录表单页
 * UI 对齐 ui-draft/form-medical.html
 * API: POST /api/family/:familyId/records/medical
 * 字段：baby_id, visit_date, hospital, doctor, diagnosis, result_summary, medications:[{name,dose}], note, follow_up_date
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
const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)
const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
)
const IconCamera = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)
const IconBell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)
const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)
const IconFileText = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
)

function nowDate(): string {
  return new Date().toISOString().split('T')[0]
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-5 pt-3.5 pb-1" style={{ fontSize: 12, fontWeight: 600, color: '#9A8090' }}>
      {label}
    </div>
  )
}

function FormSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
      {children}
    </div>
  )
}

function FormRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className="flex items-center px-4 py-3" style={{ borderBottom: last ? 'none' : '0.5px solid #F5EEF0' }}>
      <span className="text-[13px] text-[#7A5A60] flex-none w-20">{label}</span>
      <div className="flex-1 flex justify-end items-center">{children}</div>
    </div>
  )
}

interface Medication { name: string; dose: string }

const visitTypeOptions = [
  { key: 'checkup',    label: '儿保检查',   color: '#F0B8C8' },
  { key: 'allergy',   label: '过敏原检测', color: '#F0A0B0' },
  { key: 'sick',      label: '就诊记录',   color: '#C8A8D8' },
  { key: 'vaccine',   label: '疫苗接种',   color: '#88C8A0' },
  { key: 'blood',     label: '血液检查',   color: '#F87098' },
  { key: 'other',     label: '其他检查',   color: '#B09A9D' },
]

// OCR 模拟结果
const mockOcrResult = [
  { label: '检查项目', value: '儿保 4 月龄' },
  { label: '身高',     value: '68.0 cm' },
  { label: '体重',     value: '7.5 kg' },
  { label: '结论',     value: '发育正常' },
]

export default function MedicalFormPage() {
  const navigate = useNavigate()
  const { currentFamily, currentBaby } = useAppStore()

  const [visitDate, setVisitDate] = useState(nowDate())
  const [visitType, setVisitType] = useState<string>('checkup')
  const [hospital, setHospital] = useState('')
  const [doctor, setDoctor] = useState('')
  const [resultSummary, setResultSummary] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [medications, setMedications] = useState<Medication[]>([])
  const [note, setNote] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpEnabled, setFollowUpEnabled] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrResult, setOcrResult] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg); setTimeout(() => setToast(''), 2200)
  }

  const addMed = () => setMedications((prev) => [...prev, { name: '', dose: '' }])
  const removeMed = (i: number) => setMedications((prev) => prev.filter((_, idx) => idx !== i))
  const updateMed = (i: number, field: keyof Medication, val: string) => {
    setMedications((prev) => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m))
  }

  const handleOCR = () => {
    setOcrLoading(true)
    showToast('正在识别中…')
    setTimeout(() => {
      setOcrLoading(false)
      setOcrResult(true)
    }, 1200)
  }

  const confirmOCR = () => {
    setOcrResult(false)
    showToast('✓ 识别内容已填入')
  }

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) { showToast('请先完成宝宝建档'); return }
    setSubmitting(true)
    try {
      const validMeds = medications.filter((m) => m.name.trim())
      const noteArr: string[] = []
      if (resultSummary) noteArr.push('摘要：' + resultSummary)
      if (note) noteArr.push(note)
      await recordsApi.medical.create(currentFamily.id, {
        baby_id: currentBaby.id,
        visit_date: visitDate,
        hospital: hospital || undefined,
        diagnosis: diagnosis || undefined,
        medications: validMeds.length > 0 ? validMeds.map(m => ({ name: m.name, dose: m.dose || undefined })) : undefined,
        note: noteArr.join(' / ') || undefined,
      })
      showToast('✓ 医疗记录已保存')
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
        <span className="text-[17px] font-bold text-[#4A3035]">医疗记录</span>
        <div className="w-8" />
      </div>

      <div className="pb-32">

        {/* ── 检查类型 ── */}
        <SectionLabel label="检查类型" />
        <FormSection>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: '8px 12px 14px' }}>
            {visitTypeOptions.map(({ key, label, color }) => (
              <button
                key={key}
                type="button"
                onClick={() => setVisitType(key)}
                className="flex items-center gap-2.5 rounded-xl transition-all"
                style={{
                  padding: '11px 12px',
                  border: `1.5px solid ${visitType === key ? '#F87098' : '#EDE0E3'}`,
                  background: visitType === key ? '#FFF5F8' : '#fff',
                }}
              >
                {/* 图标区域 */}
                <div className="flex items-center justify-center rounded-lg flex-shrink-0"
                  style={{ width: 28, height: 28, background: `${color}22` }}>
                  <span style={{ fontSize: 14, color }}>{
                    key === 'checkup' ? '👶' :
                    key === 'allergy' ? '🔬' :
                    key === 'sick'    ? '🩺' :
                    key === 'vaccine' ? '💉' :
                    key === 'blood'   ? '🩸' : '📋'
                  }</span>
                </div>
                <span className="text-[13px] font-semibold"
                  style={{ color: visitType === key ? '#F87098' : '#4A3035' }}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </FormSection>

        {/* ── 基本信息 ── */}
        <SectionLabel label="基本信息" />
        <FormSection>
          <FormRow label="检查日期">
            <DatePicker value={visitDate} onChange={setVisitDate} max={nowDate()} label="" />
          </FormRow>
          <FormRow label="就诊机构">
            <input
              type="text"
              value={hospital}
              onChange={(e) => setHospital(e.target.value)}
              placeholder="医院/科室名称"
              className="text-[13px] text-[#4A3035] bg-transparent outline-none text-right w-full"
            />
          </FormRow>
          <FormRow label="主诊医生" last>
            <input
              type="text"
              value={doctor}
              onChange={(e) => setDoctor(e.target.value)}
              placeholder="可选"
              className="text-[13px] text-[#4A3035] bg-transparent outline-none text-right w-full"
            />
          </FormRow>
        </FormSection>

        {/* ── OCR 上传区 ── */}
        <SectionLabel label="上传检查报告（OCR 自动识别）" />
        {!ocrResult ? (
          <button
            type="button"
            onClick={handleOCR}
            disabled={ocrLoading}
            className="mx-4 mb-3 w-[calc(100%-32px)] flex flex-col items-center gap-2 rounded-2xl"
            style={{
              background: '#FFF5F8',
              border: '1.5px dashed #F0B8C8',
              padding: '20px 16px',
            }}
          >
            <div style={{ color: '#F87098', opacity: ocrLoading ? 0.5 : 1 }}>
              <IconCamera />
            </div>
            <div className="text-[14px] font-bold text-[#F87098]">拍照或上传病历/报告</div>
            <div className="text-[12px] text-[#9A8090] text-center leading-relaxed">
              支持 OCR 自动提取结构化结果<br />原图同时留档保存
            </div>
            <div
              className="text-[13px] font-semibold text-white rounded-lg px-5 py-2"
              style={{ background: ocrLoading ? '#F9A8C0' : '#F87098', boxShadow: '0 3px 10px rgba(248,112,152,.3)' }}
            >
              {ocrLoading ? '识别中…' : '选择图片'}
            </div>
          </button>
        ) : (
          /* OCR 识别结果 */
          <div className="mx-4 mb-3 rounded-2xl overflow-hidden"
            style={{ background: '#FFF5F8', border: '1.5px solid #F0B8C8', padding: '14px 16px' }}>
            <div className="flex items-center gap-1.5 mb-3 text-[13px] font-bold text-[#F87098]">
              <IconSearch />
              OCR 识别结果，请确认：
            </div>
            {mockOcrResult.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2"
                style={{ borderBottom: '0.5px solid #F5EEF0' }}>
                <span className="text-[12px] text-[#9A8090]">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[#4A3035]">{value}</span>
                  <span className="text-[11px] text-[#F87098] font-medium">修改</span>
                </div>
              </div>
            ))}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => setOcrResult(false)}
                className="flex-1 py-2 rounded-xl text-[13px] font-semibold text-[#9A8090]"
                style={{ border: '1px solid #E5D8DA', background: '#fff' }}
              >
                重新上传
              </button>
              <button
                type="button"
                onClick={confirmOCR}
                className="flex-1 py-2 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: '#F87098' }}
              >
                确认信息
              </button>
            </div>
          </div>
        )}

        {/* ── 结果与诊断 ── */}
        <SectionLabel label="结果与诊断" />
        <FormSection>
          <FormRow label="结果摘要">
            <input
              type="text"
              value={resultSummary}
              onChange={(e) => setResultSummary(e.target.value)}
              placeholder="检查结论"
              className="text-[13px] text-[#4A3035] bg-transparent outline-none text-right w-full"
            />
          </FormRow>
          <div className="px-4 pt-3 pb-3">
            <div className="text-[13px] text-[#7A5A60] mb-2">诊断结论</div>
            <textarea
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="医生建议、注意事项…"
              rows={3}
              className="w-full text-[13px] text-[#4A3035] resize-none outline-none leading-relaxed"
              style={{ background: 'transparent' }}
            />
          </div>
        </FormSection>

        {/* ── 用药记录 ── */}
        <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2"
            style={{ borderBottom: '0.5px solid #F5EEF0' }}>
            <span className="text-[13px] font-bold text-[#7A5A60]">用药记录（可选）</span>
            <button
              type="button"
              onClick={addMed}
              className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg"
              style={{ background: '#FFF5F8', color: '#F87098' }}
            >
              <IconPlus />
              添加
            </button>
          </div>
          {medications.length === 0 ? (
            <div className="px-4 py-4 text-[13px] text-[#9A8090] text-center">点击「添加」记录用药信息</div>
          ) : (
            medications.map((med, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: i < medications.length - 1 ? '0.5px solid #F5EEF0' : 'none' }}>
                <input
                  type="text"
                  value={med.name}
                  onChange={(e) => updateMed(i, 'name', e.target.value)}
                  placeholder="药品名称"
                  className="flex-1 text-[13px] text-[#4A3035] outline-none"
                  style={{ background: 'transparent' }}
                />
                <input
                  type="text"
                  value={med.dose}
                  onChange={(e) => updateMed(i, 'dose', e.target.value)}
                  placeholder="剂量（如 5ml）"
                  className="w-24 text-[13px] text-[#4A3035] outline-none text-right"
                  style={{ background: 'transparent' }}
                />
                <button type="button" onClick={() => removeMed(i)} className="text-[#F05060] flex-shrink-0 ml-1">
                  <IconTrash />
                </button>
              </div>
            ))
          )}
        </div>

        {/* ── 附件照片 ── */}
        <SectionLabel label="附件照片" />
        <FormSection>
          <div className="flex gap-2.5 px-4 py-3 flex-wrap">
            {/* 已上传缩略图示例 */}
            <div className="flex items-center justify-center rounded-xl overflow-hidden"
              style={{ width: 70, height: 70, background: '#FFF5F8', border: '1.5px dashed #F0B8C8' }}>
              <div style={{ color: '#F0B8C8' }}><IconFileText /></div>
            </div>
            {/* 添加按钮 */}
            <button
              type="button"
              onClick={() => showToast('添加更多照片')}
              className="flex items-center justify-center rounded-xl text-[26px] font-light"
              style={{
                width: 70, height: 70,
                background: '#FFF5F8', border: '1.5px dashed #F0B8C8',
                color: '#F0B8C8',
              }}
            >
              ＋
            </button>
          </div>
        </FormSection>

        {/* ── 下次复查提醒 ── */}
        <SectionLabel label="下次复查提醒（可选）" />
        <div className="mx-4 mb-3 rounded-2xl overflow-hidden"
          style={{
            background: '#FFFBEB',
            border: '1.5px solid #FCD34D',
            padding: '14px 16px',
          }}
        >
          <div className="flex items-center gap-1.5 mb-3">
            <IconBell />
            <span className="text-[13px] font-bold" style={{ color: '#B45309' }}>设置复查日期提醒</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[#4A3035] flex-1">复查日期</span>
            <div className="rounded-lg px-2 py-1" style={{ border: '1px solid #E5D8DA', background: '#fff' }}>
              <DatePicker value={followUpDate || nowDate()} onChange={setFollowUpDate} min={nowDate()} label="" />
            </div>
            {/* Toggle */}
            <button
              type="button"
              onClick={() => setFollowUpEnabled(!followUpEnabled)}
              className="flex-shrink-0 rounded-full transition-all"
              style={{
                width: 44,
                height: 24,
                background: followUpEnabled ? '#F87098' : '#E5D8DA',
                position: 'relative',
                border: 'none',
              }}
            >
              <div
                className="absolute top-0.5 rounded-full bg-white transition-all"
                style={{
                  width: 20, height: 20,
                  left: followUpEnabled ? 22 : 2,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                }}
              />
            </button>
          </div>
          <div className="text-[11px] mt-2" style={{ color: '#9A8090' }}>届时将发送本地通知（需开启通知权限）</div>
        </div>

        {/* ── 备注 ── */}
        <SectionLabel label="备注（可选）" />
        <FormSection>
          <div className="px-4 py-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="医嘱、注意事项等…"
              rows={2}
              className="w-full text-[13px] text-[#4A3035] resize-none outline-none"
              style={{ background: 'transparent' }}
            />
          </div>
        </FormSection>
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white px-5 pt-3 pb-8"
        style={{ boxShadow: '0 -1px 0 #F5EEF0' }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 rounded-full text-white text-[16px] font-bold"
          style={{ background: submitting ? '#F9A8C0' : '#F87098' }}
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
