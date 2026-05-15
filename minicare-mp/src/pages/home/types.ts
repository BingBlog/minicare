export type HomeRecordType =
  | 'formula'
  | 'breast'
  | 'food'
  | 'feeding'
  | 'sleep'
  | 'diaper'
  | 'activity'
  | 'health'
  | 'temperature'
  | 'growth'
  | 'medical'
  | 'supplement'
  | 'symptom'

export interface HomeRecord {
  id: string
  type: HomeRecordType
  time: string
  title: string
  desc: string
  detail?: Record<string, unknown>
}

export interface BabyStatPart {
  text: string
  small?: boolean
}

export interface BabyStat {
  val: string | number
  unit: string
  label: string
  parts?: BabyStatPart[]
}

export type TimelineSortMode = 'type' | 'time'

