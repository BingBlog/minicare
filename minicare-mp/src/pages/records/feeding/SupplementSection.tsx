import { View, Text, Input } from '@tarojs/components'
import { suppItems } from './types'

interface Props {
  checked: Record<string, boolean>
  dose: Record<string, string>
  onToggle: (key: string) => void
  onDoseChange: (key: string, val: string) => void
  otherName: string
  onOtherNameChange: (val: string) => void
  otherDose: string
  onOtherDoseChange: (val: string) => void
  otherUnit: string
  onOtherUnitChange: (val: string) => void
}

export default function SupplementSection({
  checked,
  dose,
  onToggle,
  onDoseChange,
  otherName,
  onOtherNameChange,
  otherDose,
  onOtherDoseChange,
  otherUnit,
  onOtherUnitChange,
}: Props) {
  return (
    <>
      <View className='feed-section-label'><Text>营养素记录</Text></View>
      <View className='feed-card'>
        {suppItems.map((s) => (
          <View key={s.key} className='feed-supp-row'>
            <View
              className={`feed-supp-row__check ${checked[s.key] ? 'feed-supp-row__check--on' : ''}`}
              onClick={() => onToggle(s.key)}
            >
              {checked[s.key] && <Text className='feed-supp-row__check-mark'>v</Text>}
            </View>
            <View className='feed-supp-row__info'>
              <Text className='feed-supp-row__name'>{s.label}</Text>
              {s.hint && <Text className='feed-supp-row__hint'>{s.hint}</Text>}
            </View>
            <Input
              className='feed-supp-row__input'
              type='text'
              placeholder='剂量'
              value={dose[s.key] || ''}
              onInput={(e) => onDoseChange(s.key, e.detail.value)}
            />
            <Text className='feed-supp-row__unit'>{s.unit}</Text>
          </View>
        ))}
        {/* 其他 */}
        <View className='feed-supp-other'>
          <View className='feed-supp-other__badge'><Text>+</Text></View>
          <Input
            className='feed-supp-other__name'
            placeholder='其他营养素名称'
            value={otherName}
            onInput={(e) => onOtherNameChange(e.detail.value)}
          />
          <Input
            className='feed-supp-other__dose'
            type='text'
            placeholder='剂量'
            value={otherDose}
            onInput={(e) => onOtherDoseChange(e.detail.value)}
          />
          <Input
            className='feed-supp-other__unit'
            placeholder='单位'
            value={otherUnit}
            onInput={(e) => onOtherUnitChange(e.detail.value)}
          />
        </View>
      </View>
    </>
  )
}
