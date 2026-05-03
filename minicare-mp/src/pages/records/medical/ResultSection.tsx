/**
 * 医疗记录 - 结果与诊断区域（结果摘要、诊断结论）
 * 与 Web pages/records/medical/ResultSection.tsx 1:1 对齐
 */
import { View, Text, Input, Textarea } from '@tarojs/components'

interface Props {
  resultSummary: string
  diagnosis: string
  onResultSummaryChange: (v: string) => void
  onDiagnosisChange: (v: string) => void
}

export default function ResultSection({
  resultSummary,
  diagnosis,
  onResultSummaryChange,
  onDiagnosisChange,
}: Props) {
  return (
    <View className='medical-card'>
      {/* 结果摘要 */}
      <View className='medical-card__row medical-card__row--border'>
        <Text className='medical-card__label'>结果摘要</Text>
        <Input
          className='medical-card__input'
          value={resultSummary}
          onInput={(e) => onResultSummaryChange(e.detail.value)}
          placeholder='检查结论'
          placeholderClass='medical-card__placeholder'
        />
      </View>
      {/* 诊断结论 */}
      <View className='medical-card__textarea-wrap'>
        <Text className='medical-card__textarea-label'>诊断结论</Text>
        <Textarea
          className='medical-card__textarea'
          value={diagnosis}
          onInput={(e) => onDiagnosisChange(e.detail.value)}
          placeholder='医生建议、注意事项…'
          maxlength={500}
          autoHeight
        />
      </View>
    </View>
  )
}
