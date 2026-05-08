/**
 * 饮食记录 API（Migration 008: 拆分为 4 张独立子表）
 * 路由：/api/family/:familyId/records/feeding
 *
 * 后端根据 feed_type 路由到对应子表：
 *   feeding_breast_record     — breast（母乳哺乳）
 *   feeding_formula_record    — formula（配方奶）
 *   feeding_food_record       — complementary（辅食，无 supplement_items）
 *   feeding_supplement_record — complementary（营养素，有 supplement_items）
 *
 * 字段说明：
 *   feed_type:          喂养类型（'breast' | 'formula' | 'complementary'）
 *   record_time:        ISO 8601 时间戳
 *   breast_side:        母乳哺乳侧（VARCHAR: 'left' | 'right' | 'both'），feed_type='breast' 时使用
 *   duration_min:       母乳哺乳时长（分钟，范围 0~120）
 *   formula_ml:         奶粉喂养量（毫升，范围 0~500）
 *   milk_types:         奶粉类型列表，如 ["aa", "eh_no_lactose"]
 *   milk_scoops:        各类奶粉勺数映射，如 { "aa": 3, "eh_no_lactose": 0.33 }
 *   complementary_food: 辅食名称（多项逗号/顿号分隔，辅食时使用）
 *   amount_g:           辅食克数（范围 0~500）
 *   supplement_items:   营养素明细列表，如 [{ key, label, dose, unit }]
 *   note:               附加备注（可选）
 */
import { request } from '../http'
import type { FeedingRecord, CreateFeedingDto, UpdateFeedingDto } from '../types'

export interface FeedingListParams {
  before_date?: string
}

export interface FeedingListResponse {
  items: FeedingRecord[]
  nextBeforeDate: string | null
}

function buildListQuery(babyId: string, params?: FeedingListParams): string {
  const q: string[] = [`baby_id=${babyId}`]
  if (params?.before_date) q.push(`before_date=${encodeURIComponent(params.before_date)}`)
  return q.join('&')
}

export const feedingApi = {
  list: (familyId: string, babyId: string, params?: FeedingListParams): Promise<FeedingListResponse> => {
    return request<FeedingListResponse>(`/api/family/${familyId}/records/feeding?${buildListQuery(babyId, params)}`)
      .then((res) => ({
        items: res.items.map((r) => ({ ...r, type: 'feeding' })),
        nextBeforeDate: res.nextBeforeDate,
      }))
  },

  /**
   * 创建饮食记录
   *
   * @example 请求体（奶粉喂养，使用结构化字段）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "feed_type": "formula",
   *   "record_time": "2026-04-01T08:00:00.000Z",
   *   "formula_ml": 120,
   *   "milk_types": ["aa", "eh_no_lactose"],
   *   "milk_scoops": { "aa": 3, "eh_no_lactose": 0.33 }
   * }
   *
   * @example 请求体（母乳喂养）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "feed_type": "breast",
   *   "record_time": "2026-04-01T06:00:00.000Z",
   *   "breast_side": "left",
   *   "duration_min": 15
   * }
   *
   * @example 请求体（营养素，结构化字段）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "feed_type": "complementary",
   *   "record_time": "2026-04-01T09:00:00.000Z",
   *   "complementary_food": "营养素",
   *   "supplement_items": [{ "key": "vitD", "label": "维D", "dose": "400", "unit": "IU" }]
   * }
   *
   * @example 响应体
   * { "id": "fr1fr2fr3-..." }
   */
  create: (familyId: string, data: CreateFeedingDto): Promise<{ id: string }> =>
    request<{ id: string }>(`/api/family/${familyId}/records/feeding`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 获取单条饮食记录（编辑前重新查询，确保数据最新）
   */
  getOne: (familyId: string, id: string): Promise<FeedingRecord> =>
    request<FeedingRecord>(`/api/family/${familyId}/records/feeding/${id}`),

  /**
   * 更新饮食记录（PATCH 局部更新）
   */
  update: (familyId: string, id: string, data: UpdateFeedingDto): Promise<FeedingRecord> =>
    request<FeedingRecord>(`/api/family/${familyId}/records/feeding/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * 删除饮食记录
   */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/feeding/${id}`, {
      method: 'DELETE',
    }),
}