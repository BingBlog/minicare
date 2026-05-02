/**
 * 健康记录 - 体温步进器区块
 *
 * 与 Web health/TemperatureSection.tsx 保持 1:1 业务逻辑对齐：
 *  - 步进器：0.1 度步进，范围 35.0 ~ 42.0
 *  - 清除按钮：体温可选，点击清空
 *  - >=37.5 时显示高温警告
 *
 * 差异化：
 *  - Web 使用 button + Tailwind；MP 使用 View/Text + SCSS
 */
import { View, Text } from '@tarojs/components'

interface TemperatureSectionProps {
  value: string
  onChange: (v: string) => void
}

export default function TemperatureSection({ value, onChange }: TemperatureSectionProps) {
  const handleDecrease = () => {
    const cur = parseFloat(value) || 36.5
    onChange(Math.max(35.0, +(cur - 0.1).toFixed(1)).toString())
  }

  const handleIncrease = () => {
    const cur = parseFloat(value) || 36.5
    onChange(Math.min(42.0, +(cur + 0.1).toFixed(1)).toString())
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
            <Text className='health-temp__value'>{value || '--'}</Text>
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
