import Taro from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { DEFAULT_QUICKACTION_KEYS_BY_AGE } from './constants'

const STORAGE_KEY = 'quickaction_keys'
/** 存量配置的迁移版本号：缺失或小于当前值 = 按旧的 8 格上限写入，需要一次性补齐 */
const MIGRATION_KEY = 'quickaction_keys_migrated'
const MIGRATION_VERSION = 2

/** 快捷区最大格子数：4 列 × 3 行 = 12 宫格 */
export const MAX_QUICK_KEYS = 12
/** A 区（第一行）固定 4 个，其余落入 B 区网格 */
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

/**
 * 把存量快捷配置补齐到当前上限。
 *
 * 背景：宫格上限从 8 提升到 12 后，老用户 Storage 里仍是 8 项，
 * 不补齐就看不到新增的第 3 行 —— 等于功能没上线。
 *
 * 只在「存量每一项都还在该月龄默认值里」时才补齐：用户若把自己加的入口
 * （或默认之外的类型）放进快捷区，说明是主动定制过的，不强行动他的配置。
 */
function migrateKeys(stored: string[], defaults: string[]): string[] {
  const untouched = stored.every((key) => defaults.includes(key))
  if (!untouched) return stored
  return [...stored, ...defaults.filter((key) => !stored.includes(key))].slice(0, MAX_KEYS)
}

export function useQuickActionKeys(birthDate?: string | null) {
  const [keys, setKeys] = useState<string[]>([])
  const [draft, setDraft] = useState<string[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    const ageGroup = getAgeGroup(birthDate)
    const defaults = DEFAULT_QUICKACTION_KEYS_BY_AGE[ageGroup] ?? DEFAULT_QUICKACTION_KEYS_BY_AGE['6-11m']

    const stored = Taro.getStorageSync(STORAGE_KEY)
    if (typeof stored === 'string' && stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((key): key is string => typeof key === 'string')
          // 月龄未知（首页首帧还没拉到宝宝档案）时先不迁移：此刻拿不准该用哪套默认值补齐，
          // 等 birthDate 到位后本 effect 会带着正确月龄再跑一次。
          const shouldMigrate =
            !!birthDate &&
            valid.length < MAX_KEYS &&
            Taro.getStorageSync(MIGRATION_KEY) !== MIGRATION_VERSION
          const next = shouldMigrate ? migrateKeys(valid, defaults) : valid.slice(0, MAX_KEYS)
          setKeys(next)
          if (shouldMigrate) {
            Taro.setStorageSync(STORAGE_KEY, JSON.stringify(next))
            Taro.setStorageSync(MIGRATION_KEY, MIGRATION_VERSION)
          }
          setInitialized(true)
          return
        }
      } catch {
        // ignore malformed storage
      }
    }

    setKeys(defaults)
    setInitialized(true)
    // 月龄未知时先不落盘，避免按兜底月龄把默认值写死；等 birthDate 到位再持久化
    if (birthDate) {
      Taro.setStorageSync(STORAGE_KEY, JSON.stringify(defaults))
      Taro.setStorageSync(MIGRATION_KEY, MIGRATION_VERSION)
    }
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
