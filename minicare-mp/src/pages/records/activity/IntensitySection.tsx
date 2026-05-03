/**
 * 活动记录 - 活动强度选择卡片（MP 迁移）
 *
 * 与 Web pages/records/activity/IntensitySection.tsx 保持 1:1 业务逻辑对齐。
 * 三个选项：轻松 / 适中 / 活跃
 * 图标使用 SVG Data URI。
 */
import { View, Text, Image } from '@tarojs/components'

type Intensity = 'easy' | 'medium' | 'active'

function makeIcon(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** 强度选项配置（与 Web INTENSITY_OPTIONS 完全一致） */
const INTENSITY_OPTIONS: {
  key: Intensity
  label: string
  color: string
  bg: string
  icon: string
}[] = [
  {
    key: 'easy',
    label: '轻松',
    color: '#4CAF82',
    bg: '#E8F5E9',
    icon: makeIcon(`<svg viewBox="0 0 24 24" fill="none" stroke="#4CAF82" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="10" width="12" height="4" rx="2"/></svg>`),
  },
  {
    key: 'medium',
    label: '适中',
    color: '#DDB870',
    bg: '#FFF8E6',
    icon: makeIcon(`<svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polygon points="5 3 19 12 5 21 5 3"/></svg>`),
  },
  {
    key: 'active',
    label: '活跃',
    color: '#F87098',
    bg: '#FFF0F4',
    icon: makeIcon(`<svg viewBox="0 0 24 24" fill="none" stroke="#F87098" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`),
  },
]

/** 卡片头部星形图标 */
const ICON_HEADER = makeIcon(`<svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`)

interface Props {
  value: Intensity
  onChange: (v: Intensity) => void
}

export default function IntensitySection({ value, onChange }: Props) {
  return (
    <View className='activity-intensity-card'>
      {/* 卡片头部 */}
      <View className='activity-intensity-card__header'>
        <Image className='activity-intensity-card__header-icon' src={ICON_HEADER} />
        <Text className='activity-intensity-card__header-text'>活动强度</Text>
      </View>

      {/* 三按钮横排 */}
      <View className='activity-intensity-card__options'>
        {INTENSITY_OPTIONS.map(({ key, label, color, bg, icon }) => (
          <View
            key={key}
            className={`activity-intensity-card__btn ${value === key ? 'activity-intensity-card__btn--active' : ''}`}
            style={{
              borderColor: value === key ? color : '#E5D8DA',
              background: value === key ? bg : '#fff',
            }}
            onClick={() => onChange(key)}
          >
            <View
              className='activity-intensity-card__btn-icon'
              style={{ background: value === key ? bg : '#F5F0F2' }}
            >
              <Image className='activity-intensity-card__btn-svg' src={icon} />
            </View>
            <Text
              className='activity-intensity-card__btn-label'
              style={{ color: value === key ? color : '#9A8090' }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
