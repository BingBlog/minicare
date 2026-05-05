/**
 * 医疗记录表单页（MP 迁移）
 *
 * 与 Web pages/records/medical/index.tsx 保持 1:1 业务逻辑对齐。
 */
import { View, Text, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { recordsApi } from '@/api'
import type { MedicalRecord } from '@/api/medical'
import { nowDate } from '@/lib/utils'
import { useRecordInit } from '@/lib/useRecordInit'
import { useRecordSubmit } from '@/lib/useRecordSubmit'
import RecordNavBar from '@/components/RecordNavBar'
import ConfirmSheet from '@/components/ConfirmSheet'
import SubmitBar from '@/components/SubmitBar'
import PageLoading from '@/components/PageLoading'
import VisitTypeSection from './VisitTypeSection'
import BasicInfoSection from './BasicInfoSection'
import OCRSection from './OCRSection'
import ResultSection from './ResultSection'
import MedicationsSection, { type Medication } from './MedicationsSection'
import FollowUpSection from './FollowUpSection'
import './index.scss'

export default function MedicalFormPage() {
  // ── 表单状态 ──
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

  // ── 通用初始化 ──
  const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit<MedicalRecord>({
    loadRecord: (fid, rid) => recordsApi.medical.getOne(fid, rid),
    onRecord: (r) => {
      if (r.visit_date) setVisitDate(r.visit_date)
      if (r.visit_type) setVisitType(r.visit_type)
      setHospital(r.hospital ?? '')
      setDoctor(r.doctor ?? '')
      setResultSummary(r.result_summary ?? '')
      setDiagnosis(r.diagnosis ?? '')
      if (r.medications && r.medications.length > 0) {
        setMedications(r.medications.map((m) => ({ name: m.name, dose: m.dose ?? '' })))
      }
      setNote(r.note ?? '')
      if (r.follow_up_date) {
        setFollowUpDate(r.follow_up_date)
        setFollowUpEnabled(true)
      }
    },
  })

  // ── 通用提交/删除 ──
  const { submitting, deleteConfirmOpen, setDeleteConfirmOpen, handleSubmit, handleDelete } = useRecordSubmit()

  // ── 用药操作 ──
  const addMed = () => setMedications((prev) => [...prev, { name: '', dose: '' }])
  const removeMed = (i: number) => setMedications((prev) => prev.filter((_, idx) => idx !== i))
  const updateMed = (i: number, field: keyof Medication, val: string) => {
    setMedications((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: val } : m)))
  }

  // ── Toast 工具（OCRSection 需要） ──
  const showToast = (msg: string) => {
    Taro.showToast({ title: msg, icon: 'none', duration: 1500 })
  }

  // ── 提交 ──
  const onSubmit = () => handleSubmit({
    validate: () => {
      if (!familyId || !babyId) return '请先完成宝宝建档'
      return true
    },
    execute: async () => {
      const validMeds = medications.filter((m) => m.name.trim())
      const noteArr: string[] = []
      if (note) noteArr.push(note)

      const payload = {
        visit_date: visitDate,
        visit_type: visitType || undefined,
        hospital: hospital || undefined,
        doctor: doctor || undefined,
        diagnosis: diagnosis || undefined,
        result_summary: resultSummary || undefined,
        medications: validMeds.length > 0 ? validMeds.map((m) => ({ name: m.name, dose: m.dose || undefined })) : undefined,
        follow_up_date: followUpEnabled && followUpDate ? followUpDate : undefined,
        note: noteArr.join(' / ') || undefined,
      }
      if (isEditMode) {
        await recordsApi.medical.update(familyId, editRecordId, payload)
        return '医疗记录已更新'
      } else {
        await recordsApi.medical.create(familyId, { baby_id: babyId, ...payload })
        return '医疗记录已保存'
      }
    },
  })

  // ── 删除 ──
  const onDelete = () => handleDelete({
    execute: () => recordsApi.medical.remove(familyId, editRecordId),
  })

  // ── Loading ──
  if (loading) {
    return (
      <View className='medical-page'>
        <RecordNavBar title='医疗记录' isEditMode={false} />
        <PageLoading />
      </View>
    )
  }

  return (
    <View className='medical-page'>
      <RecordNavBar
        title='医疗记录'
        isEditMode={isEditMode}
        onRightAction={isEditMode ? () => setDeleteConfirmOpen(true) : undefined}
      />

      {/* ── 表单主体 ── */}
      <View className='medical-body'>
        {/* 检查类型 */}
        <View className='medical-section-label'><Text>检查类型</Text></View>
        <VisitTypeSection value={visitType} onChange={setVisitType} />

        {/* 基本信息 */}
        <View className='medical-section-label'><Text>基本信息</Text></View>
        <BasicInfoSection
          visitDate={visitDate}
          hospital={hospital}
          doctor={doctor}
          onVisitDateChange={setVisitDate}
          onHospitalChange={setHospital}
          onDoctorChange={setDoctor}
        />

        {/* OCR 上传区 */}
        <View className='medical-section-label'><Text>上传检查报告（OCR 自动识别）</Text></View>
        <OCRSection showToast={showToast} />

        {/* 结果与诊断 */}
        <View className='medical-section-label'><Text>结果与诊断</Text></View>
        <ResultSection
          resultSummary={resultSummary}
          diagnosis={diagnosis}
          onResultSummaryChange={setResultSummary}
          onDiagnosisChange={setDiagnosis}
        />

        {/* 用药记录 */}
        <MedicationsSection medications={medications} onAdd={addMed} onRemove={removeMed} onUpdate={updateMed} />

        {/* 下次复查提醒 */}
        <View className='medical-section-label'><Text>下次复查提醒（可选）</Text></View>
        <FollowUpSection
          followUpDate={followUpDate}
          followUpEnabled={followUpEnabled}
          onDateChange={setFollowUpDate}
          onToggle={() => setFollowUpEnabled(!followUpEnabled)}
        />

        {/* 备注 */}
        <View className='medical-section-label'><Text>备注（可选）</Text></View>
        <View className='medical-card'>
          <Textarea
            className='medical-note__input'
            value={note}
            onInput={(e) => setNote(e.detail.value)}
            placeholder='医嘱、注意事项等...'
            maxlength={500}
            autoHeight
          />
        </View>
      </View>

      {/* ── 底部提交栏 ── */}
      <SubmitBar
        submitting={submitting}
        isEditMode={isEditMode}
        onSubmit={onSubmit}
        onDelete={() => setDeleteConfirmOpen(true)}
      />

      {/* ── 删除确认 ── */}
      <ConfirmSheet
        open={deleteConfirmOpen}
        onConfirm={onDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </View>
  )
}
