import { View, Text } from '@tarojs/components'

const SIDE_OPTIONS: { key: 'left' | 'right' | 'both'; label: string }[] = [
  { key: 'left', label: '左侧' },
  { key: 'right', label: '右侧' },
  { key: 'both', label: '双侧' },
]

interface Props {
  breastSide: 'left' | 'right' | 'both'
  onChangeSide: (side: 'left' | 'right' | 'both') => void
  durationMin: number
  onChangeDuration: (v: number) => void
}

export default function BreastSection({
  breastSide,
  onChangeSide,
  durationMin,
  onChangeDuration,
}: Props) {
  return (
    <>
      <View className='feed-section-label'><Text>哺乳侧</Text></View>
      <View className='feed-card'>
        <View className='feed-side-grid'>
          {SIDE_OPTIONS.map((s) => (
            <View
              key={s.key}
              className={`feed-side-opt ${breastSide === s.key ? 'feed-side-opt--active' : ''}`}
              onClick={() => onChangeSide(s.key)}
            >
              <Text className='feed-side-opt__label'>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='feed-section-label'><Text>时长</Text></View>
      <View className='feed-card'>
        <View className='feed-stepper'>
          <View className='feed-stepper__btn' onClick={() => onChangeDuration(Math.max(1, durationMin - 5))}>
            <Text className='feed-stepper__btn-text'>-</Text>
          </View>
          <Text className='feed-stepper__val'>{durationMin}</Text>
          <View className='feed-stepper__btn' onClick={() => onChangeDuration(Math.min(60, durationMin + 5))}>
            <Text className='feed-stepper__btn-text'>+</Text>
          </View>
          <Text className='feed-stepper__unit'>分钟</Text>
        </View>
      </View>
    </>
  )
}
