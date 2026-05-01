import { View, Text } from '@tarojs/components'
import type { SettingsRow, SettingsRowIcon } from './types'

interface SettingsGroupProps {
  title: string
  rows: SettingsRow[]
}

const IconChevronRight = () => (
  <svg
    viewBox='0 0 24 24'
    fill='none'
    stroke='#C0A8AD'
    strokeWidth='2'
    strokeLinecap='round'
    strokeLinejoin='round'
    style={{ width: 16, height: 16, flexShrink: 0 }}
  >
    <polyline points='9 18 15 12 9 6' />
  </svg>
)

const iconSvgs: Record<SettingsRowIcon, JSX.Element> = {
  font: (
    <svg viewBox='0 0 24 24' fill='none' stroke='#F0B8C8' strokeWidth='2'
      strokeLinecap='round' strokeLinejoin='round' style={{ width: 18, height: 18 }}>
      <polyline points='4 7 4 4 20 4 20 7' />
      <line x1='9' y1='20' x2='15' y2='20' />
      <line x1='12' y1='4' x2='12' y2='20' />
    </svg>
  ),
  users: (
    <svg viewBox='0 0 24 24' fill='none' stroke='#F0B8C8' strokeWidth='2'
      strokeLinecap='round' strokeLinejoin='round' style={{ width: 18, height: 18 }}>
      <path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' />
      <circle cx='9' cy='7' r='4' />
      <path d='M23 21v-2a4 4 0 0 0-3-3.87' />
      <path d='M16 3.13a4 4 0 0 1 0 7.75' />
    </svg>
  ),
  phone: (
    <svg viewBox='0 0 24 24' fill='none' stroke='#F0B8C8' strokeWidth='2'
      strokeLinecap='round' strokeLinejoin='round' style={{ width: 18, height: 18 }}>
      <rect x='5' y='2' width='14' height='20' rx='2' ry='2' />
      <line x1='12' y1='18' x2='12.01' y2='18' />
    </svg>
  ),
  heart: (
    <svg viewBox='0 0 24 24' fill='none' stroke='#F87098' strokeWidth='2'
      strokeLinecap='round' strokeLinejoin='round' style={{ width: 18, height: 18 }}>
      <path d='M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' />
    </svg>
  ),
  fileText: (
    <svg viewBox='0 0 24 24' fill='none' stroke='#9A8090' strokeWidth='2'
      strokeLinecap='round' strokeLinejoin='round' style={{ width: 18, height: 18 }}>
      <path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
      <polyline points='14 2 14 8 20 8' />
      <line x1='16' y1='13' x2='8' y2='13' />
      <line x1='16' y1='17' x2='8' y2='17' />
      <polyline points='10 9 9 9 8 9' />
    </svg>
  ),
}

export default function SettingsGroup({ title, rows }: SettingsGroupProps) {
  return (
    <View className='settings-group'>
      {/* 分组标题 */}
      <Text className='settings-group__title'>{title}</Text>

      {/* 卡片容器 */}
      <View className='settings-group__card'>
        {rows.map((row, i) => (
          <View
            key={row.id}
            className={`settings-group__row${i > 0 ? ' settings-group__row--bordered' : ''}${row.type !== 'info' ? ' settings-group__row--clickable' : ''}`}
            onClick={
              row.type === 'arrow'   ? row.onClick  :
              row.type === 'toggle'  ? row.onToggle :
              undefined
            }
          >
            {/* 图标 */}
            <View className='settings-group__icon' style={{ background: row.iconBg }}>
              {iconSvgs[row.icon]}
            </View>

            {/* 文字 */}
            <Text className='settings-group__label'>{row.label}</Text>

            {/* 右侧内容 */}
            {row.type === 'toggle' && (
              <View
                className='settings-group__toggle'
                style={{ background: row.checked ? '#F87098' : '#E5D8DA' }}
              >
                <View
                  className='settings-group__toggle-knob'
                  style={{ left: row.checked ? 21 : 3 }}
                />
              </View>
            )}

            {row.type === 'arrow' && (
              <View className='settings-group__arrow'>
                {row.subText && (
                  <Text className='settings-group__subText'>{row.subText}</Text>
                )}
                <IconChevronRight />
              </View>
            )}

            {row.type === 'info' && (
              <Text className='settings-group__value'>{row.value}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  )
}
