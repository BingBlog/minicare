import type { HomeRecord } from '@/pages/home/types'

export type RecordsSortMode = 'time' | 'type'

/** 与 Web 记录列表保持一致的类型分组顺序。 */
export const RECORD_LIST_TYPE_ORDER: string[] = [
  'feeding',
  'sleep',
  'diaper',
  'activity',
  'health',
  'growth',
  'medical',
  'symptom',
]

export function sortHomeDayItems(items: HomeRecord[], mode: RecordsSortMode): HomeRecord[] {
  const next = [...items]
  if (mode === 'time') {
    next.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    return next
  }

  next.sort((a, b) => {
    const ia = RECORD_LIST_TYPE_ORDER.indexOf(a.type)
    const ib = RECORD_LIST_TYPE_ORDER.indexOf(b.type)
    const oa = ia === -1 ? 999 : ia
    const ob = ib === -1 ? 999 : ib
    if (oa !== ob) return oa - ob
    return new Date(b.time).getTime() - new Date(a.time).getTime()
  })
  return next
}
