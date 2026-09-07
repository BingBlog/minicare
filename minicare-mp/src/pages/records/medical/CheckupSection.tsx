/**
 * 医疗记录 - 儿保分区（PRD-005 US-04 / TECH-011 §4.3）
 *
 * - 体格测量：身高(cm)/体重(kg)/头围(cm)，提交换算 mm/g；同步开关（默认开，同日已有生长记录将被覆盖=D2）
 * - 发育里程碑：5 维度三态（正常/待观察/未评估）；评估未记录不提交
 * - 医生评估与建议 + 家长问答（answer 空 = 待补答复）
 */
import { View, Text, Textarea, Switch, Input } from '@tarojs/components'
import { CHECKUP_MILESTONE_DIMS, MILESTONE_STATUS_LABELS } from '@/lib/constants'

export interface CheckupFormState {
  heightCm: string
  weightKg: string
  headCm: string
  /** 是否同步到生长记录（默认开） */
  growthSync: boolean
  /** dim → 'ok' | 'watch' | 'na' */
  milestones: Record<string, string>
  assessment: string
  qa: { question: string; answer: string }[]
}

export const EMPTY_CHECKUP: CheckupFormState = {
  heightCm: '',
  weightKg: '',
  headCm: '',
  growthSync: true,
  milestones: {},
  assessment: '',
  qa: [],
}

const MILESTONE_STATUS_KEYS = Object.keys(MILESTONE_STATUS_LABELS)

interface Props {
  value: CheckupFormState
  onChange: (patch: Partial<CheckupFormState>) => void
}

export default function CheckupSection({ value, onChange }: Props) {
  const setMilestone = (dim: string, status: string) => {
    onChange({ milestones: { ...value.milestones, [dim]: status } })
  }

  const updateQa = (idx: number, field: 'question' | 'answer', text: string) => {
    const qa = value.qa.map((item, i) => (i === idx ? { ...item, [field]: text } : item))
    onChange({ qa })
  }

  const removeQa = (idx: number) => {
    onChange({ qa: value.qa.filter((_, i) => i !== idx) })
  }

  const hasAnyMeasure = value.heightCm !== '' || value.weightKg !== '' || value.headCm !== ''
  const growthHint = value.growthSync
    ? '将同步到生长记录；当天已有生长记录会被覆盖'
    : '本次测量不同步到生长记录'

  return (
    <>
      {/* 体格测量 */}
      <View className='medical-card'>
        <Text className='medical-card__textarea-label'>体格测量（选填，任一填写即同步生长）</Text>
        <View className='medical-card__row medical-card__row--border'>
          <Text className='medical-card__label'>身高</Text>
          <InputDual unit='cm' value={value.heightCm} onChange={(v) => onChange({ heightCm: v })} placeholder='如 65.5' />
        </View>
        <View className='medical-card__row medical-card__row--border'>
          <Text className='medical-card__label'>体重</Text>
          <InputDual unit='kg' value={value.weightKg} onChange={(v) => onChange({ weightKg: v })} placeholder='如 7.6' />
        </View>
        <View className='medical-card__row medical-card__row--border'>
          <Text className='medical-card__label'>头围</Text>
          <InputDual unit='cm' value={value.headCm} onChange={(v) => onChange({ headCm: v })} placeholder='如 43.0' />
        </View>
        <View className='medical-card__sync'>
          <View className='medical-card__sync-main'>
            <Text className='medical-card__sync-title'>同步到生长记录</Text>
            <Text className='medical-card__sync-hint'>{growthHint}</Text>
          </View>
          <Switch
            checked={value.growthSync}
            color='#F87098'
            onChange={(e) => onChange({ growthSync: e.detail.value })}
          />
        </View>
      </View>

      {/* 发育里程碑（5 维三态） */}
      <View className='medical-card'>
        <Text className='medical-card__textarea-label'>发育里程碑评估</Text>
        {CHECKUP_MILESTONE_DIMS.map((dim) => {
          const current = value.milestones[dim.key] ?? ''
          return (
            <View key={dim.key} className='medical-card__row medical-card__row--border medical-card__row--multi'>
              <Text className='medical-card__label'>{dim.label}</Text>
              <View className='segment'>
                {MILESTONE_STATUS_KEYS.map((status) => (
                  <View
                    key={status}
                    className={`segment__item ${current === status ? 'segment__item--active' : ''}`}
                    onClick={() => setMilestone(dim.key, status)}
                  >
                    <Text className={current === status ? 'segment__text segment__text--active' : 'segment__text'}>
                      {MILESTONE_STATUS_LABELS[status]}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )
        })}
        {!hasAnyMeasure && Object.keys(value.milestones).length === 0 ? (
          <Text className='medical-card__hint'>测量与评估均为选填，可只记录一项</Text>
        ) : null}
      </View>

      {/* 医生评估与建议 */}
      <View className='medical-card'>
        <Text className='medical-card__textarea-label'>医生评估与建议</Text>
        <Textarea
          className='medical-card__textarea'
          value={value.assessment}
          onInput={(e) => onChange({ assessment: e.detail.value })}
          placeholder='医生对生长发育的评估意见、家庭护理建议…'
          maxlength={500}
          autoHeight
        />
      </View>

      {/* 家长问答（待补答复） */}
      <View className='medical-card'>
        <View className='medical-card__qa-head'>
          <Text className='medical-card__textarea-label'>我们的疑问与医生答复</Text>
          {value.qa.length > 0 ? (
            <Text className='medical-card__qa-add' onClick={() => onChange({ qa: [...value.qa, { question: '', answer: '' }] })}>
              + 再问一个
            </Text>
          ) : null}
        </View>
        {value.qa.length === 0 ? (
          <View className='medical-card__qa-empty' onClick={() => onChange({ qa: [{ question: '', answer: '' }] })}>
            <Text className='medical-card__qa-empty-text'>+ 添加问题（如：宝宝偏胖，体重如何控制）</Text>
          </View>
        ) : (
          value.qa.map((item, idx) => (
            <View key={idx} className='qa-item'>
              <View className='qa-item__head'>
                <Text className='qa-item__index'>Q{idx + 1}</Text>
                <Text className='qa-item__remove' onClick={() => removeQa(idx)}>删除</Text>
              </View>
              <Textarea
                className='medical-card__textarea'
                value={item.question}
                onInput={(e) => updateQa(idx, 'question', e.detail.value)}
                placeholder='我的问题'
                maxlength={200}
                autoHeight
              />
              <Textarea
                className='medical-card__textarea medical-card__textarea--answer'
                value={item.answer}
                onInput={(e) => updateQa(idx, 'answer', e.detail.value)}
                placeholder='医生答复（可稍后补录）'
                maxlength={500}
                autoHeight
              />
            </View>
          ))
        )}
      </View>
    </>
  )
}

/** 数字输入行（带单位尾巴） */
function InputDual({
  value,
  onChange,
  placeholder,
  unit,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  unit: string
}) {
  return (
    <View className='medical-card__input-dual'>
      <Input
        className='medical-card__input-num'
        type='digit'
        value={value}
        onInput={(e) => onChange(e.detail.value)}
        placeholder={placeholder}
        placeholderClass='medical-card__placeholder'
      />
      <Text className='medical-card__input-unit'>{unit}</Text>
    </View>
  )
}
