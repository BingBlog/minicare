/**
 * 尿布记录表单页（MP 迁移）
 *
 * 与 Web pages/records/diaper/index.tsx 保持业务逻辑对齐。
 * 子组件拆分与 Web 1:1 对应。
 */
import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import dayjs from 'dayjs'
import { babyApi, familyApi, recordsApi } from '@/api'
import { getStatusBarHeight } from '@/lib/safeArea'
import DiaperTypeSection from './DiaperTypeSection'
import PoopSection from './PoopSection'
import ButtConditionSection from './ButtConditionSection'
import type { ButtCondition } from './ButtConditionSection'
import './index.scss'

// ---------------------------------------------------------------------------
// 时间工具
// ---------------------------------------------------------------------------
function nowHhmm(): string { return dayjs().format('HH:mm') }
function nowDateStr(): string { return dayjs().format('YYYY-MM-DD') }
function hhmmToIso(date: string, hhmm: string): string { return dayjs(`${date}T${hhmm}:00`).toISOString() }
function isoToDate(iso: string): string { return dayjs(iso).format('YYYY-MM-DD') }
function isoToTime(iso: string): string { return dayjs(iso).format('HH:mm') }

type DiaperChip = 'wet' | 'dirty' | 'mixed'

// ---------------------------------------------------------------------------
// 页面入口
// ---------------------------------------------------------------------------
export default function DiaperFormPage() {
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editRecordId, setEditRecordId] = useState('')
  const isEditMode = editRecordId !== ''

  const [recordDate, setRecordDate] = useState(nowDateStr())
  const [recordTime, setRecordTime] = useState(nowHhmm())
  const [note, setNote] = useState('')

  const [diaperType, setDiaperType] = useState<DiaperChip>('wet')
  const [diaperCount, setDiaperCount] = useState(1)
  const [poopType, setPoopType] = useState<string | null>('normal')
  const [buttCondition, setButtCondition] = useState<ButtCondition | null>('normal')
  const [colorSelected, setColorSelected] = useState<Set<string>>(new Set())

  // -----------------------------------------------------------------------
  // 初始化
  // -----------------------------------------------------------------------
  useLoad((options) => {
    const initRecordId = (options?.recordId as string | undefined) ?? ''
    init(initRecordId)
  })

  const init = async (initRecordId: string) => {
    setEditRecordId(initRecordId)
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

      if (initRecordId) {
        try {
          const rec = await recordsApi.diaper.getOne(fid, initRecordId)
          populateEditForm(rec as Record<string, unknown>)
        } catch {
          Taro.showToast({ title: '加载记录失败', icon: 'none' })
        }
      }
    } catch {
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const populateEditForm = (rec: Record<string, unknown>) => {
    if (rec.record_time) {
      setRecordDate(isoToDate(rec.record_time as string))
      setRecordTime(isoToTime(rec.record_time as string))
    }
    if (rec.diaper_type) setDiaperType(rec.diaper_type as DiaperChip)
    if (rec.diaper_count != null) setDiaperCount(rec.diaper_count as number)
    setPoopType((rec.poop_type as string | null) ?? null)
    setButtCondition((rec.butt_condition as ButtCondition | null) ?? null)
    if (rec.stool_colors) setColorSelected(new Set(rec.stool_colors as string[]))
    if (rec.note) setNote(rec.note as string)
  }

  // -----------------------------------------------------------------------
  // Helper
  // -----------------------------------------------------------------------
  const showPoop = diaperType === 'dirty' || diaperType === 'mixed'

  const toggleColor = (key: string) => {
    setColorSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // -----------------------------------------------------------------------
  // 提交
  // -----------------------------------------------------------------------
  const handleSubmit = async () => {
    if (!familyId || !babyId) { Taro.showToast({ title: '请先完成宝宝建档', icon: 'none' }); return }
    setSubmitting(true)
    try {
      const stoolColors = colorSelected.size > 0 ? [...colorSelected] : undefined
      const payload = {
        baby_id: babyId,
        diaper_type: diaperType,
        record_time: hhmmToIso(recordDate, recordTime),
        stool_colors: stoolColors,
        poop_type: (showPoop && poopType ? poopType : undefined) ?? undefined,
        butt_condition: buttCondition ?? undefined,
        diaper_count: diaperCount !== 1 ? diaperCount : undefined,
        note: note || undefined,
      }

      if (isEditMode) {
        const { baby_id: _, ...updatePayload } = payload
        await recordsApi.diaper.update(familyId, editRecordId, updatePayload)
      } else {
        await recordsApi.diaper.create(familyId, payload)
      }

      Taro.showToast({ title: isEditMode ? '记录已更新' : '记录已保存', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 1000)
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '保存失败', icon: 'none' })
    } finally { setSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!familyId || !editRecordId) return
    try {
      await recordsApi.diaper.remove(familyId, editRecordId)
      Taro.showToast({ title: '记录已删除', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 800)
    } catch { Taro.showToast({ title: '删除失败', icon: 'none' }) }
  }

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <View className='diaper-page'>
        <View className='diaper-loading'><Text>加载中...</Text></View>
      </View>
    )
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <View className='diaper-page'>
      {/* 导航栏 */}
      <View className='diaper-nav' style={{ paddingTop: `${getStatusBarHeight() + 10}px` }}>
        <View className='diaper-nav__back' onClick={() => Taro.navigateBack()}>
          <Text className='diaper-nav__back-arrow'>{'<'}</Text>
        </View>
        <Text className='diaper-nav__title'>{isEditMode ? '编辑尿布记录' : '尿布记录'}</Text>
        {isEditMode ? (
          <View className='diaper-nav__delete' onClick={handleDelete}>
            <Text className='diaper-nav__delete-text'>删除</Text>
          </View>
        ) : (
          <View className='diaper-nav__spacer' />
        )}
      </View>

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
      <View className='diaper-submit'>
        <View className={`diaper-submit__btn ${submitting ? 'diaper-submit__btn--loading' : ''}`} onClick={submitting ? undefined : handleSubmit}>
          <Text className='diaper-submit__text'>{submitting ? '提交中...' : isEditMode ? '更新记录' : '保存记录'}</Text>
        </View>
      </View>
    </View>
  )
}
