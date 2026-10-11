import { View, Text, Image } from '@tarojs/components'
import type { AllergyLevel, AllergyType, Baby } from '@/api'
import { useAppConfig } from '@/lib/useAppConfig'
import { getBabyAge } from '@/lib/utils'
import {
  ICON_BABY_PLACEHOLDER,
  ICON_EDIT_PENCIL,
  ICON_PICKER_CHECK,
  ICON_CAMERA,
} from '@/assets/icons/svgDataUris'
import dayjs from 'dayjs'

interface BabyHeroProps {
  babyName: string | null | undefined
  userNickname: string | null | undefined
  birthDate: string | null | undefined
  gender: string | null | undefined
  allergyTypes: AllergyType[] | null | undefined
  allergyLevel: AllergyLevel | null | undefined
  babies?: Baby[]
  currentBabyId?: string
  /** 宝宝头像展示 URL（临时 URL，由页面层解析） */
  avatarUrl?: string | null
  onEdit: () => void
  onAvatarClick?: () => void
  onSwitchBaby?: (baby: Baby) => void
}

export default function BabyHero({
  babyName,
  userNickname,
  birthDate,
  gender,
  allergyTypes,
  allergyLevel,
  babies,
  currentBabyId,
  avatarUrl,
  onEdit,
  onAvatarClick,
  onSwitchBaby,
}: BabyHeroProps) {
  const { getLabel } = useAppConfig()
  const displayName = babyName ?? userNickname ?? '未设置昵称'
  const genderLabel =
    gender === 'male' ? '男宝' : gender === 'female' ? '女宝' : null

  const allergyTypeText =
    allergyTypes && allergyTypes.length > 0
      ? allergyTypes.map((t) => getLabel('allergyType', t)).join('、')
      : null

  const hasMultipleBabies = babies && babies.length > 1

  return (
    <View className='baby-hero' onClick={onEdit}>
      {hasMultipleBabies && onSwitchBaby && (
        <View className='baby-picker'>
          {babies!.map((b) => (
            <View
              key={b.id}
              className={`baby-picker__item ${b.id === currentBabyId ? 'baby-picker__item--active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onSwitchBaby(b)
              }}
            >
              <Text className='baby-picker__name'>{b.name}</Text>
              {b.id === currentBabyId && (
                <View className='baby-picker__check'>
                  <Image src={ICON_PICKER_CHECK} style={{ width: '12px', height: '12px' }} />
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      <View className='baby-hero__main'>
        <View
          className='baby-hero__avatar'
          onClick={(e) => {
            e.stopPropagation()
            onAvatarClick?.()
          }}
        >
          {avatarUrl ? (
            <Image className='baby-hero__avatar-img' src={avatarUrl} mode='aspectFill' />
          ) : (
            <Image src={ICON_BABY_PLACEHOLDER} style={{ width: '42px', height: '42px' }} />
          )}
          {/* 相机角标：提示头像可点击更换 */}
          <View className='baby-hero__avatar-badge'>
            <Image src={ICON_CAMERA} style={{ width: '12px', height: '12px' }} />
          </View>
        </View>

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

        <View className='baby-hero__actions'>
          <View
            className='baby-hero__edit-btn'
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
          >
            <Image src={ICON_EDIT_PENCIL} style={{ width: '14px', height: '14px' }} />
            编辑
          </View>
        </View>
      </View>
    </View>
  )
}
