/**
 * 记录列表「同一日内」排序：与记录页、首页今日时间线共用。
 */
import type { RecordItem } from '@/api'
import { getRecordTime, getRecordType } from '@/lib/utils'
import dayjs from 'dayjs'

export type RecordTypeKey =
  | 'feeding'
  | 'sleep'
  | 'diaper'
  | 'activity'
  | 'health'
  | 'growth'
  | 'medical'
  | 'symptom'

/** 所有支持的记录类型 key */
export const ALL_TYPE_KEYS: RecordTypeKey[] = [
  'feeding',
  'sleep',
  'diaper',
  'activity',
  'health',
  'growth',
  'medical',
  'symptom',
]

/** 日内「按类型」排序时的类型顺序 */
export const RECORD_LIST_TYPE_ORDER: RecordTypeKey[] = [...ALL_TYPE_KEYS]

export type RecordsSortMode = 'time' | 'type'

/** 同一日内的记录排序：默认按类型聚类后组内时间降序；可选严格按时间降序 */
export function sortDayItems(items: RecordItem[], mode: RecordsSortMode): RecordItem[] {
  const copy = [...items]
  if (mode === 'time') {
    copy.sort(
      (a, b) => dayjs(getRecordTime(b)).diff(dayjs(getRecordTime(a)))
    )
    return copy
  }
  const orderIdx = (t: string) => {
    const i = RECORD_LIST_TYPE_ORDER.indexOf(t as RecordTypeKey)
    return i === -1 ? 999 : i
  }
  copy.sort((a, b) => {
    const oa = orderIdx(getRecordType(a))
    const ob = orderIdx(getRecordType(b))
    if (oa !== ob) return oa - ob
    return dayjs(getRecordTime(b)).diff(dayjs(getRecordTime(a)))
  })
  return copy
}
