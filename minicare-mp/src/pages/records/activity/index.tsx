/**
 * 活动记录表单页（MP 迁移）
 *
 * 与 Web pages/records/activity/index.tsx 保持 1:1 业务逻辑对齐。
 * 差异：路由用 Taro API，组件用 Taro 组件，存储用 Taro Storage。
 *
 * 子组件拆分与 Web 1:1 对应（强制规则）：
 *  - ActivityTypeSection  活动类型选择（2×3 网格卡片）
 *  - IntensitySection     活动强度（轻松 / 适中 / 活跃）
 *
 * 编辑模式：通过 recordId URL 参数传入，进入页面时查询最新数据回填表单
 */
import { View, Text, Textarea, Picker, Image } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState, useRef } from 'react'
import dayjs from 'dayjs'
import { familyApi, babyApi, recordsApi } from '@/api'
import { getStatusBarHeight } from '@/lib/safeArea'
import ActivityTypeSection from './ActivityTypeSection'
import IntensitySection from './IntensitySection'
import './index.scss'

// ── 类型定义（与 Web api/types.ts 1:1 对齐） ──
type ActivityType = 'gross_motor' | 'fine_motor' | 'edu_play' | 'outdoor' | 'daily_care' | 'other'
type ActivityIntensity = 'easy' | 'medium' | 'active'

// ── 时间工具（与 Web shared 1:1 对齐） ──
function nowTime(): string { return dayjs().format('HH:mm') }
function nowDate(): string { return dayjs().format('YYYY-MM-DD') }
function isoToLocalDate(iso: string): string { return dayjs(iso).format('YYYY-MM-DD') }
function isoToLocalTime(iso: string): string { return dayjs(iso).format('HH:mm') }

// ── SVG 图标 ──
const ICON_CLOCK = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>')}`

export default function ActivityFormPage() {
  // ── 初始化状态 ──
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const [editRecordId, setEditRecordId] = useState('')
  const isEditMode = editRecordId !== ''
  const initDoneRef = useRef(false)

  // ── 表单状态（默认值与 Web 一致） ──
  const [recordDate, setRecordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [activityType, setActivityType] = useState<ActivityType>('gross_motor')
  const [intensity, setIntensity] = useState<ActivityIntensity>('medium')
  const [durationMin, setDurationMin] = useState(15)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── 删除确认 ──
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // ── 初始化（与 Web useEffect 等效） ──
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
          const fresh = await recordsApi.activity.getOne(fid, rid)
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
    const rt = r.record_time as string | undefined
    if (rt) {
      setRecordDate(isoToLocalDate(rt))
      setRecordTime(isoToLocalTime(rt))
    }
    if (r.activity_type) setActivityType(r.activity_type as ActivityType)
    if (r.intensity) setIntensity(r.intensity as ActivityIntensity)
    if (r.duration_min != null) setDurationMin(r.duration_min as number)
    setNote((r.note as string) ?? '')
  }

  // ── 时长步进器（与 Web 一致：min=5 max=120 step=5） ──
  const decreaseDuration = () => setDurationMin((d) => Math.max(5, d - 5))
  const increaseDuration = () => setDurationMin((d) => Math.min(120, d + 5))

  // ── 提交（与 Web handleSubmit 1:1 对齐） ──
  const handleSubmit = async () => {
    if (!familyId || !babyId) {
      Taro.showToast({ title: '请先完成宝宝建档', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        activity_type: activityType,
        record_time: `${recordDate}T${recordTime}:00`,
        duration_min: durationMin,
        intensity: intensity,
        note: note || undefined,
      }

      if (isEditMode) {
        await recordsApi.activity.update(familyId, editRecordId, payload)
        Taro.showToast({ title: '活动记录已更新', icon: 'success' })
      } else {
        await recordsApi.activity.create(familyId, { baby_id: babyId, ...payload })
        Taro.showToast({ title: '活动记录已保存', icon: 'success' })
      }
      setTimeout(() => Taro.navigateBack(), 1400)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败，请重试'
      Taro.showToast({ title: msg, icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── 删除（与 Web handleDelete 1:1 对齐） ──
  const handleDelete = async () => {
    if (!familyId || !editRecordId) return
    try {
      await recordsApi.activity.remove(familyId, editRecordId)
      Taro.showToast({ title: '记录已删除', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 1200)
    } catch {
      Taro.showToast({ title: '删除失败，请重试', icon: 'none' })
    }
    setDeleteConfirmOpen(false)
  }

  const statusBarHeight = getStatusBarHeight()

  // ── 加载中 ──
  if (loading) {
    return (
      <View className='activity-page'>
        <View className='activity-nav' style={{ paddingTop: `${statusBarHeight}px` }}>
          <View className='activity-nav__content'>
            <Text className='activity-nav__title'>活动记录</Text>
          </View>
        </View>
        <View className='activity-loading'>
          <Text className='activity-loading__text'>加载中...</Text>
        </View>
      </View>
    )
  }

  return (
    <View className='activity-page'>
      {/* ── 导航栏 ── */}
      <View className='activity-nav' style={{ paddingTop: `${statusBarHeight}px` }}>
        <View className='activity-nav__content'>
          <View className='activity-nav__back' onClick={() => Taro.navigateBack()}>
            <Text className='activity-nav__back-icon'>{'\u2039'}</Text>
          </View>
          <Text className='activity-nav__title'>
            {isEditMode ? '编辑活动记录' : '活动记录'}
          </Text>
          <View className='activity-nav__placeholder' />
        </View>
      </View>

      {/* ── 表单主体 ── */}
      <View className='activity-body'>
        {/* 记录时间 */}
        <View className='activity-section-label'>
          <Text>记录时间</Text>
        </View>
        <View className='activity-card'>
          <View className='activity-card__row activity-card__row--border'>
            <Text className='activity-card__label'>记录日期</Text>
            <View className='activity-card__picker'>
              <Picker
                mode='date'
                value={recordDate}
                onChange={(e) => setRecordDate(e.detail.value)}
              >
                <Text className='activity-card__picker-text'>{recordDate}</Text>
              </Picker>
            </View>
          </View>
          <View className='activity-card__row'>
            <Text className='activity-card__label'>记录时间</Text>
            <View className='activity-card__picker'>
              <Picker
                mode='time'
                value={recordTime}
                onChange={(e) => setRecordTime(e.detail.value)}
              >
                <Text className='activity-card__picker-text'>{recordTime}</Text>
              </Picker>
            </View>
          </View>
        </View>

        {/* 活动类型 */}
        <ActivityTypeSection value={activityType} onChange={setActivityType} />

        {/* 活动时长（内联步进器，与 Web 一致） */}
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
        <View className='activity-section-label'>
          <Text>备注（可选）</Text>
        </View>
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
      <View className='activity-submit'>
        <View className='activity-submit__inner'>
          {isEditMode ? (
            <View
              className='activity-submit__btn activity-submit__btn--delete'
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Text className='activity-submit__btn-text activity-submit__btn-text--delete'>删除</Text>
            </View>
          ) : null}
          <View
            className={`activity-submit__btn activity-submit__btn--primary ${submitting ? 'activity-submit__btn--disabled' : ''}`}
            onClick={submitting ? undefined : handleSubmit}
          >
            <Text className='activity-submit__btn-text'>
              {submitting ? '保存中...' : isEditMode ? '更新记录' : '保存记录'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── 删除确认底部 Sheet ── */}
      {deleteConfirmOpen ? (
        <View className='activity-sheet-mask' onClick={() => setDeleteConfirmOpen(false)}>
          <View className='activity-sheet' onClick={(e) => e.stopPropagation()}>
            <View className='activity-sheet__handle' />
            <Text className='activity-sheet__title'>确定删除这条记录吗？</Text>
            <Text className='activity-sheet__desc'>删除后无法恢复</Text>
            <View className='activity-sheet__actions'>
              <View
                className='activity-sheet__btn activity-sheet__btn--danger'
                onClick={handleDelete}
              >
                <Text>确认删除</Text>
              </View>
              <View
                className='activity-sheet__btn activity-sheet__btn--cancel'
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
