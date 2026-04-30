/**
 * 饮食记录表单页（MP 迁移）
 *
 * 与 Web pages/records/feeding/index.tsx 保持业务逻辑对齐。
 * 差异：路由/Taro 组件/存储方案按平台适配。
 *
 * 子组件拆分与 Web 1:1 对应：
 *  - TabSelector      四 Tab 切换
 *  - FormulaSection   配方奶 Tab
 *  - BreastSection    母乳 Tab
 *  - SupplementSection 营养素 Tab
 *  - FoodSection      辅食 Tab
 */
import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { babyApi, familyApi, recordsApi } from '@/api'
import type { FeedTab, MilkType } from './types'
import { milkTypeOptions, suppItems } from './types'
import TabSelector from './TabSelector'
import FormulaSection from './FormulaSection'
import BreastSection from './BreastSection'
import SupplementSection from './SupplementSection'
import FoodSection from './FoodSection'
import './index.scss'

// ---------------------------------------------------------------------------
// 时间工具
// ---------------------------------------------------------------------------
function nowHhmm(): string { return dayjs().format('HH:mm') }
function nowDateStr(): string { return dayjs().format('YYYY-MM-DD') }
function hhmmToIso(date: string, hhmm: string): string { return dayjs(`${date}T${hhmm}:00`).toISOString() }
function isoToDate(iso: string): string { return dayjs(iso).format('YYYY-MM-DD') }
function isoToTime(iso: string): string { return dayjs(iso).format('HH:mm') }
function addMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = ((h * 60 + m + delta) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
function timeDiffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let diff = eh * 60 + em - (sh * 60 + sm)
  if (diff < 0) diff += 1440
  return diff
}

// ---------------------------------------------------------------------------
// 上次配方缓存 (Taro Storage)
// ---------------------------------------------------------------------------
const LAST_FORMULA_KEY_PREFIX = 'minicare_last_formula_'

interface LastFormulaCache {
  milkTypes: MilkType[]
  scoops: Record<MilkType, number>
  formulaMl: number
}

function loadLastFormula(babyId: string): LastFormulaCache | null {
  try {
    const raw = Taro.getStorageSync(LAST_FORMULA_KEY_PREFIX + babyId)
    if (!raw) return null
    return JSON.parse(raw) as LastFormulaCache
  } catch { return null }
}

function saveLastFormula(babyId: string, data: LastFormulaCache) {
  try { Taro.setStorageSync(LAST_FORMULA_KEY_PREFIX + babyId, JSON.stringify(data)) } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// 页面入口
// ---------------------------------------------------------------------------
export default function FeedingFormPage() {
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editRecordId, setEditRecordId] = useState('')
  const isEditMode = editRecordId !== ''

  const [tab, setTab] = useState<FeedTab>('formula')
  const [recordDate, setRecordDate] = useState(nowDateStr())
  const [recordTime, setRecordTime] = useState(nowHhmm())
  const [note, setNote] = useState('')

  // 配方奶
  const [selectedMilkTypes, setSelectedMilkTypes] = useState<Set<MilkType>>(new Set(['aa'] as MilkType[]))
  const [scoops, setScoops] = useState<Record<MilkType, number>>({ aa: 3, eh_lactose: 0, eh_no_lactose: 0, ph: 0, std: 0 })
  const [formulaMl, setFormulaMl] = useState(120)
  const [formulaEndTime, setFormulaEndTime] = useState(() => addMinutes(nowHhmm(), 10))
  const endTimeUserSetRef = useRef(false)
  const [loadedFromLast, setLoadedFromLast] = useState(false)
  const [ratioExpanded, setRatioExpanded] = useState(false)

  // 母乳
  const [breastSide, setBreastSide] = useState<'left' | 'right' | 'both'>('left')
  const [durationMin, setDurationMin] = useState(15)

  // 营养素
  const [suppChecked, setSuppChecked] = useState<Record<string, boolean>>({})
  const [suppDose, setSuppDose] = useState<Record<string, string>>({})
  const [suppOtherName, setSuppOtherName] = useState('')
  const [suppOtherDose, setSuppOtherDose] = useState('')
  const [suppOtherUnit, setSuppOtherUnit] = useState('')

  // 辅食
  const [foodList, setFoodList] = useState<string[]>([])
  const [foodInput, setFoodInput] = useState('')

  // -----------------------------------------------------------------------
  // 初始化
  // -----------------------------------------------------------------------
  useLoad((options) => {
    const initTab = (options?.tab as FeedTab | undefined) ?? 'formula'
    const initRecordId = (options?.recordId as string | undefined) ?? ''
    init(initTab, initRecordId)
  })

  const init = async (initTab: FeedTab, initRecordId: string) => {
    setTab(initTab)
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

      if (!initRecordId) {
        const last = loadLastFormula(baby.id)
        if (last) {
          if (last.milkTypes?.length) setSelectedMilkTypes(new Set(last.milkTypes))
          if (last.scoops) setScoops((prev) => ({ ...prev, ...last.scoops }))
          if (last.formulaMl != null) setFormulaMl(last.formulaMl)
          setLoadedFromLast(true)
        }
      } else {
        try {
          const rec = await recordsApi.feeding.getOne(fid, initRecordId)
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

  const populateEditForm = (rec: Record<string, unknown>) => {
    const ft = rec.feed_type as string | undefined
    if (rec.record_time) {
      setRecordDate(isoToDate(rec.record_time as string))
      setRecordTime(isoToTime(rec.record_time as string))
    }
    if (ft === 'breast') {
      setTab('breast')
      if (rec.breast_side) setBreastSide(rec.breast_side as 'left' | 'right' | 'both')
      if (rec.duration_min != null) setDurationMin(rec.duration_min as number)
    } else if (ft === 'complementary') {
      if (rec.complementary_food === '营养素') setTab('supplement')
      else setTab('food')
      if (rec.supplement_items && Array.isArray(rec.supplement_items)) {
        const checked: Record<string, boolean> = {}
        const dose: Record<string, string> = {}
        for (const item of rec.supplement_items as Array<Record<string, unknown>>) {
          if (item.key && item.key !== 'other') {
            checked[item.key as string] = true
            if (item.dose) dose[item.key as string] = item.dose as string
          }
        }
        setSuppChecked(checked)
        setSuppDose(dose)
        const other = (rec.supplement_items as Array<Record<string, unknown>>).find((i) => i.key === 'other')
        if (other) {
          setSuppOtherName((other.label as string) ?? '')
          setSuppOtherDose((other.dose as string) ?? '')
          setSuppOtherUnit((other.unit as string) ?? '')
        }
      }
      if (rec.complementary_food && rec.complementary_food !== '营养素') {
        setFoodList((rec.complementary_food as string).split('、').filter(Boolean))
      }
    } else {
      setTab('formula')
      if (rec.formula_ml != null) setFormulaMl(rec.formula_ml as number)
      if (rec.milk_types) setSelectedMilkTypes(new Set(rec.milk_types as MilkType[]))
      if (rec.milk_scoops) setScoops((prev) => ({ ...prev, ...(rec.milk_scoops as Record<MilkType, number>) }))
      if (rec.duration_min != null && (rec.duration_min as number) > 0) {
        const start = rec.record_time ? isoToTime(rec.record_time as string) : recordTime
        setFormulaEndTime(addMinutes(start, rec.duration_min as number))
        endTimeUserSetRef.current = true
      }
    }
    if (rec.note) setNote(rec.note as string)
  }

  // 结束时间联动
  useEffect(() => {
    if (!endTimeUserSetRef.current) setFormulaEndTime(addMinutes(recordTime, 10))
  }, [recordTime])

  // -----------------------------------------------------------------------
  // 配方奶 helper
  // -----------------------------------------------------------------------
  const toggleMilkType = (key: MilkType) => {
    setSelectedMilkTypes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key); setScoops((s) => ({ ...s, [key]: 0 })) }
      else next.add(key)
      return next
    })
  }
  const updateScoop = (key: MilkType, val: number) => {
    setScoops((prev) => ({ ...prev, [key]: Math.max(0, Math.min(20, val)) }))
  }
  const addFood = () => {
    const t = foodInput.trim()
    if (!t) return
    setFoodList((prev) => (prev.includes(t) ? prev : [...prev, t]))
    setFoodInput('')
  }
  const removeFood = (idx: number) => setFoodList((prev) => prev.filter((_, i) => i !== idx))

  // -----------------------------------------------------------------------
  // 提交
  // -----------------------------------------------------------------------
  const handleSubmit = async () => {
    if (!familyId || !babyId) { Taro.showToast({ title: '请先完成宝宝建档', icon: 'none' }); return }
    setSubmitting(true)
    try {
      const isoTime = hhmmToIso(recordDate, recordTime)
      let payload: Record<string, unknown>

      if (tab === 'formula') {
        const activeKeys = milkTypeOptions.filter((m) => selectedMilkTypes.has(m.key) && scoops[m.key] > 0).map((m) => m.key)
        const activeScoops: Record<string, number> = {}
        activeKeys.forEach((k) => { activeScoops[k] = scoops[k] })
        const d = timeDiffMinutes(recordTime, formulaEndTime)
        payload = { baby_id: babyId, feed_type: 'formula', record_time: isoTime, formula_ml: formulaMl, duration_min: d > 0 ? d : undefined, milk_types: activeKeys.length > 0 ? activeKeys : undefined, milk_scoops: activeKeys.length > 0 ? activeScoops : undefined, note: note || undefined }
      } else if (tab === 'breast') {
        payload = { baby_id: babyId, feed_type: 'breast', record_time: isoTime, breast_side: breastSide, duration_min: durationMin, note: note || undefined }
      } else if (tab === 'food') {
        payload = { baby_id: babyId, feed_type: 'complementary', record_time: isoTime, complementary_food: foodList.length > 0 ? foodList.join('、') : '辅食', note: note || undefined }
      } else {
        const activeItems = suppItems.filter((s) => suppChecked[s.key]).map((s) => ({ key: s.key, label: s.label, dose: suppDose[s.key] || '', unit: s.unit }))
        if (suppOtherName.trim()) activeItems.push({ key: 'other', label: suppOtherName.trim(), dose: suppOtherDose || '', unit: suppOtherUnit || '' })
        payload = { baby_id: babyId, feed_type: 'complementary', record_time: isoTime, complementary_food: '营养素', supplement_items: activeItems.length > 0 ? activeItems : undefined, note: note || undefined }
      }

      if (isEditMode) {
        const { baby_id: _, ...updatePayload } = payload
        await recordsApi.feeding.update(familyId, editRecordId, updatePayload)
      } else {
        await recordsApi.feeding.create(familyId, payload)
      }

      if (!isEditMode && tab === 'formula') {
        const activeKeys2 = milkTypeOptions.filter((m) => selectedMilkTypes.has(m.key) && scoops[m.key] > 0).map((m) => m.key)
        saveLastFormula(babyId, { milkTypes: activeKeys2.length > 0 ? activeKeys2 : Array.from(selectedMilkTypes), scoops, formulaMl })
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
      await recordsApi.feeding.remove(familyId, editRecordId)
      Taro.showToast({ title: '记录已删除', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 800)
    } catch { Taro.showToast({ title: '删除失败', icon: 'none' }) }
  }

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <View className='feed-page'>
        <View className='feed-loading'><Text>加载中...</Text></View>
      </View>
    )
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <View className='feed-page'>
      {/* 导航栏 */}
      <View className='feed-nav'>
        <View className='feed-nav__back' onClick={() => Taro.navigateBack()}>
          <Text className='feed-nav__back-arrow'>{'<'}</Text>
        </View>
        <Text className='feed-nav__title'>{isEditMode ? '编辑饮食记录' : '饮食记录'}</Text>
        {isEditMode ? (
          <View className='feed-nav__delete' onClick={handleDelete}>
            <Text className='feed-nav__delete-text'>删除</Text>
          </View>
        ) : (
          <View className='feed-nav__spacer' />
        )}
      </View>

      <View className='feed-body'>
        <TabSelector value={tab} onChange={setTab} />

        {/* 日期时间 */}
        <View className='feed-card'>
          <View className='feed-row feed-row--border'>
            <Text className='feed-row__label'>记录日期</Text>
            <Picker mode='date' value={recordDate} onChange={(e) => setRecordDate(e.detail.value)}>
              <View className='feed-row__picker'><Text>{recordDate}</Text></View>
            </Picker>
          </View>
          <View className={`feed-row ${tab === 'formula' ? 'feed-row--border' : ''}`}>
            <Text className='feed-row__label'>喂养时间</Text>
            <Picker mode='time' value={recordTime} onChange={(e) => setRecordTime(e.detail.value)}>
              <View className='feed-row__picker'><Text>{recordTime}</Text></View>
            </Picker>
          </View>
          {tab === 'formula' && (
            <View className='feed-row'>
              <Text className='feed-row__label'>结束时间</Text>
              <Picker mode='time' value={formulaEndTime} onChange={(e) => { endTimeUserSetRef.current = true; setFormulaEndTime(e.detail.value) }}>
                <View className='feed-row__picker'><Text>{formulaEndTime}</Text></View>
              </Picker>
            </View>
          )}
        </View>

        {/* 配方奶 */}
        {tab === 'formula' && (
          <FormulaSection
            selectedMilkTypes={selectedMilkTypes}
            onToggleMilkType={toggleMilkType}
            scoops={scoops}
            onUpdateScoop={updateScoop}
            formulaMl={formulaMl}
            onChangeFormulaMl={setFormulaMl}
            loadedFromLast={loadedFromLast}
            ratioExpanded={ratioExpanded}
            onSetRatioExpanded={setRatioExpanded}
            onResetToDefault={() => {
              setSelectedMilkTypes(new Set(['aa'] as MilkType[]))
              setScoops({ aa: 3, eh_lactose: 0, eh_no_lactose: 0, ph: 0, std: 0 })
              setFormulaMl(120)
              setLoadedFromLast(false)
            }}
            isEditMode={isEditMode}
          />
        )}

        {/* 母乳 */}
        {tab === 'breast' && (
          <BreastSection breastSide={breastSide} onChangeSide={setBreastSide} durationMin={durationMin} onChangeDuration={setDurationMin} />
        )}

        {/* 营养素 */}
        {tab === 'supplement' && (
          <SupplementSection
            checked={suppChecked}
            dose={suppDose}
            onToggle={(key) => setSuppChecked((p) => ({ ...p, [key]: !p[key] }))}
            onDoseChange={(key, val) => setSuppDose((p) => ({ ...p, [key]: val }))}
            otherName={suppOtherName}
            onOtherNameChange={setSuppOtherName}
            otherDose={suppOtherDose}
            onOtherDoseChange={setSuppOtherDose}
            otherUnit={suppOtherUnit}
            onOtherUnitChange={setSuppOtherUnit}
          />
        )}

        {/* 辅食 */}
        {tab === 'food' && (
          <FoodSection foodList={foodList} inputValue={foodInput} onInputChange={setFoodInput} onAdd={addFood} onRemove={removeFood} />
        )}

        {/* 备注 */}
        <View className='feed-section-label'><Text>备注</Text></View>
        <View className='feed-card'>
          <Input className='feed-note-input' placeholder='如宝宝状态、品牌等...' value={note} onInput={(e) => setNote(e.detail.value)} />
        </View>
      </View>

      {/* 提交 */}
      <View className='feed-submit'>
        <View className={`feed-submit__btn ${submitting ? 'feed-submit__btn--loading' : ''}`} onClick={submitting ? undefined : handleSubmit}>
          <Text className='feed-submit__text'>{submitting ? '提交中...' : isEditMode ? '更新记录' : '保存记录'}</Text>
        </View>
      </View>
    </View>
  )
}
