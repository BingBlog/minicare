import { View, Text } from '@tarojs/components'
import type { BabyStat } from './types'

interface HeroSectionProps {
  babyName: string
  babyAgeText: string
  greeting: string
  dateText: string
  stats: BabyStat[]
}

export default function HeroSection(props: HeroSectionProps) {
  const { babyName, babyAgeText, greeting, dateText, stats } = props

  return (
    <View className='home-hero'>
      <View className='home-hero__decor home-hero__decor--big' />
      <View className='home-hero__decor home-hero__decor--small' />

      <View className='home-hero__head'>
        <View>
          <Text className='home-hero__date'>{dateText}</Text>
          <Text className='home-hero__greeting'>{greeting}</Text>
        </View>
        <View className='home-hero__avatar'>
          <Text className='home-hero__avatar-text'>我</Text>
        </View>
      </View>

      <View className='home-baby-card'>
        <Text className='home-baby-card__name'>{babyName}</Text>
        <Text className='home-baby-card__sub'>{babyAgeText}</Text>
      </View>

      <View className='home-stats'>
        {stats.map((item) => (
          <View className='home-stats__item' key={item.label}>
            <View className='home-stats__value'>
              <Text>{item.val}</Text>
              <Text className='home-stats__unit'>{item.unit}</Text>
            </View>
            <Text className='home-stats__label'>{item.label}</Text>
          </View>
        ))}
      </View>
      <View className='home-hero__bottom-mask' />
    </View>
  )
}

