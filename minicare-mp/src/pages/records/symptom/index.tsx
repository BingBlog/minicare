/**
 * 表现记录表单页（MP 迁移）
 *
 * 与 Web pages/records/symptom/index.tsx 保持 1:1 业务逻辑对齐。
 * 差异：路由/Taro 组件/存储方案按平台适配。
 *
 * 子组件拆分与 Web 1:1 对应（强制规则）：
 *  - SpiritSection  精神状态三分类卡片（good/fussy/lethargic）
 *  - MoodSection    心情状态四分类卡片（happy/neutral/fussy/crying）
 *
 * 字段：baby_id, record_time, symptoms, spirit, mood, note
 * spirit 和 mood 直接存入各自专用字段（DDL 有对应列）
 * symptoms JSON 必传（当前以 type=6 占位）
 *
 * 编辑模式：通过 recordId URL 参数传入，进入页面时查询最新数据回填表单
 *
 * spirit 前端-后端映射：
 *   good      -> active
 *   fussy     -> tired    （烦躁不安，映射为 tired）
 *   lethargic -> lethargic
 *
 * mood 前端 key 与后端 MoodLevel 完全一致：
 *   happy / neutral / fussy / crying
 */
import { View, Text, Textarea, Picker } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState, useRef } from 'react'
import dayjs from 'dayjs'
import { familyApi, babyApi, recordsApi } from '@/api'
import { getStatusBarHeight } from '@/lib/safeArea'
import SpiritSection from './SpiritSection'
import MoodSection from './MoodSection'
import './index.scss'

// -- 时间工具（与 Web shared 1:1 对齐） --
function nowTime(): string { return dayjs().format('HH:mm') }
function nowDate(): string { return dayjs().format('YYYY-MM-DD') }
function isoToLocalDate(iso: string): string { return dayjs(iso).format('YYYY-MM-DD') }
function isoToLocalTime(iso: string): string { return dayjs(iso).format('HH:mm') }

// -- Spirit 映射（与 Web toBackendSpirit / toFrontendSpirit 完全一致） --
// 前端三选项: good / fussy / lethargic
// 后端四枚举: active / normal / tired / lethargic
type SpiritLevel = 'active' | 'normal' | 'tired' | 'lethargic'
type MoodLevel = 'happy' | 'neutral' | 'fussy' | 'crying'

function toBackendSpirit(frontendSpirit: string): SpiritLevel {
  const map: Record<string, SpiritLevel> = {
    good:      'active',
    fussy:     'tired',
    lethargic: 'lethargic',
    // 兼容旧存储值
    active:    'active',
    normal:    'active',
    tired:     'tired',
    calm:      'active',
    sleepy:    'tired',
  }
  return map[frontendSpirit] ?? 'active'
}

function toFrontendSpirit(backendSpirit: string): string {
  const map: Record<string, string> = {
    active:    'good',
    normal:    'good',
    tired:     'fussy',
    lethargic: 'lethargic',
  }
  return map[backendSpirit] ?? 'good'
}

// -- Mood 映射（与 Web toBackendMood / toFrontendMood 完全一致） --
// 前端四选项与后端完全一致: happy / neutral / fussy / crying
function toBackendMood(frontendMood: string): MoodLevel {
  const map: Record<string, MoodLevel> = {
    happy:   'happy',
    neutral: 'neutral',
    fussy:   'fussy',
    crying:  'crying',
    // 兼容旧存储值
    normal:  'neutral',
    sad:     'fussy',
  }
  return map[frontendMood] ?? 'neutral'
}

function toFrontendMood(backendMood: string): string {
  // 后端值与前端 key 完全一致，直接透传
  return backendMood ?? 'neutral'
}

export default function SymptomFormPage() {
  // -- 初始化状态 --
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const [editRecordId, setEditRecordId] = useState('')
  const isEditMode = editRecordId !== ''
  const initDoneRef = useRef(false)

  // -- 表单状态 --
  const [recordDate, setRecordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [mood, setMood] = useState('happy')
  const [spirit, setSpirit] = useState('good')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [latestSymptoms, setLatestSymptoms] = useState<{ type: number; severity?: number }[]>([])

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
          const fresh = await recordsApi.symptom.getOne(fid, rid)
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
    if (r.mood) setMood(toFrontendMood(r.mood as string))
    if (r.spirit) setSpirit(toFrontendSpirit(r.spirit as string))
    setNote((r.note as string) ?? '')
    const symptoms = r.symptoms as { type: number; severity?: number }[] | null | undefined
    if (symptoms) setLatestSymptoms(symptoms)
  }

  // -- 提交 --
  const handleSubmit = async () => {
    if (!familyId || !babyId) {
      Taro.showToast({ title: '请先完成宝宝建档', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
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
        Taro.showToast({ title: '表现记录已更新', icon: 'success' })
      } else {
        await recordsApi.symptom.create(familyId, {
          baby_id: babyId,
          record_time: `${recordDate}T${recordTime}:00`,
          symptoms: [{ type: 6, severity: 1 }],
          spirit: backendSpirit,
          mood: backendMood,
          note: note || undefined,
        })
        Taro.showToast({ title: '表现记录已保存', icon: 'success' })
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
      await recordsApi.symptom.remove(familyId, editRecordId)
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
      <View className='symptom-page'>
        <View className='symptom-nav' style={{ paddingTop: `${statusBarHeight}px` }}>
          <View className='symptom-nav__content'>
            <Text className='symptom-nav__title'>表现记录</Text>
          </View>
        </View>
        <View className='symptom-loading'>
          <Text className='symptom-loading__text'>加载中...</Text>
        </View>
      </View>
    )
  }

  return (
    <View className='symptom-page'>
      {/* -- 导航栏 -- */}
      <View className='symptom-nav' style={{ paddingTop: `${statusBarHeight}px` }}>
        <View className='symptom-nav__content'>
          <View className='symptom-nav__back' onClick={() => Taro.navigateBack()}>
            <Text className='symptom-nav__back-icon'>{'\u2039'}</Text>
          </View>
          <Text className='symptom-nav__title'>
            {isEditMode ? '编辑表现记录' : '表现记录'}
          </Text>
          <View className='symptom-nav__placeholder' />
        </View>
      </View>

      {/* -- 表单主体 -- */}
      <View className='symptom-body'>
        {/* 记录时间 */}
        <View className='symptom-section-label'>
          <Text>记录时间</Text>
        </View>
        <View className='symptom-card'>
          <View className='symptom-card__row symptom-card__row--border'>
            <Text className='symptom-card__label'>记录日期</Text>
            <View className='symptom-card__picker'>
              <Picker
                mode='date'
                value={recordDate}
                onChange={(e) => setRecordDate(e.detail.value)}
              >
                <Text className='symptom-card__picker-text'>{recordDate}</Text>
              </Picker>
            </View>
          </View>
          <View className='symptom-card__row'>
            <Text className='symptom-card__label'>记录时间</Text>
            <View className='symptom-card__picker'>
              <Picker
                mode='time'
                value={recordTime}
                onChange={(e) => setRecordTime(e.detail.value)}
              >
                <Text className='symptom-card__picker-text'>{recordTime}</Text>
              </Picker>
            </View>
          </View>
        </View>

        {/* -- 精神状态（三分类卡片） -- */}
        <View className='symptom-section-gap'>
          <SpiritSection value={spirit} onChange={setSpirit} />
        </View>

        {/* -- 心情状态（四分类卡片） -- */}
        <MoodSection value={mood} onChange={setMood} />

        {/* -- 备注 -- */}
        <View className='symptom-section-label'>
          <Text>备注（可选）</Text>
        </View>
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

      {/* -- 底部提交栏 -- */}
      <View className='symptom-submit'>
        <View className='symptom-submit__inner'>
          {isEditMode ? (
            <View
              className='symptom-submit__btn symptom-submit__btn--delete'
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Text className='symptom-submit__btn-text symptom-submit__btn-text--delete'>删除</Text>
            </View>
          ) : null}
          <View
            className={`symptom-submit__btn symptom-submit__btn--primary ${submitting ? 'symptom-submit__btn--disabled' : ''}`}
            onClick={submitting ? undefined : handleSubmit}
          >
            <Text className='symptom-submit__btn-text'>
              {submitting ? '保存中...' : isEditMode ? '更新记录' : '保存记录'}
            </Text>
          </View>
        </View>
      </View>

      {/* -- 删除确认底部 Sheet -- */}
      {deleteConfirmOpen ? (
        <View className='symptom-sheet-mask' onClick={() => setDeleteConfirmOpen(false)}>
          <View className='symptom-sheet' onClick={(e) => e.stopPropagation()}>
            <View className='symptom-sheet__handle' />
            <Text className='symptom-sheet__title'>确定删除这条记录吗？</Text>
            <Text className='symptom-sheet__desc'>删除后无法恢复</Text>
            <View className='symptom-sheet__actions'>
              <View
                className='symptom-sheet__btn symptom-sheet__btn--danger'
                onClick={handleDelete}
              >
                <Text>确认删除</Text>
              </View>
              <View
                className='symptom-sheet__btn symptom-sheet__btn--cancel'
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
