/**
 * ReminderOverlay — 提醒浮层 UI（MP 端）
 *
 * 全屏居中弹出，半透明深色背景，不完全遮挡看板内容。
 * 显示：提醒类型 + 标题 + 距目标时间 + 操作按钮组
 *
 * 操作（与 Web 端完全一致）：
 * - 不再提醒（本轮结束，直到新记录产生）
 * - 稍后提醒（10 分钟后再响）
 * - 30 分钟后
 * - 1 小时后
 */
import { View, Text } from '@tarojs/components'
import type { ActiveReminder, DismissAction } from './useReminder'
import './ReminderOverlay.scss'

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
    <View className='reminder-overlay'>
      <View className='reminder-overlay-backdrop' />
      <View className='reminder-card'>
        {/* 图标 + 脉冲圆环容器 */}
        <View className='reminder-icon-wrapper'>
          <View className='reminder-pulse-ring' />
          <View className='reminder-icon'>
            <Text className='reminder-icon-bell'>&#x1F514;</Text>
          </View>
        </View>

        {/* 标题 */}
        <Text className='reminder-title'>{label}</Text>
        <Text className='reminder-time'>{timeDesc}</Text>

        {/* 操作按钮 */}
        <View className='reminder-actions'>
          <View
            className='reminder-btn reminder-btn--primary'
            onClick={() => onDismiss({ type: 'stop_all' })}
          >
            <Text>不再提醒</Text>
          </View>
          <View
            className='reminder-btn reminder-btn--secondary'
            onClick={() => onDismiss({ type: 'snooze', minutes: 10 })}
          >
            <Text>稍后提醒</Text>
          </View>
          <View
            className='reminder-btn reminder-btn--secondary'
            onClick={() => onDismiss({ type: 'snooze', minutes: 30 })}
          >
            <Text>30分钟后</Text>
          </View>
          <View
            className='reminder-btn reminder-btn--secondary'
            onClick={() => onDismiss({ type: 'snooze', minutes: 60 })}
          >
            <Text>1小时后</Text>
          </View>
        </View>

        <Text className='reminder-hint'>点击「不再提醒」表示已在处理，本轮不再响铃</Text>
      </View>
    </View>
  )
}
