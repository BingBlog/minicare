import { useCallback, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { voiceApi, type VoiceParseResult } from '@/api/voice'

export type VoiceState = 'idle' | 'recording' | 'recognizing' | 'success' | 'failure'

export interface VoiceFailure {
  type: 'no_match' | 'insufficient' | 'stt_failed' | 'service_error' | 'timeout'
  transcript?: string
  recordType?: string
}

const MAX_DURATION = 30
const MIN_DURATION = 1
const WATCHDOG_INTERVAL = 500

export function useVoiceInput(familyId: string) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [parseResult, setParseResult] = useState<VoiceParseResult | null>(null)
  const [failure, setFailure] = useState<VoiceFailure | null>(null)
  const [duration, setDuration] = useState(0)
  const [volumeLevels, setVolumeLevels] = useState<number[]>([])

  const recorderManager = useRef<ReturnType<typeof Taro.getRecorderManager> | null>(null)
  const startTimeRef = useRef(0)
  const durationTimerRef = useRef<ReturnType<typeof setInterval>>()
  const cancelledRef = useRef(false)
  const isRecordingRef = useRef(false)
  const pendingStopRef = useRef(false)
  const watchdogTimerRef = useRef<ReturnType<typeof setInterval>>()
  const isPressedRef = useRef(true)
  const hasRealVolumeRef = useRef(false)

  const clearTimers = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current)
      durationTimerRef.current = undefined
    }
    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current)
      watchdogTimerRef.current = undefined
    }
  }, [])

  const getRecorderManager = useCallback(() => {
    if (process.env.TARO_ENV !== 'weapp') {
      return null
    }

    if (!recorderManager.current) {
      try {
        recorderManager.current = Taro.getRecorderManager()
      } catch {
        return null
      }
    }

    return recorderManager.current
  }, [])

  const requestRecordPermission = useCallback(async (): Promise<boolean> => {
    try {
      const res = await Taro.authorize({ scope: 'scope.record' })
      return res.errMsg?.includes('ok') ?? false
    } catch {
      Taro.showModal({
        title: '麦克风权限',
        content: '需要麦克风权限才能使用语音录入，请在设置中开启',
        confirmText: '前往设置',
        success: (modalRes) => {
          if (modalRes.confirm) {
            Taro.openSetting()
          }
        },
      })
      return false
    }
  }, [])

  const startRecording = useCallback(async () => {
    const manager = getRecorderManager()
    if (!manager) {
      Taro.showToast({ title: '当前环境暂不支持语音录入', icon: 'none' })
      return
    }

    const hasPermission = await requestRecordPermission()
    if (!hasPermission) return

    cancelledRef.current = false
    isRecordingRef.current = true
    isPressedRef.current = true
    hasRealVolumeRef.current = false
    setState('recording')
    setDuration(0)
    setVolumeLevels([])
    setParseResult(null)
    setFailure(null)
    setTranscript('')

    manager.onStart(() => {
      startTimeRef.current = Date.now()
      durationTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setDuration(elapsed)
        if (elapsed >= MAX_DURATION) {
          manager.stop()
        }
      }, 200)

      watchdogTimerRef.current = setInterval(() => {
        if (!isPressedRef.current && isRecordingRef.current) {
          manager.stop()
        }
      }, WATCHDOG_INTERVAL)

      if (pendingStopRef.current) {
        pendingStopRef.current = false
        manager.stop()
      }
    })

    manager.onStop((res) => {
      clearTimers()
      isRecordingRef.current = false

      if (cancelledRef.current) {
        setState('idle')
        return
      }

      const recordedDuration = (Date.now() - startTimeRef.current) / 1000
      if (recordedDuration < MIN_DURATION) {
        Taro.showToast({ title: '说话时间太短', icon: 'none' })
        setState('idle')
        return
      }

      setState('recognizing')

      voiceApi
        .parse(familyId, res.tempFilePath)
        .then((result) => {
          setTranscript(result.transcript)
          setParseResult(result)

          if (!result.recordType) {
            setFailure({ type: 'no_match', transcript: result.transcript })
            setState('failure')
          } else if (result.confidence === 'low') {
            setFailure({
              type: 'insufficient',
              transcript: result.transcript,
              recordType: result.recordType,
            })
            setState('failure')
          } else {
            setState('success')
          }
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : ''
          if (msg.includes('模拟器')) {
            setFailure({ type: 'stt_failed' })
            Taro.showModal({
              title: '语音录入提示',
              content: '模拟器不支持语音录入，请在真机上使用此功能',
              showCancel: false,
            })
          } else if (msg.includes('超时')) {
            setFailure({ type: 'timeout' })
          } else if (msg.includes('听清') || msg.includes('转写')) {
            setFailure({ type: 'stt_failed' })
          } else {
            setFailure({ type: 'service_error' })
          }
          setState('failure')
        })
    })

    manager.onFrameRecorded((res) => {
      const frameBuffer = res.frameBuffer
      if (frameBuffer) {
        try {
          const dataView = new DataView(frameBuffer as ArrayBuffer)
          let sum = 0
          const len = dataView.byteLength / 2
          for (let i = 0; i < len; i++) {
            const sample = dataView.getInt16(i * 2, true)
            sum += sample * sample
          }
          const rms = Math.sqrt(sum / len)
          const normalized = Math.min(rms / 32768 * 5, 1)
          hasRealVolumeRef.current = true
          setVolumeLevels((prev) => {
            const next = [...prev, normalized]
            return next.length > 40 ? next.slice(-40) : next
          })
        } catch {
          // frameBuffer 解析失败时忽略
        }
      }
    })

    manager.start({
      format: 'mp3',
      sampleRate: 16000,
      encodeBitRate: 48000,
      numberOfChannels: 1,
      frameSize: 5,
    })

    Taro.vibrateShort({ type: 'medium' })
  }, [familyId, requestRecordPermission, clearTimers, getRecorderManager])

  const stopRecording = useCallback(() => {
    const manager = getRecorderManager()
    if (!manager) return

    if (isRecordingRef.current) {
      manager.stop()
    } else {
      pendingStopRef.current = true
    }
  }, [getRecorderManager])

  const cancelRecording = useCallback(() => {
    const manager = getRecorderManager()
    if (!manager) {
      setState('idle')
      return
    }

    cancelledRef.current = true
    isRecordingRef.current = false
    pendingStopRef.current = false
    clearTimers()
    manager.stop()
    setState('idle')
    Taro.vibrateShort({ type: 'light' })
  }, [clearTimers, getRecorderManager])

  const setPressed = useCallback((pressed: boolean) => {
    isPressedRef.current = pressed
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setTranscript('')
    setParseResult(null)
    setFailure(null)
    setDuration(0)
    setVolumeLevels([])
  }, [])

  return {
    state,
    transcript,
    parseResult,
    failure,
    duration,
    volumeLevels,
    startRecording,
    stopRecording,
    cancelRecording,
    setPressed,
    reset,
  }
}
