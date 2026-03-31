/**
 * Baby 模块 API
 * 路由：/api/family/:familyId/baby/*
 *
 * MVP 阶段：每个家庭限 1 个宝宝
 */
import { request } from './http'
import type { Baby, CreateBabyDto, UpdateBabyDto } from './types'

export const babyApi = {
  /**
   * 获取家庭宝宝档案（MVP 每家庭唯一）
   * 若未创建宝宝档案，后端返回 404
   *
   * @example 响应体
   * {
   *   "id": "b1b2b3b4-1234-5678-abcd-ef0123456789",
   *   "family_id": "f1f2f3f4-1234-5678-abcd-ef0123456789",
   *   "name": "小宝",
   *   "gender": "female",
   *   "birth_date": "2024-06-15",
   *   "avatar_url": null,
   *   "allergy_types": ["milk", "egg"],
   *   "allergy_level": "mild",
   *   "birth_weight_g": 3200,
   *   "birth_height_cm": 50,
   *   "created_at": "2026-03-01T08:00:00.000Z"
   * }
   */
  get: (familyId: string) =>
    request<Baby>(`/api/family/${familyId}/baby`),

  /**
   * 创建宝宝档案（MVP 每家庭限 1 个，重复创建返回 409）
   *
   * @example 请求体
   * {
   *   "name": "小宝",
   *   "gender": "female",
   *   "birth_date": "2024-06-15",
   *   "allergy_types": ["milk"],
   *   "allergy_level": "mild",
   *   "birth_weight_g": 3200,
   *   "birth_height_cm": 50
   * }
   *
   * @example 响应体（同 get 接口返回结构）
   * {
   *   "id": "b1b2b3b4-1234-5678-abcd-ef0123456789",
   *   "family_id": "f1f2f3f4-1234-5678-abcd-ef0123456789",
   *   "name": "小宝",
   *   "gender": "female",
   *   "birth_date": "2024-06-15",
   *   "allergy_types": ["milk"],
   *   "allergy_level": "mild",
   *   "birth_weight_g": 3200,
   *   "birth_height_cm": 50,
   *   "avatar_url": null,
   *   "created_at": "2026-03-01T08:00:00.000Z"
   * }
   */
  create: (familyId: string, data: CreateBabyDto) =>
    request<Baby>(`/api/family/${familyId}/baby`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 更新宝宝档案（部分字段 PATCH，仅传需要修改的字段）
   *
   * @param babyId 宝宝 ID
   *
   * @example 请求体（只修改名字和过敏信息）
   * {
   *   "name": "小宝贝",
   *   "allergy_types": ["milk", "egg"],
   *   "allergy_level": "moderate"
   * }
   *
   * @example 响应体（同 get 接口返回结构，包含更新后完整数据）
   * {
   *   "id": "b1b2b3b4-1234-5678-abcd-ef0123456789",
   *   "family_id": "f1f2f3f4-1234-5678-abcd-ef0123456789",
   *   "name": "小宝贝",
   *   "gender": "female",
   *   "birth_date": "2024-06-15",
   *   "allergy_types": ["milk", "egg"],
   *   "allergy_level": "moderate",
   *   "birth_weight_g": 3200,
   *   "birth_height_cm": 50,
   *   "avatar_url": null,
   *   "created_at": "2026-03-01T08:00:00.000Z"
   * }
   */
  update: (familyId: string, babyId: string, data: UpdateBabyDto) =>
    request<Baby>(`/api/family/${familyId}/baby/${babyId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
}
