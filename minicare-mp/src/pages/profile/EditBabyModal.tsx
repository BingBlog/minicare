import { View, Text, Input, Picker } from '@tarojs/components'
import type { AllergyLevel, AllergyType } from '@/api'
import { ALLERGY_LEVEL_OPTIONS } from '@/lib/constants'
import { useAppConfig } from '@/lib/useAppConfig'
import { nowDate } from '@/lib/utils'

interface EditBabyModalProps {
  open: boolean
  saving: boolean
  name: string
  onNameChange: (v: string) => void
  birthDate: string
  onBirthDateChange: (v: string) => void
  gender: 'male' | 'female' | 'unknown'
  onGenderChange: (v: 'male' | 'female' | 'unknown') => void
  /** 出生数据（选填，字符串态；空串 = 未填写/待清空） */
  birthWeight: string
  onBirthWeightChange: (v: string) => void
  birthHeight: string
  onBirthHeightChange: (v: string) => void
  birthHead: string
  onBirthHeadChange: (v: string) => void
  allergyTypes: AllergyType[]
  onToggleAllergyType: (type: AllergyType) => void
  allergyLevel: AllergyLevel
  onAllergyLevelChange: (v: AllergyLevel) => void
  onSave: () => void
  onCancel: () => void
  onCdcHelp: () => void
  /** 当前用户是否为家庭创建者（仅创建者可删除宝宝） */
  isOwner?: boolean
  onDelete?: () => void
}


export default function EditBabyModal({
  open,
  saving,
  name,
  onNameChange,
  birthDate,
  onBirthDateChange,
  gender,
  onGenderChange,
  birthWeight,
  onBirthWeightChange,
  birthHeight,
  onBirthHeightChange,
  birthHead,
  onBirthHeadChange,
  allergyTypes,
  onToggleAllergyType,
  allergyLevel,
  onAllergyLevelChange,
  onSave,
  onCancel,
  onCdcHelp,
  isOwner = false,
  onDelete,
}: EditBabyModalProps) {
  const { getLabel, getOptions } = useAppConfig()
  const allergyTypeValues = getOptions('allergyType').map((o) => o.value as AllergyType)

  /** 出生数据输入：仅保留数字（出生体重/身高/头围均为整数，单位 克/cm） */
  const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '')

  if (!open) return null

  return (
    <View className='edit-baby-overlay' onClick={onCancel}>
      <View
        className='edit-baby-sheet'
        onClick={(e) => { e.stopPropagation() }}
      >
        {/* 把手 */}
        <View className='edit-baby-handle'>
          <View className='edit-baby-handle__bar' />
        </View>

        {/* 标题 */}
        <Text className='edit-baby-title'>编辑宝宝档案</Text>

        {/* 基本信息 */}
        <Text className='edit-baby-section-label'>基本信息</Text>
        <View className='edit-baby-card'>
          {/* 宝宝昵称 */}
          <View className='edit-baby-field'>
            <Text className='edit-baby-field__label'>宝宝昵称</Text>
            <Input
              className='edit-baby-field__input'
              value={name}
              onInput={(e) => onNameChange(e.detail.value)}
              placeholder='给宝宝起个名字'
              maxlength={20}
            />
          </View>

          {/* 出生日期 */}
          <View className='edit-baby-field'>
            <Picker
              mode='date'
              value={birthDate}
              onChange={(e) => onBirthDateChange(e.detail.value)}
              end={nowDate()}
              start='2010-01-01'
            >
              <View className='edit-baby-picker'>
                <Text className='edit-baby-field__label'>出生日期</Text>
                <Text className='edit-baby-picker__value'>
                  {birthDate || '请选择'}
                </Text>
              </View>
            </Picker>
          </View>

          {/* 性别选择 */}
          <View className='edit-baby-field edit-baby-field--last'>
            <Text className='edit-baby-field__label'>性别</Text>
            <View className='edit-baby-gender-group'>
              {(['male', 'female'] as const).map((g) => (
                <View
                  key={g}
                  className={`edit-baby-gender-chip${gender === g ? ' edit-baby-gender-chip--active' : ''}`}
                  onClick={() => onGenderChange(g)}
                >
                  {g === 'male' ? '男' : '女'}
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* 出生数据（选填） */}
        <Text className='edit-baby-section-label'>出生数据（选填）</Text>
        <View className='edit-baby-card'>
          {/* 出生体重 */}
          <View className='edit-baby-field'>
            <Text className='edit-baby-field__label'>出生体重（克）</Text>
            <Input
              className='edit-baby-field__input'
              type='number'
              value={birthWeight}
              onInput={(e) => onBirthWeightChange(digitsOnly(e.detail.value))}
              placeholder='如 3250'
              maxlength={4}
            />
          </View>

          {/* 出生身高 */}
          <View className='edit-baby-field'>
            <Text className='edit-baby-field__label'>出生身高（厘米）</Text>
            <Input
              className='edit-baby-field__input'
              type='number'
              value={birthHeight}
              onInput={(e) => onBirthHeightChange(digitsOnly(e.detail.value))}
              placeholder='如 50'
              maxlength={3}
            />
          </View>

          {/* 出生头围 */}
          <View className='edit-baby-field edit-baby-field--last'>
            <Text className='edit-baby-field__label'>出生头围（厘米）</Text>
            <Input
              className='edit-baby-field__input'
              type='number'
              value={birthHead}
              onInput={(e) => onBirthHeadChange(digitsOnly(e.detail.value))}
              placeholder='如 34'
              maxlength={3}
            />
          </View>
        </View>

        {/* 过敏信息 */}
        <Text className='edit-baby-section-label'>过敏信息</Text>
        <View className='edit-baby-card'>
          <View className='edit-baby-field edit-baby-field--column'>
            <Text className='edit-baby-field__label' style={{ marginBottom: 8 }}>过敏类型</Text>
            <View className='edit-baby-allergy-tags'>
              {allergyTypeValues.map((type) => (
                <View
                  key={type}
                  className={`edit-baby-allergy-tag${allergyTypes.includes(type) ? ' edit-baby-allergy-tag--active' : ''}`}
                  onClick={() => onToggleAllergyType(type)}
                >
                  {getLabel('allergyType', type)}
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* 过敏程度 */}
        <Text className='edit-baby-section-label'>过敏程度</Text>
        <View className='edit-baby-level-bar'>
          {ALLERGY_LEVEL_OPTIONS.map(({ value, label, activeColor }) => (
            <View
              key={value}
              className={`edit-baby-level-chip${allergyLevel === value ? ' edit-baby-level-chip--active' : ''}`}
              style={allergyLevel === value ? { color: activeColor } : {}}
              onClick={() => onAllergyLevelChange(value as AllergyLevel)}
            >
              {label}
            </View>
          ))}
        </View>

        {/* CDC 评分标准提示 */}
        <View className='edit-baby-cdc'>
          <Text className='edit-baby-cdc__text'>
            <svg
              viewBox='0 0 24 24' fill='none' stroke='#F87098'
              strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'
              style={{ width: 13, height: 13, display: 'inline', verticalAlign: -2 }}
            >
              <circle cx='12' cy='12' r='10' />
              <line x1='12' y1='8' x2='12' y2='12' />
              <line x1='12' y1='16' x2='12.01' y2='16' />
            </svg>
            {' '}不确定过敏程度？{' '}
            <Text className='edit-baby-cdc__link' onClick={onCdcHelp}>
              [查看 CDC 评分标准]
            </Text>
          </Text>
        </View>

        {/* 保存按钮 */}
        <View className='edit-baby-actions'>
          <View
            className={`edit-baby-btn edit-baby-btn--save${saving ? ' edit-baby-btn--disabled' : ''}`}
            onClick={saving ? undefined : onSave}
          >
            {saving ? '保存中...' : '保存档案'}
          </View>

          {/* 取消按钮 */}
          <View
            className='edit-baby-btn edit-baby-btn--cancel'
            onClick={onCancel}
          >
            取消
          </View>
        </View>

        {/* 删除宝宝（仅创建者可见） */}
        {isOwner && onDelete && (
          <View className='edit-baby-delete' onClick={onDelete}>
            <svg
              viewBox='0 0 24 24' fill='none' stroke='#F05060'
              strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'
              style={{ width: 14, height: 14, verticalAlign: -2, marginRight: 4 }}
            >
              <polyline points='3 6 5 6 21 6' />
              <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
            </svg>
            删除宝宝档案
          </View>
        )}

        <View style={{ height: 24 }} />
      </View>
    </View>
  )
}
