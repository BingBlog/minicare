/**
 * 记录列表页面 — MP 迁移
 *
 * 与 Web records-list/index.tsx 保持相同的：
 * - 数据流（API → 排序 → 日期分组 → 渲染）
 * - 交互流（筛选 / 今天切换 / 排序 / 点击弹层 / 编辑跳转 / 删除乐观更新）
 *
 * 组件结构：
 * ├─ RecordsListPage（编排器：数据 + 状态）
 * │  ├─ 筛选栏（内联 FilterBar 等价）
 * │  ├─ 排序切换（内联 RecordsSortModeBar 等价）
 * │  ├─ RecordGroup × N（按日期分组的记录组）
 * │  │  └─ RecordListItem × N
 * │  └─ RecordActionSheet（编辑/删除弹层）
 */
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { useEffect, useRef, useState, useCallback } from 'react'
import { familyApi, babyApi, recordsApi } from '@/api'
import { getStatusBarHeight } from '@/lib/safeArea'
import { useIsIPad } from '@/lib/useIsIPad'
import { getToken } from '@/api/http'
import TabBar from '@/components/TabBar/TabBar'
import {
  getRecordTime,
  getDateKey,
  getDateLabel,
  getRecordType,
  getTodayKey,
  compareTime,
} from '@/lib/utils'
import {
  ALL_TYPE_KEYS,
  sortDayItems,
  type RecordsSortMode,
  type RecordTypeKey,
} from '@/lib/recordsSort'
import RecordGroup from './RecordGroup'
import RecordActionSheet from './RecordActionSheet'
import GuestRecordsList from './GuestRecordsList'
import type { Family, Baby, RecordItem } from '@/api/types'
import './index.scss'

// ── 分页常量 ──
const PAGE_SIZE_ALL = 30    // all 模式：每种类型每页条数（非 feeding 类型）
const PAGE_SIZE_FEEDING = 30 // feeding 类型每页条数（cursor 分页，保证日完整性）
const PAGE_SIZE_SINGLE = 50 // 单类型模式：每页条数

// ── 筛选栏：主行 = 全部 + 饮食/尿布/生长/睡眠；其余在「更多」内 ──
const FILTER_PRIMARY: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'feeding', label: '饮食' },
  { key: 'diaper', label: '尿布' },
  { key: 'growth', label: '生长' },
]
const FILTER_MORE: { key: string; label: string }[] = [
  { key: 'sleep', label: '睡眠' },
  { key: 'activity', label: '活动' },
  { key: 'health', label: '健康' },
  { key: 'symptom', label: '表现' },
  { key: 'medical', label: '医疗' },
]

/** 记录类型 → MP 表单页路由（仅已迁移的独立页面，不经过中间分发页） */
const RECORD_FORM_MP_ROUTES: Record<string, string> = {
  feeding: '/pages/records/feeding/index',
  sleep: '/pages/records/sleep/index',
  diaper: '/pages/records/diaper/index',
  growth: '/pages/records/growth/index',
  health: '/pages/records/health/index',
  activity: '/pages/records/activity/index',
  symptom: '/pages/records/symptom/index',
  medical: '/pages/records/medical/index',
}

/** 记录子类型 → 已迁移 MP 表单页路由（用于已迁移的 feeding 等类型） */
const SUBTYPE_MP_ROUTES: Record<string, string> = {
  formula: '/pages/records/feeding/index?tab=formula',
  breast: '/pages/records/feeding/index?tab=breast',
  food: '/pages/records/feeding/index?tab=food',
  supplement: '/pages/records/feeding/index?tab=supplement',
}

function buildEditUrl(record: RecordItem): string {
  const type = getRecordType(record)
  const feedType = (record as Record<string, unknown>).feed_type as string | undefined
  const recordId = record.id

  // 已迁移的子类型（feeding 表单支持）
  if (feedType) {
    const subRoute = SUBTYPE_MP_ROUTES[feedType]
    if (subRoute) return `${subRoute}&recordId=${encodeURIComponent(recordId)}`
  }

  const base = RECORD_FORM_MP_ROUTES[type]
  if (base) return `${base}?recordId=${encodeURIComponent(recordId)}`
  return ''
}

export default function RecordsListPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => isIPad ? `${base} is-ipad` : base
  const [family, setFamily] = useState<Family | null>(null)
  const [baby, setBaby] = useState<Baby | null>(null)
  const [records, setRecords] = useState<RecordItem[]>([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [sortMode, setSortMode] = useState<RecordsSortMode>('type')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<RecordItem | null>(null)
  const [actionOpen, setActionOpen] = useState(false)

  // 是否未登录
  const [isGuest, setIsGuest] = useState(false)

  // 分页状态
  // - feeding 类型使用 cursor 分页（nextCursor）
  // - 其他类型使用 offset 分页
  // 用 ref 避免 useReachBottom 闭包捕获旧值
  const offsetMapRef = useRef<Record<RecordTypeKey, number>>(
    Object.fromEntries(ALL_TYPE_KEYS.map((k) => [k, 0])) as Record<RecordTypeKey, number>
  )
  // feeding 的 cursor 状态
  const feedingCursorRef = useRef<{ before: string; before_id: string } | null>(null)
  const singleOffsetRef = useRef(0)
  // 单类型 feeding 模式下的 cursor
  const singleFeedingCursorRef = useRef<{ before: string; before_id: string } | null>(null)
  // 标记是否正在加载更多，防止重复触发
  const loadingMoreRef = useRef(false)

  // 初始化加载 family + baby（useDidShow 保证 tabBar 切换回来时也能刷新）
  const cancelRef = useRef(false)
  useDidShow(() => {
    cancelRef.current = false
    async function init() {
      const token = getToken()
      if (!token) {
        setIsGuest(true)
        setLoading(false)
        return
      }
      setIsGuest(false)
      setLoading(true)
      try {
        const families = await familyApi.getMine()
        if (!families.length) {
          if (!cancelRef.current) { setFamily(null); setBaby(null); setLoading(false) }
          return
        }
        const fam = families[0]
        const baby = await babyApi.get(fam.id)
        if (!baby || !baby.id) {
          if (!cancelRef.current) { setFamily(fam); setBaby(null); setLoading(false) }
          return
        }
        if (!cancelRef.current) {
          setFamily(fam)
          setBaby(baby)
        }
      } catch {
        if (!cancelRef.current) setLoading(false)
      }
    }
    init()
    return () => { cancelRef.current = true }
  })

  // 加载记录（依赖 family / baby / activeFilter）— 首次加载，重置分页
  useEffect(() => {
    if (!family || !baby) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setHasMore(false)

      // 重置分页状态
      offsetMapRef.current = Object.fromEntries(
        ALL_TYPE_KEYS.map((k) => [k, 0])
      ) as Record<RecordTypeKey, number>
      feedingCursorRef.current = null
      singleOffsetRef.current = 0
      singleFeedingCursorRef.current = null

      try {
        let allRecs: Record<string, unknown>[] = []

        if (activeFilter === 'all') {
          // feeding 使用 cursor 分页，其他类型使用 offset 分页
          const nonFeedingTypes = ALL_TYPE_KEYS.filter((t) => t !== 'feeding')

          const [feedingResult, ...otherResults] = await Promise.allSettled([
            // feeding: cursor 分页（初次不传 before）
            recordsApi.feeding.list(family!.id, baby!.id, { limit: PAGE_SIZE_FEEDING }),
            // 其他类型: offset 分页
            ...nonFeedingTypes.map((t) =>
              recordsApi[t]?.list(family!.id, baby!.id, { limit: PAGE_SIZE_ALL, offset: 0 }) ??
                Promise.resolve([]),
            ),
          ])

          let anyHasMore = false

          // 处理 feeding 结果（cursor 分页）
          if (feedingResult.status === 'fulfilled') {
            const feedingRes = feedingResult.value as { items: Record<string, unknown>[]; nextCursor: { before: string; before_id: string } | null }
            allRecs = allRecs.concat(feedingRes.items)
            if (feedingRes.nextCursor) {
              anyHasMore = true
              feedingCursorRef.current = feedingRes.nextCursor
            }
          }

          // 处理其他类型结果（offset 分页）
          otherResults.forEach((r, i) => {
            if (r.status === 'fulfilled') {
              const items = r.value as Record<string, unknown>[]
              allRecs = allRecs.concat(items)
              if (items.length >= PAGE_SIZE_ALL) {
                anyHasMore = true
                offsetMapRef.current[nonFeedingTypes[i]] = PAGE_SIZE_ALL
              }
            }
          })

          if (!cancelled) setHasMore(anyHasMore)
        } else if (activeFilter === 'feeding') {
          // 单类型 feeding 模式：使用 cursor 分页
          const res = await recordsApi.feeding.list(family!.id, baby!.id, {
            limit: PAGE_SIZE_SINGLE,
          })
          allRecs = res.items as Record<string, unknown>[]
          if (!cancelled) {
            const more = res.nextCursor !== null
            setHasMore(more)
            if (more) singleFeedingCursorRef.current = res.nextCursor
          }
        } else {
          // 其他单类型模式：使用 offset 分页
          const t = activeFilter as RecordTypeKey
          if (recordsApi[t]) {
            const items = await recordsApi[t].list(family!.id, baby!.id, {
              limit: PAGE_SIZE_SINGLE,
              offset: 0,
            }) as Record<string, unknown>[]
            allRecs = items
            if (!cancelled) {
              const more = items.length >= PAGE_SIZE_SINGLE
              setHasMore(more)
              if (more) singleOffsetRef.current = PAGE_SIZE_SINGLE
            }
          }
        }

        // 按时间降序
        allRecs.sort(
          (a, b) => compareTime(getRecordTime(b), getRecordTime(a)),
        )

        if (!cancelled) setRecords(allRecs as RecordItem[])
      } catch {
        if (!cancelled) setRecords([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [family, baby, activeFilter])

  // 加载更多（触底时调用）
  const loadMore = useCallback(async () => {
    if (!family || !baby || loadingMoreRef.current || !hasMore) return
    loadingMoreRef.current = true
    setLoadingMore(true)

    try {
      let newRecs: RecordItem[] = []

      if (activeFilter === 'all') {
        // 并发请求：feeding 用 cursor，其他类型用 offset
        const feedingHasMore = feedingCursorRef.current !== null
        const nonFeedingTypesToLoad = ALL_TYPE_KEYS.filter(
          (t) => t !== 'feeding' && offsetMapRef.current[t] > 0
        )

        const promises: Promise<unknown>[] = []
        const promiseLabels: string[] = []

        // feeding cursor 分页
        if (feedingHasMore) {
          promises.push(
            recordsApi.feeding.list(family!.id, baby!.id, {
              limit: PAGE_SIZE_FEEDING,
              before: feedingCursorRef.current!.before,
              before_id: feedingCursorRef.current!.before_id,
            })
          )
          promiseLabels.push('feeding')
        }

        // 其他类型 offset 分页
        for (const t of nonFeedingTypesToLoad) {
          promises.push(
            recordsApi[t]?.list(family!.id, baby!.id, {
              limit: PAGE_SIZE_ALL,
              offset: offsetMapRef.current[t],
            }) ?? Promise.resolve([])
          )
          promiseLabels.push(t)
        }

        const results = await Promise.allSettled(promises)

        let anyHasMore = false
        results.forEach((r, i) => {
          if (r.status !== 'fulfilled') return
          const label = promiseLabels[i]

          if (label === 'feeding') {
            // feeding cursor 结果
            const feedingRes = r.value as { items: RecordItem[]; nextCursor: { before: string; before_id: string } | null }
            if (feedingRes.items.length > 0) {
              newRecs = newRecs.concat(feedingRes.items)
            }
            if (feedingRes.nextCursor) {
              anyHasMore = true
              feedingCursorRef.current = feedingRes.nextCursor
            } else {
              feedingCursorRef.current = null
            }
          } else {
            // 其他类型 offset 结果
            const items = r.value as RecordItem[]
            if (items.length > 0) {
              newRecs = newRecs.concat(items)
            }
            if (items.length >= PAGE_SIZE_ALL) {
              anyHasMore = true
              offsetMapRef.current[label as RecordTypeKey] += PAGE_SIZE_ALL
            } else {
              offsetMapRef.current[label as RecordTypeKey] = 0
            }
          }
        })
        setHasMore(anyHasMore)
      } else if (activeFilter === 'feeding') {
        // 单类型 feeding 模式：cursor 分页
        if (singleFeedingCursorRef.current) {
          const res = await recordsApi.feeding.list(family!.id, baby!.id, {
            limit: PAGE_SIZE_SINGLE,
            before: singleFeedingCursorRef.current.before,
            before_id: singleFeedingCursorRef.current.before_id,
          })
          newRecs = res.items as RecordItem[]
          if (res.nextCursor) {
            singleFeedingCursorRef.current = res.nextCursor
            setHasMore(true)
          } else {
            singleFeedingCursorRef.current = null
            setHasMore(false)
          }
        }
      } else {
        // 其他单类型模式：offset 分页
        const t = activeFilter as RecordTypeKey
        if (recordsApi[t]) {
          const fetched = await recordsApi[t].list(family!.id, baby!.id, {
            limit: PAGE_SIZE_SINGLE,
            offset: singleOffsetRef.current,
          }) as RecordItem[]
          newRecs = fetched
          const more = fetched.length >= PAGE_SIZE_SINGLE
          setHasMore(more)
          if (more) {
            singleOffsetRef.current += PAGE_SIZE_SINGLE
          }
        }
      }

      if (newRecs.length > 0) {
        setRecords((prev) => {
          const merged = [...prev, ...newRecs]
          merged.sort((a, b) => compareTime(getRecordTime(b), getRecordTime(a)))
          return merged
        })
      }
    } catch {
      // 加载更多失败静默处理，不清空已有数据
    } finally {
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
  }, [family, baby, activeFilter, hasMore])

  // 监听页面触底事件
  useReachBottom(() => {
    loadMore()
  })

  // ── 按日期分组 ──
  const todayKey = getTodayKey()
  const dateMap = new Map<string, RecordItem[]>()
  for (const rec of records) {
    const dk = getDateKey(getRecordTime(rec))
    if (!dateMap.has(dk)) dateMap.set(dk, [])
    dateMap.get(dk)!.push(rec)
  }

  const effectiveSortMode: RecordsSortMode =
    activeFilter === 'all' ? sortMode : 'time'

  const grouped = Array.from(dateMap.entries()).map(([dk, items]) => ({
    dateKey: dk,
    dateLabel: getDateLabel(getRecordTime(items[0])),
    isToday: dk === todayKey,
    items: sortDayItems(items as RecordItem[], effectiveSortMode),
  }))

  // ── 操作处理 ──
  const handleRecordClick = (rec: RecordItem) => {
    setSelectedRecord(rec)
    setActionOpen(true)
  }

  const handleEdit = (rec: RecordItem) => {
    const url = buildEditUrl(rec)
    if (!url) {
      Taro.showToast({ title: '暂不支持编辑该类型记录', icon: 'none' })
      return
    }
    Taro.navigateTo({ url })
  }

  const handleDelete = async (rec: RecordItem) => {
    if (!family) return
    const type = getRecordType(rec)
    // 子类型映射到 API type
    const apiType =
      type === 'formula' || type === 'breast' || type === 'food' || type === 'supplement'
        ? 'feeding'
        : type
    try {
      await recordsApi.remove(family.id, apiType, rec.id)
      setRecords((prev) => prev.filter((item) => item.id !== rec.id))
      Taro.showToast({ title: '记录已删除', icon: 'success' })
    } catch {
      Taro.showToast({ title: '删除失败，请重试', icon: 'none' })
    }
  }

  // ── 加载中 / 无家庭宝宝 ──
  const safeAreaStyle = { paddingTop: `${getStatusBarHeight()}px` }

  if (isGuest) {
    return (
      <View className={cls('records-list-page')} style={safeAreaStyle}>
        <GuestRecordsList />
        <TabBar activeTab='records' />
      </View>
    )
  }

  if (loading && !family) {
    return (
      <View className={cls('records-list-page')} style={safeAreaStyle}>
        <View className='records-status'>
          <Text className='records-status__title'>加载中...</Text>
        </View>
        <TabBar activeTab='records' />
      </View>
    )
  }

  if (!family || !baby) {
    return (
      <View className={cls('records-list-page')} style={safeAreaStyle}>
        <View className='records-status'>
          <View className='records-status__icon'>
            <Text>--</Text>
          </View>
          <Text className='records-status__title'>请先创建家庭和添加宝宝</Text>
        </View>
        <TabBar activeTab='records' />
      </View>
    )
  }

  return (
    <View className={cls('records-list-page')} style={safeAreaStyle}>
      {/* ── 筛选栏 ── */}
      <View className='records-filter'>
        {/* 标题行 */}
        <View className='records-filter__head'>
          <View className='records-filter__title-wrap'>
            <Text className='records-filter__title'>宝宝记录</Text>
            {!loading && (
              <Text className='records-filter__count'>共 {records.length} 条</Text>
            )}
          </View>
        </View>

        {/* 筛选芯片 */}
        <View className='records-filter__chips'>
          {FILTER_PRIMARY.map((opt) => (
            <View
              key={opt.key}
              className={`records-filter__chip ${activeFilter === opt.key ? 'records-filter__chip--active' : ''}`}
              onClick={() => { setActiveFilter(opt.key); setShowMore(false) }}
            >
              <Text>{opt.label}</Text>
            </View>
          ))}
          <View
            className={`records-filter__chip ${FILTER_MORE.some((o) => o.key === activeFilter) || showMore ? 'records-filter__chip--active' : ''}`}
            onClick={() => setShowMore((v) => !v)}
          >
            <Text>更多</Text>
          </View>
        </View>

        {showMore && (
          <View className='records-filter__chips' style={{ paddingTop: 0 }}>
            {FILTER_MORE.map((opt) => (
              <View
                key={opt.key}
                className={`records-filter__chip ${activeFilter === opt.key ? 'records-filter__chip--active' : ''}`}
                onClick={() => { setActiveFilter(opt.key); setShowMore(false) }}
              >
                <Text>{opt.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── 排序切换 Segmented Control（仅「全部」时显示） ── */}
      {activeFilter === 'all' && (
        <View className='records-sort'>
          <View className='records-sort__track'>
            <Text
              className={`records-sort__item ${sortMode === 'type' ? 'records-sort__item--active' : ''}`}
              onClick={() => setSortMode('type')}
            >
              按类型
            </Text>
            <Text
              className={`records-sort__item ${sortMode === 'time' ? 'records-sort__item--active' : ''}`}
              onClick={() => setSortMode('time')}
            >
              按时间
            </Text>
          </View>
        </View>
      )}

      {/* ── 记录列表 ── */}
      <View className='records-list-body'>
        {loading ? (
          <View className='records-status'>
            <Text className='records-status__title'>加载中...</Text>
          </View>
        ) : records.length === 0 ? (
          <View className='records-status'>
            <View className='records-status__icon'>
              <Text>--</Text>
            </View>
            <Text className='records-status__title'>暂无记录</Text>
            <Text className='records-status__subtitle'>{'点击底部 + 按钮开始记录\n宝宝的每一天'}</Text>
          </View>
        ) : (
          <>
            {grouped.map((group) => (
              <RecordGroup
                key={group.dateKey}
                group={group}
                onRecordClick={handleRecordClick}
                groupByType={effectiveSortMode === 'type'}
              />
            ))}
            {/* ── 底部状态区 ── */}
            {loadingMore ? (
              <View className='records-footer-loading'>
                <Text className='records-footer-loading__text'>加载更多...</Text>
              </View>
            ) : hasMore ? (
              <View className='records-footer-hint'>
                <Text>上拉加载更多</Text>
              </View>
            ) : (
              <View className='records-footer-hint'>
                <Text>已加载全部记录</Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* ── 记录操作弹层 ── */}
      <RecordActionSheet
        open={actionOpen}
        record={selectedRecord}
        onClose={() => setActionOpen(false)}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* 底部导航栏 */}
      <TabBar activeTab='records' />
    </View>
  )
}
