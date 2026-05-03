/**
 * GuestQuickActions — 游客模式快捷记录网格
 *
 * 复用与 QuickActions 完全相同的网格布局和图标样式，
 * 但点击任意按钮时弹出 Toast 提示登录，而非跳转记录表单。
 */
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { RECORD_TYPE_CFG, DEFAULT_QUICKACTION_KEYS_BY_AGE } from '@/lib/constants'
import { RECORD_TYPE_ICON_SRC } from '@/assets/icons/recordTypeIcons'
import { QUICK_A_ZONE_SIZE } from '@/lib/useQuickActionKeys'

/** 游客模式固定使用 6-11m 年龄段的默认快捷键 */
const GUEST_KEYS = DEFAULT_QUICKACTION_KEYS_BY_AGE['6-11m']

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

function handleGuestTap() {
  Taro.navigateTo({ url: '/pages/login/index' })
}

export default function GuestQuickActions() {
  const aKeys = GUEST_KEYS.slice(0, QUICK_A_ZONE_SIZE)
  const bKeys = GUEST_KEYS.slice(QUICK_A_ZONE_SIZE)

  return (
    <View className='home-card'>
      <View className='home-card__head'>
        <Text className='home-card__title'>快捷记录</Text>
      </View>

      <View className='home-quick-grid home-quick-grid--top'>
        {aKeys.map((key) => {
          const cfg = RECORD_TYPE_CFG[key]
          if (!cfg) return null
          return (
            <View className='home-quick-grid__item home-quick-grid__item--top' key={key} onClick={handleGuestTap}>
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
            <View className='home-quick-grid__item home-quick-grid__item--bottom' key={key} onClick={handleGuestTap}>
              <ActionIcon actionKey={key} />
              <Text className='home-quick-grid__text home-quick-grid__text--bottom'>{cfg.label}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
