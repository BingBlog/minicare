import { View, Text, Image } from '@tarojs/components'
import { RECORD_TYPE_CFG, HOME_RECORD_ROUTES } from '@/lib/constants'
import { navigateToRecord } from '@/lib/navigation'
import { RECORD_TYPE_ICON_SRC } from '@/assets/icons/recordTypeIcons'
import type { VoiceParseResult } from '@/api/voice'
import type { VoiceFailure } from '@/lib/useVoiceInput'
import './index.scss'

type ResultMode = 'success' | 'no_match' | 'insufficient' | 'stt_failed' | 'service_error'

interface VoiceResultSheetProps {
  mode: ResultMode
  transcript: string
  parseResult: VoiceParseResult | null
  failure: VoiceFailure | null
  open: boolean
  onConfirm: () => void
  onEdit: () => void
  onCancel: () => void
  onRetry: () => void
  onManualInput: () => void
  onTypeSelect: (type: string) => void
}

const VOICE_QUICK_TYPES = ['formula', 'breast', 'food', 'diaper', 'sleep', 'temperature', 'symptom']

const FIELD_DISPLAY: Record<string, string> = {
  formula_ml: '奶量',
  breast_side: '哺乳侧',
  duration_min: '时长',
  complementary_food: '食物',
  diaper_type: '类型',
  temperature: '体温',
  mood: '心情',
  spirit: '精神',
  poop_type: '便便性状',
  supplement_name: '营养素',
  dose: '剂量',
}

const FIELD_VALUE_LABELS: Record<string, Record<string, string>> = {
  breast_side: { left: '左侧', right: '右侧', both: '两侧' },
  diaper_type: { wet: '小便', dirty: '大便', mixed: '混合', dry: '干爽' },
  mood: { happy: '开心', calm: '平静', fussy: '烦躁', crying: '哭闹' },
  spirit: { active: '活跃', normal: '正常', tired: '疲惫', low: '萎靡' },
  poop_type: { normal: '正常', loose: '稀便', watery: '水样', constipated: '偏硬' },
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return ''
  const labels = FIELD_VALUE_LABELS[key]
  if (labels && typeof value === 'string' && labels[value]) return labels[value]
  if (key === 'formula_ml') return `${value} ml`
  if (key === 'duration_min') return `${value} 分钟`
  if (key === 'temperature') return `${value} °C`
  return String(value)
}

export default function VoiceResultSheet({
  mode,
  transcript,
  parseResult,
  failure,
  open,
  onConfirm,
  onEdit,
  onCancel,
  onRetry,
  onManualInput,
  onTypeSelect,
}: VoiceResultSheetProps) {
  if (!open) return null

  const recordType = parseResult?.recordType
  const cfg = recordType ? RECORD_TYPE_CFG[recordType] : null
  const iconSrc = recordType ? RECORD_TYPE_ICON_SRC[recordType] : null

  const handleTypeSelect = (type: string) => {
    const route = HOME_RECORD_ROUTES[type]
    if (route) {
      navigateToRecord(route)
    }
    onTypeSelect(type)
  }

  return (
    <View className='voice-result-mask' onClick={onCancel}>
      <View className='voice-result-sheet' onClick={(e) => e.stopPropagation()}>
        <View className='voice-result-sheet__handle' />

        {mode === 'success' && parseResult && (
          <>
            <View className='voice-result-sheet__transcript'>
              <Text className='voice-result-sheet__transcript-text'>{transcript}</Text>
            </View>

            <View className='voice-result-sheet__divider' />

            {cfg && (
              <View className='voice-result-sheet__type-tag' style={{ background: cfg.bg }}>
                {iconSrc ? <Image className='voice-result-sheet__type-icon' src={iconSrc} mode='aspectFit' /> : null}
                <Text className='voice-result-sheet__type-label' style={{ color: cfg.color }}>{cfg.label}</Text>
              </View>
            )}

            <View className='voice-result-sheet__fields'>
              {Object.entries(parseResult.fields).filter(([key]) => key !== 'supplement_key').map(([key, value]) => {
                const label = FIELD_DISPLAY[key] || key
                const display = formatFieldValue(key, value)
                if (!display) return null
                return (
                  <View key={key} className='voice-result-sheet__field'>
                    <Text className='voice-result-sheet__field-label'>{label}</Text>
                    <Text className='voice-result-sheet__field-value'>{display}</Text>
                  </View>
                )
              })}
              <View className='voice-result-sheet__field'>
                <Text className='voice-result-sheet__field-label'>时间</Text>
                <Text className='voice-result-sheet__field-value'>刚刚</Text>
              </View>
            </View>

            <View className='voice-result-sheet__actions'>
              <View className='voice-result-sheet__btn voice-result-sheet__btn--cancel' onClick={onCancel}>
                <Text className='voice-result-sheet__btn-text'>取消</Text>
              </View>
              <View className='voice-result-sheet__btn voice-result-sheet__btn--edit' onClick={onEdit}>
                <Text className='voice-result-sheet__btn-text'>修改</Text>
              </View>
              <View className='voice-result-sheet__btn voice-result-sheet__btn--confirm' onClick={onConfirm}>
                <Text className='voice-result-sheet__btn-text voice-result-sheet__btn-text--confirm'>确认录入</Text>
              </View>
            </View>
          </>
        )}

        {mode === 'no_match' && (
          <>
            {transcript ? (
              <>
                <View className='voice-result-sheet__transcript'>
                  <Text className='voice-result-sheet__transcript-text'>{transcript}</Text>
                </View>
                <View className='voice-result-sheet__divider' />
              </>
            ) : null}

            <View className='voice-result-sheet__warn'>
              <Text className='voice-result-sheet__warn-title'>未识别到记录类型</Text>
              <Text className='voice-result-sheet__warn-desc'>请选择要记录的类型，或重新说话</Text>
            </View>

            <View className='voice-result-sheet__type-grid'>
              {VOICE_QUICK_TYPES.map((type) => {
                const typeCfg = RECORD_TYPE_CFG[type]
                const typeIcon = RECORD_TYPE_ICON_SRC[type]
                if (!typeCfg) return null
                return (
                  <View
                    key={type}
                    className='voice-result-sheet__type-chip'
                    style={{ background: typeCfg.bg }}
                    onClick={() => handleTypeSelect(type)}
                  >
                    {typeIcon ? <Image className='voice-result-sheet__type-chip-icon' src={typeIcon} mode='aspectFit' /> : null}
                    <Text className='voice-result-sheet__type-chip-label' style={{ color: typeCfg.color }}>{typeCfg.label}</Text>
                  </View>
                )
              })}
            </View>

            <View className='voice-result-sheet__actions'>
              <View className='voice-result-sheet__btn voice-result-sheet__btn--retry' onClick={onRetry}>
                <Text className='voice-result-sheet__btn-text'>重新说话</Text>
              </View>
              <View className='voice-result-sheet__btn voice-result-sheet__btn--manual' onClick={onManualInput}>
                <Text className='voice-result-sheet__btn-text'>手动录入</Text>
              </View>
            </View>
          </>
        )}

        {mode === 'insufficient' && failure && (
          <>
            <View className='voice-result-sheet__transcript'>
              <Text className='voice-result-sheet__transcript-text'>{transcript}</Text>
            </View>

            <View className='voice-result-sheet__divider' />

            {failure.recordType && cfg && (
              <View className='voice-result-sheet__type-tag' style={{ background: cfg.bg }}>
                {iconSrc ? <Image className='voice-result-sheet__type-icon' src={iconSrc} mode='aspectFit' /> : null}
                <Text className='voice-result-sheet__type-label' style={{ color: cfg.color }}>{cfg.label}</Text>
              </View>
            )}

            <View className='voice-result-sheet__warn'>
              <Text className='voice-result-sheet__warn-title'>信息不够完整</Text>
              <Text className='voice-result-sheet__warn-desc'>请补充详细内容后提交</Text>
            </View>

            <View className='voice-result-sheet__actions'>
              <View className='voice-result-sheet__btn voice-result-sheet__btn--retry' onClick={onRetry}>
                <Text className='voice-result-sheet__btn-text'>重新说话</Text>
              </View>
              <View className='voice-result-sheet__btn voice-result-sheet__btn--confirm' onClick={onEdit}>
                <Text className='voice-result-sheet__btn-text voice-result-sheet__btn-text--confirm'>去补充</Text>
              </View>
            </View>
          </>
        )}

        {(mode === 'stt_failed' || mode === 'service_error') && (
          <>
            <View className='voice-result-sheet__warn'>
              <Text className='voice-result-sheet__warn-title'>
                {mode === 'stt_failed' ? '未能听清，请重试' : '服务暂时不可用，请稍后重试'}
              </Text>
            </View>

            <View className='voice-result-sheet__actions'>
              <View className='voice-result-sheet__btn voice-result-sheet__btn--retry' onClick={onRetry}>
                <Text className='voice-result-sheet__btn-text'>重新说话</Text>
              </View>
              <View className='voice-result-sheet__btn voice-result-sheet__btn--manual' onClick={onManualInput}>
                <Text className='voice-result-sheet__btn-text'>手动录入</Text>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  )
}
