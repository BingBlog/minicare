/**
 * HeroSection 首页英雄区组件
 *
 * 包含：
 * 1. 顶部 Header Row（日期+宝宝年龄、用户头像导航按钮）
 * 2. Baby Card（宝宝信息 + 过敏标签 + 今日4格统计）
 * 3. 底部白色圆角过渡区
 *
 * 背景为品牌渐变色（粉色→浅粉），装饰圆通过 absolute + pointer-events-none 实现。
 */
import { useNavigate } from 'react-router-dom'
import { IconUserSingle } from '@/components/ui/icons'
import { getBabyAge, getTodayDateStr } from '@/lib/utils'
import type { Baby } from '@/api/types'

// ── 今日统计格子配置 ─────────────────────────────────────────────────────────
/** 单格统计数据 */
export interface BabyStat {
  /** 数值（数字或字符串，如 "—"） */
  val: string | number
  /** 单位文字，如 ml / h / 次 */
  unit: string
  /** 标签说明，如 "今日奶量" */
  label: string
}

// ── 组件 Props ──────────────────────────────────────────────────────────────

interface HeroSectionProps {
  /** 当前宝宝信息，为 null 时不显示 BabyCard */
  currentBaby: Baby | null
  /** 今日4格统计数据 */
  stats: BabyStat[]
  /** 睡眠进行中横幅（由父组件按需传入） */
  sleepBanner?: React.ReactNode
}

/**
 * 首页英雄区（渐变背景 + 宝宝卡片 + 可选睡眠横幅）
 */
export default function HeroSection({ currentBaby, stats, sleepBanner }: HeroSectionProps) {
  const navigate = useNavigate()
  const dateStr = getTodayDateStr()

  return (
    <div
      className={`relative ${sleepBanner ? 'pb-0' : 'pb-7'}`}
      style={{ background: 'linear-gradient(180deg, #f87098 0%, #f9a8c0 100%)' }}
    >
      {/* 装饰圆（纯视觉，不影响交互） */}
      <div
        className="absolute pointer-events-none"
        style={{
          right: -40, top: -50,
          width: 160, height: 160,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          right: 80, top: 30,
          width: 80, height: 80,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.07)',
        }}
      />

      {/* ── Header Row ── */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 relative z-10">
        <div>
          {/* 日期 & 宝宝月龄副标题 */}
          <div className="text-xs text-white/78 tracking-[0.2px]">
            {currentBaby
              ? `${dateStr} · ${currentBaby.name} ${getBabyAge(currentBaby.birth_date)}`
              : dateStr}
          </div>
          {/* 时段问候语 */}
          <div
            className="text-2xl font-bold text-white mt-1 tracking-tight"
            style={{ textShadow: '0 1px 4px rgba(248,80,100,0.25)' }}
          >
            {getGreeting()}
            {/* 挥手 emoji 图标（使用 inline SVG 以保证跨平台一致性） */}
            <svg
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ width: 16, height: 16, verticalAlign: -3, display: 'inline', marginLeft: 4, color: 'rgba(255,255,255,0.9)' }}
            >
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
            </svg>
          </div>
        </div>

        {/* 用户头像按钮 → 跳转我的页面 */}
        <div
          className="cursor-pointer relative z-10"
          onClick={() => navigate('/profile')}
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(255,255,255,0.28)',
            border: '1.5px solid rgba(255,255,255,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          <IconUserSingle size={22} color="#fff" />
        </div>
      </div>

      {/* ── Baby Card（仅在有宝宝数据时展示） ── */}
      {currentBaby && (
        <BabyCard
          baby={currentBaby}
          stats={stats}
          onNavigateRecords={() => navigate('/records')}
          onNavigateProfile={() => navigate('/profile')}
        />
      )}

      {/* ── 睡眠进行中横幅（由父组件按需传入，位于 BabyCard 和圆角过渡之间） ── */}
      {sleepBanner}

      {/* 底部白色圆角过渡（遮住渐变背景，与内容区平滑衔接） */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-bg pointer-events-none"
        style={{ height: 28, borderRadius: '24px 24px 0 0' }}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// BabyCard 子组件（宝宝信息 + 4格统计）
// ────────────────────────────────────────────────────────────────────────────

interface BabyCardProps {
  baby: Baby
  stats: BabyStat[]
  onNavigateRecords: () => void
  onNavigateProfile: () => void
}

/**
 * 宝宝信息卡片（磨砂玻璃效果，Hero 区内）
 */
function BabyCard({ baby, stats, onNavigateRecords, onNavigateProfile }: BabyCardProps) {
  return (
    <div className="mx-4 relative z-10 cursor-pointer" onClick={onNavigateProfile}>
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 100%)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 18,
          padding: '16px 18px 18px',
          backdropFilter: 'blur(2px)',
        }}
      >
        {/* 内部装饰圆 */}
        <div
          className="absolute pointer-events-none"
          style={{ right: -20, top: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }}
        />

        {/* 宝宝信息行 */}
        <div className="flex items-center gap-3 mb-4 relative z-10">
          {/* 宝宝头像占位（小人图标） */}
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
              strokeLinecap="round" strokeLinejoin="round" style={{ width: 30, height: 30, color: '#fff' }}>
              <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4"/>
              <path d="M5 20a7 7 0 0 1 14 0"/>
              <circle cx="8.5" cy="10" r="1" fill="currentColor"/>
              <circle cx="15.5" cy="10" r="1" fill="currentColor"/>
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-white tracking-[-0.3px]">{baby.name}</div>
            <div className="text-xs text-white/80 mt-0.5">
              {getBabyAge(baby.birth_date)}
            </div>
          </div>
        </div>

        {/* 今日4格统计 */}
        <div
          className="flex relative z-10 rounded-xl overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.1)' }}
        >
          {stats.map((stat, i) => {
            const isEmpty = stat.val === '—'
            return (
              <div
                key={i}
                className="flex-1 text-center py-2.5 cursor-pointer active:bg-white/10"
                style={i < 3 ? { borderRight: '1px solid rgba(255,255,255,0.18)' } : {}}
                onClick={(e) => { e.stopPropagation(); onNavigateRecords() }}
              >
                <div
                  className="leading-none tracking-[-0.5px]"
                  style={isEmpty
                    ? { fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.38)' }
                    : { fontSize: 20, fontWeight: 800, color: '#fff' }
                  }
                >
                  {stat.val}
                  {!isEmpty && (
                    <span className="text-[11px] font-semibold opacity-80">{stat.unit}</span>
                  )}
                </div>
                <div className="text-[10px] mt-1" style={{ color: isEmpty ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.65)' }}>{stat.label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 本地工具（避免重复引入）
// ────────────────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}
