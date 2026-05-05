/**
 * 活动记录表单页（MP 迁移）
 *
 * 与 Web pages/records/activity/index.tsx 保持 1:1 业务逻辑对齐。
 */
import { View, Text, Textarea, Picker, Image } from '@tarojs/components'
import { useState } from 'react'
import { recordsApi } from '@/api'
import type { ActivityRecord } from '@/api/activity'
import { nowTime, nowDate, isoToLocalDate, isoToLocalTime } from '@/lib/utils'
import { useRecordInit } from '@/lib/useRecordInit'
import { useRecordSubmit } from '@/lib/useRecordSubmit'
import RecordNavBar from '@/components/RecordNavBar'
import ConfirmSheet from '@/components/ConfirmSheet'
import SubmitBar from '@/components/SubmitBar'
import PageLoading from '@/components/PageLoading'
import ActivityTypeSection from './ActivityTypeSection'
import IntensitySection from './IntensitySection'
import './index.scss'

// ── 类型定义 ──
type ActivityType = 'gross_motor' | 'fine_motor' | 'edu_play' | 'outdoor' | 'daily_care' | 'other'
type ActivityIntensity = 'easy' | 'medium' | 'active'

// ── SVG 图标 ──
const ICON_CLOCK = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>')}`

export default function ActivityFormPage() {
  // ── 表单状态 ──
  const [recordDate, setRecordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [activityType, setActivityType] = useState<ActivityType>('gross_motor')
  const [intensity, setIntensity] = useState<ActivityIntensity>('medium')
  const [durationMin, setDurationMin] = useState(15)
  const [note, setNote] = useState('')

  // ── 通用初始化 ──
  const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit<ActivityRecord>({
    loadRecord: (fid, rid) => recordsApi.activity.getOne(fid, rid),
    onRecord: (r) => {
      if (r.record_time) {
        setRecordDate(isoToLocalDate(r.record_time))
        setRecordTime(isoToLocalTime(r.record_time))
      }
      if (r.activity_type) setActivityType(r.activity_type)
      if (r.intensity) setIntensity(r.intensity)
      if (r.duration_min != null) setDurationMin(r.duration_min)
      setNote(r.note ?? '')
    },
  })

  // ── 通用提交/删除 ──
  const { submitting, deleteConfirmOpen, setDeleteConfirmOpen, handleSubmit, handleDelete } = useRecordSubmit()

  // ── 时长步进器 ──
  const decreaseDuration = () => setDurationMin((d) => Math.max(5, d - 5))
  const increaseDuration = () => setDurationMin((d) => Math.min(120, d + 5))

  // ── 提交 ──
  const onSubmit = () => handleSubmit({
    validate: () => {
      if (!familyId || !babyId) return '请先完成宝宝建档'
      return true
    },
    execute: async () => {
      const payload = {
        activity_type: activityType,
        record_time: `${recordDate}T${recordTime}:00`,
        duration_min: durationMin,
        intensity,
        note: note || undefined,
      }
      if (isEditMode) {
        await recordsApi.activity.update(familyId, editRecordId, payload)
        return '活动记录已更新'
      } else {
        await recordsApi.activity.create(familyId, { baby_id: babyId, ...payload })
        return '活动记录已保存'
      }
    },
  })

  // ── 删除 ──
  const onDelete = () => handleDelete({
    execute: () => recordsApi.activity.remove(familyId, editRecordId),
  })

  // ── Loading ──
  if (loading) {
    return (
      <View className='activity-page'>
        <RecordNavBar title='活动记录' isEditMode={false} />
        <PageLoading />
      </View>
    )
  }

  return (
    <View className='activity-page'>
      <RecordNavBar
        title='活动记录'
        isEditMode={isEditMode}
        onRightAction={isEditMode ? () => setDeleteConfirmOpen(true) : undefined}
      />

      {/* ── 表单主体 ── */}
      <View className='activity-body'>
        {/* 记录时间 */}
        <View className='activity-section-label'><Text>记录时间</Text></View>
        <View className='activity-card'>
          <View className='activity-card__row activity-card__row--border'>
            <Text className='activity-card__label'>记录日期</Text>
            <View className='activity-card__picker'>
              <Picker mode='date' value={recordDate} onChange={(e) => setRecordDate(e.detail.value)}>
                <Text className='activity-card__picker-text'>{recordDate}</Text>
              </Picker>
            </View>
          </View>
          <View className='activity-card__row'>
            <Text className='activity-card__label'>记录时间</Text>
            <View className='activity-card__picker'>
              <Picker mode='time' value={recordTime} onChange={(e) => setRecordTime(e.detail.value)}>
                <Text className='activity-card__picker-text'>{recordTime}</Text>
              </Picker>
            </View>
          </View>
        </View>

        {/* 活动类型 */}
        <ActivityTypeSection value={activityType} onChange={setActivityType} />

        {/* 活动时长 */}
        <View className='activity-duration-card'>
          <View className='activity-duration-card__header'>
            <Image className='activity-duration-card__header-icon' src={ICON_CLOCK} />
            <Text className='activity-duration-card__header-text'>活动时长</Text>
          </View>
          <View className='activity-duration-card__body'>
            <View className='activity-duration-card__btn' onClick={decreaseDuration}>
              <Text className='activity-duration-card__btn-text'>-</Text>
            </View>
            <View className='activity-duration-card__value-wrap'>
              <Text className='activity-duration-card__value'>{durationMin}</Text>
              <Text className='activity-duration-card__unit'>分钟</Text>
            </View>
            <View className='activity-duration-card__btn' onClick={increaseDuration}>
              <Text className='activity-duration-card__btn-text'>+</Text>
            </View>
          </View>
        </View>

        {/* 活动强度 */}
        <IntensitySection value={intensity} onChange={setIntensity} />

        {/* 备注 */}
        <View className='activity-section-label'><Text>备注（可选）</Text></View>
        <View className='activity-card'>
          <Textarea
            className='activity-note__input'
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
