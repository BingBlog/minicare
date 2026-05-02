import { View, Text, Image } from '@tarojs/components'
import { FAB_SUBTITLES, RECORD_TYPE_CFG } from '@/lib/constants'
import { RECORD_TYPE_ICON_SRC } from '@/assets/icons/recordTypeIcons'

interface FabSheetProps {
  open: boolean
  onClose: () => void
  onSelect: (key: string) => void
  groups?: { label: string; keys: string[] }[]
}

export default function FabSheet({ open, onClose, onSelect, groups = [] }: FabSheetProps) {
  if (!open) return null

  return (
    <View className='fab-mask' onClick={onClose}>
      <View className='fab-sheet' onClick={(e) => e.stopPropagation()}>
        <Text className='fab-sheet__title'>记录什么？</Text>
        {groups.map((group) => (
          <View key={group.label}>
            <Text className='fab-sheet__group'>{group.label}</Text>
            {group.keys.map((key, idx) => {
              const cfg = RECORD_TYPE_CFG[key]
              const sub = FAB_SUBTITLES[key] ?? ''
              const src = RECORD_TYPE_ICON_SRC[key]
              if (!cfg) return null
              return (
                <View key={key}>
                  <View
                    className='fab-sheet__row'
                    onClick={() => {
                      onSelect(key)
                      onClose()
                    }}
                  >
                    <View className='fab-sheet__icon' style={{ background: cfg.bg }}>
                      {src ? <Image className='fab-sheet__icon-img' src={src} mode='aspectFit' /> : null}
                    </View>
                    <View className='fab-sheet__text'>
                      <Text className='fab-sheet__label'>{cfg.label}</Text>
                      {sub ? <Text className='fab-sheet__sub'>{sub}</Text> : null}
                    </View>
                    <Text className='fab-sheet__arrow'>›</Text>
                  </View>
                  {idx < group.keys.length - 1 ? <View className='fab-sheet__line' /> : null}
                </View>
              )
            })}
          </View>
        ))}
      </View>
    </View>
  )
}
