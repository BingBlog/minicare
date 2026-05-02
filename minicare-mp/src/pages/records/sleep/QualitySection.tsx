/**
 * 睡眠记录 - 睡眠质量选择卡片（MP 迁移）
 *
 * 与 Web pages/records/sleep/QualitySection.tsx 保持 1:1 业务逻辑对齐。
 * 差异：Taro 组件，纯文本标签（无图标）。
 *
 * 三个选项：良好 / 一般 / 较差
 */
import { View, Text } from '@tarojs/components'
import { SLEEP_QUALITY_LABELS } from '@/lib/constants'
import type { SleepQuality } from '@/api/sleep'

const QUALITY_OPTIONS: {
  key: SleepQuality
  label: string
  color: string
  bg: string
}[] = [
  { key: 'good', label: SLEEP_QUALITY_LABELS.good, color: '#4CAF82', bg: '#E8F5E9' },
  { key: 'normal', label: SLEEP_QUALITY_LABELS.normal, color: '#9A8090', bg: '#F5F0F2' },
  { key: 'poor', label: SLEEP_QUALITY_LABELS.poor, color: '#F87098', bg: '#FFF0F4' },
]

interface Props {
  value: SleepQuality
  onChange: (v: SleepQuality) => void
}

export default function QualitySection({ value, onChange }: Props) {
  return (
    <>
      <View className='sleep-section-label'>
        <Text>睡眠质量</Text>
      </View>
      <View className='sleep-card'>
        <View className='sleep-quality-grid'>
          {QUALITY_OPTIONS.map(({ key, label, color, bg }) => (
            <View
              key={key}
              className={`sleep-quality-opt ${value === key ? 'sleep-quality-opt--active' : ''}`}
              style={{
                borderColor: value === key ? color : '#E5D8DA',
                background: value === key ? bg : '#fff',
              }}
              onClick={() => onChange(key)}
            >
              <Text
                className='sleep-quality-opt__label'
                style={{ color: value === key ? color : '#9A8090' }}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </>
  )
}
