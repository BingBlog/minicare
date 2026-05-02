/**
 * 健康记录表单页（MP 迁移）
 *
 * 与 Web pages/records/health/index.tsx 保持 1:1 业务逻辑对齐。
 * 差异：路由/Taro 组件/存储方案按平台适配。
 *
 * 子组件拆分与 Web 1:1 对应（强制规则）：
 *  - TemperatureSection  体温步进器 + 高温警告
 *  - AllergySection      过敏症状 9 项网格 + 程度 + 拍照
 *
 * 折叠交互（与 Web 一致）：
 *  - 体温：默认展开（最常用），可折叠
 *  - 过敏表现：默认折叠，有数据时展开
 *  - 保湿护理：默认折叠，有数据时展开
 *
 * 编辑模式：通过 recordId URL 参数传入，进入页面时查询最新数据回填表单
 */
import { View, Text, Textarea, Picker, Image } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState, useRef } from 'react'
import dayjs from 'dayjs'
import { familyApi, babyApi, recordsApi } from '@/api'
import { getStatusBarHeight } from '@/lib/safeArea'
import TemperatureSection from './TemperatureSection'
import AllergySection from './AllergySection'
import type { Severity } from './AllergySection'
import './index.scss'

// ── 时间工具（与 Web shared 1:1 对齐） ──
function nowTime(): string { return dayjs().format('HH:mm') }
function nowDate(): string { return dayjs().format('YYYY-MM-DD') }
function isoToLocalDate(iso: string): string { return dayjs(iso).format('YYYY-MM-DD') }
function isoToLocalTime(iso: string): string { return dayjs(iso).format('HH:mm') }

/** 保湿护理 Chip 列表（与 Web SKIN_CHIPS 完全一致） */
const SKIN_CHIPS = ['已做保湿', '涂抹面霜', '涂抹身体乳']

// ── SVG 图标 Data URI（避免小程序中内联 SVG 兼容性问题）──
/** 温度计图标 (stroke #F0B8C8) */
const ICON_THERMOMETER = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>')}`
/** 警告三角图标 (stroke #F0A0B0) */
const ICON_ALERT = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F0A0B0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>')}`
/** 心形图标 (stroke #F0B8C8) */
const ICON_HEART = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>')}`
/** Chevron 箭头图标 (stroke #C0A8B0) */
const ICON_CHEVRON = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#C0A8B0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="6 9 12 15 18 9"/></svg>')}`

/** 过敏程度中文（折叠态摘要用） */
const SEVERITY_LABEL: Record<string, string> = {
  mild: '轻度',
  moderate: '中度',
  severe: '重度',
}

export default function HealthFormPage() {
  // ── 初始化状态 ──
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const [editRecordId, setEditRecordId] = useState('')
  const isEditMode = editRecordId !== ''
  const initDoneRef = useRef(false)

  // ── 表单状态 ──
  const [recordDate, setRecordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [temperature, setTemperature] = useState('36.5')
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([])
  const [severity, setSeverity] = useState<Severity | null>(null)
  const [selectedSkin, setSelectedSkin] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── 折叠状态 ──
  const [tempOpen, setTempOpen] = useState(true)
  const [allergyOpen, setAllergyOpen] = useState(false)
  const [skinOpen, setSkinOpen] = useState(false)

  // ── 删除确认 ──
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // ── 初始化 ──
  useLoad((options) => {
    if (initDoneRef.current) return
    initDoneRef.current = true
    const rid = (options?.recordId as string | undefined) ?? ''
    if (options?.expandTemp === 'true') setTempOpen(true)
    if (options?.expandAllergy === 'true') setAllergyOpen(true)
    if (options?.expandSkin === 'true') setSkinOpen(true)
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
          const fresh = await recordsApi.health.getOne(fid, rid)
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
    if (r.temperature != null) setTemperature(String(r.temperature))
    const symptoms = r.allergy_symptoms as string[] | null | undefined
    setSelectedSymptoms(symptoms ?? [])
    setSeverity((r.allergy_severity as Severity) ?? null)
    const skin = r.skin_care as string[] | null | undefined
    setSelectedSkin(new Set(skin ?? []))
    setNote((r.note as string) ?? '')
    // 有数据时自动展开对应区块
    if ((symptoms?.length ?? 0) > 0) setAllergyOpen(true)
    if ((skin?.length ?? 0) > 0) setSkinOpen(true)
  }

  // ── 过敏切换 ──
  const toggleSymptom = (s: string) => {
    setSelectedSymptoms((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  // ── 护理切换 ──
  const toggleSkin = (s: string) => {
    setSelectedSkin((prev) => {
      const n = new Set(prev)
      n.has(s) ? n.delete(s) : n.add(s)
      return n
    })
  }

  // ── 提交 ──
  const handleSubmit = async () => {
    if (!familyId || !babyId) {
      Taro.showToast({ title: '请先完成宝宝建档', icon: 'none' })
      return
    }
    const temp = temperature ? parseFloat(temperature) : undefined
    if (temp !== undefined && (temp < 35 || temp > 42)) {
      Taro.showToast({ title: '体温范围应为 35~42 度', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        record_time: `${recordDate}T${recordTime}:00`,
        temperature: temp,
        allergy_symptoms: selectedSymptoms.length > 0 ? selectedSymptoms : undefined,
        allergy_severity: selectedSymptoms.length > 0 ? (severity ?? undefined) : undefined,
        skin_care: selectedSkin.size > 0 ? [...selectedSkin] : undefined,
        note: note || undefined,
      }

      if (isEditMode) {
        await recordsApi.health.update(familyId, editRecordId, payload)
        Taro.showToast({ title: '健康记录已更新', icon: 'success' })
      } else {
        await recordsApi.health.create(familyId, { baby_id: babyId, ...payload })
        Taro.showToast({ title: '健康记录已保存', icon: 'success' })
      }
      setTimeout(() => Taro.navigateBack(), 1400)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败，请重试'
      Taro.showToast({ title: msg, icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── 删除 ──
  const handleDelete = async () => {
    if (!familyId || !editRecordId) return
    try {
      await recordsApi.health.remove(familyId, editRecordId)
      Taro.showToast({ title: '记录已删除', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 1200)
    } catch {
      Taro.showToast({ title: '删除失败，请重试', icon: 'none' })
    }
    setDeleteConfirmOpen(false)
  }

  // ── 折叠态摘要 ──
  const tempBadge = temperature ? `${temperature} ℃` : ''
  const allergyBadge = (() => {
    if (selectedSymptoms.length === 0) return ''
    const sevLabel = severity ? ` ${SEVERITY_LABEL[severity]}` : ''
    return `${selectedSymptoms.length} 项${sevLabel}`
  })()
  const skinBadge = selectedSkin.size > 0 ? `已选 ${selectedSkin.size} 项` : ''

  const statusBarHeight = getStatusBarHeight()

  // ── 加载中 ──
  if (loading) {
    return (
      <View className='health-page'>
        <View className='health-nav' style={{ paddingTop: `${statusBarHeight}px` }}>
          <View className='health-nav__content'>
            <Text className='health-nav__title'>健康记录</Text>
          </View>
        </View>
        <View className='health-loading'>
          <Text className='health-loading__text'>加载中...</Text>
        </View>
      </View>
    )
  }

  return (
    <View className='health-page'>
      {/* ── 导航栏 ── */}
      <View className='health-nav' style={{ paddingTop: `${statusBarHeight}px` }}>
        <View className='health-nav__content'>
          <View className='health-nav__back' onClick={() => Taro.navigateBack()}>
            <Text className='health-nav__back-icon'>{'\u2039'}</Text>
          </View>
          <Text className='health-nav__title'>
            {isEditMode ? '编辑健康记录' : '健康记录'}
          </Text>
          <View className='health-nav__placeholder' />
        </View>
      </View>

      {/* ── 表单主体 ── */}
      <View className='health-body'>
        {/* 记录时间 */}
        <View className='health-section-label'>
          <Text>记录时间</Text>
        </View>
        <View className='health-card'>
          <View className='health-card__row health-card__row--border'>
            <Text className='health-card__label'>记录日期</Text>
            <View className='health-card__picker'>
              <Picker
                mode='date'
                value={recordDate}
                onChange={(e) => setRecordDate(e.detail.value)}
              >
                <Text className='health-card__picker-text'>{recordDate}</Text>
              </Picker>
            </View>
          </View>
          <View className='health-card__row'>
            <Text className='health-card__label'>记录时间</Text>
            <View className='health-card__picker'>
              <Picker
                mode='time'
                value={recordTime}
                onChange={(e) => setRecordTime(e.detail.value)}
              >
                <Text className='health-card__picker-text'>{recordTime}</Text>
              </Picker>
            </View>
          </View>
        </View>

        {/* ── 体温（默认展开） ── */}
        <View className='health-collapse-card'>
          <View className='health-collapse-card__header' onClick={() => setTempOpen((v) => !v)}>
            <Image className='health-collapse-card__icon' src={ICON_THERMOMETER} />
            <Text className='health-collapse-card__title'>体温（可选）</Text>
            {!tempOpen && tempBadge ? (
              <Text className='health-collapse-card__badge'>{tempBadge}</Text>
            ) : null}
            <Image className={`health-collapse-card__arrow ${tempOpen ? 'health-collapse-card__arrow--open' : ''}`} src={ICON_CHEVRON} />
          </View>
          {tempOpen ? <TemperatureSection value={temperature} onChange={setTemperature} /> : null}
        </View>

        {/* ── 过敏表现（默认折叠） ── */}
        <View className='health-collapse-card'>
          <View className='health-collapse-card__header' onClick={() => setAllergyOpen((v) => !v)}>
            <Image className='health-collapse-card__icon' src={ICON_ALERT} />
            <Text className='health-collapse-card__title'>过敏表现</Text>
            {!allergyOpen && allergyBadge ? (
              <Text className='health-collapse-card__badge'>{allergyBadge}</Text>
            ) : null}
            <Image className={`health-collapse-card__arrow ${allergyOpen ? 'health-collapse-card__arrow--open' : ''}`} src={ICON_CHEVRON} />
          </View>
          {allergyOpen ? (
            <AllergySection
              selected={selectedSymptoms}
              onToggle={toggleSymptom}
              severity={severity}
              onSeverityChange={setSeverity}
            />
          ) : null}
          {!allergyOpen && selectedSymptoms.length === 0 ? (
            <View className='health-collapse-card__hint'>
              <Text>无过敏表现则跳过</Text>
            </View>
          ) : null}
        </View>

        {/* ── 保湿护理（默认折叠） ── */}
        <View className='health-collapse-card'>
          <View className='health-collapse-card__header' onClick={() => setSkinOpen((v) => !v)}>
            <Image className='health-collapse-card__icon' src={ICON_HEART} />
            <Text className='health-collapse-card__title'>保湿护理</Text>
            {!skinOpen && skinBadge ? (
              <Text className='health-collapse-card__badge'>{skinBadge}</Text>
            ) : null}
            <Image className={`health-collapse-card__arrow ${skinOpen ? 'health-collapse-card__arrow--open' : ''}`} src={ICON_CHEVRON} />
          </View>
          {skinOpen ? (
            <View className='health-skin'>
              {SKIN_CHIPS.map((chip) => (
                <View
                  key={chip}
                  className={`health-skin__chip ${selectedSkin.has(chip) ? 'health-skin__chip--active' : ''}`}
                  onClick={() => toggleSkin(chip)}
                >
                  <Text>{chip}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {!skinOpen && selectedSkin.size === 0 ? (
            <View className='health-collapse-card__hint'>
              <Text>今日未做护理则跳过</Text>
            </View>
          ) : null}
        </View>

        {/* ── 备注 ── */}
        <View className='health-section-label'>
          <Text>备注（可选）</Text>
        </View>
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
      <View className='health-submit'>
        <View className='health-submit__inner'>
          {isEditMode ? (
            <View
              className='health-submit__btn health-submit__btn--delete'
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Text className='health-submit__btn-text health-submit__btn-text--delete'>删除</Text>
            </View>
          ) : null}
          <View
            className={`health-submit__btn health-submit__btn--primary ${submitting ? 'health-submit__btn--disabled' : ''}`}
            onClick={submitting ? undefined : handleSubmit}
          >
            <Text className='health-submit__btn-text'>
              {submitting ? '保存中…' : isEditMode ? '更新记录' : '保存记录'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── 删除确认底部 Sheet ── */}
      {deleteConfirmOpen ? (
        <View className='health-sheet-mask' onClick={() => setDeleteConfirmOpen(false)}>
          <View className='health-sheet' onClick={(e) => e.stopPropagation()}>
            <View className='health-sheet__handle' />
            <Text className='health-sheet__title'>确定删除这条记录吗？</Text>
            <Text className='health-sheet__desc'>删除后无法恢复</Text>
            <View className='health-sheet__actions'>
              <View
                className='health-sheet__btn health-sheet__btn--danger'
                onClick={handleDelete}
              >
                <Text>确认删除</Text>
              </View>
              <View
                className='health-sheet__btn health-sheet__btn--cancel'
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
