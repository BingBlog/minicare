/**
 * 睡眠记录表单页（MP 迁移）
 *
 * 与 Web pages/records/sleep/index.tsx 保持 1:1 业务逻辑对齐。
 * 差异：路由/Taro 组件/存储方案按平台适配。
 *
 * 子组件拆分与 Web 1:1 对应（强制规则）：
 *  - TimerMode      计时模式（圆形计时 + 开始/结束按钮）
 *  - ManualMode     补录模式（日期 + 入睡/醒来时间）
 *  - QualitySection 睡眠质量（两模式均显示）
 *
 * ═══════════ 计时模式流程 ═══════════
 *  1. 页面加载时先查询 getOngoing，若有则恢复计时（断线重连）
 *  2. 点「开始计时」→ 立即调用 startSleep API → 记录 ongoingId
 *  3. 点「结束睡眠」→
 *     - 若计时 < 3 分钟：弹二次确认弹窗
 *       - 「仍然保存」→ 调用 endSleep 正常保存
 *       - 「继续计时」→ 恢复计时
 *     - 若计时 >= 3 分钟：直接调用 endSleep API → 结束后跳回
 *  4. 计时模式不显示「保存记录」按钮；结束后自动保存
 *
 * ═══════════ 补录/编辑模式流程 ═══════════
 *  手动填写日期 + 时间范围 → 点「保存记录」→ 调用 startSleep + endSleep
 *  编辑模式直接 PATCH 更新
 */
import { View, Text, Input } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState, useEffect, useRef } from 'react'
import dayjs from 'dayjs'
import { babyApi, recordsApi } from '@/api'
import { getStoredFamilyId } from '@/api/http'
import { getStatusBarHeight } from '@/lib/safeArea'
import { nowTime, nowDate, isoToLocalDate, isoToLocalTime, dateToLocalISO, nowLocalISO, buildLocalISOPair, calcDurationMinFromRange, inferSleepPeriod } from '@/lib/utils'
import type { SleepRecord, SleepQuality } from '@/api/sleep'
import TimerMode from './TimerMode'
import ManualMode from './ManualMode'
import QualitySection from './QualitySection'
import { useIsIPad } from '@/lib/useIsIPad'
import './index.scss'

// ---------------------------------------------------------------------------
// 时间工具（统一使用 @/lib/utils 导出）
// ---------------------------------------------------------------------------

/** 将秒数格式化为「X 分 Y 秒」或「X 秒」的可读文案 */
function formatShortDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m > 0) return `${m} 分 ${s} 秒`
  return `${s} 秒`
}

// ── 短时睡眠阈值（秒） ───────────────────────────────────────────────
const SHORT_SLEEP_THRESHOLD_SECONDS = 3 * 60 // 3 分钟

type SleepMode = 'timer' | 'manual'

// ---------------------------------------------------------------------------
// 页面入口
// ---------------------------------------------------------------------------
export default function SleepFormPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => isIPad ? `${base} is-ipad` : base
  // ── 初始化状态 ────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const isEditModeRef = useRef(false)

  // ── 模式切换 ────────────────────────────────────────────────────
  const [mode, setMode] = useState<SleepMode>('timer')

  // ── 计时模式状态 ────────────────────────────────────────────────
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerStartTime, setTimerStartTime] = useState<Date | null>(null)
  const [ongoingId, setOngoingId] = useState<string | null>(null)
  const [timerStopped, setTimerStopped] = useState(false)
  const [timerApiLoading, setTimerApiLoading] = useState(false)
  const ongoingCheckedRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── 二次确认弹窗状态（时间太短） ──────────────────────────────────
  const [shortSleepDialogOpen, setShortSleepDialogOpen] = useState(false)
  const [shortSleepDialogLoading, setShortSleepDialogLoading] = useState(false)
  const [shortSleepSeconds, setShortSleepSeconds] = useState(0)

  // ── 取消计时弹窗状态 ─────────────────────────────────────────────
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelDialogLoading, setCancelDialogLoading] = useState(false)

  // ── 补录模式状态 ────────────────────────────────────────────────
  const [startDate, setStartDate] = useState(nowDate())
  const [endDate, setEndDate] = useState(nowDate())
  const [startTime, setStartTime] = useState(() => dayjs().subtract(1, 'hour').format('HH:mm'))
  const [endTime, setEndTime] = useState(nowTime())

  // ── 公共状态 ───────────────────────────────────────────────────
  const [sleepQuality, setSleepQuality] = useState<SleepQuality>('good')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editRecordId, setEditRecordId] = useState('')
  const isEditMode = editRecordId !== ''

  // ── 删除确认状态 ─────────────────────────────────────────────────
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // 计时器 tick：每秒 +1
  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        setTimerSeconds((s) => s + 1)
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [timerRunning])

  // ── 初始化 ───────────────────────────────────────────────────────
  useLoad((options) => {
    const initRecordId = (options?.recordId as string | undefined) ?? ''

    const voiceFields: Record<string, string> = {}
    for (const [key, value] of Object.entries(options ?? {})) {
      if (key.startsWith('voice_') && value) {
        voiceFields[key.replace('voice_', '')] = value
      }
    }

    init(initRecordId, voiceFields)
  })

  const init = async (initRecordId: string, voiceFields?: Record<string, string>) => {
    setEditRecordId(initRecordId)
    isEditModeRef.current = initRecordId !== ''

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

      if (initRecordId) {
        // 编辑模式：查询记录并回填
        setMode('manual')
        try {
          const fresh = await recordsApi.sleep.getOne(fid, initRecordId)
          if (fresh) {
            if (fresh.start_time) {
              setStartTime(isoToLocalTime(fresh.start_time))
              setStartDate(isoToLocalDate(fresh.start_time))
            }
            if (fresh.end_time) {
              setEndTime(isoToLocalTime(fresh.end_time))
              setEndDate(isoToLocalDate(fresh.end_time))
            }
            if (fresh.quality) setSleepQuality(fresh.quality as SleepQuality)
            setNote(fresh.note ?? '')
          }
        } catch {
          Taro.showToast({ title: '加载记录失败', icon: 'none' })
        }
      } else {
        if (voiceFields?.duration_min) {
          const min = parseInt(voiceFields.duration_min, 10)
          if (min > 0) {
            setMode('manual')
            const end = new Date()
            const start = new Date(end.getTime() - min * 60 * 1000)
            setStartDate(dayjs(start).format('YYYY-MM-DD'))
            setStartTime(dayjs(start).format('HH:mm'))
            setEndDate(dayjs(end).format('YYYY-MM-DD'))
            setEndTime(dayjs(end).format('HH:mm'))
          }
        }
        checkOngoing(fid, baby.id)
      }
    } catch {
      Taro.showToast({ title: '加载失败，请重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  /**
   * 查询是否有进行中的睡眠记录，若有则恢复计时
   */
  const checkOngoing = async (fid: string, bid: string) => {
    if (ongoingCheckedRef.current) return
    ongoingCheckedRef.current = true

    try {
      const ongoing = await recordsApi.sleep.getOngoing(fid, bid)
      if (!ongoing) return
      const start = dayjs(ongoing.start_time).toDate()
      const elapsedSeconds = Math.max(0, dayjs().diff(dayjs(ongoing.start_time), 'second'))
      setTimerStartTime(start)
      setTimerSeconds(Math.max(0, elapsedSeconds))
      setOngoingId(ongoing.id)
      setTimerRunning(true)
    } catch {
      // 查询失败静默处理
    }
  }

  /**
   * 点「开始计时」→ 立即调用 startSleep API
   */
  const handleTimerStart = async () => {
    if (!familyId || !babyId) {
      Taro.showToast({ title: '请先完成宝宝建档', icon: 'none' })
      return
    }
    if (timerApiLoading) return
    setTimerApiLoading(true)
    try {
      const startDateDate = new Date()
      const startISO = nowLocalISO()
      const { id } = await recordsApi.sleep.startSleep(familyId, {
        baby_id: babyId,
        start_time: startISO,
        sleep_period: inferSleepPeriod(startISO),
      })
      setOngoingId(id)
      setTimerStartTime(startDateDate)
      setTimerSeconds(0)
      setTimerRunning(true)
      setTimerStopped(false)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string }
      if (e?.statusCode === 409 || e?.message?.includes('已有进行中')) {
        try {
          const ongoing = await recordsApi.sleep.getOngoing(familyId, babyId)
          if (ongoing) {
            const start = dayjs(ongoing.start_time).toDate()
            setTimerStartTime(start)
            setTimerSeconds(Math.max(0, dayjs().diff(dayjs(ongoing.start_time), 'second')))
            setOngoingId(ongoing.id)
            setTimerRunning(true)
            setTimerStopped(false)
            Taro.showToast({ title: '已恢复进行中的睡眠计时', icon: 'none' })
            return
          }
        } catch { /* ignore */ }
      }
      Taro.showToast({ title: err instanceof Error ? err.message : '开始计时失败，请重试', icon: 'none' })
    } finally {
      setTimerApiLoading(false)
    }
  }

  /**
   * 实际执行 endSleep API 调用
   */
  const doEndSleep = async () => {
    if (!familyId || !ongoingId) return
    setTimerApiLoading(true)
    try {
      await recordsApi.sleep.endSleep(familyId, ongoingId, {
        end_time: nowLocalISO(),
        quality: sleepQuality,
        note: note || undefined,
        sleep_period: timerStartTime ? inferSleepPeriod(dateToLocalISO(timerStartTime)) : undefined,
      })
      setTimerStopped(true)
      setShortSleepDialogOpen(false)
      Taro.showToast({ title: '睡眠记录已保存', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 1400)
    } catch (err) {
      setTimerRunning(true)
      Taro.showToast({ title: err instanceof Error ? err.message : '结束计时失败，请重试', icon: 'none' })
    } finally {
      setTimerApiLoading(false)
      setShortSleepDialogLoading(false)
    }
  }

  /**
   * 点「结束睡眠」：
   *   < 3 分钟 → 暂停本地计时 + 弹二次确认
   *   >= 3 分钟 → 直接结束
   */
  const handleTimerStop = () => {
    if (!familyId || !ongoingId) {
      Taro.showToast({ title: '未找到进行中的睡眠记录', icon: 'none' })
      return
    }
    if (timerApiLoading) return

    setTimerRunning(false)

    if (timerSeconds < SHORT_SLEEP_THRESHOLD_SECONDS) {
      setShortSleepSeconds(timerSeconds)
      setShortSleepDialogOpen(true)
    } else {
      doEndSleep()
    }
  }

  /**
   * 弹窗「继续计时」：关闭弹窗，恢复本地计时器
   */
  const handleKeepTiming = () => {
    setShortSleepDialogOpen(false)
    setTimerRunning(true)
  }

  /**
   * TimerMode 按钮「继续计时」：直接恢复本地计时
   */
  const handleTimerResume = () => {
    setTimerRunning(true)
  }

  /**
   * 点「取消本次计时」→ 暂停计时器，弹取消确认弹窗
   */
  const handleCancelRequest = () => {
    if (timerApiLoading) return
    setTimerRunning(false)
    setCancelDialogOpen(true)
  }

  /**
   * 取消弹窗「继续计时」：关闭弹窗，恢复计时
   */
  const handleCancelDialogKeep = () => {
    setCancelDialogOpen(false)
    setTimerRunning(true)
  }

  /**
   * 取消弹窗「确认取消」：
   *   1. 调用 remove API 删除服务端 ongoing 记录
   *   2. 成功 → 重置所有计时状态回 idle
   *   3. 失败 → Toast 提示，恢复计时
   */
  const handleCancelConfirm = async () => {
    if (!familyId || !ongoingId) {
      setCancelDialogOpen(false)
      setTimerRunning(false)
      setTimerSeconds(0)
      setTimerStartTime(null)
      setOngoingId(null)
      setTimerStopped(false)
      return
    }
    setCancelDialogLoading(true)
    try {
      await recordsApi.sleep.remove(familyId, ongoingId)
      setCancelDialogOpen(false)
      setTimerRunning(false)
      setTimerSeconds(0)
      setTimerStartTime(null)
      setOngoingId(null)
      setTimerStopped(false)
      Taro.showToast({ title: '计时已取消', icon: 'success' })
    } catch {
      setCancelDialogOpen(false)
      setTimerRunning(true)
      Taro.showToast({ title: '取消失败，请重试', icon: 'none' })
    } finally {
      setCancelDialogLoading(false)
    }
  }

  /**
   * 弹窗「仍然保存」：正常调用 endSleep
   */
  const handleSaveAnyway = () => {
    setShortSleepDialogLoading(true)
    doEndSleep()
  }

  // ── 补录/编辑模式提交 ──────────────────────────────────────────
  const handleSubmit = async () => {
    if (!familyId || !babyId) {
      Taro.showToast({ title: '请先完成宝宝建档', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      if (isEditMode && editRecordId) {
        if (calcDurationMinFromRange(startDate, startTime, endDate, endTime) <= 0) {
          Taro.showToast({ title: '结束时间应晚于开始时间', icon: 'none' })
          setSubmitting(false)
          return
        }
        const { startISO, endISO } = buildLocalISOPair(startDate, startTime, endDate, endTime)

        await recordsApi.sleep.update(familyId, editRecordId, {
          start_time: startISO,
          end_time: endISO,
          quality: sleepQuality,
          note: note || undefined,
        })

        Taro.showToast({ title: '睡眠记录已更新', icon: 'success' })
        setTimeout(() => Taro.navigateBack(), 1400)
        return
      }

      // 补录模式（mode === "manual"）：两步流程
      if (calcDurationMinFromRange(startDate, startTime, endDate, endTime) <= 0) {
        Taro.showToast({ title: '结束时间应晚于开始时间', icon: 'none' })
        setSubmitting(false)
        return
      }
      const { startISO, endISO } = buildLocalISOPair(startDate, startTime, endDate, endTime)

      await recordsApi.sleep.createComplete(familyId, {
        baby_id: babyId,
        start_time: startISO,
        end_time: endISO,
        quality: sleepQuality,
        sleep_period: inferSleepPeriod(startISO),
        note: note || undefined,
      })

      Taro.showToast({ title: '睡眠记录已保存', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 1400)
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '保存失败，请重试', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!familyId || !editRecordId) return
    try {
      await recordsApi.sleep.remove(familyId, editRecordId)
      Taro.showToast({ title: '记录已删除', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 1200)
    } catch {
      Taro.showToast({ title: '删除失败，请重试', icon: 'none' })
    }
  }

  // ── Loading 态 ──────────────────────────────────────────────────
  if (loading) {
    return (
      <View className={cls('sleep-page')}>
        <View className='sleep-loading'><Text>加载中...</Text></View>
      </View>
    )
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <View className={cls('sleep-page')}>
      {/* 导航栏 */}
      <View className='sleep-nav' style={{ paddingTop: `${getStatusBarHeight() + 10}px` }}>
        <View className='sleep-nav__back' onClick={() => Taro.navigateBack()}>
          <Text className='sleep-nav__back-arrow'>{'<'}</Text>
        </View>
        <Text className='sleep-nav__title'>{isEditMode ? '编辑睡眠记录' : '睡眠记录'}</Text>
        {isEditMode ? (
          <View className='sleep-nav__delete' onClick={() => setDeleteConfirmOpen(true)}>
            <Text className='sleep-nav__delete-text'>删除</Text>
          </View>
        ) : (
          <View className='sleep-nav__spacer' />
        )}
      </View>

      <View className='sleep-body'>
        {/* 模式切换（编辑模式隐藏） */}
        {!isEditMode && (
          <View className='sleep-mode-switch'>
            {(
              [
                { key: 'timer' as const, label: '计时模式' },
                { key: 'manual' as const, label: '补录模式' },
              ] as const
            ).map(({ key, label }) => (
              <View
                key={key}
                className={`sleep-mode-switch__item ${mode === key ? 'sleep-mode-switch__item--active' : ''}`}
                onClick={() => setMode(key)}
              >
                <Text className='sleep-mode-switch__label'>{label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 计时模式 */}
        {mode === 'timer' && !isEditMode && (
          <TimerMode
            running={timerRunning}
            stopped={timerStopped}
            seconds={timerSeconds}
            startTime={timerStartTime}
            apiLoading={timerApiLoading}
            onStart={handleTimerStart}
            onResume={handleTimerResume}
            onStop={handleTimerStop}
            onCancel={handleCancelRequest}
          />
        )}

        {/* 补录模式 */}
        {mode === 'manual' && (
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
        )}

        {/* 睡眠质量（两种模式均显示） */}
        <QualitySection value={sleepQuality} onChange={setSleepQuality} />

        {/* 备注 */}
        <View className='sleep-section-label'><Text>备注（可选）</Text></View>
        <View className='sleep-card'>
          <Input
            className='sleep-note-input'
            placeholder='如：夜哭了2次'
            value={note}
            onInput={(e) => setNote(e.detail.value)}
          />
        </View>
      </View>

      {/* 底部按钮：计时模式下隐藏 */}
      {mode !== 'timer' && (
        <View className='sleep-submit'>
          <View
            className={`sleep-submit__btn ${submitting ? 'sleep-submit__btn--loading' : ''}`}
            onClick={submitting ? undefined : handleSubmit}
          >
            <Text className='sleep-submit__text'>
              {submitting ? '提交中...' : isEditMode ? '更新记录' : '保存记录'}
            </Text>
          </View>
        </View>
      )}

      {/* 二次确认弹窗：睡眠时间过短 */}
      {shortSleepDialogOpen && (
        <View
          className='sleep-dialog-overlay'
          onClick={handleKeepTiming}
        >
          <View
            className='sleep-dialog'
            onClick={(e) => e.stopPropagation()}
          >
            <View className='sleep-dialog__body'>
              <View className='sleep-dialog__moon-icon'>
                <Text style={{ fontSize: '36px', color: '#9A8090' }}>Zzz</Text>
              </View>
              <Text className='sleep-dialog__title'>睡眠时间太短</Text>
              <Text className='sleep-dialog__desc'>
                本次睡眠仅{' '}
                <Text style={{ fontWeight: '600', color: '#F87098' }}>
                  {formatShortDuration(shortSleepSeconds)}
                </Text>
                ，可能是误触了结束按钮。
              </Text>
            </View>

            <View className='sleep-dialog__actions'>
              <View
                className='sleep-dialog__btn sleep-dialog__btn--secondary'
                onClick={shortSleepDialogLoading ? undefined : handleKeepTiming}
              >
                <Text className='sleep-dialog__btn-text sleep-dialog__btn-text--secondary'>
                  继续计时
                </Text>
              </View>
              <View
                className='sleep-dialog__btn sleep-dialog__btn--primary'
                onClick={shortSleepDialogLoading ? undefined : handleSaveAnyway}
              >
                <Text className='sleep-dialog__btn-text sleep-dialog__btn-text--primary'>
                  {shortSleepDialogLoading ? '保存中...' : '仍然保存'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 取消计时确认弹窗 */}
      {cancelDialogOpen && (
        <View
          className='sleep-dialog-overlay'
          onClick={handleCancelDialogKeep}
        >
          <View
            className='sleep-dialog'
            onClick={(e) => e.stopPropagation()}
          >
            <View className='sleep-dialog__body'>
              <View className='sleep-dialog__moon-icon'>
                <Text style={{ fontSize: '32px', color: '#9A8090' }}>X</Text>
              </View>
              <Text className='sleep-dialog__title'>取消本次计时？</Text>
              <Text className='sleep-dialog__desc'>
                已记录的时间将不会保存，此操作不可撤销。
              </Text>
            </View>

            <View className='sleep-dialog__actions'>
              <View
                className='sleep-dialog__btn sleep-dialog__btn--secondary'
                onClick={cancelDialogLoading ? undefined : handleCancelDialogKeep}
              >
                <Text className='sleep-dialog__btn-text sleep-dialog__btn-text--secondary'>
                  继续计时
                </Text>
              </View>
              <View
                className='sleep-dialog__btn sleep-dialog__btn--primary'
                onClick={cancelDialogLoading ? undefined : handleCancelConfirm}
              >
                <Text className='sleep-dialog__btn-text sleep-dialog__btn-text--primary'>
                  {cancelDialogLoading ? '取消中...' : '确认取消'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirmOpen && (
        <View
          className='sleep-dialog-overlay'
          onClick={() => setDeleteConfirmOpen(false)}
        >
          <View
            className='sleep-dialog'
            onClick={(e) => e.stopPropagation()}
          >
            <View className='sleep-dialog__body'>
              <View className='sleep-dialog__moon-icon'>
                <Text style={{ fontSize: '32px', color: '#9A8090' }}>!</Text>
              </View>
              <Text className='sleep-dialog__title'>确认删除记录？</Text>
              <Text className='sleep-dialog__desc'>
                此操作不可撤销。
              </Text>
            </View>

            <View className='sleep-dialog__actions'>
              <View
                className='sleep-dialog__btn sleep-dialog__btn--secondary'
                onClick={() => setDeleteConfirmOpen(false)}
              >
                <Text className='sleep-dialog__btn-text sleep-dialog__btn-text--secondary'>
                  取消
                </Text>
              </View>
              <View
                className='sleep-dialog__btn sleep-dialog__btn--danger'
                onClick={() => {
                  setDeleteConfirmOpen(false)
                  handleDelete()
                }}
              >
                <Text className='sleep-dialog__btn-text sleep-dialog__btn-text--danger'>
                  确认删除
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
