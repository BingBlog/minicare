import { View, Text } from '@tarojs/components'
import { getStatusBarHeight } from '@/lib/safeArea'
import type { BabyStat, BabyStatPart } from './types'

interface HeroSectionProps {
  babyName: string
  babyAgeText: string
  greeting: string
  dateText: string
  stats: BabyStat[]
  banners?: JSX.Element | null
  onStatsClick?: () => void
}

export default function HeroSection(props: HeroSectionProps) {
  const { babyName, babyAgeText, greeting, dateText, stats, banners, onStatsClick } = props

  const renderStatValue = (item: BabyStat) => {
    if (item.parts && item.parts.length > 0) {
      return (
        <View className='home-stats__value'>
          {item.parts.map((p: BabyStatPart, i: number) => (
            <Text key={i} className={p.small ? 'home-stats__small' : ''}>{p.text}</Text>
          ))}
        </View>
      )
    }
    return (
      <View className='home-stats__value'>
        <Text>{item.val}</Text>
        <Text className='home-stats__unit'>{item.unit}</Text>
      </View>
    )
  }

  return (
    <View className='home-hero' style={{ paddingTop: `${getStatusBarHeight() + 8}px` }}>
      <View className='home-hero__decor home-hero__decor--big' />
      <View className='home-hero__decor home-hero__decor--small' />

      <View className='home-hero__head'>
        <View>
          <Text className='home-hero__date'>{dateText}</Text>
        </View>
      </View>

      <View className='home-baby-card'>
        <View className='home-baby-card__info'>
          <View className='home-baby-card__name-row'>
            <Text className='home-baby-card__greeting'>{greeting}，</Text>
            <Text className='home-baby-card__name'>{babyName}</Text>
          </View>
          <Text className='home-baby-card__age'>{babyAgeText}</Text>
        </View>

        <View className='home-baby-card__stats'>
          {stats.map((item) => (
            <View className='home-baby-card__stat-item' key={item.label} onClick={onStatsClick}>
              {renderStatValue(item)}
              <Text className='home-baby-card__stat-label'>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {banners}
    </View>
  )
}

