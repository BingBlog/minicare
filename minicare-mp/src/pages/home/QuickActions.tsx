import { View, Text, Image } from '@tarojs/components'
import { RECORD_TYPE_ICON_SRC } from '@/assets/icons/recordTypeIcons'
import { ALL_QUICK_ACTION_KEYS, GLOBAL_FAB_GROUPS, RECORD_TYPE_CFG } from '@/lib/constants'
import { MAX_QUICK_KEYS, useQuickActionKeys } from '@/lib/useQuickActionKeys'

interface QuickActionsProps {
  birthDate?: string | null
  onMoreClick: () => void
  onAction?: (key: string) => void
  fabCount?: number
}

function ActionIcon({ actionKey }: { actionKey: string }) {
  const cfg = RECORD_TYPE_CFG[actionKey]
  const src = RECORD_TYPE_ICON_SRC[actionKey]
  return (
    <View className='home-quick-icon' style={{ background: cfg?.bg ?? '#FFF0F4' }}>
      {src ? (
        <Image className='home-quick-icon__img' src={src} mode='aspectFit' />
      ) : (
        <Text className='home-quick-icon__fallback'>记</Text>
      )}
    </View>
  )
}

export default function QuickActions({ birthDate, onMoreClick, onAction, fabCount = 5 }: QuickActionsProps) {
  const {
    initialized,
    aKeys,
    bKeys,
    isEditing,
    startEditing,
    saveEditing,
    cancelEditing,
    removeKey,
    addKey,
    moveKey,
  } = useQuickActionKeys(birthDate)

  const currentKeys = [...aKeys, ...bKeys]
  const poolKeys = (ALL_QUICK_ACTION_KEYS as readonly string[]).filter((key) => !currentKeys.includes(key))
  const canAdd = currentKeys.length < MAX_QUICK_KEYS

  if (!initialized) return null

  return (
    <View className='home-card'>
      <View className='home-card__head'>
        <Text className='home-card__title'>快捷记录</Text>
        {isEditing ? (
          <View className='home-card__actions'>
            <Text className='home-card__mute' onClick={cancelEditing}>
              取消
            </Text>
            <Text className='home-card__hint' onClick={saveEditing}>
              完成
            </Text>
          </View>
        ) : (
          <View className='home-card__actions'>
            <Text className='home-card__mute' onClick={startEditing}>
              编辑
            </Text>
            <Text className='home-card__hint' onClick={onMoreClick}>更多 ({fabCount}) ›</Text>
          </View>
        )}
      </View>

      {!isEditing && (
        <>
          <View className='home-quick-grid home-quick-grid--top'>
            {aKeys.map((key) => {
              const cfg = RECORD_TYPE_CFG[key]
              if (!cfg) return null
              return (
                <View className='home-quick-grid__item home-quick-grid__item--top' key={key} onClick={() => onAction?.(key)}>
                  <ActionIcon actionKey={key} />
                  <Text className='home-quick-grid__text'>{cfg.label}</Text>
                </View>
              )
            })}
          </View>

          <View className='home-quick-grid home-quick-grid--bottom'>
            {bKeys.map((key) => {
              const cfg = RECORD_TYPE_CFG[key]
              if (!cfg) return null
              return (
                <View className='home-quick-grid__item home-quick-grid__item--bottom' key={key} onClick={() => onAction?.(key)}>
                  <ActionIcon actionKey={key} />
                  <Text className='home-quick-grid__text'>{cfg.label}</Text>
                </View>
              )
            })}
          </View>
        </>
      )}

      {isEditing && (
        <View className='home-edit'>
          <Text className='home-edit__tip'>已添加（{currentKeys.length}/{MAX_QUICK_KEYS}），可左右调整顺序</Text>
          <View className='home-edit__grid'>
            {currentKeys.map((key, idx) => {
              const cfg = RECORD_TYPE_CFG[key]
              if (!cfg) return null
              return (
                <View key={key} className='home-edit__item'>
                  <View className='home-edit__remove' onClick={() => removeKey(key)}>
                    ×
                  </View>
                  <ActionIcon actionKey={key} />
                  <Text className='home-edit__label'>{cfg.label}</Text>
                  <View className='home-edit__ops'>
                    <Text className='home-edit__op' onClick={() => moveKey(idx, 'left')}>
                      ←
                    </Text>
                    <Text className='home-edit__op' onClick={() => moveKey(idx, 'right')}>
                      →
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>

          <View className='home-edit__pool'>
            <Text className='home-edit__pool-title'>
              {canAdd ? '更多功能（点击添加）' : `已达上限（最多${MAX_QUICK_KEYS}个）`}
            </Text>
            {GLOBAL_FAB_GROUPS.map((group) => {
              const keys = group.keys.filter((key) => poolKeys.includes(key))
              if (keys.length === 0) return null
              return (
                <View key={group.label} className='home-edit__group'>
                  <Text className='home-edit__group-title'>{group.label}</Text>
                  <View className='home-edit__pool-grid'>
                    {keys.map((key) => {
                      const cfg = RECORD_TYPE_CFG[key]
                      if (!cfg) return null
                      return (
                        <View
                          key={key}
                          className='home-edit__pool-item'
                          onClick={() => {
                            if (canAdd) addKey(key)
                          }}
                        >
                          <ActionIcon actionKey={key} />
                          <Text className='home-edit__pool-label'>{cfg.label}</Text>
                        </View>
                      )
                    })}
                  </View>
                </View>
              )
            })}
          </View>
        </View>
      )}
    </View>
  )
}
