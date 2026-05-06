/**
 * 喂奶提醒源 — 优化版 V2
 *
 * 基于最近两天的喂奶记录计算下次预计喂奶时间。
 *
 * 算法改进（相对 V1）：
 * 1. 数据源扩展：结合今日+昨日的喂奶记录，而非仅今日最近3条
 * 2. 时段加权：优先采用同时段间隔（当前时间 ±2h 的间隔权重最高）
 * 3. 日夜分离：夜间长间隔（跨 22:00~06:00）单独降权，避免拉高白天预测
 * 4. 过期继续提醒：时间超出后不再截止，持续提醒直到产生新记录
 * 5. 冷启动优化：今日不足2条时，利用昨日同时段间隔作为预测基线
 *
 * 权重体系：
 * - 今日同时段间隔: 3.0
 * - 今日非同时段间隔: 1.5
 * - 昨日同时段间隔: 2.0
 * - 昨日非同时段间隔: 0.5
 * - 含夜间跨越的间隔: 额外 ×0.5 衰减
 */
import type { ReminderSource } from '../useReminder'
import type { TodayRecord } from '@/api'

/** 时段匹配窗口（±小时） */
const HOUR_WINDOW = 2

interface WeightedGap {
  gap: number   // 间隔（分钟）
  weight: number // 权重
}

/** 获取 UTC 时间对应的北京时间小时 */
function getBJHour(d: Date): number {
  return (d.getUTCHours() + 8) % 24
}

/**
 * 判断一个时间点是否在夜间（北京时间 22:00~06:00）
 */
function isNightHour(bjHour: number): boolean {
  return bjHour >= 22 || bjHour < 6
}

/**
 * 判断一个间隔是否横跨夜间（任一端点在夜间）
 */
function isNightGap(t1: Date, t2: Date): boolean {
  return isNightHour(getBJHour(t1)) || isNightHour(getBJHour(t2))
}

/**
 * 判断两个时间点是否属于同时段（当前时间 ±2h 窗口）
 */
function isSameTimeSlot(refHour: number, targetTime: Date): boolean {
  const targetHour = getBJHour(targetTime)
  const diff = Math.abs(refHour - targetHour)
  return diff <= HOUR_WINDOW || diff >= (24 - HOUR_WINDOW)
}

/**
 * 从一组时间有序的记录中提取相邻间隔
 */
function extractGaps(records: TodayRecord[], maxGap = 360): Array<{ gap: number; startTime: Date; endTime: Date }> {
  const gaps: Array<{ gap: number; startTime: Date; endTime: Date }> = []
  for (let i = 1; i < records.length; i++) {
    const t1 = new Date(records[i - 1].time)
    const t2 = new Date(records[i].time)
    const gap = (t2.getTime() - t1.getTime()) / 60_000
    if (gap > 0 && gap < maxGap) {
      gaps.push({ gap, startTime: t1, endTime: t2 })
    }
  }
  return gaps
}

/**
 * V2 优化版：根据最近两天喂奶记录计算下次预计喂奶时间
 *
 * @param todayFeedings  今日喂奶记录（按时间正序）
 * @param yesterdayFeedings 昨日喂奶记录（按时间正序）
 * @returns 预计下次喂奶时间，null 表示无法计算
 */
export function calcNextFeedTime(
  todayFeedings: TodayRecord[],
  yesterdayFeedings: TodayRecord[] = [],
): Date | null {
  // 今日无记录且昨日也不足 → 无法预测
  if (todayFeedings.length === 0 && yesterdayFeedings.length < 2) return null

  // 确定"当前时段"的参考小时（用最后一次喂奶时间，因为我们要预测的是它之后的间隔）
  let lastFeedTime: Date
  if (todayFeedings.length > 0) {
    lastFeedTime = new Date(todayFeedings[todayFeedings.length - 1].time)
  } else {
    lastFeedTime = new Date(yesterdayFeedings[yesterdayFeedings.length - 1].time)
  }
  const refHour = getBJHour(lastFeedTime)

  const weightedGaps: WeightedGap[] = []

  // ── 1. 今日间隔 ───────────────────────────────────────
  const todayGaps = extractGaps(todayFeedings)
  for (const { gap, startTime, endTime } of todayGaps) {
    // 基础权重：同时段 3.0，非同时段 1.5
    let weight = isSameTimeSlot(refHour, endTime) ? 3.0 : 1.5
    // 夜间间隔衰减
    if (isNightGap(startTime, endTime)) weight *= 0.5
    weightedGaps.push({ gap, weight })
  }

  // ── 2. 昨日间隔 ───────────────────────────────────────
  const yesterdayGaps = extractGaps(yesterdayFeedings)
  for (const { gap, startTime, endTime } of yesterdayGaps) {
    // 基础权重：同时段 2.0，非同时段 0.5
    let weight = isSameTimeSlot(refHour, endTime) ? 2.0 : 0.5
    // 夜间间隔衰减
    if (isNightGap(startTime, endTime)) weight *= 0.5
    weightedGaps.push({ gap, weight })
  }

  // ── 3. 计算加权平均间隔 ────────────────────────────────
  if (weightedGaps.length === 0) return null

  let weightedSum = 0
  let weightTotal = 0
  for (const { gap, weight } of weightedGaps) {
    weightedSum += gap * weight
    weightTotal += weight
  }
  const avgGapMin = weightedSum / weightTotal

  // ── 4. 预计下次时间 ────────────────────────────────────
  return new Date(lastFeedTime.getTime() + avgGapMin * 60_000)
}

/**
 * 创建喂奶提醒源（V2 — 支持跨天数据 + 超时持续提醒）
 * @param getFeedings 获取今日喂奶记录
 * @param getYesterdayFeedings 获取昨日喂奶记录
 */
export function createFeedingSource(
  getFeedings: () => TodayRecord[],
  getYesterdayFeedings: () => TodayRecord[],
): ReminderSource {
  return {
    id: 'feeding',
    label: '喂奶提醒',
    leadTime: 30,        // 提前 30 分钟开始提醒
    repeatInterval: 10,  // 每 10 分钟重复
    overdue: true,       // 超时后持续提醒（不截止）
    getNextTriggerTime: () => calcNextFeedTime(getFeedings(), getYesterdayFeedings()),
  }
}
