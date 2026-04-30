export type HomeRecordType =
  | 'feeding'
  | 'sleep'
  | 'diaper'
  | 'activity'
  | 'health'
  | 'symptom'

export interface HomeRecord {
  id: string
  type: HomeRecordType
  time: string
  title: string
  desc: string
  detail?: Record<string, unknown>
}

export interface BabyStat {
  val: string | number
  unit: string
  label: string
}

export type TimelineSortMode = 'type' | 'time'

