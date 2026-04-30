import { View, Text } from '@tarojs/components'
import type { FeedTab } from './types'

const TABS: { key: FeedTab; label: string }[] = [
  { key: 'formula', label: '配方奶' },
  { key: 'breast', label: '母乳' },
  { key: 'supplement', label: '营养素' },
  { key: 'food', label: '辅食' },
]

interface Props {
  value: FeedTab
  onChange: (tab: FeedTab) => void
}

export default function TabSelector({ value, onChange }: Props) {
  return (
    <View className='feed-tabs'>
      {TABS.map((t) => (
        <View
          key={t.key}
          className={`feed-tabs__item ${value === t.key ? 'feed-tabs__item--active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          <Text className='feed-tabs__label'>{t.label}</Text>
        </View>
      ))}
    </View>
  )
}
