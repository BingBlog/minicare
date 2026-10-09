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
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { babyApi, recordsApi, foodObservationApi } from '@/api'
import { getStoredFamilyId, getStoredBabyId } from '@/api/http'
import type { FeedingRecord, CreateFeedingDto, UpdateFeedingDto } from '@/api/feeding'
import { getStatusBarHeight } from '@/lib/safeArea'
import { nowTime, nowDate, toLocalISO, isoToLocalDate, isoToLocalTime, addMinutes, timeDiffMinutes, decodeParams } from '@/lib/utils'
import type { FeedTab, MilkType } from './types'
import type { FedFoodInfo } from './FoodSection'
import { milkTypeOptions, suppItems } from './types'
import TabSelector from './TabSelector'
import FormulaSection from './FormulaSection'
import BreastSection from './BreastSection'
import SupplementSection from './SupplementSection'
import FoodSection from './FoodSection'
import ConfirmSheet from '@/components/ConfirmSheet'
import { useIsIPad } from '@/lib/useIsIPad'
import './index.scss'

// ---------------------------------------------------------------------------
// 时间工具别名（统一使用 @/lib/utils 导出）
// ---------------------------------------------------------------------------
const nowHhmm = nowTime
const nowDateStr = nowDate
const hhmmToIso = toLocalISO
const isoToDate = isoToLocalDate
const isoToTime = isoToLocalTime

// ---------------------------------------------------------------------------
// 上次配方（远程查询：取该宝宝最近一条配方奶记录）
// 多人协同场景下，本地缓存会让新加入的家庭成员读到错误的默认值，
// 改为统一从服务端拉取最新一条 formula 记录作为默认配方。
// ---------------------------------------------------------------------------
interface LastFormulaCache {
  milkTypes: MilkType[]
  scoops: Record<MilkType, number>
  formulaMl: number
}

async function fetchLastFormula(familyId: string, babyId: string): Promise<LastFormulaCache | null> {
  try {
    const res = await recordsApi.feeding.list(familyId, babyId)
    const lastFormula = res.items.find((r) => r.feed_type === 'formula')
    if (!lastFormula) return null
    return {
      milkTypes: (lastFormula.milk_types ?? []) as MilkType[],
      scoops: (lastFormula.milk_scoops ?? {}) as Record<MilkType, number>,
      formulaMl: lastFormula.formula_ml ?? 0,
    }
  } catch {
    // 远程查询失败时静默回退到硬编码默认值，不阻塞表单使用
    return null
  }
}

// ---------------------------------------------------------------------------
// 页面入口
// ---------------------------------------------------------------------------
export default function FeedingFormPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => isIPad ? `${base} is-ipad` : base
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editRecordId, setEditRecordId] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const isEditMode = editRecordId !== ''
  const initDoneRef = useRef(false)

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
  const [fedFoods, setFedFoods] = useState<FedFoodInfo[]>([])

  // -----------------------------------------------------------------------
  // 初始化
  // -----------------------------------------------------------------------
  useLoad((options) => {
    if (initDoneRef.current) return
    initDoneRef.current = true
    // ⚠️ Taro 不对查询串解码，发送端（今日日程 / 记录列表）是 encodeURIComponent →
    // 这里必须统一解码，否则 initTime 会带 `%3A` 直接进表单（渲染成 NaN:NaN）。
    const params = decodeParams(options as Record<string, string | undefined>)
    const initTab = (params.tab as FeedTab | undefined) ?? 'formula'
    const initRecordId = params.recordId ?? ''
    // PRD-009 US-04：从今日日程点"去记录"进入时预填执行时间
    const initTime = params.initTime ?? ''

    const voiceFields: Record<string, string> = {}
    for (const [key, value] of Object.entries(params)) {
      if (key.startsWith('voice_') && value) {
        voiceFields[key.replace('voice_', '')] = value
      }
    }

    init(initTab, initRecordId, voiceFields, initTime)
  })

  const init = async (initTab: FeedTab, initRecordId: string, voiceFields?: Record<string, string>, initTime?: string) => {
    setTab(initTab)
    setEditRecordId(initRecordId)
    try {
      const fid = getStoredFamilyId()
      if (!fid) {
        Taro.showToast({ title: '请先完成建档', icon: 'none' })
        Taro.reLaunch({ url: '/pages/home/index' })
        return
      }
      const baby = await babyApi.get(fid)
      setFamilyId(fid)
      setBabyId(baby.id)

      if (!initRecordId) {
        if (initTime) setRecordTime(initTime)
        if (voiceFields && Object.keys(voiceFields).length > 0) {
          applyVoiceFields(initTab, voiceFields)
        } else {
          const last = await fetchLastFormula(fid, baby.id)
          if (last) {
            if (last.milkTypes?.length) setSelectedMilkTypes(new Set(last.milkTypes))
            if (last.scoops) setScoops((prev) => ({ ...prev, ...last.scoops }))
            if (last.formulaMl != null) setFormulaMl(last.formulaMl)
            setLoadedFromLast(true)
          }
        }
      } else {
        try {
          const rec = await recordsApi.feeding.getOne(fid, initRecordId)
          populateEditForm(rec)
        } catch {
          Taro.showToast({ title: '加载记录失败', icon: 'none' })
        }
      }
    } catch {
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
      loadFedFoods()
    }
  }

  // 加载排敏观察数据（用于标记已喂养/过敏状态）
  const loadFedFoods = async () => {
    const fid = getStoredFamilyId()
    const bid = getStoredBabyId()
    if (!fid || !bid) return
    try {
      const observations = await foodObservationApi.list(fid, bid)
      const foods: FedFoodInfo[] = observations.map((obs) => ({
        foodName: obs.food_name,
        status: obs.status,
      }))
      setFedFoods(foods)
    } catch { /* 排敏数据加载失败不影响主流程 */ }
  }

  useDidShow(() => {
    if (initDoneRef.current) loadFedFoods()
  })

  const applyVoiceFields = (initTab: FeedTab, fields: Record<string, string>) => {
    if (initTab === 'formula' && fields.formula_ml) {
      const ml = parseInt(fields.formula_ml, 10)
      if (ml > 0) setFormulaMl(ml)
    }
    if (initTab === 'breast') {
      if (fields.breast_side && ['left', 'right', 'both'].includes(fields.breast_side)) {
        setBreastSide(fields.breast_side as 'left' | 'right' | 'both')
      }
      if (fields.duration_min) {
        const min = parseInt(fields.duration_min, 10)
        if (min > 0) setDurationMin(min)
      }
    }
    if (initTab === 'food' && fields.complementary_food) {
      setFoodList(fields.complementary_food.split(/[,、，]/).filter(Boolean))
    }
  }

  const populateEditForm = (rec: FeedingRecord) => {
    const ft = rec.feed_type
    if (rec.record_time) {
      setRecordDate(isoToDate(rec.record_time))
      setRecordTime(isoToTime(rec.record_time))
    }
    if (ft === 'breast') {
      setTab('breast')
      if (rec.breast_side) setBreastSide(rec.breast_side)
      if (rec.duration_min != null) setDurationMin(rec.duration_min)
    } else if (ft === 'complementary') {
      if (rec.complementary_food === '营养素') setTab('supplement')
      else setTab('food')
      if (rec.supplement_items && Array.isArray(rec.supplement_items)) {
        const checked: Record<string, boolean> = {}
        const dose: Record<string, string> = {}
        for (const item of rec.supplement_items) {
          if (item.key && item.key !== 'other') {
            checked[item.key] = true
            if (item.dose) dose[item.key] = item.dose
          }
        }
        setSuppChecked(checked)
        setSuppDose(dose)
        const other = rec.supplement_items.find((i) => i.key === 'other')
        if (other) {
          setSuppOtherName(other.label ?? '')
          setSuppOtherDose(other.dose ?? '')
          setSuppOtherUnit(other.unit ?? '')
        }
      }
      if (rec.complementary_food && rec.complementary_food !== '营养素') {
        setFoodList(rec.complementary_food.split('、').filter(Boolean))
      }
    } else {
      setTab('formula')
      if (rec.formula_ml != null) setFormulaMl(rec.formula_ml)
      if (rec.milk_types) setSelectedMilkTypes(new Set(rec.milk_types))
      if (rec.milk_scoops) setScoops((prev) => ({ ...prev, ...rec.milk_scoops }))
      if (rec.duration_min != null && rec.duration_min > 0) {
        const start = rec.record_time ? isoToTime(rec.record_time) : recordTime
        setFormulaEndTime(addMinutes(start, rec.duration_min))
        endTimeUserSetRef.current = true
      }
    }
    if (rec.note) setNote(rec.note)
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
  const quickAddFood = (foodName: string) => {
    const t = foodName.trim()
    if (!t) return
    setFoodList((prev) => (prev.includes(t) ? prev : [...prev, t]))
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
      let payload: CreateFeedingDto | UpdateFeedingDto

      if (tab === 'formula') {
        const activeKeys = milkTypeOptions.filter((m) => selectedMilkTypes.has(m.key) && scoops[m.key] > 0).map((m) => m.key)
        const activeScoops: Record<string, number> = {}
        activeKeys.forEach((k) => { activeScoops[k] = scoops[k] })
        const d = timeDiffMinutes(recordTime, formulaEndTime)
        payload = { baby_id: babyId, feed_type: 'formula', record_time: isoTime, formula_ml: formulaMl, duration_min: d > 0 ? d : undefined, milk_types: activeKeys.length > 0 ? activeKeys : undefined, milk_scoops: activeKeys.length > 0 ? activeScoops : undefined, note: note || undefined }
      } else if (tab === 'breast') {
        payload = { baby_id: babyId, feed_type: 'breast', record_time: isoTime, breast_side: breastSide, duration_min: durationMin, note: note || undefined }
      } else if (tab === 'food') {
        // 提交前自动将输入框中未确认的内容加入列表
        const pending = foodInput.trim()
        const finalList = pending ? (foodList.includes(pending) ? foodList : [...foodList, pending]) : foodList
        if (finalList.length === 0) {
          setSubmitting(false)
          Taro.showToast({ title: '请选择或输入至少一种辅食', icon: 'none' })
          return
        }
        payload = { baby_id: babyId, feed_type: 'complementary', record_time: isoTime, complementary_food: finalList.join('、'), note: note || undefined }
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

      // 上次配方默认值已改为远程查询，提交后服务端即为最新数据，无需再写本地缓存

      Taro.showToast({ title: isEditMode ? '记录已更新' : '记录已保存', icon: 'success' })
      Taro.eventCenter.trigger('home:refresh')
      Taro.eventCenter.trigger('records:refresh')
      setTimeout(() => Taro.navigateBack(), 1000)
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '保存失败', icon: 'none' })
    } finally { setSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!familyId || !editRecordId) return
    setDeleteConfirmOpen(false)
    try {
      await recordsApi.feeding.remove(familyId, editRecordId)
      Taro.showToast({ title: '记录已删除', icon: 'success' })
      Taro.eventCenter.trigger('home:refresh')
      Taro.eventCenter.trigger('records:refresh')
      setTimeout(() => Taro.navigateBack(), 800)
    } catch { Taro.showToast({ title: '删除失败', icon: 'none' }) }
  }

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <View className={cls('feed-page')}>
        <View className='feed-loading'><Text>加载中...</Text></View>
      </View>
    )
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <View className={cls('feed-page')}>
      {/* 导航栏 */}
      <View className='feed-nav' style={{ paddingTop: `${getStatusBarHeight() + 10}px` }}>
        <View className='feed-nav__back' onClick={() => Taro.navigateBack()}>
          <Text className='feed-nav__back-arrow'>{'<'}</Text>
        </View>
        <Text className='feed-nav__title'>{isEditMode ? '编辑饮食记录' : '饮食记录'}</Text>
        {isEditMode ? (
          <View className='feed-nav__delete' onClick={() => setDeleteConfirmOpen(true)}>
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
          <FoodSection
            foodList={foodList}
            inputValue={foodInput}
            onInputChange={setFoodInput}
            onAdd={addFood}
            onRemove={removeFood}
            onQuickAdd={quickAddFood}
            fedFoods={fedFoods}
          />
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

      {/* 删除确认 */}
      <ConfirmSheet
        open={deleteConfirmOpen}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </View>
  )
}
