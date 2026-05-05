/**
 * 医疗记录 - 下次复查提醒区域（可选设置复查日期和通知）
 * 与 Web pages/records/medical/FollowUpSection.tsx 1:1 对齐
 */
import { View, Text, Picker } from '@tarojs/components'
import { nowDate } from '@/lib/utils'

interface Props {
  followUpDate: string
  followUpEnabled: boolean
  onDateChange: (v: string) => void
  onToggle: () => void
}

export default function FollowUpSection({ followUpDate, followUpEnabled, onDateChange, onToggle }: Props) {
  return (
    <View className='medical-followup'>
      <View className='medical-followup__header'>
        <Text className='medical-followup__title'>设置复查日期提醒</Text>
      </View>
      <View className='medical-followup__row'>
        <Text className='medical-followup__label'>复查日期</Text>
        <View className='medical-followup__date'>
          <Picker
            mode='date'
            value={followUpDate || nowDate()}
            start={nowDate()}
            onChange={(e) => onDateChange(e.detail.value)}
          >
            <Text className='medical-followup__date-text'>
              {followUpDate || nowDate()}
            </Text>
          </Picker>
        </View>
        {/* Toggle */}
        <View
          className={`medical-followup__toggle ${followUpEnabled ? 'medical-followup__toggle--on' : ''}`}
          onClick={onToggle}
        >
          <View className='medical-followup__toggle-thumb' />
        </View>
      </View>
      <Text className='medical-followup__hint'>
        届时将发送本地通知（需开启通知权限）
      </Text>
    </View>
  )
}
