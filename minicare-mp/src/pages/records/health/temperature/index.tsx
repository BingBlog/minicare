/**
 * 体温记录表单页（独立页）
 *
 * 从原健康综合页拆分而来：只记录体温维度，减少填写干扰。
 * 提交仅携带 temperature 字段，后端 health_record 单表不变（字段可空）。
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
import TemperatureSection from '../TemperatureSection'
import { useIsIPad } from '@/lib/useIsIPad'
import './index.scss'

export default function TemperatureFormPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => (isIPad ? `${base} is-ipad` : base)

  // ── 表单状态 ──
  const [recordDate, setRecordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [temperature, setTemperature] = useState('36.5')
  const [note, setNote] = useState('')

  // ── 通用初始化 ──
  const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit<HealthRecord>({
    loadRecord: (fid, rid) => recordsApi.health.getOne(fid, rid),
    onRecord: (r) => {
      if (r.record_time) {
        setRecordDate(isoToLocalDate(r.record_time))
        setRecordTime(isoToLocalTime(r.record_time))
      }
      if (r.temperature != null) setTemperature(String(r.temperature))
      setNote(r.note ?? '')
    },
    parseOptions: (opts) => {
      const voiceFields: Record<string, string> = {}
      for (const [key, value] of Object.entries(opts)) {
        if (key.startsWith('voice_') && value) {
          voiceFields[key.replace('voice_', '')] = value
        }
      }
      return voiceFields
    },
    onExtraOptions: (voiceFields) => {
      if (voiceFields.temperature) setTemperature(voiceFields.temperature)
    },
  })

  // ── 通用提交/删除 ──
  const { submitting, deleteConfirmOpen, setDeleteConfirmOpen, handleSubmit, handleDelete } = useRecordSubmit()

  // ── 提交 ──
  const onSubmit = () =>
    handleSubmit({
      validate: () => {
        if (!familyId || !babyId) return '请先完成宝宝建档'
        const temp = temperature ? parseFloat(temperature) : undefined
        if (temp !== undefined && (temp < 35 || temp > 42)) return '体温范围应为 35~42 度'
        return true
      },
      execute: async () => {
        const temp = temperature ? parseFloat(temperature) : undefined
        const payload = {
          record_time: `${recordDate}T${recordTime}:00`,
          temperature: temp,
          note: note || undefined,
        }
        if (isEditMode) {
          await recordsApi.health.update(familyId, editRecordId, payload)
          return '体温记录已更新'
        }
        await recordsApi.health.create(familyId, { baby_id: babyId, ...payload })
        return '体温记录已保存'
      },
    })

  // ── 删除 ──
  const onDelete = () => handleDelete({
    execute: () => recordsApi.health.remove(familyId, editRecordId),
  })

  // ── Loading ──
  if (loading) {
    return (
      <View className={cls('temp-page')}>
        <RecordNavBar title='体温记录' isEditMode={false} />
        <PageLoading />
      </View>
    )
  }

  return (
    <View className={cls('temp-page')}>
      <RecordNavBar
        title='体温记录'
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

        {/* 体温 */}
        <View className='health-section-label'><Text>体温</Text></View>
        <View className='health-card'>
          <TemperatureSection value={temperature} onChange={setTemperature} />
        </View>

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
