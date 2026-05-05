/**
 * LoginGuide 登录引导组件
 *
 * 游客模式下各页面底部/居中展示的登录引导区
 * 与小程序版 LoginGuide 保持一致的设计语言
 */
import { useNavigate } from 'react-router-dom'

interface LoginGuideProps {
  /** 标题文字 */
  title?: string
  /** 描述文字 */
  desc?: string
  /** 是否居中展示（用于全屏空态） */
  centered?: boolean
}

export default function LoginGuide({
  title = '登录后查看',
  desc = '登录后即可使用完整功能',
  centered = false,
}: LoginGuideProps) {
  const navigate = useNavigate()

  const content = (
    <div className="flex flex-col items-center py-8 px-6">
      {/* 人物图标 */}
      <div
        className="flex items-center justify-center mb-4"
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #FFF0F4, #FFE4EC)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#F87098"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 32, height: 32 }}
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M20 21a8 8 0 1 0-16 0" />
        </svg>
      </div>

      {/* 标题 */}
      <div className="text-[16px] font-bold text-[#4A3035] mb-1.5">
        {title}
      </div>

      {/* 描述 */}
      <div className="text-[13px] text-[#9A8090] text-center mb-5 leading-relaxed">
        {desc}
      </div>

      {/* 登录按钮 */}
      <button
        type="button"
        onClick={() => navigate('/login')}
        className="px-8 py-3 rounded-full text-white text-[15px] font-semibold border-none cursor-pointer transition-all active:scale-[0.96]"
        style={{
          background: 'linear-gradient(135deg, #F87098, #F9A8C0)',
          boxShadow: '0 4px 14px rgba(248,112,152,0.35)',
        }}
      >
        去登录
      </button>
    </div>
  )

  if (centered) {
    return (
      <div className="flex-1 flex items-center justify-center">
        {content}
      </div>
    )
  }

  return content
}
