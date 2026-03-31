/**
 * 医疗记录 API
 * 路由：/api/family/:familyId/records/medical
 *
 * 字段说明：
 *   visit_date:     就诊日期，YYYY-MM-DD
 *   visit_type:     就诊类型，'checkup'|'allergy'|'sick'|'vaccine'|'blood'|'other'
 *                   （存储到 medical_record.visit_type VARCHAR(20)，需 Migration 003）
 *   hospital:       医院/机构名称（≤100字）
 *   doctor:         主诊医生姓名（≤50字，需 Migration 003）
 *   diagnosis:      诊断结论（TEXT）
 *   result_summary: 结果摘要（存储到 result_summary TEXT，需 Migration 003）
 *   medications:    用药列表，[{ name, dose? }]（DDL: medications JSON）
 *   follow_up_date: 下次复查日期，YYYY-MM-DD（需 Migration 003）
 *   note:           其他备注
 *
 * 注意：visit_type/doctor/result_summary/follow_up_date 需要 Migration 003 建列后才生效。
 */
import { request } from '../http'
import type { MedicalRecord, CreateMedicalDto, PaginationParams, ListResult } from '../types'

export const medicalApi = {
  /**
   * 获取医疗记录列表（按 visit_date 倒序）
   *
   * @example 响应体
   * [
   *   {
   *     "id": "mr1mr2mr3-...",
   *     "baby_id": "b1b2b3b4-...",
   *     "recorded_by": "u1u2u3u4-...",
   *     "visit_date": "2026-04-01",
   *     "visit_type": "checkup",
   *     "hospital": "北京儿童医院",
   *     "doctor": "李医生",
   *     "diagnosis": "正常，生长发育良好",
   *     "result_summary": "身高70cm，体重8.2kg，头围44cm",
   *     "medications": [],
   *     "follow_up_date": "2026-07-01",
   *     "note": null,
   *     "created_at": "2026-04-01T11:00:05.000Z"
   *   },
   *   {
   *     "id": "mr4mr5mr6-...",
   *     "baby_id": "b1b2b3b4-...",
   *     "recorded_by": "u1u2u3u4-...",
   *     "visit_date": "2026-03-15",
   *     "visit_type": "sick",
   *     "hospital": "社区卫生服务中心",
   *     "doctor": null,
   *     "diagnosis": "急性上呼吸道感染",
   *     "result_summary": null,
   *     "medications": [
   *       { "name": "布洛芬", "dose": "5ml 每次" },
   *       { "name": "小儿感冒颗粒", "dose": "1袋 每次" }
   *     ],
   *     "follow_up_date": null,
   *     "note": "多喝水，注意休息",
   *     "created_at": "2026-03-15T15:00:05.000Z"
   *   }
   * ]
   */
  list: (
    familyId: string,
    babyId: string,
    params: PaginationParams = {},
  ): Promise<ListResult<MedicalRecord>> => {
    const { limit = 20, offset = 0 } = params
    return request<ListResult<MedicalRecord>>(
      `/api/family/${familyId}/records/medical?baby_id=${babyId}&limit=${limit}&offset=${offset}`,
    )
  },

  /**
   * 创建医疗记录
   *
   * @example 请求体（常规体检）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "visit_date": "2026-04-01",
   *   "visit_type": "checkup",
   *   "hospital": "北京儿童医院",
   *   "doctor": "李医生",
   *   "diagnosis": "正常，生长发育良好",
   *   "result_summary": "身高70cm，体重8.2kg，头围44cm",
   *   "follow_up_date": "2026-07-01"
   * }
   *
   * @example 请求体（生病就诊，含用药）
   * {
   *   "baby_id": "b1b2b3b4-...",
   *   "visit_date": "2026-03-15",
   *   "visit_type": "sick",
   *   "hospital": "社区卫生服务中心",
   *   "diagnosis": "急性上呼吸道感染",
   *   "medications": [
   *     { "name": "布洛芬", "dose": "5ml 每次" }
   *   ],
   *   "note": "多喝水，注意休息"
   * }
   *
   * @example 响应体
   * { "id": "mr1mr2mr3-..." }
   */
  create: (familyId: string, data: CreateMedicalDto): Promise<MedicalRecord> =>
    request<MedicalRecord>(`/api/family/${familyId}/records/medical`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 删除医疗记录
   *
   * @example 响应体
   * { "id": "mr1mr2mr3-..." }
   */
  remove: (familyId: string, id: string): Promise<void> =>
    request<void>(`/api/family/${familyId}/records/medical/${id}`, {
      method: 'DELETE',
    }),
}
