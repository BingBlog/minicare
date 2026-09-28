import { View, Text, Input } from '@tarojs/components'
import { COMMON_FOOD_GROUPS, FOOD_STATUS_STYLE, isPresetFood } from './types'
import type { ObservationStatus } from '@/api/foodObservation'

/** 已喂养过的辅食条目（来自排敏观察记录） */
export interface FedFoodInfo {
  foodName: string
  status: ObservationStatus
}

interface Props {
  foodList: string[]
  inputValue: string
  onInputChange: (v: string) => void
  onAdd: () => void
  onRemove: (idx: number) => void
  onQuickAdd: (foodName: string) => void
  fedFoods: FedFoodInfo[]
}

export default function FoodSection({
  foodList,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
  onQuickAdd,
  fedFoods,
}: Props) {
  // 已喂养食物的查找表（用于标记预设 chip）
  const fedMap = new Map<string, ObservationStatus>()
  for (const f of fedFoods) fedMap.set(f.foodName, f.status)

  // 历史辅食 = 已喂养过的 + 不在预设清单中的（即手动输入过的）
  const customHistory = fedFoods.filter((f) => !isPresetFood(f.foodName))

  return (
    <>
      <View className='feed-section-label'><Text>辅食记录</Text></View>

      {/* ── 1. 手动输入框（最前面） ── */}
      <View className='feed-card'>
        <View className='feed-food-input-row'>
          <Input
            className='feed-food-input'
            placeholder='输入辅食名称，如：生菜、虾滑'
            value={inputValue}
            onInput={(e) => onInputChange(e.detail.value)}
            onConfirm={onAdd}
          />
          <View className='feed-food-add' onClick={onAdd}>
            <Text className='feed-food-add__text'>+</Text>
          </View>
        </View>
      </View>

      {/* ── 2. 已选辅食 ── */}
      {foodList.length > 0 && (
        <View className='feed-card'>
          <View className='feed-food-chips'>
            {foodList.map((food, idx) => {
              const fedStatus = fedMap.get(food)
              const styleCfg = fedStatus ? FOOD_STATUS_STYLE[fedStatus] : undefined
              return (
                <View key={idx} className='feed-food-chip'>
                  <Text className='feed-food-chip__text'>{food}</Text>
                  {styleCfg && (
                    <Text className='feed-food-chip__status' style={{ color: styleCfg.color }}>
                      {styleCfg.label}
                    </Text>
                  )}
                  <View className='feed-food-chip__del' onClick={() => onRemove(idx)}>
                    <Text className='feed-food-chip__del-text'>x</Text>
                  </View>
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* ── 3. 历史辅食快捷选择（手动输入过的食物） ── */}
      {customHistory.length > 0 && (
        <View className='feed-card'>
          <View className='feed-food-history'>
            <Text className='feed-food-history__title'>最近喂过的</Text>
            <View className='feed-food-history__chips'>
              {customHistory.map((f) => {
                const selected = foodList.includes(f.foodName)
                const styleCfg = FOOD_STATUS_STYLE[f.status]
                return (
                  <View
                    key={f.foodName}
                    className={`feed-food-history__chip${selected ? ' is-active' : ''}`}
                    onClick={() => onQuickAdd(f.foodName)}
                  >
                    <Text className='feed-food-history__chip-text'>{f.foodName}</Text>
                    {styleCfg && (
                      <Text
                        className='feed-food-history__chip-status'
                        style={{ color: styleCfg.color }}
                      >
                        {styleCfg.label}
                      </Text>
                    )}
                  </View>
                )
              })}
            </View>
          </View>
        </View>
      )}

      {/* ── 4. 预设辅食清单（带喂养/过敏标记） ── */}
      <View className='feed-card'>
        <View className='feed-food-presets'>
          {COMMON_FOOD_GROUPS.map((group) => (
            <View key={group.key} className='feed-food-presets__group'>
              <Text className='feed-food-presets__title'>{group.label}</Text>
              <View className='feed-food-presets__chips'>
                {group.items.map((item) => {
                  const selected = foodList.includes(item)
                  const fedStatus = fedMap.get(item)
                  const styleCfg = fedStatus ? FOOD_STATUS_STYLE[fedStatus] : undefined
                  const isAllergic = fedStatus === 'allergic' || fedStatus === 'suspected'
                  return (
                    <View
                      key={item}
                      className={`feed-food-presets__chip${selected ? ' is-active' : ''}${isAllergic ? ' is-allergic' : ''}`}
                      onClick={() => onQuickAdd(item)}
                    >
                      {fedStatus && (
                        <View
                          className='feed-food-presets__chip-dot'
                          style={{ background: styleCfg?.color ?? '#9A8090' }}
                        />
                      )}
                      <Text className='feed-food-presets__chip-text'>{item}</Text>
                      {fedStatus && (
                        <Text className='feed-food-presets__chip-badge'>已有</Text>
                      )}
                    </View>
                  )
                })}
              </View>
            </View>
          ))}
        </View>
      </View>
    </>
  )
}
