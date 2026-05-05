/**
 * ReminderOverlay — 提醒浮层 UI
 *
 * 全屏居中弹出，半透明深色背景，不完全遮挡看板内容。
 * 显示：提醒类型 + 标题 + 距目标时间 + 操作按钮组
 *
 * 操作：
 * - 不再提醒（本轮结束，直到新记录产生）
 * - 稍后提醒（10 分钟后再响）
 * - 30 分钟后
 * - 1 小时后
 */
import type { ActiveReminder, DismissAction } from './useReminder'
import './ReminderOverlay.css'

interface Props {
  reminder: ActiveReminder
  onDismiss: (action: DismissAction) => void
}

export default function ReminderOverlay({ reminder, onDismiss }: Props) {
  const { label, remainingMin } = reminder

  const timeDesc = remainingMin <= 0
    ? '已到预计时间'
    : remainingMin < 60
      ? `约 ${remainingMin} 分钟后`
      : `约 ${Math.floor(remainingMin / 60)}小时${remainingMin % 60}分后`

  return (
    <div className="reminder-overlay">
      <div className="reminder-overlay-backdrop" />
      <div className="reminder-card">
        {/* 脉冲动画圆环 */}
        <div className="reminder-pulse-ring" />

        {/* 图标 */}
        <div className="reminder-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            <line x1="1" y1="1" x2="23" y2="23" className="reminder-icon-line" />
          </svg>
        </div>

        {/* 标题 */}
        <h2 className="reminder-title">{label}</h2>
        <p className="reminder-time">{timeDesc}</p>

        {/* 操作按钮 */}
        <div className="reminder-actions">
          <button
            className="reminder-btn reminder-btn--primary"
            onClick={() => onDismiss({ type: 'stop_all' })}
          >
            不再提醒
          </button>
          <button
            className="reminder-btn reminder-btn--secondary"
            onClick={() => onDismiss({ type: 'snooze', minutes: 10 })}
          >
            稍后提醒
          </button>
          <button
            className="reminder-btn reminder-btn--secondary"
            onClick={() => onDismiss({ type: 'snooze', minutes: 30 })}
          >
            30分钟后
          </button>
          <button
            className="reminder-btn reminder-btn--secondary"
            onClick={() => onDismiss({ type: 'snooze', minutes: 60 })}
          >
            1小时后
          </button>
        </div>

        <p className="reminder-hint">点击「不再提醒」表示已在处理，本轮不再响铃</p>
      </div>
    </div>
  )
}
