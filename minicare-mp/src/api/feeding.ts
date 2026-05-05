import { request } from './http'

export type FeedType = 'formula' | 'breast' | 'complementary'
export type MilkType = 'aa' | 'eh_lactose' | 'eh_no_lactose' | 'ph' | 'std'
export type BreastSide = 'left' | 'right' | 'both'

export interface SupplementItem {
  key: string
  label: string
  dose: string
  unit: string
}

export interface FeedingRecord {
  id: string
  baby_id: string
  feed_type: FeedType
  record_time: string
  formula_ml?: number | null
  duration_min?: number | null
  milk_types?: MilkType[] | null
  milk_scoops?: Record<MilkType, number> | null
  breast_side?: BreastSide | null
  complementary_food?: string | null
  supplement_items?: SupplementItem[] | null
  note?: string | null
}

export interface CreateFeedingDto {
  baby_id: string
  feed_type: FeedType
  record_time: string
  formula_ml?: number
  duration_min?: number
  milk_types?: MilkType[]
  milk_scoops?: Record<string, number>
  breast_side?: BreastSide
  complementary_food?: string
  supplement_items?: SupplementItem[]
  note?: string
}

export type UpdateFeedingDto = Partial<Omit<CreateFeedingDto, 'baby_id'>>

function buildListQuery(babyId: string, limit?: number, offset?: number): string {
  const params: string[] = [`baby_id=${babyId}`]
  if (limit != null) params.push(`limit=${limit}`)
  if (offset != null) params.push(`offset=${offset}`)
  return params.join('&')
}

export const feedingApi = {
  list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) =>
    request<FeedingRecord[]>(`/api/family/${familyId}/records/feeding?${buildListQuery(babyId, params?.limit, params?.offset)}`),

  create: (familyId: string, data: CreateFeedingDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/feeding`, {
      method: 'POST',
      data,
    }),

  update: (familyId: string, id: string, data: UpdateFeedingDto) =>
    request<{ id: string }>(`/api/family/${familyId}/records/feeding/${id}`, {
      method: 'PATCH',
      data,
    }),

  remove: (familyId: string, id: string) =>
    request<void>(`/api/family/${familyId}/records/feeding/${id}`, { method: 'DELETE' }),

  getOne: (familyId: string, id: string) =>
    request<FeedingRecord>(`/api/family/${familyId}/records/feeding/${id}`),
}
