import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import FabSheet from './FabSheet'
import VoiceRecorder from '@/components/VoiceRecorder'
import VoiceResultSheet from '@/components/VoiceResultSheet'
import { useVoiceInput, type VoiceFailure } from '@/lib/useVoiceInput'
import { GLOBAL_FAB_GROUPS, HOME_RECORD_ROUTES } from '@/lib/constants'
import { navigateToRecord } from '@/lib/navigation'
import { recordsApi } from '@/api/records'
import { babyApi } from '@/api/baby'
import { TABBAR_ICONS } from '@/assets/icons/tabbar'
import { getToken, getStoredFamilyId } from '@/api/http'
import dayjs from 'dayjs'
import './TabBar.scss'

export const FAB_OPEN_EVENT = 'tabbar:openFab'

const LONG_PRESS_MS = 350
const CANCEL_THRESHOLD = -60

interface TabBarProps {
  activeTab: 'home' | 'records' | 'report' | 'profile'
}

const REPORT_URL = '/pagesReport/index'

const TABS = [
  { key: 'home', label: '首页', url: '/pages/home/index' },
  { key: 'records', label: '记录', url: '/pages/records/list/index' },
] as const

const RIGHT_TABS = [
  { key: 'report', label: '分析', url: REPORT_URL },
  { key: 'profile', label: '我的', url: '/pages/profile/index' },
] as const

function getResultMode(state: string, failure: VoiceFailure | null): 'success' | 'no_match' | 'insufficient' | 'stt_failed' | 'service_error' | null {
  if (state === 'success') return 'success'
  if (state === 'failure' && failure) {
    return failure.type === 'no_match' ? 'no_match'
      : failure.type === 'insufficient' ? 'insufficient'
      : failure.type === 'stt_failed' ? 'stt_failed'
      : failure.type === 'timeout' ? 'service_error'
      : 'service_error'
  }
  return null
}

function buildVoiceFieldsQuery(fields: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') {
      parts.push(`voice_${key}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts.join('&')
}

function calculateSleepStart(durationMin: number): string {
  return dayjs().subtract(durationMin, 'minute').format('YYYY-MM-DDTHH:mm:ss')
}

const MOOD_MAP: Record<string, string> = { happy: 'happy', calm: 'neutral', fussy: 'fussy', crying: 'crying' }
const SPIRIT_MAP: Record<string, string> = { active: 'active', normal: 'normal', tired: 'tired', low: 'lethargic' }

function nowLocalISO(): string {
  return dayjs().format('YYYY-MM-DDTHH:mm:ss')
}

export default function TabBar({ activeTab }: TabBarProps) {
  const [fabOpen, setFabOpen] = useState(false)
  const [familyId, setFamilyId] = useState('')
  const [showVoiceTip, setShowVoiceTip] = useState(false)

  const pressTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const isLongPressRef = useRef(false)
  const touchStartYRef = useRef(0)
  const touchStartXRef = useRef(0)
  const isCancelingRef = useRef(false)
  const isStoppedRef = useRef(false)
  const tipTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const isLoggedIn = !!getToken()

  useEffect(() => {
    if (!isLoggedIn) return
    const fid = getStoredFamilyId()
    if (fid) setFamilyId(fid)
  }, [isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn) return
    Taro.getStorage({ key: 'voice_tip_shown' }).then(() => {}).catch(() => {
      setShowVoiceTip(true)
      Taro.setStorage({ key: 'voice_tip_shown', data: '1' })
      tipTimerRef.current = setTimeout(() => setShowVoiceTip(false), 5000)
    })
    return () => { clearTimeout(tipTimerRef.current) }
  }, [isLoggedIn])

  const voice = useVoiceInput(familyId)

  useEffect(() => {
    const handler = () => setFabOpen(true)
    Taro.eventCenter.on(FAB_OPEN_EVENT, handler)
    return () => { Taro.eventCenter.off(FAB_OPEN_EVENT, handler) }
  }, [])

  const switchTo = (url: string) => {
    if (url === REPORT_URL) {
      const pages = Taro.getCurrentPages()
      const current = pages[pages.length - 1]
      if (current?.route === 'pagesReport/index') return
      Taro.navigateTo({ url })
      return
    }
    Taro.switchTab({ url })
  }

  const handleFabTouchStart = useCallback((e: any) => {
    if (!isLoggedIn) return
    const touch = e.touches?.[0]
    if (touch) {
      touchStartYRef.current = touch.clientY
      touchStartXRef.current = touch.clientX
    }
    isLongPressRef.current = false
    isCancelingRef.current = false
    isStoppedRef.current = false

    pressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true
      voice.setPressed(true)
      voice.startRecording()
    }, LONG_PRESS_MS)
  }, [voice, isLoggedIn])

  const handleFabTouchMove = useCallback((e: any) => {
    if (!isLoggedIn) return
    if (!isLongPressRef.current || isStoppedRef.current) return
    const touch = e.touches?.[0]
    if (!touch) return

    const deltaY = touch.clientY - touchStartYRef.current
    const deltaX = Math.abs(touch.clientX - touchStartXRef.current)

    if (deltaY < CANCEL_THRESHOLD && !isCancelingRef.current) {
      isCancelingRef.current = true
      voice.cancelRecording()
    } else if (deltaX > 50 && !isCancelingRef.current) {
      isStoppedRef.current = true
      voice.setPressed(false)
      voice.stopRecording()
    }
  }, [voice, isLoggedIn])

  const handleFabTouchEnd = useCallback(() => {
    if (!isLoggedIn) {
      Taro.navigateTo({ url: '/pages/login/index' })
      return
    }
    clearTimeout(pressTimerRef.current)
    if (isLongPressRef.current && !isCancelingRef.current && !isStoppedRef.current) {
      voice.setPressed(false)
      voice.stopRecording()
    } else if (!isLongPressRef.current) {
      setFabOpen(true)
    }
  }, [voice, isLoggedIn])

  const handleConfirmRecord = useCallback(async () => {
    if (!voice.parseResult?.recordType || !familyId) return

    try {
      const { recordType, fields } = voice.parseResult
      const baby = await babyApi.get(familyId)
      const babyId = baby.id
      const now = nowLocalISO()

      switch (recordType) {
        case 'formula':
          await recordsApi.feeding.create(familyId, {
            baby_id: babyId,
            feed_type: 'formula',
            record_time: now,
            formula_ml: fields.formula_ml as number,
          })
          break
        case 'breast':
          await recordsApi.feeding.create(familyId, {
            baby_id: babyId,
            feed_type: 'breast',
            record_time: now,
            breast_side: fields.breast_side as 'left' | 'right' | 'both',
            duration_min: fields.duration_min as number,
          })
          break
        case 'food':
          await recordsApi.feeding.create(familyId, {
            baby_id: babyId,
            feed_type: 'complementary',
            record_time: now,
            complementary_food: fields.complementary_food as string,
          })
          break
        case 'diaper':
          await recordsApi.diaper.create(familyId, {
            baby_id: babyId,
            record_time: now,
            diaper_type: fields.diaper_type as 'wet' | 'dirty' | 'mixed',
          })
          break
        case 'sleep': {
          const durationMin = fields.duration_min as number
          await recordsApi.sleep.createComplete(familyId, {
            baby_id: babyId,
            start_time: calculateSleepStart(durationMin),
            end_time: now,
          })
          break
        }
        case 'sleep_start':
          await recordsApi.sleep.startSleep(familyId, {
            baby_id: babyId,
            start_time: now,
          })
          break
        case 'sleep_end': {
          const ongoing = await recordsApi.sleep.getOngoing(familyId, babyId)
          if (ongoing) {
            await recordsApi.sleep.endSleep(familyId, ongoing.id, { end_time: now })
          } else {
            Taro.showToast({ title: '没有进行中的睡眠记录，请补充开始时间', icon: 'none', duration: 2500 })
            voice.reset()
            return
          }
          break
        }
        case 'supplement':
          await recordsApi.feeding.create(familyId, {
            baby_id: babyId,
            feed_type: 'complementary',
            record_time: now,
            supplement_items: [{
              key: fields.supplement_key as string,
              label: fields.supplement_name as string,
              ...(fields.dose ? { dose: fields.dose as string } : {}),
            }],
          })
          break
        case 'temperature':
          await recordsApi.health.create(familyId, {
            baby_id: babyId,
            record_time: now,
            temperature: fields.temperature as number,
          })
          break
        case 'symptom':
          await recordsApi.symptom.create(familyId, {
            baby_id: babyId,
            record_time: now,
            ...(fields.mood ? { mood: MOOD_MAP[fields.mood as string] as any } : {}),
            ...(fields.spirit ? { spirit: SPIRIT_MAP[fields.spirit as string] as any } : {}),
          })
          break
      }

      Taro.showToast({ title: '记录成功', icon: 'success' })
      voice.reset()
      Taro.eventCenter.trigger('home:refresh')
    } catch (err) {
      Taro.showToast({
        title: err instanceof Error ? err.message : '保存失败',
        icon: 'none',
      })
    }
  }, [voice, familyId])

  const handleEditRecord = useCallback(() => {
    if (!voice.parseResult?.recordType) return
    const route = HOME_RECORD_ROUTES[voice.parseResult.recordType]
    if (route) {
      const query = buildVoiceFieldsQuery(voice.parseResult.fields)
      const separator = route.includes('?') ? '&' : '?'
      navigateToRecord(query ? `${route}${separator}${query}` : route)
    }
    voice.reset()
  }, [voice])

  const handleTypeSelect = useCallback((_type: string) => {
    voice.reset()
  }, [voice])

  const handleManualInput = useCallback(() => {
    voice.reset()
    setFabOpen(true)
  }, [voice])

  const resultMode = getResultMode(voice.state, voice.failure)

  const isRecording = voice.state === 'recording'
  const isRecognizing = voice.state === 'recognizing'

  return (
    <View className='tabbar-container'>
      {isRecording && (
        <VoiceRecorder
          state={isCancelingRef.current ? 'canceling' : 'recording'}
          duration={voice.duration}
          maxDuration={30}
          volumeLevels={voice.volumeLevels}
          onCancel={voice.cancelRecording}
        />
      )}

      {isRecognizing && (
        <View className='voice-recognizing'>
          <View className='voice-recognizing__spinner' />
          <Text className='voice-recognizing__text'>正在识别...</Text>
        </View>
      )}

      {resultMode && (
        <VoiceResultSheet
          mode={resultMode}
          transcript={voice.transcript}
          parseResult={voice.parseResult}
          failure={voice.failure}
          open={true}
          onConfirm={handleConfirmRecord}
          onEdit={handleEditRecord}
          onCancel={voice.reset}
          onRetry={voice.startRecording}
          onManualInput={handleManualInput}
          onTypeSelect={handleTypeSelect}
        />
      )}

      <View className='tabbar'>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          const icon = TABBAR_ICONS[tab.key]
          return (
            <View
              key={tab.key}
              className={`tabbar__item${isActive ? ' is-active' : ''}`}
              onClick={() => switchTo(tab.url)}
            >
              <Image
                className='tabbar__icon'
                src={isActive ? icon.active : icon.normal}
                mode='aspectFit'
              />
              <Text className='tabbar__label'>{tab.label}</Text>
            </View>
          )
        })}

        <View className='tabbar__fab-wrap'>
          {showVoiceTip && (
            <View className='tabbar__voice-tip' onClick={() => setShowVoiceTip(false)}>
              <Text className='tabbar__voice-tip-text'>长按说话，快速记录</Text>
              <View className='tabbar__voice-tip-arrow' />
            </View>
          )}
          <View
            className={`tabbar__fab${isRecording ? ' is-recording' : ''}`}
            onTouchStart={handleFabTouchStart}
            onTouchMove={handleFabTouchMove}
            onTouchEnd={handleFabTouchEnd}
          >
            <Text className='tabbar__fab-icon'>{isRecording ? '' : '+'}</Text>
            {isRecording && <View className='tabbar__fab-pulse' />}
          </View>
        </View>

        {RIGHT_TABS.map((tab) => {
          const isActive = activeTab === tab.key
          const icon = TABBAR_ICONS[tab.key]
          return (
            <View
              key={tab.key}
              className={`tabbar__item${isActive ? ' is-active' : ''}`}
              onClick={() => switchTo(tab.url)}
            >
              <Image
                className='tabbar__icon'
                src={isActive ? icon.active : icon.normal}
                mode='aspectFit'
              />
              <Text className='tabbar__label'>{tab.label}</Text>
            </View>
          )
        })}
      </View>

      <FabSheet
        open={fabOpen}
        onClose={() => setFabOpen(false)}
        groups={GLOBAL_FAB_GROUPS}
        onSelect={(key) => {
          const route = HOME_RECORD_ROUTES[key] ?? '/records'
          navigateToRecord(route)
        }}
      />
    </View>
  )
}
