/**
 * SleepBanner — 睡眠进行中横幅
 *
 * 仅在有 ongoing 睡眠记录时展示，位于 HeroSection（baby card）和内容区之间。
 * 样式严格对齐 ui-draft/home.html .sleep-banner。
 *
 * 功能：
 * - 显示开始时间 & 实时计时（每分钟自动更新）
 * - 点击横幅 → 跳转睡眠表单（计时模式）
 * - 点击「结束睡眠」→ 调用 endSleep API → 通知父组件刷新
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { recordsApi } from '@/api'
import type { SleepRecord, SleepPeriod } from '@/api/types'
import { dateToLocalISO, isoToLocalTime } from '@/pages/records/shared'
import dayjs from 'dayjs'

/** 将秒数格式化为 "Xh Ym" 或 "Ym" */
function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

interface SleepBannerProps {
  familyId: string
  ongoingRecord: SleepRecord
  /** 结束睡眠成功后回调（父组件刷新数据） */
  onEnded: () => void
}

export default function SleepBanner({ familyId, ongoingRecord, onEnded }: SleepBannerProps) {
  const navigate = useNavigate()

  // 本地实时秒数（从 start_time 至今）
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    return Math.max(0, dayjs().diff(dayjs(ongoingRecord.start_time), 'second'))
  })

  const [ending, setEnding] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 每秒更新计时
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1)
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  /** 点「结束睡眠」→ 调用 endSleep API */
  const handleEnd = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (ending) return
    setEnding(true)
    try {
      await recordsApi.sleep.endSleep(familyId, ongoingRecord.id, {
        end_time: dateToLocalISO(new Date()),
        quality: 'normal',
        sleep_period: (ongoingRecord.sleep_period ?? 'night') as SleepPeriod,
      })
      onEnded()
    } catch {
      // 失败静默，不阻塞用户
      setEnding(false)
    }
  }

  /** 点横幅 → 跳睡眠表单（计时模式，会自动恢复 ongoing） */
  const handleBannerClick = () => {
    navigate('/records/form/sleep')
  }

  const startTimeStr = isoToLocalTime(ongoingRecord.start_time)
  const elapsedStr = formatElapsed(elapsedSeconds)

  return (
    <div
      className="mx-4 relative z-10 cursor-pointer flex items-center gap-2.5"
      onClick={handleBannerClick}
      style={{
        marginTop: 12,
        background: '#fff',
        borderRadius: 12,
        padding: '11px 14px',
        boxShadow: '0 4px 16px rgba(248,80,100,0.2)',
        borderLeft: '3px solid #F87098',
      }}
    >
      {/* 脉冲小圆点 */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#F87098',
          flexShrink: 0,
          animation: 'sleepPulsePink 2s infinite',
        }}
      />

      {/* 文字区 */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[#4A3035]">宝宝正在睡觉</div>
        <div className="text-[11px] text-[#9A8090] mt-0.5">
          开始于 {startTimeStr} · 已睡 {elapsedStr}
        </div>
      </div>

      {/* 结束按钮 */}
      <button
        type="button"
        onClick={handleEnd}
        disabled={ending}
        className="text-[12px] font-semibold flex-shrink-0"
        style={{
          background: 'transparent',
          color: ending ? '#C8A0B0' : '#F87098',
          border: `1.5px solid ${ending ? '#E8C8D0' : 'rgba(248,112,152,0.5)'}`,
          borderRadius: 8,
          padding: '6px 12px',
          cursor: ending ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s',
        }}
      >
        {ending ? '结束中…' : '结束睡眠'}
      </button>

      {/* pulse 动画 keyframes（注入为全局一次，利用 style 标签） */}
      <style>{`
        @keyframes sleepPulsePink {
          0%, 100% { box-shadow: 0 0 0 3px rgba(248,112,152,0.2); }
          50%       { box-shadow: 0 0 0 6px rgba(248,112,152,0.06); }
        }
      `}</style>
    </div>
  )
}
