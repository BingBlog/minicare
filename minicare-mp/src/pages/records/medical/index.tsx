/**
 * 医疗记录表单页（MP 迁移）
 *
 * 与 Web pages/records/medical/index.tsx 保持 1:1 业务逻辑对齐。
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { recordsApi } from '@/api'
import type { MedicalRecord } from '@/api/medical'
import { nowDate, nowTime } from '@/lib/utils'
import { useRecordInit } from '@/lib/useRecordInit'
import { useRecordSubmit } from '@/lib/useRecordSubmit'
import RecordNavBar from '@/components/RecordNavBar'
import ConfirmSheet from '@/components/ConfirmSheet'
import SubmitBar from '@/components/SubmitBar'
import PageLoading from '@/components/PageLoading'
import VisitTypeSection from './VisitTypeSection'
import BasicInfoSection from './BasicInfoSection'
import PhotoSection from './PhotoSection'
import ResultSection from './ResultSection'
import FollowUpSection from './FollowUpSection'
import { useIsIPad } from '@/lib/useIsIPad'
import './index.scss'

export default function MedicalFormPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => isIPad ? `${base} is-ipad` : base
  // ── 表单状态 ──
  const [visitDate, setVisitDate] = useState(nowDate())
  // 检查时间默认 = 当前填写时间（HH:mm），随记录一起提交
  const [visitTime, setVisitTime] = useState(nowTime())
  const [visitType, setVisitType] = useState<string>('checkup')
  const [hospital, setHospital] = useState('')
  const [doctor, setDoctor] = useState('')
  const [resultSummary, setResultSummary] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [photoIds, setPhotoIds] = useState<string[]>([])
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('')

  // ── 通用初始化 ──
  const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit<MedicalRecord>({
    loadRecord: (fid, rid) => recordsApi.medical.getOne(fid, rid),
    onRecord: (r) => {
      if (r.visit_date) setVisitDate(r.visit_date)
      if (r.visit_time) setVisitTime(r.visit_time)
      // blood/allergy 已从选项精简，老数据编辑时归一为 other（复用其他检查）
      if (r.visit_type) setVisitType(r.visit_type === 'blood' || r.visit_type === 'allergy' ? 'other' : r.visit_type)
      setHospital(r.hospital ?? '')
      setDoctor(r.doctor ?? '')
      setResultSummary(r.result_summary ?? '')
      setDiagnosis(r.diagnosis ?? '')
      if (r.photo_ids && r.photo_ids.length > 0) {
        setPhotoIds(r.photo_ids)
      }
      if (r.follow_up_date) setFollowUpDate(r.follow_up_date)
      if (r.follow_up_time) setFollowUpTime(r.follow_up_time)
    },
  })

  // ── 通用提交/删除 ──
  const { submitting, deleteConfirmOpen, setDeleteConfirmOpen, handleSubmit, handleDelete } = useRecordSubmit()

  // ── Toast 工具（PhotoSection 需要） ──
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
      const payload = {
        visit_date: visitDate,
        visit_time: visitTime || undefined,
        visit_type: visitType || undefined,
        hospital: hospital || undefined,
        doctor: doctor || undefined,
        diagnosis: diagnosis || undefined,
        result_summary: resultSummary || undefined,
        photo_ids: photoIds.length > 0 ? photoIds : undefined,
        follow_up_date: followUpDate || undefined,
        follow_up_time: followUpDate && followUpTime ? followUpTime : undefined,
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
      <View className={cls('medical-page')}>
        <RecordNavBar title='医疗记录' isEditMode={false} />
        <PageLoading />
      </View>
    )
  }

  return (
    <View className={cls('medical-page')}>
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
          visitTime={visitTime}
          hospital={hospital}
          doctor={doctor}
          onVisitDateChange={setVisitDate}
          onVisitTimeChange={setVisitTime}
          onHospitalChange={setHospital}
          onDoctorChange={setDoctor}
        />

        {/* 图片上传区 */}
        <View className='medical-section-label'><Text>上传检查报告/病历（可选）</Text></View>
        <PhotoSection babyId={babyId} value={photoIds} onChange={setPhotoIds} showToast={showToast} />

        {/* 结果与诊断 */}
        <View className='medical-section-label'><Text>结果与诊断</Text></View>
        <ResultSection
          resultSummary={resultSummary}
          diagnosis={diagnosis}
          onResultSummaryChange={setResultSummary}
          onDiagnosisChange={setDiagnosis}
        />

        {/* 下次复查提醒 */}
        <View className='medical-section-label'><Text>下次复查提醒（可选）</Text></View>
        <FollowUpSection
          followUpDate={followUpDate}
          followUpTime={followUpTime}
          onDateChange={setFollowUpDate}
          onTimeChange={setFollowUpTime}
        />
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
