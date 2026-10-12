/**
 * 医疗记录 - 就诊分区（PRD-005 US-06 基础 / TECH-011 §4.3）
 *
 * P0：主诉描述 + 常见症状标签（录入式）；开药/药箱联动为 P1-10，不在本期。
 * 诊断/医嘱/下次复查走外壳通用区块（ResultSection/FollowUpSection）。
 */
import { View, Text, Textarea } from '@tarojs/components'

export interface SickFormState {
  complaint: string
  symptomFlags: string[]
}

export const EMPTY_SICK: SickFormState = {
  complaint: '',
  symptomFlags: [],
}

/** 常见症状标签池（自由标签补充不在此期；PRD-017 识图回填的"文中有据才勾选"取此池交集） */
export const SICK_SYMPTOM_POOL = ['发热', '咳嗽', '流涕', '腹泻', '呕吐', '皮疹', '哭闹', '食欲差', '精神差', '便秘']

interface Props {
  value: SickFormState
  onChange: (patch: Partial<SickFormState>) => void
}

export default function SickSection({ value, onChange }: Props) {
  const toggleFlag = (flag: string) => {
    const set = new Set(value.symptomFlags)
    if (set.has(flag)) set.delete(flag)
    else set.add(flag)
    onChange({ symptomFlags: Array.from(set) })
  }

  return (
    <View className='medical-card'>
      <Text className='medical-card__textarea-label'>症状表现（选填）</Text>
      <View className='chip-row'>
        {SICK_SYMPTOM_POOL.map((flag) => (
          <View
            key={flag}
            className={`chip ${value.symptomFlags.includes(flag) ? 'chip--active' : ''}`}
            onClick={() => toggleFlag(flag)}
          >
            <Text className={value.symptomFlags.includes(flag) ? 'chip__text chip__text--active' : 'chip__text'}>{flag}</Text>
          </View>
        ))}
      </View>
      <Text className='medical-card__textarea-label'>主诉描述</Text>
      <Textarea
        className='medical-card__textarea'
        value={value.complaint}
        onInput={(e) => onChange({ complaint: e.detail.value })}
        placeholder='哪里不舒服、持续多久、诱因…'
        maxlength={500}
        autoHeight
      />
    </View>
  )
}
