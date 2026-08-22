/**
 * 医疗记录 - 基本信息输入区域（检查日期、检查时间、就诊机构、主诊医生）
 */
import { View, Text, Input, Picker } from '@tarojs/components'
import { nowDate, toDateInput, toFriendlyDate } from '@/lib/utils'

interface Props {
  visitDate: string
  visitTime: string
  hospital: string
  doctor: string
  onVisitDateChange: (v: string) => void
  onVisitTimeChange: (v: string) => void
  onHospitalChange: (v: string) => void
  onDoctorChange: (v: string) => void
}

export default function BasicInfoSection({
  visitDate,
  visitTime,
  hospital,
  doctor,
  onVisitDateChange,
  onVisitTimeChange,
  onHospitalChange,
  onDoctorChange,
}: Props) {
  return (
    <View className='medical-card'>
      {/* 检查日期 + 检查时间 */}
      <View className='medical-card__row medical-card__row--border'>
        <Text className='medical-card__label'>检查日期</Text>
        <View className='medical-card__picker'>
          <Picker
            mode='date'
            value={toDateInput(visitDate)}
            end={nowDate()}
            onChange={(e) => onVisitDateChange(e.detail.value)}
          >
            <Text className='medical-card__picker-text'>{toFriendlyDate(visitDate)}</Text>
          </Picker>
        </View>
      </View>
      <View className='medical-card__row medical-card__row--border'>
        <Text className='medical-card__label'>检查时间</Text>
        <View className='medical-card__picker'>
          <Picker
            mode='time'
            value={visitTime}
            onChange={(e) => onVisitTimeChange(e.detail.value)}
          >
            <Text className='medical-card__picker-text'>{visitTime}</Text>
          </Picker>
        </View>
      </View>
      {/* 就诊机构 */}
      <View className='medical-card__row medical-card__row--border'>
        <Text className='medical-card__label'>就诊机构</Text>
        <Input
          className='medical-card__input'
          value={hospital}
          onInput={(e) => onHospitalChange(e.detail.value)}
          placeholder='医院/科室名称'
          placeholderClass='medical-card__placeholder'
        />
      </View>
      {/* 主诊医生 */}
      <View className='medical-card__row'>
        <Text className='medical-card__label'>主诊医生</Text>
        <Input
          className='medical-card__input'
          value={doctor}
          onInput={(e) => onDoctorChange(e.detail.value)}
          placeholder='可选'
          placeholderClass='medical-card__placeholder'
        />
      </View>
    </View>
  )
}
