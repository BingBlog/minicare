/**
 * Baby 模块 API
 * 路由：/api/family/:familyId/baby/*
 */
import { request } from './http'
import type { Baby, CreateBabyDto, UpdateBabyDto } from './types'

export const babyApi = {
  /** 获取家庭宝宝档案 */
  get: (familyId: string) =>
    request<Baby>(`/api/family/${familyId}/baby`),

  /** 创建宝宝档案 */
  create: (familyId: string, data: CreateBabyDto) =>
    request<Baby>(`/api/family/${familyId}/baby`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 更新宝宝档案（部分字段 PATCH）
   * @param babyId 宝宝 ID
   */
  update: (familyId: string, babyId: string, data: UpdateBabyDto) =>
    request<Baby>(`/api/family/${familyId}/baby/${babyId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
}
