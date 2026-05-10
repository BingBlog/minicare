import { View, Text } from '@tarojs/components'
import './index.scss'

interface VoiceRecorderProps {
  state: 'recording' | 'canceling'
  duration: number
  maxDuration: number
  volumeLevels: number[]
  onCancel: () => void
}

export default function VoiceRecorder({
  state,
  duration,
  maxDuration,
  volumeLevels,
  onCancel,
}: VoiceRecorderProps) {
  const remaining = maxDuration - duration

  return (
    <View className='voice-recorder' onTouchMove={onCancel}>
      {state === 'recording' && (
        <>
          <Text className='voice-recorder__status'>正在录音</Text>

          <View className='voice-recorder__wave'>
            {volumeLevels.length > 0 ? (
              <View className='voice-recorder__bars'>
                {volumeLevels.slice(-20).map((level, idx) => (
                  <View
                    key={idx}
                    className='voice-recorder__bar'
                    style={{ height: `${Math.max(4, level * 40)}px` }}
                  />
                ))}
              </View>
            ) : (
              <View className='voice-recorder__bars'>
                {Array.from({ length: 20 }).map((_, idx) => (
                  <View
                    key={idx}
                    className='voice-recorder__bar voice-recorder__bar--idle'
                  />
                ))}
              </View>
            )}
          </View>

          <Text className='voice-recorder__countdown'>
            {remaining}s
          </Text>

          <Text className='voice-recorder__hint'>上滑可取消</Text>
        </>
      )}

      {state === 'canceling' && (
        <>
          <Text className='voice-recorder__cancel-icon'>x</Text>
          <Text className='voice-recorder__cancel-text'>松开手指{'\n'}取消录音</Text>
        </>
      )}
    </View>
  )
}
