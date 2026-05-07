/**
 * 提醒待办列（与 Web 端业务逻辑完全一致）
 *
 * 纯前端计算，基于当日已有数据推算：
 * 1. 下次喂奶预计时间
 * 2. 尿布进度（昨日对比）
 * 3. 睡眠状态
 * 4. 体温未记录 / 发热警告
 * 5. 补剂未记录
 * 6. 活动未记录
 *
 * 差异化：
 * - onAdd 改为跳转到对应记录表单页（而非打开抽屉）
 */
import { useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import type { DashboardData } from './types'
import type { RecordFormType } from './types'
import { getTodayStr } from './useDashboardData'
import { calcNextFeedTimeV3, FeedingModel } from './reminder/sources/feedingSource'

interface Props {
  data: DashboardData
  selectedDate: string
  onAdd: (type: RecordFormType) => void
  feedingModel?: FeedingModel | null
}

/** 进度条组件 */
function ProgressBar({ current, total, label }: { current: number; total: number; label: string }) {
  const pctVal = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
  return (
    <View className='db-reminder-progress'>
      <View className='db-reminder-progress-bar'>
        <View
          className='db-reminder-progress-fill'
          style={{ width: `${pctVal}%` }}
        />
      </View>
      <Text className='db-reminder-progress-label'>{label}</Text>
    </View>
  )
}

interface ReminderItem {
  id: string
  level: 'urgent' | 'warn' | 'ok' | 'todo'
  title: string
  desc: string
  action?: { label: string; type: RecordFormType }
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

export default function RemindersColumn({ data, selectedDate, onAdd, feedingModel }: Props) {
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

      const nextFeedTime = calcNextFeedTimeV3(feedings, data.yesterdayFeeding, feedingModel)
      if (nextFeedTime) {
        const lastFeedTime = new Date(feedings[feedings.length - 1].time)
        const lastFeedMin = lastFeedTime.getHours() * 60 + lastFeedTime.getMinutes()
        const diffMs = nextFeedTime.getTime() - now.getTime()
        const diffMin = Math.round(diffMs / 60_000)
        const avgGap = Math.round((nextFeedTime.getTime() - lastFeedTime.getTime()) / 60_000)

        const level: ReminderItem['level'] = diffMin < 0 ? 'urgent' : diffMin < 30 ? 'warn' : 'ok'
        items.push({
          id: 'next-feed',
          level,
          title: diffMin < 0 ? '该喂奶了' : `预计 ${fmtDiff(diffMin)} 喂奶`,
          desc: `上次 ${fmtElapsed(nowMin - lastFeedMin)}，预计间隔 ${avgGap}分钟`,
          action: diffMin < 0 ? { label: '记录', type: 'feeding' } : undefined,
          progress: feedProgress,
        })
      } else if (feedings.length === 0) {
        // V3: 首餐不预测，显示"等待首餐"
        items.push({
          id: 'next-feed',
          level: 'todo',
          title: '等待今日首餐',
          desc: '记录第一次喂奶后开始预测',
          action: { label: '记录', type: 'feeding' },
          progress: feedProgress,
        })
      } else if (feedings.length === 1) {
        const lastFeedTime = new Date(feedings[0].time)
        const lastFeedMin = lastFeedTime.getHours() * 60 + lastFeedTime.getMinutes()
        const elapsedMin = nowMin - lastFeedMin
        // V3: 首餐后，用模型估算（无模型时退化为简单判断）
        const level: ReminderItem['level'] = elapsedMin > 180 ? 'urgent' : elapsedMin > 120 ? 'warn' : 'ok'
        const modelGap = feedingModel?.getMedianGap(lastFeedTime.getHours() - (lastFeedTime.getHours() % 2))
        const gapDesc = modelGap ? `预计间隔约 ${Math.round(modelGap)} 分钟` : '积累数据后自动预测'
        items.push({
          id: 'next-feed',
          level,
          title: `距上次喂奶 ${fmtElapsed(elapsedMin)}`,
          desc: gapDesc,
          action: elapsedMin > 120 ? { label: '记录', type: 'feeding' } : undefined,
          progress: feedProgress,
        })
      }

      // ── 1.5 尿布进度 ──────────────────────────────
      const diaperProgress = data.yesterdayDiaperCount > 0
        ? { current: data.diaper.length, total: data.yesterdayDiaperCount, label: `${data.diaper.length}/${data.yesterdayDiaperCount} (昨日)` }
        : undefined
      if (diaperProgress) {
        const dLevel: ReminderItem['level'] = data.diaper.length >= data.yesterdayDiaperCount ? 'ok' : 'warn'
        items.push({
          id: 'diaper-progress',
          level: dLevel,
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
          title: `睡眠中 · 已 ${sleepStr}`,
          desc: '宝宝正在睡觉，保持安静',
        })
      } else {
        const endedSleeps = data.sleep.filter(r => r.detail?.status !== 'ongoing')
        if (endedSleeps.length > 0) {
          const lastSleep = endedSleeps[endedSleeps.length - 1]
          const dur = (lastSleep.detail?.duration_min as number | undefined) ?? 0
          const startMin = new Date(lastSleep.time).getHours() * 60 + new Date(lastSleep.time).getMinutes()
          const wakeMin = startMin + dur
          const awakeMin = nowMin - wakeMin
          const level: ReminderItem['level'] = awakeMin > 120 ? 'warn' : 'ok'
          items.push({
            id: 'sleep-status',
            level,
            title: awakeMin > 120 ? '宝宝可能累了' : `清醒中 · ${Math.round(awakeMin)}分钟`,
            desc: awakeMin > 120
              ? `已清醒 ${Math.floor(awakeMin / 60)}小时${awakeMin % 60}分，可以尝试哄睡`
              : `上次睡了 ${Math.floor(dur / 60) > 0 ? Math.floor(dur / 60) + 'h ' : ''}${dur % 60}m`,
            action: awakeMin > 120 ? { label: '记录', type: 'sleep' } : undefined,
          })
        }
      }

      // ── 3. 体温 ─────────────────────────────────────────
      if (data.health.length === 0) {
        items.push({
          id: 'todo-temp',
          level: 'todo',
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
            title: isFever ? `发热 ${latestTemp.toFixed(1)}°C` : `体温正常 ${latestTemp.toFixed(1)}°C`,
            desc: isFever ? '请注意观察，必要时就医' : '今日已记录体温',
          })
        }
      }

      // ── 4. 补剂 ───────────────────────────────────────────
      if (data.supplement.length === 0) {
        items.push({
          id: 'todo-supplement',
          level: 'todo',
          title: '今日补剂未记录',
          desc: '维D、DHA 等营养素',
          action: { label: '记录', type: 'feeding' },
        })
      } else {
        items.push({
          id: 'todo-supplement',
          level: 'ok',
          title: `补剂已记录 ${data.supplement.length}次`,
          desc: '今日营养素已完成',
        })
      }

      // ── 5. 活动 ─────────────────────────────────────────
      if (data.activity.length === 0) {
        items.push({
          id: 'todo-activity',
          level: 'todo',
          title: '今日活动未记录',
          desc: '早教互动、户外活动等',
          action: { label: '记录', type: 'activity' },
        })
      } else {
        const totalMin = data.activity.reduce((s, r) => s + ((r.detail?.duration_min as number | undefined) ?? 0), 0)
        items.push({
          id: 'todo-activity',
          level: 'ok',
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

      items.push({ id: 'hist-feed', level: feedCount > 0 ? 'ok' : 'todo', title: feedCount > 0 ? `喂奶 ${feedCount}次` : '当日无喂奶记录', desc: feedCount > 0 ? '当日喂养记录' : '' })
      items.push({ id: 'hist-sleep', level: sleepCount > 0 ? 'ok' : 'todo', title: sleepCount > 0 ? `睡眠 ${sleepCount}段` : '当日无睡眠记录', desc: sleepMin > 0 ? `共 ${Math.floor(sleepMin / 60)}h ${sleepMin % 60}m` : '' })
      items.push({ id: 'hist-diaper', level: diaperCount > 0 ? 'ok' : 'todo', title: diaperCount > 0 ? `换尿布 ${diaperCount}次` : '当日无尿布记录', desc: '' })
      items.push({ id: 'hist-temp', level: hasTemp ? 'ok' : 'todo', title: hasTemp ? '体温已记录' : '当日体温未记录', desc: data.latestTemp != null ? `最高 ${data.latestTemp.toFixed(1)}°C` : '' })
      items.push({ id: 'hist-supp', level: hasSupp ? 'ok' : 'todo', title: hasSupp ? `补剂已记录 ${data.supplement.length}次` : '当日补剂未记录', desc: '' })
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
    <View className='db-col'>
      <View className='db-col-header'>
        <View className='db-col-title'>
          <Text className='db-col-title-text'>{isToday ? '提醒 · 待办' : '当日完成情况'}</Text>
        </View>
      </View>

      <View className='db-reminders-body'>
        {reminders.map((item) => (
          <View key={item.id} className={`db-reminder-card db-reminder-card--${item.level}`}>
            <View
              className='db-reminder-icon'
              style={{ background: iconBg[item.level], color: iconColor[item.level] }}
            >
              <Text style={{ fontSize: '16rpx', lineHeight: 1 }}>
                {item.level === 'ok' ? '\u2713' : item.level === 'urgent' ? '!' : item.level === 'warn' ? '\u25B2' : '\u25CB'}
              </Text>
            </View>
            <View className='db-reminder-content'>
              <Text className='db-reminder-title'>{item.title}</Text>
              {item.desc ? <Text className='db-reminder-desc'>{item.desc}</Text> : null}
              {item.progress && (
                <ProgressBar current={item.progress.current} total={item.progress.total} label={item.progress.label} />
              )}
            </View>
            {item.action && (
              <Text
                className='db-reminder-action'
                onClick={() => onAdd(item.action!.type)}
              >
                {item.action.label}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  )
}