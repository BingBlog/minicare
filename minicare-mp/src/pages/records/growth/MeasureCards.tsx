/**
 * 生长记录 - 测量数据预览卡片（3列，与 Web 1:1 对齐）
 */
import { View, Text } from '@tarojs/components'

export type MeasureKey = 'height' | 'weight' | 'head'

interface MeasureCardDef {
  key: MeasureKey
  label: string
  unit: string
  color: string
  value: string
}

interface Props {
  height: string
  weight: string
  head: string
  activeCard: MeasureKey | null
  onActivate: (key: MeasureKey | null) => void
}

const HeightIcon = () => (
  <View className='growth-cards__icon'>
    <View className='growth-cards__icon-bar' style={{ background: '#9B8ED8' }} />
    <View className='growth-cards__icon-bar' style={{ background: '#9B8ED8', height: '3px', width: '12px', position: 'absolute', top: 0 }} />
    <View className='growth-cards__icon-bar' style={{ background: '#9B8ED8', height: '3px', width: '12px', position: 'absolute', bottom: 0 }} />
  </View>
)

const WeightIcon = () => (
  <View className='growth-cards__icon'>
    <View className='growth-cards__icon-circle' style={{ borderColor: '#F0B8C8' }} />
    <View style={{ width: '10px', height: '2px', background: '#F0B8C8', position: 'absolute', bottom: '2px' }} />
  </View>
)

const HeadIcon = () => (
  <View className='growth-cards__icon'>
    <View className='growth-cards__icon-circle' style={{ borderColor: '#B8D8C8' }} />
  </View>
)

export default function MeasureCards({ height, weight, head, activeCard, onActivate }: Props) {
  const cards: MeasureCardDef[] = [
    { key: 'height', label: '身高/身长', unit: 'cm', color: '#9B8ED8', value: height },
    { key: 'weight', label: '体重', unit: 'kg', color: '#F0B8C8', value: weight },
    { key: 'head', label: '头围', unit: 'cm', color: '#B8D8C8', value: head },
  ]

  return (
    <View className='growth-cards'>
      {cards.map(({ key, label, unit, color, value }) => {
        const active = activeCard === key
        return (
          <View
            key={key}
            className={`growth-card ${active ? 'growth-card--active' : ''}`}
            style={{
              borderColor: active ? color : 'transparent',
              background: active ? color + '18' : '#fff',
            }}
            onClick={() => onActivate(active ? null : key)}
          >
            <View className='growth-card__icon-wrap'>
              {key === 'height' && <HeightIcon />}
              {key === 'weight' && <WeightIcon />}
              {key === 'head' && <HeadIcon />}
            </View>
            <Text className='growth-card__value'>{value || '--'}</Text>
            <Text className='growth-card__unit'>{unit}</Text>
            <Text
              className='growth-card__label'
              style={{
                color: active ? color : '#9A8090',
                fontWeight: active ? 600 : 400,
              }}
            >
              {label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
