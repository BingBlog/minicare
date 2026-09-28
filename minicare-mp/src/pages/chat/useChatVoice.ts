/**
 * 对话页语音输入 hook（M1 §3.2：长按录音 → 转写 → 回填输入框，发送前可编辑）
 *
 * 复用 TECH-001 语音链路（voiceApi.parse），但只取 transcript 回填——
 * 对话场景不需要记录结构化（recordType 恒为 null 属正常，不作失败处理）。
 */
import { useCallback, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { voiceApi } from '@/api/voice'

export type ChatVoiceState = 'idle' | 'recording' | 'recognizing' | 'done' | 'error'

const MAX_DURATION = 30
const MIN_DURATION = 1
const WATCHDOG_INTERVAL = 500

export function useChatVoice(familyId: string) {
  const [state, setState] = useState<ChatVoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [duration, setDuration] = useState(0)
  const [volumeLevels, setVolumeLevels] = useState<number[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  const managerRef = useRef<ReturnType<typeof Taro.getRecorderManager> | null>(null)
  const startTimeRef = useRef(0)
  const durationTimerRef = useRef<ReturnType<typeof setInterval>>()
  const watchdogTimerRef = useRef<ReturnType<typeof setInterval>>()
  const cancelledRef = useRef(false)
  const isRecordingRef = useRef(false)
  const isPressedRef = useRef(true)
  const pendingStopRef = useRef(false)

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

  const getManager = useCallback(() => {
    if (process.env.TARO_ENV !== 'weapp') return null
    if (!managerRef.current) {
      try {
        managerRef.current = Taro.getRecorderManager()
      } catch {
        return null
      }
    }
    return managerRef.current
  }, [])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const res = await Taro.authorize({ scope: 'scope.record' })
      return res.errMsg?.includes('ok') ?? false
    } catch {
      Taro.showModal({
        title: '麦克风权限',
        content: '需要麦克风权限才能语音输入，请在设置中开启',
        confirmText: '前往设置',
        success: (modalRes) => {
          if (modalRes.confirm) Taro.openSetting()
        },
      })
      return false
    }
  }, [])

  const start = useCallback(async () => {
    const manager = getManager()
    if (!manager) {
      setErrorMsg('当前环境暂不支持语音输入')
      setState('error')
      return
    }
    const hasPermission = await requestPermission()
    if (!hasPermission) return

    cancelledRef.current = false
    isRecordingRef.current = true
    isPressedRef.current = true
    setState('recording')
    setDuration(0)
    setVolumeLevels([])
    setTranscript('')
    setErrorMsg('')

    manager.onStart(() => {
      startTimeRef.current = Date.now()
      durationTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setDuration(elapsed)
        if (elapsed >= MAX_DURATION) manager.stop()
      }, 200)
      watchdogTimerRef.current = setInterval(() => {
        if (!isPressedRef.current && isRecordingRef.current) manager.stop()
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
          const text = result.transcript?.trim()
          if (!text) {
            setErrorMsg('没有听清，请再试一次')
            setState('error')
            return
          }
          setTranscript(text)
          setState('done')
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : ''
          if (msg.includes('模拟器')) {
            setErrorMsg('模拟器不支持语音输入，请在真机使用')
          } else if (msg.includes('超时')) {
            setErrorMsg('语音识别超时，请重试')
          } else {
            setErrorMsg(msg || '语音识别失败')
          }
          setState('error')
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
          const normalized = Math.min((rms / 32768) * 5, 1)
          setVolumeLevels((prev) => {
            const next = [...prev, normalized]
            return next.length > 40 ? next.slice(-40) : next
          })
        } catch {
          /* 忽略坏帧 */
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
  }, [familyId, requestPermission, clearTimers, getManager])

  const stop = useCallback(() => {
    const manager = getManager()
    if (!manager) return
    if (isRecordingRef.current) manager.stop()
    else pendingStopRef.current = true
  }, [getManager])

  const cancel = useCallback(() => {
    const manager = getManager()
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
  }, [clearTimers, getManager])

  const setPressed = useCallback((pressed: boolean) => {
    isPressedRef.current = pressed
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setTranscript('')
    setDuration(0)
    setVolumeLevels([])
    setErrorMsg('')
  }, [])

  return {
    state,
    transcript,
    duration,
    volumeLevels,
    errorMsg,
    start,
    stop,
    cancel,
    setPressed,
    reset,
  }
}
