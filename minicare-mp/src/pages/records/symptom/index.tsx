/**
 * 表现记录表单页（MP 迁移）
 *
 * 与 Web pages/records/symptom/index.tsx 保持 1:1 业务逻辑对齐。
 */
import { View, Text, Textarea, Picker } from '@tarojs/components'
import { useState } from 'react'
import { recordsApi } from '@/api'
import type { SymptomRecord } from '@/api/symptom'
import { nowTime, nowDate, isoToLocalDate, isoToLocalTime } from '@/lib/utils'
import { useRecordInit } from '@/lib/useRecordInit'
import { useRecordSubmit } from '@/lib/useRecordSubmit'
import RecordNavBar from '@/components/RecordNavBar'
import ConfirmSheet from '@/components/ConfirmSheet'
import SubmitBar from '@/components/SubmitBar'
import PageLoading from '@/components/PageLoading'
import SpiritSection from './SpiritSection'
import MoodSection from './MoodSection'
import './index.scss'

// -- Spirit/Mood 映射 --
type SpiritLevel = 'active' | 'normal' | 'tired' | 'lethargic'
type MoodLevel = 'happy' | 'neutral' | 'fussy' | 'crying'

function toBackendSpirit(frontendSpirit: string): SpiritLevel {
  const map: Record<string, SpiritLevel> = {
    good: 'active', fussy: 'tired', lethargic: 'lethargic',
    active: 'active', normal: 'active', tired: 'tired', calm: 'active', sleepy: 'tired',
  }
  return map[frontendSpirit] ?? 'active'
}

function toFrontendSpirit(backendSpirit: string): string {
  const map: Record<string, string> = { active: 'good', normal: 'good', tired: 'fussy', lethargic: 'lethargic' }
  return map[backendSpirit] ?? 'good'
}

function toBackendMood(frontendMood: string): MoodLevel {
  const map: Record<string, MoodLevel> = {
    happy: 'happy', neutral: 'neutral', fussy: 'fussy', crying: 'crying',
    normal: 'neutral', sad: 'fussy',
  }
  return map[frontendMood] ?? 'neutral'
}

function toFrontendMood(backendMood: string): string {
  return backendMood ?? 'neutral'
}

export default function SymptomFormPage() {
  // ── 表单状态 ──
  const [recordDate, setRecordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [mood, setMood] = useState('happy')
  const [spirit, setSpirit] = useState('good')
  const [note, setNote] = useState('')
  const [latestSymptoms, setLatestSymptoms] = useState<{ type: number; severity?: number }[]>([])

  // ── 通用初始化 ──
  const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit<SymptomRecord>({
    loadRecord: (fid, rid) => recordsApi.symptom.getOne(fid, rid),
    onRecord: (r) => {
      if (r.record_time) {
        setRecordDate(isoToLocalDate(r.record_time))
        setRecordTime(isoToLocalTime(r.record_time))
      }
      if (r.mood) setMood(toFrontendMood(r.mood))
      if (r.spirit) setSpirit(toFrontendSpirit(r.spirit))
      setNote(r.note ?? '')
      if (r.symptoms) setLatestSymptoms(r.symptoms)
    },
  })

  // ── 通用提交/删除 ──
  const { submitting, deleteConfirmOpen, setDeleteConfirmOpen, handleSubmit, handleDelete } = useRecordSubmit()

  // ── 提交 ──
  const onSubmit = () => handleSubmit({
    validate: () => {
      if (!familyId || !babyId) return '请先完成宝宝建档'
      return true
    },
    execute: async () => {
      const backendMood = toBackendMood(mood)
      const backendSpirit = toBackendSpirit(spirit)
      if (isEditMode) {
        await recordsApi.symptom.update(familyId, editRecordId, {
          record_time: `${recordDate}T${recordTime}:00`,
          symptoms: latestSymptoms,
          spirit: backendSpirit,
          mood: backendMood,
          note: note || undefined,
        })
        return '表现记录已更新'
      } else {
        await recordsApi.symptom.create(familyId, {
          baby_id: babyId,
          record_time: `${recordDate}T${recordTime}:00`,
          symptoms: [{ type: 6, severity: 1 }],
          spirit: backendSpirit,
          mood: backendMood,
          note: note || undefined,
        })
        return '表现记录已保存'
      }
    },
  })

  // ── 删除 ──
  const onDelete = () => handleDelete({
    execute: () => recordsApi.symptom.remove(familyId, editRecordId),
  })

  // ── Loading ──
  if (loading) {
    return (
      <View className='symptom-page'>
        <RecordNavBar title='表现记录' isEditMode={false} />
        <PageLoading />
      </View>
    )
  }

  return (
    <View className='symptom-page'>
      <RecordNavBar
        title='表现记录'
        isEditMode={isEditMode}
        onRightAction={isEditMode ? () => setDeleteConfirmOpen(true) : undefined}
      />

      {/* ── 表单主体 ── */}
      <View className='symptom-body'>
        {/* 记录时间 */}
        <View className='symptom-section-label'><Text>记录时间</Text></View>
        <View className='symptom-card'>
          <View className='symptom-card__row symptom-card__row--border'>
            <Text className='symptom-card__label'>记录日期</Text>
            <View className='symptom-card__picker'>
              <Picker mode='date' value={recordDate} onChange={(e) => setRecordDate(e.detail.value)}>
                <Text className='symptom-card__picker-text'>{recordDate}</Text>
              </Picker>
            </View>
          </View>
          <View className='symptom-card__row'>
            <Text className='symptom-card__label'>记录时间</Text>
            <View className='symptom-card__picker'>
              <Picker mode='time' value={recordTime} onChange={(e) => setRecordTime(e.detail.value)}>
                <Text className='symptom-card__picker-text'>{recordTime}</Text>
              </Picker>
            </View>
          </View>
        </View>

        {/* 精神状态 */}
        <View className='symptom-section-gap'>
          <SpiritSection value={spirit} onChange={setSpirit} />
        </View>

        {/* 心情状态 */}
        <MoodSection value={mood} onChange={setMood} />

        {/* 备注 */}
        <View className='symptom-section-label'><Text>备注（可选）</Text></View>
        <View className='symptom-card'>
          <Textarea
            className='symptom-note__input'
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
