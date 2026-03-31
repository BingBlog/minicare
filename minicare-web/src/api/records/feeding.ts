/**
 * 饮食记录 API
 * 路由：/api/family/:familyId/records/feeding
 *
 * 字段说明：
 *   feed_type:          喂养类型（DDL: 1=breast 2=formula 3=complementary）
 *   record_time:        ISO 8601 时间戳
 *   breast_side:        母乳哺乳侧（DDL: 1=left 2=right 3=both），feed_type='breast' 时使用
 *   duration_min:       母乳哺乳时长（分钟，范围 0~120）
 *   formula_ml:         奶粉喂养量（毫升，范围 0~500）
 *   complementary_food: 辅食或营养素名称（多项逗号/顿号分隔）
 *   amount_g:           辅食克数（范围 0~500）
 *   note:               奶粉勺数等附加信息（前端拼接后传入）
 *
 * 注意：前端"营养素"Tab 使用 feed_type='complementary'，
 *       complementary_food='营养素'，勺数等信息拼入 note。
 */
import { request } from '../http'
import type { FeedingRecord, CreateFeedingDto, PaginationParams, ListResult } from '../types'

export const feedingApi = {
  /**
   * 获取饮食记录列表（按 record_time 倒序）
   *
   * @example 响应体
   * [
   *   {
   *     "id": "fr1fr2fr3-...",
   *     "baby_id": "b1b2b3b4-...",
   *     "recorded_by": "u1u2u3u4-...",
   *     "feed_type": "formula",
   *     "record_time": "2026-04-01T08:00:00.000Z",
   *     "breast_side": null,
   *     "duration_min": null,
   *     "formula_ml": 120,
   *     "complementary_food": null,
   *     "amount_g": null,
   *     "note": "AA3勺 / 混合喂养",
   *     "created_at": "2026-04-01T08:00:05.000Z"
   *   },
   *   {
   *     "id": "fr4fr5fr6-...",
   *     "baby_id": "b1b2b3b4-...",
   *     "recorded_by": "u1u2u3u4-...",
   *     "feed_type": "breast",
   *     "record_time": "2026-04-01T06:00:00.000Z",
   *     "breast_side": "left",
   *     "duration_min": 15,
   *     "formula_ml": null,
   *     "complementary_food": null,
   *     "amount_g": null,
   *     "note": null,
   *     "created_at": "2026-04-01T06:00:05.000Z"
   *   }
   * ]
   */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {},
  ): Promise<ListResult<FeedingRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<FeedingRecord>>(
      `/api/family/${familyId}/records/feeding?baby_id=${babyId}&limit=${limit}&offset=${offset}`,
    )
  },

  /**
   * 创建饮食记录
   *
   * @example 请求体（奶粉喂养）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "feed_type": "formula",
   *   "record_time": "2026-04-01T08:00:00.000Z",
   *   "formula_ml": 120,
   *   "note": "AA3勺"
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
   * @example 请求体（辅食）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "feed_type": "complementary",
   *   "record_time": "2026-04-01T12:00:00.000Z",
   *   "complementary_food": "米糊、南瓜泥",
   *   "amount_g": 30
   * }
   *
   * @example 请求体（营养素，使用 complementary 类型）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "feed_type": "complementary",
   *   "record_time": "2026-04-01T09:00:00.000Z",
   *   "complementary_food": "营养素",
   *   "note": "维生素D400IU、DHA100mg"
   * }
   *
   * @example 响应体
   * { "id": "fr1fr2fr3-..." }
   */
  create: (familyId: string, data: CreateFeedingDto): Promise<FeedingRecord> =>
    request<FeedingRecord>(`/api/family/${familyId}/records/feeding`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 删除饮食记录
   *
   * @example 响应体
   * { "id": "fr1fr2fr3-..." }
   */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/feeding/${id}`, {
      method: 'DELETE',
    }),
}
