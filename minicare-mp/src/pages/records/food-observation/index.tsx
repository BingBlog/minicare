import { View, Text, ScrollView, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useCallback, useRef, useMemo } from 'react'
import { foodObservationApi } from '@/api'
import type { FoodObservation, ObservationStatus } from '@/api'
import { getStoredFamilyId, getStoredBabyId } from '@/api/http'
import { OBSERVATION_STATUS_CFG } from '@/lib/constants'
import { COMMON_FOOD_GROUPS, FOOD_STATUS_STYLE } from '@/pages/records/feeding/types'
import { getStatusBarHeight, getCapsuleRightPadding } from '@/lib/safeArea'
import { useIsIPad } from '@/lib/useIsIPad'
import dayjs from 'dayjs'
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

/** 标签内显示的文字 */
function getTagText(item: FoodObservation, dayNum: number, filled: boolean, isCurrentDay: boolean): string {
  if (!filled) return `D${dayNum}`
  // 已完成的天数，根据最终状态显示文字
  if (item.status === 'safe') return `D${dayNum} ✓`
  if (item.status === 'allergic') return `D${dayNum} ✗`
  if (item.status === 'suspected') return `D${dayNum} !`
  // 观察中：当天显示"D2"，已完成天数显示"D1 ✓"
  if (isCurrentDay) return `D${dayNum}`
  return `D${dayNum} ✓`
}

/** 标签的颜色样式类 */
function getTagCls(item: FoodObservation, filled: boolean, isCurrentDay: boolean): string {
  if (!filled) return 'obs-card__tag--future'
  // 已完成状态（非 observing）所有天数统一颜色
  if (item.status === 'safe') return 'obs-card__tag--safe'
  if (item.status === 'allergic') return 'obs-card__tag--allergic'
  if (item.status === 'suspected') return 'obs-card__tag--suspected'
  if (item.status === 'paused') return 'obs-card__tag--paused'
  // 观察中：当天=黄色，已完成天数=绿色
  if (isCurrentDay) return 'obs-card__tag--current'
  return 'obs-card__tag--done'
}

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

export default function FoodObservationBoardPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => isIPad ? `${base} is-ipad` : base
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<FoodObservation[]>([])
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const filterRef = useRef<FilterKey>('all')

  // ── 胶囊按钮避让 ──
  const capsuleLayout = useMemo(() => {
    try {
      const menuBtn = Taro.getMenuButtonBoundingClientRect()
      const sysInfo = Taro.getSystemInfoSync()
      const statusBarHeight = sysInfo.statusBarHeight || 0
      const paddingTop = menuBtn.top
      const headerHeight = menuBtn.height + (menuBtn.top - statusBarHeight) * 2
      const rightWidth = getCapsuleRightPadding()
      return { paddingTop, headerHeight, rightWidth }
    } catch {
      return { paddingTop: getStatusBarHeight(), headerHeight: 44, rightWidth: 0 }
    }
  }, [])

  // ── 添加排敏任务 ──
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [addFoodInput, setAddFoodInput] = useState('')
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addDate, setAddDate] = useState(dayjs().format('YYYY-MM-DD'))

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

  // ── 创建排敏任务 ──
  const handleAddTask = async (foodName: string) => {
    const familyId = getStoredFamilyId()
    const babyId = getStoredBabyId()
    if (!familyId || !babyId) return
    setAddSubmitting(true)
    try {
      const result = await foodObservationApi.createOrReuse(familyId, {
        baby_id: babyId,
        food_name: foodName,
        first_intro_at: addDate,
      })
      if (result.reused) {
        Taro.showToast({ title: `${foodName} 已有排敏任务`, icon: 'none' })
      } else {
        Taro.showToast({ title: '排敏任务已创建', icon: 'success' })
      }
      setAddSheetOpen(false)
      setAddFoodInput('')
      setAddDate(dayjs().format('YYYY-MM-DD'))
      // 刷新列表
      setLoading(true)
      const status = filterRef.current === 'all' ? undefined : filterRef.current
      loadList(status)
      Taro.eventCenter.trigger('home:refresh')
    } catch {
      Taro.showToast({ title: '创建失败', icon: 'none' })
    } finally {
      setAddSubmitting(false)
    }
  }

  const handleAddSubmit = () => {
    const name = addFoodInput.trim()
    if (!name) {
      Taro.showToast({ title: '请输入辅食名称', icon: 'none' })
      return
    }
    handleAddTask(name)
  }

  // 收集所有已有的排敏食物名，防止重复添加；构建状态查找表
  const existingNames = new Set(items.map((i) => i.food_name))
  const fedMap = new Map<string, ObservationStatus>()
  for (const i of items) fedMap.set(i.food_name, i.status)

  if (loading) {
    return (
      <View className={cls('obs-page')}>
        <View className='obs-loading'><Text>加载中...</Text></View>
      </View>
    )
  }

  return (
    <View className={cls('obs-page')}>
      {/* ── 导航栏 ── */}
      <View
        className='obs-nav'
        style={{
          paddingTop: `${capsuleLayout.paddingTop}px`,
          minHeight: `${capsuleLayout.paddingTop + capsuleLayout.headerHeight}px`,
        }}
      >
        <View className='obs-nav__back' onClick={() => Taro.navigateBack()}>
          <Text className='obs-nav__back-arrow'>{'<'}</Text>
        </View>
        <Text className='obs-nav__title'>排敏看板</Text>
        <Text
          className='obs-nav__add'
          onClick={() => setAddSheetOpen(true)}
        >添加</Text>
      </View>

      <View className='obs-body'>
        {/* ── 筛选标签 ── */}
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

        {/* ── 排敏列表 ── */}
        {items.length === 0 ? (
          <View className='obs-empty'>
            <View className='obs-empty__icon'>
              <Text className='obs-empty__icon-text'>--</Text>
            </View>
            <Text className='obs-empty__title'>暂无排敏记录</Text>
            <Text className='obs-empty__subtitle'>点击右上角「添加」可创建排敏任务</Text>
            <View className='obs-empty__action' onClick={() => setAddSheetOpen(true)}>
              <Text className='obs-empty__action-text'>添加排敏任务</Text>
            </View>
          </View>
        ) : (
          <View className='obs-list'>
            {items.map((item) => {
              const cfg = OBSERVATION_STATUS_CFG[item.status]
              const totalDays = item.observation_days || 3
              const currentDay = item.current_day || 0

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

                  <View className='obs-card__tags'>
                    {Array.from({ length: totalDays }, (_, i) => {
                      const dayNum = i + 1
                      const filled = dayNum <= currentDay
                      const isCurrentDay = filled && dayNum === currentDay && item.status === 'observing'
                      return (
                        <View
                          key={dayNum}
                          className={`obs-card__tag ${getTagCls(item, filled, isCurrentDay)}`}
                        >
                          <Text className='obs-card__tag-text'>{getTagText(item, dayNum, filled, isCurrentDay)}</Text>
                        </View>
                      )
                    })}
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

      {/* ── 添加排敏任务弹层 ── */}
      {addSheetOpen && (
        <View className='obs-add-sheet'>
          <View className='obs-add-sheet__mask' onClick={() => { setAddSheetOpen(false); setAddFoodInput('') }} />
          <View className='obs-add-sheet__panel'>
            <View className='obs-add-sheet__header'>
              <Text className='obs-add-sheet__title'>添加排敏任务</Text>
              <View className='obs-add-sheet__close' onClick={() => { setAddSheetOpen(false); setAddFoodInput('') }}>
                <Text className='obs-add-sheet__close-text'>x</Text>
              </View>
            </View>

            {/* 日期选择 */}
            <View className='obs-add-sheet__date-row'>
              <Text className='obs-add-sheet__date-label'>首次引入日期</Text>
              <Picker
                mode='date'
                value={addDate}
                end={dayjs().format('YYYY-MM-DD')}
                onChange={(e) => setAddDate(e.detail.value)}
              >
                <View className='obs-add-sheet__date-value'>
                  <Text>{dayjs(addDate).format('YYYY年MM月DD日')}</Text>
                  <Text className='obs-add-sheet__date-arrow'>{'>'}</Text>
                </View>
              </Picker>
            </View>

            {/* 输入框 — 与辅食记录页一致 */}
            <View className='feed-food-input-row'>
              <Input
                className='feed-food-input'
                placeholder='输入辅食名称，如：生菜、虾滑'
                value={addFoodInput}
                onInput={(e) => setAddFoodInput(e.detail.value)}
                onConfirm={handleAddSubmit}
              />
              <View
                className={`feed-food-add${addSubmitting ? ' feed-food-add--loading' : ''}`}
                onClick={addSubmitting ? undefined : handleAddSubmit}
              >
                <Text className='feed-food-add__text'>{addSubmitting ? '...' : '+'}</Text>
              </View>
            </View>

            {/* 预设辅食清单 — 与辅食记录页一致布局和标记 */}
            <View className='feed-food-presets'>
              {COMMON_FOOD_GROUPS.map((group) => (
                <View key={group.key} className='feed-food-presets__group'>
                  <Text className='feed-food-presets__title'>{group.label}</Text>
                  <View className='feed-food-presets__chips'>
                    {group.items.map((item) => {
                      const exists = existingNames.has(item)
                      const fedStatus = fedMap.get(item)
                      const styleCfg = fedStatus ? FOOD_STATUS_STYLE[fedStatus] : undefined
                      const isAllergic = fedStatus === 'allergic' || fedStatus === 'suspected'
                      return (
                        <View
                          key={item}
                          className={`feed-food-presets__chip${exists ? ' is-active' : ''}${isAllergic ? ' is-allergic' : ''}`}
                          onClick={exists ? undefined : () => handleAddTask(item)}
                        >
                          {fedStatus && (
                            <View
                              className='feed-food-presets__chip-dot'
                              style={{ background: styleCfg?.color ?? '#9A8090' }}
                            />
                          )}
                          <Text className='feed-food-presets__chip-text'>{item}</Text>
                          {exists && <Text className='feed-food-presets__chip-badge'>已有</Text>}
                        </View>
                      )
                    })}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
