/**
 * 睡眠记录 API
 * 路由：/api/family/:familyId/records/sleep
 *
 * 睡眠记录采用两步流程：
 *   1. startSleep：开始计时，创建 status=ongoing 记录
 *   2. endSleep：结束计时，更新 status=ended 并计算 duration_min
 *
 * 字段说明：
 *   start_time:   入睡时间（ISO 8601）
 *   end_time:     醒来时间（ISO 8601），结束后非 null
 *   status:       'ongoing'=进行中  'ended'=已结束
 *   duration_min: 睡眠时长（分钟），由后端计算
 *   quality:      睡眠质量（good/normal/poor）
 *   sleep_period: 睡眠时段（night/morning_nap/afternoon_nap/other）
 *   note:         附加备注（可选）
 */
import { request } from '../http'
import type {
  SleepRecord,
  StartSleepDto,
  EndSleepDto,
  UpdateSleepDto,
  PaginationParams,
  ListResult,
} from '../types'

export const sleepApi = {
  /**
   * 开始睡眠计时（创建 status=ongoing 记录）
   * 一个宝宝同时只能有一条 ongoing 记录，若已有则后端返回 409
   *
   * @example 请求体
   * {
   *   "baby_id": "a1b2c3d4-...",
   *   "start_time": "2026-04-01T21:30:00.000Z",
   *   "quality": "good",
   *   "sleep_period": "night"
   * }
   *
   * @example 响应体
   * {
   *   "id": "e5f6g7h8-...",
   *   "status": "ongoing"
   * }
   */
  startSleep: (familyId: string, data: StartSleepDto): Promise<{ id: string; status: 'ongoing' }> =>
    request<{ id: string; status: 'ongoing' }>(`/api/family/${familyId}/records/sleep/start`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 结束睡眠计时（更新 status=ended，后端计算 duration_min）
   *
   * @param sleepId 进行中的睡眠记录 ID（由 startSleep 返回）
   *
   * @example 请求体
   * {
   *   "end_time": "2026-04-02T06:15:00.000Z",
   *   "quality": "good",
   *   "sleep_period": "night"
   * }
   *
   * @example 响应体
   * {
   *   "id": "e5f6g7h8-...",
   *   "duration_min": 525,
   *   "status": "ended"
   * }
   */
  endSleep: (
    familyId: string,
    sleepId: string,
    data: EndSleepDto,
  ): Promise<{ id: string; duration_min: number; status: 'ended' }> =>
    request<{ id: string; duration_min: number; status: 'ended' }>(
      `/api/family/${familyId}/records/sleep/${sleepId}/end`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    ),

  /**
   * 获取当前宝宝进行中的睡眠记录（用于首页计时横幅）
   * 若没有进行中的记录，返回 null
   */
  getOngoing: (familyId: string, babyId: string): Promise<SleepRecord | null> =>
    request<SleepRecord | null>(
      `/api/family/${familyId}/records/sleep/ongoing?baby_id=${babyId}`,
    ),

  /**
   * 获取睡眠记录列表（按 start_time 倒序）
   */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {},
  ): Promise<ListResult<SleepRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<SleepRecord>>(
      `/api/family/${familyId}/records/sleep?baby_id=${babyId}&limit=${limit}&offset=${offset}`,
    ).then((items) => items.map((r) => ({ ...r, type: 'sleep' })))
  },

  /**
   * 获取单条睡眠记录（编辑前重新查询，确保数据最新）
   */
  getOne: (familyId: string, id: string): Promise<SleepRecord> =>
    request<SleepRecord>(`/api/family/${familyId}/records/sleep/${id}`),

  /**
   * 更新睡眠记录（PATCH 局部更新）
   */
  update: (familyId: string, id: string, data: UpdateSleepDto): Promise<SleepRecord> =>
    request<SleepRecord>(`/api/family/${familyId}/records/sleep/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * 删除睡眠记录
   */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/sleep/${id}`, {
      method: 'DELETE',
    }),
}