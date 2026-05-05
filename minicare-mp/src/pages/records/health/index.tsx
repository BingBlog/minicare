/**
 * 健康记录表单页（MP 迁移）
 *
 * 与 Web pages/records/health/index.tsx 保持 1:1 业务逻辑对齐。
 */
import { View, Text, Textarea, Picker, Image } from '@tarojs/components'
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
import TemperatureSection from './TemperatureSection'
import AllergySection from './AllergySection'
import type { Severity } from './AllergySection'
import { useIsIPad } from '@/lib/useIsIPad'
import './index.scss'

/** 保湿护理分组 Chip 列表 */
const SKIN_GROUPS: { label: string; chips: string[] }[] = [
  { label: '面部保湿', chips: ['涂抹面霜', '涂抹润肤露', '涂抹保湿喷雾'] },
  { label: '身体保湿', chips: ['涂抹身体乳', '涂抹润肤油', '涂抹护臀霜'] },
]

// ── SVG 图标 ──
const ICON_THERMOMETER = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>')}`
const ICON_ALERT = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F0A0B0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>')}`
const ICON_HEART = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>')}`
const ICON_CHEVRON = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#C0A8B0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="6 9 12 15 18 9"/></svg>')}`

/** 过敏程度中文 */
const SEVERITY_LABEL: Record<string, string> = { mild: '轻度', moderate: '中度', severe: '重度' }

export default function HealthFormPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => isIPad ? `${base} is-ipad` : base
  // ── 表单状态 ──
  const [recordDate, setRecordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [temperature, setTemperature] = useState('36.5')
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([])
  const [severity, setSeverity] = useState<Severity | null>(null)
  const [selectedSkin, setSelectedSkin] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')

  // ── 折叠状态 ──
  const [tempOpen, setTempOpen] = useState(true)
  const [allergyOpen, setAllergyOpen] = useState(false)
  const [skinOpen, setSkinOpen] = useState(false)

  // ── 通用初始化 ──
  const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit<HealthRecord>({
    loadRecord: (fid, rid) => recordsApi.health.getOne(fid, rid),
    onRecord: (r) => {
      if (r.record_time) {
        setRecordDate(isoToLocalDate(r.record_time))
        setRecordTime(isoToLocalTime(r.record_time))
      }
      if (r.temperature != null) setTemperature(String(r.temperature))
      setSelectedSymptoms(r.allergy_symptoms ?? [])
      setSeverity(r.allergy_severity ?? null)
      setSelectedSkin(new Set(r.skin_care ?? []))
      setNote(r.note ?? '')
      if ((r.allergy_symptoms?.length ?? 0) > 0) setAllergyOpen(true)
      if ((r.skin_care?.length ?? 0) > 0) setSkinOpen(true)
    },
    parseOptions: (opts) => ({
      expandTemp: opts.expandTemp === 'true',
      expandAllergy: opts.expandAllergy === 'true',
      expandSkin: opts.expandSkin === 'true',
    }),
    onExtraOptions: (extra) => {
      if (extra.expandTemp) setTempOpen(true)
      if (extra.expandAllergy) setAllergyOpen(true)
      if (extra.expandSkin) setSkinOpen(true)
    },
  })

  // ── 通用提交/删除 ──
  const { submitting, deleteConfirmOpen, setDeleteConfirmOpen, handleSubmit, handleDelete } = useRecordSubmit()

  // ── 过敏/护理切换 ──
  const toggleSymptom = (s: string) => {
    setSelectedSymptoms((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
  }
  const toggleSkin = (s: string) => {
    setSelectedSkin((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })
  }

  // ── 提交 ──
  const onSubmit = () => handleSubmit({
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
        allergy_symptoms: selectedSymptoms.length > 0 ? selectedSymptoms : undefined,
        allergy_severity: selectedSymptoms.length > 0 ? (severity ?? undefined) : undefined,
        skin_care: selectedSkin.size > 0 ? [...selectedSkin] : undefined,
        note: note || undefined,
      }
      if (isEditMode) {
        await recordsApi.health.update(familyId, editRecordId, payload)
        return '健康记录已更新'
      } else {
        await recordsApi.health.create(familyId, { baby_id: babyId, ...payload })
        return '健康记录已保存'
      }
    },
  })

  // ── 删除 ──
  const onDelete = () => handleDelete({
    execute: () => recordsApi.health.remove(familyId, editRecordId),
  })

  // ── 折叠态摘要 ──
  const tempBadge = temperature ? `${temperature} ℃` : ''
  const allergyBadge = (() => {
    if (selectedSymptoms.length === 0) return ''
    const sevLabel = severity ? ` ${SEVERITY_LABEL[severity]}` : ''
    return `${selectedSymptoms.length} 项${sevLabel}`
  })()
  const skinBadge = selectedSkin.size > 0 ? `已选 ${selectedSkin.size} 项` : ''

  // ── Loading ──
  if (loading) {
    return (
      <View className={cls('health-page')}>
        <RecordNavBar title='健康记录' isEditMode={false} />
        <PageLoading />
      </View>
    )
  }

  return (
    <View className={cls('health-page')}>
      <RecordNavBar
        title='健康记录'
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

        {/* ── 体温 ── */}
        <View className='health-collapse-card'>
          <View className='health-collapse-card__header' onClick={() => setTempOpen((v) => !v)}>
            <Image className='health-collapse-card__icon' src={ICON_THERMOMETER} />
            <Text className='health-collapse-card__title'>体温（可选）</Text>
            {!tempOpen && tempBadge ? <Text className='health-collapse-card__badge'>{tempBadge}</Text> : null}
            <Image className={`health-collapse-card__arrow ${tempOpen ? 'health-collapse-card__arrow--open' : ''}`} src={ICON_CHEVRON} />
          </View>
          {tempOpen ? <TemperatureSection value={temperature} onChange={setTemperature} /> : null}
        </View>

        {/* ── 过敏表现 ── */}
        <View className='health-collapse-card'>
          <View className='health-collapse-card__header' onClick={() => setAllergyOpen((v) => !v)}>
            <Image className='health-collapse-card__icon' src={ICON_ALERT} />
            <Text className='health-collapse-card__title'>过敏表现</Text>
            {!allergyOpen && allergyBadge ? <Text className='health-collapse-card__badge'>{allergyBadge}</Text> : null}
            <Image className={`health-collapse-card__arrow ${allergyOpen ? 'health-collapse-card__arrow--open' : ''}`} src={ICON_CHEVRON} />
          </View>
          {allergyOpen ? (
            <AllergySection selected={selectedSymptoms} onToggle={toggleSymptom} severity={severity} onSeverityChange={setSeverity} />
          ) : null}
          {!allergyOpen && selectedSymptoms.length === 0 ? (
            <View className='health-collapse-card__hint'><Text>无过敏表现则跳过</Text></View>
          ) : null}
        </View>

        {/* ── 保湿护理 ── */}
        <View className='health-collapse-card'>
          <View className='health-collapse-card__header' onClick={() => setSkinOpen((v) => !v)}>
            <Image className='health-collapse-card__icon' src={ICON_HEART} />
            <Text className='health-collapse-card__title'>保湿护理</Text>
            {!skinOpen && skinBadge ? <Text className='health-collapse-card__badge'>{skinBadge}</Text> : null}
            <Image className={`health-collapse-card__arrow ${skinOpen ? 'health-collapse-card__arrow--open' : ''}`} src={ICON_CHEVRON} />
          </View>
          {skinOpen ? (
            <View className='health-skin'>
              {SKIN_GROUPS.map((group) => (
                <View key={group.label} className='health-skin__group'>
                  <Text className='health-skin__group-label'>{group.label}</Text>
                  <View className='health-skin__chips'>
                    {group.chips.map((chip) => (
                      <View
                        key={chip}
                        className={`health-skin__chip ${selectedSkin.has(chip) ? 'health-skin__chip--active' : ''}`}
                        onClick={() => toggleSkin(chip)}
                      >
                        <Text>{chip}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {!skinOpen && selectedSkin.size === 0 ? (
            <View className='health-collapse-card__hint'><Text>今日未做护理则跳过</Text></View>
          ) : null}
        </View>

        {/* ── 备注 ── */}
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
