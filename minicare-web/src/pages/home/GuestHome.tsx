/**
 * GuestHome 游客首页
 *
 * 未登录状态下的首页展示，与小程序版本保持一致：
 * - Hero 区：品牌名 + 副标题
 * - 快捷记录网格（点击跳转登录）
 * - 底部登录引导区
 */
import { useNavigate } from 'react-router-dom'
import { getTodayDateStr, getGreeting } from '@/lib/utils'
import RecordTypeIcon from '@/components/record/RecordTypeIcon'
import { RECORD_TYPE_CFG } from '@/lib/constants'
import LoginGuide from '@/components/LoginGuide'

// 游客默认展示的快捷按键（6-11月龄常用场景）
const GUEST_QUICK_KEYS = ['formula', 'breast', 'diaper', 'sleep', 'health', 'growth', 'symptom', 'medical']

export default function GuestHome() {
  const navigate = useNavigate()
  const dateStr = getTodayDateStr()

  const handleQuickAction = () => {
    navigate('/login')
  }

  return (
    <div className="min-h-full bg-bg">
      {/* ── 英雄区（渐变背景） ── */}
      <div
        className="relative pb-7"
        style={{ background: 'linear-gradient(180deg, #f87098 0%, #f9a8c0 100%)' }}
      >
        {/* 装饰圆 */}
        <div
          className="absolute pointer-events-none"
          style={{ right: -40, top: -50, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }}
        />
        <div
          className="absolute pointer-events-none"
          style={{ right: 80, top: 30, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }}
        />

        {/* Header Row */}
        <div className="flex items-center justify-between px-5 pt-12 pb-4 relative z-10">
          <div>
            <div className="text-xs text-white/78 tracking-[0.2px]">{dateStr}</div>
            <div
              className="text-2xl font-bold text-white mt-1 tracking-tight"
              style={{ textShadow: '0 1px 4px rgba(248,80,100,0.25)' }}
            >
              {getGreeting()}
            </div>
          </div>
        </div>

        {/* 品牌卡片 */}
        <div className="mx-4 relative z-10">
          <div
            className="relative overflow-hidden"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 100%)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 18,
              padding: '20px 18px',
              backdropFilter: 'blur(2px)',
            }}
          >
            <div className="flex items-center gap-3 relative z-10">
              {/* Logo 图标 */}
              <div
                style={{
                  width: 46, height: 46, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.25)',
                  border: '2px solid rgba(255,255,255,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26, color: '#fff' }}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-white tracking-[-0.3px]">敏宝日记</div>
                <div className="text-xs text-white/80 mt-0.5">
                  专为过敏宝宝家庭打造的成长记录工具
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 底部白色圆角过渡 */}
        <div
          className="absolute bottom-0 left-0 right-0 bg-bg pointer-events-none"
          style={{ height: 28, borderRadius: '24px 24px 0 0' }}
        />
      </div>

      {/* ── 快捷记录网格 ── */}
      <div className="px-4 space-y-4 pt-3 pb-4">
        <div className="flex items-center justify-between px-1 pt-0 pb-1.5">
          <span className="text-[11px] font-semibold text-[#9A8090] tracking-[0.8px] uppercase">
            快捷记录
          </span>
        </div>

        <div className="px-3 pt-1 pb-2">
          <div className="grid grid-cols-4 gap-2">
            {GUEST_QUICK_KEYS.map((key) => {
              const cfg = RECORD_TYPE_CFG[key]
              if (!cfg) return null
              return (
                <button
                  key={key}
                  type="button"
                  onClick={handleQuickAction}
                  className="flex flex-col items-center gap-1.5 cursor-pointer transition-transform active:scale-95 text-center w-full py-1"
                >
                  <RecordTypeIcon
                    type={key}
                    containerSize={58}
                    iconSize={30}
                    borderRadius={18}
                  />
                  <span className="text-[11px] font-medium text-[#9A8090]">
                    {cfg.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── 登录引导区 ── */}
      <div className="px-4 pb-28">
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#FFFBFC', border: '1px solid #F5F0F2' }}
        >
          <LoginGuide
            title="登录后即可开始记录"
            desc="使用手机号登录，随时随地记录宝宝的成长点滴"
          />
        </div>
      </div>
    </div>
  )
}
