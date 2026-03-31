/**
 * 医疗记录 API
 * 路由：/api/family/:familyId/records/medical
 *
 * 字段说明：
 *   visit_date:     就诊日期，YYYY-MM-DD
 *   visit_type:     就诊类型，'checkup' | 'allergy' | 'sick' | 'vaccine' | 'blood' | 'other'
 *   hospital:       医院/机构名称
 *   doctor:         主诊医生
 *   diagnosis:      诊断结论
 *   result_summary: 结果摘要
 *   medications:    用药列表，[{ name, dose? }]
 *   follow_up_date: 复查日期，YYYY-MM-DD
 *   note:           其他备注
 */
import { request } from '../http'
import type { MedicalRecord, CreateMedicalDto, PaginationParams, ListResult } from '../types'

export const medicalApi = {
  /** 获取医疗记录列表 */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {}
  ): Promise<ListResult<MedicalRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<MedicalRecord>>(
      `/api/family/${familyId}/records/medical?baby_id=${babyId}&limit=${limit}&offset=${offset}`
    )
  },

  /** 创建医疗记录 */
  create: (familyId: string, data: CreateMedicalDto): Promise<MedicalRecord> =>
    request<MedicalRecord>(`/api/family/${familyId}/records/medical`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** 删除医疗记录 */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/medical/${id}`, {
      method: 'DELETE',
    }),
}
