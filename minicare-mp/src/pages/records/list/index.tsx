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
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
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
  const [showMore, setShowMore] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<RecordItem | null>(null)
  const [actionOpen, setActionOpen] = useState(false)

  // 是否未登录
  const [isGuest, setIsGuest] = useState(false)

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

  // 加载记录（依赖 family / baby / activeFilter / todayOnly）
  useEffect(() => {
    if (!family || !baby) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        let allRecs: Record<string, unknown>[] = []

        if (activeFilter === 'all') {
          const results = await Promise.allSettled(
            ALL_TYPE_KEYS.map((t) =>
              recordsApi[t]?.list(family!.id, baby!.id, { limit: 30 }) ??
                Promise.resolve([]),
            ),
          )
          results.forEach((r) => {
            if (r.status === 'fulfilled') allRecs = allRecs.concat(r.value)
          })
        } else {
          const t = activeFilter as RecordTypeKey
          if (recordsApi[t]) {
            allRecs = await recordsApi[t].list(family!.id, baby!.id, {
              limit: 50,
            })
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
            <View className='records-footer-hint'>
              <Text>点击记录卡片可编辑或删除</Text>
            </View>
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
