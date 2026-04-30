export interface Family {
  id: string
  name: string
  createdAt?: string
}

export interface Baby {
  id: string
  family_id: string
  name: string
  gender: 'male' | 'female' | 'unknown'
  birth_date: string
}

export interface TodayRecord {
  type: string
  id: string
  time: string
  note?: string | null
  detail?: Record<string, unknown> | null
}
