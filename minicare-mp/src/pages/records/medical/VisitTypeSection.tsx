/**
 * 医疗记录 - 检查类型选择（2 列网格，4 种类型）
 * 2026-08-22 精简：去掉 allergy 过敏原检测（低频）、blood 血液检查（与 other 重复）
 */
import { View, Text, Image } from '@tarojs/components'
import { VISIT_TYPE_LABELS } from '@/lib/constants'

/** 检查类型图标 Data URI */
const ICON_BABY = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F0B8C8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>')}`
const ICON_HOSPITAL = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#C8A8D8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></svg>')}`
const ICON_SYRINGE = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#88C8A0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5"/><path d="m9 11 4 4"/><path d="m5 19-3 3"/><path d="m14 4 6 6"/></svg>')}`
const ICON_FILE = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#B09A9D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>')}`

/** 选项列表（4 种；文案单一来源 VISIT_TYPE_LABELS，blood/allergy 编辑时由父组件归一 other） */
const VISIT_TYPE_OPTIONS: { key: string; color: string; icon: string }[] = [
  { key: 'checkup', color: '#F0B8C8', icon: ICON_BABY },
  { key: 'sick', color: '#C8A8D8', icon: ICON_HOSPITAL },
  { key: 'vaccine', color: '#88C8A0', icon: ICON_SYRINGE },
  { key: 'other', color: '#B09A9D', icon: ICON_FILE },
]

interface Props {
  value: string
  onChange: (v: string) => void
}

export default function VisitTypeSection({ value, onChange }: Props) {
  return (
    <View className='medical-visit-grid'>
      {VISIT_TYPE_OPTIONS.map(({ key, color, icon }) => (
        <View
          key={key}
          className={`medical-visit-item ${value === key ? 'medical-visit-item--active' : ''}`}
          onClick={() => onChange(key)}
        >
          <View
            className='medical-visit-item__icon'
            style={{ background: `${color}22` }}
          >
            <Image src={icon} className='medical-visit-item__icon-img' />
          </View>
          <Text
            className='medical-visit-item__label'
            style={{ color: value === key ? '#F87098' : '#4A3035' }}
          >
            {VISIT_TYPE_LABELS[key] ?? key}
          </Text>
        </View>
      ))}
    </View>
  )
}
