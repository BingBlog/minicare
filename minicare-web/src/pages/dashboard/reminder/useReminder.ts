/**
 * useReminder — 通用提醒调度 Hook
 *
 * 核心职责：
 * 1. 管理多个 ReminderSource，定期检查是否到达触发时间
 * 2. 管理提醒生命周期：idle → ringing → dismissed/snoozed
 * 3. 协调 AudioManager 播放/停止
 * 4. 支持 dismiss 操作：停止本轮 / 延迟 N 分钟
 *
 * 检测节拍：每 30 秒检查一次（与 Dashboard 轮询对齐）
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { audioManager } from './AudioManager'

// ─── 类型定义 ───────────────────────────────────────────────

/** 提醒源接口 — 各场景实现此接口接入提醒系统 */
export interface ReminderSource {
  /** 唯一标识，如 'feeding' | 'supplement' */
  id: string
  /** 显示名称，如 '喂奶提醒' */
  label: string
  /** 计算下次目标时间（返回 null 表示无法计算/不需要提醒） */
  getNextTriggerTime: () => Date | null
  /** 提前多少分钟开始提醒，默认 30 */
  leadTime?: number
  /** 重复提醒间隔（分钟），默认 10 */
  repeatInterval?: number
}

/** Dismiss 操作类型 */
export type DismissAction =
  | { type: 'stop_all' }               // 本次不再提醒（直到新记录产生）
  | { type: 'snooze'; minutes: number } // 延迟 N 分钟后再提醒

/** 当前正在响铃的提醒 */
export interface ActiveReminder {
  sourceId: string
  label: string
  targetTime: Date       // 预计目标时间（如预计喂奶时间）
  triggeredAt: Date      // 本次响铃触发时间
  remainingMin: number   // 距目标时间还有多少分钟
}

/** Hook 返回值 */
export interface ReminderState {
  /** 当前正在响铃的提醒（null 表示无） */
  active: ActiveReminder | null
  /** 执行 dismiss 操作 */
  dismiss: (action: DismissAction) => void
}

// ─── 内部状态 ───────────────────────────────────────────────

interface SourceState {
  /** 本轮已被 stop_all，不再触发（直到 targetTime 变化才重置） */
  stopped: boolean
  /** snooze 到期时间（在此之前不触发） */
  snoozeUntil: Date | null
  /** 上次响铃时间（用于控制 repeatInterval） */
  lastRingAt: Date | null
  /** 上次计算的 targetTime（用于检测目标变化以重置 stopped） */
  lastTargetTime: number | null
}

const CHECK_INTERVAL = 30_000 // 30 秒检查一次

// ─── Hook 实现 ──────────────────────────────────────────────

export function useReminder(
  sources: ReminderSource[],
  options?: { isNight?: boolean; enabled?: boolean },
): ReminderState {
  const { isNight = false, enabled = true } = options ?? {}

  const [active, setActive] = useState<ActiveReminder | null>(null)
  const stateMapRef = useRef<Map<string, SourceState>>(new Map())

  // 确保每个 source 都有对应的内部状态
  const getSourceState = useCallback((id: string): SourceState => {
    let s = stateMapRef.current.get(id)
    if (!s) {
      s = { stopped: false, snoozeUntil: null, lastRingAt: null, lastTargetTime: null }
      stateMapRef.current.set(id, s)
    }
    return s
  }, [])

  // 检查逻辑
  const checkSources = useCallback(() => {
    if (!enabled) return

    const now = new Date()

    for (const source of sources) {
      const state = getSourceState(source.id)
      const targetTime = source.getNextTriggerTime()

      if (!targetTime) continue

      const targetTs = targetTime.getTime()

      // 目标时间变化（新的喂奶记录产生） → 重置 stopped 状态
      if (state.lastTargetTime !== null && Math.abs(targetTs - state.lastTargetTime) > 60_000) {
        state.stopped = false
        state.snoozeUntil = null
        state.lastRingAt = null
      }
      state.lastTargetTime = targetTs

      // 已被 stop_all → 跳过
      if (state.stopped) continue

      // 在 snooze 期间 → 跳过
      if (state.snoozeUntil && now < state.snoozeUntil) continue

      // 计算是否在提醒窗口内
      const leadTime = source.leadTime ?? 30
      const triggerStart = new Date(targetTs - leadTime * 60_000)
      const diffMin = Math.round((targetTs - now.getTime()) / 60_000)

      // 未进入提醒窗口 或 已超过目标时间 30 分钟（不再提醒）
      if (now < triggerStart || diffMin < -30) continue

      // 检查 repeatInterval：距上次响铃是否已过间隔
      const repeatInterval = source.repeatInterval ?? 10
      if (state.lastRingAt) {
        const sinceLastRing = (now.getTime() - state.lastRingAt.getTime()) / 60_000
        if (sinceLastRing < repeatInterval) continue
      }

      // 触发提醒
      state.lastRingAt = now
      setActive({
        sourceId: source.id,
        label: source.label,
        targetTime,
        triggeredAt: now,
        remainingMin: Math.max(0, diffMin),
      })
      audioManager.play(isNight)
      return // 一次只触发一个提醒
    }
  }, [sources, enabled, isNight, getSourceState])

  // 定时检查
  useEffect(() => {
    if (!enabled) return

    // 立即检查一次
    checkSources()

    const timer = setInterval(checkSources, CHECK_INTERVAL)
    return () => clearInterval(timer)
  }, [checkSources, enabled])

  // 预加载音频
  useEffect(() => {
    if (enabled) audioManager.preload()
  }, [enabled])

  // 组件卸载时停止音频
  useEffect(() => {
    return () => {
      audioManager.stop()
    }
  }, [])

  // dismiss 操作
  const dismiss = useCallback((action: DismissAction) => {
    if (!active) return

    audioManager.stop()
    const state = getSourceState(active.sourceId)

    switch (action.type) {
      case 'stop_all':
        state.stopped = true
        state.snoozeUntil = null
        break
      case 'snooze':
        state.snoozeUntil = new Date(Date.now() + action.minutes * 60_000)
        state.stopped = false
        break
    }

    setActive(null)
  }, [active, getSourceState])

  return { active, dismiss }
}
