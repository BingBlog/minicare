import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { FoodObservation } from '@/api'

interface AllergyProgressBarProps {
  observations: FoodObservation[]
}

export default function AllergyProgressBar({ observations }: AllergyProgressBarProps) {
  const activeObservations = observations.filter((o) => o.status === 'observing')

  const handleClick = () => {
    Taro.navigateTo({ url: '/pages/records/food-observation/index' })
  }

  const renderContent = () => {
    if (activeObservations.length === 0) {
      return (
        <Text className='home-inline-banner__desc'>暂无排敏任务，去添加</Text>
      )
    }

    const displayItems = activeObservations.slice(0, 2)
    const extraCount = activeObservations.length - 2

    return (
      <View className='home-inline-banner__content-inner'>
        {displayItems.map((obs) => (
          <Text key={obs.id} className='home-inline-banner__tag'>
            {obs.food_name} Day{obs.current_day ?? 1}/{obs.observation_days}
          </Text>
        ))}
        {extraCount > 0 && (
          <Text className='home-inline-banner__tag home-inline-banner__tag--more'>
            另有{extraCount}项
          </Text>
        )}
      </View>
    )
  }

  return (
    <View className='home-inline-banner home-inline-banner--allergy' onClick={handleClick}>
      <View className='home-inline-banner__dot home-inline-banner__dot--allergy' />
      <View className='home-inline-banner__content'>
        <Text className='home-inline-banner__title'>排敏进度</Text>
        {renderContent()}
      </View>
      <Text className='home-inline-banner__arrow'>{'>'}</Text>
    </View>
  )
}
