import { View, Text } from '@tarojs/components'

export type ButtCondition = 'normal' | 'slightly_red' | 'rash' | 'severe_rash' | 'fungal' | 'other'

const BUTT_ITEMS: {
  key: ButtCondition
  label: string
  dot: string
  activeColor: string
  activeBg: string
  activeBorder: string
}[] = [
  { key: 'normal', label: '正常', dot: '#4CAF82', activeColor: '#2A9060', activeBg: '#EEF9F3', activeBorder: '#7ACCA0' },
  { key: 'slightly_red', label: '轻微发红', dot: '#FFB74D', activeColor: '#B07820', activeBg: '#FFF8EE', activeBorder: '#FFCA80' },
  { key: 'rash', label: '红屁屁', dot: '#F87098', activeColor: '#D04060', activeBg: '#FFF0F4', activeBorder: '#F4A0B8' },
  { key: 'severe_rash', label: '严重红屁屁', dot: '#E53935', activeColor: '#B82020', activeBg: '#FFF0F0', activeBorder: '#E88080' },
  { key: 'fungal', label: '疑似感染', dot: '#9C6FD0', activeColor: '#6A3A96', activeBg: '#F5F0FC', activeBorder: '#C09ADC' },
  { key: 'other', label: '其他异常', dot: '#90A4AE', activeColor: '#5A7480', activeBg: '#F2F6F8', activeBorder: '#A8C0C8' },
]

interface Props {
  value: ButtCondition | null
  onChange: (key: ButtCondition | null) => void
}

export default function ButtConditionSection({ value, onChange }: Props) {
  return (
    <View className='diaper-card'>
      <View className='diaper-card__head'>
        <Text className='diaper-card__head-icon'>v</Text>
        <Text className='diaper-card__head-title'>屁屁状态</Text>
        <Text className='diaper-card__head-optional'>可不选</Text>
      </View>

      <View className='diaper-tags'>
        {BUTT_ITEMS.map(({ key, label, dot, activeColor, activeBg, activeBorder }) => {
          const isSelected = value === key
          return (
            <View
              key={key}
              className={`diaper-tag ${isSelected ? 'diaper-tag--active' : ''}`}
              style={isSelected ? { borderColor: activeBorder, background: activeBg, color: activeColor } : {}}
              onClick={() => onChange(isSelected ? null : key)}
            >
              <View className='diaper-tag__dot' style={{ background: dot, opacity: isSelected ? 1 : 0.5 }} />
              <Text className='diaper-tag__label' style={isSelected ? { color: activeColor } : {}}>{label}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
