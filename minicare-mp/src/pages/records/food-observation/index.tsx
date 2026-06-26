import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useCallback, useRef } from 'react'
import { foodObservationApi } from '@/api'
import type { FoodObservation, ObservationStatus } from '@/api'
import { getStoredFamilyId, getStoredBabyId } from '@/api/http'
import { OBSERVATION_STATUS_CFG } from '@/lib/constants'
import { getStatusBarHeight } from '@/lib/safeArea'
import { useIsIPad } from '@/lib/useIsIPad'
import './index.scss'

type FilterKey = 'all' | ObservationStatus

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'observing', label: '观察中' },
  { key: 'paused', label: '已停用' },
  { key: 'safe', label: '已耐受' },
  { key: 'suspected', label: '疑似' },
  { key: 'allergic', label: '确认过敏' },
]

function getProgressText(item: FoodObservation): string {
  if (item.status === 'safe') return '已耐受'
  if (item.status === 'allergic') return '确认过敏'
  if (item.status === 'suspected') return '疑似过敏'
  if (item.status === 'paused') return '已停用'
  if (item.current_day != null && item.observation_days > 0) {
    return `Day${item.current_day}/${item.observation_days}`
  }
  return '待开始'
}

function getDotFillClass(item: FoodObservation): string {
  if (item.status === 'safe') return 'obs-card__dot--filled-safe'
  if (item.status === 'allergic') return 'obs-card__dot--filled-allergic'
  if (item.status === 'suspected') return 'obs-card__dot--filled-suspected'
  return 'obs-card__dot--filled'
}

export default function FoodObservationBoardPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => isIPad ? `${base} is-ipad` : base
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<FoodObservation[]>([])
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const filterRef = useRef<FilterKey>('all')

  const loadList = useCallback(async (filterStatus?: ObservationStatus) => {
    const familyId = getStoredFamilyId()
    const babyId = getStoredBabyId()
    if (!familyId || !babyId) {
      setLoading(false)
      return
    }
    try {
      const data = await foodObservationApi.list(familyId, babyId, filterStatus)
      setItems(data)
    } catch {
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [])

  useDidShow(() => {
    setLoading(true)
    const status = filterRef.current === 'all' ? undefined : filterRef.current
    loadList(status)
  })

  const handleFilterChange = (key: FilterKey) => {
    setActiveFilter(key)
    filterRef.current = key
    setLoading(true)
    const status = key === 'all' ? undefined : key
    loadList(status)
  }

  const handleCardClick = (item: FoodObservation) => {
    Taro.navigateTo({ url: `/pages/records/food-observation/detail?id=${item.id}` })
  }

  if (loading) {
    return (
      <View className={cls('obs-page')}>
        <View className='obs-loading'><Text>加载中...</Text></View>
      </View>
    )
  }

  return (
    <View className={cls('obs-page')}>
      <View className='obs-nav' style={{ paddingTop: `${getStatusBarHeight() + 10}px` }}>
        <View className='obs-nav__back' onClick={() => Taro.navigateBack()}>
          <Text className='obs-nav__back-arrow'>{'<'}</Text>
        </View>
        <Text className='obs-nav__title'>排敏看板</Text>
        <View className='obs-nav__spacer' />
      </View>

      <View className='obs-body'>
        <ScrollView scrollX className='obs-filters'>
          {FILTER_OPTIONS.map((opt) => (
            <View
              key={opt.key}
              className={`obs-filter-chip ${activeFilter === opt.key ? 'obs-filter-chip--active' : ''}`}
              onClick={() => handleFilterChange(opt.key)}
            >
              <Text className='obs-filter-chip__text'>{opt.label}</Text>
            </View>
          ))}
        </ScrollView>

        {items.length === 0 ? (
          <View className='obs-empty'>
            <View className='obs-empty__icon'>
              <Text className='obs-empty__icon-text'>--</Text>
            </View>
            <Text className='obs-empty__title'>暂无排敏记录</Text>
            <Text className='obs-empty__subtitle'>在添加辅食时可以开启排敏观察</Text>
          </View>
        ) : (
          <View className='obs-list'>
            {items.map((item) => {
              const cfg = OBSERVATION_STATUS_CFG[item.status]
              const totalDays = item.observation_days || 3
              const currentDay = item.current_day || 0
              const dotFillCls = getDotFillClass(item)

              return (
                <View
                  key={item.id}
                  className='obs-card'
                  onClick={() => handleCardClick(item)}
                >
                  <View className='obs-card__head'>
                    <Text className='obs-card__food'>{item.food_name}</Text>
                    {cfg && (
                      <View
                        className='obs-card__badge'
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        <Text>{cfg.label}</Text>
                      </View>
                    )}
                  </View>

                  <View className='obs-card__matrix'>
                    <View className='obs-card__dots'>
                      {Array.from({ length: totalDays }, (_, i) => {
                        const dayNum = i + 1
                        const filled = dayNum <= currentDay
                        return (
                          <View
                            key={dayNum}
                            className={`obs-card__dot ${filled ? dotFillCls : ''}`}
                          >
                            <Text className='obs-card__dot-text'>{dayNum}</Text>
                          </View>
                        )
                      })}
                    </View>
                  </View>

                  <View className='obs-card__footer'>
                    <Text className='obs-card__progress'>{getProgressText(item)}</Text>
                    {item.first_intro_at && (
                      <Text className='obs-card__date'>
                        {item.first_intro_at.slice(0, 10)}
                      </Text>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>
    </View>
  )
}
