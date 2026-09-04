import { View, Text, Image } from '@tarojs/components'
import { useRef } from 'react'
import { FAB_SUBTITLES, RECORD_TYPE_CFG } from '@/lib/constants'
import { RECORD_TYPE_ICON_SRC } from '@/assets/icons/recordTypeIcons'

/**
 * 打开后的事件吸收窗口（H5 触摸兼容）：
 * 触屏 tap FAB → onTouchEnd 同步 setFabOpen(true) 渲染浮层 → 浏览器随后把本次
 * 触摸合成的 click 派发到触摸点坐标上，此时该坐标已被新浮层的某一行覆盖
 * （hit-test 命中刚出现的行）→ 行 onClick 被触发 → 看似"点一下 FAB 直接跳进
 * 某记录页"，抽屉从未被看见。window 内忽略浮层上的点击可拦截这次穿透；
 * 真机/桌面二次点击必然晚于窗口，不受影响。
 */
const ABSORB_WINDOW_MS = 350

/** 智能体入口（FAB 菜单顶部固定，P3：问敏宝助手 / 宝宝日记） */
export const AGENT_FAB_ENTRIES = [
  {
    key: 'agent_chat',
    label: '问敏宝助手',
    sub: '过敏知识 · 宝宝数据 · 每日日记',
    bg: 'linear-gradient(135deg, #F9A8C0, #F87098)',
    icon: `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>')}`,
  },
  {
    key: 'agent_diary',
    label: '宝宝日记',
    sub: '每日温情日记 · 永久回看',
    bg: 'linear-gradient(135deg, #F9C8A0, #F89870)',
    icon: `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>')}`,
  },
]

interface FabSheetProps {
  open: boolean
  onClose: () => void
  onSelect: (key: string) => void
  groups?: { label: string; keys: string[] }[]
}

export default function FabSheet({ open, onClose, onSelect, groups = [] }: FabSheetProps) {
  const openedAtRef = useRef(0)
  const wasOpenRef = useRef(false)
  // open 由 false→true 的这次渲染记录时刻（早于任何穿透 click 派发）
  if (open && !wasOpenRef.current) {
    openedAtRef.current = Date.now()
  }
  wasOpenRef.current = open
  if (!open) return null

  const isAbsorbing = () => Date.now() - openedAtRef.current < ABSORB_WINDOW_MS

  const handlePick = (key: string) => {
    if (isAbsorbing()) return
    onSelect(key)
    onClose()
  }

  const handleMask = () => {
    if (isAbsorbing()) return
    onClose()
  }

  return (
    <View className='fab-mask' onClick={handleMask}>
      <View className='fab-sheet' onClick={(e) => e.stopPropagation()}>
        <Text className='fab-sheet__title'>记录什么？</Text>

        {/* 智能体入口（固定顶部） */}
        {AGENT_FAB_ENTRIES.map((entry) => (
          <View key={entry.key}>
            <View
              className='fab-sheet__row'
              onClick={() => handlePick(entry.key)}
            >
              <View className='fab-sheet__icon' style={{ background: entry.bg }}>
                <Image className='fab-sheet__icon-img' src={entry.icon} mode='aspectFit' />
              </View>
              <View className='fab-sheet__text'>
                <Text className='fab-sheet__label'>{entry.label}</Text>
                <Text className='fab-sheet__sub'>{entry.sub}</Text>
              </View>
              <Text className='fab-sheet__arrow'>›</Text>
            </View>
            <View className='fab-sheet__line' />
          </View>
        ))}

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
                    onClick={() => handlePick(key)}
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
