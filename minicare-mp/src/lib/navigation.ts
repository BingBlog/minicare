/**
 * navigation — 统一路由跳转工具
 *
 * 将 Web 路由路径解析为 MP 页面路径并执行跳转。
 * 已迁移页面直接 navigateTo，未迁移页面走分发器兜底。
 */
import Taro from '@tarojs/taro'
import { HOME_RECORD_MP_ROUTES } from '@/lib/constants'

/** PRD-005 D1 分流：医疗「新建」→ 类型选择页；「编辑（带 recordId）」→ 直达表单（跳过选型，防类型被改写） */
const MEDICAL_WEB_ROUTE = '/records/form/medical'
const MEDICAL_FORM_PAGE = '/pages/records/medical/index'
const MEDICAL_TYPE_SELECT_PAGE = '/pages/records/medical/type-select/index'

/**
 * 跳转到记录页面
 * @param target Web 路由路径（如 "/records/feeding?tab=formula"）
 * @param recordId 可选的记录 ID（编辑模式）
 */
export function navigateToRecord(target: string, recordId?: string): void {
  const [path, query] = target.split('?')

  let mpPage = HOME_RECORD_MP_ROUTES[path]
  if (path === MEDICAL_WEB_ROUTE) {
    mpPage = recordId ? MEDICAL_FORM_PAGE : MEDICAL_TYPE_SELECT_PAGE
  }

  if (mpPage) {
    // 已迁移页面：直接跳转
    const parts: string[] = []
    if (query) parts.push(query)
    if (recordId) parts.push(`recordId=${encodeURIComponent(recordId)}`)
    const qs = parts.length ? `?${parts.join('&')}` : ''
    Taro.navigateTo({ url: `${mpPage}${qs}` })
  } else {
    // 未迁移页面：走分发器
    const encoded = encodeURIComponent(target)
    const parts: string[] = [`target=${encoded}`]
    if (recordId) parts.push(`recordId=${encodeURIComponent(recordId)}`)
    Taro.navigateTo({ url: `/pages/records/index?${parts.join('&')}` })
  }
}
