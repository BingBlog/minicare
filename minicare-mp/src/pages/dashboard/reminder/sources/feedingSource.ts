/**
 * 喂奶提醒源（L1 完全复用 — 与 Web 端逻辑完全一致）
 *
 * 基于最近喂奶记录计算下次预计喂奶时间，
 * 提前 30 分钟开始提醒，每 10 分钟重复一次。
 *
 * 算法：
 * - 取最近 3 次喂奶记录
 * - 计算相邻记录间隔平均值（排除 >6h 异常）
 * - 下次喂奶时间 = 最后一次喂奶时间 + 平均间隔
 */
import type { ReminderSource } from '../useReminder'
import type { TodayRecord } from '@/api'

/**
 * 根据喂奶记录计算下次预计喂奶时间
 * 返回 null 表示无法计算（记录不足）
 */
export function calcNextFeedTime(feedings: TodayRecord[]): Date | null {
  if (feedings.length < 2) return null

  const recent = feedings.slice(-3)
  let totalGap = 0
  let gapCount = 0

  for (let i = 1; i < recent.length; i++) {
    const gap = (new Date(recent[i].time).getTime() - new Date(recent[i - 1].time).getTime()) / 60_000
    if (gap > 0 && gap < 360) {
      totalGap += gap
      gapCount++
    }
  }

  if (gapCount === 0) return null

  const avgGapMs = (totalGap / gapCount) * 60_000
  const lastFeedTime = new Date(feedings[feedings.length - 1].time)
  return new Date(lastFeedTime.getTime() + avgGapMs)
}

/**
 * 创建喂奶提醒源
 * @param getFeedings 获取当前喂奶记录的函数（从 DashboardData 中取）
 */
export function createFeedingSource(getFeedings: () => TodayRecord[]): ReminderSource {
  return {
    id: 'feeding',
    label: '喂奶提醒',
    leadTime: 30,        // 提前 30 分钟开始提醒
    repeatInterval: 10,  // 每 10 分钟重复
    getNextTriggerTime: () => calcNextFeedTime(getFeedings()),
  }
}
