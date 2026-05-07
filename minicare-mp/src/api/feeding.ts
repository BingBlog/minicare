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

/** 日期分页响应 */
export interface FeedingListResponse {
  items: FeedingRecord[]
  nextBeforeDate: string | null
}

/** 日期分页参数 */
export interface FeedingListParams {
  before_date?: string
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

function buildListQuery(babyId: string, params?: FeedingListParams): string {
  const query: string[] = [`baby_id=${babyId}`]
  if (params?.before_date) query.push(`before_date=${encodeURIComponent(params.before_date)}`)
  return query.join('&')
}

export const feedingApi = {
  list: async (familyId: string, babyId: string, params?: FeedingListParams): Promise<FeedingListResponse> => {
    const raw = await request<FeedingListResponse | FeedingRecord[]>(
      `/api/family/${familyId}/records/feeding?${buildListQuery(babyId, params)}`,
    )
    // 兼容后端旧版本（返回数组）
    if (Array.isArray(raw)) {
      return { items: raw, nextBeforeDate: null }
    }
    return raw as FeedingListResponse
  },

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
