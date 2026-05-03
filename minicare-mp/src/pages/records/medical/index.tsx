/**
 * 医疗记录表单页（MP 迁移）
 *
 * 与 Web pages/records/medical/index.tsx 保持 1:1 业务逻辑对齐。
 * 差异：路由/Taro 组件/存储方案按平台适配。
 *
 * 子组件拆分与 Web 1:1 对应（强制规则）：
 *  - VisitTypeSection     检查类型 6 项 2 列网格
 *  - BasicInfoSection     基本信息（日期/机构/医生）
 *  - OCRSection           OCR 拍照上传+结果确认
 *  - ResultSection        结果摘要+诊断结论
 *  - MedicationsSection   用药记录动态列表
 *  - FollowUpSection      复查提醒日期+开关
 *
 * 编辑模式：通过 recordId URL 参数传入，进入页面时查询最新数据回填表单
 */
import { View, Text, Textarea } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState, useRef } from 'react'
import dayjs from 'dayjs'
import { familyApi, babyApi, recordsApi } from '@/api'
import { getStatusBarHeight } from '@/lib/safeArea'
import VisitTypeSection from './VisitTypeSection'
import BasicInfoSection from './BasicInfoSection'
import OCRSection from './OCRSection'
import ResultSection from './ResultSection'
import MedicationsSection, { type Medication } from './MedicationsSection'
import FollowUpSection from './FollowUpSection'
import './index.scss'

function nowDate(): string {
  return dayjs().format('YYYY-MM-DD')
}

export default function MedicalFormPage() {
  // -- 初始化状态 --
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const [editRecordId, setEditRecordId] = useState('')
  const isEditMode = editRecordId !== ''
  const initDoneRef = useRef(false)

  // -- 表单状态（与 Web 完全对齐） --
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
  const [submitting, setSubmitting] = useState(false)

  // -- 删除确认 --
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // -- 初始化 --
  useLoad((options) => {
    if (initDoneRef.current) return
    initDoneRef.current = true
    const rid = (options?.recordId as string | undefined) ?? ''
    init(rid)
  })

  const init = async (rid: string) => {
    setEditRecordId(rid)
    try {
      const families = await familyApi.getMine()
      if (!families.length) {
        Taro.showToast({ title: '请先完成建档', icon: 'none' })
        Taro.reLaunch({ url: '/pages/home/index' })
        return
      }
      const fid = families[0].id
      const baby = await babyApi.get(fid)
      setFamilyId(fid)
      setBabyId(baby.id)

      if (rid) {
        // 编辑模式：查询最新记录并回填
        try {
          const fresh = await recordsApi.medical.getOne(fid, rid)
          if (fresh) applyRecord(fresh)
        } catch {
          Taro.showToast({ title: '加载记录失败', icon: 'none' })
        }
      }
    } catch {
      Taro.showToast({ title: '加载失败，请重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  /** 回填表单状态（编辑模式） */
  const applyRecord = (r: Record<string, unknown>) => {
    if (r.visit_date) setVisitDate(r.visit_date as string)
    if (r.visit_type) setVisitType(r.visit_type as string)
    setHospital((r.hospital as string) ?? '')
    setDoctor((r.doctor as string) ?? '')
    setResultSummary((r.result_summary as string) ?? '')
    setDiagnosis((r.diagnosis as string) ?? '')
    const meds = r.medications as Array<{ name: string; dose?: string }> | null | undefined
    if (meds && meds.length > 0) {
      setMedications(meds.map((m) => ({ name: m.name, dose: m.dose ?? '' })))
    }
    setNote((r.note as string) ?? '')
    if (r.follow_up_date) {
      setFollowUpDate(r.follow_up_date as string)
      setFollowUpEnabled(true)
    }
  }

  // -- 用药操作 --
  const addMed = () => setMedications((prev) => [...prev, { name: '', dose: '' }])
  const removeMed = (i: number) => setMedications((prev) => prev.filter((_, idx) => idx !== i))
  const updateMed = (i: number, field: keyof Medication, val: string) => {
    setMedications((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: val } : m)))
  }

  // -- Toast 工具 --
  const showToast = (msg: string) => {
    Taro.showToast({ title: msg, icon: 'none', duration: 1500 })
  }

  // -- 提交 --
  const handleSubmit = async () => {
    if (!familyId || !babyId) {
      Taro.showToast({ title: '请先完成宝宝建档', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const validMeds = medications.filter((m) => m.name.trim())
      const noteArr: string[] = []
      if (note) noteArr.push(note)

      const payload: Record<string, unknown> = {
        visit_date: visitDate,
        visit_type: visitType || undefined,
        hospital: hospital || undefined,
        doctor: doctor || undefined,
        diagnosis: diagnosis || undefined,
        result_summary: resultSummary || undefined,
        medications:
          validMeds.length > 0 ? validMeds.map((m) => ({ name: m.name, dose: m.dose || undefined })) : undefined,
        follow_up_date: followUpEnabled && followUpDate ? followUpDate : undefined,
        note: noteArr.join(' / ') || undefined,
      }

      if (isEditMode) {
        await recordsApi.medical.update(familyId, editRecordId, payload)
        Taro.showToast({ title: '医疗记录已更新', icon: 'success' })
      } else {
        await recordsApi.medical.create(familyId, { baby_id: babyId, ...payload })
        Taro.showToast({ title: '医疗记录已保存', icon: 'success' })
      }
      setTimeout(() => Taro.navigateBack(), 1400)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败，请重试'
      Taro.showToast({ title: msg, icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  // -- 删除 --
  const handleDelete = async () => {
    if (!familyId || !editRecordId) return
    try {
      await recordsApi.medical.remove(familyId, editRecordId)
      Taro.showToast({ title: '记录已删除', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 1200)
    } catch {
      Taro.showToast({ title: '删除失败，请重试', icon: 'none' })
    }
    setDeleteConfirmOpen(false)
  }

  const statusBarHeight = getStatusBarHeight()

  // -- 加载中 --
  if (loading) {
    return (
      <View className='medical-page'>
        <View className='medical-nav' style={{ paddingTop: `${statusBarHeight}px` }}>
          <View className='medical-nav__content'>
            <Text className='medical-nav__title'>医疗记录</Text>
          </View>
        </View>
        <View className='medical-loading'>
          <Text className='medical-loading__text'>加载中...</Text>
        </View>
      </View>
    )
  }

  return (
    <View className='medical-page'>
      {/* -- 导航栏 -- */}
      <View className='medical-nav' style={{ paddingTop: `${statusBarHeight}px` }}>
        <View className='medical-nav__content'>
          <View className='medical-nav__back' onClick={() => Taro.navigateBack()}>
            <Text className='medical-nav__back-icon'>{'\u2039'}</Text>
          </View>
          <Text className='medical-nav__title'>
            {isEditMode ? '编辑医疗记录' : '医疗记录'}
          </Text>
          <View className='medical-nav__placeholder' />
        </View>
      </View>

      {/* -- 表单主体 -- */}
      <View className='medical-body'>
        {/* 检查类型 */}
        <View className='medical-section-label'>
          <Text>检查类型</Text>
        </View>
        <VisitTypeSection value={visitType} onChange={setVisitType} />

        {/* 基本信息 */}
        <View className='medical-section-label'>
          <Text>基本信息</Text>
        </View>
        <BasicInfoSection
          visitDate={visitDate}
          hospital={hospital}
          doctor={doctor}
          onVisitDateChange={setVisitDate}
          onHospitalChange={setHospital}
          onDoctorChange={setDoctor}
        />

        {/* OCR 上传区 */}
        <View className='medical-section-label'>
          <Text>上传检查报告（OCR 自动识别）</Text>
        </View>
        <OCRSection showToast={showToast} />

        {/* 结果与诊断 */}
        <View className='medical-section-label'>
          <Text>结果与诊断</Text>
        </View>
        <ResultSection
          resultSummary={resultSummary}
          diagnosis={diagnosis}
          onResultSummaryChange={setResultSummary}
          onDiagnosisChange={setDiagnosis}
        />

        {/* 用药记录 */}
        <MedicationsSection medications={medications} onAdd={addMed} onRemove={removeMed} onUpdate={updateMed} />

        {/* 下次复查提醒 */}
        <View className='medical-section-label'>
          <Text>下次复查提醒（可选）</Text>
        </View>
        <FollowUpSection
          followUpDate={followUpDate}
          followUpEnabled={followUpEnabled}
          onDateChange={setFollowUpDate}
          onToggle={() => setFollowUpEnabled(!followUpEnabled)}
        />

        {/* 备注 */}
        <View className='medical-section-label'>
          <Text>备注（可选）</Text>
        </View>
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

      {/* -- 底部提交栏 -- */}
      <View className='medical-submit'>
        <View className='medical-submit__inner'>
          {isEditMode ? (
            <View
              className='medical-submit__btn medical-submit__btn--delete'
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Text className='medical-submit__btn-text medical-submit__btn-text--delete'>删除</Text>
            </View>
          ) : null}
          <View
            className={`medical-submit__btn medical-submit__btn--primary ${submitting ? 'medical-submit__btn--disabled' : ''}`}
            onClick={submitting ? undefined : handleSubmit}
          >
            <Text className='medical-submit__btn-text'>
              {submitting ? '保存中...' : isEditMode ? '更新记录' : '保存记录'}
            </Text>
          </View>
        </View>
      </View>

      {/* -- 删除确认底部 Sheet -- */}
      {deleteConfirmOpen ? (
        <View className='medical-sheet-mask' onClick={() => setDeleteConfirmOpen(false)}>
          <View className='medical-sheet' onClick={(e) => e.stopPropagation()}>
            <View className='medical-sheet__handle' />
            <Text className='medical-sheet__title'>确定删除这条记录吗？</Text>
            <Text className='medical-sheet__desc'>删除后无法恢复</Text>
            <View className='medical-sheet__actions'>
              <View
                className='medical-sheet__btn medical-sheet__btn--danger'
                onClick={handleDelete}
              >
                <Text>确认删除</Text>
              </View>
              <View
                className='medical-sheet__btn medical-sheet__btn--cancel'
                onClick={() => setDeleteConfirmOpen(false)}
              >
                <Text>取消</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
