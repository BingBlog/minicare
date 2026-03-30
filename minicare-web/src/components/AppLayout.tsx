/**
 * App 主布局
 * - 顶部状态栏（模拟移动端）
 * - 页面内容区（带 padding-bottom 留给底部 Tab）
 * - 底部 Tab 导航栏
 */
import { Outlet, NavLink, useLocation } from 'react-router-dom'

const tabs = [
  {
    to: '/',
    label: '首页',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" className={`w-5 h-5 ${active ? 'fill-primary' : 'fill-subtext'}`}>
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
      </svg>
    ),
  },
  {
    to: '/records',
    label: '记录',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" className={`w-5 h-5 ${active ? 'fill-primary' : 'fill-subtext'}`}>
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: '我的',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" className={`w-5 h-5 ${active ? 'fill-primary' : 'fill-subtext'}`}>
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    ),
  },
]

export default function AppLayout() {
  const location = useLocation()

  return (
    <div className="flex flex-col h-screen max-w-[430px] mx-auto bg-bg overflow-hidden">
      {/* 页面内容 */}
      <div className="flex-1 overflow-y-auto pb-[56px]">
        <Outlet />
      </div>

      {/* 底部 Tab 栏 */}
      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-14 bg-white border-t border-border flex items-center z-50"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {tabs.map(({ to, label, icon }) => {
          const isActive = to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(to)

          return (
            <NavLink
              key={to}
              to={to}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1"
            >
              {icon(isActive)}
              <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : 'text-subtext'}`}>
                {label}
              </span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
