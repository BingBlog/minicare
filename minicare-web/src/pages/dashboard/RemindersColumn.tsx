/**
 * 提醒待办列（第六格）
 *
 * 纯前端计算，不需要新接口，基于当日已有数据推算：
 *
 * 1. 下次喂奶预计时间 — 基于最近两次喂奶间隔推算
 * 2. 宝宝可能该睡了 — 基于上次睡醒时间 + 平均清醒时长
 * 3. 今日待完成项 — 体温未记录 / 补剂未喂 / 活动未记录
 *
 * 仅在查看今日时显示实时提醒；历史日期显示当日完成情况。
 */
import { useMemo } from 'react'
import type { DashboardData } from './useDashboardData'
import { getTodayStr } from './useDashboardData'
import type { DrawerRecordType } from './RecordDrawer'

interface Props {
  data: DashboardData
  selectedDate: string
  onAdd: (type: DrawerRecordType) => void
}

/** 进度条组件：今日 vs 昨日对比 */
function ProgressBar({ current, total, label }: { current: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
  return (
    <div className="db-reminder-progress">
      <div className="db-reminder-progress-bar">
        <div
          className="db-reminder-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="db-reminder-progress-label">{label}</span>
    </div>
  )
}

interface ReminderItem {
  id: string
  level: 'urgent' | 'warn' | 'ok' | 'todo'
  icon: React.ReactNode
  title: string
  desc: string
  action?: { label: string; type: DrawerRecordType }
  progress?: { current: number; total: number; label: string }
}

/** 将分钟差格式化为 "X小时X分" */
function fmtDiff(diffMin: number): string {
  if (diffMin < 0) return '已过'
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  if (h === 0) return `${m}分钟后`
  return m > 0 ? `${h}小时${m}分后` : `${h}小时后`
}

/** 将分钟差格式化为"距上次 X 小时" */
function fmtElapsed(diffMin: number): string {
  if (diffMin < 0) return '--'
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  if (h === 0) return `${m}分钟前`
  return m > 0 ? `${h}小时${m}分前` : `${h}小时前`
}

// SVG 图标
const IconFeed = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

const IconSleep = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

const IconTemp = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
  </svg>
)

const IconPill = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.5 20H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v3" />
    <circle cx="18" cy="18" r="3" />
    <path d="m22 22-1.5-1.5" />
  </svg>
)

const IconActivity = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export default function RemindersColumn({ data, selectedDate, onAdd }: Props) {
  const isToday = selectedDate === getTodayStr()
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const reminders = useMemo<ReminderItem[]>(() => {
    const items: ReminderItem[] = []

    if (isToday) {
      // ── 1. 下次喂奶预计 + 昨日对比进度 ─────────────────────────
      const feedings = data.feeding
      const feedProgress = data.yesterdayFeedingCount > 0
        ? { current: feedings.length, total: data.yesterdayFeedingCount, label: `${feedings.length}/${data.yesterdayFeedingCount} (昨日)` }
        : undefined

      if (feedings.length >= 2) {
        // 取最近两次喂奶间隔的平均值
        const recent = feedings.slice(-3)
        let totalGap = 0
        let gapCount = 0
        for (let i = 1; i < recent.length; i++) {
          const gap = (new Date(recent[i].time).getTime() - new Date(recent[i - 1].time).getTime()) / 60_000
          if (gap > 0 && gap < 360) { // 忽略超过 6h 的异常间隔
            totalGap += gap
            gapCount++
          }
        }
        if (gapCount > 0) {
          const avgGap = totalGap / gapCount
          const lastFeedTime = new Date(feedings[feedings.length - 1].time)
          const lastFeedMin = lastFeedTime.getHours() * 60 + lastFeedTime.getMinutes()
          const nextFeedMin = lastFeedMin + avgGap
          const diffMin = Math.round(nextFeedMin - nowMin)

          const level: ReminderItem['level'] = diffMin < 0 ? 'urgent' : diffMin < 30 ? 'warn' : 'ok'
          items.push({
            id: 'next-feed',
            level,
            icon: <IconFeed />,
            title: diffMin < 0 ? '该喂奶了' : `预计 ${fmtDiff(diffMin)} 喂奶`,
            desc: `上次 ${fmtElapsed(nowMin - lastFeedMin)}，平均间隔 ${Math.round(avgGap)}分钟`,
            action: diffMin < 0 ? { label: '记录', type: 'feeding' } : undefined,
            progress: feedProgress,
          })
        }
      } else if (feedings.length === 1) {
        const lastFeedTime = new Date(feedings[0].time)
        const lastFeedMin = lastFeedTime.getHours() * 60 + lastFeedTime.getMinutes()
        const elapsedMin = nowMin - lastFeedMin
        const level: ReminderItem['level'] = elapsedMin > 180 ? 'urgent' : elapsedMin > 120 ? 'warn' : 'ok'
        items.push({
          id: 'next-feed',
          level,
          icon: <IconFeed />,
          title: `距上次喂奶 ${fmtElapsed(elapsedMin)}`,
          desc: '今日仅1次记录，无法预测间隔',
          action: elapsedMin > 120 ? { label: '记录', type: 'feeding' } : undefined,
          progress: feedProgress,
        })
      } else {
        items.push({
          id: 'next-feed',
          level: 'todo',
          icon: <IconFeed />,
          title: '今日暂无喂奶记录',
          desc: '记录第一次喂奶',
          action: { label: '记录', type: 'feeding' },
          progress: feedProgress,
        })
      }

      // ── 1.5 尿布进度（昨日对比）──────────────────────────────
      const diaperProgress = data.yesterdayDiaperCount > 0
        ? { current: data.diaper.length, total: data.yesterdayDiaperCount, label: `${data.diaper.length}/${data.yesterdayDiaperCount} (昨日)` }
        : undefined
      if (diaperProgress) {
        const dLevel: ReminderItem['level'] = data.diaper.length >= data.yesterdayDiaperCount ? 'ok' : 'warn'
        items.push({
          id: 'diaper-progress',
          level: dLevel,
          icon: <IconActivity />,
          title: `换尿布 ${data.diaper.length}次`,
          desc: data.diaper.length >= data.yesterdayDiaperCount ? '已达昨日水平' : '尿布次数低于昨日',
          action: { label: '记录', type: 'diaper' },
          progress: diaperProgress,
        })
      }

      // ── 2. 睡眠状态 ──────────────────────────────────────────
      if (data.isSleeping && data.sleepingSince) {
        const sleepStartMin = new Date(data.sleepingSince).getHours() * 60 + new Date(data.sleepingSince).getMinutes()
        const sleepElapsed = nowMin - sleepStartMin
        const h = Math.floor(sleepElapsed / 60)
        const m = sleepElapsed % 60
        const sleepStr = h > 0 ? `${h}小时${m > 0 ? m + '分' : ''}` : `${m}分钟`
        items.push({
          id: 'sleep-status',
          level: 'ok',
          icon: <IconSleep />,
          title: `睡眠中 · 已 ${sleepStr}`,
          desc: '宝宝正在睡觉，保持安静',
        })
      } else {
        // 上次睡醒后清醒时长
        const endedSleeps = data.sleep.filter(r => r.detail?.status !== 'ongoing')
        if (endedSleeps.length > 0) {
          const lastSleep = endedSleeps[endedSleeps.length - 1]
          const dur = (lastSleep.detail?.duration_min as number | undefined) ?? 0
          const startMin = new Date(lastSleep.time).getHours() * 60 + new Date(lastSleep.time).getMinutes()
          const wakeMin = startMin + dur
          const awakeMin = nowMin - wakeMin
          // 新生儿清醒时长通常 1~2h，超过 2h 提示可能需要睡了
          const level: ReminderItem['level'] = awakeMin > 120 ? 'warn' : 'ok'
          items.push({
            id: 'sleep-status',
            level,
            icon: <IconSleep />,
            title: awakeMin > 120 ? '宝宝可能累了' : `清醒中 · ${Math.round(awakeMin)}分钟`,
            desc: awakeMin > 120
              ? `已清醒 ${Math.floor(awakeMin / 60)}小时${awakeMin % 60}分，可以尝试哄睡`
              : `上次睡了 ${Math.floor(dur / 60) > 0 ? Math.floor(dur / 60) + 'h ' : ''}${dur % 60}m`,
            action: awakeMin > 120 ? { label: '记录', type: 'sleep' } : undefined,
          })
        }
      }

      // ── 3. 体温未记录 ─────────────────────────────────────────
      if (data.health.length === 0) {
        items.push({
          id: 'todo-temp',
          level: 'todo',
          icon: <IconTemp />,
          title: '今日体温未记录',
          desc: '建议每日测量体温',
          action: { label: '记录', type: 'health' },
        })
      } else {
        const latestTemp = data.latestTemp
        if (latestTemp != null) {
          const isFever = latestTemp >= 37.5
          items.push({
            id: 'todo-temp',
            level: isFever ? 'urgent' : 'ok',
            icon: <IconTemp />,
            title: isFever ? `发热 ${latestTemp.toFixed(1)}°C` : `体温正常 ${latestTemp.toFixed(1)}°C`,
            desc: isFever ? '请注意观察，必要时就医' : '今日已记录体温',
          })
        }
      }

      // ── 4. 补剂未喂 ───────────────────────────────────────────
      if (data.supplement.length === 0) {
        items.push({
          id: 'todo-supplement',
          level: 'todo',
          icon: <IconPill />,
          title: '今日补剂未记录',
          desc: '维D、DHA 等营养素',
          action: { label: '记录', type: 'feeding' },
        })
      } else {
        items.push({
          id: 'todo-supplement',
          level: 'ok',
          icon: <IconPill />,
          title: `补剂已记录 ${data.supplement.length}次`,
          desc: '今日营养素已完成',
        })
      }

      // ── 5. 活动未记录 ─────────────────────────────────────────
      if (data.activity.length === 0) {
        items.push({
          id: 'todo-activity',
          level: 'todo',
          icon: <IconActivity />,
          title: '今日活动未记录',
          desc: '早教互动、户外活动等',
          action: { label: '记录', type: 'activity' },
        })
      } else {
        const totalMin = data.activity.reduce((s, r) => s + ((r.detail?.duration_min as number | undefined) ?? 0), 0)
        items.push({
          id: 'todo-activity',
          level: 'ok',
          icon: <IconActivity />,
          title: `活动 ${data.activity.length}次`,
          desc: totalMin > 0 ? `共 ${Math.floor(totalMin / 60) > 0 ? Math.floor(totalMin / 60) + 'h ' : ''}${totalMin % 60}m` : '已记录',
        })
      }
    } else {
      // ── 历史日期：显示当日完成情况汇总 ──────────────────────
      const feedCount = data.feeding.length
      const sleepCount = data.sleep.length
      const sleepMin = data.sleep.reduce((s, r) => s + ((r.detail?.duration_min as number | undefined) ?? 0), 0)
      const diaperCount = data.diaper.length
      const hasTemp = data.health.length > 0
      const hasSupp = data.supplement.length > 0

      items.push({
        id: 'hist-feed',
        level: feedCount > 0 ? 'ok' : 'todo',
        icon: <IconFeed />,
        title: feedCount > 0 ? `喂奶 ${feedCount}次` : '当日无喂奶记录',
        desc: feedCount > 0 ? `当日喂养记录` : '',
      })
      items.push({
        id: 'hist-sleep',
        level: sleepCount > 0 ? 'ok' : 'todo',
        icon: <IconSleep />,
        title: sleepCount > 0 ? `睡眠 ${sleepCount}段` : '当日无睡眠记录',
        desc: sleepMin > 0 ? `共 ${Math.floor(sleepMin / 60)}h ${sleepMin % 60}m` : '',
      })
      items.push({
        id: 'hist-diaper',
        level: diaperCount > 0 ? 'ok' : 'todo',
        icon: <IconActivity />,
        title: diaperCount > 0 ? `换尿布 ${diaperCount}次` : '当日无尿布记录',
        desc: '',
      })
      items.push({
        id: 'hist-temp',
        level: hasTemp ? 'ok' : 'todo',
        icon: <IconTemp />,
        title: hasTemp ? `体温已记录` : '当日体温未记录',
        desc: data.latestTemp != null ? `最高 ${data.latestTemp.toFixed(1)}°C` : '',
      })
      items.push({
        id: 'hist-supp',
        level: hasSupp ? 'ok' : 'todo',
        icon: <IconPill />,
        title: hasSupp ? `补剂已记录 ${data.supplement.length}次` : '当日补剂未记录',
        desc: '',
      })
    }

    return items
  }, [data, isToday, nowMin])

  // 图标背景色映射
  const iconBg: Record<ReminderItem['level'], string> = {
    urgent: 'rgba(240,104,120,0.15)',
    warn: 'rgba(232,184,74,0.12)',
    ok: 'rgba(90,180,120,0.12)',
    todo: 'rgba(180,100,220,0.12)',
  }
  const iconColor: Record<ReminderItem['level'], string> = {
    urgent: '#f06878',
    warn: '#e8b84a',
    ok: '#68c090',
    todo: '#c47de0',
  }

  return (
    <>
      <div className="db-col-header">
        <div className="db-col-title">
          <svg className="db-col-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          {isToday ? '提醒 · 待办' : '当日完成情况'}
        </div>
      </div>

      <div className="db-reminders-body">
        {reminders.map((item) => (
          <div key={item.id} className={`db-reminder-card db-reminder-card--${item.level}`}>
            <div
              className="db-reminder-icon"
              style={{ background: iconBg[item.level], color: iconColor[item.level] }}
            >
              {item.level === 'ok' && !item.action ? <IconCheck /> : item.icon}
            </div>
            <div className="db-reminder-content">
              <span className="db-reminder-title">{item.title}</span>
              {item.desc && <span className="db-reminder-desc">{item.desc}</span>}
              {item.progress && (
                <ProgressBar current={item.progress.current} total={item.progress.total} label={item.progress.label} />
              )}
            </div>
            {item.action && (
              <button
                type="button"
                className="db-reminder-action"
                onClick={() => onAdd(item.action!.type)}
              >
                {item.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
