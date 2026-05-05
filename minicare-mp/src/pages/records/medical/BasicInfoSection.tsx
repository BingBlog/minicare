/**
 * 医疗记录 - 基本信息输入区域（检查日期、就诊机构、主诊医生）
 * 与 Web pages/records/medical/BasicInfoSection.tsx 1:1 对齐
 */
import { View, Text, Input, Picker } from '@tarojs/components'
import { nowDate } from '@/lib/utils'

interface Props {
  visitDate: string
  hospital: string
  doctor: string
  onVisitDateChange: (v: string) => void
  onHospitalChange: (v: string) => void
  onDoctorChange: (v: string) => void
}

export default function BasicInfoSection({
  visitDate,
  hospital,
  doctor,
  onVisitDateChange,
  onHospitalChange,
  onDoctorChange,
}: Props) {
  return (
    <View className='medical-card'>
      {/* 检查日期 */}
      <View className='medical-card__row medical-card__row--border'>
        <Text className='medical-card__label'>检查日期</Text>
        <View className='medical-card__picker'>
          <Picker
            mode='date'
            value={visitDate}
            end={nowDate()}
            onChange={(e) => onVisitDateChange(e.detail.value)}
          >
            <Text className='medical-card__picker-text'>{visitDate}</Text>
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
