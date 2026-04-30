import { View, Text } from '@tarojs/components'

type DiaperChip = 'wet' | 'dirty' | 'mixed'

const CARD_OPTIONS: {
  key: DiaperChip
  label: string
  activeColor: string
  activeBg: string
  activeBorder: string
}[] = [
  { key: 'wet', label: '嘘嘘', activeColor: '#3B9EF5', activeBg: '#EEF6FF', activeBorder: '#7BBFF8' },
  { key: 'dirty', label: '臭臭', activeColor: '#D4875A', activeBg: '#FFF5EE', activeBorder: '#E8B48A' },
  { key: 'mixed', label: '臭臭+嘘嘘', activeColor: '#A06CC0', activeBg: '#F7F0FC', activeBorder: '#C89EDA' },
]

interface Props {
  selected: DiaperChip
  onSelect: (key: DiaperChip) => void
  count: number
  onCountChange: (v: number) => void
}

export default function DiaperTypeSection({ selected, onSelect, count, onCountChange }: Props) {
  return (
    <View className='diaper-card'>
      <View className='diaper-card__head'>
        <Text className='diaper-card__head-icon'>diaper</Text>
        <Text className='diaper-card__head-title'>换尿布</Text>
      </View>

      <View className='diaper-type-grid'>
        {CARD_OPTIONS.map(({ key, label, activeColor, activeBg, activeBorder }) => {
          const isSelected = selected === key
          return (
            <View
              key={key}
              className={`diaper-type-opt ${isSelected ? 'diaper-type-opt--active' : ''}`}
              style={isSelected ? { borderColor: activeBorder, background: activeBg } : {}}
              onClick={() => onSelect(key)}
            >
              <Text
                className='diaper-type-opt__label'
                style={{ color: isSelected ? activeColor : '#9A8090' }}
              >
                {label}
              </Text>
            </View>
          )
        })}
      </View>

      <View className='diaper-count'>
        <Text className='diaper-count__label'>今日次数</Text>
        <View className='diaper-count__controls'>
          <View className='diaper-count__btn' onClick={() => onCountChange(Math.max(0, count - 1))}>
            <Text className='diaper-count__btn-text'>-</Text>
          </View>
          <Text className='diaper-count__val'>{count}</Text>
          <View className='diaper-count__btn' onClick={() => onCountChange(count + 1)}>
            <Text className='diaper-count__btn-text'>+</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
