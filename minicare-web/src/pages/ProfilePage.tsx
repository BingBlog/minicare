/**
 * 我的页面
 * 参考 ui-draft/profile.html 设计
 */
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/lib/store'
import { removeToken } from '@/lib/api'

const menuGroups = [
  {
    title: '宝宝管理',
    items: [
      { icon: '👶', label: '宝宝档案', desc: '管理宝宝信息' },
      { icon: '👨‍👩‍👧', label: '家庭成员', desc: '邀请家人共同记录' },
    ],
  },
  {
    title: '功能设置',
    items: [
      { icon: '🔔', label: '提醒设置', desc: '哺乳、换尿布提醒' },
      { icon: '📊', label: '数据统计', desc: '查看成长报告' },
      { icon: '💾', label: '数据备份', desc: '导出记录数据' },
    ],
  },
  {
    title: '关于',
    items: [
      { icon: '❓', label: '使用帮助', desc: '' },
      { icon: '⭐', label: '反馈与评分', desc: '' },
      { icon: 'ℹ️', label: '关于敏宝日记', desc: 'v0.1.0' },
    ],
  },
]

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, logout } = useAppStore()

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      removeToken()
      logout()
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="min-h-full bg-bg">
      {/* 顶部用户信息 */}
      <div className="bg-gradient-to-b from-primary to-[#F9A8C0] px-5 pt-12 pb-14 relative overflow-hidden">
        <div className="absolute right-[-30px] top-[-40px] w-32 h-32 rounded-full bg-white/10 pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-16 h-16 rounded-full bg-white/25 border-2 border-white/50 flex items-center justify-center text-3xl flex-shrink-0">
            {user?.nickname?.[0] ?? '👤'}
          </div>
          <div>
            <div className="text-lg font-bold text-white">{user?.nickname ?? '未设置昵称'}</div>
            <div className="text-xs text-white/75 mt-0.5">{user?.phone ?? ''}</div>
          </div>
        </div>
      </div>

      {/* 内容卡片（相对顶部 header 负边距嵌入）*/}
      <div className="-mt-8 px-4 pb-8">

        {/* 统计卡 */}
        <div className="bg-white rounded-2xl shadow-md p-4 mb-4 flex">
          {[
            { val: '0', label: '个宝宝' },
            { val: '0', label: '条记录' },
            { val: '0', label: '天日记' },
          ].map((stat, i) => (
            <div key={i} className={`flex-1 text-center ${i < 2 ? 'border-r border-border' : ''}`}>
              <div className="text-xl font-bold text-primary">{stat.val}</div>
              <div className="text-xs text-subtext mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* 菜单分组 */}
        <div className="space-y-3">
          {menuGroups.map((group) => (
            <div key={group.title}>
              <div className="text-xs text-subtext font-medium px-1 mb-2">{group.title}</div>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {group.items.map((item, i) => (
                  <div
                    key={item.label}
                    className={`flex items-center px-4 py-3.5 gap-3 active:bg-gray-50 cursor-pointer ${i > 0 ? 'border-t border-border' : ''}`}
                  >
                    <span className="text-xl w-7 text-center flex-shrink-0">{item.icon}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-text">{item.label}</div>
                      {item.desc && <div className="text-xs text-subtext mt-0.5">{item.desc}</div>}
                    </div>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-subtext/50 flex-shrink-0">
                      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 退出登录 */}
        <button
          onClick={handleLogout}
          className="w-full h-12 bg-white border border-border text-subtext rounded-xl mt-4 text-sm font-medium active:bg-gray-50"
        >
          退出登录
        </button>
      </div>
    </div>
  )
}
