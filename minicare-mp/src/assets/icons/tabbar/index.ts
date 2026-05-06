/**
 * TabBar 图标资源（对齐 minicare-web AppLayout 的 Lucide 风格图标）。
 * 小程序端通过 Image 的 src 引用，每个 tab 有 active/inactive 两种状态。
 */
import home from './home.svg'
import homeActive from './home-active.svg'
import records from './records.svg'
import recordsActive from './records-active.svg'
import report from './report.svg'
import reportActive from './report-active.svg'
import profile from './profile.svg'
import profileActive from './profile-active.svg'

export const TABBAR_ICONS = {
  home: { normal: home, active: homeActive },
  records: { normal: records, active: recordsActive },
  report: { normal: report, active: reportActive },
  profile: { normal: profile, active: profileActive },
} as const
