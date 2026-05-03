/**
 * 活动记录 - 活动类型选择卡片（MP 迁移）
 *
 * 与 Web pages/records/activity/ActivityTypeSection.tsx 保持 1:1 业务逻辑对齐。
 * 6 种活动类型 2×3 网格布局。
 * 图标使用 SVG Data URI（小程序不支持内联 SVG 组件，通过 Image src 渲染）。
 */
import { View, Text, Image } from '@tarojs/components'

type ActivityType = 'gross_motor' | 'fine_motor' | 'edu_play' | 'outdoor' | 'daily_care' | 'other'

// ── SVG 图标 Data URI（与 Web 内联 SVG 语义一致） ──

function makeIcon(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** 大运动练习：奔跑人形 */
const ICON_GROSS_MOTOR = (color: string) => makeIcon(`<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="13" cy="4" r="2"/><path d="M11 8 L10 14"/><path d="M10 10 L6 8"/><path d="M10 10 L14 8"/><path d="M10 14 L7 19"/><path d="M10 14 L14 18"/></svg>`)

/** 精细运动练习：手指捏取 */
const ICON_FINE_MOTOR = (color: string) => makeIcon(`<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M8 18 Q6 18 6 16 L6 10 Q6 9 7 9 Q8 9 8 10 L8 13"/><path d="M8 10 Q8 7 10 7 Q12 7 12 10 L12 13"/><path d="M12 10 Q12 7 14 7 Q16 7 16 10 L16 13"/><path d="M16 11 Q16 9 17.5 9 Q19 9 19 11 L19 14"/><path d="M8 13 Q8 17 11 18 L14 18 Q18 18 19 14"/></svg>`)

/** 亲子早教互动：书本/对话泡 */
const ICON_EDU_PLAY = (color: string) => makeIcon(`<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M4 19 Q4 5 12 5 Q20 5 20 19"/><line x1="12" y1="5" x2="12" y2="19"/><path d="M14 2 Q14 2 18 2 Q20 2 20 4 Q20 6 18 6 L16 6 L15 8 L15 6 Q14 6 14 4 Z"/></svg>`)

/** 户外活动：太阳 */
const ICON_OUTDOOR = (color: string) => makeIcon(`<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`)

/** 日常护理：浴缸/水龙头 */
const ICON_DAILY_CARE = (color: string) => makeIcon(`<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M2 11 L22 11"/><path d="M2 11 Q2 16 5 18 L5 20"/><path d="M22 11 Q22 16 19 18 L19 20"/><path d="M3 18 L21 18"/><path d="M9 6 L9 11"/><path d="M9 6 Q9 4 11 4 L11 11"/></svg>`)

/** 其他活动：星形 */
const ICON_OTHER = (color: string) => makeIcon(`<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`)

/** 活动类型选项配置（与 Web ACTIVITY_OPTIONS 完全一致） */
const ACTIVITY_OPTIONS: {
  key: ActivityType
  label: string
  sub: string
  icon: (color: string) => string
  color: string
  bg: string
}[] = [
  { key: 'gross_motor', label: '大运动练习', sub: '翻身/爬行/站走', icon: ICON_GROSS_MOTOR, color: '#F87098', bg: '#FFF0F4' },
  { key: 'fine_motor', label: '精细运动练习', sub: '抓握/捏取/拼搭', icon: ICON_FINE_MOTOR, color: '#9B59B6', bg: '#F5EEF8' },
  { key: 'edu_play', label: '亲子早教互动', sub: '早教/故事/音乐', icon: ICON_EDU_PLAY, color: '#E67E22', bg: '#FEF9EC' },
  { key: 'outdoor', label: '户外活动', sub: '散步/日晒/自然', icon: ICON_OUTDOOR, color: '#C0922A', bg: '#FFFDE7' },
  { key: 'daily_care', label: '日常护理', sub: '洗澡/抚触/换衣', icon: ICON_DAILY_CARE, color: '#4A90D9', bg: '#EEF6FF' },
  { key: 'other', label: '其他活动', sub: '自由记录', icon: ICON_OTHER, color: '#9B8ED8', bg: '#F3F0FF' },
]

/** 卡片头部脉冲图标 */
const ICON_HEADER = makeIcon(`<svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`)

interface Props {
  value: ActivityType
  onChange: (v: ActivityType) => void
}

export default function ActivityTypeSection({ value, onChange }: Props) {
  return (
    <View className='activity-type-card'>
      {/* 卡片头部 */}
      <View className='activity-type-card__header'>
        <Image className='activity-type-card__header-icon' src={ICON_HEADER} />
        <Text className='activity-type-card__header-text'>活动类型</Text>
      </View>

      {/* 2x3 网格 */}
      <View className='activity-type-card__grid'>
        {ACTIVITY_OPTIONS.map(({ key, label, sub, icon, color, bg }) => (
          <View
            key={key}
            className={`activity-type-card__item ${value === key ? 'activity-type-card__item--active' : ''}`}
            style={{
              borderColor: value === key ? color : '#E5D8DA',
              background: value === key ? bg : '#fff',
            }}
            onClick={() => onChange(key)}
          >
            <View
              className='activity-type-card__item-icon'
              style={{ background: value === key ? bg : '#F5F0F2' }}
            >
              <Image
                className='activity-type-card__item-svg'
                src={icon(value === key ? color : '#B09098')}
              />
            </View>
            <Text
              className='activity-type-card__item-label'
              style={{ color: value === key ? color : '#4A3035' }}
            >
              {label}
            </Text>
            <Text
              className='activity-type-card__item-sub'
              style={{ color: value === key ? color : '#9A8090' }}
            >
              {sub}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
