import { useState, useEffect, useCallback } from 'react'
import { recordsApi } from '@/api'
import type { TodayRecord } from '@/api'
import { suppItems } from '@/pages/records/feeding/types'
import type { SuppItem } from '@/pages/records/feeding/types'

export interface RecentSupplement {
  key: string
  label: string
  dose: string
  unit: string
  frequency: number
  lastUsedAt: string
  isPreset: boolean
  group?: 'must' | 'optional'
}

function getDateStr(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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

const presetMap = new Map<string, SuppItem>(suppItems.map(s => [s.key, s]))

export function useRecentSupplements(familyId: string | null, _babyId: string | null) {
  const [recentList, setRecentList] = useState<RecentSupplement[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!familyId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const dayPromises = Array.from({ length: 7 }, (_, i) =>
        recordsApi.today(familyId, getDateStr(i)).catch(() => [] as TodayRecord[])
      )
      const allRecords = (await Promise.all(dayPromises)).flat()

      const allItems = extractSupplementItems(allRecords)

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
          if (item.time > existing.lastUsedAt) {
            existing.lastUsedAt = item.time
            if (item.dose) existing.dose = item.dose
            if (item.unit) existing.unit = item.unit
          }
        }
      }

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
