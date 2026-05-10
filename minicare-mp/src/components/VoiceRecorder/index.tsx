import { View, Text } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
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
  const [simulatedBars, setSimulatedBars] = useState<number[]>(Array(20).fill(0.1))
  const animFrameRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (state !== 'recording') {
      if (animFrameRef.current) {
        clearInterval(animFrameRef.current)
        animFrameRef.current = undefined
      }
      return
    }

    animFrameRef.current = setInterval(() => {
      setSimulatedBars((prev) =>
        prev.map(() => 0.1 + Math.random() * 0.5)
      )
    }, 150)

    return () => {
      if (animFrameRef.current) {
        clearInterval(animFrameRef.current)
        animFrameRef.current = undefined
      }
    }
  }, [state])

  const hasRealData = volumeLevels.length > 0
  const displayBars = hasRealData ? volumeLevels.slice(-20) : simulatedBars

  return (
    <View className='voice-recorder' onTouchMove={onCancel}>
      {state === 'recording' && (
        <>
          <Text className='voice-recorder__status'>
            {duration < 1 ? '请开始说话...' : '正在录音'}
          </Text>

          <View className='voice-recorder__wave'>
            <View className='voice-recorder__bars'>
              {displayBars.map((level, idx) => (
                <View
                  key={idx}
                  className={`voice-recorder__bar${!hasRealData ? ' voice-recorder__bar--sim' : ''}`}
                  style={{ height: `${Math.max(4, level * 40)}px` }}
                />
              ))}
            </View>
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
