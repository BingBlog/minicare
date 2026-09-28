import { request } from './http'

export type ObservationStatus = 'observing' | 'paused' | 'safe' | 'suspected' | 'allergic'
export type ReactionLevel = 'none' | 'mild' | 'moderate' | 'severe'
export type ObservationLogAction = 'continue' | 'pause' | 'mark_suspected' | 'mark_allergic'

export interface FoodObservation {
  id: string
  baby_id: string
  food_name: string
  first_intro_at: string
  last_intro_at: string | null
  intro_count: number
  observation_days: number
  status: ObservationStatus
  reaction_note: string | null
  current_day: number | null
  retry_after_date: string | null
  severity: ReactionLevel | null
  created_at: string
  updated_at: string
}

export interface FoodObservationLog {
  id: string
  observation_id: string
  baby_id: string
  day_index: number
  record_date: string
  intake_amount_g: number | null
  reaction_flags: string[]
  reaction_level: ReactionLevel | null
  note: string | null
  action: ObservationLogAction
  health_record_id: string | null
  recorded_by: string
  created_at: string
  updated_at: string
}

export interface FoodObservationDetail extends FoodObservation {
  logs: FoodObservationLog[]
}

export interface CreateFoodObservationDto {
  baby_id: string
  food_name: string
  observation_days?: number
  first_intro_at?: string
}

export interface CreateOrReuseResult {
  id: string
  status: ObservationStatus
  current_day: number
  observation_days: number
  reused: boolean
  action: string
}

export interface UpdateObservationStatusDto {
  status: ObservationStatus
  reaction_note?: string
  severity?: ReactionLevel
  retry_after_date?: string
}

export interface UpsertObservationLogDto {
  record_date?: string
  intake_amount_g?: number
  reaction_flags?: string[]
  reaction_level?: ReactionLevel
  note?: string
  action?: ObservationLogAction
  health_record_id?: string
}

export interface UpsertLogResult {
  observation_id: string
  day_index: number
  next_day: number
  status: ObservationStatus
}

export interface RemoveLogResult {
  observation_id: string
  day_index: number
  current_day: number
}

export interface UnlinkHealthResult {
  observation_id: string
  day_index: number
  target_status: ObservationStatus
}

export interface RemoveObservationResult {
  id: string
}

export interface CreateReactionDto {
  day_index: number
  record_time: string
  allergy_symptoms?: string[]
  allergy_severity?: ReactionLevel
  note?: string
  target_status: ObservationStatus
}

export interface CreateReactionResult {
  observation_id: string
  health_record_id: string
  status: ObservationStatus
}

export interface ObservationLinkage {
  food_name: string
  action: string
  observation_id: string
  status: ObservationStatus
  current_day: number
  observation_days: number
}

export const foodObservationApi = {
  createOrReuse: (familyId: string, data: CreateFoodObservationDto) =>
    request<CreateOrReuseResult>(`/api/family/${familyId}/records/food-observations`, {
      method: 'POST',
      data,
    }),

  list: (familyId: string, babyId: string, status?: ObservationStatus) => {
    const query = [`baby_id=${babyId}`]
    if (status) query.push(`status=${status}`)
    return request<FoodObservation[]>(`/api/family/${familyId}/records/food-observations?${query.join('&')}`)
  },

  getOne: (familyId: string, id: string) =>
    request<FoodObservationDetail>(`/api/family/${familyId}/records/food-observations/${id}`),

  updateStatus: (familyId: string, id: string, data: UpdateObservationStatusDto) =>
    request<{ id: string; status: ObservationStatus }>(`/api/family/${familyId}/records/food-observations/${id}/status`, {
      method: 'PATCH',
      data,
    }),

  upsertLog: (familyId: string, id: string, dayIndex: number, data: UpsertObservationLogDto) =>
    request<UpsertLogResult>(`/api/family/${familyId}/records/food-observations/${id}/logs/${dayIndex}`, {
      method: 'PUT',
      data,
    }),

  continueToday: (familyId: string, id: string) =>
    request<UpsertLogResult>(`/api/family/${familyId}/records/food-observations/${id}/continue`, {
      method: 'POST',
    }),

  createReaction: (familyId: string, id: string, data: CreateReactionDto) =>
    request<CreateReactionResult>(`/api/family/${familyId}/records/food-observations/${id}/reactions`, {
      method: 'POST',
      data,
    }),

  getLinkedHealthRecords: (familyId: string, id: string) =>
    request<any[]>(`/api/family/${familyId}/records/food-observations/${id}/health-records`),

  removeLog: (familyId: string, id: string, dayIndex: number) =>
    request<RemoveLogResult>(`/api/family/${familyId}/records/food-observations/${id}/logs/${dayIndex}`, {
      method: 'DELETE',
    }),

  unlinkLogHealth: (
    familyId: string,
    id: string,
    dayIndex: number,
    data: { target_status: 'observing' | 'paused' | 'suspected'; reaction_note?: string },
  ) =>
    request<UnlinkHealthResult>(`/api/family/${familyId}/records/food-observations/${id}/logs/${dayIndex}/unlink-health`, {
      method: 'POST',
      data,
    }),

  removeObservation: (familyId: string, id: string) =>
    request<RemoveObservationResult>(`/api/family/${familyId}/records/food-observations/${id}`, {
      method: 'DELETE',
    }),
}
