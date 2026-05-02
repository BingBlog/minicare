/**
 * Onboarding Step 1 — 宝宝基本信息表单
 *
 * 包含（与 Web BabyInfoForm 一致）：
 *   - 宝宝昵称（必填文字输入框）
 *   - 出生日期（必填日期选择器，上限今天，下限 2010）
 *   - 性别（必填，男/女 圆角药丸切换）
 *
 * 差异化：
 *   - DatePicker：Web 自定义滚轮 → MP Taro <Picker mode="date">
 *   - Input：Web <input> → Taro <Input>
 */
import { View, Text, Input, Picker } from '@tarojs/components'
import { nowDate } from '@/lib/utils'

interface Props {
  babyName: string
  onBabyNameChange: (v: string) => void
  birthDate: string
  onBirthDateChange: (v: string) => void
  gender: 'male' | 'female'
  onGenderChange: (v: 'male' | 'female') => void
}

/** 格式化日期展示：YYYY-MM-DD → YYYY年M月D日 */
function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '请选择'
  const [y, m, d] = dateStr.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

export default function BabyInfoForm({
  babyName,
  onBabyNameChange,
  birthDate,
  onBirthDateChange,
  gender,
  onGenderChange,
}: Props) {
  return (
    <View className='baby-form'>
      {/* 节标题 */}
      <Text className='section-label'>基本信息</Text>

      {/* 卡片容器 */}
      <View className='baby-form__card'>
        {/* 宝宝昵称 */}
        <View className='baby-form__row'>
          <Text className='baby-form__label'>
            宝宝昵称 <Text className='baby-form__required'>*</Text>
          </Text>
          <Input
            className='baby-form__input'
            type='text'
            placeholder='输入宝宝昵称'
            value={babyName}
            maxlength={20}
            onInput={(e) => onBabyNameChange(e.detail.value)}
          />
        </View>

        {/* 出生日期 */}
        <View className='baby-form__row'>
          <Text className='baby-form__label'>
            出生日期 <Text className='baby-form__required'>*</Text>
          </Text>
          <Picker
            mode='date'
            value={birthDate}
            start='2010-01-01'
            end={nowDate()}
            onChange={(e) => onBirthDateChange(e.detail.value)}
          >
            <View className='baby-form__date-trigger'>
              <Text className='baby-form__date-text'>
                {formatDateDisplay(birthDate)}
              </Text>
              <Text className='baby-form__date-arrow'>›</Text>
            </View>
          </Picker>
        </View>

        {/* 性别 */}
        <View className='baby-form__row baby-form__row--no-border'>
          <Text className='baby-form__label'>
            性别 <Text className='baby-form__required'>*</Text>
          </Text>
          <View className='baby-form__gender-group'>
            <View
              className={`baby-form__gender-pill ${gender === 'male' ? 'baby-form__gender-pill--active' : ''}`}
              onClick={() => onGenderChange('male')}
            >
              <Text>男</Text>
            </View>
            <View
              className={`baby-form__gender-pill ${gender === 'female' ? 'baby-form__gender-pill--active' : ''}`}
              onClick={() => onGenderChange('female')}
            >
              <Text>女</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
