/**
 * 医疗记录 - 基本信息输入区域（日期/时间/机构/医生）
 * 020 类型化：按就医类型切换字段文案（疫苗=接种…，儿保=儿保…，就诊=就诊…）
 */
import { View, Text, Input, Picker } from '@tarojs/components'
import { nowDate, toDateInput, toFriendlyDate } from '@/lib/utils'
import type { MedicalVisitType } from '@/api/medical'

const NOUN_LABELS: Record<string, { date: string; time: string; org: string; doc: string }> = {
  vaccine: { date: '接种日期', time: '接种时间', org: '接种机构', doc: '接种医生' },
  checkup: { date: '儿保日期', time: '儿保时间', org: '儿保机构', doc: '评估医生' },
  sick: { date: '就诊日期', time: '就诊时间', org: '就诊机构', doc: '主诊医生' },
  other: { date: '检查日期', time: '检查时间', org: '就诊机构', doc: '主诊医生' },
}

interface Props {
  visitDate: string
  visitTime: string
  hospital: string
  doctor: string
  /** 就医类型（驱动字段文案） */
  noun?: MedicalVisitType | string
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
  noun = 'other',
  onVisitDateChange,
  onVisitTimeChange,
  onHospitalChange,
  onDoctorChange,
}: Props) {
  const labels = NOUN_LABELS[noun] ?? NOUN_LABELS.other
  return (
    <View className='medical-card'>
      {/* 日期 + 时间 */}
      <View className='medical-card__row medical-card__row--border'>
        <Text className='medical-card__label'>{labels.date}</Text>
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
        <Text className='medical-card__label'>{labels.time}</Text>
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
      {/* 机构 */}
      <View className='medical-card__row medical-card__row--border'>
        <Text className='medical-card__label'>{labels.org}</Text>
        <Input
          className='medical-card__input'
          value={hospital}
          onInput={(e) => onHospitalChange(e.detail.value)}
          placeholder='医院/社区中心名称'
          placeholderClass='medical-card__placeholder'
        />
      </View>
      {/* 医生 */}
      <View className='medical-card__row'>
        <Text className='medical-card__label'>{labels.doc}</Text>
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
