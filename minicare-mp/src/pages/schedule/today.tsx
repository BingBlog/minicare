/**
 * 今日日程详情页（PRD-009 US-04）
 *
 * · 全部数据来自 `GET /schedule/today` 的实时派生结果，前端**不推断状态**
 * · 未完成 / 已错过项 → 跳对应记录表单页并预填执行时间为记录时间
 * · 已完成项 → 跳该条记录的编辑页（复用既有记录操作能力）
 * · 倒计时文案本地每 60 秒刷新一次，不请求接口
 */
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { scheduleApi } from '@/api'
import type { ScheduleItem, ScheduleItemStatus } from '@/api'
import { babyApi } from '@/api/baby'
import { getStoredFamilyId, getStoredBabyId, setCurrentBabyId } from '@/api/http'
import {
  buildRecordUrl,
  buildScheduleTypeIndex,
  SCHEDULE_ITEM_TYPE_RECORD,
} from '@/lib/schedule'
import { useAppConfig } from '@/lib/useAppConfig'
import { getStatusBarHeight, getCapsuleRightPadding } from '@/lib/safeArea'
import { useIsIPad } from '@/lib/useIsIPad'
import './today.scss'

/**
 * ⚠️ 记录页跳转表统一维护在 `lib/schedule.ts::SCHEDULE_ITEM_TYPE_RECORD`（单一维护点）。
 * 本页原先各自维护的 `RECORD_WEB_ROUTE` / `RECORD_INIT_TYPE` 两份本地表已移除 ——
 * 加类型时只改那一处，避免"页面能选到、点进去却跳错页"。
 */

function hmToMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function formatDurationMinutes(min: number): string {
  if (min < 60) return `${min} 分钟`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`
}

function todayLabel(): string {
  const d = new Date()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${weekdays[d.getDay()]}`
}

/** 状态徽标文案（PRD US-04：✓已完成 / ▶现在该做 / ○还有 N 分钟 / ⚠已错过 N 分钟） */
function badgeText(item: ScheduleItem, nowMin: number): string {
  const execMin = hmToMin(item.executeTime)
  switch (item.status) {
    case 'done':
      return '✓ 已完成'
    case 'doing':
      return '▶ 现在该做'
    case 'preparing':
      return '▶ 备餐中'
    case 'missed':
      return `⚠ 已错过 ${formatDurationMinutes(Math.max(0, nowMin - execMin))}`
    case 'upcoming': {
      const left = execMin - nowMin
      return left > 0 && left <= 120 ? `○ 还有 ${formatDurationMinutes(left)}` : '○ 待开始'
    }
    default:
      return '○ 待开始'
  }
}

const BADGE_CLASS: Record<ScheduleItemStatus, string> = {
  upcoming: 'tl-badge--upcoming',
  preparing: 'tl-badge--preparing',
  doing: 'tl-badge--doing',
  done: 'tl-badge--done',
  missed: 'tl-badge--missed',
  disabled: 'tl-badge--upcoming',
}

/** 仅未完成 / 已错过项可"去记录" */
function canGoRecord(status?: ScheduleItemStatus): boolean {
  return status === 'missed' || status === 'doing' || status === 'preparing' || status === 'upcoming'
}

export default function ScheduleTodayPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => (isIPad ? `${base} is-ipad` : base)

  // 类型名（如「换尿布」）来自服务端下发的 config，前端不内置清单
  const { config } = useAppConfig()
  const typeIndex = useMemo(() => buildScheduleTypeIndex(config?.scheduleItemTypes), [config])

  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [nowTick, setNowTick] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const familyId = getStoredFamilyId() || ''

  const capsule = useMemo(() => {
    if (process.env.TARO_ENV !== 'weapp') {
      return { paddingTop: getStatusBarHeight(), headerHeight: 44, rightWidth: 0 }
    }
    try {
      const menuBtn = Taro.getMenuButtonBoundingClientRect()
      const sysInfo = Taro.getSystemInfoSync()
      const statusBarHeight = sysInfo.statusBarHeight || 0
      return {
        paddingTop: menuBtn.top,
        headerHeight: menuBtn.height + (menuBtn.top - statusBarHeight) * 2,
        rightWidth: getCapsuleRightPadding(),
      }
    } catch {
      return { paddingTop: getStatusBarHeight(), headerHeight: 44, rightWidth: 0 }
    }
  }, [])

  const nowMin = useMemo(() => {
    void nowTick
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  }, [nowTick])

  const load = useCallback(async () => {
    if (!familyId) {
      setLoading(false)
      return
    }
    try {
      let babyId = getStoredBabyId()
      if (!babyId) {
        const baby = await babyApi.get(familyId)
        babyId = baby?.id ?? ''
        if (babyId) setCurrentBabyId(babyId)
      }
      if (!babyId) {
        setLoading(false)
        return
      }
      const res = await scheduleApi.getToday(familyId, babyId)
      setItems(res.items)
      setProgress(res.progress)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [familyId])

  useDidShow(() => {
    setLoading(true)
    void load()
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setNowTick((t) => t + 1), 60_000)
  })

  // 页面卸载时清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const handleItemClick = (item: ScheduleItem) => {
    const target = SCHEDULE_ITEM_TYPE_RECORD[item.itemType]
    if (!target || !target.path) {
      // other 类型不判定，也没有对应记录页
      return
    }
    if (item.status === 'done' && item.matchedRecord) {
      // 已完成 → 打开该条记录（编辑态）
      const url = buildRecordUrl(target, [
        `recordId=${encodeURIComponent(item.matchedRecord.id)}`,
      ])
      Taro.navigateTo({ url })
      return
    }
    if (canGoRecord(item.status)) {
      // 未完成 / 已错过 → 新建记录并预填执行时间（活动类型已由 target.query 预选）
      const url = buildRecordUrl(target, [`initTime=${encodeURIComponent(item.executeTime)}`])
      Taro.navigateTo({ url })
    }
  }

  const goPlan = () => {
    Taro.navigateTo({ url: '/pages/schedule/index' })
  }

  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <View className={cls('today-page')}>
      <View
        className='today-nav'
        style={{
          paddingTop: `${capsule.paddingTop}px`,
          minHeight: `${capsule.paddingTop + capsule.headerHeight}px`,
          paddingRight: `${Math.max(16, capsule.rightWidth)}px`,
        }}
      >
        <View className='today-nav__back' onClick={() => Taro.navigateBack()}>
          <Text className='today-nav__back-arrow'>{'\u2039'}</Text>
        </View>
        <View className='today-nav__center'>
          <Text className='today-nav__title'>今日日程</Text>
          <Text className='today-nav__date'>{todayLabel()}</Text>
        </View>
        <Text className='today-nav__edit' onClick={goPlan}>编辑</Text>
      </View>

      <ScrollView scrollY className='today-scroll'>
        {loading ? (
          <View className='today-loading'>
            <Text className='today-loading__text'>加载中…</Text>
          </View>
        ) : loadFailed ? (
          <View className='today-empty'>
            <Text className='today-empty__title'>加载失败</Text>
            <Text className='today-empty__sub'>请检查网络后重试</Text>
            <View
              className='today-empty__action'
              onClick={() => {
                setLoading(true)
                void load()
              }}
            >
              <Text className='today-empty__action-text'>重试</Text>
            </View>
          </View>
        ) : items.length === 0 ? (
          <View className='today-empty'>
            <Text className='today-empty__title'>还没有作息计划</Text>
            <Text className='today-empty__sub'>先排一份作息，这里就会显示今天该做什么</Text>
            <View className='today-empty__action' onClick={goPlan}>
              <Text className='today-empty__action-text'>去设置作息计划</Text>
            </View>
          </View>
        ) : (
          <>
            <View className='today-progress'>
              <View className='today-progress__head'>
                <Text className='today-progress__label'>已完成</Text>
                <Text className='today-progress__value'>
                  {progress.done} / {progress.total}
                </Text>
              </View>
              <View className='today-progress__bar'>
                <View className='today-progress__fill' style={{ width: `${percent}%` }} />
              </View>
            </View>

            <View className='today-timeline'>
              {items.map((item) => {
                const done = item.status === 'done'
                const clickable =
                  !!SCHEDULE_ITEM_TYPE_RECORD[item.itemType]?.path && item.status !== 'disabled'
                return (
                  <View
                    key={item.id || `${item.itemType}-${item.executeTime}`}
                    className={`tl-node ${done ? 'tl-node--done' : ''}`}
                    onClick={() => (clickable ? handleItemClick(item) : undefined)}
                  >
                    <View className='tl-node__rail'>
                      <View className={`tl-node__dot tl-node__dot--${item.status ?? 'upcoming'}`} />
                      <View className='tl-node__line' />
                    </View>

                    <View className='tl-node__time'>
                      {item.prepareTime && (
                        <Text className='tl-node__prep'>备餐 {item.prepareTime}</Text>
                      )}
                      <Text className='tl-node__exec'>{item.executeTime}</Text>
                    </View>

                    <View className='tl-node__body'>
                      <View className='tl-node__head'>
                        <Text className='tl-node__title'>{item.title}</Text>
                        <View
                          className={`tl-badge ${BADGE_CLASS[item.status ?? 'upcoming']}`}
                        >
                          <Text className='tl-badge__text'>
                            {badgeText(item, nowMin)}
                          </Text>
                        </View>
                      </View>
                      <Text className='tl-node__type'>
                        {typeIndex.byType.get(item.itemType)?.label ?? item.itemType}
                      </Text>

                      {done && item.matchedRecord && (
                        <Text className='tl-node__matched'>{item.matchedRecord.summary}</Text>
                      )}

                      {item.status === 'missed' && (
                        <Text className='tl-node__action'>现在补记录 →</Text>
                      )}

                      {item.status === 'preparing' && (
                        <Text className='tl-node__action'>该备餐了 · 去记录 →</Text>
                      )}

                      {item.status === 'doing' && (
                        <Text className='tl-node__action'>去记录 →</Text>
                      )}
                    </View>
                  </View>
                )
              })}
            </View>

            <View className='today-foot'>
              <Text className='today-foot__text'>
                点未完成的项可直接去补记录；已完成项点开可查看或修改那条记录。
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}
