import { View, Text } from '@tarojs/components'
import type { AllergyLevel, AllergyType } from '@/api'
import { useAppConfig } from '@/lib/useAppConfig'
import { getBabyAge } from '@/lib/utils'
import dayjs from 'dayjs'

interface BabyHeroProps {
  babyName: string | null | undefined
  userNickname: string | null | undefined
  birthDate: string | null | undefined
  gender: string | null | undefined
  allergyTypes: AllergyType[] | null | undefined
  allergyLevel: AllergyLevel | null | undefined
  onEdit: () => void
}

export default function BabyHero({
  babyName,
  userNickname,
  birthDate,
  gender,
  allergyTypes,
  allergyLevel,
  onEdit,
}: BabyHeroProps) {
  const { getLabel } = useAppConfig()
  const displayName = babyName ?? userNickname ?? '未设置昵称'
  const genderLabel =
    gender === 'male' ? '男宝' : gender === 'female' ? '女宝' : null

  const allergyTypeText =
    allergyTypes && allergyTypes.length > 0
      ? allergyTypes.map((t) => getLabel('allergyType', t)).join('、')
      : null

  return (
    <View
      className='baby-hero'
      onClick={onEdit}
    >
      {/* 宝宝头像：粉色渐变圆形 */}
      <View className='baby-hero__avatar'>
        <svg
          viewBox='0 0 24 24'
          fill='none'
          stroke='#fff'
          strokeWidth='1.8'
          strokeLinecap='round'
          strokeLinejoin='round'
          style={{ width: 42, height: 42 }}
        >
          <path d='M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4' />
          <path d='M5 20a7 7 0 0 1 14 0' />
          <circle cx='9' cy='10.5' r='1' fill='#fff' />
          <circle cx='15' cy='10.5' r='1' fill='#fff' />
        </svg>
      </View>

      {/* 信息区 */}
      <View className='baby-hero__info'>
        <Text className='baby-hero__name'>{displayName}</Text>

        {birthDate ? (
          <Text className='baby-hero__meta'>
            {getBabyAge(birthDate)}
            {genderLabel && ` · ${genderLabel}`}
            {' · '}
            {dayjs(birthDate).format('YYYY年M月D日')}出生
          </Text>
        ) : (
          <Text className='baby-hero__hint'>
            点击编辑，补充宝宝信息
          </Text>
        )}
      </View>

      {/* 编辑按钮 */}
      <View
        className='baby-hero__edit-btn'
        onClick={(e) => {
          e.stopPropagation()
          onEdit()
        }}
      >
        <svg
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
          style={{ width: 14, height: 14 }}
        >
          <path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' />
          <path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' />
        </svg>
        编辑
      </View>
    </View>
  )
}
