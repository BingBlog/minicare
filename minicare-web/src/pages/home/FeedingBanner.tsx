/**
 * FeedingBanner — 喂奶间隔提醒横幅
 *
 * 当有最近喂奶记录时展示，样式与 SleepBanner 保持一致。
 * 点击横幅 → 跳转喂奶表单（配方奶 tab）。
 *
 * Props:
 *  - lastFeedingTime: 最近一次喂奶的 ISO 时间字符串
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

/** 格式化距离描述：分钟 / 小时分钟 */
function formatElapsed(mins: number): string {
  if (mins < 60) return `${Math.max(mins, 1)} 分钟`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}

interface FeedingBannerProps {
  /** 最近一次喂奶的 ISO 时间字符串 */
  lastFeedingTime: string
}

export default function FeedingBanner({ lastFeedingTime }: FeedingBannerProps) {
  const navigate = useNavigate()

  // 每分钟更新的距离分钟数
  const [elapsedMins, setElapsedMins] = useState(() => {
    return Math.floor((Date.now() - new Date(lastFeedingTime).getTime()) / 60_000)
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // 每分钟更新一次
    intervalRef.current = setInterval(() => {
      setElapsedMins(Math.floor((Date.now() - new Date(lastFeedingTime).getTime()) / 60_000))
    }, 60_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [lastFeedingTime])

  const handleClick = () => {
    navigate('/records/form/feeding', { state: { tab: 'formula' } })
  }

  const elapsedStr = formatElapsed(elapsedMins)

  return (
    <div
      className="mx-4 relative z-10 cursor-pointer flex items-center gap-2.5"
      onClick={handleClick}
      style={{
        marginTop: 12,
        background: '#fff',
        borderRadius: 12,
        padding: '11px 14px',
        boxShadow: '0 4px 16px rgba(248,144,80,0.18)',
        borderLeft: '3px solid #F8A070',
      }}
    >
      {/* 脉冲小圆点（暖橙色） */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#F8A070',
          flexShrink: 0,
          animation: 'feedingPulseOrange 2s infinite',
        }}
      />

      {/* 文字区 */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[#4A3035]">距上次喂奶</div>
        <div className="text-[11px] text-[#9A8090] mt-0.5">
          已过去 {elapsedStr}，点击记录新一次喂奶
        </div>
      </div>

      {/* 记录按钮 */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleClick() }}
        className="text-[12px] font-semibold flex-shrink-0"
        style={{
          background: 'transparent',
          color: '#F8A070',
          border: '1.5px solid rgba(248,160,112,0.5)',
          borderRadius: 8,
          padding: '6px 12px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s',
        }}
      >
        记录喂奶
      </button>

      {/* pulse 动画 keyframes */}
      <style>{`
        @keyframes feedingPulseOrange {
          0%, 100% { box-shadow: 0 0 0 3px rgba(248,160,112,0.2); }
          50%       { box-shadow: 0 0 0 6px rgba(248,160,112,0.06); }
        }
      `}</style>
    </div>
  )
}
