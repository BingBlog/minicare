/**
 * 今日节律 - 时间轴列（MP 版）
 *
 * 用横向色带把喂奶、睡眠、换尿布三类事件叠加在 0~24h 轴上，
 * 一眼看出宝宝今天的作息规律，以及各类事件的分布密度。
 *
 * 差异化：
 * - div/span → View/Text
 * - SVG 图标 → 文字标签
 * - CSS class 不变，样式用 rpx
 * - inline style 对象保持不变
 */
import { useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import type { DashboardData } from './types'
import { getTodayStr } from './useDashboardData'

interface Props {
  data: DashboardData
  selectedDate: string
}

/** 将 ISO 时间字符串转为当天的分钟偏移（0~1440） */
function toMinOfDay(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** 将分钟偏移转为百分比（0~100） */
function pct(min: number): string {
  return `${Math.min(100, Math.max(0, (min / 1440) * 100)).toFixed(2)}%`
}

/** 格式化分钟为 Xh Xm */
function fmtMin(min: number): string {
  if (min <= 0) return '0m'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/** 格式化毫升 */
function fmtMl(ml: number): string {
  return ml >= 1000 ? `${(ml / 1000).toFixed(1)}L` : `${ml}ml`
}

const AXIS_TICKS = ['0', '6', '12', '18', '24']

export default function TimelineColumn({ data, selectedDate }: Props) {
  const isToday = selectedDate === getTodayStr()

  // 喂奶轨道：每次喂奶显示为一个竖条
  const feedingSegments = useMemo(() => {
    return data.feeding.map((r) => {
      const min = toMinOfDay(r.time)
      return { left: pct(min), width: '0.4%', key: r.id }
    })
  }, [data.feeding])

  // 睡眠轨道：每段睡眠显示为色带
  const sleepSegments = useMemo(() => {
    return data.sleep.map((r) => {
      const startMin = toMinOfDay(r.time)
      const durationMin = (r.detail?.duration_min as number | undefined) ?? 0
      const status = r.detail?.status as string | undefined
      const nowMin = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : startMin
      const endMin = status === 'ongoing' ? nowMin : startMin + durationMin
      const widthMin = Math.max(10, endMin - startMin)
      return {
        left: pct(startMin),
        width: pct(widthMin),
        ongoing: status === 'ongoing',
        key: r.id,
      }
    })
  }, [data.sleep, isToday])

  // 尿布轨道：每次换尿布显示为竖条
  const diaperSegments = useMemo(() => {
    return data.diaper.map((r) => {
      const min = toMinOfDay(r.time)
      return { left: pct(min), width: '0.4%', key: r.id }
    })
  }, [data.diaper])

  // 昨日节律对比
  const yesterdayFeedingSegments = useMemo(() => {
    return data.yesterdayFeeding.map((r) => {
      const min = toMinOfDay(r.time)
      return { left: pct(min), width: '0.4%', key: `y-${r.id}` }
    })
  }, [data.yesterdayFeeding])

  const yesterdaySleepSegments = useMemo(() => {
    return data.yesterdaySleep.map((r) => {
      const startMin = toMinOfDay(r.time)
      const durationMin = (r.detail?.duration_min as number | undefined) ?? 0
      const widthMin = Math.max(10, durationMin)
      return {
        left: pct(startMin),
        width: pct(widthMin),
        key: `y-${r.id}`,
      }
    })
  }, [data.yesterdaySleep])

  const yesterdayDiaperSegments = useMemo(() => {
    return data.yesterdayDiaper.map((r) => {
      const min = toMinOfDay(r.time)
      return { left: pct(min), width: '0.4%', key: `y-${r.id}` }
    })
  }, [data.yesterdayDiaper])

  // 统计摘要
  const stats = useMemo(() => {
    const feedCount = data.feeding.length
    const totalMl = data.feeding.reduce((sum, r) => {
      const ml = r.detail?.formula_ml as number | undefined
      return sum + (ml ?? 0)
    }, 0)
    const breastMin = data.feeding.reduce((sum, r) => {
      const ft = r.detail?.feed_type as string | undefined
      const dur = r.detail?.duration_min as number | undefined
      return ft === 'breast' ? sum + (dur ?? 0) : sum
    }, 0)
    const sleepMin = data.sleep.reduce((sum, r) => {
      const dur = r.detail?.duration_min as number | undefined
      return sum + (dur ?? 0)
    }, 0)
    const diaperCount = data.diaper.length
    return { feedCount, totalMl, breastMin, sleepMin, diaperCount }
  }, [data.feeding, data.sleep, data.diaper])

  const feedSummary = useMemo(() => {
    const parts: string[] = []
    if (stats.totalMl > 0) parts.push(fmtMl(stats.totalMl))
    if (stats.breastMin > 0) parts.push(`母乳${fmtMin(stats.breastMin)}`)
    return parts.join(' / ') || '暂无'
  }, [stats])

  return (
    <View className='db-col'>
      <View className='db-col-header'>
        <View className='db-col-title'>
          <Text className='db-col-title-text'>时间线</Text>
        </View>
      </View>

      <View className='db-timeline-body'>
        {/* 喂奶轨道 */}
        <View className='db-tl-track-wrap'>
          <Text className='db-tl-track-label'>
            喂奶 {stats.feedCount > 0 ? `${stats.feedCount}次` : ''}
          </Text>
          <View className='db-tl-dual-row'>
            <Text className='db-tl-row-tag'>今</Text>
            <View className='db-tl-track'>
              {feedingSegments.map((seg) => (
                <View
                  key={seg.key}
                  className='db-tl-segment'
                  style={{ left: seg.left, width: seg.width, background: '#f07888' }}
                />
              ))}
            </View>
          </View>
          <View className='db-tl-dual-row db-tl-dual-row--yesterday'>
            <Text className='db-tl-row-tag db-tl-row-tag--yesterday'>昨</Text>
            <View className='db-tl-track db-tl-track--yesterday'>
              {yesterdayFeedingSegments.map((seg) => (
                <View
                  key={seg.key}
                  className='db-tl-segment db-tl-segment--yesterday'
                  style={{ left: seg.left, width: seg.width, background: '#f07888' }}
                />
              ))}
            </View>
          </View>
        </View>

        {/* 睡眠轨道 */}
        <View className='db-tl-track-wrap'>
          <Text className='db-tl-track-label'>
            睡眠 {stats.sleepMin > 0 ? fmtMin(stats.sleepMin) : ''}
          </Text>
          <View className='db-tl-dual-row'>
            <Text className='db-tl-row-tag'>今</Text>
            <View className='db-tl-track'>
              {sleepSegments.map((seg) => (
                <View
                  key={seg.key}
                  className={`db-tl-segment ${seg.ongoing ? 'db-tl-segment--ongoing' : ''}`}
                  style={{ left: seg.left, width: seg.width, background: '#7888e8', opacity: 0.9 }}
                />
              ))}
            </View>
          </View>
          <View className='db-tl-dual-row db-tl-dual-row--yesterday'>
            <Text className='db-tl-row-tag db-tl-row-tag--yesterday'>昨</Text>
            <View className='db-tl-track db-tl-track--yesterday'>
              {yesterdaySleepSegments.map((seg) => (
                <View
                  key={seg.key}
                  className='db-tl-segment db-tl-segment--yesterday'
                  style={{ left: seg.left, width: seg.width, background: '#7888e8' }}
                />
              ))}
            </View>
          </View>
        </View>

        {/* 尿布轨道 */}
        <View className='db-tl-track-wrap'>
          <Text className='db-tl-track-label'>
            尿布 {stats.diaperCount > 0 ? `${stats.diaperCount}次` : ''}
          </Text>
          <View className='db-tl-dual-row'>
            <Text className='db-tl-row-tag'>今</Text>
            <View className='db-tl-track'>
              {diaperSegments.map((seg) => (
                <View
                  key={seg.key}
                  className='db-tl-segment'
                  style={{ left: seg.left, width: seg.width, background: '#5ac0e8' }}
                />
              ))}
            </View>
          </View>
          <View className='db-tl-dual-row db-tl-dual-row--yesterday'>
            <Text className='db-tl-row-tag db-tl-row-tag--yesterday'>昨</Text>
            <View className='db-tl-track db-tl-track--yesterday'>
              {yesterdayDiaperSegments.map((seg) => (
                <View
                  key={seg.key}
                  className='db-tl-segment db-tl-segment--yesterday'
                  style={{ left: seg.left, width: seg.width, background: '#5ac0e8' }}
                />
              ))}
            </View>
          </View>
        </View>

        {/* 时间刻度 */}
        <View className='db-tl-axis'>
          {AXIS_TICKS.map((t) => (
            <Text key={t} className='db-tl-axis-tick'>{t}</Text>
          ))}
        </View>

        {/* 统计摘要 */}
        <View className='db-tl-stats'>
          <View className='db-tl-stat'>
            <Text className='db-tl-stat-label'>喂奶</Text>
            <Text className='db-tl-stat-value' style={{ color: '#f07888' }}>
              {stats.feedCount}次
            </Text>
            <Text className='db-tl-stat-sub'>{feedSummary}</Text>
          </View>
          <View className='db-tl-stat'>
            <Text className='db-tl-stat-label'>睡眠</Text>
            <Text className='db-tl-stat-value' style={{ color: '#7888e8' }}>
              {fmtMin(stats.sleepMin)}
            </Text>
            <Text className='db-tl-stat-sub'>{data.sleep.length}段</Text>
          </View>
          <View className='db-tl-stat'>
            <Text className='db-tl-stat-label'>尿布</Text>
            <Text className='db-tl-stat-value' style={{ color: '#5ac0e8' }}>
              {stats.diaperCount}次
            </Text>
            <Text className='db-tl-stat-sub'>
              {data.diaper.filter(r => {
                const dt = r.detail?.diaper_type as string | undefined
                return dt === 'dirty' || dt === 'mixed'
              }).length > 0
                ? `含便便 ${data.diaper.filter(r => { const dt = r.detail?.diaper_type as string | undefined; return dt === 'dirty' || dt === 'mixed' }).length}次`
                : '仅嘘嘘'}
            </Text>
          </View>
          <View className='db-tl-stat'>
            <Text className='db-tl-stat-label'>补剂</Text>
            <Text className='db-tl-stat-value' style={{ color: '#e8b84a' }}>
              {data.supplement.length}次
            </Text>
            <Text className='db-tl-stat-sub'>
              {data.supplement.length > 0 ? '已记录' : '未记录'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}
