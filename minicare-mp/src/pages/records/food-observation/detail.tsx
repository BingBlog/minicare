import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useEffect, useState, useCallback } from 'react'
import { foodObservationApi } from '@/api'
import type { FoodObservationDetail, ObservationStatus, ReactionLevel } from '@/api'
import { getStoredFamilyId } from '@/api/http'
import { OBSERVATION_STATUS_CFG, OBSERVATION_STATUS_LABELS, REACTION_FLAGS_LABELS, REACTION_LEVEL_LABELS } from '@/lib/constants'
import { getStatusBarHeight } from '@/lib/safeArea'
import { useIsIPad } from '@/lib/useIsIPad'
import dayjs from 'dayjs'
import './detail.scss'

const REACTION_FLAG_KEYS = Object.keys(REACTION_FLAGS_LABELS)

const REACTION_LEVEL_OPTIONS: { value: ReactionLevel; label: string }[] = [
  { value: 'mild', label: REACTION_LEVEL_LABELS.mild },
  { value: 'moderate', label: REACTION_LEVEL_LABELS.moderate },
  { value: 'severe', label: REACTION_LEVEL_LABELS.severe },
]

const LOG_ACTION_LABELS: Record<string, string> = {
  continue: '无反应继续',
  pause: '暂停',
  mark_suspected: '标记疑似',
  mark_allergic: '确认过敏',
}

const LOG_ACTION_STYLE: Record<string, string> = {
  continue: 'continue',
  pause: 'continue',
  mark_suspected: 'suspected',
  mark_allergic: 'allergic',
}

const UNLINK_TARGET_STATUS_OPTIONS: { value: 'observing' | 'paused' | 'suspected'; label: string }[] = [
  { value: 'observing', label: '改为观察中' },
  { value: 'paused', label: '改为已停用' },
  { value: 'suspected', label: '改为疑似过敏' },
]

export default function FoodObservationDetailPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => isIPad ? `${base} is-ipad` : base

  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<FoodObservationDetail | null>(null)
  const [familyId, setFamilyId] = useState('')
  const [obsId, setObsId] = useState('')

  const [intakeAmount, setIntakeAmount] = useState('')
  const [selectedFlags, setSelectedFlags] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [showReactionFlow, setShowReactionFlow] = useState(false)
  const [reactionLevel, setReactionLevel] = useState<ReactionLevel | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [checkinDate, setCheckinDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [editingLogDate, setEditingLogDate] = useState<string | null>(null)

  const fetchData = useCallback(async (fid: string, id: string) => {
    try {
      const data = await foodObservationApi.getOne(fid, id)
      setDetail(data)
    } catch {
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [])

  useLoad((params) => {
    const id = (params as any).id as string
    if (!id) {
      Taro.showToast({ title: '参数错误', icon: 'none' })
      return
    }
    setObsId(id)
    const fid = getStoredFamilyId()
    if (fid) {
      setFamilyId(fid)
      fetchData(fid, id)
    } else {
      setLoading(false)
    }
  })

  useEffect(() => {
    if (familyId && obsId) {
      fetchData(familyId, obsId)
    }
  }, [familyId, obsId, fetchData])

  const refresh = useCallback(() => {
    if (familyId && obsId) {
      fetchData(familyId, obsId)
    }
  }, [familyId, obsId, fetchData])

  const toggleFlag = useCallback((key: string) => {
    setSelectedFlags((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const handleContinue = useCallback(async () => {
    if (!familyId || !obsId || submitting) return
    setSubmitting(true)
    try {
      if (intakeAmount || selectedFlags.size > 0 || note) {
        const currentDay = detail?.current_day ?? 1
        await foodObservationApi.upsertLog(familyId, obsId, currentDay, {
          record_date: checkinDate,
          intake_amount_g: intakeAmount ? Number(intakeAmount) : undefined,
          reaction_flags: selectedFlags.size > 0 ? Array.from(selectedFlags) : undefined,
          note: note || undefined,
          action: 'continue',
        })
      } else {
        await foodObservationApi.upsertLog(familyId, obsId, detail?.current_day ?? 1, {
          record_date: checkinDate,
          action: 'continue',
        })
      }
      Taro.showToast({ title: '记录成功', icon: 'success' })
      setIntakeAmount('')
      setSelectedFlags(new Set())
      setNote('')
      setCheckinDate(dayjs().format('YYYY-MM-DD'))
      refresh()
    } catch {
      Taro.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }, [familyId, obsId, submitting, intakeAmount, selectedFlags, note, detail, checkinDate, refresh])

  const handleMarkReaction = useCallback(async (targetStatus: ObservationStatus) => {
    if (!familyId || !obsId || !reactionLevel || submitting) return
    setSubmitting(true)
    try {
      const currentDay = detail?.current_day ?? 1
      await foodObservationApi.createReaction(familyId, obsId, {
        day_index: currentDay,
        record_time: `${checkinDate}T${dayjs().format('HH:mm:ss')}`,
        allergy_symptoms: selectedFlags.size > 0 ? Array.from(selectedFlags) : undefined,
        allergy_severity: reactionLevel,
        note: note || undefined,
        target_status: targetStatus,
      })
      Taro.showToast({ title: '已标记', icon: 'success' })
      setShowReactionFlow(false)
      setReactionLevel(null)
      setIntakeAmount('')
      setSelectedFlags(new Set())
      setNote('')
      refresh()
    } catch {
      Taro.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }, [familyId, obsId, reactionLevel, submitting, detail, selectedFlags, note, checkinDate, refresh])

  const handleUpdateLogDate = useCallback(async (dayIndex: number, newDate: string) => {
    if (!familyId || !obsId || submitting) return
    setSubmitting(true)
    try {
      await foodObservationApi.upsertLog(familyId, obsId, dayIndex, {
        record_date: newDate,
      })
      Taro.showToast({ title: '日期已更新', icon: 'success' })
      setEditingLogDate(null)
      refresh()
    } catch {
      Taro.showToast({ title: '更新失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }, [familyId, obsId, submitting, refresh])

  const handleRemoveLog = useCallback(async (dayIndex: number) => {
    if (!familyId || !obsId || submitting) return
    const confirm = await Taro.showModal({
      title: '删除打卡',
      content: `确认删除 Day${dayIndex} 的打卡记录吗？`,
      confirmText: '删除',
      confirmColor: '#F05060',
    })
    if (!confirm.confirm) return

    setSubmitting(true)
    try {
      await foodObservationApi.removeLog(familyId, obsId, dayIndex)
      Taro.showToast({ title: '已删除', icon: 'success' })
      refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败'
      Taro.showToast({ title: message, icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }, [familyId, obsId, submitting, refresh])

  const handleUnlinkHealth = useCallback(async (dayIndex: number) => {
    if (!familyId || !obsId || submitting) return

    const action = await Taro.showActionSheet({
      itemList: UNLINK_TARGET_STATUS_OPTIONS.map((item) => item.label),
    }).catch(() => null)
    if (!action) return

    const target = UNLINK_TARGET_STATUS_OPTIONS[action.tapIndex]
    if (!target) return

    const confirm = await Taro.showModal({
      title: '撤销健康关联',
      content: `将 Day${dayIndex} 关联的健康记录改为手动记录，并将任务状态${target.label.replace('改为', '')}，确认继续？`,
      confirmText: '确认',
      confirmColor: '#F87098',
    })
    if (!confirm.confirm) return

    setSubmitting(true)
    try {
      await foodObservationApi.unlinkLogHealth(familyId, obsId, dayIndex, { target_status: target.value })
      Taro.showToast({ title: '已撤销关联', icon: 'success' })
      refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : '撤销失败'
      Taro.showToast({ title: message, icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }, [familyId, obsId, submitting, refresh])

  const handleRemoveObservation = useCallback(async () => {
    if (!familyId || !obsId || submitting) return
    const confirm = await Taro.showModal({
      title: '删除排敏任务',
      content: '确认删除该排敏任务吗？删除后不可恢复。',
      confirmText: '删除',
      confirmColor: '#F05060',
    })
    if (!confirm.confirm) return

    setSubmitting(true)
    try {
      await foodObservationApi.removeObservation(familyId, obsId)
      Taro.showToast({ title: '已删除', icon: 'success' })
      Taro.eventCenter.trigger('home:refresh')
      setTimeout(() => Taro.navigateBack(), 500)
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败'
      Taro.showToast({ title: message, icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }, [familyId, obsId, submitting])

  if (loading || !detail) {
    return (
      <View className={cls('obs-detail-page')}>
        <View className='obs-loading'>
          <Text>加载中...</Text>
        </View>
      </View>
    )
  }

  const statusCfg = OBSERVATION_STATUS_CFG[detail.status]
  const isObserving = detail.status === 'observing'
  const canDeleteDailyLog = detail.status !== 'safe' && detail.status !== 'allergic'
  const currentDay = detail.current_day ?? 1
  const totalDays = detail.observation_days

  const sortedLogs = [...detail.logs].sort((a, b) => a.day_index - b.day_index)

  return (
    <View className={cls('obs-detail-page')}>
      <View
        className='obs-nav'
        style={{
          paddingTop: `${getStatusBarHeight() + 10}px`,
        }}
      >
        <View className='obs-nav__back' onClick={() => Taro.navigateBack()}>
          <Text className='obs-nav__back-arrow'>{'<'}</Text>
        </View>
        <Text className='obs-nav__title'>{detail.food_name}</Text>
        <View className='obs-nav__spacer' />
      </View>

      <View className='obs-body'>
        <View className='obs-progress-card'>
          <View className='obs-progress-header'>
            <Text className='obs-progress-food'>{detail.food_name}</Text>
            {statusCfg && (
              <View
                className='obs-progress-badge'
                style={{ background: statusCfg.bg, color: statusCfg.color }}
              >
                <Text>{statusCfg.label}</Text>
              </View>
            )}
          </View>
          <Text className='obs-progress-day'>
            {isObserving
              ? `Day${currentDay}/${totalDays} ${OBSERVATION_STATUS_LABELS[detail.status]}`
              : OBSERVATION_STATUS_LABELS[detail.status]}
          </Text>
          <View className='obs-dots'>
            {Array.from({ length: totalDays }, (_, i) => {
              const dayNum = i + 1
              const log = detail.logs.find((l) => l.day_index === dayNum)
              const isDone = !!log && log.action === 'continue'
              const isCurrent = isObserving && dayNum === currentDay

              // 与看板列表页一致的标签样式
              let tagCls = 'obs-day-tag'
              let tagText = `D${dayNum}`
              if (!isObserving) {
                // 非观察中状态，所有已完成天数统一显示最终状态
                if (detail.status === 'safe') { tagCls += ' obs-day-tag--safe'; tagText = `D${dayNum} ✓` }
                else if (detail.status === 'allergic') { tagCls += ' obs-day-tag--allergic'; tagText = `D${dayNum} ✗` }
                else if (detail.status === 'suspected') { tagCls += ' obs-day-tag--suspected'; tagText = `D${dayNum} !` }
                else if (detail.status === 'paused') { tagCls += ' obs-day-tag--paused' }
                else { tagCls += ' obs-day-tag--future' }
              } else if (isCurrent) {
                tagCls += ' obs-day-tag--current'
              } else if (isDone) {
                tagCls += ' obs-day-tag--done'; tagText = `D${dayNum} ✓`
              } else {
                tagCls += ' obs-day-tag--future'
              }
              return (
                <View key={dayNum} className={tagCls}>
                  <Text className='obs-day-tag__text'>{tagText}</Text>
                </View>
              )
            })}
          </View>
        </View>

        {!isObserving && (
          <View className='obs-status-card'>
            {detail.status === 'safe' && (
              <View className='obs-status-banner obs-status-banner--safe'>
                <Text className='obs-status-icon' style={{ color: '#2A9E70' }}>&#10003;</Text>
                <Text className='obs-status-text' style={{ color: '#2A9E70' }}>已耐受</Text>
              </View>
            )}
            {detail.status === 'suspected' && (
              <View>
                <View className='obs-status-banner obs-status-banner--suspected'>
                  <Text className='obs-status-icon' style={{ color: '#E07A00' }}>!</Text>
                  <Text className='obs-status-text' style={{ color: '#E07A00' }}>疑似过敏</Text>
                </View>
                {detail.retry_after_date && (
                  <Text className='obs-status-hint'>
                    建议在 {dayjs(detail.retry_after_date).format('YYYY-MM-DD')} 后重新尝试
                  </Text>
                )}
              </View>
            )}
            {detail.status === 'allergic' && (
              <View>
                <View className='obs-status-banner obs-status-banner--allergic'>
                  <Text className='obs-status-icon' style={{ color: '#E8305A' }}>!</Text>
                  <Text className='obs-status-text' style={{ color: '#E8305A' }}>确认过敏</Text>
                </View>
                <Text className='obs-status-hint'>
                  请避免再次接触该食物，如有需要请咨询医生
                </Text>
              </View>
            )}
            {detail.status === 'paused' && (
              <View>
                <View className='obs-status-banner'>
                  <Text className='obs-status-icon' style={{ color: '#9A8090' }}>--</Text>
                  <Text className='obs-status-text' style={{ color: '#9A8090' }}>已停用</Text>
                </View>
                <Text className='obs-status-hint'>
                  该排敏任务已停用，可在需要时通过撤销关联改回观察中
                </Text>
              </View>
            )}
            {detail.severity && detail.severity !== 'none' && (
              <Text className='obs-status-hint' style={{ marginTop: 8 }}>
                反应程度：{REACTION_LEVEL_LABELS[detail.severity]}
              </Text>
            )}
            {detail.reaction_note && (
              <Text className='obs-status-hint' style={{ marginTop: 4 }}>
                {detail.reaction_note}
              </Text>
            )}
          </View>
        )}

        {isObserving && !showReactionFlow && (
          <View className='obs-checkin-card'>
            <View className='obs-checkin-header'>
              <Text className='obs-checkin-title'>{'今日打卡 Day' + currentDay}</Text>
              <Picker
                mode='date'
                value={checkinDate}
                end={dayjs().format('YYYY-MM-DD')}
                onChange={(e) => setCheckinDate(e.detail.value)}
              >
                <View className='obs-checkin-date'>
                  <Text className='obs-checkin-date-text'>{dayjs(checkinDate).format('MM月DD日')}</Text>
                  <Text className='obs-checkin-date-arrow'>{'>'}</Text>
                </View>
              </Picker>
            </View>

            <View className='obs-field'>
              <Text className='obs-field__label'>摄入量 (g)</Text>
              <Input
                className='obs-field__input'
                type='digit'
                placeholder='输入克数'
                value={intakeAmount}
                onInput={(e) => setIntakeAmount(e.detail.value)}
              />
            </View>

            <View className='obs-field'>
              <Text className='obs-field__label'>反应表现</Text>
              <View className='obs-flags'>
                {REACTION_FLAG_KEYS.map((key) => {
                  const active = selectedFlags.has(key)
                  return (
                    <View
                      key={key}
                      className={`obs-flag ${active ? 'obs-flag--active' : ''}`}
                      onClick={() => toggleFlag(key)}
                    >
                      <View className='obs-flag__check'>
                        {active && <Text className='obs-flag__mark'>V</Text>}
                      </View>
                      <Text className='obs-flag__text'>{REACTION_FLAGS_LABELS[key]}</Text>
                    </View>
                  )
                })}
              </View>
            </View>

            <View className='obs-field'>
              <Text className='obs-field__label'>备注</Text>
              <Input
                className='obs-note-input'
                placeholder='添加备注'
                value={note}
                onInput={(e) => setNote(e.detail.value)}
              />
            </View>

            <View className='obs-actions'>
              <View
                className={`obs-action-btn obs-action-btn--continue ${submitting ? 'obs-action-btn--loading' : ''}`}
                onClick={handleContinue}
              >
                <Text>无反应继续</Text>
              </View>
              <View
                className='obs-action-btn obs-action-btn--react'
                onClick={() => setShowReactionFlow(true)}
              >
                <Text>标记反应</Text>
              </View>
            </View>
          </View>
        )}

        {isObserving && showReactionFlow && (
          <View className='obs-reaction-flow'>
            <Text className='obs-reaction-title'>标记反应</Text>

            <Text className='obs-field__label'>反应程度</Text>
            <View className='obs-level-grid'>
              {REACTION_LEVEL_OPTIONS.map((opt) => {
                const active = reactionLevel === opt.value
                return (
                  <View
                    key={opt.value}
                    className={`obs-level-opt ${active ? 'obs-level-opt--active' : ''}`}
                    onClick={() => setReactionLevel(opt.value)}
                  >
                    <Text className='obs-level-opt__text'>{opt.label}</Text>
                  </View>
                )
              })}
            </View>

            <View className='obs-reaction-actions'>
              <View
                className={`obs-reaction-btn obs-reaction-btn--suspected ${submitting || !reactionLevel ? 'obs-reaction-btn--disabled' : ''}`}
                onClick={() => reactionLevel && handleMarkReaction('suspected')}
              >
                <Text>疑似过敏</Text>
              </View>
              <View
                className={`obs-reaction-btn obs-reaction-btn--allergic ${submitting || !reactionLevel ? 'obs-reaction-btn--disabled' : ''}`}
                onClick={() => reactionLevel && handleMarkReaction('allergic')}
              >
                <Text>确认过敏</Text>
              </View>
            </View>

            <View style={{ marginTop: 12 }}>
              <View
                className='obs-action-btn obs-action-btn--continue'
                onClick={() => { setShowReactionFlow(false); setReactionLevel(null) }}
              >
                <Text>取消</Text>
              </View>
            </View>
          </View>
        )}

        {sortedLogs.length > 0 && (
          <View className='obs-logs-card'>
            <Text className='obs-logs-title'>观察日志</Text>
            {sortedLogs.map((log, idx) => {
              const actionStyle = LOG_ACTION_STYLE[log.action] ?? 'continue'
              const isLast = idx === sortedLogs.length - 1
              const dotCls = log.action === 'continue'
                ? 'obs-log-dot obs-log-dot--safe'
                : 'obs-log-dot obs-log-dot--danger'
              return (
                <View key={log.id} className='obs-log-item'>
                  <View className='obs-log-dot-col'>
                    <View className={dotCls} />
                    {!isLast && <View className='obs-log-line' />}
                  </View>
                  <View className='obs-log-content'>
                    <View className='obs-log-header'>
                      <Text className='obs-log-day'>{'Day' + log.day_index}</Text>
                      {editingLogDate === log.id ? (
                        <Picker
                          mode='date'
                          value={dayjs(log.record_date).format('YYYY-MM-DD')}
                          end={dayjs().format('YYYY-MM-DD')}
                          onChange={(e) => handleUpdateLogDate(log.day_index, e.detail.value)}
                        >
                          <View className='obs-log-date-edit'>
                            <Text>{dayjs(log.record_date).format('MM-DD')}</Text>
                          </View>
                        </Picker>
                      ) : (
                        <Text
                          className='obs-log-date obs-log-date--editable'
                          onClick={() => setEditingLogDate(log.id)}
                        >
                          {dayjs(log.record_date).format('MM-DD')}
                        </Text>
                      )}
                    </View>
                    <View
                      className={`obs-log-action obs-log-action--${actionStyle}`}
                    >
                      <Text>{LOG_ACTION_LABELS[log.action] ?? log.action}</Text>
                    </View>
                    {log.intake_amount_g != null && (
                      <Text className='obs-log-detail'>摄入量: {log.intake_amount_g}g</Text>
                    )}
                    {log.reaction_flags && log.reaction_flags.length > 0 && (
                      <View className='obs-log-flags'>
                        {log.reaction_flags.map((f) => (
                          <View key={f} className='obs-log-flag'>
                            <Text>{REACTION_FLAGS_LABELS[f] ?? f}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {log.reaction_level && log.reaction_level !== 'none' && (
                      <Text className='obs-log-detail'>
                        反应程度: {REACTION_LEVEL_LABELS[log.reaction_level]}
                      </Text>
                    )}
                    {log.note && (
                      <Text className='obs-log-detail'>{log.note}</Text>
                    )}
                    <View className='obs-log-ops'>
                      {log.health_record_id ? (
                        <View
                          className='obs-log-op-btn obs-log-op-btn--warn'
                          onClick={() => handleUnlinkHealth(log.day_index)}
                        >
                          <Text>撤销关联</Text>
                        </View>
                      ) : canDeleteDailyLog ? (
                        <View
                          className='obs-log-op-btn'
                          onClick={() => handleRemoveLog(log.day_index)}
                        >
                          <Text>删除打卡</Text>
                        </View>
                      ) : (
                        <View className='obs-log-op-btn'>
                          <Text>保留追溯</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}

        {sortedLogs.length === 0 && (
          <View className='obs-logs-card'>
            <Text className='obs-logs-title'>观察日志</Text>
            <Text className='obs-empty-logs'>暂无记录</Text>
          </View>
        )}

        <View className='obs-danger-zone'>
          <View
            className={`obs-danger-btn ${submitting ? 'obs-danger-btn--loading' : ''}`}
            onClick={handleRemoveObservation}
          >
            <Text>删除排敏任务</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
