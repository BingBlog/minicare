/**
 * 将首页「今日时间线」API 模型转为与记录列表一致的扁平 RecordItem，供 RecordListItem / 排序使用。
 */
import type { RecordItem } from '@/api'
import type { TodayRecord } from '@/api/types'

export function todayRecordToRecordItem(rec: TodayRecord): RecordItem {
  const nested = (rec.detail ?? {}) as Record<string, unknown>
  return {
    ...nested,
    id: rec.id,
    type: rec.type,
    note: rec.note ?? undefined,
    time: rec.time,
    record_time: rec.time,
  } as RecordItem
}
