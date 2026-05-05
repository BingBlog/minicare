/**
 * 补剂/营养素列（与 Web 端业务逻辑完全一致）
 * 行布局：time | label | tags
 */
import { useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import type { DashboardData } from './types'
import type { TodayRecord } from '@/api'

interface SuppItem {
  key?: string
  label?: string
  dose?: string
  unit?: string
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  data: DashboardData
  onAdd?: () => void
}

function renderSupplementRow(r: TodayRecord) {
  const detail = r.detail ?? {}
  const items = (detail.supplement_items as SuppItem[] | undefined) ?? []
  const time = formatHM(r.time)

  return (
    <View key={r.id} className='db-row'>
      <Text className='db-row-time'>{time}</Text>
      <Text className='db-row-label'>营养素</Text>
      <View className='db-row-tags'>
        {items.map((it, i) => {
          const name = it.label ?? it.key ?? ''
          const dose = it.dose ? ` ${it.dose}${it.unit ?? ''}` : ''
          return <Text key={i} className='db-pill db-pill-amber'>{name}{dose}</Text>
        })}
      </View>
    </View>
  )
}

export default function SupplementColumn({ data, onAdd }: Props) {
  const records = data.supplement

  // 小结：列出所有营养素名称
  const summary = useMemo(() => {
    if (records.length === 0) return ''
    const names: string[] = []
    for (const r of records) {
      const items = (r.detail?.supplement_items as SuppItem[] | undefined) ?? []
      for (const it of items) {
        const name = it.label ?? it.key ?? ''
        if (name && !names.includes(name)) names.push(name)
      }
    }
    return names.length > 0 ? names.join('、') : `${records.length}项`
  }, [records])

  return (
    <View className='db-col'>
      <View className='db-col-header'>
        <View className='db-col-title'>
          <Text className='db-col-title-text'>补剂</Text>
          {onAdd && <Text className='db-col-add-btn' onClick={onAdd}>+记录</Text>}
        </View>
      </View>
      <View className='db-col-records'>
        {records.length === 0 ? (
          <Text className='db-empty'>暂无记录</Text>
        ) : (
          records.map((r) => renderSupplementRow(r))
        )}
        {summary && <Text className='db-col-summary'>{summary}</Text>}
      </View>
    </View>
  )
}
