/**
 * 医疗记录 - 用药记录区域（可动态添加/删除药品）
 * 与 Web pages/records/medical/MedicationsSection.tsx 1:1 对齐
 */
import { View, Text, Input } from '@tarojs/components'

export interface Medication {
  name: string
  dose: string
}

interface Props {
  medications: Medication[]
  onAdd: () => void
  onRemove: (i: number) => void
  onUpdate: (i: number, field: keyof Medication, val: string) => void
}

export default function MedicationsSection({ medications, onAdd, onRemove, onUpdate }: Props) {
  return (
    <View className='medical-card'>
      {/* 标题与添加按钮 */}
      <View className='medical-meds__header'>
        <Text className='medical-meds__title'>用药记录（可选）</Text>
        <View className='medical-meds__add-btn' onClick={onAdd}>
          <Text className='medical-meds__add-icon'>+</Text>
          <Text className='medical-meds__add-text'>添加</Text>
        </View>
      </View>

      {medications.length === 0 ? (
        <View className='medical-meds__empty'>
          <Text className='medical-meds__empty-text'>点击「添加」记录用药信息</Text>
        </View>
      ) : (
        medications.map((med, i) => (
          <View
            key={`med-${i}`}
            className={`medical-meds__item ${i < medications.length - 1 ? 'medical-meds__item--border' : ''}`}
          >
            <Input
              className='medical-meds__name'
              value={med.name}
              onInput={(e) => onUpdate(i, 'name', e.detail.value)}
              placeholder='药品名称'
              placeholderClass='medical-card__placeholder'
            />
            <Input
              className='medical-meds__dose'
              value={med.dose}
              onInput={(e) => onUpdate(i, 'dose', e.detail.value)}
              placeholder='剂量（如 5ml）'
              placeholderClass='medical-card__placeholder'
            />
            <View className='medical-meds__remove' onClick={() => onRemove(i)}>
              <Text className='medical-meds__remove-icon'>x</Text>
            </View>
          </View>
        ))
      )}
    </View>
  )
}
