/**
 * 作息计划页（PRD-009 US-01 / US-02）
 *
 * · US-01：无模板时展示服务端下发的系统默认作息（isDefault=true），**保存前不落库**
 * · US-02：增删改项 → 全量提交（差集语义，未提交的已有项由服务端软删除）
 * · US-02 追加：**长按拖动调整展示顺序**（顺序随保存落库，服务端存 `sort_order`）
 *
 * ⚠️ 展示顺序**不再按执行时间自动排序** —— 顺序完全由用户拖拽决定（提交数组顺序即顺序）。
 * ⚠️ 本地校验只是"少跑一趟网络"，服务端 `validateItems` 仍是权威。
 */
import { View, Text, Picker, Switch, Input } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { scheduleApi } from '@/api'
import type { ScheduleItem, ScheduleItemType, SaveScheduleItemDto } from '@/api'
import { babyApi } from '@/api/baby'
import { getStoredFamilyId, getStoredBabyId, setCurrentBabyId } from '@/api/http'
import {
  buildScheduleTypeIndex,
  SCHEDULE_MIN_GAP_MINUTES,
  SCHEDULE_PREPARE_OFFSET_FALLBACK_MIN,
  SCHEDULE_PREPARE_OFFSET_OPTIONS,
  type ScheduleTypeIndex,
} from '@/lib/schedule'
import { useAppConfig } from '@/lib/useAppConfig'
import { getStatusBarHeight, getCapsuleRightPadding } from '@/lib/safeArea'
import { useIsIPad } from '@/lib/useIsIPad'
import './index.scss'

/**
 * ⚠️ 可选类型清单**不在此处硬编码** —— 由 `/api/config` 的 `scheduleItemTypes` 下发，
 *    权威源是服务端 `schedule-item-type.meta.ts`（新增类型只改服务端）。
 *    页面按下发结果分组渲染（14 项一屏放不下）。
 */

/** 编辑器内的可编辑项（uid 是本地稳定 key，新增项没有服务端 id） */
interface EditItem {
  uid: string
  id: string
  itemType: ScheduleItemType
  title: string
  executeTime: string
  prepareEnabled: boolean
  prepareTime: string
  enabled: boolean
}

let uidSeq = 0
function nextUid(): string {
  uidSeq += 1
  return `local-${uidSeq}`
}

function hmToMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function minToHm(min: number): string {
  const clamped = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

function nowHm(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 类型默认名（由 config 下发）；config 未加载时退回枚举值本身，避免显示错误文案 */
function typeLabel(index: ScheduleTypeIndex, type: ScheduleItemType): string {
  return index.byType.get(type)?.label ?? type
}

/** 打开"提前准备"时的默认提前量：优先用该类型的下发值，否则兜底 30 分钟 */
function defaultPrepareOffset(index: ScheduleTypeIndex, type: ScheduleItemType): number {
  return index.byType.get(type)?.defaultPrepareOffsetMin ?? SCHEDULE_PREPARE_OFFSET_FALLBACK_MIN
}

function displayTitle(item: EditItem, index: ScheduleTypeIndex): string {
  return item.title.trim() || typeLabel(index, item.itemType)
}

function toEditItem(src: ScheduleItem): EditItem {
  return {
    uid: src.id || nextUid(),
    id: src.id,
    itemType: src.itemType,
    title: src.title ?? '',
    executeTime: src.executeTime || '08:00',
    prepareEnabled: !!src.prepareTime,
    prepareTime: src.prepareTime ?? '06:00',
    enabled: src.enabled !== false,
  }
}

// ── 长按拖拽排序 ──────────────────────────────────────────────
//
// 实现要点（为什么这么写）：
// ① 槽位几何只量一次：拖拽期间**所有项都已收起**，行高一致，列表总高不变 →
//    槽位（第 i 行的位置/高度）在整个拖拽过程中是常量，可以缓存复用。
// ② 坐标用**文档坐标**：`boundingClientRect().top` 是视口坐标，加上页面 `scrollTop`
//    得到文档坐标；手指用 `touch.pageY`（同为文档坐标）。这样即使页面在拖拽中滚动，
//    落点计算依然正确（两块参考系一起平移）。
// ③ 触摸事件挂在**页面根节点**而不是列表上：列表会因实时重排被 React 移动节点，
//    挂在会变的节点上容易丢事件；根节点永不重建。

interface DragSlot {
  top: number
  height: number
}

interface DragState {
  uid: string
  /** 当前落点槽位下标（用于去重，避免同一槽位反复重排） */
  overIndex: number
  /** 是否真的发生过重排（只有发生过才提示"记得保存"） */
  moved: boolean
}

/** 量取列表各行的文档坐标槽位；列表为空返回 null */
function measureRowSlots(): Promise<DragSlot[] | null> {
  return new Promise((resolve) => {
    const query = Taro.createSelectorQuery()
    query.selectViewport().scrollOffset()
    query.selectAll('.sched-item').boundingClientRect()
    query.exec((res: unknown[]) => {
      const scrollTop = Number((res?.[0] as { scrollTop?: number } | undefined)?.scrollTop ?? 0)
      const rects = (res?.[1] ?? []) as { top: number; height: number }[]
      if (!rects.length) {
        resolve(null)
        return
      }
      resolve(rects.map((r) => ({ top: r.top + scrollTop, height: r.height })))
    })
  })
}

/** 本地预校验：返回首个错误项与文案（服务端仍会兜底） */
function validateLocal(
  items: EditItem[],
  index: ScheduleTypeIndex,
): { uid: string; message: string } | null {
  for (const item of items) {
    if (!item.prepareEnabled) continue
    if (hmToMin(item.prepareTime) >= hmToMin(item.executeTime)) {
      return {
        uid: item.uid,
        message: `「${displayTitle(item, index)}」准备时间需要早于执行时间`,
      }
    }
  }

  const groups = new Map<ScheduleItemType, EditItem[]>()
  for (const item of items) {
    // 不可判定类型（other）没有判定窗口，不参与同类项间隔校验
    const meta = index.byType.get(item.itemType)
    const judgable = meta ? meta.judgable : item.itemType !== 'other'
    if (!judgable) continue
    const list = groups.get(item.itemType) ?? []
    list.push(item)
    groups.set(item.itemType, list)
  }
  for (const [type, list] of groups) {
    const sorted = [...list].sort((a, b) => hmToMin(a.executeTime) - hmToMin(b.executeTime))
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = hmToMin(sorted[i].executeTime) - hmToMin(sorted[i - 1].executeTime)
      if (gap < SCHEDULE_MIN_GAP_MINUTES) {
        return {
          uid: sorted[i].uid,
          message:
            `「${displayTitle(sorted[i - 1], index)}」与「${displayTitle(sorted[i], index)}」同为${typeLabel(index, type)}，` +
            `时间太接近，请至少间隔 ${SCHEDULE_MIN_GAP_MINUTES} 分钟`,
        }
      }
    }
  }
  return null
}

export default function SchedulePlanPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => (isIPad ? `${base} is-ipad` : base)

  // 类型清单来自服务端下发的 config（页面按分组渲染；前端不内置清单，避免枚举漂移）
  const { config } = useAppConfig()
  const typeIndex = useMemo(() => buildScheduleTypeIndex(config?.scheduleItemTypes), [config])

  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [isDefault, setIsDefault] = useState(false)
  const [items, setItems] = useState<EditItem[]>([])
  const [expandedUid, setExpandedUid] = useState<string | null>(null)
  const [errorUid, setErrorUid] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ── 拖拽排序状态 ──
  const [draggingUid, setDraggingUid] = useState<string | null>(null)
  const [orderDirty, setOrderDirty] = useState(false)
  const itemsRef = useRef<EditItem[]>([])
  const dragRef = useRef<DragState | null>(null)
  const slotsRef = useRef<DragSlot[] | null>(null)

  // 触摸回调挂在根节点上、闭包可能过期，用 ref 取最新列表
  useEffect(() => {
    itemsRef.current = items
  }, [items])

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

  const load = async () => {
    setLoading(true)
    setLoadFailed(false)
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
      const res = await scheduleApi.getTemplate(familyId, babyId)
      setIsDefault(res.isDefault)
      setItems(res.items.map(toEditItem))
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useLoad(() => {
    void load()
  })

  // ── 编辑操作 ──

  const patchItem = (uid: string, patch: Partial<EditItem>) => {
    setItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)))
  }

  /** 改类型：该类型有默认提前量且未开准备节点时，自动带出准备时间（US-02 场景1） */
  const handleTypeChange = (uid: string, type: ScheduleItemType) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.uid !== uid) return it
        const next: EditItem = { ...it, itemType: type }
        const offset = typeIndex.byType.get(type)?.defaultPrepareOffsetMin ?? 0
        if (!next.prepareEnabled && offset > 0) {
          next.prepareEnabled = true
          next.prepareTime = minToHm(hmToMin(next.executeTime) - offset)
        }
        return next
      }),
    )
  }

  /** 改执行时间：已开准备节点时，保持"提前量"不变（跟着一起平移） */
  const handleExecuteTimeChange = (uid: string, executeTime: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.uid !== uid) return it
        if (!it.prepareEnabled) return { ...it, executeTime }
        const offset = Math.max(0, hmToMin(it.executeTime) - hmToMin(it.prepareTime))
        return { ...it, executeTime, prepareTime: minToHm(hmToMin(executeTime) - offset) }
      }),
    )
  }

  /** 改准备时长（以"提前 N 分钟"为入口，反推准备时间） */
  const handleOffsetChange = (uid: string, offsetMin: number) => {
    setItems((prev) =>
      prev.map((it) =>
        it.uid === uid
          ? { ...it, prepareEnabled: true, prepareTime: minToHm(hmToMin(it.executeTime) - offsetMin) }
          : it,
      ),
    )
  }

  const handleAdd = () => {
    const uid = nextUid()
    const base = nowHm()
    const executeTime = minToHm(hmToMin(base) + 60)
    setItems((prev) => [
      ...prev,
      {
        uid,
        id: '',
        itemType: 'feeding_food',
        title: '',
        executeTime,
        prepareEnabled: true,
        prepareTime: minToHm(
          hmToMin(executeTime) - defaultPrepareOffset(typeIndex, 'feeding_food'),
        ),
        enabled: true,
      },
    ])
    setExpandedUid(uid)
  }

  const handleDelete = (item: EditItem) => {
    Taro.showModal({
      title: '删除该项',
      content: '删除后该项不再出现在日程中，历史判定也会一起消失，确定删除？',
      confirmColor: '#E8305A',
      success: (res) => {
        if (!res.confirm) return
        setItems((prev) => prev.filter((it) => it.uid !== item.uid))
        setExpandedUid(null)
      },
    })
  }

  // ── 拖拽排序 ──

  /** 长按开始拖拽：先收起展开项（保证行等高）再量槽位 */
  const handleDragStart = useCallback(
    async (uid: string) => {
      if (saving || itemsRef.current.length < 2) return
      if (expandedUid) setExpandedUid(null)
      // 等一帧让"收起"落地，否则量到的是展开态行高
      await new Promise((r) => setTimeout(r, 60))
      const slots = await measureRowSlots()
      if (!slots) return
      const index = itemsRef.current.findIndex((it) => it.uid === uid)
      if (index < 0) return
      slotsRef.current = slots
      dragRef.current = { uid, overIndex: index, moved: false }
      setDraggingUid(uid)
      try {
        Taro.vibrateShort({ type: 'light' })
      } catch {
        /* 部分端不支持震动，忽略 */
      }
    },
    [saving, expandedUid],
  )

  /** 手指移动 → 按落点槽位实时重排（`pageY` 与槽位同为文档坐标） */
  const handleTouchMove = (event: unknown) => {
    const drag = dragRef.current
    const slots = slotsRef.current
    if (!drag || !slots) return
    // View 的 onTouchMove 只声明了通用事件类型（不含 touches），此处按触摸事件形状取用
    const ev = event as {
      touches?: { pageY?: number; clientY?: number }[]
      changedTouches?: { pageY?: number; clientY?: number }[]
    }
    const touch = ev?.touches?.[0] ?? ev?.changedTouches?.[0]
    if (!touch) return
    const y = Number(touch.pageY ?? touch.clientY ?? 0)

    let target = slots.findIndex((slot) => y < slot.top + slot.height)
    if (target < 0) target = slots.length - 1
    if (target === drag.overIndex) return
    drag.overIndex = target

    // 重排逻辑放在 updater 里（基于 prev 取下标，避免 itemsRef 滞后一帧取错位置）；
    // "是否真的移动过"用局部变量带出来，保持 updater 无副作用
    let reordered = false
    setItems((prev) => {
      const from = prev.findIndex((it) => it.uid === drag.uid)
      if (from < 0 || from === target) return prev
      const next = [...prev]
      const [picked] = next.splice(from, 1)
      next.splice(target, 0, picked)
      reordered = true
      return next
    })
    if (reordered) drag.moved = true
  }

  const handleTouchEnd = () => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.moved) setOrderDirty(true)
    dragRef.current = null
    slotsRef.current = null
    setDraggingUid(null)
  }

  // ── 保存 ──

  const handleSave = async () => {
    if (saving) return
    if (!familyId) {
      Taro.showToast({ title: '请先完成建档', icon: 'none' })
      return
    }

    const error = validateLocal(items, typeIndex)
    if (error) {
      setErrorUid(error.uid)
      setExpandedUid(error.uid)
      Taro.showToast({ title: error.message, icon: 'none', duration: 2500 })
      return
    }

    const babyId = getStoredBabyId()
    if (!babyId) {
      Taro.showToast({ title: '请先完成建档', icon: 'none' })
      return
    }

    // ⚠️ 不排序：**数组顺序 = 展示顺序**（服务端按下标写 sort_order）。
    // 旧实现在这里强制按执行时间排序，会把用户拖出来的顺序"弹"回去。
    const payload: SaveScheduleItemDto[] = items.map((it) => ({
      id: it.id || undefined,
      item_type: it.itemType,
      title: displayTitle(it, typeIndex),
      execute_time: it.executeTime,
      prepare_time: it.prepareEnabled ? it.prepareTime : null,
      prepare_offset_min: it.prepareEnabled
        ? Math.max(0, hmToMin(it.executeTime) - hmToMin(it.prepareTime))
        : null,
      enabled: it.enabled,
    }))

    setSaving(true)
    try {
      const res = await scheduleApi.saveTemplate(familyId, babyId, { items: payload })
      setIsDefault(false)
      setItems(res.items.map(toEditItem))
      setErrorUid(null)
      setOrderDirty(false)
      Taro.showToast({ title: '作息计划已保存', icon: 'success' })
      setTimeout(() => {
        Taro.navigateBack().catch(() => {
          Taro.switchTab({ url: '/pages/home/index' })
        })
      }, 800)
    } catch (err) {
      // 服务端校验失败也走这里：以服务端为准，定位到出错项
      Taro.showToast({
        title: err instanceof Error ? err.message : '保存失败，请重试',
        icon: 'none',
        duration: 2500,
      })
    } finally {
      setSaving(false)
    }
  }

  // ── 渲染 ──

  const enabledCount = items.filter((it) => it.enabled).length

  return (
    <View
      className={cls(`sched-page ${draggingUid ? 'sched-page--dragging' : ''}`)}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <View
        className='sched-nav'
        style={{
          paddingTop: `${capsule.paddingTop}px`,
          minHeight: `${capsule.paddingTop + capsule.headerHeight}px`,
          paddingRight: `${Math.max(16, capsule.rightWidth)}px`,
        }}
      >
        <View className='sched-nav__back' onClick={() => Taro.navigateBack()}>
          <Text className='sched-nav__back-arrow'>{'\u2039'}</Text>
        </View>
        <Text className='sched-nav__title'>作息计划</Text>
        <Text
          className={`sched-nav__save ${saving ? 'sched-nav__save--disabled' : ''}`}
          onClick={handleSave}
        >
          {saving ? '保存中' : '保存'}
        </Text>
      </View>

      <View className='sched-body'>
        {loading ? (
          <View className='sched-loading'>
            <Text className='sched-loading__text'>加载中…</Text>
          </View>
        ) : loadFailed ? (
          <View className='sched-empty'>
            <Text className='sched-empty__title'>加载失败</Text>
            <Text className='sched-empty__sub'>请检查网络后重试</Text>
            <View className='sched-empty__action' onClick={() => void load()}>
              <Text className='sched-empty__action-text'>重试</Text>
            </View>
          </View>
        ) : (
          <>
            {isDefault && (
              <View className='sched-hint'>
                <Text className='sched-hint__text'>
                  这是系统为你准备的默认作息，可直接使用，也可以逐项修改。改完记得保存。
                </Text>
              </View>
            )}

            <View className='sched-summary'>
              <Text className='sched-summary__text'>
                共 {items.length} 项 · 启用 {enabledCount} 项
              </Text>
              {!draggingUid && (
                <Text className='sched-summary__hint'>
                  {orderDirty ? '顺序已调整 · 记得保存' : '长按任意一项可拖动调整顺序'}
                </Text>
              )}
            </View>

            {items.length === 0 ? (
              <View className='sched-empty'>
                <Text className='sched-empty__title'>还没有任何日程项</Text>
                <Text className='sched-empty__sub'>添加第一项，让计划先跑起来</Text>
              </View>
            ) : (
              <View className='sched-list'>
                {items.map((item) => {
                  const expanded = expandedUid === item.uid
                  const hasError = errorUid === item.uid
                  const dragging = draggingUid === item.uid
                  const prepareOffset = Math.max(
                    0,
                    hmToMin(item.executeTime) - hmToMin(item.prepareTime),
                  )
                  return (
                    <View
                      key={item.uid}
                      className={`sched-item ${item.enabled ? '' : 'sched-item--off'} ${hasError ? 'sched-item--error' : ''} ${dragging ? 'sched-item--dragging' : draggingUid ? 'sched-item--dim' : ''}`}
                    >
                      <View
                        className='sched-item__row'
                        onClick={() => {
                          if (draggingUid) return
                          setExpandedUid(expanded ? null : item.uid)
                        }}
                        onLongPress={() => void handleDragStart(item.uid)}
                      >
                        <Text className='sched-item__time'>{item.executeTime}</Text>
                        <View
                          className='sched-item__dot'
                          style={{ background: item.enabled ? '#F87098' : '#D8CFD3' }}
                        />
                        <View className='sched-item__main'>
                          <Text className='sched-item__title'>{displayTitle(item, typeIndex)}</Text>
                          <Text className='sched-item__sub'>
                            {typeLabel(typeIndex, item.itemType)}
                            {item.prepareEnabled ? ` · 备餐 ${item.prepareTime}` : ''}
                          </Text>
                        </View>
                        <View
                          className='sched-item__switch'
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Switch
                            checked={item.enabled}
                            color='#F87098'
                            onChange={(e) => patchItem(item.uid, { enabled: e.detail.value })}
                          />
                        </View>
                        <Text className='sched-item__chevron'>{expanded ? '\u02C4' : '\u02C5'}</Text>
                      </View>

                      {expanded && (
                        <View className='sched-editor'>
                          {/* 类型（按服务端下发的分组渲染） */}
                          <View className='sched-editor__field'>
                            <Text className='sched-editor__label'>类型</Text>
                            {typeIndex.groups.length === 0 ? (
                              <Text className='sched-editor__tip'>
                                类型列表未加载，请返回首页后重进本页
                              </Text>
                            ) : (
                              <View className='sched-type-groups'>
                                {typeIndex.groups.map((group) => (
                                  <View className='sched-type-group' key={group.key}>
                                    <Text className='sched-type-group__label'>{group.label}</Text>
                                    <View className='sched-editor__chips'>
                                      {group.options.map((opt) => (
                                        <View
                                          key={opt.type}
                                          className={`sched-chip ${item.itemType === opt.type ? 'sched-chip--active' : ''}`}
                                          onClick={() => handleTypeChange(item.uid, opt.type)}
                                        >
                                          <Text className='sched-chip__text'>{opt.label}</Text>
                                        </View>
                                      ))}
                                    </View>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>

                          {/* 执行时间 */}
                          <View className='sched-editor__field sched-editor__field--row'>
                            <Text className='sched-editor__label'>执行时间</Text>
                            <Picker
                              mode='time'
                              value={item.executeTime}
                              onChange={(e) =>
                                handleExecuteTimeChange(item.uid, e.detail.value as string)
                              }
                            >
                              <View className='sched-editor__picker'>
                                <Text className='sched-editor__picker-text'>{item.executeTime}</Text>
                              </View>
                            </Picker>
                          </View>

                          {/* 提前准备 */}
                          <View className='sched-editor__field sched-editor__field--row'>
                            <Text className='sched-editor__label'>提前准备</Text>
                            <Switch
                              checked={item.prepareEnabled}
                              color='#F87098'
                              onChange={(e) =>
                                patchItem(item.uid, {
                                  prepareEnabled: e.detail.value,
                                  prepareTime: e.detail.value
                                    ? minToHm(
                                        hmToMin(item.executeTime) -
                                          defaultPrepareOffset(typeIndex, item.itemType),
                                      )
                                    : item.prepareTime,
                                })
                              }
                            />
                          </View>

                          {item.prepareEnabled && (
                            <>
                              <View className='sched-editor__field sched-editor__field--row'>
                                <Text className='sched-editor__label'>准备时间</Text>
                                <Picker
                                  mode='time'
                                  value={item.prepareTime}
                                  onChange={(e) =>
                                    patchItem(item.uid, { prepareTime: e.detail.value as string })
                                  }
                                >
                                  <View className='sched-editor__picker'>
                                    <Text className='sched-editor__picker-text'>
                                      {item.prepareTime}
                                    </Text>
                                  </View>
                                </Picker>
                              </View>
                              <View className='sched-editor__field'>
                                <Text className='sched-editor__label'>
                                  提前 {prepareOffset} 分钟（快捷设置）
                                </Text>
                                <View className='sched-editor__chips'>
                                  {SCHEDULE_PREPARE_OFFSET_OPTIONS.map((min) => (
                                    <View
                                      key={min}
                                      className={`sched-chip ${prepareOffset === min ? 'sched-chip--active' : ''}`}
                                      onClick={() => handleOffsetChange(item.uid, min)}
                                    >
                                      <Text className='sched-chip__text'>{min} 分</Text>
                                    </View>
                                  ))}
                                </View>
                              </View>
                              <Text className='sched-editor__tip'>
                                准备时间默认由执行时间倒推，也可改成任意更早的时间
                              </Text>
                            </>
                          )}

                          {/* 名称 */}
                          <View className='sched-editor__field sched-editor__field--row'>
                            <Text className='sched-editor__label'>名称</Text>
                            <Input
                              className='sched-editor__input'
                              value={item.title}
                              placeholder={typeLabel(typeIndex, item.itemType)}
                              maxlength={20}
                              onInput={(e) => patchItem(item.uid, { title: e.detail.value })}
                            />
                          </View>

                          {hasError && (
                            <Text className='sched-editor__error'>该项未通过校验，请检查时间</Text>
                          )}

                          <View className='sched-editor__actions'>
                            <View
                              className='sched-editor__btn sched-editor__btn--ghost'
                              onClick={() => setExpandedUid(null)}
                            >
                              <Text className='sched-editor__btn-text'>收起</Text>
                            </View>
                            <View
                              className='sched-editor__btn sched-editor__btn--danger'
                              onClick={() => handleDelete(item)}
                            >
                              <Text className='sched-editor__btn-text sched-editor__btn-text--danger'>
                                删除
                              </Text>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>
            )}

            <View className='sched-add' onClick={handleAdd}>
              <Text className='sched-add__text'>＋ 添加一项日程</Text>
            </View>

            <Text className='sched-foot-tip'>
              作息排一次可长期沿用，不调整就会一直用；同类项之间至少间隔{' '}
              {SCHEDULE_MIN_GAP_MINUTES} 分钟，否则同一段时间的记录无法判断属于哪一项。
            </Text>
          </>
        )}
      </View>
    </View>
  )
}
