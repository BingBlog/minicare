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
  family_name?: string
  family_role?: 'owner' | 'member'
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
  /** 各记录类型的原始详情，具体字段因 type 而异 */
  detail?: Record<string, unknown> | null
}

/**
 * 与 Web RecordItem 对齐的记录列表项类型。
 *
 * 索引签名 `[key: string]: unknown` 是有意保留的：
 * 列表页面（RecordGroup、RecordListItem）需要访问各记录类型的特有字段
 * （如 feed_type、diaper_type、formula_ml 等）用于展示摘要信息。
 * 如需类型安全访问，请使用各记录类型的专属接口（FeedingRecord、DiaperRecord 等）。
 */
export interface RecordItem {
  id: string
  type?: string
  note?: string | null
  created_at?: string
  start_time?: string
  startTime?: string
  [key: string]: unknown
}
