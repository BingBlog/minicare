/**
 * 尿布记录表单页（MP 迁移）
 *
 * 与 Web pages/records/diaper/index.tsx 保持业务逻辑对齐。
 * 子组件拆分与 Web 1:1 对应。
 */
import { View, Text, Input, Picker } from '@tarojs/components'
import { useState } from 'react'
import { recordsApi } from '@/api'
import type { DiaperRecord } from '@/api/diaper'
import { nowTime, nowDate, toLocalISO, isoToLocalDate, isoToLocalTime } from '@/lib/utils'
import { useRecordInit } from '@/lib/useRecordInit'
import { useRecordSubmit } from '@/lib/useRecordSubmit'
import RecordNavBar from '@/components/RecordNavBar'
import ConfirmSheet from '@/components/ConfirmSheet'
import SubmitBar from '@/components/SubmitBar'
import PageLoading from '@/components/PageLoading'
import DiaperTypeSection from './DiaperTypeSection'
import PoopSection from './PoopSection'
import ButtConditionSection from './ButtConditionSection'
import type { ButtCondition } from './ButtConditionSection'
import './index.scss'

type DiaperChip = 'wet' | 'dirty' | 'mixed'

// ---------------------------------------------------------------------------
// 页面入口
// ---------------------------------------------------------------------------
export default function DiaperFormPage() {
  // ── 表单状态 ──
  const [recordDate, setRecordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [note, setNote] = useState('')
  const [diaperType, setDiaperType] = useState<DiaperChip>('wet')
  const [diaperCount, setDiaperCount] = useState(1)
  const [poopType, setPoopType] = useState<string | null>('normal')
  const [buttCondition, setButtCondition] = useState<ButtCondition | null>('normal')
  const [colorSelected, setColorSelected] = useState<Set<string>>(new Set())

  // ── 通用初始化 ──
  const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit<DiaperRecord>({
    loadRecord: (fid, rid) => recordsApi.diaper.getOne(fid, rid),
    onRecord: (rec) => {
      if (rec.record_time) {
        setRecordDate(isoToLocalDate(rec.record_time))
        setRecordTime(isoToLocalTime(rec.record_time))
      }
      if (rec.diaper_type) setDiaperType(rec.diaper_type)
      if (rec.diaper_count != null) setDiaperCount(rec.diaper_count)
      setPoopType(rec.poop_type ?? null)
      setButtCondition((rec.butt_condition as ButtCondition | null) ?? null)
      if (rec.stool_colors) setColorSelected(new Set(rec.stool_colors))
      if (rec.note) setNote(rec.note)
    },
  })

  // ── 通用提交/删除 ──
  const { submitting, deleteConfirmOpen, setDeleteConfirmOpen, handleSubmit, handleDelete } = useRecordSubmit()

  // ── Helper ──
  const showPoop = diaperType === 'dirty' || diaperType === 'mixed'

  const toggleColor = (key: string) => {
    setColorSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // ── 提交 ──
  const onSubmit = () => handleSubmit({
    validate: () => {
      if (!familyId || !babyId) return '请先完成宝宝建档'
      return true
    },
    execute: async () => {
      const stoolColors = colorSelected.size > 0 ? [...colorSelected] : undefined
      const payload = {
        baby_id: babyId,
        diaper_type: diaperType,
        record_time: toLocalISO(recordDate, recordTime),
        stool_colors: stoolColors,
        poop_type: (showPoop && poopType ? poopType : undefined) ?? undefined,
        butt_condition: buttCondition ?? undefined,
        diaper_count: diaperCount !== 1 ? diaperCount : undefined,
        note: note || undefined,
      }
      if (isEditMode) {
        const { baby_id: _, ...updatePayload } = payload
        await recordsApi.diaper.update(familyId, editRecordId, updatePayload)
        return '记录已更新'
      } else {
        await recordsApi.diaper.create(familyId, payload)
        return '记录已保存'
      }
    },
  })

  // ── 删除 ──
  const onDelete = () => handleDelete({
    execute: () => recordsApi.diaper.remove(familyId, editRecordId),
  })

  // ── Loading ──
  if (loading) {
    return (
      <View className='diaper-page'>
        <RecordNavBar title='尿布记录' isEditMode={false} />
        <PageLoading />
      </View>
    )
  }

  // ── Render ──
  return (
    <View className='diaper-page'>
      <RecordNavBar
        title='尿布记录'
        isEditMode={isEditMode}
        onRightAction={isEditMode ? () => setDeleteConfirmOpen(true) : undefined}
      />

      <View className='diaper-body'>
        {/* 记录时间 */}
        <View className='diaper-section-label'><Text>记录时间</Text></View>
        <View className='diaper-card'>
          <View className='diaper-time-row diaper-time-row--border'>
            <Text className='diaper-time-row__label'>记录日期</Text>
            <Picker mode='date' value={recordDate} onChange={(e) => setRecordDate(e.detail.value)}>
              <View className='diaper-time-row__picker'><Text>{recordDate}</Text></View>
            </Picker>
          </View>
          <View className='diaper-time-row'>
            <Text className='diaper-time-row__label'>记录时间</Text>
            <Picker mode='time' value={recordTime} onChange={(e) => setRecordTime(e.detail.value)}>
              <View className='diaper-time-row__picker'><Text>{recordTime}</Text></View>
            </Picker>
          </View>
        </View>

        {/* 换尿布类型 */}
        <DiaperTypeSection selected={diaperType} onSelect={setDiaperType} count={diaperCount} onCountChange={setDiaperCount} />

        {/* 大便性状（条件显示） */}
        {showPoop && (
          <PoopSection poopType={poopType} onPoopTypeChange={setPoopType} colorSelected={colorSelected} onToggleColor={toggleColor} />
        )}

        {/* 屁屁状态 */}
        <ButtConditionSection value={buttCondition} onChange={setButtCondition} />

        {/* 备注 */}
        <View className='diaper-section-label'><Text>备注</Text></View>
        <View className='diaper-card'>
          <Input className='diaper-note' placeholder='其他观察或备注...' value={note} onInput={(e) => setNote(e.detail.value)} />
        </View>
      </View>

      {/* 提交 */}
      <SubmitBar
        submitting={submitting}
        isEditMode={isEditMode}
        onSubmit={onSubmit}
        onDelete={() => setDeleteConfirmOpen(true)}
      />

      {/* 删除确认 */}
      <ConfirmSheet
        open={deleteConfirmOpen}
        onConfirm={onDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </View>
  )
}
