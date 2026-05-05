/**
 * 顶栏组件
 * 展示：宝宝名 | 距上次喂奶 | 睡眠状态 | 体温 | 精神状态 | 情绪 | 实时时钟 | 日期选择 | 全屏按钮
 *
 * 视觉层级：
 * - 第一层（核心）：距上次喂奶 + 睡眠状态 — 大字号、高对比度，半夜迷糊中一眼可见
 * - 第二层（辅助）：体温 / 精神 / 情绪 — 小字号、低对比度
 *
 * 日期选择：
 * - 今天 / 昨天 / 前天 快捷按钮
 * - 日历按钮触发 DatePicker 通用组件（底部弹层滚轮选择）
 * - 查看历史日期时顶栏显示橙色日期标记
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import type { Baby } from '@/api'
import type { DashboardData } from './useDashboardData'
import { getTodayStr } from './useDashboardData'
import DatePicker from '@/components/DatePicker'

// 精神状态标签映射
const SPIRIT_MAP: Record<string, string> = {
  active: '活跃',
  normal: '正常',
  tired: '疲倦',
  lethargic: '嗜睡',
}

// 情绪标签映射
const MOOD_MAP: Record<string, string> = {
  happy: '开心',
  neutral: '平静',
  fussy: '烦躁',
  crying: '哭闹',
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** 将分钟差格式化为 "Xh Xm" */
function formatElapsed(diffMin: number): string {
  if (diffMin < 0) return '--'
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  if (h === 0) return `${m}分钟`
  return m > 0 ? `${h}小时${m}分` : `${h}小时`
}

/** 根据距上次喂奶时间返回紧急程度颜色 */
function feedingUrgency(diffMin: number): { bg: string; color: string; pulse: boolean } {
  if (diffMin < 120) return { bg: 'rgba(90,192,120,0.15)', color: '#60c878', pulse: false }
  if (diffMin < 180) return { bg: 'rgba(232,184,74,0.18)', color: '#e8b84a', pulse: false }
  return { bg: 'rgba(240,104,120,0.2)', color: '#f06878', pulse: true }
}

/** 格式化睡眠时长 */
function formatSleepElapsed(startIso: string, now: Date): string {
  const diffMin = Math.max(0, Math.floor((now.getTime() - new Date(startIso).getTime()) / 60_000))
  if (diffMin < 60) return `${diffMin}分钟`
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  return m > 0 ? `${h}小时${m}分` : `${h}小时`
}

/** 将 YYYY-MM-DD 偏移 n 天（n 可为负数） */
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 将 YYYY-MM-DD 格式化为中文显示 */
function formatDateLabel(dateStr: string): string {
  const today = getTodayStr()
  const yesterday = offsetDate(today, -1)
  const dayBefore = offsetDate(today, -2)
  if (dateStr === today) return '今天'
  if (dateStr === yesterday) return '昨天'
  if (dateStr === dayBefore) return '前天'
  // 其他日期：显示 M月D日
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

interface Props {
  baby: Baby | null
  data: DashboardData
  /** 当前查看的日期，YYYY-MM-DD，undefined 表示今日 */
  selectedDate: string
  onDateChange: (date: string) => void
  /** 提醒声音是否开启 */
  soundEnabled: boolean
  /** 切换声音开关 */
  onSoundToggle: (enabled: boolean) => void
}

export default function HeaderBar({ baby, data, selectedDate, onDateChange, soundEnabled, onSoundToggle }: Props) {
  const [now, setNow] = useState(new Date())
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement)
  const [showDatePicker, setShowDatePicker] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // 监听全屏状态变化
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const todayStr = getTodayStr()
  const yesterdayStr = offsetDate(todayStr, -1)
  const dayBeforeStr = offsetDate(todayStr, -2)
  const isToday = selectedDate === todayStr

  // 计算距上次喂奶（母乳/配方奶）的分钟数
  const lastFeedingMin = useMemo(() => {
    if (data.feeding.length === 0) return null
    const nowMs = now.getTime()
    // feeding 数组已按时间正序（从早到晚），从末尾往前找第一条 ≤ 当前时间的记录
    for (let i = data.feeding.length - 1; i >= 0; i--) {
      const feedTime = new Date(data.feeding[i].time).getTime()
      if (feedTime <= nowMs) {
        return Math.floor((nowMs - feedTime) / 60_000)
      }
    }
    return null
  }, [data.feeding, now])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  const urgency = lastFeedingMin != null ? feedingUrgency(lastFeedingMin) : null

  const handleQuickDate = (dateStr: string) => {
    onDateChange(dateStr)
    setShowDatePicker(false)
  }

  return (
    <div className="db-header">
      <div className="db-header-left">
        <span className="db-baby-name">{baby?.name ?? '宝宝'}</span>

        {/* 日期选择区域 */}
        <div className="db-date-selector">
          {/* 快捷按钮 */}
          <button
            className={`db-date-btn ${selectedDate === todayStr ? 'db-date-btn--active' : ''}`}
            onClick={() => handleQuickDate(todayStr)}
          >
            今天
          </button>
          <button
            className={`db-date-btn ${selectedDate === yesterdayStr ? 'db-date-btn--active' : ''}`}
            onClick={() => handleQuickDate(yesterdayStr)}
          >
            昨天
          </button>
          <button
            className={`db-date-btn ${selectedDate === dayBeforeStr ? 'db-date-btn--active' : ''}`}
            onClick={() => handleQuickDate(dayBeforeStr)}
          >
            前天
          </button>

          {/* 日期选择器触发按钮 — 使用 DatePicker 通用组件 */}
          <button
            className={`db-date-btn db-date-btn--calendar ${!isToday && selectedDate !== yesterdayStr && selectedDate !== dayBeforeStr ? 'db-date-btn--active' : ''}`}
            onClick={() => setShowDatePicker(true)}
            title="选择日期"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {!isToday && selectedDate !== yesterdayStr && selectedDate !== dayBeforeStr
              ? formatDateLabel(selectedDate)
              : '选日期'}
          </button>
        </div>

        {/* 历史日期提示标记 */}
        {!isToday && (
          <span className="db-date-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            查看 {formatDateLabel(selectedDate)} 的记录
          </span>
        )}

        {/* ★ 核心指标居中展示 — 喂奶 + 睡眠 + 体温，视觉统一 */}
        <span className="db-header-indicators">
          {isToday && lastFeedingMin != null && urgency && (
            <span
              className={`db-header-tag ${urgency.pulse ? 'db-tag-pulse' : ''}`}
              style={{ background: urgency.bg, color: urgency.color }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              距上次喂奶 {formatElapsed(lastFeedingMin)}
            </span>
          )}
          {isToday && lastFeedingMin == null && (
            <span className="db-header-tag db-tag-feeding-none">
              今日暂无喂奶
            </span>
          )}

          {isToday && data.isSleeping && (
            <span className="db-header-tag db-tag-sleeping">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              睡眠中{data.sleepingSince ? ` ${formatSleepElapsed(data.sleepingSince, now)}` : ''}
            </span>
          )}

          {data.latestTemp != null && (
            <span className={`db-header-tag db-tag-temp ${data.latestTemp >= 37.5 ? 'db-tag-temp--fever' : ''}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
              </svg>
              {data.latestTemp.toFixed(1)}°C
            </span>
          )}

          {data.latestSpirit && (
            <span className="db-header-tag db-tag-spirit">
              {SPIRIT_MAP[data.latestSpirit] ?? data.latestSpirit}
            </span>
          )}

          {data.latestMood && (
            <span className="db-header-tag db-tag-mood">
              {MOOD_MAP[data.latestMood] ?? data.latestMood}
            </span>
          )}
        </span>
      </div>

      <div className="db-header-right">
        <span className="db-header-tag db-tag-clock">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {formatTime(now)}
        </span>
        <button
          className={`db-sound-btn ${soundEnabled ? 'db-sound-btn--on' : 'db-sound-btn--off'}`}
          onClick={() => onSoundToggle(!soundEnabled)}
          title={soundEnabled ? '关闭提醒声音' : '开启提醒声音'}
        >
          {soundEnabled ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        </button>
        <button className="db-fullscreen-btn" onClick={toggleFullscreen} title={isFullscreen ? '退出全屏' : '全屏展示'}>
          {isFullscreen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          )}
        </button>
      </div>

      {/* DatePicker 弹层 — 由日历按钮触发，受控模式 */}
      <DatePicker
        value={selectedDate}
        onChange={(val) => { onDateChange(val); setShowDatePicker(false) }}
        max={todayStr}
        label="选择日期"
        open={showDatePicker}
        onClose={() => setShowDatePicker(false)}
      />
    </div>
  )
}
