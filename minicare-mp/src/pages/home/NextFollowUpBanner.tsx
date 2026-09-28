/**
 * 首页 - 下次复查提醒横幅
 * 每天打开小程序即可看到；过期后后端不再返回（横幅消失）；点击进入对应医疗记录编辑页
 */
import { View, Text } from '@tarojs/components'
import { VISIT_TYPE_LABELS } from '@/lib/constants'
import { toFriendlyDate } from '@/lib/utils'

interface Props {
  followUpDate: string
  followUpTime?: string | null
  visitType?: string | null
  hospital?: string | null
  onRecordClick?: () => void
}

export default function NextFollowUpBanner({ followUpDate, followUpTime, visitType, hospital, onRecordClick }: Props) {
  const typeLabel = visitType ? (VISIT_TYPE_LABELS[visitType] ?? '复查') : '复查'
  const dateLabel = followUpTime ? `${toFriendlyDate(followUpDate)} ${followUpTime}` : toFriendlyDate(followUpDate)
  const parts = [dateLabel, typeLabel, hospital].filter(Boolean)

  return (
    <View
      className='home-inline-banner home-inline-banner--followup'
      onClick={onRecordClick}
    >
      <View className='home-inline-banner__dot home-inline-banner__dot--followup' />
      <View className='home-inline-banner__content'>
        <Text className='home-inline-banner__title'>下次复查提醒</Text>
        <Text className='home-inline-banner__desc'>{parts.join(' · ')}</Text>
      </View>
      <Text className='home-inline-banner__action home-inline-banner__action--followup'>查看</Text>
    </View>
  )
}
