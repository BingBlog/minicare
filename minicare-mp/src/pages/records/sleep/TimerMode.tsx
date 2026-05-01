/**
 * 睡眠记录 - 计时模式组件（MP 迁移）
 *
 * 与 Web pages/records/sleep/TimerMode.tsx 保持 1:1 业务逻辑对齐。
 * 差异：Taro 组件、conic-gradient 替换为纯色圆、SVG内联。
 *
 * 四种状态：
 *   idle    — 未开始（seconds === 0, !running, !stopped）→ 显示「开始计时」
 *   running — 计时中（running）                          → 显示「结束睡眠」
 *   paused  — 暂停中（seconds > 0, !running, !stopped）  → 显示「继续计时」
 *   stopped — 已保存（stopped）                          → 显示保存成功提示
 */
import { View, Text } from '@tarojs/components'
import dayjs from 'dayjs'

/** 将秒数格式化为 mm:ss 或 h:mm:ss */
function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface Props {
  running: boolean
  stopped: boolean
  seconds: number
  startTime: Date | null
  apiLoading: boolean
  onStart: () => void
  onResume: () => void
  onStop: () => void
  onCancel: () => void
}

export default function TimerMode({
  running,
  stopped,
  seconds,
  startTime,
  apiLoading,
  onStart,
  onResume,
  onStop,
  onCancel,
}: Props) {
  const isIdle   = !running && !stopped && seconds === 0
  const isPaused = !running && !stopped && seconds > 0

  return (
    <View className='sleep-timer'>
      {/* 圆形计时器 */}
      <View
        className={`sleep-timer__ring ${
          running ? 'sleep-timer__ring--running' : ''
        }`}
        style={{
          background: !isIdle ? '#4CAF82' : '#F0E8EA',
        }}
      >
        {/* 内圆白底 */}
        <View className='sleep-timer__inner'>
          {/* 月亮图标 */}
          <View className='sleep-timer__moon'>
            <View className='sleep-timer__moon-shape' />
          </View>
          <Text className='sleep-timer__time'>
            {isIdle ? '0m' : formatTimer(seconds)}
          </Text>
          <Text className='sleep-timer__status'>
            {running  ? '睡眠进行中'
            : stopped  ? '已保存'
            : isPaused ? '已暂停'
            :            '准备好了'}
          </Text>
        </View>
      </View>

      {/* 开始时间提示 */}
      {startTime && (
        <Text className='sleep-timer__start-hint'>
          开始于 {dayjs(startTime).format('HH:mm')} 今天
        </Text>
      )}

      {/* ── 按钮区 ── */}

      {/* idle：「开始计时」*/}
      {isIdle && (
        <View
          className={`sleep-timer__btn sleep-timer__btn--start ${apiLoading ? 'sleep-timer__btn--loading' : ''}`}
          onClick={apiLoading ? undefined : onStart}
        >
          <Text className='sleep-timer__btn-text'>开始计时</Text>
        </View>
      )}

      {/* paused：「继续计时」+「取消本次计时」 */}
      {isPaused && (
        <View className='sleep-timer__btn-group'>
          <View
            className='sleep-timer__btn sleep-timer__btn--resume'
            onClick={onResume}
          >
            <Text className='sleep-timer__btn-text'>继续计时</Text>
          </View>
          <Text className='sleep-timer__cancel-link' onClick={onCancel}>
            取消本次计时
          </Text>
        </View>
      )}

      {/* running：「结束睡眠」+「取消本次计时」 */}
      {running && (
        <View className='sleep-timer__btn-group'>
          <View
            className={`sleep-timer__btn sleep-timer__btn--stop ${apiLoading ? 'sleep-timer__btn--loading' : ''}`}
            onClick={apiLoading ? undefined : onStop}
          >
            <Text className='sleep-timer__btn-text'>结束睡眠</Text>
          </View>
          <Text
            className='sleep-timer__cancel-link'
            onClick={apiLoading ? undefined : onCancel}
          >
            取消本次计时
          </Text>
        </View>
      )}

      {/* stopped：保存成功提示 */}
      {stopped && (
        <View className='sleep-timer__saved'>
          <Text className='sleep-timer__saved-check'>✓</Text>
          <Text className='sleep-timer__saved-text'>记录已保存，正在返回…</Text>
        </View>
      )}
    </View>
  )
}
