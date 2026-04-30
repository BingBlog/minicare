import { View, Text } from '@tarojs/components'

const POOP_ITEMS: { key: string; label: string; dot: string }[] = [
  { key: 'normal', label: '正常', dot: '#F5C842' },
  { key: 'loose', label: '稀便', dot: '#8BC34A' },
  { key: 'watery', label: '水样便', dot: '#64B5F6' },
  { key: 'hard', label: '干硬粒', dot: '#B0B0B0' },
  { key: 'bloody', label: '血丝便', dot: '#EF5350' },
]

const COLOR_CHIPS: { key: string; label: string; dot: string }[] = [
  { key: 'yellow', label: '黄色', dot: '#F5C518' },
  { key: 'brown_yellow', label: '棕黄', dot: '#B8860B' },
  { key: 'green', label: '绿色', dot: '#4CAF82' },
]

interface Props {
  poopType: string | null
  onPoopTypeChange: (key: string | null) => void
  colorSelected: Set<string>
  onToggleColor: (key: string) => void
}

interface TagChipProps {
  dot: string
  label: string
  selected: boolean
  onClick: () => void
  activeColor?: string
  activeBg?: string
  activeBorder?: string
}

function TagChip({ dot, label, selected, onClick, activeColor = '#C05020', activeBg = '#FFF5EE', activeBorder = '#E8A070' }: TagChipProps) {
  return (
    <View
      className={`diaper-tag ${selected ? 'diaper-tag--active' : ''}`}
      style={selected ? { borderColor: activeBorder, background: activeBg, color: activeColor } : {}}
      onClick={onClick}
    >
      <View className='diaper-tag__dot' style={{ background: dot, opacity: selected ? 1 : 0.55 }} />
      <Text className='diaper-tag__label' style={selected ? { color: activeColor } : {}}>{label}</Text>
    </View>
  )
}

export default function PoopSection({ poopType, onPoopTypeChange, colorSelected, onToggleColor }: Props) {
  return (
    <View className='diaper-card'>
      <View className='diaper-card__head'>
        <Text className='diaper-card__head-icon'>!</Text>
        <Text className='diaper-card__head-title'>大便性状</Text>
        <Text className='diaper-card__head-optional'>可不选</Text>
      </View>

      <View className='diaper-tags'>
        {POOP_ITEMS.map(({ key, label, dot }) => (
          <TagChip
            key={key}
            dot={dot}
            label={label}
            selected={poopType === key}
            onClick={() => onPoopTypeChange(poopType === key ? null : key)}
            activeColor='#C05020'
            activeBg='#FFF5EE'
            activeBorder='#E8A070'
          />
        ))}
      </View>

      <View className='diaper-color-row'>
        <Text className='diaper-color-row__label'>颜色</Text>
        <View className='diaper-tags diaper-tags--inline'>
          {COLOR_CHIPS.map(({ key, label, dot }) => (
            <TagChip
              key={key}
              dot={dot}
              label={label}
              selected={colorSelected.has(key)}
              onClick={() => onToggleColor(key)}
              activeColor='#F87098'
              activeBg='#FFF0F4'
              activeBorder='#F4A8C0'
            />
          ))}
        </View>
      </View>
    </View>
  )
}
