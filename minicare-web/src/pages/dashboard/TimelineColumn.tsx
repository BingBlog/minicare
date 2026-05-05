/**
 * 今日节律 — 时间轴列（第五格）
 *
 * 用横向色带把喂奶、睡眠、换尿布三类事件叠加在 0~24h 轴上，
 * 一眼看出宝宝今天的作息规律，以及各类事件的分布密度。
 *
 * 下方附今日统计摘要：喂奶次数/总量、睡眠总时长、换尿布次数。
 */
import { useMemo } from 'react'
import type { DashboardData } from './useDashboardData'
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

  // ── 喂奶轨道：每次喂奶显示为一个 4px 宽的竖条 ──
  const feedingSegments = useMemo(() => {
    return data.feeding.map((r) => {
      const min = toMinOfDay(r.time)
      return { left: pct(min), width: '0.4%', key: r.id }
    })
  }, [data.feeding])

  // ── 睡眠轨道：每段睡眠显示为色带（有时长则有宽度，否则点状） ──
  const sleepSegments = useMemo(() => {
    return data.sleep.map((r) => {
      const startMin = toMinOfDay(r.time)
      const durationMin = (r.detail?.duration_min as number | undefined) ?? 0
      const status = r.detail?.status as string | undefined
      // 进行中的睡眠：用当前时间估算宽度
      const nowMin = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : startMin
      const endMin = status === 'ongoing' ? nowMin : startMin + durationMin
      const widthMin = Math.max(10, endMin - startMin) // 至少 10 分钟宽度保证可见
      return {
        left: pct(startMin),
        width: pct(widthMin),
        ongoing: status === 'ongoing',
        key: r.id,
      }
    })
  }, [data.sleep, isToday])

  // ── 尿布轨道：每次换尿布显示为竖条 ──
  const diaperSegments = useMemo(() => {
    return data.diaper.map((r) => {
      const min = toMinOfDay(r.time)
      return { left: pct(min), width: '0.4%', key: r.id }
    })
  }, [data.diaper])

  // ── 昨日节律对比（浅色背景） ──
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

  // ── 统计摘要 ──
  const stats = useMemo(() => {
    // 喂奶次数（不含补剂）
    const feedCount = data.feeding.length
    // 配方奶总量
    const totalMl = data.feeding.reduce((sum, r) => {
      const ml = r.detail?.formula_ml as number | undefined
      return sum + (ml ?? 0)
    }, 0)
    // 母乳总时长
    const breastMin = data.feeding.reduce((sum, r) => {
      const ft = r.detail?.feed_type as string | undefined
      const dur = r.detail?.duration_min as number | undefined
      return ft === 'breast' ? sum + (dur ?? 0) : sum
    }, 0)
    // 睡眠总时长（已结束的）
    const sleepMin = data.sleep.reduce((sum, r) => {
      const dur = r.detail?.duration_min as number | undefined
      return sum + (dur ?? 0)
    }, 0)
    // 换尿布次数
    const diaperCount = data.diaper.length

    return { feedCount, totalMl, breastMin, sleepMin, diaperCount }
  }, [data.feeding, data.sleep, data.diaper])

  const feedSummary = useMemo(() => {
    const parts: string[] = []
    if (stats.totalMl > 0) parts.push(fmtMl(stats.totalMl))
    if (stats.breastMin > 0) parts.push(`母乳${fmtMin(stats.breastMin)}`)
    return parts.join(' · ') || '暂无'
  }, [stats])

  return (
    <>
      <div className="db-col-header">
        <div className="db-col-title">
          <svg className="db-col-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          时间线
        </div>
      </div>

      <div className="db-timeline-body">
        {/* 喂奶轨道 — 今日/昨日双行 */}
        <div className="db-tl-track-wrap db-tl-track-wrap--dual">
          <span className="db-tl-track-label">喂奶 {stats.feedCount > 0 ? `· ${stats.feedCount}次` : ''}</span>
          <div className="db-tl-dual-row">
            <span className="db-tl-row-tag">今</span>
            <div className="db-tl-track">
              {feedingSegments.map((seg) => (
                <div
                  key={seg.key}
                  className="db-tl-segment"
                  style={{ left: seg.left, width: seg.width, background: '#f07888', opacity: 1 }}
                />
              ))}
            </div>
          </div>
          <div className="db-tl-dual-row db-tl-dual-row--yesterday">
            <span className="db-tl-row-tag db-tl-row-tag--yesterday">昨</span>
            <div className="db-tl-track db-tl-track--yesterday-row">
              {yesterdayFeedingSegments.map((seg) => (
                <div
                  key={seg.key}
                  className="db-tl-segment db-tl-segment--yesterday"
                  style={{ left: seg.left, width: seg.width, background: '#f07888' }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 睡眠轨道 — 今日/昨日双行 */}
        <div className="db-tl-track-wrap db-tl-track-wrap--dual">
          <span className="db-tl-track-label">睡眠 {stats.sleepMin > 0 ? `· ${fmtMin(stats.sleepMin)}` : ''}</span>
          <div className="db-tl-dual-row">
            <span className="db-tl-row-tag">今</span>
            <div className="db-tl-track">
              {sleepSegments.map((seg) => (
                <div
                  key={seg.key}
                  className={`db-tl-segment ${seg.ongoing ? 'db-tl-segment--ongoing' : ''}`}
                  style={{
                    left: seg.left,
                    width: seg.width,
                    background: '#7888e8',
                    opacity: 0.9,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="db-tl-dual-row db-tl-dual-row--yesterday">
            <span className="db-tl-row-tag db-tl-row-tag--yesterday">昨</span>
            <div className="db-tl-track db-tl-track--yesterday-row">
              {yesterdaySleepSegments.map((seg) => (
                <div
                  key={seg.key}
                  className="db-tl-segment db-tl-segment--yesterday"
                  style={{ left: seg.left, width: seg.width, background: '#7888e8' }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 尿布轨道 — 今日/昨日双行 */}
        <div className="db-tl-track-wrap db-tl-track-wrap--dual">
          <span className="db-tl-track-label">尿布 {stats.diaperCount > 0 ? `· ${stats.diaperCount}次` : ''}</span>
          <div className="db-tl-dual-row">
            <span className="db-tl-row-tag">今</span>
            <div className="db-tl-track">
              {diaperSegments.map((seg) => (
                <div
                  key={seg.key}
                  className="db-tl-segment"
                  style={{ left: seg.left, width: seg.width, background: '#5ac0e8', opacity: 1 }}
                />
              ))}
            </div>
          </div>
          <div className="db-tl-dual-row db-tl-dual-row--yesterday">
            <span className="db-tl-row-tag db-tl-row-tag--yesterday">昨</span>
            <div className="db-tl-track db-tl-track--yesterday-row">
              {yesterdayDiaperSegments.map((seg) => (
                <div
                  key={seg.key}
                  className="db-tl-segment db-tl-segment--yesterday"
                  style={{ left: seg.left, width: seg.width, background: '#5ac0e8' }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 时间刻度 */}
        <div className="db-tl-axis">
          {AXIS_TICKS.map((t) => (
            <span key={t} className="db-tl-axis-tick">{t}</span>
          ))}
        </div>

        {/* 统计摘要卡片 */}
        <div className="db-tl-stats">
          <div className="db-tl-stat">
            <span className="db-tl-stat-label">喂奶</span>
            <span className="db-tl-stat-value" style={{ color: '#f07888' }}>{stats.feedCount}<span style={{ fontSize: 11, fontWeight: 500, color: '#6a7090', marginLeft: 2 }}>次</span></span>
            <span className="db-tl-stat-sub">{feedSummary}</span>
          </div>
          <div className="db-tl-stat">
            <span className="db-tl-stat-label">睡眠</span>
            <span className="db-tl-stat-value" style={{ color: '#7888e8' }}>{fmtMin(stats.sleepMin)}</span>
            <span className="db-tl-stat-sub">{data.sleep.length}段</span>
          </div>
          <div className="db-tl-stat">
            <span className="db-tl-stat-label">尿布</span>
            <span className="db-tl-stat-value" style={{ color: '#5ac0e8' }}>{stats.diaperCount}<span style={{ fontSize: 11, fontWeight: 500, color: '#6a7090', marginLeft: 2 }}>次</span></span>
            <span className="db-tl-stat-sub">
              {data.diaper.filter(r => (r.detail?.diaper_type as string) === 'dirty' || (r.detail?.diaper_type as string) === 'mixed').length > 0
                ? `含便便 ${data.diaper.filter(r => (r.detail?.diaper_type as string) === 'dirty' || (r.detail?.diaper_type as string) === 'mixed').length}次`
                : '仅嘘嘘'}
            </span>
          </div>
          <div className="db-tl-stat">
            <span className="db-tl-stat-label">补剂</span>
            <span className="db-tl-stat-value" style={{ color: '#e8b84a' }}>{data.supplement.length}<span style={{ fontSize: 11, fontWeight: 500, color: '#6a7090', marginLeft: 2 }}>次</span></span>
            <span className="db-tl-stat-sub">{data.supplement.length > 0 ? '已记录' : '未记录'}</span>
          </div>
        </div>
      </div>
    </>
  )
}
