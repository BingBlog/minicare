/**
 * useRecentSupplements — 聚合近 7 天补剂使用记录
 *
 * 功能：
 * 1. 从 recordsApi.today 获取近 7 天数据，提取 supplement 记录
 * 2. 去重合并所有 supplement_items，按使用频次降序排列
 * 3. 每项保留最近一次使用的剂量（dose/unit）作为默认值
 * 4. 支持自定义补剂（key='other'）也展示在快捷列表中
 */
import { useState, useEffect, useCallback } from 'react'
import { recordsApi } from '@/api'
import type { TodayRecord } from '@/api'
import { suppItems } from '@/pages/records/feeding/types'
import type { SuppItem } from '@/pages/records/feeding/types'

export interface RecentSupplement {
  /** 补剂 key（如 vitD / iron / other_xxx） */
  key: string
  /** 显示名称 */
  label: string
  /** 上次使用的剂量 */
  dose: string
  /** 单位 */
  unit: string
  /** 近 7 天使用次数 */
  frequency: number
  /** 最近一次使用时间（ISO 字符串） */
  lastUsedAt: string
  /** 是否是预设项（vs 自定义） */
  isPreset: boolean
  /** 所属分组 must/optional（仅预设项有） */
  group?: 'must' | 'optional'
}

/** 生成日期字符串 YYYY-MM-DD（向前偏移 offset 天） */
function getDateStr(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 从 TodayRecord[] 中提取补剂项 */
function extractSupplementItems(records: TodayRecord[]): Array<{
  key: string
  label: string
  dose: string
  unit: string
  time: string
}> {
  const items: Array<{ key: string; label: string; dose: string; unit: string; time: string }> = []
  for (const r of records) {
    if (r.type !== 'feeding') continue
    const detail = r.detail ?? {}
    const suppItemsRaw = detail.supplement_items as Array<{ key?: string; label?: string; dose?: string; unit?: string }> | undefined
    if (!suppItemsRaw || !Array.isArray(suppItemsRaw) || suppItemsRaw.length === 0) continue
    for (const it of suppItemsRaw) {
      if (!it.key && !it.label) continue
      items.push({
        key: it.key || `custom_${it.label}`,
        label: it.label || it.key || '',
        dose: it.dose || '',
        unit: it.unit || '',
        time: r.time,
      })
    }
  }
  return items
}

/** 预设 suppItems 的 key → SuppItem 映射 */
const presetMap = new Map<string, SuppItem>(suppItems.map(s => [s.key, s]))

/**
 * 顺序请求多天数据（避免微信小程序并发 wx.request 数量限制）
 * 每次最多同时发 2 个请求
 */
async function fetchDaysSequential(familyId: string, days: number): Promise<TodayRecord[]> {
  const results: TodayRecord[] = []
  const BATCH = 2
  for (let i = 0; i < days; i += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, days - i) }, (_, j) =>
      recordsApi.today(familyId, getDateStr(i + j)).catch(() => [] as TodayRecord[])
    )
    const batchResults = await Promise.all(batch)
    results.push(...batchResults.flat())
  }
  return results
}

export function useRecentSupplements(familyId: string | null, _babyId: string | null) {
  const [recentList, setRecentList] = useState<RecentSupplement[]>([])
  const [loading, setLoading] = useState(true) // 初始为 true，避免闪烁空态

  const fetch = useCallback(async () => {
    if (!familyId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      // 顺序分批请求近 7 天数据（每批 2 个，避免并发超限）
      const allRecords = await fetchDaysSequential(familyId, 7)

      // 提取所有补剂项
      const allItems = extractSupplementItems(allRecords)

      // 按 key 聚合：频次 + 最近时间 + 最近剂量
      const map = new Map<string, {
        key: string; label: string; dose: string; unit: string
        frequency: number; lastUsedAt: string
      }>()

      for (const item of allItems) {
        const existing = map.get(item.key)
        if (!existing) {
          map.set(item.key, {
            key: item.key,
            label: item.label,
            dose: item.dose,
            unit: item.unit,
            frequency: 1,
            lastUsedAt: item.time,
          })
        } else {
          existing.frequency++
          // 更新为最近一次的剂量
          if (item.time > existing.lastUsedAt) {
            existing.lastUsedAt = item.time
            if (item.dose) existing.dose = item.dose
            if (item.unit) existing.unit = item.unit
          }
        }
      }

      // 转为数组，补充 preset 信息，按频次降序
      const result: RecentSupplement[] = Array.from(map.values())
        .map(it => {
          const preset = presetMap.get(it.key)
          return {
            ...it,
            label: preset?.label || it.label,
            unit: preset?.unit || it.unit,
            isPreset: !!preset,
            group: preset?.group,
          }
        })
        .sort((a, b) => {
          // must 组优先，然后按频次降序
          if (a.group === 'must' && b.group !== 'must') return -1
          if (b.group === 'must' && a.group !== 'must') return 1
          return b.frequency - a.frequency
        })

      setRecentList(result)
    } catch (err) {
      console.error('[useRecentSupplements] error:', err)
    } finally {
      setLoading(false)
    }
  }, [familyId])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { recentList, loading, refresh: fetch }
}
