/**
 * 医疗记录类型选择页（PRD-005 US-01 / TECH-011 §4.2）
 *
 * 医疗「记录流」主入口（决策 D1）：新建/补录/语音（未识别出类型）先在此明确就医类型，
 * 再进入对应分型表单 /pages/records/medical/index?type=xxx（查看历史走聚合页/档案，不混流）。
 *
 * - 无参进入：4 类型卡片直达分型表单（type 参数 + 其余参数透传，如 voice_* 预填）
 * - 语音进入：识别不出类型时落到本页，透传 voice_* 至表单预填并提示"请选择类型"
 * - 防御性分流：携带 recordId（编辑态，如旧分发器遗留跳转）→ redirectTo 表单，
 *   跳过选型避免类型被意外改写（US-01 异常处理·编辑直达；US-10 老数据归一由表单处理）
 */
import { View, Text, Image } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import RecordNavBar from '@/components/RecordNavBar'
import { MEDICAL_TYPE_OPTIONS, MEDICAL_FORM_PAGE, VISIT_TYPE_LABELS } from '@/lib/constants'
import { RECORD_TYPE_ICON_SRC } from '@/assets/icons/recordTypeIcons'
import './index.scss'

export default function MedicalTypeSelectPage() {
  const [voiceHint, setVoiceHint] = useState('')

  useLoad((loadOptions) => {
    const p = (loadOptions ?? {}) as Record<string, string | undefined>
    // 编辑态防御：任何入口携带 recordId 一律直达表单（防类型改写）
    if (p.recordId) {
      Taro.redirectTo({ url: `${MEDICAL_FORM_PAGE}?recordId=${encodeURIComponent(p.recordId)}` })
      return
    }
    const voiceCount = Object.keys(p).filter((k) => k.startsWith('voice_') && p[k]).length
    if (voiceCount > 0) setVoiceHint('语音已识别部分信息，请选择这次记录的类型后继续填写')
  })

  /** 选型 → 分型表单；除 type 外其余参数（voice_* 等）全部透传 */
  const goForm = (typeKey: string) => {
    const p = Taro.getCurrentInstance().router?.params ?? {}
    const passthrough = Object.entries(p)
      .filter(([k, v]) => k !== 'type' && k !== 'recordId' && v)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    const qs = [`type=${typeKey}`, ...passthrough].join('&')
    Taro.navigateTo({ url: `${MEDICAL_FORM_PAGE}?${qs}` })
  }

  return (
    <View className='medical-type-page'>
      <RecordNavBar title='记录类型' isEditMode={false} />

      <View className='medical-type-page__body'>
        <View className='medical-type-page__intro'>
          <Text className='medical-type-page__title'>这次要记录什么？</Text>
          {voiceHint ? <Text className='medical-type-page__voice-hint'>{voiceHint}</Text> : null}
        </View>

        {MEDICAL_TYPE_OPTIONS.map((opt) => {
          const icon = RECORD_TYPE_ICON_SRC[opt.key]
          return (
            <View
              key={opt.key}
              className='medical-type-card'
              hoverClass='medical-type-card--hover'
              hoverStayTime={80}
              onClick={() => goForm(opt.key)}
            >
              <View className='medical-type-card__icon' style={{ background: opt.bg }}>
                {icon ? (
                  <Image className='medical-type-card__icon-img' src={icon} mode='aspectFit' />
                ) : (
                  <Text className='medical-type-card__icon-fallback' style={{ color: opt.color }}>
                    记
                  </Text>
                )}
              </View>
              <View className='medical-type-card__main'>
                <Text className='medical-type-card__label'>{VISIT_TYPE_LABELS[opt.key] ?? opt.key}</Text>
                <Text className='medical-type-card__subtitle'>{opt.subtitle}</Text>
              </View>
              <Text className='medical-type-card__arrow' style={{ color: opt.color }}>
                ›
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
