/**
 * useQuickActionKeys
 *
 * 管理首页快捷记录入口的用户自定义配置：
 *  - 从 localStorage 读写 quickaction_keys
 *  - 首次使用时按宝宝月龄写入默认值
 *  - 计算 A区 / B区 分割
 *  - 暴露编辑模式（添加/删除格子）
 *
 * localStorage key: 'quickaction_keys'
 * 存储格式: JSON.stringify(string[])，最多 7 个，最少 1 个
 */
import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_QUICKACTION_KEYS_BY_AGE } from './constants'
import { useAppStore } from './store'

/** 最多 7 个快捷格子（A区 3 + B区 4） */
const MAX_KEYS = 7
/** A区最多展示前 N 个 */
const A_ZONE_SIZE = 3

const STORAGE_KEY = 'quickaction_keys'

/** 根据宝宝出生日期计算月龄段 */
function getAgeGroup(birthDate: string | null | undefined): string {
  if (!birthDate) return '6-11m'
  const birth = new Date(birthDate)
  const now = new Date()
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth())
  if (months <= 5) return '0-5m'
  if (months <= 11) return '6-11m'
  return '12m+'
}

export interface QuickActionKeysState {
  /** 当前快捷入口 key 列表（有序，前3 = A区，后n = B区） */
  keys: string[]
  /** A区 keys（前 A_ZONE_SIZE 个） */
  aKeys: string[]
  /** B区 keys（剩余） */
  bKeys: string[]
  /** 是否处于编辑模式 */
  isEditing: boolean
  /** 进入编辑模式 */
  startEditing: () => void
  /** 保存并退出编辑模式 */
  saveEditing: () => void
  /** 取消编辑（恢复到进入编辑前的状态） */
  cancelEditing: () => void
  /** 删除一个格子（编辑模式中使用） */
  removeKey: (key: string) => void
  /** 添加一个格子（编辑模式中使用，上限 MAX_KEYS） */
  addKey: (key: string) => void
  /** 拖拽结束后重排草稿顺序 */
  reorderDraft: (from: number, to: number) => void
}

export function useQuickActionKeys(): QuickActionKeysState {
  const { currentBaby } = useAppStore()

  const [keys, setKeys] = useState<string[]>([])
  const [draft, setDraft] = useState<string[]>([]) // 编辑中草稿
  const [isEditing, setIsEditing] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // ── 初始化：读 localStorage，首次按月龄写入默认值 ───────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setKeys(parsed)
          setInitialized(true)
          return
        }
      } catch {
        // 解析失败，沿用下面的默认值逻辑
      }
    }
    // 未设置过：按月龄写入默认值
    const ageGroup = getAgeGroup(currentBaby?.birth_date)
    const defaults = DEFAULT_QUICKACTION_KEYS_BY_AGE[ageGroup] ?? DEFAULT_QUICKACTION_KEYS_BY_AGE['6-11m']
    setKeys(defaults)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
    setInitialized(true)
  // 只在首次挂载或宝宝信息变化时重算默认值（不含 keys 依赖，避免循环）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBaby?.birth_date])

  // ── 编辑模式：进入、保存、取消 ──────────────────────────────────────────
  const startEditing = useCallback(() => {
    setDraft([...keys])
    setIsEditing(true)
  }, [keys])

  const saveEditing = useCallback(() => {
    // 至少保留 1 个
    const next = draft.length > 0 ? draft : keys.slice(0, 1)
    setKeys(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setIsEditing(false)
  }, [draft, keys])

  const cancelEditing = useCallback(() => {
    setDraft([])
    setIsEditing(false)
  }, [])

  // ── 编辑操作 ─────────────────────────────────────────────────────────────
  const removeKey = useCallback((key: string) => {
    setDraft((prev) => {
      if (prev.length <= 1) return prev // 最少保留 1 个
      return prev.filter((k) => k !== key)
    })
  }, [])

  const addKey = useCallback((key: string) => {
    setDraft((prev) => {
      if (prev.includes(key)) return prev
      if (prev.length >= MAX_KEYS) return prev
      return [...prev, key]
    })
  }, [])

  const reorderDraft = useCallback((from: number, to: number) => {
    setDraft((prev) => {
      if (from === to) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  // 编辑模式下，aKeys/bKeys 反映 draft；否则反映 keys
  const activeKeys = isEditing ? draft : keys
  const aKeys = activeKeys.slice(0, A_ZONE_SIZE)
  const bKeys = activeKeys.slice(A_ZONE_SIZE)

  // 保证初始化前不返回空数组（会短暂闪烁）
  if (!initialized) {
    return {
      keys: [],
      aKeys: [],
      bKeys: [],
      isEditing: false,
      startEditing,
      saveEditing,
      cancelEditing,
      removeKey,
      addKey,
      reorderDraft,
    }
  }

  return {
    keys,
    aKeys,
    bKeys,
    isEditing,
    startEditing,
    saveEditing,
    cancelEditing,
    removeKey,
    addKey,
    reorderDraft,
  }
}
