/**
 * Dashboard 底部抽屉 — 新建记录
 *
 * 从底部滑入的全屏抽屉面板，内部复用现有表单的 Section 子组件。
 * 只做「新建」，不做编辑（编辑走独立页面路由）。
 *
 * 复用的子组件（零改动）：
 *  - feeding: TabSelector, FormulaSection, BreastSection, SupplementSection, FoodSection
 *  - diaper:  DiaperTypeSection, PoopSection, ButtConditionSection
 *  - sleep:   ManualMode, QualitySection
 *  - activity: ActivityTypeSection, IntensitySection
 *  - health:  TemperatureSection, AllergySection, SkinCare chips
 *
 * 状态管理：每个表单类型的 useState 在对应的内部组件中管理，
 * 提交成功后调用 onSuccess 回调触发 Dashboard 数据刷新。
 */
import React, { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { recordsApi } from '@/api'
// 注意：子组件内部各自定义了本地类型（DiaperChip, ButtCondition, SleepQuality, Intensity, ActivityType）
// 这些与 api/types 中的同名类型结构一致，TypeScript 结构类型系统会正确匹配
import DatePicker from '@/components/DatePicker'
import TimePicker from '@/components/TimePicker'
import dayjs from 'dayjs'

// 喂养子组件
import type { FeedTab, MilkType } from '../records/feeding/types'
import { milkTypeOptions, suppItems } from '../records/feeding/types'
import TabSelector from '../records/feeding/TabSelector'
import FormulaSection from '../records/feeding/FormulaSection'
import BreastSection from '../records/feeding/BreastSection'
import SupplementSection from '../records/feeding/SupplementSection'
import FoodSection from '../records/feeding/FoodSection'

// 尿布子组件
import DiaperTypeSection from '../records/diaper/DiaperTypeSection'
import PoopSection from '../records/diaper/PoopSection'
import ButtConditionSection from '../records/diaper/ButtConditionSection'

// 睡眠子组件
import ManualMode from '../records/sleep/ManualMode'
import QualitySection from '../records/sleep/QualitySection'

// 活动子组件
import ActivityTypeSection from '../records/activity/ActivityTypeSection'
import IntensitySection from '../records/activity/IntensitySection'

// 健康子组件
import TemperatureSection from '../records/health/TemperatureSection'
import AllergySection from '../records/health/AllergySection'

// 共享工具
import {
  ToastMessage,
  nowTime,
  nowDate,
  timeToISO,
  dateToLocalISO,
  useToastMsg,
} from '../records/shared'

// ── 记录类型定义 ─────────────────────────────────────────────────────
export type DrawerRecordType = 'feeding' | 'diaper' | 'sleep' | 'activity' | 'health'

interface Props {
  open: boolean
  recordType: DrawerRecordType
  /** 初始 Tab（仅 feeding 类型有效，如 'supplement'） */
  initialTab?: string
  onClose: () => void
  onSuccess: () => void
}

const TYPE_TITLES: Record<DrawerRecordType, string> = {
  feeding: '饮食记录',
  diaper: '尿布记录',
  sleep: '睡眠记录',
  activity: '活动记录',
  health: '健康记录',
}

const TYPE_COLORS: Record<DrawerRecordType, string> = {
  feeding: '#f07888',
  diaper: '#5ac0e8',
  sleep: '#7888e8',
  activity: '#e8b84a',
  health: '#f07888',
}

// ── 主组件 ───────────────────────────────────────────────────────────
export default function RecordDrawer({ open, recordType, initialTab, onClose, onSuccess }: Props) {
  if (!open) return null

  return (
    <div className="db-drawer-overlay" onClick={onClose}>
      <div
        className={`db-drawer-panel ${open ? 'db-drawer-open' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 拖拽把手 */}
        <div className="db-drawer-handle">
          <div className="db-drawer-handle-bar" />
        </div>

        {/* 标题栏 */}
        <div className="db-drawer-header">
          <button type="button" className="db-drawer-close" onClick={onClose}>
            取消
          </button>
          <span className="db-drawer-title" style={{ color: TYPE_COLORS[recordType] }}>
            {TYPE_TITLES[recordType]}
          </span>
          <div style={{ width: 48 }} />
        </div>

        {/* 表单内容（可滚动） */}
        <div className="db-drawer-body">
          {recordType === 'feeding' && <FeedingForm initialTab={initialTab} onClose={onClose} onSuccess={onSuccess} />}
          {recordType === 'diaper' && <DiaperForm onClose={onClose} onSuccess={onSuccess} />}
          {recordType === 'sleep' && <SleepForm onClose={onClose} onSuccess={onSuccess} />}
          {recordType === 'activity' && <ActivityForm onClose={onClose} onSuccess={onSuccess} />}
          {recordType === 'health' && <HealthForm onClose={onClose} onSuccess={onSuccess} />}
        </div>
      </div>
    </div>
  )
}

// ── 通用提交按钮 ─────────────────────────────────────────────────────
function DrawerSubmitButton({
  onClick,
  submitting,
  label = '保存记录',
  color = '#F87098',
}: {
  onClick: () => void
  submitting: boolean
  label?: string
  color?: string
}) {
  return (
    <div style={{ padding: '8px 16px 16px' }}>
      <button
        type="button"
        onClick={onClick}
        disabled={submitting}
        className="w-full py-3 rounded-full text-white text-[15px] font-bold transition-opacity"
        style={{ background: submitting ? color + '80' : color }}
      >
        {submitting ? '保存中...' : label}
      </button>
    </div>
  )
}

// ── 日期+时间合并行（紧凑布局）───────────────────────────────────────
function DateTimeRow({
  date, time, onDateChange, onTimeChange,
  dateLabel = '日期', timeLabel = '时间',
}: {
  date: string; time: string
  onDateChange: (v: string) => void; onTimeChange: (v: string) => void
  dateLabel?: string; timeLabel?: string
}) {
  return (
    <div className="db-drawer-datetime-row">
      <DatePicker value={date} onChange={onDateChange} label={dateLabel} />
      <TimePicker value={time} onChange={onTimeChange} label={timeLabel} />
    </div>
  )
}

// ── 紧凑备注（单行 input 替代 textarea）──────────────────────────────
function CompactNote({ value, onChange, placeholder = '备注...' }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="mx-4 mb-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-white text-[13px] text-[#4A3035] placeholder-[#C0B0B8] outline-none"
        style={{ boxShadow: '0 1px 4px rgba(200,100,120,0.06)' }}
      />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 喂养表单
// ══════════════════════════════════════════════════════════════════════
// ── 配方奶 localStorage 缓存（按宝宝维度隔离）──────────────────────
const LAST_FORMULA_KEY_PREFIX = 'minicare_last_formula_'

interface LastFormulaCache {
  milkTypes: MilkType[]
  scoops: Record<string, number>
  formulaMl: number
}

function loadLastFormula(babyId: string): LastFormulaCache | null {
  try {
    const raw = localStorage.getItem(LAST_FORMULA_KEY_PREFIX + babyId)
    if (!raw) return null
    return JSON.parse(raw) as LastFormulaCache
  } catch { return null }
}

function saveLastFormula(babyId: string, data: LastFormulaCache) {
  try {
    localStorage.setItem(LAST_FORMULA_KEY_PREFIX + babyId, JSON.stringify(data))
  } catch {}
}

function FeedingForm({ initialTab, onClose, onSuccess }: { initialTab?: string; onClose: () => void; onSuccess: () => void }) {
  const { currentFamily, currentBaby } = useAppStore()
  const { toast, showToast } = useToastMsg()

  const [tab, setTab] = useState<FeedTab>((initialTab as FeedTab) || 'formula')
  const [recordDate, setRecordDate] = useState(nowDate)
  const [recordTime, setRecordTime] = useState(nowTime)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 从 localStorage 读取上次配方（新建模式）
  const lastFormula = currentBaby ? loadLastFormula(currentBaby.id) : null

  // 配方奶状态（优先使用上次缓存，否则默认值）
  type MilkTypeKey = 'aa' | 'eh_lactose' | 'eh_no_lactose' | 'ph' | 'std'
  const [selectedMilkTypes, setSelectedMilkTypes] = useState<Set<MilkType>>(() => {
    if (lastFormula?.milkTypes && lastFormula.milkTypes.length > 0) {
      return new Set(lastFormula.milkTypes)
    }
    return new Set(['aa'] as MilkType[])
  })
  const [scoops, setScoops] = useState<Record<MilkTypeKey, number>>(() => {
    const defaults: Record<MilkTypeKey, number> = { aa: 3, eh_lactose: 0, eh_no_lactose: 0, ph: 0, std: 0 }
    if (lastFormula?.scoops) {
      return { ...defaults, ...(lastFormula.scoops as Record<MilkTypeKey, number>) }
    }
    return defaults
  })
  const [formulaMl, setFormulaMl] = useState(lastFormula?.formulaMl ?? 120)
  const [loadedFromLast] = useState(Boolean(lastFormula))

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

  // 母乳状态
  const [breastSide, setBreastSide] = useState<'left' | 'right' | 'both'>('left')
  const [durationMin, setDurationMin] = useState(15)

  // 营养素状态
  const [suppChecked, setSuppChecked] = useState<Record<string, boolean>>({})
  const [suppDose, setSuppDose] = useState<Record<string, string>>({})
  const [suppOtherName, setSuppOtherName] = useState('')
  const [suppOtherDose, setSuppOtherDose] = useState('')
  const [suppOtherUnit, setSuppOtherUnit] = useState('')

  // 辅食状态
  const [foodList, setFoodList] = useState<string[]>([])
  const [foodInput, setFoodInput] = useState('')

  const addFood = () => {
    const t = foodInput.trim()
    if (!t) return
    setFoodList((prev) => [...prev, t])
    setFoodInput('')
  }
  const directAddFood = (name: string) => {
    const t = name.trim()
    if (!t) return
    setFoodList((prev) => (prev.includes(t) ? prev : [...prev, t]))
  }

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) { showToast('请先完成宝宝建档'); return }
    setSubmitting(true)
    try {
      const isoTime = timeToISO(recordDate, recordTime)

      if (tab === 'formula') {
        const activeMilkTypes = milkTypeOptions
          .filter((m) => selectedMilkTypes.has(m.key) && scoops[m.key] > 0)
          .map((m) => m.key)
        const activeScoops: Record<string, number> = {}
        activeMilkTypes.forEach((key) => { activeScoops[key] = scoops[key] })

        await recordsApi.feeding.create(currentFamily.id, {
          baby_id: currentBaby.id,
          feed_type: 'formula',
          record_time: isoTime,
          formula_ml: formulaMl,
          milk_types: activeMilkTypes.length > 0 ? activeMilkTypes : undefined,
          milk_scoops: activeMilkTypes.length > 0 ? activeScoops : undefined,
          note: note || undefined,
        })
      } else if (tab === 'breast') {
        await recordsApi.feeding.create(currentFamily.id, {
          baby_id: currentBaby.id,
          feed_type: 'breast',
          record_time: isoTime,
          breast_side: breastSide,
          duration_min: durationMin,
          note: note || undefined,
        })
      } else if (tab === 'food') {
        await recordsApi.feeding.create(currentFamily.id, {
          baby_id: currentBaby.id,
          feed_type: 'complementary',
          record_time: isoTime,
          complementary_food: foodList.length > 0 ? foodList.join('\u3001') : '辅食',
          note: note || undefined,
        })
      } else {
        // 营养素
        const activeSuppItems = suppItems
          .filter((s) => suppChecked[s.key])
          .map((s) => ({ key: s.key, label: s.label, dose: suppDose[s.key] || '', unit: s.unit }))
        if (suppOtherName.trim()) {
          activeSuppItems.push({ key: 'other', label: suppOtherName.trim(), dose: suppOtherDose || '', unit: suppOtherUnit || '' })
        }
        await recordsApi.feeding.create(currentFamily.id, {
          baby_id: currentBaby.id,
          feed_type: 'complementary',
          record_time: isoTime,
          complementary_food: '营养素',
          supplement_items: activeSuppItems.length > 0 ? activeSuppItems : undefined,
          note: note || undefined,
        })
      }

      // 配方奶提交成功后缓存配方比例，下次自动填充
      if (tab === 'formula' && currentBaby) {
        const activeMilkTypesForCache = milkTypeOptions
          .filter((m) => selectedMilkTypes.has(m.key) && scoops[m.key] > 0)
          .map((m) => m.key)
        const activeScoopsForCache: Record<string, number> = {}
        activeMilkTypesForCache.forEach((key) => { activeScoopsForCache[key] = scoops[key] })
        saveLastFormula(currentBaby.id, {
          milkTypes: activeMilkTypesForCache,
          scoops: activeScoopsForCache,
          formulaMl,
        })
      }

      showToast('已保存')
      setTimeout(() => { onSuccess(); onClose() }, 800)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <TabSelector value={tab} onChange={setTab} />

      <DateTimeRow
        date={recordDate} time={recordTime}
        onDateChange={setRecordDate} onTimeChange={setRecordTime}
        timeLabel="喂养时间"
      />

      {tab === 'formula' && (
        <FormulaSection
          selectedMilkTypes={selectedMilkTypes}
          onToggleMilkType={toggleMilkType}
          scoops={scoops}
          onUpdateScoop={updateScoop}
          formulaMl={formulaMl}
          onChangeFormulaMl={setFormulaMl}
          loadedFromLast={loadedFromLast}
          isEditMode={false}
          compact
        />
      )}
      {tab === 'breast' && (
        <BreastSection
          breastSide={breastSide}
          onChangeSide={setBreastSide}
          durationMin={durationMin}
          onChangeDuration={setDurationMin}
        />
      )}
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
          compact
        />
      )}
      {tab === 'food' && (
        <FoodSection
          foodList={foodList}
          inputValue={foodInput}
          onInputChange={setFoodInput}
          onAdd={addFood}
          onDirectAdd={directAddFood}
          onRemove={(idx) => setFoodList((prev) => prev.filter((_, i) => i !== idx))}
        />
      )}

      <CompactNote value={note} onChange={setNote} placeholder="如宝宝状态、品牌等..." />

      <DrawerSubmitButton onClick={handleSubmit} submitting={submitting} color="#F87098" />
      <ToastMessage toast={toast} />
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 尿布表单
// ══════════════════════════════════════════════════════════════════════
function DiaperForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { currentFamily, currentBaby } = useAppStore()
  const { toast, showToast } = useToastMsg()

  const [recordDate, setRecordDate] = useState(nowDate)
  const [recordTime, setRecordTime] = useState(nowTime)
  const [diaperType, setDiaperType] = useState<'wet' | 'dirty' | 'mixed'>('wet')
  const [diaperCount, setDiaperCount] = useState(1)
  const [poopType, setPoopType] = useState<string | null>('normal')
  const [buttCondition, setButtCondition] = useState<string | null>('normal')
  const [colorSelected, setColorSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const showPoop = diaperType === 'dirty' || diaperType === 'mixed'

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) { showToast('请先完成宝宝建档'); return }
    setSubmitting(true)
    try {
      await recordsApi.diaper.create(currentFamily.id, {
        baby_id: currentBaby.id,
        diaper_type: diaperType,
        record_time: timeToISO(recordDate, recordTime),
        stool_colors: showPoop && colorSelected.size > 0 ? [...colorSelected] : undefined,
        poop_type: (showPoop && poopType ? poopType : undefined) ?? undefined,
        butt_condition: buttCondition ?? undefined,
        diaper_count: diaperCount !== 1 ? diaperCount : undefined,
        note: note || undefined,
      })
      showToast('已保存')
      setTimeout(() => { onSuccess(); onClose() }, 800)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DateTimeRow
        date={recordDate} time={recordTime}
        onDateChange={setRecordDate} onTimeChange={setRecordTime}
      />

      <DiaperTypeSection
        selected={diaperType}
        onSelect={setDiaperType}
        count={diaperCount}
        onCountChange={setDiaperCount}
      />

      {showPoop && (
        <PoopSection
          poopType={poopType}
          onPoopTypeChange={(key) => setPoopType(key as PoopType | null)}
          colorSelected={colorSelected}
          onToggleColor={(key) => {
            setColorSelected((prev) => {
              const next = new Set(prev)
              next.has(key) ? next.delete(key) : next.add(key)
              return next
            })
          }}
        />
      )}

      <ButtConditionSection value={buttCondition} onChange={setButtCondition} />

      <CompactNote value={note} onChange={setNote} placeholder="其他观察或备注..." />

      <DrawerSubmitButton onClick={handleSubmit} submitting={submitting} color="#5ac0e8" />
      <ToastMessage toast={toast} />
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 睡眠表单（计时模式 + 补录模式）
// ══════════════════════════════════════════════════════════════════════
function SleepForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { currentFamily, currentBaby } = useAppStore()
  const { toast, showToast } = useToastMsg()

  // 模式切换：timer = 计时模式, manual = 补录模式
  const [mode, setMode] = useState<'timer' | 'manual'>('timer')

  // ── 计时模式状态 ──
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerStartTime, setTimerStartTime] = useState<Date | null>(null)
  const [ongoingId, setOngoingId] = useState<string | null>(null)
  const [timerStopped, setTimerStopped] = useState(false)
  const [timerApiLoading, setTimerApiLoading] = useState(false)
  const [sleepQualityTimer, setSleepQualityTimer] = useState<'good' | 'normal' | 'poor'>('good')
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // 计时器 tick
  React.useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => setTimerSeconds((s) => s + 1), 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [timerRunning])

  // 页面加载时检查是否有进行中的睡眠
  const ongoingCheckedRef = React.useRef(false)
  React.useEffect(() => {
    if (!currentFamily || !currentBaby || ongoingCheckedRef.current) return
    ongoingCheckedRef.current = true
    recordsApi.sleep.getOngoing(currentFamily.id, currentBaby.id).then((ongoing) => {
      if (ongoing && ongoing.start_time) {
        setOngoingId(ongoing.id)
        setTimerStartTime(new Date(ongoing.start_time))
        const elapsed = Math.max(0, Math.round((Date.now() - new Date(ongoing.start_time).getTime()) / 1000))
        setTimerSeconds(elapsed)
        setTimerRunning(true)
        setMode('timer')
      }
    }).catch(() => {})
  }, [currentFamily, currentBaby])

  const handleTimerStart = async () => {
    if (!currentFamily || !currentBaby) { showToast('请先完成宝宝建档'); return }
    setTimerApiLoading(true)
    try {
      const now = new Date()
      const res = await recordsApi.sleep.startSleep(currentFamily.id, {
        baby_id: currentBaby.id,
        start_time: dateToLocalISO(now),
      })
      setOngoingId(res.id)
      setTimerStartTime(now)
      setTimerSeconds(0)
      setTimerRunning(true)
      // 刷新 dashboard 数据，让顶部显示"睡眠中"状态
      onSuccess()
    } catch (err: any) {
      if (err?.status === 409 || err?.message?.includes('409')) {
        // 已有进行中记录，尝试恢复
        try {
          const ongoing = await recordsApi.sleep.getOngoing(currentFamily.id, currentBaby.id)
          if (ongoing && ongoing.start_time) {
            setOngoingId(ongoing.id)
            setTimerStartTime(new Date(ongoing.start_time))
            const elapsed = Math.max(0, Math.round((Date.now() - new Date(ongoing.start_time).getTime()) / 1000))
            setTimerSeconds(elapsed)
            setTimerRunning(true)
            // 恢复计时也刷新 dashboard
            onSuccess()
          }
        } catch { showToast('恢复计时失败') }
      } else {
        showToast(err instanceof Error ? err.message : '开始计时失败')
      }
    } finally {
      setTimerApiLoading(false)
    }
  }

  const handleTimerStop = async () => {
    if (!currentFamily || !ongoingId) return
    setTimerRunning(false)
    setTimerApiLoading(true)
    try {
      await recordsApi.sleep.endSleep(currentFamily.id, ongoingId, {
        end_time: dateToLocalISO(new Date()),
        quality: sleepQualityTimer,
      })
      setTimerStopped(true)
      showToast('已保存')
      setTimeout(() => { onSuccess(); onClose() }, 800)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '结束睡眠失败')
      setTimerRunning(true) // 恢复计时
    } finally {
      setTimerApiLoading(false)
    }
  }

  const handleTimerCancel = async () => {
    if (!currentFamily || !ongoingId) return
    setTimerRunning(false)
    try {
      await recordsApi.sleep.remove(currentFamily.id, ongoingId)
    } catch {}
    setOngoingId(null)
    setTimerStartTime(null)
    setTimerSeconds(0)
    setTimerStopped(false)
  }

  // ── 补录模式状态 ──
  const [startDate, setStartDate] = useState(nowDate)
  const [endDate, setEndDate] = useState(nowDate)
  const [startTime, setStartTime] = useState(() => dayjs().subtract(1, 'hour').format('HH:mm'))
  const [endTime, setEndTime] = useState(nowTime)
  const [sleepQuality, setSleepQuality] = useState<'good' | 'normal' | 'poor'>('good')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleManualSubmit = async () => {
    if (!currentFamily || !currentBaby) { showToast('请先完成宝宝建档'); return }

    const startISO = `${startDate}T${startTime}:00`
    const endISO = `${endDate}T${endTime}:00`
    const durationMin = Math.round(dayjs(endISO).diff(dayjs(startISO), 'minute', true))
    if (durationMin <= 0) { showToast('结束时间应晚于开始时间'); return }

    setSubmitting(true)
    try {
      await recordsApi.sleep.createComplete(currentFamily.id, {
        baby_id: currentBaby.id,
        start_time: startISO,
        end_time: endISO,
        quality: sleepQuality,
        note: note || undefined,
      })
      showToast('已保存')
      setTimeout(() => { onSuccess(); onClose() }, 800)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 格式化计时器显示
  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const isTimerIdle = !timerRunning && !timerStopped && timerSeconds === 0

  return (
    <>
      {/* 模式切换 Tab */}
      <div style={{ display: 'flex', gap: 0, margin: '0 16px 8px', borderRadius: 12, overflow: 'hidden', border: '1px solid #E5D8DA' }}>
        <button
          type="button"
          onClick={() => !timerRunning && setMode('timer')}
          style={{
            flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: mode === 'timer' ? '#7888e8' : '#fff',
            color: mode === 'timer' ? '#fff' : '#9A8090',
          }}
        >
          计时模式
        </button>
        <button
          type="button"
          onClick={() => !timerRunning && setMode('manual')}
          style={{
            flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: mode === 'manual' ? '#7888e8' : '#fff',
            color: mode === 'manual' ? '#fff' : '#9A8090',
          }}
        >
          补录模式
        </button>
      </div>

      {mode === 'timer' ? (
        <>
          {/* 计时器显示 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0 8px', gap: 12 }}>
            {/* 圆形计时器 */}
            <div style={{
              width: 140, height: 140, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: !isTimerIdle
                ? `conic-gradient(#7888e8 ${Math.min(100, (timerSeconds / (12 * 3600)) * 100)}%, #F0E8EA 0%)`
                : '#F0E8EA',
            }}>
              <div style={{
                width: 116, height: 116, borderRadius: '50%', background: '#fff',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: '#4A3035', lineHeight: 1 }}>
                  {isTimerIdle ? '0m' : formatTimer(timerSeconds)}
                </span>
                <span style={{ fontSize: 11, color: '#9A8090' }}>
                  {timerRunning ? '睡眠中' : timerStopped ? '已保存' : '准备好了'}
                </span>
              </div>
            </div>

            {timerStartTime && (
              <span style={{ fontSize: 12, color: '#9A8090' }}>
                开始于 {dayjs(timerStartTime).format('HH:mm')}
              </span>
            )}

            {/* 按钮区 */}
            {isTimerIdle && (
              <button
                type="button" onClick={handleTimerStart} disabled={timerApiLoading}
                style={{
                  width: 160, padding: '12px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
                  background: timerApiLoading ? '#B0B8E8' : '#7888e8', color: '#fff', fontSize: 15, fontWeight: 700,
                }}
              >
                {timerApiLoading ? '...' : '开始睡眠'}
              </button>
            )}

            {timerRunning && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <button
                  type="button" onClick={handleTimerStop} disabled={timerApiLoading}
                  style={{
                    width: 160, padding: '12px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
                    background: timerApiLoading ? '#FBB8CA' : '#F87098', color: '#fff', fontSize: 15, fontWeight: 700,
                  }}
                >
                  {timerApiLoading ? '...' : '结束睡眠'}
                </button>
                <button
                  type="button" onClick={handleTimerCancel} disabled={timerApiLoading}
                  style={{ background: 'none', border: 'none', color: '#C4A8B0', fontSize: 12, cursor: 'pointer' }}
                >
                  取消本次计时
                </button>
              </div>
            )}

            {timerStopped && (
              <span style={{ color: '#4CAF82', fontSize: 13, fontWeight: 600 }}>记录已保存</span>
            )}
          </div>

          {/* 计时模式下的睡眠质量 */}
          {(timerRunning || !isTimerIdle) && !timerStopped && (
            <QualitySection value={sleepQualityTimer} onChange={setSleepQualityTimer} />
          )}
        </>
      ) : (
        <>
          {/* 补录模式 */}
          <ManualMode
            startDate={startDate}
            endDate={endDate}
            startTime={startTime}
            endTime={endTime}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onStartChange={setStartTime}
            onEndChange={setEndTime}
          />

          <QualitySection value={sleepQuality} onChange={setSleepQuality} />

          <CompactNote value={note} onChange={setNote} placeholder="如：夜哭了2次" />

          <DrawerSubmitButton onClick={handleManualSubmit} submitting={submitting} color="#7888e8" />
        </>
      )}
      <ToastMessage toast={toast} />
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 活动表单
// ══════════════════════════════════════════════════════════════════════
function ActivityForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { currentFamily, currentBaby } = useAppStore()
  const { toast, showToast } = useToastMsg()

  const [recordDate, setRecordDate] = useState(nowDate)
  const [recordTime, setRecordTime] = useState(nowTime)
  const [activityType, setActivityType] = useState<string>('gross_motor')
  const [intensity, setIntensity] = useState<'easy' | 'medium' | 'active'>('medium')
  const [actDurationMin, setActDurationMin] = useState(15)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) { showToast('请先完成宝宝建档'); return }
    setSubmitting(true)
    try {
      await recordsApi.activity.create(currentFamily.id, {
        baby_id: currentBaby.id,
        activity_type: activityType,
        record_time: timeToISO(recordDate, recordTime),
        duration_min: actDurationMin,
        intensity,
        note: note || undefined,
      })
      showToast('已保存')
      setTimeout(() => { onSuccess(); onClose() }, 800)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DateTimeRow
        date={recordDate} time={recordTime}
        onDateChange={setRecordDate} onTimeChange={setRecordTime}
      />

      <ActivityTypeSection value={activityType as any} onChange={setActivityType as any} compact />

      {/* 活动时长 */}
      <div
        className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}
      >
        <div
          className="flex items-center gap-2 px-4 pt-3.5 pb-2"
          style={{ borderBottom: '0.5px solid #F5EEF0' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-[13px] font-bold text-[#7A5A60]">活动时长</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => setActDurationMin((d) => Math.max(5, d - 5))}
            className="flex items-center justify-center w-9 h-9 rounded-full border text-[18px] text-[#9A8090] bg-white active:bg-pink-50"
            style={{ borderColor: '#E5D8DA' }}>-</button>
          <div className="flex-1 text-center">
            <span className="text-[28px] font-extrabold text-[#4A3035]">{actDurationMin}</span>
            <div className="text-[12px] text-[#9A8090] mt-0.5">分钟</div>
          </div>
          <button type="button" onClick={() => setActDurationMin((d) => Math.min(120, d + 5))}
            className="flex items-center justify-center w-9 h-9 rounded-full border text-[18px] text-[#9A8090] bg-white active:bg-pink-50"
            style={{ borderColor: '#E5D8DA' }}>+</button>
        </div>
      </div>

      <IntensitySection value={intensity} onChange={setIntensity} />

      <CompactNote value={note} onChange={setNote} placeholder="其他观察或备注..." />

      <DrawerSubmitButton onClick={handleSubmit} submitting={submitting} color="#e8b84a" />
      <ToastMessage toast={toast} />
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 健康表单（体温 + 过敏表现 + 保湿护理）
// ══════════════════════════════════════════════════════════════════════

/** 保湿护理分组 Chip 列表（与 health/index.tsx 保持一致） */
const SKIN_GROUPS: { label: string; chips: string[] }[] = [
  { label: '面部保湿', chips: ['涂抹面霜', '涂抹润肤露', '涂抹保湿喷雾'] },
  { label: '身体保湿', chips: ['涂抹身体乳', '涂抹润肤油', '涂抹护臀霜'] },
]

type Severity = 'mild' | 'moderate' | 'severe'

function HealthForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { currentFamily, currentBaby } = useAppStore()
  const { toast, showToast } = useToastMsg()

  const [recordDate, setRecordDate] = useState(nowDate)
  const [recordTime, setRecordTime] = useState(nowTime)
  const [temperature, setTemperature] = useState('36.5')

  // 过敏症状
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([])
  const [severity, setSeverity] = useState<Severity | null>(null)

  // 保湿护理
  const [selectedSkin, setSelectedSkin] = useState<Set<string>>(new Set())

  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const toggleSymptom = (s: string) => {
    setSelectedSymptoms((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }
  const toggleSkin = (s: string) => {
    setSelectedSkin((prev) => {
      const n = new Set(prev)
      n.has(s) ? n.delete(s) : n.add(s)
      return n
    })
  }

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) { showToast('请先完成宝宝建档'); return }
    const temp = temperature ? parseFloat(temperature) : undefined
    if (temp !== undefined && (temp < 35 || temp > 42)) { showToast('体温范围应为 35~42 C'); return }
    setSubmitting(true)
    try {
      await recordsApi.health.create(currentFamily.id, {
        baby_id: currentBaby.id,
        record_time: timeToISO(recordDate, recordTime),
        temperature: temp,
        allergy_symptoms: selectedSymptoms.length > 0 ? selectedSymptoms : undefined,
        allergy_severity: selectedSymptoms.length > 0 ? (severity ?? undefined) : undefined,
        skin_care: selectedSkin.size > 0 ? [...selectedSkin] : undefined,
        note: note || undefined,
      })
      showToast('已保存')
      setTimeout(() => { onSuccess(); onClose() }, 800)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DateTimeRow
        date={recordDate} time={recordTime}
        onDateChange={setRecordDate} onTimeChange={setRecordTime}
      />

      {/* 体温 */}
      <TemperatureSection value={temperature} onChange={setTemperature} />

      {/* 过敏表现 */}
      <AllergySection
        selected={selectedSymptoms}
        onToggle={toggleSymptom}
        severity={severity}
        onSeverityChange={setSeverity}
        onPhotoClick={() => showToast('拍照功能开发中')}
      />

      {/* 保湿护理 */}
      <div
        className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}
      >
        <div
          className="flex items-center gap-2 px-4 pt-3.5 pb-2"
          style={{ borderBottom: '0.5px solid #F5EEF0' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span className="text-[13px] font-bold text-[#7A5A60]">保湿护理（可选）</span>
        </div>
        <div className="px-4 py-3">
          {SKIN_GROUPS.map((group) => (
            <div key={group.label} className="mb-3 last:mb-0">
              <div className="text-[12px] font-medium text-[#9A8090] mb-2">{group.label}</div>
              <div className="flex flex-wrap gap-2">
                {group.chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleSkin(chip)}
                    className="px-3 py-1.5 rounded-full border text-[13px] font-medium transition-all"
                    style={{
                      borderColor: selectedSkin.has(chip) ? '#F87098' : '#E5D8DA',
                      background: selectedSkin.has(chip) ? '#FFF0F4' : '#fff',
                      color: selectedSkin.has(chip) ? '#F87098' : '#7A5A60',
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <CompactNote value={note} onChange={setNote} placeholder="其他观察或备注..." />

      <DrawerSubmitButton onClick={handleSubmit} submitting={submitting} color="#f07888" />
      <ToastMessage toast={toast} />
    </>
  )
}
