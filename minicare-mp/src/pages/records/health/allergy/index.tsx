/**
 * 过敏表现记录表单页（独立页）
 *
 * 从原健康综合页拆分而来：只记录过敏表现维度，减少填写干扰。
 * 提交仅携带 allergy_symptoms / allergy_severity 字段，后端 health_record 单表不变。
 */
import { View, Text, Textarea, Picker } from '@tarojs/components'
import { useState } from 'react'
import { recordsApi } from '@/api'
import type { HealthRecord } from '@/api/health'
import { nowTime, nowDate, isoToLocalDate, isoToLocalTime } from '@/lib/utils'
import { useRecordInit } from '@/lib/useRecordInit'
import { useRecordSubmit } from '@/lib/useRecordSubmit'
import RecordNavBar from '@/components/RecordNavBar'
import ConfirmSheet from '@/components/ConfirmSheet'
import SubmitBar from '@/components/SubmitBar'
import PageLoading from '@/components/PageLoading'
import AllergySection from '../AllergySection'
import type { Severity } from '../AllergySection'
import { useIsIPad } from '@/lib/useIsIPad'
import './index.scss'

export default function AllergyFormPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => (isIPad ? `${base} is-ipad` : base)

  // ── 表单状态 ──
  const [recordDate, setRecordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([])
  const [severity, setSeverity] = useState<Severity | null>(null)
  const [note, setNote] = useState('')

  // ── 通用初始化 ──
  const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit<HealthRecord>({
    loadRecord: (fid, rid) => recordsApi.health.getOne(fid, rid),
    onRecord: (r) => {
      if (r.record_time) {
        setRecordDate(isoToLocalDate(r.record_time))
        setRecordTime(isoToLocalTime(r.record_time))
      }
      setSelectedSymptoms(r.allergy_symptoms ?? [])
      setSeverity(r.allergy_severity ?? null)
      setNote(r.note ?? '')
    },
    parseOptions: () => ({}),
    onExtraOptions: () => {},
  })

  // ── 通用提交/删除 ──
  const { submitting, deleteConfirmOpen, setDeleteConfirmOpen, handleSubmit, handleDelete } = useRecordSubmit()

  // ── 症状切换 ──
  const toggleSymptom = (s: string) => {
    setSelectedSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  // ── 提交 ──
  const onSubmit = () =>
    handleSubmit({
      validate: () => {
        if (!familyId || !babyId) return '请先完成宝宝建档'
        if (selectedSymptoms.length === 0 && !note.trim()) return '请选择过敏表现或填写备注'
        return true
      },
      execute: async () => {
        const payload = {
          record_time: `${recordDate}T${recordTime}:00`,
          allergy_symptoms: selectedSymptoms.length > 0 ? selectedSymptoms : undefined,
          allergy_severity: selectedSymptoms.length > 0 ? (severity ?? undefined) : undefined,
          note: note || undefined,
        }
        if (isEditMode) {
          await recordsApi.health.update(familyId, editRecordId, payload)
          return '过敏表现已更新'
        }
        await recordsApi.health.create(familyId, { baby_id: babyId, ...payload })
        return '过敏表现已保存'
      },
    })

  // ── 删除 ──
  const onDelete = () => handleDelete({
    execute: () => recordsApi.health.remove(familyId, editRecordId),
  })

  // ── Loading ──
  if (loading) {
    return (
      <View className={cls('allergy-page')}>
        <RecordNavBar title='过敏表现' isEditMode={false} />
        <PageLoading />
      </View>
    )
  }

  return (
    <View className={cls('allergy-page')}>
      <RecordNavBar
        title='过敏表现'
        isEditMode={isEditMode}
        onRightAction={isEditMode ? () => setDeleteConfirmOpen(true) : undefined}
      />

      {/* ── 表单主体 ── */}
      <View className='health-body'>
        {/* 记录时间 */}
        <View className='health-section-label'><Text>记录时间</Text></View>
        <View className='health-card'>
          <View className='health-card__row health-card__row--border'>
            <Text className='health-card__label'>记录日期</Text>
            <View className='health-card__picker'>
              <Picker mode='date' value={recordDate} onChange={(e) => setRecordDate(e.detail.value)}>
                <Text className='health-card__picker-text'>{recordDate}</Text>
              </Picker>
            </View>
          </View>
          <View className='health-card__row'>
            <Text className='health-card__label'>记录时间</Text>
            <View className='health-card__picker'>
              <Picker mode='time' value={recordTime} onChange={(e) => setRecordTime(e.detail.value)}>
                <Text className='health-card__picker-text'>{recordTime}</Text>
              </Picker>
            </View>
          </View>
        </View>

        {/* 过敏表现 */}
        <View className='health-section-label'><Text>过敏表现</Text></View>
        <View className='health-card'>
          <AllergySection
            selected={selectedSymptoms}
            onToggle={toggleSymptom}
            severity={severity}
            onSeverityChange={setSeverity}
          />
        </View>
        {selectedSymptoms.length === 0 ? (
          <View className='allergy-page__hint'><Text>无过敏表现则跳过</Text></View>
        ) : null}

        {/* 备注 */}
        <View className='health-section-label'><Text>备注（可选）</Text></View>
        <View className='health-card'>
          <Textarea
            className='health-note__input'
            value={note}
            onInput={(e) => setNote(e.detail.value)}
            placeholder='其他观察或备注...'
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
