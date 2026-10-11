import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { FoodObservation } from '@/api'

interface AllergyProgressBarProps {
  observations: FoodObservation[]
}

/**
 * 首页「排敏进度」提醒 Bar
 *
 * 可见性规则（2026-10-11 调整）：仅当宝宝已有排敏任务（含历史）时渲染整条 Bar。
 * 从未有过任何排敏任务（新用户 / 小月龄尚未添加辅食的宝宝）→ 直接返回 null，连空态都不出现，
 * 避免新用户一进首页就见到无用的「暂无排敏任务」。
 * 首个任务会在保存辅食记录时由服务端自动创建（feeding 联动），Bar 随之出现。
 *
 * - 有观察中任务：展示前 2 项进度摘要（多则「另有 N 项」）
 * - 仅有历史任务（全部已耐受/过敏/停用）：展示「暂无排敏任务，去添加」引导
 */
export default function AllergyProgressBar({ observations }: AllergyProgressBarProps) {
  const activeObservations = observations.filter((o) => o.status === 'observing')

  // 从未创建过任何排敏任务 → 整条不渲染（新用户/小月龄宝首页不再出现该 Bar）
  if (observations.length === 0) return null

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
      <Text className='home-inline-banner__action--allergy'>
        {activeObservations.length === 0 ? '去添加' : '去查看'}
      </Text>
    </View>
  )
}
