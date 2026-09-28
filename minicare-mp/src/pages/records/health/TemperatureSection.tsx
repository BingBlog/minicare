/**
 * 健康记录 - 体温区块（支持直接输入数值）
 *
 * 与 Web health/TemperatureSection.tsx 业务逻辑对齐（Web 为纯步进器）：
 *  - 步进器：0.1 度步进，范围 35.0 ~ 42.0（± 快捷调整保留）
 *  - 直接输入：点击数值可键盘录入（digit 键盘含小数点），失焦自动校验/clamp
 *  - 清除按钮：体温可选，点击清空
 *  - >=37.5 时显示高温警告
 */
import { View, Text, Input } from '@tarojs/components'
import { useEffect, useState } from 'react'

interface TemperatureSectionProps {
  value: string
  onChange: (v: string) => void
}

const MIN_TEMP = 35.0
const MAX_TEMP = 42.0

export default function TemperatureSection({ value, onChange }: TemperatureSectionProps) {
  // 输入中草稿（不 clamp，失焦时校验），props.value 变化时同步
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = (v: string) => {
    setDraft(v)
    onChange(v)
  }

  const handleDecrease = () => {
    const base = parseFloat(draft) || 36.5
    commit(Math.max(MIN_TEMP, +(base - 0.1).toFixed(1)).toString())
  }

  const handleIncrease = () => {
    const base = parseFloat(draft) || 36.5
    commit(Math.min(MAX_TEMP, +(base + 0.1).toFixed(1)).toString())
  }

  /**
   * 输入过滤：仅数字 + 一个小数点，保留 1 位小数，最多 4 字符（如 42.0）
   * 中间态（如 "3"、"39"）直接透传，失焦时统一校验
   */
  const handleInput = (v: string) => {
    let s = v.replace(/[^\d.]/g, '')
    const dotIdx = s.indexOf('.')
    if (dotIdx !== -1) {
      s = s.slice(0, dotIdx + 1) + s.slice(dotIdx + 1).replace(/\./g, '')
      s = s.slice(0, dotIdx + 2) // 保留 1 位小数
    }
    s = s.slice(0, 4)
    setDraft(s)
    onChange(s)
  }

  /** 失焦校验：空/非法清空；超范围 clamp 到 [35.0, 42.0]，统一保留 1 位小数 */
  const handleBlur = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      onChange('')
      return
    }
    const num = parseFloat(trimmed)
    if (Number.isNaN(num)) {
      onChange('')
      return
    }
    const clamped = Math.min(MAX_TEMP, Math.max(MIN_TEMP, num))
    commit(clamped.toFixed(1))
  }

  const isHigh = value && parseFloat(value) >= 37.5

  return (
    <View className='health-temp'>
      {/* 步进器行 */}
      <View className='health-temp__row'>
        <Text className='health-temp__label'>体温</Text>
        <View className='health-temp__stepper'>
          <View className='health-temp__btn' onClick={handleDecrease}>
            <Text className='health-temp__btn-text'>-</Text>
          </View>
          <View className='health-temp__value-wrap'>
            <Input
              className='health-temp__value'
              type='digit'
              maxlength={4}
              value={draft}
              placeholder='--'
              placeholderClass='health-temp__placeholder'
              onInput={(e) => handleInput(e.detail.value)}
              onBlur={handleBlur}
            />
            <Text className='health-temp__unit'>&#8451;</Text>
          </View>
          <View className='health-temp__btn' onClick={handleIncrease}>
            <Text className='health-temp__btn-text'>+</Text>
          </View>
          {value ? (
            <Text className='health-temp__clear' onClick={() => onChange('')}>
              清除
            </Text>
          ) : null}
        </View>
      </View>

      {/* 高温警告 */}
      {isHigh ? (
        <View className='health-temp__warning'>
          <Text className='health-temp__warning-text'>
            {'体温偏高（\u226537.5\u2103），建议关注宝宝状态'}
          </Text>
        </View>
      ) : null}
    </View>
  )
}
