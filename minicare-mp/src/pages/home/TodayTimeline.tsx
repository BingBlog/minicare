import { View, Text, Image } from '@tarojs/components'
import { useMemo, useState } from 'react'
import { formatTime } from '@/lib/utils'
import type { HomeRecord, TimelineSortMode } from './types'
import { RECORD_TYPE_CFG } from '@/lib/constants'
import { RECORD_TYPE_ICON_SRC } from '@/assets/icons/recordTypeIcons'

interface TodayTimelineProps {
  records: HomeRecord[]
  backendStatus: string
  onRecordClick?: (record: HomeRecord) => void
}

const RECORD_LIST_TYPE_ORDER = ['feeding', 'sleep', 'diaper', 'activity', 'health', 'growth', 'medical', 'symptom']

function getEnumLabel(
  _enums: Record<string, Array<{ value: string; label: string }>>,
  enumKey: string,
  value?: string
): string {
  if (!value) return ''
  const fallbackMap: Record<string, Record<string, string>> = {
    sleepPeriod: {
      night: '夜觉',
      morning_nap: '上午觉',
      afternoon_nap: '下午觉',
      other: '其他',
    },
    sleepQuality: {
      good: '质量好',
      normal: '一般',
      poor: '较差',
    },
    poopType: {
      normal: '正常软便',
      loose: '稀便',
      watery: '水样便',
      constipated: '偏硬便',
    },
    activityType: {
      bath: '洗澡',
      outdoor: '户外活动',
      play: '玩耍',
      tummy_time: '俯趴练习',
      other: '其他',
    },
    mood: {
      happy: '开心',
      calm: '平静',
      fussy: '烦躁',
      crying: '哭闹',
    },
    spiritLevel: {
      active: '精神活跃',
      normal: '精神正常',
      tired: '有点累',
      low: '萎靡',
    },
    visitType: {
      checkup: '常规体检',
      allergy: '过敏专科',
      sick: '生病就诊',
    },
  }
  return fallbackMap[enumKey]?.[value] ?? value
}

function formatDurationMin(min?: number): string {
  if (!min || !Number.isFinite(min)) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function getIconType(record: HomeRecord): string {
  if (record.type !== 'feeding') return record.type
  const feedType = record.detail?.feed_type as string | undefined
  if (feedType === 'formula') return 'formula'
  if (feedType === 'breast') return 'breast'
  if (feedType === 'supplement') return 'supplement'
  if (feedType === 'complementary') {
    const food = record.detail?.complementary_food as string | undefined
    return food === '营养素' ? 'supplement' : 'food'
  }
  return 'feeding'
}

function getRecordDisplay(record: HomeRecord, enums: Record<string, Array<{ value: string; label: string }>>) {
  const d = record.detail ?? {}
  if (record.type === 'feeding') {
    const feedType = d.feed_type as string | undefined
    if (feedType === 'formula') {
      const milkTypes = (d.milk_types as string[] | undefined) ?? []
      const ml = Number(d.formula_ml ?? 0)
      return {
        label: '配方奶',
        tags: milkTypes,
        summary: ml > 0 ? `${ml}ml` : '',
      }
    }
    if (feedType === 'breast') {
      const sideMap: Record<string, string> = { left: '左乳', right: '右乳', both: '双侧' }
      const side = sideMap[(d.breast_side as string) ?? ''] ?? '双侧'
      const dur = formatDurationMin(Number(d.duration_min ?? 0))
      return { label: '母乳', tags: [side], summary: dur }
    }
    if (feedType === 'supplement') {
      const suppItems = (d.supplement_items as Array<{ label?: string; dose?: string; unit?: string }> | undefined) ?? []
      return {
        label: '营养素',
        tags: suppItems.slice(0, 3).map((item) => `${item.label ?? ''}${item.dose ?? ''}${item.unit ?? ''}`.trim()).filter(Boolean),
        summary: '',
      }
    }
    if (feedType === 'complementary') {
      const food = (d.complementary_food as string | undefined) ?? ''
      const amount = Number(d.amount_g ?? 0)
      return {
        label: food === '营养素' ? '营养素' : '辅食',
        tags: food ? [food] : [],
        summary: amount > 0 ? `${amount}g` : '',
      }
    }
    return { label: '饮食', tags: [], summary: '' }
  }
  if (record.type === 'sleep') {
    const period = getEnumLabel(enums, 'sleepPeriod', d.sleep_period as string | undefined)
    const ongoing = d.status === 'ongoing'
    const quality = getEnumLabel(enums, 'sleepQuality', d.quality as string | undefined)
    return {
      label: ongoing ? (period ? `${period}中` : '睡眠中') : (period || '睡眠'),
      tags: [ongoing ? '进行中' : '', quality].filter(Boolean),
      summary: formatDurationMin(Number(d.duration_min ?? 0)),
    }
  }
  if (record.type === 'diaper') {
    const diaperType = d.diaper_type as string | undefined
    const poopType = d.poop_type as string | undefined
    const diaperLabelMap: Record<string, string> = { wet: '嘘嘘', dirty: '臭臭', mixed: '臭臭+嘘嘘', dry: '干净' }
    return {
      label: '换尿布',
      tags: [
        diaperLabelMap[diaperType ?? ''] ?? '',
        poopType ? getEnumLabel(enums, 'poopType', poopType) : '',
      ].filter(Boolean),
      summary: '',
    }
  }
  if (record.type === 'activity') {
    const actType = d.activity_type as string | undefined
    return {
      label: getEnumLabel(enums, 'activityType', actType) || '活动',
      tags: [],
      summary: formatDurationMin(Number(d.duration_min ?? 0)),
    }
  }
  if (record.type === 'health') {
    const temp = d.temperature as number | undefined
    return {
      label: '健康',
      tags: [temp != null && temp >= 37.5 ? '发热' : ''].filter(Boolean),
      summary: temp != null ? `${temp}℃` : '',
    }
  }
  if (record.type === 'growth') {
    const h = d.height_mm != null ? (Number(d.height_mm) / 10).toFixed(1) : ''
    const w = d.weight_g != null ? (Number(d.weight_g) / 1000).toFixed(2) : ''
    return {
      label: '生长',
      tags: [],
      summary: h ? `${h}cm` : (w ? `${w}kg` : ''),
    }
  }
  if (record.type === 'medical') {
    return {
      label: '医疗',
      tags: [getEnumLabel(enums, 'visitType', d.visit_type as string | undefined)].filter(Boolean),
      summary: '',
    }
  }
  if (record.type === 'symptom') {
    return {
      label: '表现',
      tags: [
        getEnumLabel(enums, 'mood', d.mood as string | undefined),
        getEnumLabel(enums, 'spiritLevel', d.spirit as string | undefined),
      ].filter(Boolean),
      summary: '',
    }
  }
  return { label: RECORD_TYPE_CFG[record.type]?.label ?? record.type, tags: [], summary: '' }
}

export default function TodayTimeline(props: TodayTimelineProps) {
  const { records, backendStatus, onRecordClick } = props
  const enums: Record<string, Array<{ value: string; label: string }>> = {}
  const [sortMode, setSortMode] = useState<TimelineSortMode>('type')
  const sortedRecords = useMemo(() => {
    const next = [...records]
    if (sortMode === 'time') {
      next.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      return next
    }
    next.sort((a, b) => {
      const ia = RECORD_LIST_TYPE_ORDER.indexOf(a.type)
      const ib = RECORD_LIST_TYPE_ORDER.indexOf(b.type)
      const oa = ia === -1 ? 999 : ia
      const ob = ib === -1 ? 999 : ib
      if (oa !== ob) return oa - ob
      return new Date(b.time).getTime() - new Date(a.time).getTime()
    })
    return next
  }, [records, sortMode])

  return (
    <View className='home-card'>
      <View className='home-card__head'>
        <Text className='home-card__title'>今日时间线</Text>
        <Text className='home-card__hint'>全部 ›</Text>
      </View>
      {backendStatus ? <Text className='home-api-status'>{backendStatus}</Text> : null}

      <View className='home-sort-switch'>
        <View
          className={`home-sort-switch__item ${sortMode === 'type' ? 'is-active' : ''}`}
          onClick={() => setSortMode('type')}
        >
          <Text>按类型</Text>
        </View>
        <View
          className={`home-sort-switch__item ${sortMode === 'time' ? 'is-active' : ''}`}
          onClick={() => setSortMode('time')}
        >
          <Text>按时间</Text>
        </View>
      </View>

      <View className='home-timeline'>
        {records.length === 0 && (
          <View className='home-empty'>
            <View className='home-empty__icon'>记</View>
            <Text className='home-empty__title'>今日尚无记录</Text>
            <Text className='home-empty__desc'>点击上方快捷按钮开始记录</Text>
          </View>
        )}
        {sortedRecords.map((record, idx) => {
          const prevType = idx > 0 ? sortedRecords[idx - 1].type : ''
          const showTypeHeader = sortMode === 'type' && record.type !== prevType
          const iconType =
            getIconType(record)
          const display = getRecordDisplay(record, enums)
          return (
            <View key={record.id}>
              {showTypeHeader ? (
                <View className='home-timeline__section'>
                  <Text className='home-timeline__section-text'>{RECORD_TYPE_CFG[record.type]?.label ?? record.type}</Text>
                </View>
              ) : null}
              <View className='home-timeline__item' onClick={() => onRecordClick?.(record)}>
                <Text className='home-timeline__time'>{formatTime(record.time)}</Text>
                <View className='home-timeline__body'>
                  <View className='home-timeline__meta'>
                    <View
                      className='home-timeline__icon'
                      style={{
                        background: `${RECORD_TYPE_CFG[iconType]?.color ?? '#E8E8E8'}1A`,
                      }}
                    >
                      <Image className='home-timeline__icon-img' src={RECORD_TYPE_ICON_SRC[iconType] ?? RECORD_TYPE_ICON_SRC.feeding} mode='aspectFit' />
                    </View>
                    <View className='home-timeline__text'>
                      <View className='home-timeline__title-row'>
                        <Text className='home-timeline__title'>{display.label}</Text>
                        {display.tags.slice(0, 2).map((tag) => (
                          <Text key={`${record.id}-${tag}`} className='home-timeline__tag'>{tag}</Text>
                        ))}
                      </View>
                      <Text className='home-timeline__desc'>{record.desc}</Text>
                    </View>
                    {display.summary ? <Text className='home-timeline__summary'>{display.summary}</Text> : null}
                    <Text className='home-timeline__arrow'>›</Text>
                  </View>
                </View>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

