export interface Family {
  id: string
  name: string
  createdAt?: string
}

export type AllergyType =
  | 'milk'
  | 'egg'
  | 'wheat'
  | 'peanut'
  | 'tree_nut'
  | 'soy'
  | 'fish'
  | 'shellfish'
  | 'other'

export type AllergyLevel = 'mild' | 'moderate' | 'severe' | 'unknown'

export interface Baby {
  id: string
  family_id: string
  name: string
  gender: 'male' | 'female' | 'unknown'
  birth_date: string
  allergy_types?: AllergyType[]
  allergy_level?: AllergyLevel | null
  birth_weight_g?: number | null
  birth_height_cm?: number | null
  avatar_url?: string | null
}

export interface User {
  id: string
  phone: string
  nickname: string
  avatar_url?: string | null
}

export interface FamilyMember {
  id: string
  user_id: string | null
  role: 'owner' | 'member'
  status?: 'pending' | 'active' | 'left'
  name: string | null
  phone?: string | null
  invite_phone?: string | null
  joined_at?: string | null
  is_self?: boolean
  avatar_url?: string | null
}

export interface TodayRecord {
  type: string
  id: string
  time: string
  note?: string | null
  detail?: Record<string, unknown> | null
}

/** 与 Web RecordItem 对齐的宽松记录类型 */
export interface RecordItem {
  id: string
  type?: string
  note?: string | null
  created_at?: string
  start_time?: string
  startTime?: string
  [key: string]: unknown
}
