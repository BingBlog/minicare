/**
 * 医疗记录表单页（MP）— PRD-005 类型化重构（TECH-011 §4.2/4.3）
 *
 * 外壳（共享）：日期/时间/机构/医生 + 照片 + 随访；分型分区按 visit_type 渲染：
 *   vaccine → VaccineSection（联想/剂次/部位/批号/反应）
 *   checkup → CheckupSection（测量同步/里程碑/评估/问答）
 *   sick    → SickSection（症状/主诉）+ 通用诊断
 *   other   → 通用结果与诊断
 * 编辑锁定：编辑态（recordId）不显示类型选择器，visit_type 由记录决定（US-01 场景2）；
 *          新建态保留切换（二次确认清空该类型已填内容）。
 * 语音：voice_* 参数透传 → 类型字段映射预填（voicePrefill 机制沿用）。
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { recordsApi } from '@/api'
import type { MedicalRecord, MedicalVisitType } from '@/api/medical'
import { nowDate, nowTime } from '@/lib/utils'
import { useRecordInit } from '@/lib/useRecordInit'
import { useRecordSubmit } from '@/lib/useRecordSubmit'
import RecordNavBar from '@/components/RecordNavBar'
import ConfirmSheet from '@/components/ConfirmSheet'
import SubmitBar from '@/components/SubmitBar'
import PageLoading from '@/components/PageLoading'
import { useIsIPad } from '@/lib/useIsIPad'
import { VISIT_TYPE_LABELS, VACCINE_SITE_LABELS } from '@/lib/constants'
import VisitTypeSection from './VisitTypeSection'
import BasicInfoSection from './BasicInfoSection'
import PhotoSection from './PhotoSection'
import ResultSection from './ResultSection'
import FollowUpSection from './FollowUpSection'
import VaccineSection, { EMPTY_VACCINE, type VaccineFormState } from './VaccineSection'
import CheckupSection, { EMPTY_CHECKUP, type CheckupFormState } from './CheckupSection'
import SickSection, { EMPTY_SICK, type SickFormState } from './SickSection'
import './index.scss'

const VALID_TYPES = ['checkup', 'sick', 'vaccine', 'other']
const SITE_KEYS = Object.keys(VACCINE_SITE_LABELS).filter((k) => k !== 'unknown')

/** 语音识别产出的类型键（voice_visit_type / voice_type） */
function resolveVoiceType(fields: Record<string, string>): string {
  const t = fields.visit_type ?? fields.type
  return t && VALID_TYPES.includes(t) ? t : ''
}

function fmtVoiceDate(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  if (v === '今天' || v === '今日') return nowDate()
  if (v === '昨天') {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return ''
}

/** 展示换算（服务端存 mm/g，表单用 cm/kg） */
function mmToCm(mm: number | null | undefined): string {
  return mm != null ? String(Number(mm) / 10) : ''
}
function gToKg(g: number | null | undefined): string {
  return g != null ? String(Number(g) / 1000) : ''
}

export default function MedicalFormPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => (isIPad ? `${base} is-ipad` : base)

  // ── 共享字段 ──
  const [visitDate, setVisitDate] = useState(nowDate())
  const [visitTime, setVisitTime] = useState(nowTime())
  const [visitType, setVisitType] = useState<string>('checkup')
  const [hospital, setHospital] = useState('')
  const [doctor, setDoctor] = useState('')
  const [resultSummary, setResultSummary] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [photoIds, setPhotoIds] = useState<string[]>([])
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('')

  // ── 分型字段组 ──
  const [vaccine, setVaccineState] = useState<VaccineFormState>(EMPTY_VACCINE)
  const [checkup, setCheckupState] = useState<CheckupFormState>(EMPTY_CHECKUP)
  const [sick, setSickState] = useState<SickFormState>(EMPTY_SICK)
  const setVaccine = (patch: Partial<VaccineFormState>) => setVaccineState((p) => ({ ...p, ...patch }))
  const setCheckup = (patch: Partial<CheckupFormState>) => setCheckupState((p) => ({ ...p, ...patch }))
  const setSick = (patch: Partial<SickFormState>) => setSickState((p) => ({ ...p, ...patch }))

  /** 语音字段映射（date/hospital/doctor 共享 + 按类型映射专属字段） */
  const applyVoiceFields = (typeKey: string, fields: Record<string, string>) => {
    const d = fmtVoiceDate(fields.date ?? '')
    if (d) setVisitDate(d)
    if (fields.time && /^\d{1,2}:\d{2}$/.test(fields.time)) setVisitTime(fields.time)
    if (fields.hospital) setHospital(fields.hospital)
    if (fields.doctor) setDoctor(fields.doctor)

    if (typeKey === 'vaccine') {
      const patch: Partial<VaccineFormState> = {}
      if (fields.vaccine_name) patch.name = fields.vaccine_name
      if (fields.vaccine_batch) patch.batch = fields.vaccine_batch
      if (fields.vaccine_site && SITE_KEYS.includes(fields.vaccine_site)) patch.site = fields.vaccine_site
      const dose = parseInt(fields.vaccine_dose_seq ?? fields.dose_seq ?? '', 10)
      if (dose > 0) patch.doseSeq = dose
      if (Object.keys(patch).length > 0) setVaccineState((p) => ({ ...p, ...patch }))
    } else if (typeKey === 'checkup') {
      const patch: Partial<CheckupFormState> = {}
      const mm = parseInt(fields.checkup_height_mm ?? '', 10)
      if (mm > 0) patch.heightCm = String(mm / 10)
      const g = parseInt(fields.checkup_weight_g ?? '', 10)
      if (g > 0) patch.weightKg = String(g / 1000)
      const head = parseInt(fields.checkup_head_mm ?? '', 10)
      if (head > 0) patch.headCm = String(head / 10)
      if (fields.checkup_assessment) patch.assessment = fields.checkup_assessment
      if (Object.keys(patch).length > 0) setCheckupState((p) => ({ ...p, ...patch }))
    } else if (typeKey === 'sick' && fields.sick_complaint) {
      setSickState((p) => ({ ...p, complaint: fields.sick_complaint as string }))
    }
  }

  // ── 通用初始化（含 type 参数 + 语音映射）──
  const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit<MedicalRecord>({
    loadRecord: (fid, rid) => recordsApi.medical.getOne(fid, rid),
    parseOptions: (opts) => {
      const voice: Record<string, string> = {}
      for (const [key, value] of Object.entries(opts)) {
        if (key.startsWith('voice_') && value) voice[key.replace('voice_', '')] = value
      }
      const typeParam = opts.type && VALID_TYPES.includes(opts.type) ? (opts.type as string) : ''
      return { type: typeParam, voice, recordId: opts.recordId ?? '' }
    },
    onExtraOptions: (extra) => {
      const { type, voice, recordId } = extra as { type: string; voice: Record<string, string>; recordId: string }
      if (recordId) return // 编辑态：类型/语音均以记录为准
      const voiceType = resolveVoiceType(voice)
      const effectiveType = type || voiceType || 'checkup'
      setVisitType(effectiveType)
      if (Object.keys(voice).length > 0) applyVoiceFields(effectiveType, voice)
    },
    onRecord: (r) => {
      if (r.visit_date) setVisitDate(r.visit_date)
      if (r.visit_time) setVisitTime(r.visit_time)
      // blood/allergy 老数据归一 other；vaccine 无疫苗名 → 编辑时走补全引导（US-10）
      const type = r.visit_type === 'blood' || r.visit_type === 'allergy' ? 'other' : (r.visit_type ?? '')
      if (type && VALID_TYPES.includes(type)) setVisitType(type)
      setHospital(r.hospital ?? '')
      setDoctor(r.doctor ?? '')
      setResultSummary(r.result_summary ?? '')
      setDiagnosis(r.diagnosis ?? '')
      if (r.photo_ids && r.photo_ids.length > 0) setPhotoIds(r.photo_ids)
      if (r.follow_up_date) setFollowUpDate(r.follow_up_date)
      if (r.follow_up_time) setFollowUpTime(r.follow_up_time)

      // 疫苗
      if (r.vaccine_name || r.vaccine_schedule_key || r.vaccine_dose_seq) {
        setVaccineState({
          name: r.vaccine_name ?? '',
          scheduleKey: r.vaccine_schedule_key ?? '',
          doseSeq: r.vaccine_dose_seq ?? 1,
          site: r.vaccine_site ?? '',
          batch: r.vaccine_batch ?? '',
          reactions: Array.isArray(r.vaccine_reactions) ? (r.vaccine_reactions as string[]) : [],
          reactionNote: r.vaccine_reaction_note ?? '',
        })
      }
      // 儿保
      if (
        r.checkup_height_mm != null || r.checkup_weight_g != null || r.checkup_head_mm != null ||
        r.checkup_assessment || Array.isArray(r.checkup_milestones) || Array.isArray(r.checkup_qa)
      ) {
        const milestones: Record<string, string> = {}
        if (Array.isArray(r.checkup_milestones)) {
          for (const item of r.checkup_milestones) {
            if (item?.dim && item?.status) milestones[item.dim] = item.status
          }
        }
        setCheckupState({
          heightCm: mmToCm(r.checkup_height_mm),
          weightKg: gToKg(r.checkup_weight_g),
          headCm: mmToCm(r.checkup_head_mm),
          growthSync: r.checkup_growth_sync !== 'skipped',
          milestones,
          assessment: r.checkup_assessment ?? '',
          qa: Array.isArray(r.checkup_qa)
            ? r.checkup_qa.map((item) => ({ question: item?.question ?? '', answer: item?.answer ?? '' }))
            : [],
        })
      }
      // 就诊
      if (r.sick_complaint || Array.isArray(r.sick_symptom_flags)) {
        setSickState({
          complaint: r.sick_complaint ?? '',
          symptomFlags: Array.isArray(r.sick_symptom_flags) ? (r.sick_symptom_flags as string[]) : [],
        })
      }
    },
  })

  // ── 类型切换（新建态）：有已填内容时二次确认 ──
  const typedFilled = (t: string): boolean => {
    if (t === 'vaccine') {
      return vaccine.name !== '' || vaccine.batch !== '' || vaccine.site !== '' || vaccine.reactions.length > 0
    }
    if (t === 'checkup') {
      return (
        checkup.heightCm !== '' || checkup.weightKg !== '' || checkup.headCm !== '' ||
        checkup.assessment !== '' || checkup.qa.some((q) => q.question !== '') ||
        Object.values(checkup.milestones).some((s) => s === 'ok' || s === 'watch')
      )
    }
    if (t === 'sick') return sick.complaint !== '' || sick.symptomFlags.length > 0
    return false
  }
  const resetTyped = () => {
    setVaccineState(EMPTY_VACCINE)
    setCheckupState(EMPTY_CHECKUP)
    setSickState(EMPTY_SICK)
  }
  const onTypeChange = (next: string) => {
    if (next === visitType) return
    if (typedFilled(visitType)) {
      Taro.showModal({
        title: '切换类型',
        content: '切换后当前类型已填内容将被清空，是否继续？',
        confirmText: '继续',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            resetTyped()
            setVisitType(next)
          }
        },
      })
      return
    }
    setVisitType(next)
  }

  // ── 单位换算（提交时 cm/kg → mm/g）──
  const toMm = (cm: string): number | undefined => {
    const n = parseFloat(cm)
    return Number.isFinite(n) && n > 0 ? Math.round(n * 10) : undefined
  }
  const toG = (kg: string): number | undefined => {
    const n = parseFloat(kg)
    return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : undefined
  }

  // ── 提交 ──
  const { submitting, deleteConfirmOpen, setDeleteConfirmOpen, handleSubmit, handleDelete } = useRecordSubmit()

  const onSubmit = () =>
    handleSubmit({
      validate: () => {
        if (!familyId || !babyId) return '请先完成宝宝建档'
        if (visitType === 'vaccine' && !vaccine.name.trim()) return '请填写疫苗名称'
        return true
      },
      execute: async () => {
        const payload: Record<string, unknown> = {
          visit_date: visitDate,
          visit_time: visitTime || undefined,
          visit_type: visitType,
          hospital: hospital || undefined,
          doctor: doctor || undefined,
          photo_ids: photoIds.length > 0 ? photoIds : undefined,
          follow_up_date: followUpDate || undefined,
          follow_up_time: followUpDate && followUpTime ? followUpTime : undefined,
        }
        if (visitType === 'vaccine') {
          payload.vaccine_name = vaccine.name.trim()
          payload.vaccine_schedule_key = vaccine.scheduleKey || null
          payload.vaccine_dose_seq = vaccine.doseSeq
          payload.vaccine_site = vaccine.site || undefined
          payload.vaccine_batch = vaccine.batch.trim() || undefined
          payload.vaccine_reactions = vaccine.reactions.length > 0 ? vaccine.reactions : undefined
          payload.vaccine_reaction_note = vaccine.reactionNote.trim() || undefined
        } else if (visitType === 'checkup') {
          const h = toMm(checkup.heightCm)
          const w = toG(checkup.weightKg)
          const hd = toMm(checkup.headCm)
          if (h != null) payload.checkup_height_mm = h
          if (w != null) payload.checkup_weight_g = w
          if (hd != null) payload.checkup_head_mm = hd
          const milestones = Object.entries(checkup.milestones)
            .filter(([, status]) => status === 'ok' || status === 'watch')
            .map(([dim, status]) => ({ dim, status }))
          if (milestones.length > 0) payload.checkup_milestones = milestones
          const qa = checkup.qa
            .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() || undefined }))
            .filter((item) => item.question !== '')
          if (qa.length > 0) payload.checkup_qa = qa
          if (checkup.assessment.trim()) payload.checkup_assessment = checkup.assessment.trim()
          // 测量同步开关（D2 默认覆盖）：关 → 显式 skipped，不写 growth
          if ((h != null || w != null || hd != null) && !checkup.growthSync) {
            payload.checkup_growth_sync = 'skipped'
          }
        } else if (visitType === 'sick') {
          if (sick.complaint.trim()) payload.sick_complaint = sick.complaint.trim()
          if (sick.symptomFlags.length > 0) payload.sick_symptom_flags = sick.symptomFlags
          // 诊断/医生处理建议走通用 result_summary/diagnosis
          if (resultSummary.trim()) payload.result_summary = resultSummary.trim()
          if (diagnosis.trim()) payload.diagnosis = diagnosis.trim()
        } else {
          // other：通用结果与诊断
          payload.result_summary = resultSummary.trim() || undefined
          payload.diagnosis = diagnosis.trim() || undefined
        }

        if (isEditMode) {
          await recordsApi.medical.update(familyId, editRecordId, payload)
          return '医疗记录已更新'
        }
        await recordsApi.medical.create(familyId, { baby_id: babyId, ...payload })
        return '医疗记录已保存'
      },
    })

  const onDelete = () =>
    handleDelete({
      execute: () => recordsApi.medical.remove(familyId, editRecordId),
    })

  const showToast = (msg: string) => {
    Taro.showToast({ title: msg, icon: 'none', duration: 1500 })
  }

  // ── Loading ──
  if (loading) {
    return (
      <View className={cls('medical-page')}>
        <RecordNavBar title='医疗记录' isEditMode={false} />
        <PageLoading />
      </View>
    )
  }

  const photoLabel = visitType === 'vaccine' ? '上传照片（可选，如接种记录）' : '上传检查报告/病历（可选）'
  const showResultBlock = visitType === 'sick' || visitType === 'other'

  return (
    <View className={cls('medical-page')}>
      <RecordNavBar
        title='医疗记录'
        isEditMode={isEditMode}
        onRightAction={isEditMode ? () => setDeleteConfirmOpen(true) : undefined}
      />

      <View className='medical-body'>
        {/* 记录类型：编辑态锁定只读，新建态可切换 */}
        {isEditMode ? (
          <View className='medical-type-lock'>
            <Text className='medical-type-lock__label'>记录类型</Text>
            <Text className='medical-type-lock__value'>{VISIT_TYPE_LABELS[visitType] ?? visitType}</Text>
          </View>
        ) : (
          <>
            <View className='medical-section-label'><Text>记录类型</Text></View>
            <VisitTypeSection value={visitType} onChange={onTypeChange} />
          </>
        )}

        {/* 基本信息（按类型换文案） */}
        <View className='medical-section-label'><Text>基本信息</Text></View>
        <BasicInfoSection
          noun={visitType as MedicalVisitType}
          visitDate={visitDate}
          visitTime={visitTime}
          hospital={hospital}
          doctor={doctor}
          onVisitDateChange={setVisitDate}
          onVisitTimeChange={setVisitTime}
          onHospitalChange={setHospital}
          onDoctorChange={setDoctor}
        />

        {/* 分型专属区块 */}
        {visitType === 'vaccine' ? (
          <>
            <View className='medical-section-label'><Text>疫苗信息</Text></View>
            <VaccineSection familyId={familyId} babyId={babyId} value={vaccine} onChange={setVaccine} />
          </>
        ) : null}
        {visitType === 'checkup' ? <CheckupSection value={checkup} onChange={setCheckup} /> : null}
        {visitType === 'sick' ? (
          <>
            <View className='medical-section-label'><Text>就诊信息</Text></View>
            <SickSection value={sick} onChange={setSick} />
          </>
        ) : null}

        {/* 结果与诊断：sick/other 用通用区块；checkup 评估在 CheckupSection 内；vaccine 不适用 */}
        {showResultBlock ? (
          <>
            <View className='medical-section-label'><Text>结果与诊断</Text></View>
            <ResultSection
              resultSummary={resultSummary}
              diagnosis={diagnosis}
              onResultSummaryChange={setResultSummary}
              onDiagnosisChange={setDiagnosis}
            />
          </>
        ) : null}

        {/* 图片上传（可选） */}
        <View className='medical-section-label'><Text>{photoLabel}</Text></View>
        <PhotoSection babyId={babyId} value={photoIds} onChange={setPhotoIds} showToast={showToast} />

        {/* 随访（疫苗无复查语义不展示） */}
        {visitType !== 'vaccine' ? (
          <>
            <View className='medical-section-label'><Text>下次复查提醒（可选）</Text></View>
            <FollowUpSection
              followUpDate={followUpDate}
              followUpTime={followUpTime}
              onDateChange={setFollowUpDate}
              onTimeChange={setFollowUpTime}
            />
          </>
        ) : null}
      </View>

      <SubmitBar
        submitting={submitting}
        isEditMode={isEditMode}
        onSubmit={onSubmit}
        onDelete={() => setDeleteConfirmOpen(true)}
      />

      <ConfirmSheet
        open={deleteConfirmOpen}
        onConfirm={onDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </View>
  )
}
