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
import { babyApi, recordsApi } from '@/api'
import { getStatusBarHeight, getCapsuleRightPadding } from '@/lib/safeArea'
import { useIsIPad } from '@/lib/useIsIPad'
import { getToken, getStoredFamilyId } from '@/api/http'
import TabBar from '@/components/TabBar/TabBar'
import {
  getRecordTime,
  getRecordDateForGroup,
  getDateKey,
  getDateLabel,
  getRecordType,
  getTodayKey,
  compareTime,
} from '@/lib/utils'
import {
  sortDayItems,
  type RecordsSortMode,
} from '@/lib/recordsSort'
import RecordGroup from './RecordGroup'
import RecordActionSheet from './RecordActionSheet'
import GuestRecordsList from './GuestRecordsList'
import RecordsDateSelector from './RecordsDateSelector'
import type { Family, Baby, RecordItem } from '@/api/types'
import type { FeedItem, FeedType } from '@/api/records'
import './index.scss'


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
  { key: 'medication', label: '用药' },
]

/** 记录类型 → MP 表单页路由（仅已迁移的独立页面，不经过中间分发页） */
const RECORD_FORM_MP_ROUTES: Record<string, string> = {
  feeding: '/pages/records/feeding/index',
  sleep: '/pages/records/sleep/index',
  diaper: '/pages/records/diaper/index',
  growth: '/pages/records/growth/index',
  activity: '/pages/records/activity/index',
  symptom: '/pages/records/symptom/index',
  medical: '/pages/records/medical/index',
  medication: '/pages/records/medication/index',
}

/** health 记录编辑分流：按记录内容路由到体温页或过敏表现页 */
function buildHealthEditUrl(record: RecordItem, recordId: string): string {
  // timeline 的 detail 字段已展开到顶层（toRecordItemFromFeed）
  const temperature = (record as Record<string, unknown>).temperature
  const allergySymptoms = (record as Record<string, unknown>).allergy_symptoms
  const hasTemp = temperature != null
  const hasAllergy = Array.isArray(allergySymptoms) && allergySymptoms.length > 0
  // 复合记录优先体温页（体温编辑频率更高，PATCH 局部更新不会丢过敏字段）
  if (hasTemp) return `/pages/records/health/temperature/index?recordId=${encodeURIComponent(recordId)}`
  return `/pages/records/health/allergy/index?recordId=${encodeURIComponent(recordId)}`
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
  const complementaryFood = (record as Record<string, unknown>).complementary_food as string | undefined
  const recordId = record.id

  // 已迁移的子类型（feeding 表单支持）
  if (feedType) {
    const resolvedFeedType = feedType === 'complementary'
      ? (complementaryFood === '营养素' ? 'supplement' : 'food')
      : feedType
    const subRoute = SUBTYPE_MP_ROUTES[resolvedFeedType]
    if (subRoute) return `${subRoute}&recordId=${encodeURIComponent(recordId)}`
  }

  // health 已拆分为体温/过敏两个独立页，按记录内容分流
  if (type === 'health') return buildHealthEditUrl(record, recordId)

  const base = RECORD_FORM_MP_ROUTES[type]
  if (base) return `${base}?recordId=${encodeURIComponent(recordId)}`
  return ''
}

function toRecordItemFromFeed(item: FeedItem): RecordItem {
  const detail = (item.detail ?? {}) as Record<string, unknown>
  const next: Record<string, unknown> = {
    id: item.id,
    type: item.type,
    note: item.note ?? null,
    record_time: item.event_time,
    summary: item.summary,
    detail,
    ...detail,
  }

  if (item.type === 'sleep' && !next.start_time) {
    next.start_time = item.event_time
  }
  if (item.type === 'growth' && !next.record_date) {
    next.record_date = item.event_time.slice(0, 10)
  }
  if (item.type === 'medical' && !next.visit_date) {
    next.visit_date = item.event_time.slice(0, 10)
  }
  return next as RecordItem
}

function getGroupDateSource(rec: RecordItem, dateFilter: string | null): string {
  if (dateFilter) return getRecordTime(rec as Record<string, unknown>)
  return getRecordDateForGroup(rec as Record<string, unknown>)
}

export default function RecordsListPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => isIPad ? `${base} is-ipad` : base
  const [family, setFamily] = useState<Family | null>(null)
  const [baby, setBaby] = useState<Baby | null>(null)
  const [records, setRecords] = useState<RecordItem[]>([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<RecordsSortMode>('type')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<RecordItem | null>(null)
  const [actionOpen, setActionOpen] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  // 是否未登录
  const [isGuest, setIsGuest] = useState(false)

  // 分页状态 — 统一 feed 游标
  const nextCursorRef = useRef<string | null>(null)
  const hasMoreRef = useRef(false)
  // 标记是否正在加载更多，防止重复触发
  const loadingMoreRef = useRef(false)
  /** 首屏/切换筛选后短暂屏蔽触底，避免内容不足一屏时误触发 onReachBottom */
  const blockReachBottomRef = useRef(true)

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
        const familyId = getStoredFamilyId()
        if (!familyId) {
          if (!cancelRef.current) { setFamily(null); setBaby(null); setLoading(false) }
          return
        }
        const fam = { id: familyId } as Family
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

  useEffect(() => {
    const refreshHandler = () => setRefreshTick((prev) => prev + 1)
    Taro.eventCenter.on('records:refresh', refreshHandler)
    return () => {
      Taro.eventCenter.off('records:refresh', refreshHandler)
    }
  }, [])

  const releaseReachBottomBlock = useCallback(() => {
    setTimeout(() => {
      blockReachBottomRef.current = false
    }, 200)
  }, [])

  const resetPagination = useCallback(() => {
    blockReachBottomRef.current = true
    nextCursorRef.current = null
    hasMoreRef.current = false
    loadingMoreRef.current = false
    setHasMore(false)
    setTotalCount(null)
  }, [])

  const handleDateFilterChange = useCallback((date: string | null) => {
    resetPagination()
    setDateFilter(date)
  }, [resetPagination])

  const handleActiveFilterChange = useCallback((key: string) => {
    resetPagination()
    setActiveFilter(key)
    setShowMore(false)
  }, [resetPagination])

  // 加载记录（依赖 family / baby / activeFilter / dateFilter）— 首屏加载，重置分页
  useEffect(() => {
    if (!family || !baby) return
    let cancelled = false
    resetPagination()

    async function load() {
      setLoading(true)

      try {
        const type = activeFilter === 'all' ? 'all' : activeFilter as FeedType
        const feedRes = await recordsApi.feed.list(family.id, {
          baby_id: baby.id,
          type,
          ...(!dateFilter ? { limit: 20 } : {}),
          ...(dateFilter ? { date: dateFilter } : {}),
        })
        const allRecs = feedRes.items.map(toRecordItemFromFeed)
        nextCursorRef.current = dateFilter ? null : feedRes.nextCursor
        const more = dateFilter ? false : (feedRes.hasMore && !!feedRes.nextCursor)
        hasMoreRef.current = more
        if (!cancelled) {
          setHasMore(more)
          if (feedRes.totalCount != null) setTotalCount(feedRes.totalCount)
        }

        allRecs.sort(
          (a, b) => compareTime(getRecordTime(b), getRecordTime(a)),
        )

        if (!cancelled) setRecords(allRecs as RecordItem[])
      } catch {
        if (!cancelled) {
          setRecords([])
          hasMoreRef.current = false
          setHasMore(false)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          releaseReachBottomBlock()
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [family, baby, activeFilter, dateFilter, refreshTick, resetPagination, releaseReachBottomBlock])

  // 加载更多（触底时调用；单日筛选且首屏不足一页时不应误触发）
  const loadMore = useCallback(async () => {
    if (dateFilter) return
    if (!family || !baby || loadingMoreRef.current || !hasMoreRef.current) return
    const cursor = nextCursorRef.current
    if (!cursor) {
      hasMoreRef.current = false
      setHasMore(false)
      return
    }

    loadingMoreRef.current = true
    setLoadingMore(true)

    try {
      const type = activeFilter === 'all' ? 'all' : activeFilter as FeedType
      const feedRes = await recordsApi.feed.list(family.id, {
        baby_id: baby.id,
        type,
        limit: 20,
        cursor,
        ...(dateFilter ? { date: dateFilter } : {}),
      })
      const newRecs = feedRes.items.map(toRecordItemFromFeed)
      nextCursorRef.current = feedRes.nextCursor
      const more = feedRes.hasMore && !!feedRes.nextCursor
      hasMoreRef.current = more
      setHasMore(more)

      if (newRecs.length > 0) {
        setRecords((prev) => {
          // 按 id 去重，防止后端同日补齐逻辑导致边界数据重叠
          const existingIds = new Set(prev.map(r => r.id))
          const uniqueNew = newRecs.filter(r => !existingIds.has(r.id))
          const merged = [...prev, ...uniqueNew]
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
  }, [family, baby, activeFilter, dateFilter])

  useReachBottom(() => {
    if (dateFilter) return
    if (blockReachBottomRef.current || loading) return
    loadMore()
  })

  // ── 按日期分组 ──
  const todayKey = getTodayKey()
  const dateMap = new Map<string, RecordItem[]>()
  for (const rec of records) {
    const dk = getDateKey(getGroupDateSource(rec, dateFilter))
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
  const filterHeadStyle = { paddingRight: `${getCapsuleRightPadding()}px` }

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
        <View className='records-filter__head' style={filterHeadStyle}>
          <View className='records-filter__title-wrap'>
            <Text className='records-filter__title'>宝宝记录</Text>
            {!loading && (
              <Text className='records-filter__count'>
                {totalCount != null ? `共 ${totalCount} 条` : `共 ${records.length} 条`}
              </Text>
            )}
          </View>
          <RecordsDateSelector value={dateFilter} onChange={handleDateFilterChange} />
        </View>

        {/* 筛选芯片 */}
        <View className='records-filter__chips'>
          {FILTER_PRIMARY.map((opt) => (
            <View
              key={opt.key}
              className={`records-filter__chip ${activeFilter === opt.key ? 'records-filter__chip--active' : ''}`}
              onClick={() => handleActiveFilterChange(opt.key)}
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
                onClick={() => handleActiveFilterChange(opt.key)}
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
            <Text className='records-status__title'>
              {dateFilter ? '该日暂无记录' : '暂无记录'}
            </Text>
            <Text className='records-status__subtitle'>
              {dateFilter
                ? '可切换日期或点击底部 + 新增记录'
                : '点击底部 + 按钮开始记录\n宝宝的每一天'}
            </Text>
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
                <Text>{dateFilter ? '该日记录已全部加载' : '已加载全部记录'}</Text>
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
