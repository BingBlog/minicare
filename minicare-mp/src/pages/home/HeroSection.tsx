import { View, Text, Image } from '@tarojs/components'
import { getStatusBarHeight } from '@/lib/safeArea'
import { ICON_BABY_PLACEHOLDER } from '@/assets/icons/svgDataUris'
import type { BabyStat, BabyStatPart } from './types'

interface HeroSectionProps {
  babyName: string
  babyAgeText: string
  greeting: string
  /** 宝宝头像展示 URL（临时 URL，由页面层解析；空则显示占位） */
  avatarUrl?: string | null
  stats: BabyStat[]
  banners?: JSX.Element | null
  onStatsClick?: () => void
}

export default function HeroSection(props: HeroSectionProps) {
  const { babyName, babyAgeText, greeting, avatarUrl, stats, banners, onStatsClick } = props

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

      <View className='home-baby-card home-baby-card--hero'>
        {/* 日期不在此展示：手机系统状态栏已含时间信息，避免重复 */}
        {/* 头像 + 问候 + 年龄：行内一组 */}
        <View className='home-baby-card__profile'>
          <View className='home-baby-card__avatar'>
            {avatarUrl ? (
              <Image className='home-baby-card__avatar-img' src={avatarUrl} mode='aspectFill' />
            ) : (
              <Image src={ICON_BABY_PLACEHOLDER} style={{ width: '26px', height: '26px' }} />
            )}
          </View>
          <View className='home-baby-card__info'>
            <View className='home-baby-card__name-row'>
              <Text className='home-baby-card__greeting'>{greeting}，</Text>
              <Text className='home-baby-card__name'>{babyName}</Text>
            </View>
            <Text className='home-baby-card__age'>{babyAgeText}</Text>
          </View>
        </View>

        <View className='home-baby-card__stats'>
          {stats.map((item) => (
            <View
              className='home-baby-card__stat-item'
              hoverClass='home-baby-card__stat-item--pressed'
              key={item.label}
              onClick={onStatsClick}
            >
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

