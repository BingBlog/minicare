import Taro from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { DEFAULT_QUICKACTION_KEYS_BY_AGE } from './constants'

const STORAGE_KEY = 'quickaction_keys'
export const MAX_QUICK_KEYS = 8
export const QUICK_A_ZONE_SIZE = 4

const MAX_KEYS = MAX_QUICK_KEYS
const A_ZONE_SIZE = QUICK_A_ZONE_SIZE

function getAgeGroup(birthDate?: string | null): string {
  if (!birthDate) return '6-11m'
  const months = dayjs().diff(dayjs(birthDate), 'month')
  if (months <= 5) return '0-5m'
  if (months <= 11) return '6-11m'
  return '12m+'
}

export function useQuickActionKeys(birthDate?: string | null) {
  const [keys, setKeys] = useState<string[]>([])
  const [draft, setDraft] = useState<string[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    const stored = Taro.getStorageSync(STORAGE_KEY)
    if (typeof stored === 'string') {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setKeys(parsed)
          setInitialized(true)
          return
        }
      } catch {
        // ignore malformed storage
      }
    }
    const ageGroup = getAgeGroup(birthDate)
    const defaults = DEFAULT_QUICKACTION_KEYS_BY_AGE[ageGroup] ?? DEFAULT_QUICKACTION_KEYS_BY_AGE['6-11m']
    setKeys(defaults)
    Taro.setStorageSync(STORAGE_KEY, JSON.stringify(defaults))
    setInitialized(true)
  }, [birthDate])

  const startEditing = useCallback(() => {
    setDraft([...keys])
    setIsEditing(true)
  }, [keys])

  const saveEditing = useCallback(() => {
    const next = draft.length > 0 ? draft : keys.slice(0, 1)
    setKeys(next)
    Taro.setStorageSync(STORAGE_KEY, JSON.stringify(next))
    setIsEditing(false)
  }, [draft, keys])

  const cancelEditing = useCallback(() => {
    setDraft([])
    setIsEditing(false)
  }, [])

  const removeKey = useCallback((key: string) => {
    setDraft((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((k) => k !== key)
    })
  }, [])

  const addKey = useCallback((key: string) => {
    setDraft((prev) => {
      if (prev.includes(key) || prev.length >= MAX_KEYS) return prev
      return [...prev, key]
    })
  }, [])

  const moveKey = useCallback((index: number, direction: 'left' | 'right') => {
    setDraft((prev) => {
      const to = direction === 'left' ? index - 1 : index + 1
      if (to < 0 || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const activeKeys = isEditing ? draft : keys
  const aKeys = activeKeys.slice(0, A_ZONE_SIZE)
  const bKeys = activeKeys.slice(A_ZONE_SIZE)

  return {
    initialized,
    keys,
    aKeys,
    bKeys,
    isEditing,
    startEditing,
    saveEditing,
    cancelEditing,
    removeKey,
    addKey,
    moveKey,
  }
}
