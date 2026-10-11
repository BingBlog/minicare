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
 *
 * 已睡时长补偿（2026-10-11）：idle 态可选「已睡时长」，
 * 开始计时时 start_time 自动前移对应分钟数，解决「宝宝睡着后才点开始计时」的时间偏差。
 *   - 快捷项（10/20/30 分钟、1 小时）直接展示为 chips，点击即选中（再点取消）
 *   - 「更多」下拉提供 5 分钟步进的灵活档位（不补偿 ~ 4 小时）
 */
import { View, Text, Picker, Image } from '@tarojs/components'
import { isoToLocalTime, dateToLocalISO } from '@/lib/utils'

/** 快捷补偿 chips（分钟 + 紧凑文案） */
const QUICK_COMPENSATE: { min: number; label: string }[] = [
  { min: 10, label: '10分钟' },
  { min: 20, label: '20分钟' },
  { min: 30, label: '30分钟' },
  { min: 60, label: '1小时' },
]

/** 「更多」下拉档位（分钟）：0 = 不补偿，5 分钟步进至 240 分钟（4 小时） */
const MORE_MINUTES: number[] = Array.from({ length: 49 }, (_, i) => i * 5)

/** 时长文案：0 → 不补偿；<60 → X 分钟；整点 → X 小时；否则 → X 小时 Y 分钟 */
function formatCompensate(min: number): string {
  if (min <= 0) return '不补偿'
  if (min < 60) return `${min} 分钟`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`
}

/** 「更多」下拉滚轮文案（下标与 MORE_MINUTES 对齐） */
const MORE_LABELS = MORE_MINUTES.map(formatCompensate)

/** 下拉箭头（Lucide chevron-down；小程序不支持内联 svg，统一 data:image/svg+xml） */
const ICON_CHEVRON_DOWN = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#C0A8AD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
)}`

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
  /** 已选补偿时长（分钟），0 = 不补偿；仅 idle 态可选择 */
  compensateMin: number
  onCompensateChange: (minutes: number) => void
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
  compensateMin,
  onCompensateChange,
  onStart,
  onResume,
  onStop,
  onCancel,
}: Props) {
  const isIdle   = !running && !stopped && seconds === 0
  const isPaused = !running && !stopped && seconds > 0

  // ── 补偿状态派生 ──
  const compensateIndex = Math.max(0, MORE_MINUTES.indexOf(compensateMin))
  const isQuickCompensate = QUICK_COMPENSATE.some((o) => o.min === compensateMin)
  const moreActive = compensateMin > 0 && !isQuickCompensate
  const moreLabel = moreActive ? formatCompensate(compensateMin) : '更多'

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
          开始于 {isoToLocalTime(dateToLocalISO(startTime))} 今天
        </Text>
      )}

      {/* 已睡时长补偿（仅未开始时可选；开始后 start_time 已定，不再展示） */}
      {isIdle && (
        <View className='sleep-timer__compensate'>
          {/* 头部：标签 + 「更多」下拉入口（灵活档位 5 分钟步进） */}
          <View className='sleep-timer__compensate-head'>
            <Text className='sleep-timer__compensate-label'>已睡时长</Text>
            <Picker
              mode='selector'
              range={MORE_LABELS}
              value={compensateIndex}
              onChange={(e) => onCompensateChange(MORE_MINUTES[Number(e.detail.value)] ?? 0)}
            >
              <View
                className={`sleep-timer__compensate-more${
                  moreActive ? ' sleep-timer__compensate-more--active' : ''
                }`}
              >
                <Text className='sleep-timer__compensate-more-text'>{moreLabel}</Text>
                <Image className='sleep-timer__compensate-more-arrow' src={ICON_CHEVRON_DOWN} />
              </View>
            </Picker>
          </View>

          {/* 快捷项 chips：点击即选中，再点取消 */}
          <View className='sleep-timer__compensate-chips'>
            {QUICK_COMPENSATE.map(({ min, label }) => (
              <View
                key={min}
                className={`sleep-timer__chip${
                  compensateMin === min ? ' sleep-timer__chip--active' : ''
                }`}
                onClick={() => onCompensateChange(compensateMin === min ? 0 : min)}
              >
                <Text className='sleep-timer__chip-text'>{label}</Text>
              </View>
            ))}
          </View>
        </View>
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
