/**
 * 医疗记录 - 下次复查区域（可选设置复查日期和时间）
 * 2026-08-22：移除开关（总是生效，首页常驻展示）；新增复查时间
 */
import { View, Text, Picker } from '@tarojs/components'
import { nowDate, nowTime, toDateInput, toFriendlyDate } from '@/lib/utils'

interface Props {
  followUpDate: string
  followUpTime: string
  onDateChange: (v: string) => void
  onTimeChange: (v: string) => void
}

export default function FollowUpSection({ followUpDate, followUpTime, onDateChange, onTimeChange }: Props) {
  return (
    <View className='medical-followup'>
      <View className='medical-followup__header'>
        <Text className='medical-followup__title'>下次复查提醒</Text>
      </View>
      <View className='medical-followup__row'>
        <Text className='medical-followup__label'>复查日期</Text>
        <View className='medical-followup__date'>
          <Picker
            mode='date'
            value={toDateInput(followUpDate) || nowDate()}
            start={nowDate()}
            onChange={(e) => onDateChange(e.detail.value)}
          >
            <Text className='medical-followup__date-text'>
              {followUpDate ? toFriendlyDate(followUpDate) : '选择日期（可选）'}
            </Text>
          </Picker>
        </View>
      </View>
      <View className='medical-followup__row'>
        <Text className='medical-followup__label'>复查时间</Text>
        <View className='medical-followup__date'>
          <Picker
            mode='time'
            value={followUpTime || nowTime()}
            onChange={(e) => onTimeChange(e.detail.value)}
          >
            <Text className={`medical-followup__date-text ${!followUpTime ? 'medical-followup__date-text--placeholder' : ''}`}>
              {followUpTime || '选择时间（可选）'}
            </Text>
          </Picker>
        </View>
      </View>
      <Text className='medical-followup__hint'>
        填写后将在首页展示下次复查提醒，过期后自动不再展示
      </Text>
    </View>
  )
}
